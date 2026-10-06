#!/usr/bin/env node
/**
 * Stop hook — claim guard.
 *
 * Blocks the end of a turn when the assistant's final message states an ABSOLUTE or NEGATIVE claim
 * about the system ("there is no X", "nothing would have caught it", "never", "impossible") without
 * shipping any evidence in that same message.
 *
 * That is the exact defect class this guards: on 2026-07-14 two such claims were asserted minutes
 * apart from memory alone, and both were refuted by a single grep.
 *
 * Second class, the ATTRIBUTED PREMISE (owner directive 2026-10-06, `rules/00-owner-mandates.md`: "A
 * premise nobody verified, the owner's or a worker's, is never cited as a constraint"): a sentence that
 * attributes a rule, mandate, requirement or fact to the owner ("your mandate says", "dijiste que"), the
 * owner's config ("your config requires", "tus reglas exigen"), the documentation ("the docs say", "según
 * la documentación") or an agent's report ("the worker reported", "el informe del agente dice"), with no
 * receipt in the same message: a file path, a `file:line`, a URL, a quotation of 20+ characters, a shown
 * command, an exit code or a pasted output block. Narrow on purpose (`guard-precision/` measures every
 * false block): each pattern needs the source AND a verb of requirement or report, and inline code and
 * quoted spans are removed before matching, so an echo of someone's words in quotes is not read as the
 * assistant's own premise. A word like "verified" is NOT a receipt for this class: saying it was checked
 * is the claim, not the evidence.
 *
 * Contract (verified against the official hooks reference, not assumed):
 *   - stdin  : JSON with `last_assistant_message` and `stop_hook_active`.
 *   - stdout : exit 0 + {"decision":"block", ...} blocks the turn; anything else lets it end.
 *   - `stop_hook_active` is true once this hook has already blocked, so the guard fires AT MOST once
 *     per turn — it forces one verification pass, it can never loop. Both classes share that one block:
 *     when both trip, the one block names both.
 *
 * Deliberate limitation, stated rather than hidden: a command hook pattern-matches, it cannot judge
 * truth. It is a tripwire on the highest-risk phrasing, not an oracle. The semantic obligation lives
 * in ~/.claude/verification-contract.md, loaded in every project by ~/.claude/rules/10-contracts.md, and
 * the semantic judge of premises is the prompt Stop hook of ~/.claude/premise-judge/.
 *
 * @es Segunda clase, la PREMISA ATRIBUIDA (directiva del dueño 2026-10-06): una frase que atribuye una
 * regla, mandato, requisito o hecho al dueño, a su configuración, a la documentación o al informe de un
 * agente, sin recibo en el mismo mensaje (ruta de fichero, `fichero:línea`, URL, cita de 20+ caracteres,
 * comando mostrado, código de salida o bloque de salida pegado). Estrecha a propósito, porque
 * `guard-precision/` mide cada falso bloqueo: cada patrón exige la fuente Y un verbo de exigencia o de
 * informe, y el código en línea y lo entrecomillado se quitan antes de casar, así que repetir entre comillas
 * las palabras de otro no se lee como premisa propia. «Verificado» NO es recibo en esta clase: decir que se
 * comprobó es la afirmación, no la evidencia. Las dos clases comparten el único bloqueo por turno.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIGH_RISK = [
  // Spanish — claims of non-existence / absolutes about the system
  /\bno\s+(existe|hay|tenemos|ten[ií]a(?:mos)?|est[aá]\s+cableado|lo\s+caza|cubre|falta)\b/i,
  /\bning[uú]n[ao]?\b/i,
  /\bnada\s+(?:\w+\s+){0,2}(habr[ií]a|hubiera|caza|cubre|lo\s+detecta)/i,
  /\b(nunca|siempre|jam[aá]s|imposible)\b/i,
  // English
  /\bthere(?:'s| is| are| was| were)\s+no\b/i,
  /\bwe\s+(?:don't|do not|didn't|did not)\s+have\b/i,
  /\bnothing\s+(?:\w+\s+){0,2}(would|will|could|catches|caught)\b/i,
  /\b(never|always|impossible|doesn't exist|does not exist)\b/i,
];

const FILE_PATH = /[\w./\\-]+\.(?:ts|tsx|js|mjs|cjs|scss|css|html|json|md|ya?ml|sh|toml)\b/i; // a real file path
const PATH_LINE = /:\d+\b/; // a path:line reference
const SHOWN_COMMAND = /`[^`]*(?:npm|npx|rg|grep|git|node|check:|test|build|lint)[^`]*`/i; // a command shown
const EXIT_CODE = /\b(?:EXIT|exit code|exit=)\b/i; // an exit code pasted
const VERIFICATION_WORD = /\b(verificad|verifiqu|comprobad|comprob[eé]|confirmad|confirm[eé]|verified|confirmed|checked)\w*/i;
const CITED_URL = /https?:\/\/\S+/; // a cited source
const OUTPUT_BLOCK = /```/; // a pasted block of output
/** A quotation long enough to be a source's words, not a label. @es Una cita lo bastante larga para ser palabras de una fuente. */
const QUOTATION = /["“«][^"”»\n]{20,}["”»]|^[ \t]*>[ \t]*\S/m;

const EVIDENCE = [FILE_PATH, PATH_LINE, SHOWN_COMMAND, EXIT_CODE, VERIFICATION_WORD, CITED_URL, OUTPUT_BLOCK];

/**
 * The receipts an attributed premise accepts: the claim guard's, minus the verification word, plus a quotation.
 * @es Los recibos que acepta una premisa atribuida: los de la guardia menos la palabra de verificación, más una cita.
 */
const PREMISE_EVIDENCE = [FILE_PATH, PATH_LINE, SHOWN_COMMAND, EXIT_CODE, CITED_URL, OUTPUT_BLOCK, QUOTATION];

/**
 * Removed before the premise patterns run: inline code and quoted spans are somebody's words or a name,
 * never the assistant's own premise. @es Se quitan antes de casar: el código en línea y lo entrecomillado.
 */
const INLINE_CODE = /`[^`\n]*`/g;
const QUOTED_SPAN = /["“«][^"”»\n]*["”»]/g;

/**
 * Attributed premises: a SOURCE (the owner, the owner's config, the docs, an agent's report) bound to a verb
 * of requirement or report. One pattern per phrasing, each with a selftest case and a mutant.
 * @es Premisas atribuidas: una FUENTE ligada a un verbo de exigencia o de informe. Un patrón por giro.
 */
const ATTRIBUTED_PREMISE = [
  // English — the owner and the owner's config
  /\b(?:your|the owner['’]s)\s+(?:\w+\s+)?(?:mandates?|rules?|instructions?|directives?|config(?:uration)?|settings|polic(?:y|ies)|contracts?|requirements?|guidelines?)\s+(?:says?|said|states?|stated|requires?|required|mandates?|mandated|demands?|forbids?|prohibits?|insists?)\b/i,
  /\b(?:according to|as per|per|as required by|as stated in)\s+(?:your|the owner['’]s)\s+(?:\w+\s+)?(?:mandates?|rules?|directives?|config(?:uration)?|settings|polic(?:y|ies)|contracts?|requirements?)\b/i,
  /\bthe owner\s+(?:mandates|mandated|requires|required|wants|wanted|demands|demanded|forbids|forbade|insists|insisted|says|said)\b/i,
  /\byou\s+(?:mandated|required|insisted|told me|said)\s+that\b/i,
  // English — the documentation
  /\b(?:docs|documentation)\s+(?:says?|states?|requires?|recommends?|mandates?|forbids?|confirms?|guarantees?)\b/i,
  /\b(?:according to|as per|per)\s+the\s+(?:official\s+)?(?:docs|documentation)\b/i,
  // English — an agent's report
  /\b(?:agent|subagent|sub-agent|worker|explorer|mapper)(?:['’]s)?\s+(?:report|handoff|summary|findings)\s+(?:says|said|states|stated|claims|claimed|confirms|confirmed|shows|showed)\b/i,
  /\bthe\s+(?:agent|subagent|sub-agent|worker)\s+(?:reported|reports|claims|claimed|says|said|confirmed|confirms)\b/i,
  /\baccording to the (?:agent|subagent|sub-agent|worker)\b/i,
  // Spanish — el dueño y su configuración. A pattern whose last word may end in an accented letter closes with
  // `(?!\w)`, not `\b`: without the `u` flag `ó` is not a word character, so `\b` after it never holds.
  // @es Un patrón cuya última palabra puede acabar en tilde cierra con `(?!\w)`: sin la bandera `u`, `ó` no es
  // carácter de palabra y `\b` tras él nunca se cumple.
  /\btus?\s+(?:propi[oa]s?\s+)?(?:mandatos?|reglas?|instrucci[oó]n|instrucciones|directivas?|configuraci[oó]n|config|contratos?|pol[ií]ticas?|requisitos?|normas?)\s+(?:\w+\s+)?(?:dice|dicen|exige|exigen|manda|mandan|pide|piden|obliga|obligan|requiere|requieren|proh[ií]be|proh[ií]ben|establece|establecen|impone|imponen)\b/i,
  /(?:\bseg[uú]n|\bde acuerdo con|\bcomo (?:exige|exigen|dice|dicen|manda|mandan))\s+tus?\s+(?:propi[oa]s?\s+)?(?:mandatos?|reglas?|directivas?|configuraci[oó]n|config|contratos?|pol[ií]ticas?|requisitos?|normas?)\b/i,
  /\bel\s+due[nñ]o\s+(?:exige|exigi[oó]|manda|mand[oó]|quiere|quiso|pide|pidi[oó]|dijo|dice|proh[ií]be|prohibi[oó]|requiere|insiste|insisti[oó])(?!\w)/i,
  /\b(?:dijiste|indicaste|ordenaste|exigiste|mandaste|aclaraste)\s+que\b/i,
  // Spanish — la documentación
  /\bdocumentaci[oó]n\s+(?:oficial\s+)?(?:dice|indica|exige|establece|recomienda|confirma|requiere|proh[ií]be|garantiza)\b/i,
  /(?:\bseg[uú]n|\bde acuerdo con)\s+(?:la\s+)?(?:documentaci[oó]n|docs)\b/i,
  // Spanish — el informe de un agente
  /\b(?:informe|reporte|resumen|handoff)\s+del\s+(?:agente|subagente|sub-agente|worker|explorador)\s+(?:dice|indica|afirma|confirma|reporta|muestra)\b/i,
  /\bel\s+(?:agente|subagente|sub-agente|worker)\s+(?:dice|dijo|afirma|afirm[oó]|report[oó]|inform[oó]|confirm[oó]|asegura|asegur[oó])(?!\w)/i,
  /\bseg[uú]n\s+el\s+(?:informe\s+del\s+)?(?:agente|subagente|sub-agente|worker)\b/i,
];

const ONCE_PER_TURN = 'This guard fires at most once per turn — it will not fire again after this pass.';

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

/**
 * The absolute/negative claim the message ships without evidence, as `{ reason, context }`, or `undefined`.
 * @es La afirmación absoluta o negativa sin evidencia, como `{ reason, context }`, o `undefined`.
 */
function absoluteClaim(message) {
  // No emptiness check: no HIGH_RISK pattern matches an empty or whitespace-only message, so the `find` below
  // already stands aside for it. @es Sin comprobar vacío: ningún patrón HIGH_RISK casa con un mensaje vacío.
  const tripped = HIGH_RISK.find((pattern) => pattern.test(message));
  if (tripped === undefined) return undefined;
  if (EVIDENCE.some((pattern) => pattern.test(message))) return undefined;

  // `tripped` matched `message` above and carries no `g` flag, so `match` cannot be null here.
  // @es `tripped` ya casó con `message` y no lleva la bandera `g`, así que `match` no puede ser null.
  const matched = message.match(tripped)[0];

  return {
    reason: `Claim guard: absolute/negative claim ("${matched}") stated with no evidence in the message.`,
    context: [
      `CLAIM GUARD TRIPPED on the phrase: "${matched}".`,
      '',
      'Your final message asserts something absolute or non-existent about the system and ships',
      'NO evidence with it — no file path, no command, no exit code, no cited source. That is the',
      'exact defect that produced two false statements minutes apart on 2026-07-14.',
      '',
      'Absence of memory is not evidence of absence. Do ONE of these before ending the turn:',
      '  1. Run the search that WOULD have found the thing you claim is absent (rg / Read / the',
      '     vendor package.json / the official docs). Then restate the claim WITH the receipt,',
      '     or retract it if the search refutes you.',
      '  2. If the claim is not load-bearing, cut it.',
      '  3. If you cannot verify it right now, keep it but mark it explicitly as unverified.',
    ].join('\n'),
  };
}

/**
 * The premise the message attributes to the owner, the owner's config, the docs or an agent's report without
 * a receipt, as `{ reason, context }`, or `undefined`. The patterns read the message WITHOUT inline code and
 * quoted spans; the receipts are looked for in the whole message.
 * @es La premisa que el mensaje atribuye al dueño, a su configuración, a la documentación o al informe de un
 * agente sin recibo, como `{ reason, context }`, o `undefined`. Los patrones leen el mensaje SIN código en
 * línea ni entrecomillados; los recibos se buscan en el mensaje entero.
 */
function attributedPremise(message) {
  const prose = message.replace(INLINE_CODE, ' ').replace(QUOTED_SPAN, ' ');
  const tripped = ATTRIBUTED_PREMISE.find((pattern) => pattern.test(prose));
  if (tripped === undefined) return undefined;
  if (PREMISE_EVIDENCE.some((pattern) => pattern.test(message))) return undefined;

  // `tripped` matched `prose` above and carries no `g` flag, so `match` cannot be null here.
  // @es `tripped` ya casó con `prose` y no lleva la bandera `g`, así que `match` no puede ser null.
  const matched = prose.match(tripped)[0];

  return {
    reason: `Claim guard: attributed premise ("${matched}") with no evidence in the message: verify it, then cite the source or drop it. @es Premisa atribuida ("${matched}") sin evidencia en el mensaje: verifícala y cita la fuente, o retírala.`,
    context: [
      `CLAIM GUARD TRIPPED on the attributed premise: "${matched}".`,
      '',
      'Your final message attributes a rule, mandate, requirement or fact to the owner, the owner\'s',
      'config, the documentation or an agent\'s report, and ships NO receipt for it. A premise nobody',
      'verified is never cited as a constraint, the owner\'s own included (rules/00-owner-mandates.md).',
      'Before ending the turn, do ONE of these:',
      '  1. Verify it (rg the rules/ files, Read the doc page, open the report) and cite what you found:',
      '     the file path or file:line, a quotation of the words, the URL, or the command and its output.',
      '  2. If verification refutes it, say so with that evidence and drop the constraint.',
      '  3. If you cannot verify it now, mark it explicitly as an UNVERIFIED premise, not a constraint.',
      '',
      '@es Tu mensaje final atribuye una regla, mandato, requisito o hecho al dueño, a su configuración, a la',
      'documentación o al informe de un agente sin ningún recibo. Verifícalo y cita la fuente (ruta o',
      'fichero:línea, cita textual, URL, o comando y su salida); si la verificación lo refuta, dilo con esa',
      'evidencia; si no puedes verificarlo ahora, márcalo como premisa NO VERIFICADA, nunca como restricción.',
    ].join('\n'),
  };
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el turno puede terminar. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso. Un payload ilegible deja pasar.
 */
export function evaluate(raw) {
  let payload;
  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined; // never let a malformed payload wedge the session
  }

  // Already blocked once this turn: the verification pass has been demanded. Let the turn end.
  if (payload?.stop_hook_active === true) return undefined;

  const message = typeof payload?.last_assistant_message === 'string' ? payload.last_assistant_message : '';
  const findings = [absoluteClaim(message), attributedPremise(message)].filter((finding) => finding !== undefined);

  if (findings.length === 0) return undefined;

  return {
    decision: 'block',
    reason: findings.map((finding) => finding.reason).join(' '),
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: [...findings.map((finding) => finding.context), ONCE_PER_TURN].join('\n\n'),
    },
  };
}

const main = async () => {
  let raw;
  try {
    raw = await readStdin();
  } catch {
    process.exit(0);
  }
  const output = evaluate(raw);
  if (output !== undefined) process.stdout.write(JSON.stringify(output));
  process.exit(0);
};

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre:
// leería el stdin del importador y lo cortaría con process.exit(0) a mitad de camino.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
