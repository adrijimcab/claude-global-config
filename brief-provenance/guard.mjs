#!/usr/bin/env node
/**
 * `PreToolUse` guard on delegation and resume — a brief must SEPARATE what was measured from what is a
 * guess. The decision lives in `provenance.mjs`; this file is the hook shim: read the payload, decide,
 * journal a refusal, and explain it.
 *
 * IT ALSO CLOSES `brief-marker-written-as-prose-not-literal-form`, which is the lesson this guard's own
 * first version produced: it tested for the colon GLUED to the word, anywhere in the brief, and refused
 * three delegations in one session — every one written by an author doing the right thing
 * (`MEASURED (by me, on develop just now):`). The check was re-aimed at the property that actually
 * matters, a provenance DECLARATION: the word STARTS its own line and that line carries a colon
 * somewhere. Stricter, not laxer — a marker buried mid-paragraph passed before and is refused now — and
 * the refusal names which of the three states it is in, because a control that decides correctly but
 * explains poorly gets routed around just the same.
 * @es CIERRA TAMBIÉN `brief-marker-written-as-prose-not-literal-form`: esa lección la produjo la primera
 * versión de este guard, que exigía los dos puntos PEGADOS a la palabra y rechazó tres delegaciones bien
 * escritas. Ahora se comprueba la propiedad real —la palabra EMPIEZA su línea y esa línea lleva dos
 * puntos— y la negativa dice en cuál de los tres estados está.
 *
 * WHY THIS EXISTS. `unmeasured-rationale-stated-as-fact-in-brief` recurred, every time the
 * orchestrator's, and every time caught downstream by the worker rather than by any control: "490
 * memories lack a title" measured 66; a stale-golden warning blamed on cherry-picks reproduced on a
 * PRISTINE worktree, 70 of 70; "~34 symbols across ~70 markers" was 24 across 33; removing dead barrels
 * "helps the bundle budget" measured +130 bytes.
 *
 * THE ANALYSIS THAT WAS WRONG FIRST TIME. Framed as DETECTION — "can a hook tell whether a number was
 * measured?" — it is unsolvable. But the problem is that a brief offered no way to write a hypothesis
 * DIFFERENTLY from a fact, so both arrived with identical authority. That is a FORMAT defect, and format
 * is checkable — the same move as the reserved exit code 3 for vacuity: you do not detect the error, you
 * refuse the shape that permits it. It checks PRESENCE of the provenance markers, never their truth.
 *
 * WHERE IT RUNS, AND HOW THAT IS KEPT TRUE. It must be registered for every tool `BRIEF_CARRIERS` names
 * — today `PreToolUse` on `Agent|Task|SendMessage`. That requirement is declared beside this file in
 * `guard.mjs.hook-registration.json`; `selftest.mjs` proves the declaration matches the decision, and
 * the fleet self-check (`.claude/hook-registration-selfcheck/`) reports on every prompt when the settings
 * stop honouring the declaration. Measured before that chain existed: the code decided for `SendMessage`
 * while the registration named only `Agent|Task`, and the resume surface ran unguarded with nothing able
 * to notice.
 *
 * FAILS OPEN on every malfunction of its own: a guard able to wedge delegation is a larger hazard than
 * the one it closes.
 *
 * @es Guard de `PreToolUse` sobre delegación y resume: un brief debe SEPARAR lo medido de lo supuesto.
 * La decisión vive en `provenance.mjs`; este fichero es el shim. El problema no era DETECTAR si un número
 * está medido (irresoluble) sino que el brief no ofrecía forma de escribir una hipótesis DISTINTA de un
 * hecho: un defecto de FORMATO, y el formato sí se comprueba. DÓNDE CORRE: registrado para cada
 * herramienta de `BRIEF_CARRIERS`, declarado en el sidecar de registro, probado por el selftest y
 * auditado en cada prompt por el auto-chequeo de la flota. FALLA ABIERTO ante todo fallo propio.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { defaultAsk, judgeCandidates } from './claim-judge.mjs';
import { candidateClaims } from './dependency-claim.mjs';
import { dependencyNamesOf, projectDirectories } from './dependency-names.mjs';
import { dependencyReason } from './dependency-refusal.mjs';
import { briefOf, inspectBrief } from './provenance.mjs';

/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('brief-provenance');

/** The journal of refusals: every line in it is a brief this guard denied. @es El diario de rechazos. */
const REFUSALS = 'refusals.jsonl';

/**
 * The journal of the dependency-claim face's undecided readings, in a SUBFOLDER of the state directory. An
 * undecided brief was ALLOWED, so it is no refusal, and `guard-precision/blocks.mjs` reads every `*.jsonl` at
 * the top of a guard's state directory (and only there) as journal lines; a subfolder keeps these out of its
 * counts while staying JSON Lines.
 * @es El diario de las lecturas no decididas, en una SUBCARPETA del estado: un brief no decidido se PERMITIÓ, y
 * `guard-precision/blocks.mjs` lee cada `*.jsonl` de la raíz del estado (y solo ahí); la subcarpeta lo deja
 * fuera de sus cuentas sin dejar de ser JSON Lines.
 */
