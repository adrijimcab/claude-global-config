/**
 * Runs one child process asynchronously and resolves the result in the shape `spawnSync` returns: `{ status, signal,
 * stdout, stderr, error }`, with `error.code === 'ETIMEDOUT'` when `timeout` ran out. It never rejects.
 *
 * WHY ITS OWN ADAPTER: the selftest runner runs many selftests at once (`run.mjs`), which needs an event loop, while
 * the verdict code reads the `spawnSync` shape it always read. At the timeout the WHOLE process tree is killed
 * (`taskkill /T /F` on Windows, the process group elsewhere): a selftest spawns children of its own, and killing only
 * its node process would leave them running. Output beyond `maxBuffer` characters per stream is dropped, not kept.
 *
 * @es Ejecuta un proceso hijo de forma asíncrona y resuelve el resultado con la forma que devuelve `spawnSync`
 * (`error.code === 'ETIMEDOUT'` si venció `timeout`); nunca rechaza. Es un adaptador propio porque el runner corre
 * muchos selftests a la vez y el código del veredicto lee la forma de `spawnSync`. Al vencer el plazo mata el árbol
 * entero de procesos (`taskkill /T /F` en Windows, el grupo de procesos en el resto), porque un selftest lanza hijos
 * propios. La salida que pasa de `maxBuffer` caracteres por flujo se descarta.
 */

import { spawn } from 'node:child_process';

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string, env: object, timeout: number, maxBuffer: number }} options `timeout` 0 means none.
 * @returns {Promise<{ status: number | null, signal: string | null, stdout: string, stderr: string, error?: Error & { code?: string } }>}
 */
export function runChild(command, args, { cwd, env, timeout, maxBuffer }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', windowsHide: true });
    const out = { stdout: '', stderr: '' };
    let timedOut = false;
    let timer;

    for (const stream of ['stdout', 'stderr']) {
      child[stream].setEncoding('utf8');
      child[stream].on('data', (chunk) => {
        if (out[stream].length < maxBuffer) out[stream] += chunk;
      });
    }

    if (timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid);
      }, timeout);
    }

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ status: null, signal: null, stdout: out.stdout, stderr: out.stderr, error });
    });
    child.on('close', (status, signal) => {
      clearTimeout(timer);

      if (timedOut) {
        resolve({ status: null, signal: 'SIGTERM', stdout: out.stdout, stderr: out.stderr, error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) });
        return;
      }

      resolve({ status, signal, stdout: out.stdout, stderr: out.stderr });
    });
  });
}

/** Kills a process and every process under it. @es Mata un proceso y todos los que cuelgan de él. */
function killTree(pid) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // already gone @es ya terminó
  }
}
