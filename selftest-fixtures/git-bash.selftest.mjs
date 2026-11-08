#!/usr/bin/env node
/**
 * Selftest of git-bash: the Bash a selftest spawns is Git Bash, found from git itself, whatever comes first on PATH.
 * @es Selftest de git-bash: el Bash que lanza un selftest es Git Bash, hallado desde el propio git, venga lo que venga
 * primero en el PATH.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { gitBash, gitBashEnv, gitBashEnvFrom, gitBashFrom } from './git-bash.mjs';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${label}${detail === '' ? '' : `: ${detail}`}`);
  }
}

const safely = (call) => {
  try {
    return call();
  } catch (error) {
    return `threw: ${error.message}`;
  }
};

// The pure derivation, with injected facts. @es La derivación pura, con hechos inyectados.
const present = (file) => file === 'C:/Program Files/Git/usr/bin/bash.exe';
check('Windows: the Bash beside git, from the exec path', safely(() => gitBashFrom({ platform: 'win32', execPath: 'C:/Program Files/Git/mingw64/libexec/git-core', exists: present })) === 'C:/Program Files/Git/usr/bin/bash.exe');
check('Windows: a backslashed exec path gives the same Bash', safely(() => gitBashFrom({ platform: 'win32', execPath: 'C:\\Program Files\\Git\\mingw64\\libexec\\git-core', exists: present })) === 'C:/Program Files/Git/usr/bin/bash.exe');
check('Windows: no bash.exe beside git is refused, never another Bash', String(safely(() => gitBashFrom({ platform: 'win32', execPath: 'C:/Program Files/Git/mingw64/libexec/git-core', exists: () => false }))).startsWith('threw: Git Bash was not found'));
check('Windows: the refusal is bilingual', String(safely(() => gitBashFrom({ platform: 'win32', execPath: 'C:/x/mingw64/libexec/git-core', exists: () => false }))).includes('@es '));
check('Windows: an unreadable exec path is refused', String(safely(() => gitBashFrom({ platform: 'win32', execPath: '', exists: present }))).startsWith('threw: Git Bash was not found'));
check('elsewhere: plain bash', safely(() => gitBashFrom({ platform: 'linux', execPath: '/usr/lib/git-core', exists: () => false })) === 'bash');

// The real machine, with a PATH whose first bash is WSL's (the measured failure). @es La máquina real, con un PATH
// cuyo primer bash es el de WSL (el fallo medido).
const bash = String(safely(() => gitBash()));
check('the real Bash is an absolute path on Windows, plain bash elsewhere', process.platform === 'win32' ? path.isAbsolute(bash) : bash === 'bash', bash);

// The pure environment derivation. @es La derivación pura del entorno.
const envFor = (env) => safely(() => gitBashEnvFrom({ platform: 'win32', execPath: 'C:/Program Files/Git/mingw64/libexec/git-core', env }));
const withPath = envFor({ Path: 'C:\\WINDOWS\\system32', OTHER: 'x' });
check('Windows: Git usr/bin goes first on the existing Path key, keeping its spelling and the rest', withPath?.Path === 'C:\\Program Files\\Git\\usr\\bin;C:\\WINDOWS\\system32' && withPath?.OTHER === 'x' && !('PATH' in withPath), JSON.stringify(withPath));
const withUpper = envFor({ PATH: 'C:\\x' });
check('Windows: an upper-case PATH key is kept as it is', withUpper?.PATH === 'C:\\Program Files\\Git\\usr\\bin;C:\\x' && !('Path' in withUpper), JSON.stringify(withUpper));
const lower = envFor({ path: 'C:\\y' });
check('Windows: a PATH key in any case is the one rewritten, never a second key', lower?.path === 'C:\\Program Files\\Git\\usr\\bin;C:\\y' && Object.keys(lower).length === 1, JSON.stringify(lower));
const emptyPath = envFor({ Path: '' });
check('Windows: an empty Path becomes Git usr/bin alone, with no stray separator', emptyPath?.Path === 'C:\\Program Files\\Git\\usr\\bin', JSON.stringify(emptyPath));
check('the real environment keeps the caller variables', safely(() => gitBashEnv({ ...process.env, GIT_BASH_SELFTEST_MARK: 'kept' }))?.GIT_BASH_SELFTEST_MARK === 'kept');
const noPath = envFor({ OTHER: 'x' });
check('Windows: with no Path at all, Path is Git usr/bin alone', noPath?.Path === 'C:\\Program Files\\Git\\usr\\bin', JSON.stringify(noPath));
check('elsewhere: the environment is returned unchanged', safely(() => gitBashEnvFrom({ platform: 'linux', execPath: '', env: { PATH: '/bin' } }))?.PATH === '/bin');

if (process.platform === 'win32') {
  // b100's measured environment: no Git\usr\bin and no Git\bin on PATH, WSL's bash found first; git itself
  // (Git\cmd) stays reachable. @es El entorno medido de b100: sin Git\usr\bin ni Git\bin en el PATH, el bash de WSL
  // primero; el propio git (Git\cmd) sigue alcanzable.
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'Path';
  const noGit = (process.env[pathKey] ?? '').split(';').filter((entry) => !/\\Git\\(usr\\bin|bin|mingw64\\bin)\\?$/i.test(entry)).join(';');
  const bare = { ...process.env, [pathKey]: `C:\\WINDOWS\\system32;${noGit}` };
  const script = 'cygpath -w / && command -v xargs';
  const run = spawnSync(bash, ['-c', script], { encoding: 'utf8', env: safely(() => gitBashEnv(bare)) });
  check('with no Git usr/bin or bin on PATH, Git Bash with its own environment finds cygpath and xargs', run.status === 0 && /Git/i.test(run.stdout) && /xargs/.test(run.stdout), `${run.status} ${run.stdout}${run.stderr}`);
  const without = spawnSync(bash, ['-c', script], { encoding: 'utf8', env: bare });
  check('near miss: the same Bash with the bare environment cannot find them', without.status !== 0, `${without.status} ${without.stdout}`);
}

console.log(`git-bash selftest: ${passed}/${passed + failed} assertions passed @es aserciones superadas`);
process.exit(failed === 0 ? 0 : 1);