const UNDECIDED = join('undecided', 'entries.jsonl');

function journal(entry, file = REFUSALS) {
  try {
    const target = join(stateDirectory(), file);

    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* the journal is evidence, never a precondition: its failure must not change the decision */
  }
}

/**
 * One line per failing marker, naming its state and the exact edit that fixes it. The states are
 * distinguishable, so the refusal distinguishes them — telling an author "missing" when the guard can
 * SEE the word two characters from correct is withholding the fact that makes the fix obvious.
 * @es Una línea por marcador que falla, nombrando su estado y la edición exacta que lo arregla.
 */
function diagnose({ word, state }) {
  if (state === 'buried')
    return [
      `NEAR MISS — ${word} appears in the brief, but not at the START of a line.`,
      `  A marker is a HEADING, not a word inside a sentence. Put ${word} at the beginning of its own`,
      '  line, with a colon somewhere on that line. Anything you like may sit between the two:',
      `    ${word} (by me, on develop just now): …`,
      `  @es CASI — ${word} aparece en el brief, pero no al COMIENZO de una línea. Un marcador es un ENCABEZADO:`,
      `  @es pon ${word} al principio de su propia línea, con dos puntos en algún lugar de esa línea.`
    ];

  if (state === 'no-colon')
    return [
      `NEAR MISS — ${word} does start a line, but that line carries no colon.`,
      '  Add one. It is what separates the declaration from what is being declared:',
      `    ${word}: …`,
      `  @es CASI — ${word} empieza una línea, pero esa línea no lleva dos puntos: añádelos.`
    ];

  return [
    `ABSENT — the brief contains no ${word} line at all.`,
    `  Add one at the top. If there is nothing to declare, say so: ${word}: none — exploratory task.`,
    `  @es AUSENTE — el brief no contiene ninguna línea ${word}. Añade una arriba; si no hay nada que declarar, dilo así.`
  ];
}

function reason(refusal) {
  return [
    `BRIEF-PROVENANCE REFUSED this ${refusal.surface} (${refusal.toolName}): the brief has nowhere to tell a measured fact from a guess.`,
    `@es BRIEF-PROVENANCE RECHAZÓ ${refusal.spanishSurface} (${refusal.toolName}): el brief no tiene dónde separar un hecho medido de una suposición.`,
    '',
    'WHAT IS WRONG, precisely:',
    '',
    ...refusal.failures.flatMap((failure) => [...diagnose(failure), '']),
    'THE RULE: each marker word must START its own line, and that line must carry a colon. What sits',
    'between the word and the colon is yours — a qualifier, a parenthetical, a date. The check is a',
    'literal line scan, never a regex, so it can neither be talked around nor silently skip a brief.',
    '',
    'Add both, near the top. They are cheap and they are the point:',
    '',
    '  MEASURED: every load-bearing number and mechanism, each with the command that produced it.',
    '            e.g. "70 of 70 goldens flagged — `npm run build && npm run check:api`, exit 0"',
    '            If there are none, write: MEASURED: none — exploratory task.',
    '',
    '  HYPOTHESIS: every causal claim you have NOT reproduced on the minimal case, named as a guess',
    '              for the worker to TEST rather than inherit.',
    '',
    'Why this is refused rather than suggested. Briefs and resumes have repeatedly carried an unmeasured',
    'claim stated as fact, and every one was caught by the WORKER, never by a control: "490 memories"',
    'was 66; "~34 symbols" was 24; "removing dead barrels helps the budget" measured +130 bytes; and a',
    'stale-golden warning was blamed on cherry-picks when a pristine worktree with zero modifications',
    'already flagged 70 of 70. That last one is the cost in one sentence: a NARROW cause written as',
    'THE cause steers the worker away from the general one.',
    '',
    'This guard does not judge whether your claims are true — no hook can. It refuses a brief that has',
    'nowhere to tell a fact from a guess. Writing MEASURED next to a claim forces you to produce the',
    'command; discovering you cannot is exactly the moment the claim belongs under HYPOTHESIS.',
    '',
    '@es LA REGLA: cada palabra marcadora EMPIEZA su propia línea, y esa línea lleva dos puntos.',
    '@es Lo que va entre la palabra y los dos puntos es tuyo: un matiz, un paréntesis, una fecha. La comprobación',
    '@es es un recorrido literal de líneas, nunca una regex. Añade las dos, cerca del principio:',
    '@es MEASURED: cada número y mecanismo que sostiene el trabajo, con el comando que lo produjo.',
    '@es Si no hay ninguno, escribe: MEASURED: none — exploratory task.',
    '@es HYPOTHESIS: cada afirmación causal que NO reprodujiste en el caso mínimo, nombrada como suposición',
    '@es para que el worker la PRUEBE en vez de heredarla.',
    '@es Por qué se rechaza y no se sugiere: briefs y resumes llevaron una y otra vez una afirmación sin medir',
    '@es escrita como hecho, y siempre la cazó el WORKER, nunca un control ("490 memorias" eran 66; "~34',
    '@es símbolos" eran 24). Una causa ESTRECHA escrita como LA causa aparta al worker de la general.',
    '@es Este guard no juzga si tus afirmaciones son ciertas: rechaza un brief que no tiene dónde separarlas de una suposición.',
    '@es Escribir MEASURED junto a una afirmación te obliga a dar el comando; descubrir que no puedes es justo',
    '@es el momento en que la afirmación va bajo HYPOTHESIS.'
  ].join('\n');
}

