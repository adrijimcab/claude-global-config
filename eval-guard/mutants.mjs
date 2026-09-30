#!/usr/bin/env node
/**
 * The decisions of the eval guard's node-options walk, each broken once, that `selftest.mjs` must catch.
 * The runner and its rules (green unmutated baseline, each target exactly once, parse check) live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * Both directions, because both cost: the mutant that makes the guard NOISY (it refuses a `-p` that belongs
 * to the script, the measured incident) and the one that makes it BLIND (it stops examining node's own
 * options too early and lets a mangled `-e` through).
 *
 * @es Las decisiones del recorrido de opciones de node del guard, rotas una a una, que `selftest.mjs` debe
 * cazar. Las dos direcciones: el mutante que lo vuelve RUIDOSO (rechaza un `-p` del script, el incidente
 * medido) y el que lo deja CIEGO (deja de examinar las opciones de node y deja pasar un `-e` destrozado).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const DETECT = 'eval-guard/detect.mjs';

const MUTANTS = [
  // --- noisy: the script's own arguments are read as node's ---
  ['the scan never stops, so a script argument -p is read as node\'s print switch', DETECT, '      if (endsNodeOptions(invocation[index])) break;\n', ''],
  ['the script path no longer ends node\'s options', DETECT, "!token.raw.startsWith('-') || token.raw === '-'", "token.raw === '-'"],
  ['a bare -- no longer ends node\'s options', DETECT, "token.raw === '--' || !token.raw.startsWith('-')", "!token.raw.startsWith('-')"],
  ['a lone - (stdin) no longer ends node\'s options', DETECT, " || token.raw === '-';", ';'],
  // --- blind: node's own options stop being examined ---
  ['the walk ends at the FIRST word, so any option before -e hides it', DETECT, '      if (endsNodeOptions(invocation[index])) break;\n', '      if (index > position + 1) break;\n'],
  ['a value-taking option is no longer skipped, so its value ends the walk early', DETECT, '      if (NODE_OPTIONS_TAKING_A_VALUE.has(invocation[index].raw)) {\n        index += 1;\n        continue;\n      }\n', ''],
  ['-r is missing from the value-taking options', DETECT, "  '-r',\n", ''],
  ['--input-type is missing from the value-taking options', DETECT, "  '--input-type',\n", ''],
  ['the payload word is not skipped, so it ends the walk and a later evaluate switch hides', DETECT, '      if (!inline) index += 1;\n', ''],
  ['the walk ends on any option, not only on a non-option', DETECT, '!token.raw.startsWith(\'-\') || token.raw === \'-\'', "token.raw.startsWith('--') || !token.raw.startsWith('-') || token.raw === '-'"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['eval-guard', 'mutation-proof'],
  selftest: 'eval-guard/selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
