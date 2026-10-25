#!/usr/bin/env node
/**
 * The decisions of the brief-route guard, each broken once, that `selftest.mjs` must catch: the grammar of the
 * two forms, what a feature name is, where the line must sit, what extends the word, the count of lines, the
 * states a refusal names, and how the shim reads and answers. The campaign runner and its rules (green baseline
 * first, exactly-once targets, parse-checked mutants) live in `../mutation-proof/run-mutants.mjs`. A mutant is
 * never deleted or softened to get a clean campaign: a survivor is a missing assertion.
 *
 * @es Las decisiones del guard brief-route, rotas una a una, que `selftest.mjs` debe cazar: la gramática de las
 * dos formas, qué es un nombre de feature, dónde debe estar la línea, qué alarga la palabra, el recuento de
 * líneas, los estados que nombra un rechazo y cómo lee y responde el shim. Un mutante nunca se borra ni se
 * ablanda: un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const ROUTE = 'brief-route/route-line.mjs';
const REFUSAL = 'brief-route/refusal-text.mjs';
const GUARD = 'brief-route/guard.mjs';

const MUTANTS = [
  // The grammar / La gramática
  ['the word is misspelt', ROUTE, "export const ROUTE_WORD = 'ROUTE';", "export const ROUTE_WORD = 'ROUTES';"],
  ['the direct value is misspelt', ROUTE, "export const DIRECT = 'direct';", "export const DIRECT = 'directo';"],
  ['the tracked value is misspelt', ROUTE, "export const TRACKED_ODD = 'tracked-odd';", "export const TRACKED_ODD = 'tracked';"],
  ['a tail after direct is tolerated', ROUTE, 'if (value === DIRECT) return { route: DIRECT };', 'if (value.startsWith(DIRECT)) return { route: DIRECT };'],
  ['tracked-odd needs no space before the feature', ROUTE, 'const prefix = `${TRACKED_ODD} `;', 'const prefix = TRACKED_ODD;'],
  ['a feature name is not validated', ROUTE, 'return isFeatureName(feature) ? { route: TRACKED_ODD, feature } : undefined;', 'return { route: TRACKED_ODD, feature };'],
  ['the colon is not demanded right after the word', ROUTE, 'const parsed = line.startsWith(prefix) ?', 'const parsed = line.startsWith(ROUTE_WORD) ?'],
  ['the value after the colon is not trimmed', ROUTE, 'parseRouteValue(line.slice(prefix.length).trim())', 'parseRouteValue(line.slice(prefix.length))'],
  // What is a feature name / Qué es un nombre de feature
  ['the length limit is not applied', ROUTE, 'if (name.length > MAX_FEATURE_NAME_LENGTH) return false;', 'if (false) return false;'],
  ['the length limit is off by one', ROUTE, 'name.length > MAX_FEATURE_NAME_LENGTH)', 'name.length >= MAX_FEATURE_NAME_LENGTH)'],
  ['the length limit changes', ROUTE, 'export const MAX_FEATURE_NAME_LENGTH = 64;', 'export const MAX_FEATURE_NAME_LENGTH = 63;'],
  ['an empty word between hyphens is accepted', ROUTE, 'word.length > 0 && [...word]', '[...word]'],
  ['a digit is not a name character', ROUTE, "const LOWER_AND_DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789';", "const LOWER_AND_DIGITS = 'abcdefghijklmnopqrstuvwxyz';"],
  ['a lowercase letter is not a name character', ROUTE, "const LOWER_AND_DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789';", "const LOWER_AND_DIGITS = 'abcdefghijklmnopqrstuvwxy0123456789';"],
  ['an uppercase letter is a name character', ROUTE, "const LOWER_AND_DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789';", "const LOWER_AND_DIGITS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';"],
  ['an underscore is a name character', ROUTE, "const LOWER_AND_DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789';", "const LOWER_AND_DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789_';"],
  ['the hyphen is not the separator', ROUTE, "name.split('-')", "name.split('_')"],
  // Where the line sits / Dónde está la línea
  ['layout before the word is not stripped', ROUTE, '.map((rawLine) => stripLead(rawLine).trim())', '.map((rawLine) => rawLine.trim())'],
  ['the line is not trimmed', ROUTE, '.map((rawLine) => stripLead(rawLine).trim())', '.map((rawLine) => stripLead(rawLine))'],
  ['a route anywhere in a line heads it', ROUTE, '.filter((line) => line.startsWith(ROUTE_WORD) &&', '.filter((line) => line.includes(ROUTE_WORD) &&'],
  ['a longer word does not stop the heading', ROUTE, ' && !continuesTheWord(line.charAt(ROUTE_WORD.length))', ''],
  ['a lowercase continuation does not extend the word', ROUTE, "const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';", "const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';"],
  ['an uppercase continuation does not extend the word', ROUTE, "const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';", "const LETTERS = 'abcdefghijklmnopqrstuvwxyz';"],
  ['the end of the line extends the word, so a bare ROUTE is not a heading', ROUTE, "character !== '' && LETTERS.includes(character)", 'LETTERS.includes(character)'],
  // The states / Los estados
  ['a route inside a sentence reads as absent', ROUTE, "text.includes(`${ROUTE_WORD}:`) ? 'buried' : 'absent'", "'absent'"],
  ['a brief with no route at all reads as buried', ROUTE, "text.includes(`${ROUTE_WORD}:`) ? 'buried' : 'absent'", "'buried'"],
  ['two route lines are not refused', ROUTE, 'if (headings.length > 1) return', 'if (headings.length > 2) return'],
  ['a malformed line reads as present', ROUTE, "parsed === undefined ? { state: 'malformed', line } : { state: 'present', ...parsed }", "{ state: 'present', ...(parsed ?? { route: DIRECT }) }"],
  ['the malformed line is not carried', ROUTE, "{ state: 'malformed', line }", "{ state: 'malformed', line: '' }"],
  // The refusal / El rechazo
  ['a present brief is refused', REFUSAL, "if (inspection.state === 'present') return undefined;", ''],
  ['a malformed line is not shown', REFUSAL, "line('malformed', { line: inspection.line })", "line('malformed', { line: '-' })"],
  ['the number of lines is not shown', REFUSAL, "count: String(inspection.lines?.length)", "count: '1'"],
  ['the grammar is dropped from the refusal', REFUSAL, ", '', line('grammar')].join('\\n');", "].join('\\n');"],
  ['a message is worded as a delegation', REFUSAL, 'line(`header-${brief.surface}`', "line('header-delegation'"],
  ['the delegation heading is worded as a message', REFUSAL, "BRIEF-ROUTE REFUSED this delegation ({tool})", "BRIEF-ROUTE REFUSED this message ({tool})"],
  // The shim / El shim
  // Retired, pinned by hook-io's own mutants: the BOM strip ('the BOM is not stripped'), the decision value
  // ('deny does not say deny') and the event ('deny names the wrong event'). This shim now only parses and
  // emits through the port.
  // @es Retirados, fijados por los mutantes de hook-io: el BOM, el valor de la decisión y el evento. El shim
  // solo parsea y emite por el puerto.
  ['the shim does not parse through the tolerant port', GUARD, 'const payload = tryParsePayload(raw);', 'const payload = JSON.parse(raw);'],
  ['the shim never emits through the deny envelope', GUARD, 'return deny(reason);', 'return undefined;'],
  ['the shim judges a tool that carries no brief', GUARD, 'if (brief === undefined) return undefined;', ''],
  ['the shim never refuses', GUARD, 'if (reason === undefined) return undefined;', 'return undefined;']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['brief-route', 'brief-provenance', 'brief-feasibility', 'hook-dispatch', 'hook-io', 'hook-payloads', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'brief-route/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
