#!/usr/bin/env node
/**
 * The decisions of the claim guard, each broken once, that `claim-guard.selftest.mjs` must catch. The runner
 * lives in `../mutation-proof/run-mutants.mjs` and mutates a COPY.
 *
 * BOTH DIRECTIONS, because both are fatal: a risk pattern that stops matching lets an unevidenced absolute
 * claim end the turn, and an evidence pattern that stops matching blocks turns that DID ship their receipt,
 * which gets the guard switched off. Every pattern is therefore broken whole, so a case must exist for each.
 * Each mutant keeps the file runnable, so every kill is an assertion kill (`crashKills: 'fail'`).
 *
 * @es Las decisiones de la guardia de afirmaciones, rotas una a una, que su selftest debe cazar. Se rompe
 * cada patrón entero, en los dos sentidos: un patrón de riesgo que no casa deja pasar la afirmación sin
 * recibo, y uno de evidencia que no casa bloquea turnos que sí traían su recibo.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const GUARD = 'hooks/claim-guard.mjs';

const MUTANTS = [
  // --- THE RISK PATTERNS: what counts as an absolute or negative claim.
  ['the Spanish non-existence pattern never matches', GUARD, '/\\bno\\s+(existe|hay', '/\\bnoX\\s+(existe|hay'],
  ['the «ningún» pattern never matches', GUARD, '/\\bning[uú]n[ao]?\\b/i', '/\\bningX[uú]n[ao]?\\b/i'],
  ['the «nada habría» pattern never matches', GUARD, '/\\bnada\\s+(?:\\w+\\s+){0,2}(habr', '/\\bnadaX\\s+(?:\\w+\\s+){0,2}(habr'],
  ['the Spanish absolutes pattern never matches', GUARD, '/\\b(nunca|siempre|jam[aá]s|imposible)\\b/i', '/\\b(xnunca|xsiempre|xjam[aá]s|ximposible)\\b/i'],
  ['«imposible» stops being a risk phrase', GUARD, '|jam[aá]s|imposible)', '|jam[aá]s)'],
  ['the «there is no» pattern never matches', GUARD, "/\\bthere(?:'s| is| are| was| were)\\s+no\\b/i", "/\\bthereX(?:'s| is| are| was| were)\\s+no\\b/i"],
  ['the «we do not have» pattern never matches', GUARD, "/\\bwe\\s+(?:don't|do not|didn't|did not)\\s+have\\b/i", "/\\bweX\\s+(?:don't|do not|didn't|did not)\\s+have\\b/i"],
  ['the «nothing would» pattern never matches', GUARD, '/\\bnothing\\s+(?:\\w+\\s+){0,2}(would', '/\\bnothingX\\s+(?:\\w+\\s+){0,2}(would'],
  ['the English absolutes pattern never matches', GUARD, "/\\b(never|always|impossible|doesn't exist|does not exist)\\b/i", "/\\b(xnever|xalways|ximpossible|xdoesn't exist|xdoes not exist)\\b/i"],
  ['«does not exist» stops being a risk phrase', GUARD, "|doesn't exist|does not exist)", "|doesn't exist)"],

  // --- THE EVIDENCE PATTERNS: what counts as a receipt.
  ['a file path stops counting as evidence', GUARD, '/[\\w./\\\\-]+\\.(?:ts', '/[\\w./\\\\-]+Z\\.(?:ts'],
  ['a path:line reference stops counting as evidence', GUARD, '/:\\d+\\b/', '/:\\d{99}\\b/'],
  ['a shown command stops counting as evidence', GUARD, '/`[^`]*(?:npm', '/`[^`]*Z(?:npm'],
  ['a pasted exit code stops counting as evidence', GUARD, '/\\b(?:EXIT|exit code|exit=)\\b/i', '/\\b(?:xEXIT|xexit code|xexit=)\\b/i'],
  ['a verification word stops counting as evidence', GUARD, '/\\b(verificad|verifiqu|', '/\\bZ(verificad|verifiqu|'],
  ['a cited URL stops counting as evidence', GUARD, '/https?:\\/\\/\\S+/', '/httpsZ:\\/\\/\\S+/'],
  ['a pasted output block stops counting as evidence', GUARD, '/```/; // a pasted block of output', '/```Z/; // a pasted block of output'],
  ['one kind of evidence is required from every pattern instead of any', GUARD, '(EVIDENCE.some((pattern)', '(EVIDENCE.every((pattern)'],

  // --- THE ATTRIBUTED-PREMISE PATTERNS: one per phrasing, each broken whole.
  ['«your rules require» never matches', GUARD, String.raw`/\b(?:your|the owner`, String.raw`/\bX(?:your|the owner`],
  ['«per your mandates» never matches', GUARD, String.raw`/\b(?:according to|as per|per|as required by`, String.raw`/\bX(?:according to|as per|per|as required by`],
  ['«the owner wants» never matches', GUARD, String.raw`/\bthe owner\s+(?:mandates`, String.raw`/\bXthe owner\s+(?:mandates`],
  ['«you said that» never matches', GUARD, String.raw`/\byou\s+(?:mandated`, String.raw`/\bXyou\s+(?:mandated`],
  ['«the docs say» never matches', GUARD, String.raw`/\b(?:docs|documentation)\s+(?:says?`, String.raw`/\bX(?:docs|documentation)\s+(?:says?`],
  ['«according to the documentation» never matches', GUARD, String.raw`/\b(?:according to|as per|per)\s+the`, String.raw`/\bX(?:according to|as per|per)\s+the`],
  ['«the worker\'s report says» never matches', GUARD, String.raw`/\b(?:agent|subagent|sub-agent|worker|explorer|mapper)`, String.raw`/\bX(?:agent|subagent|sub-agent|worker|explorer|mapper)`],
  ['«the subagent reported» never matches', GUARD, String.raw`/\bthe\s+(?:agent|subagent|sub-agent|worker)\s+(?:reported`, String.raw`/\bXthe\s+(?:agent|subagent|sub-agent|worker)\s+(?:reported`],
  ['«according to the agent» never matches', GUARD, String.raw`/\baccording to the (?:agent`, String.raw`/\bXaccording to the (?:agent`],
  ['«tu mandato exige» never matches', GUARD, String.raw`/\btus?\s+`, String.raw`/\bXtus?\s+`],
  ['«según tus reglas» never matches', GUARD, String.raw`/(?:\bseg[uú]n|\bde acuerdo con|\bcomo`, String.raw`/X(?:\bseg[uú]n|\bde acuerdo con|\bcomo`],
  ['«el dueño quiere» never matches', GUARD, String.raw`/\bel\s+due[nñ]o`, String.raw`/\bXel\s+due[nñ]o`],
  ['«el dueño pidió» closes with a word boundary an accent never meets', GUARD, String.raw`insisti[oó])(?!\w)/i`, String.raw`insisti[oó])\b/i`],
  ['«me dijiste que» never matches', GUARD, String.raw`/\b(?:dijiste|`, String.raw`/\bX(?:dijiste|`],
  ['«la documentación dice» never matches', GUARD, String.raw`/\bdocumentaci[oó]n\s+(?:oficial`, String.raw`/\bXdocumentaci[oó]n\s+(?:oficial`],
  ['«según la documentación» never matches', GUARD, String.raw`/(?:\bseg[uú]n|\bde acuerdo con)\s+(?:la`, String.raw`/X(?:\bseg[uú]n|\bde acuerdo con)\s+(?:la`],
  ['«el informe del agente dice» never matches', GUARD, String.raw`/\b(?:informe|reporte`, String.raw`/\bX(?:informe|reporte`],
  ['«el subagente reportó» never matches', GUARD, String.raw`/\bel\s+(?:agente|`, String.raw`/\bXel\s+(?:agente|`],
  ['«el subagente reportó» closes with a word boundary an accent never meets', GUARD, String.raw`asegur[oó])(?!\w)/i`, String.raw`asegur[oó])\b/i`],
  ['«según el worker» never matches', GUARD, String.raw`/\bseg[uú]n\s+el\s+`, String.raw`/\bXseg[uú]n\s+el\s+`],

  // --- THE PREMISE RECEIPTS: what lets an attributed premise end the turn.
  ['a file path stops being a premise receipt', GUARD, 'const PREMISE_EVIDENCE = [FILE_PATH, ', 'const PREMISE_EVIDENCE = ['],
  ['a path:line stops being a premise receipt', GUARD, '[FILE_PATH, PATH_LINE, SHOWN_COMMAND, EXIT_CODE, CITED_URL', '[FILE_PATH, SHOWN_COMMAND, EXIT_CODE, CITED_URL'],
  ['a shown command stops being a premise receipt', GUARD, 'PATH_LINE, SHOWN_COMMAND, EXIT_CODE, CITED_URL', 'PATH_LINE, EXIT_CODE, CITED_URL'],
  ['an exit code stops being a premise receipt', GUARD, 'SHOWN_COMMAND, EXIT_CODE, CITED_URL', 'SHOWN_COMMAND, CITED_URL'],
  ['a URL stops being a premise receipt', GUARD, 'EXIT_CODE, CITED_URL, OUTPUT_BLOCK, QUOTATION];', 'EXIT_CODE, OUTPUT_BLOCK, QUOTATION];'],
  ['an output block stops being a premise receipt', GUARD, 'CITED_URL, OUTPUT_BLOCK, QUOTATION];', 'CITED_URL, QUOTATION];'],
  ['a quotation stops being a premise receipt', GUARD, 'OUTPUT_BLOCK, QUOTATION];', 'OUTPUT_BLOCK];'],
  ['a verification word becomes a premise receipt', GUARD, 'OUTPUT_BLOCK, QUOTATION];', 'OUTPUT_BLOCK, QUOTATION, VERIFICATION_WORD];'],
  ['a short quotation becomes a premise receipt', GUARD, '[^"”»\\n]{20,}', '[^"”»\\n]{1,}'],
  ['a blockquote stops being a premise receipt', GUARD, String.raw`|^[ \t]*>[ \t]*\S`, ''],
  ['premise receipts are looked for in the stripped prose, not the whole message', GUARD, 'PREMISE_EVIDENCE.some((pattern) => pattern.test(message))', 'PREMISE_EVIDENCE.some((pattern) => pattern.test(prose))'],
  ['a premise receipt no longer lets the turn end', GUARD, '  if (PREMISE_EVIDENCE.some((pattern) => pattern.test(message))) return undefined;\n', ''],

  // --- WHAT THE PREMISE PATTERNS READ: somebody's words are not the assistant's premise.
  ['inline code is read as the assistant\'s own premise', GUARD, ".replace(INLINE_CODE, ' ')", ''],
  ['a quoted span is read as the assistant\'s own premise', GUARD, ".replace(QUOTED_SPAN, ' ')", ''],
  ['the phrase named is looked for in the raw message, inline code included', GUARD, 'const matched = prose.match(tripped)[0];', 'const matched = message.match(tripped)[0];'],

  // --- THE DECISION: when the turn is blocked.
  ['a BOM-prefixed payload is no longer decoded', GUARD, 'payload = parsePayload(raw);', 'payload = JSON.parse(raw);'],
  ['a turn that already blocked once blocks again', GUARD, '  if (payload?.stop_hook_active === true) return undefined;\n', ''],
  ['a message that is not text is read as text', GUARD, "typeof payload?.last_assistant_message === 'string' ?", 'true ?'],
  ['a message with no risk phrase is not let through', GUARD, 'HIGH_RISK.find((pattern) => pattern.test(message));\n  if (tripped === undefined) return undefined;', 'HIGH_RISK.find((pattern) => pattern.test(message));'],
  ['a message with no attributed premise is not let through', GUARD, 'ATTRIBUTED_PREMISE.find((pattern) => pattern.test(prose));\n  if (tripped === undefined) return undefined;', 'ATTRIBUTED_PREMISE.find((pattern) => pattern.test(prose));'],
  ['evidence no longer lets the turn end', GUARD, '  if (EVIDENCE.some((pattern) => pattern.test(message))) return undefined;\n', ''],
  ['a null payload is dereferenced', GUARD, 'payload?.stop_hook_active', 'payload.stop_hook_active'],
  ['the attributed-premise class is never judged', GUARD, '[absoluteClaim(message), attributedPremise(message)]', '[absoluteClaim(message)]'],
  ['a message with no finding is blocked', GUARD, '  if (findings.length === 0) return undefined;\n', ''],

  // --- THE OUTPUT: what the blocked turn reads.
  // RETIRED with the move onto hook-io: 'the verdict is not a block' and 'the context is declared for another hook
  // event'. The words `decision: 'block'` and `hookEventName: 'Stop'` now live in `blockStop`, and
  // `hook-io/hook-io.mutants.mjs` pins them: 'blockStop does not block', 'blockStop names the wrong event'.
  // The guard's own arguments to `blockStop` (reason, context) stay pinned by the mutants below.
  // @es RETIRADOS con el paso a hook-io: 'the verdict is not a block' y 'the context is declared for another hook
  // event'. Las palabras viven ahora en `blockStop` y las fijan 'blockStop does not block' y 'blockStop names the
  // wrong event' de `hook-io/hook-io.mutants.mjs`; los argumentos de la guarda a `blockStop` siguen fijados abajo.
  ['the reason stops naming the phrase that tripped', GUARD, 'claim ("${matched}") stated', 'claim ("?") stated'],
  ['the context stops repeating the phrase that tripped', GUARD, 'TRIPPED on the phrase: "${matched}".', 'TRIPPED on the phrase: "?".'],
  ['the context stops promising it fires once per turn', GUARD, "const ONCE_PER_TURN = 'This guard fires at most once per turn — it will not fire again after this pass.';", "const ONCE_PER_TURN = 'This guard fires.';"],
  ['the once-per-turn notice is not appended', GUARD, '[...findings.map((finding) => finding.context), ONCE_PER_TURN]', '[...findings.map((finding) => finding.context)]'],
  ['two findings give the reason of the first only', GUARD, "findings.map((finding) => finding.reason).join(' ')", 'findings[0].reason'],
  ['two findings give the context of the first only', GUARD, '[...findings.map((finding) => finding.context), ONCE_PER_TURN]', '[findings[0].context, ONCE_PER_TURN]'],
  ['the premise reason stops naming the phrase that tripped', GUARD, 'attributed premise ("${matched}") with', 'attributed premise ("?") with'],
  ['the premise reason loses its Spanish half', GUARD, '@es Premisa atribuida ("${matched}")', 'Premisa atribuida ("${matched}")'],
  ['the premise context stops repeating the phrase that tripped', GUARD, 'on the attributed premise: "${matched}".', 'on the attributed premise: "?".'],
  ['the premise context stops citing the rule', GUARD, "(rules/00-owner-mandates.md).',", "().',"],
  ['the process prints nothing when it blocks', GUARD, 'process.stdout.write(JSON.stringify(output));', "process.stdout.write('');"],
  ['importing the guard runs it as a process', GUARD, 'runWhenMain(import.meta.url, main);', 'main();'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hooks/claim-guard.mjs', 'hooks/claim-guard.selftest.mjs'],
  selftest: 'hooks/claim-guard.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
