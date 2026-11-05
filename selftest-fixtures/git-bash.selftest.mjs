#!/usr/bin/env node
/**
 * Selftest of git-bash: the Bash a selftest spawns is Git Bash, found from git itself, whatever comes first on PATH.
 * @es Selftest de git-bash: el Bash que lanza un selftest es Git Bash, hallado desde el propio git, venga lo que venga
 * primero en el PATH.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { gitBash, gitBashFrom } from './git-bash.mjs';

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
const bash = gitBash();
check('the real Bash is an absolute path on Windows, plain bash elsewhere', process.platform === 'win32' ? path.isAbsolute(bash) : bash === 'bash', bash);

if (process.platform === 'win32') {
  const wslFirst = { ...process.env, PATH: `C:\\WINDOWS\\system32;${process.env.PATH ?? ''}` };
  const run = spawnSync(bash, ['-c', 'cygpath -w /'], { encoding: 'utf8', env: wslFirst });
  check('with WSL bash first on PATH, the resolved Bash is still Git Bash (cygpath answers)', run.status === 0 && /Git/i.test(run.stdout), `${run.status} ${run.stdout}${run.stderr}`);
}

console.log(`git-bash selftest: ${passed}/${passed + failed} assertions passed @es aserciones superadas`);
process.exit(failed === 0 ? 0 : 1);
