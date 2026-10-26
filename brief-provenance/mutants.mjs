#!/usr/bin/env node
/**
 * The decisions of the brief-provenance guard, each broken once, that `selftest.mjs` must catch: the two
 * marker words, what extends a word, what counts as layout before a marker, where a marker must sit, where
 * each tool carries its brief, and how each refusal names its state. The campaign runner and its rules
 * (green baseline first, exactly-once targets, parse-checked mutants) live in `../mutation-proof/run-mutants.mjs`.
 * A mutant is never deleted or softened to get a clean campaign: a survivor is a missing assertion.
 *
 * @es Las decisiones del guard de procedencia, rotas una a una, que `selftest.mjs` debe cazar: las dos
 * palabras marcadoras, qué alarga una palabra, qué es maquetación previa, dónde debe estar el marcador,
 * dónde lleva cada herramienta su brief y cómo nombra cada rechazo su estado. Un mutante nunca se borra
 * ni se ablanda: un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

import { DEPENDENCY_MUTANTS } from './dependency-mutant-set.mjs';

const PROVENANCE = 'brief-provenance/provenance.mjs';
const GUARD = 'brief-provenance/guard.mjs';
const LETTERS = "const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';";
const LAYOUT = '-*+#>';

const MUTANTS = [
  // The marker words / Las palabras marcadoras
  ['the MEASURED marker word is misspelt', PROVENANCE, "MEASURED_WORD = 'MEASURED';", "MEASURED_WORD = 'MEASURES';"],
  ['the HYPOTHESIS marker word is misspelt', PROVENANCE, "HYPOTHESIS_WORD = 'HYPOTHESIS';", "HYPOTHESIS_WORD = 'HYPOTHESES';"],
  ['only MEASURED is required', PROVENANCE, 'for (const word of [MEASURED_WORD, HYPOTHESIS_WORD]) {', 'for (const word of [MEASURED_WORD]) {'],
  ['only HYPOTHESIS is required', PROVENANCE, 'for (const word of [MEASURED_WORD, HYPOTHESIS_WORD]) {', 'for (const word of [HYPOTHESIS_WORD]) {'],
  ['a failing marker is reported only when it is absent', PROVENANCE, "if (state !== 'present')", "if (state === 'absent')"],
  // What extends a word / Qué alarga una palabra
  ['a lowercase letter no longer extends the marker word', PROVENANCE, LETTERS, "const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';"],
  ['an uppercase letter no longer extends the marker word', PROVENANCE, LETTERS, "const LETTERS = 'abcdefghijklmnopqrstuvwxyz';"],
  ['the bare word alone on its line is read as a longer word', PROVENANCE, 'rest.length > 0 && LETTERS.includes(rest.charAt(0))', 'LETTERS.includes(rest.charAt(0))'],
  ['any character after the word extends it, the colon included', PROVENANCE, 'rest.length > 0 && LETTERS.includes(rest.charAt(0))', 'rest.length > 0'],
  // What is layout / Qué es maquetación
  ...[...LAYOUT].map((char) => [`the layout character ${char} is content, so a line it opens is not a declaration`, PROVENANCE, `const LIST_MARKUP = '${LAYOUT}';`, `const LIST_MARKUP = '${LAYOUT.replace(char, '')}';`]),
  ['indentation is content, so an indented marker is not a declaration', PROVENANCE, 'LIST_MARKUP.includes(char) || char.trim() === \'\'', 'LIST_MARKUP.includes(char)'],
  ['leading layout is never stripped', PROVENANCE, 'const line = stripLead(rawLine);', 'const line = rawLine;'],
  // Where the marker must sit / Dónde debe estar
  ['a marker anywhere in a line heads it', PROVENANCE, 'if (!line.startsWith(word)) continue;', 'if (!line.includes(word)) continue;'],
  ['a line that heads the word is not remembered, so a colonless one reads as buried', PROVENANCE, 'headsALine = true;', 'headsALine = false;'],
  ['the first line that heads the word decides, so a later declaring line is ignored', PROVENANCE, "if (rest.includes(':')) return 'present';", "return rest.includes(':') ? 'present' : 'no-colon';"],
  ['a marker that appears nowhere at a line start reads as absent, never buried', PROVENANCE, "return brief.includes(word) ? 'buried' : 'absent';", "return 'absent';"],
  // Where each tool carries its brief / Dónde lleva cada herramienta su brief
  ['Agent briefs are read from `message` instead of `prompt`', PROVENANCE, "Agent: Object.freeze({ field: 'prompt', surface: 'delegation',", "Agent: Object.freeze({ field: 'message', surface: 'delegation',"],
  ['SendMessage is read from its 50-character preview `content`', PROVENANCE, "field: 'message', surface: 'message'", "field: 'content', surface: 'message'"],
  ['an Agent refusal is worded as a message', PROVENANCE, "Agent: Object.freeze({ field: 'prompt', surface: 'delegation',", "Agent: Object.freeze({ field: 'prompt', surface: 'message',"],
  ['a Task refusal is worded as a message', PROVENANCE, "Task: Object.freeze({ field: 'prompt', surface: 'delegation',", "Task: Object.freeze({ field: 'prompt', surface: 'message',"],
  ['a SendMessage refusal is worded as a delegation', PROVENANCE, "surface: 'message', spanishSurface", "surface: 'delegation', spanishSurface"],
  ['an Agent refusal is worded as a message in Spanish', PROVENANCE, "surface: 'delegation', spanishSurface: 'esta delegación' }),\n  Task", "surface: 'delegation', spanishSurface: 'este mensaje' }),\n  Task"],
  ['a Task refusal is worded as a message in Spanish', PROVENANCE, "surface: 'delegation', spanishSurface: 'esta delegación' }),\n  SendMessage", "surface: 'delegation', spanishSurface: 'este mensaje' }),\n  SendMessage"],
  ['a SendMessage refusal is worded as a delegation in Spanish', PROVENANCE, "spanishSurface: 'este mensaje' })", "spanishSurface: 'esta delegación' })"],
  ['a brief does not carry its Spanish surface', PROVENANCE, 'return { toolName, surface, spanishSurface, text };', 'return { toolName, surface, text };'],
  ['a refusal does not carry its Spanish surface', PROVENANCE, ', spanishSurface: brief.spanishSurface };', ' };'],
  ['a whitespace-only brief is judged instead of ignored', PROVENANCE, "typeof text !== 'string' || text.trim().length === 0", "typeof text !== 'string'"],
  // The refusal and the wire / El rechazo y el cable
  ['a buried marker is diagnosed as absent', GUARD, "if (state === 'buried')", "if (state === 'xburied')"],
  ['a colonless marker is diagnosed as absent', GUARD, "if (state === 'no-colon')", "if (state === 'xno-colon')"],
  ['a payload written with a byte-order mark is not judged', GUARD, "raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw", 'raw'],
  // The Spanish half of the refusal / La mitad en español del rechazo
  ['a buried marker has no Spanish half', GUARD, '`  @es CASI — ${word} aparece en el brief', '`  CASI — ${word} aparece en el brief'],
  ['a colonless marker has no Spanish half', GUARD, '`  @es CASI — ${word} empieza una línea', '`  CASI — ${word} empieza una línea'],
  ['ABSENT has no Spanish half', GUARD, '`  @es AUSENTE — el brief no contiene ninguna línea ${word}.', '`  AUSENTE — el brief no contiene ninguna línea.'],
  ['the headline has no Spanish half', GUARD, '`@es BRIEF-PROVENANCE RECHAZÓ ${refusal.spanishSurface} (${refusal.toolName}): el brief', '`BRIEF-PROVENANCE RECHAZÓ ${refusal.spanishSurface} (${refusal.toolName}): el brief'],
  ['the Spanish headline names no surface', GUARD, 'RECHAZÓ ${refusal.spanishSurface} (${refusal.toolName}): el brief', 'RECHAZÓ (${refusal.toolName}): el brief'],
  ['the rule has no Spanish half', GUARD, "'@es LA REGLA:", "'LA REGLA:"],
  ['the MEASURED marker has no Spanish half', GUARD, "'@es MEASURED: cada número", "'MEASURED: cada número"],
  ['the HYPOTHESIS marker has no Spanish half', GUARD, "'@es HYPOTHESIS: cada afirmación causal", "'HYPOTHESIS: cada afirmación causal"],
  ['the reason for refusing has no Spanish half', GUARD, "'@es Este guard no juzga", "'Este guard no juzga"],
  // The dependency-claim face / La cara de afirmaciones sobre dependencias
  ...DEPENDENCY_MUTANTS,
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['brief-provenance', 'hook-payloads', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'brief-provenance/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
