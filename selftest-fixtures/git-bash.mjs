/**
 * The Bash a selftest spawns: Git Bash, found from git itself. On this machine `bash` on PATH can be WSL's
 * (C:\WINDOWS\system32\bash.exe), which comes first when a process starts from PowerShell, as b100's detached
 * landing did on 2026-11-05: protected-branch-guard's xargs premise then ran in WSL (a /mnt/c path joined to a
 * Windows path) and process-reaper's sleeping loop child became invisible to Windows. Spawning bare `bash` makes a
 * selftest's verdict depend on PATH order; this module removes that.
 * HOW. `git --exec-path` is `<git root>/mingw64/libexec/git-core`; Git Bash is `<git root>/usr/bin/bash.exe`. When it
 * is not there the call throws: falling back to another Bash would hide the defect it exists to prevent.
 * @es El Bash que lanza un selftest: Git Bash, hallado desde el propio git. En esta máquina el `bash` del PATH puede
 * ser el de WSL, que gana cuando un proceso arranca desde PowerShell, como el aterrizaje desacoplado de b100 el
 * 2026-11-05: la premisa con xargs corrió en WSL y el hijo `sleep` de process-reaper quedó invisible para Windows.
 * Lanzar `bash` a secas hace que el veredicto dependa del orden del PATH. Si Git Bash no está, lanza un error: caer en
 * otro Bash escondería el defecto que este módulo evita.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** The levels from git's exec path up to its root: mingw64/libexec/git-core. @es Niveles hasta la raíz de git. */
const EXEC_PATH_DEPTH = 3;

/** git's exec path with forward slashes, '' when unreadable. @es La ruta de git con barras normales. */
const forwardOf = (execPath) => (typeof execPath === 'string' ? execPath.trim().split('\\').join('/') : '');

/** `<git root>/usr/bin` from a forward exec path. @es `<raíz de git>/usr/bin` a partir de la ruta de git. */
const gitUsrBinOf = (forward) => `${path.posix.join(forward, ...Array(EXEC_PATH_DEPTH).fill('..'))}/usr/bin`;

/**
 * The environment Git Bash runs a command in: Git's usr/bin first on PATH, so its own tools (cygpath, xargs, grep,
 * sleep) answer even when the caller's PATH holds no Git directory, as b100's detached landing measured on
 * 2026-11-05. The existing PATH key keeps its spelling (Windows writes `Path`), so no second key appears.
 * @es El entorno en que Git Bash corre un comando: el usr/bin de Git primero en el PATH, para que sus herramientas
 * respondan aunque el PATH de quien llama no tenga ningún directorio de Git, como midió el aterrizaje desacoplado de
 * b100. La clave PATH existente conserva su escritura (Windows usa `Path`), así no aparece una segunda clave.
 */
export function gitBashEnvFrom({ platform, execPath, env }) {
  if (platform !== 'win32') return env;

  const usrBin = gitUsrBinOf(forwardOf(execPath)).split('/').join('\\');
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'Path';
  const current = env[key];

  return { ...env, [key]: current === undefined || current === '' ? usrBin : `${usrBin};${current}` };
}

/** git's exec path on Windows, '' elsewhere: the one fact both lookups need. @es La ruta de git en Windows. */
const gitExecPath = () => (process.platform === 'win32' ? execFileSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true }) : '');

/** `env` prepared for Git Bash on this machine. @es `env` preparado para Git Bash en esta máquina. */
export function gitBashEnv(env = process.env) {
  return gitBashEnvFrom({ platform: process.platform, execPath: gitExecPath(), env });
}

/**
 * Pure derivation with injected facts, so a selftest can drive every case.
 * @es Derivación pura con hechos inyectados, para que un selftest recorra cada caso.
 */
export function gitBashFrom({ platform, execPath, exists }) {
  if (platform !== 'win32') return 'bash';

  const forward = forwardOf(execPath);
  // An empty or unreadable exec path gives a relative candidate that does not exist, so `exists` alone decides.
  // @es Una ruta vacía o ilegible da un candidato relativo que no existe, así que decide solo `exists`.
  const bash = `${gitUsrBinOf(forward)}/bash.exe`;

  if (!exists(bash)) {
    throw new Error(`Git Bash was not found beside git (exec path "${forward}"); a selftest never falls back to another bash. @es No se encontró Git Bash junto a git (ruta "${forward}"); un selftest nunca cae en otro bash.`);
  }

  return bash;
}

/** Git Bash on this machine. @es Git Bash en esta máquina. */
export function gitBash() {
  const execPath = gitExecPath();

  return gitBashFrom({ platform: process.platform, execPath, exists: existsSync });
}
