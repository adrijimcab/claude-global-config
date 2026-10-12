#!/usr/bin/env node
/**
 * The decisions of where a promoted lesson's stub is put — replace the key's existing line, append only
 * when it has none, report which — and the command's use of it, each broken once, that
 * `stub-placement.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de dónde se pone el muñón de una lección promovida —reemplazar la línea existente de
 * la clave, añadir solo si no tiene ninguna, informar cuál— y el uso que hace el comando, rotas una a una;
 * las debe cazar `stub-placement.selftest.mjs`. El runner y sus reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MODULE = 'failure-capture/stub-placement.mjs';
const COMMAND = 'failure-capture/capture.mjs';

const MUTANTS = [
  ['an existing line of the key is ignored, so a second stub is appended', MODULE, 'if (existing === -1) {', 'if (true) {'],
  ['the key is looked up by position, so another key\'s stub is overwritten', MODULE, 'readMarker(candidate)?.key === key', 'readMarker(candidate)?.key !== undefined'],
  ['a replaced line keeps the old stub', MODULE, '  home.lines[existing] = line;', '  home.lines[existing] = home.lines[existing];'],
  ['a key with no line is not added', MODULE, '    home.lines.push(line);', '    home.lines.push();'],
  ['a replacement is reported as an addition', MODULE, "return 'replaced';", "return 'added';"],
  ['the command appends its stub without looking for the key\'s existing one', COMMAND, '      placeStub(home, key, stub.line, readMarker);', '      home.lines.push(stub.line);']
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'], selftest: 'failure-capture/stub-placement.selftest.mjs', mutants: MUTANTS });

process.exit(survivors === 0 ? 0 : 1);
