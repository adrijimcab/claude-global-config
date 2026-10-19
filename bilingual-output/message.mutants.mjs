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

const MESSAGE = 'bilingual-output/message.mjs';

const MUTANTS = [
  ['the Spanish half is never rendered', MESSAGE, 'return `${english[0]} @es ${spanish[0]}`;', 'return english[0];'],
  ['the @es marker is dropped from a multi-line message', MESSAGE, '...spanish.map((line) => `  @es ${line}`)', '...spanish'],
  ['the Spanish lines come before the English ones', MESSAGE, '[...english, ...spanish.map((line) => `  @es ${line}`)]', '[...spanish.map((line) => `  @es ${line}`), ...english]'],
  ['an unfilled placeholder is printed as it is', MESSAGE, 'if (missing.length > 0) throw', 'if (false) throw'],
  ['only the first occurrence of a placeholder is filled', MESSAGE, 'at = isPlaceholder ? close + 1 : open + 1;', 'at = isPlaceholder ? close + 1 : open + 1; if (isPlaceholder) { filled += line.slice(at); return filled; }'],
  ['any brace group is a placeholder, so a JSON example throws', MESSAGE, 'if (name.length > 0 && [...name].every((character) => NAME_CHARACTERS.includes(character))) names.push(name);', 'if (name.length > 0) names.push(name);'],
  ['a half that is missing is not reported', MESSAGE, 'if (!hasText(message?.en) || !hasText(message?.es)) {', 'if (false) {'],
  ['an untranslated copy is not reported', MESSAGE, "if (english === spanish) problems.push(", 'if (false) problems.push('],
  ['different placeholders between the halves are not reported', MESSAGE, "if (dataOf(english, 'En').join() !== dataOf(spanish, 'Es').join()) problems.push(", 'if (false) problems.push('],
  ['placeholders are compared in order, so a reordered translation is flagged', MESSAGE, 'return [...new Set(data)].sort();', 'return [...new Set(data)];'],
  ['a datum split into its two language halves is flagged', MESSAGE, "? `${name.slice(0, -suffix.length)}#half` : name", '? name : name'],
  ['each half accepts the other language suffix', MESSAGE, "dataOf(english, 'En').join() !== dataOf(spanish, 'Es').join()", "dataOf(english, 'Es').join() !== dataOf(spanish, 'En').join()"],
  ['a split datum loses its stem, so different stems match', MESSAGE, "`${name.slice(0, -suffix.length)}#half`", "'#half'"],
  ['a split datum is read as the plain datum of the same stem', MESSAGE, "`${name.slice(0, -suffix.length)}#half`", 'name.slice(0, -suffix.length)'],
  ['a text in one language only leaves the Spanish half empty', MESSAGE, 'at === -1 ? { en: value, es: value }', "at === -1 ? { en: value, es: '' }"],
  ['a bilingual datum is not split', MESSAGE, "at === -1 ? { en: value, es: value } : { en: value.slice(0, at), es: value.slice(at + ' @es '.length) }", '{ en: value, es: value }'],
  ['a bilingual datum splits at its last @es', MESSAGE, "const at = value.indexOf(' @es ');", "const at = value.lastIndexOf(' @es ');"],
  ['the Spanish half keeps the @es marker', MESSAGE, "es: value.slice(at + ' @es '.length)", 'es: value.slice(at)'],
  ['a datum that is not text is refused', MESSAGE, 'const value = String(text);', "const value = text.trim();"],
  ['a name that is only the suffix is a split datum', MESSAGE, 'name.length > suffix.length && name.endsWith(suffix)', 'name.endsWith(suffix)'],
  ['a message with no Spanish half is rendered anyway', MESSAGE, 'if (!hasText(en) || !hasText(es)) throw', 'if (false) throw'],
  ['a missing English half is not refused when rendered', MESSAGE, 'if (!hasText(en) || !hasText(es)) throw', 'if (!hasText(es)) throw'],
  ['a half of blanks counts as text', MESSAGE, "linesOf(half ?? []).join('\\n').trim().length > 0", "linesOf(half ?? []).join('\\n').length > 0"],
  ['the missing-half problem loses its Spanish text', MESSAGE, ' @es ${id}: falta una mitad o está vacía.`', '`'],
  ['the copy problem loses its Spanish text', MESSAGE, ' @es ${id}: la mitad española es una copia de la inglesa.`', '`'],
  ['the placeholder problem loses its Spanish text', MESSAGE, ' @es ${id}: las mitades nombran marcadores distintos.`', '`']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['bilingual-output', 'mutation-proof'],
  selftest: 'bilingual-output/message.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
