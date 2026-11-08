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
  ['the Git tools are looked for in bin instead of usr/bin', M, "fill('..'))}/usr/bin`;", "fill('..'))}/bin`;"],
  ['a missing bash.exe falls back to PATH', M, 'if (!exists(bash)) {', 'if (false) {'],
  ['the real lookup asks no git', M, "execFileSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true }) : '');", "'' : '');"],
  // The environment Git Bash runs in. @es El entorno en que corre Git Bash.
  ['the environment is rewritten on every platform', M, "if (platform !== 'win32') return env;", "if (platform === 'never') return env;"],
  ['Git usr/bin keeps forward slashes on the Windows PATH', M, "gitUsrBinOf(forwardOf(execPath)).split('/').join('\\\\');", 'gitUsrBinOf(forwardOf(execPath));'],
  ['the PATH key is matched by exact case only', M, "Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'Path';", "Object.keys(env).find((name) => name === 'PATH') ?? 'Path';"],
  ['Git usr/bin goes last instead of first', M, '`${usrBin};${current}`', '`${current};${usrBin}`'],
  ['an empty Path keeps a stray separator', M, "current === undefined || current === '' ? usrBin", 'current === undefined ? usrBin'],
  ['the caller environment is ignored', M, "return gitBashEnvFrom({ platform: process.platform, execPath: gitExecPath(), env });", "return gitBashEnvFrom({ platform: process.platform, execPath: gitExecPath(), env: {} });"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['selftest-fixtures'],
  selftest: 'selftest-fixtures/git-bash.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
