#!/usr/bin/env node
/**
 * The decisions of git-bash, each broken once, that `git-bash.selftest.mjs` must catch.
 * @es Las decisiones de git-bash, rotas una a una, que `git-bash.selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const M = 'selftest-fixtures/git-bash.mjs';

const MUTANTS = [
  ['Windows gets plain bash', M, "if (platform !== 'win32') return 'bash';", "if (platform !== 'linux') return 'bash';"],
  ['backslashes are not turned forward', M, ".trim().split('\\\\').join('/')", '.trim()'],
  ['the root is one level short', M, 'const EXEC_PATH_DEPTH = 3;', 'const EXEC_PATH_DEPTH = 2;'],
  ['the Bash is looked for in bin instead of usr/bin', M, '`${root}/usr/bin/bash.exe`', '`${root}/bin/bash.exe`'],
  ['a missing bash.exe falls back to PATH', M, "if (bash === '' || !exists(bash)) {", "if (bash === '') {"],
  ['an empty exec path is accepted', M, "if (bash === '' || !exists(bash)) {", 'if (!exists(bash)) {'],
  ['the real lookup asks no git', M, "const execPath = process.platform === 'win32' ? execFileSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true }) : '';", "const execPath = '';"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['selftest-fixtures'],
  selftest: 'selftest-fixtures/git-bash.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