/**
 * The second face: a brief that DOES declare its provenance must still cite its source when a MEASURED
 * claim asserts how an installed dependency behaves (`guard-built-on-an-unmeasured-premise`, recorded 3
 * times). The project's dependency names come from `dependency-names.mjs`; the lexical prefilter
 * `dependency-claim.mjs` keeps the claims that name one and cite no source; only those reach the claim judge
 * (`claim-judge.mjs`, one model call). When the project cannot be read or the judge does not decide, the face
 * allows and journals why (`dependency-claim-undecided`, in `undecided/entries.jsonl`), never failing closed
 * and never silent.
 * @es La segunda cara: un brief que SÍ declara su procedencia debe citar la fuente cuando una afirmación
 * MEASURED dice cómo se comporta una dependencia instalada. El prefiltro léxico guarda las afirmaciones que
 * nombran una y no citan fuente; solo esas llegan al juez (una llamada al modelo). Si no se puede leer el
 * proyecto o el juez no decide, la cara permite y registra por qué (en `undecided/entries.jsonl`), sin fallar
 * cerrada ni callar.
 */
async function dependencyClaimOutput(brief, payload, ask) {
  const entry = { at: new Date().toISOString(), session: payload?.session_id, tool: brief.toolName };
  const directories = projectDirectories(brief.text, payload);
  const { names, undecided } = dependencyNamesOf(directories);

  if (directories.length === 0) undecided.push({ file: null, reason: 'no project directory: the brief has no TENANCY path and the payload has no cwd' });

  const claims = candidateClaims(brief.text, names);
  const verdict = claims.length === 0 ? { kind: 'pass' } : await judgeCandidates(claims, ask);

  if (verdict.kind === 'undecided') undecided.push({ file: null, reason: verdict.why });

  if (undecided.length > 0) journal({ ...entry, kind: 'dependency-claim-undecided', undecided }, UNDECIDED);

  if (verdict.kind !== 'block') return undefined;

  journal({ ...entry, kind: 'dependency-claim', packages: claims.flatMap((claim) => claim.packages), reason: verdict.reason });

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: dependencyReason({ claims, reason: verdict.reason, surface: brief.surface, spanishSurface: brief.spanishSurface, toolName: brief.toolName })
    }
  };
}

/**
 * The hook output for a raw payload (deny when the brief declares no MEASURED/HYPOTHESIS, or when the claim
 * judge refuses one), or `undefined`. Exported so `~/.claude/hook-dispatch/dispatch.mjs` runs it in its own
 * process. `ask` is the judge's model question, injectable for the proof.
 * @es La salida de hook para un payload crudo (deny cuando el brief no declara MEASURED/HYPOTHESIS, o cuando el
 * juez de afirmaciones rechaza una), o `undefined`. Exportada para que `~/.claude/hook-dispatch/dispatch.mjs` la
 * corra en su propio proceso. `ask` es la pregunta al modelo del juez, inyectable para la prueba.
 */
export async function evaluate(raw, { ask = defaultAsk } = {}) {
  let payload;

  try {
    // A PowerShell-written payload can carry a UTF-8 BOM, which makes JSON.parse throw — that throw
    // was once swallowed by a catch-all in a sibling hook and the guard silently stopped guarding.
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

    payload = JSON.parse(text);
  } catch {
    return undefined;
  }

  const brief = briefOf(payload);

  if (brief === undefined) return undefined;

  const refusal = inspectBrief(brief);

  if (refusal === undefined) return dependencyClaimOutput(brief, payload, ask);

  // The journal records the STATE of each failure and the surface it happened on. A run of `buried`
  // says the form is being misunderstood, a run of `absent` says the section is being skipped, and a
  // run on `SendMessage` says the resume surface is still adapting — three different remedies.
  // @es El diario registra el ESTADO de cada fallo y el surface: remedios distintos para cada racha.
  journal({
    at: new Date().toISOString(),
    session: payload?.session_id,
    tool: refusal.toolName,
    failures: refusal.failures,
    length: refusal.length
  });

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason(refusal)
    }
  };
}

async function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  try {
    const output = await evaluate(raw);

    if (output !== undefined) console.log(JSON.stringify(output));
  } catch {
    /* a malfunction of this guard allows the delegation */
  }

  process.exit(0);
}

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre:
// leería el stdin del importador y lo cortaría con process.exit(0) a mitad de camino.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
