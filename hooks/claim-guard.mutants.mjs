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
  ['a pasted output block stops counting as evidence', GUARD, '/```/, // a pasted block of output', '/```Z/, // a pasted block of output'],
  ['one kind of evidence is required from every pattern instead of any', GUARD, 'EVIDENCE.some((pattern)', 'EVIDENCE.every((pattern)'],

  // --- THE DECISION: when the turn is blocked.
  ['a BOM-prefixed payload is no longer decoded', GUARD, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['a turn that already blocked once blocks again', GUARD, '  if (payload?.stop_hook_active === true) return undefined;\n', ''],
  ['a message that is not text is read as text', GUARD, "typeof payload?.last_assistant_message === 'string' ?", 'true ?'],
  ['a message with no risk phrase is not let through', GUARD, '  if (!tripped) return undefined;\n', ''],
  ['evidence no longer lets the turn end', GUARD, '  if (hasEvidence) return undefined;\n', ''],
  ['a null payload is dereferenced', GUARD, 'payload?.stop_hook_active', 'payload.stop_hook_active'],

  // --- THE OUTPUT: what the blocked turn reads.
  ['the verdict is not a block', GUARD, "decision: 'block',", "decision: 'allow',"],
  ['the reason stops naming the phrase that tripped', GUARD, 'claim ("${matched}") stated', 'claim ("?") stated'],
  ['the context is declared for another hook event', GUARD, "hookEventName: 'Stop',", "hookEventName: 'SubagentStop',"],
  ['the context stops repeating the phrase that tripped', GUARD, 'TRIPPED on the phrase: "${matched}".', 'TRIPPED on the phrase: "?".'],
  ['the context stops promising it fires once per turn', GUARD, "'This guard fires at most once per turn — it will not fire again after this pass.',", "'This guard fires.',"],
  ['the process prints nothing when it blocks', GUARD, 'process.stdout.write(JSON.stringify(output));', "process.stdout.write('');"],
  ['importing the guard runs it as a process', GUARD, 'path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))', 'true'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hooks/claim-guard.mjs', 'hooks/claim-guard.selftest.mjs'],
  selftest: 'hooks/claim-guard.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
