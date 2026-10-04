#!/usr/bin/env node
/**
 * The decisions of the bilingual message form (`message.mjs`), each broken once, that
 * `message.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de la forma del mensaje bilingüe, rotas una a una; las debe cazar `message.selftest.mjs`.
 * El runner y sus reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MESSAGE = 'failure-capture/message.mjs';

const MUTANTS = [
  ['the Spanish half is never rendered', MESSAGE, 'return `${english[0]} @es ${spanish[0]}`;', 'return english[0];'],
  ['the @es marker is dropped from a multi-line message', MESSAGE, '...spanish.map((line) => `  @es ${line}`)', '...spanish'],
  ['the Spanish lines come before the English ones', MESSAGE, '[...english, ...spanish.map((line) => `  @es ${line}`)]', '[...spanish.map((line) => `  @es ${line}`), ...english]'],
  ['an unfilled placeholder is printed as it is', MESSAGE, 'if (missing.length > 0) throw', 'if (false) throw'],
  ['only the first occurrence of a placeholder is filled', MESSAGE, 'at = isPlaceholder ? close + 1 : open + 1;', 'at = isPlaceholder ? close + 1 : open + 1; if (isPlaceholder) { filled += line.slice(at); return filled; }'],
  ['any brace group is a placeholder, so a JSON example throws', MESSAGE, 'if (name.length > 0 && [...name].every((character) => NAME_CHARACTERS.includes(character))) names.push(name);', 'if (name.length > 0) names.push(name);'],
  ['a half that is missing is not reported', MESSAGE, "if (english.trim().length === 0 || spanish.trim().length === 0) {", 'if (false) {'],
  ['an untranslated copy is not reported', MESSAGE, "if (english === spanish) problems.push(", 'if (false) problems.push('],
  ['different placeholders between the halves are not reported', MESSAGE, "if ([...new Set(placeholdersOf(english))].sort().join() !== [...new Set(placeholdersOf(spanish))].sort().join()) problems.push(", 'if (false) problems.push('],
  ['placeholders are compared in order, so a reordered translation is flagged', MESSAGE, '[...new Set(placeholdersOf(english))].sort().join() !==', '[...new Set(placeholdersOf(english))].join() !==']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/message.selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
