#!/usr/bin/env node
/**
 * The decisions of the scoped-spec helper (the backward walk, the files it reads, the folders it skips, the
 * compiler-API refusal, the argument shape, the outside-root refusal), each broken once, that `selftest.mjs` must
 * catch. A survivor is a missing assertion, never a mutant to soften.
 * @es Las decisiones del helper de specs acotados (el recorrido hacia atrás, los ficheros que lee, las
 * carpetas que salta, el rechazo sin API de compilador, la forma de los argumentos, el rechazo fuera de la raíz), rotas
 * una a una, que `selftest.mjs` debe cazar. Un superviviente es una aserción que falta, nunca un mutante que ablandar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const R = 'scoped-proof/related-specs.mjs';
const G = 'scoped-proof/import-graph.mjs';
const C = 'scoped-proof/cli.mjs';

const MUTANTS = [
  ['the walk stops at direct importers', R, '    for (const importer of importers.get(key) ?? []) pending.push(keyOf(importer));', '    if (changed.map(keyOf).includes(key)) for (const importer of importers.get(key) ?? []) pending.push(keyOf(importer));'],
  ['a visited file is walked again', R, '    if (reached.has(key)) continue;\n', ''],
  ['importers are keyed by their raw spelling', R, '      const key = keyOf(target);', '      const key = target;'],
  ['a changed spec absent from the graph is dropped', R, ' ?? changed.find((file) => keyOf(file) === key)', ''],
  ['every reached file is a spec', R, ' && isSpec(file)', ''],
  ['the list is not sorted', R, 'return [...new Set(specs)].sort();', 'return [...new Set(specs)];'],
  ['node_modules is walked', G, "const SKIPPED = new Set(['node_modules', ", 'const SKIPPED = new Set(['],
  ['declaration files are not read', G, "entry.isFile() && entry.name.endsWith('.ts')", "entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')"],
  ['imports are not read', G, "typescript.preProcessFile(readFileSync(file, 'utf8'), true)", "typescript.preProcessFile(readFileSync(file, 'utf8'), false)"],
  ['a typescript without the compiler API is used', G, "  if (typeof typescript.resolveModuleName !== 'function' || typescript.sys === undefined) {", '  if (false) {'],
  ['a project with no typescript gets an empty graph', G, "    throw new Error(`no typescript is installed for ${root}", "    return { sys: {}, resolveModuleName: () => ({}) };\n    throw new Error(`no typescript is installed for ${root}"],
  ['the separator may sit anywhere', C, 'if (separator !== 4 || ', 'if (separator < 0 || '],
  ['an empty changed list is accepted', C, ' || argv.length === separator + 1) return undefined;', ') return undefined;'],
  ['the flags may come in any order', C, "argv[0] !== '--root' || argv[2] !== '--tsconfig' || ", ''],
  ['a changed file outside the root is accepted', C, '  if (outside.length > 0) throw new Error(', '  if (false) throw new Error('],
  ['a path is compared in its raw case', C, "return process.platform === 'win32' ? resolved.toLowerCase() : resolved;", 'return resolved;'],
  ['a failure exits green', C, '    return EXIT_NOT_MEASURED;\n  }\n}', '    return 0;\n  }\n}'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['scoped-proof'],
  selftest: 'scoped-proof/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
