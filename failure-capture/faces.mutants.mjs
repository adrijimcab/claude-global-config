#!/usr/bin/env node
/**
 * The decisions of how a promoted text's FACES are counted (`faces.mjs`), each broken once, that
 * `faces.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de cómo se cuentan las CARAS de un texto promovido, rotas una a una; las debe cazar
 * `faces.selftest.mjs`. El runner y sus reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FACES = 'failure-capture/faces.mjs';

const MUTANTS = [
  ['every occurrence of the key is a face, so repeating it adds faces', FACES, 'if (names || enclosing.at(-1)?.names === true) faces += 1;', 'if (names || enclosing.at(-1)?.names === true) faces += unit.text.split(key).length - 1 || 1;'],
  ['the sub-bullets of an item that names the key stop being faces', FACES, 'if (names || enclosing.at(-1)?.names === true) faces += 1;', 'if (names) faces += 1;'],
  ['the sub-bullets of ANY item are faces, named or not', FACES, 'if (names || enclosing.at(-1)?.names === true) faces += 1;', 'if (names || enclosing.length > 0) faces += 1;'],
  ['the details nested under a face are faces too', FACES, 'if (names || enclosing.at(-1)?.names === true) faces += 1;', 'if (names || enclosing.some((outer) => outer.names)) faces += 1;'],
  ['a plain paragraph naming the key is not a face', FACES, 'if (names) faces += 1;\n      continue;', 'continue;'],
  ['a plain paragraph does not end the list context', FACES, '      enclosing = [];\n', ''],
  ['a key that is a prefix of another key is named by it', FACES, 'if (!KEY_CHARACTERS.includes(before ?? \' \') && !KEY_CHARACTERS.includes(after ?? \' \')) return true;', 'return true;'],
  ['a key preceded by a key character still counts, but only the trailing edge is checked', FACES, '!KEY_CHARACTERS.includes(before ?? \' \') && ', ''],
  ['ordered items are not list items', FACES, "return digits > 0 && body.startsWith('. ', digits);", 'return false;'],
  ['a continuation line after a blank line opens a new paragraph instead of staying in its item', FACES, '(!afterBlank || (current.item && indent > current.indent))', '!afterBlank'],
  ['a sibling item does not close the previous one, so it is read as its child', FACES, 'enclosing.at(-1).indent >= unit.indent', 'enclosing.at(-1).indent > unit.indent'],
  ['every continuation line opens its own unit, so one item repeating the key on two lines counts twice', FACES, '(!afterBlank || (current.item && indent > current.indent))', 'false']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/faces.selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
