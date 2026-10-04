#!/usr/bin/env node
/**
 * Kills a process AND every descendant of it, and runs a command under a timeout that does the same.
 *
 * Why a module and not `child.kill()`: that signals only the child. MEASURED on Windows (Node 22): a plain
 * grandchild dies with its parent, because libuv places every spawned tree in a job object that is killed
 * when the owner exits, but a grandchild that BROKE AWAY from the job (a `detached` spawn, which is what a
 * tool that daemonizes does) survives a plain kill and keeps running after its timeout. `taskkill /T /F`
 * walks the tree and ends it either way; on POSIX the unit is the process group, so the child must lead one
 * (`detached`) and the signal goes to the negative pid.
 *
 * `killTree` never throws: a process that is already dead is a normal answer (`already-dead`), not an error,
 * because a timeout and a natural exit race. It refuses ids that must never be signalled: 0 and negatives
 * (a process group or every process), 1 (init), anything fractional, and the caller's own pid.
 *
 * @es Mata un proceso Y todos sus descendientes, y corre un comando bajo un timeout que hace lo mismo.
 * `child.kill()` solo señaliza al hijo. MEDIDO en Windows (Node 22): un nieto normal muere con su padre
 * (libuv mete el árbol en un job object), pero un nieto que SE SALIÓ del job (`detached`, lo que hace una
 * herramienta que se demoniza) sobrevive y sigue corriendo tras el timeout. `taskkill /T /F` recorre el árbol
 * y lo termina en ambos casos; en POSIX la unidad es el grupo de procesos. `killTree` nunca lanza: un proceso
 * ya muerto es una respuesta normal. Rechaza los ids que nunca deben señalizarse: 0, negativos, 1, no enteros
 * y el pid del propio llamador.
 */

import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Every printed line, both languages, in one place. @es Cada línea impresa, en los dos idiomas, en un solo sitio. */
export const MESSAGES = {
  killed: { en: 'Killed process tree {pid} ({count} processes: {pids}).', es: 'Se terminó el árbol de procesos {pid} ({count} procesos: {pids}).' },
  alreadyDead: { en: 'Process {pid} was already dead, nothing to kill.', es: 'El proceso {pid} ya estaba muerto, no hay nada que terminar.' },
  failed: { en: 'FAILED to kill process tree {pid}: {detail}.', es: 'NO se pudo terminar el árbol de procesos {pid}: {detail}.' },
  refused: { en: 'REFUSED: {pid} is not a process id this tool may kill (an integer above 1, not the caller).', es: 'RECHAZADO: {pid} no es un id de proceso válido para terminar (un entero mayor que 1, distinto del llamador).' },
  usage: { en: 'Usage: kill-tree.mjs <pid>.', es: 'Uso: kill-tree.mjs <pid>.' }
};

/** `taskkill` exits with this status when the process does not exist. @es Salida de `taskkill` cuando el proceso no existe. */
const TASKKILL_NOT_FOUND = 128;

/** The exit status of the command line for each outcome. @es La salida de la línea de comandos para cada resultado. */
const EXIT_BY_OUTCOME = { killed: 0, 'already-dead': 0, failed: 1, refused: 2 };

const runTaskkill = (args) => spawnSync('taskkill', args, { encoding: 'utf8', windowsHide: true });
const sendSignal = (target, name) => process.kill(target, name);

/** The first line of a text, trimmed. @es La primera línea de un texto. */
const firstLine = (text) => (text ?? '').split('\n')[0].trim();

/**
 * The pid each line of taskkill's output names FIRST. A line also cites the parent ("child process of PID n"),
 * which was not killed, so only the first number of a line counts; the text is localized but "PID n" is not.
 * @es El pid que nombra PRIMERO cada línea de la salida de taskkill; el padre que cita después no se mató.
 */
function killedPids(output, root) {
  const found = (output ?? '').split('\n').flatMap((line) => [...line.matchAll(/PID (\d+)/g)].slice(0, 1).map((match) => Number(match[1])));

  return found.length > 0 ? found : [root];
}

const failed = (pid, detail) => ({ pid, outcome: 'failed', killed: [], detail });

function killOnWindows(pid, taskkill) {
  const result = taskkill(['/T', '/F', '/PID', String(pid)]);

  if (result.error !== undefined) return failed(pid, result.error.message);
  if (result.status === 0) return { pid, outcome: 'killed', killed: killedPids(result.stdout, pid) };
  if (result.status === TASKKILL_NOT_FOUND) return { pid, outcome: 'already-dead', killed: [] };

  return failed(pid, firstLine(result.stderr) || firstLine(result.stdout));
}

/** The group first (the child leads one), then the lone process; "no such process" twice is already dead. @es Primero el grupo, luego el proceso solo; dos «no existe» es ya muerto. */
function killOnPosix(pid, signal) {
  for (const target of [-pid, pid]) {
    try {
      signal(target, 'SIGKILL');

      return { pid, outcome: 'killed', killed: [pid] };
    } catch (error) {
      if (error.code !== 'ESRCH') return failed(pid, error.message);
    }
  }

  return { pid, outcome: 'already-dead', killed: [] };
}

/**
 * @returns `{ pid, outcome, killed, detail? }` with `outcome` one of `killed`, `already-dead`, `failed`,
 *   `refused`; `killed` lists the pids ended. `deps` injects the platform, the taskkill runner, the signal
 *   sender and the caller's pid, so each branch is provable on any machine.
 * @es Devuelve el informe de lo terminado; `deps` inyecta plataforma, ejecutor de taskkill, envío de señal y pid propio.
 */
export function killTree(pid, { platform = process.platform, taskkill = runTaskkill, signal = sendSignal, ownPid = process.pid } = {}) {
  if (!Number.isInteger(pid) || pid <= 1 || pid === ownPid) return { pid, outcome: 'refused', killed: [] };

  return platform === 'win32' ? killOnWindows(pid, taskkill) : killOnPosix(pid, signal);
}

/**
 * Runs a command, collecting its output, and kills its whole tree when `timeoutMs` passes. Never rejects: a
 * command that cannot start comes back with `error`. A timer that fires after the process already exited
 * (the gap before `close`) kills nothing, because that pid may belong to someone else by then.
 * @returns `{ pid, status, signal, stdout, stderr, timedOut, kill, error }`; `kill` is the `killTree` report.
 * @es Corre un comando y mata todo su árbol al vencer `timeoutMs`. Nunca rechaza. Un timer posterior a la salida no mata nada.
 */
export function runWithTimeout({ command, args = [], timeoutMs, cwd, env, platform = process.platform, spawnProcess = spawn, kill = killTree }) {
  return new Promise((resolve) => {
    const child = spawnProcess(command, args, { cwd, env, detached: platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const result = { pid: child.pid, status: null, signal: null, stdout: '', stderr: '', timedOut: false, kill: undefined, error: undefined };
    let exited = false;

    child.stdout?.setEncoding('utf8').on('data', (chunk) => (result.stdout += chunk));
    child.stderr?.setEncoding('utf8').on('data', (chunk) => (result.stderr += chunk));

    const timer = setTimeout(() => {
      if (exited) return;

      result.timedOut = true;
      result.kill = kill(child.pid);
      child.stdout?.destroy();
      child.stderr?.destroy();
    }, timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      resolve(result);
    };

    child.on('exit', () => (exited = true));
    child.on('error', (error) => {
      result.error = error;
      finish();
    });
    child.on('close', (status, signal) => {
      Object.assign(result, { status, signal });
      finish();
    });
  });
}

/** Prints one message in the house form: English, then `@es` and the Spanish. @es Imprime un mensaje: inglés, luego `@es` y el español. */
function say(out, id, params = {}) {
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, name) => String(params[name]));

  out(`${fill(MESSAGES[id].en)} @es ${fill(MESSAGES[id].es)}`);
}

/**
 * The command line: `kill-tree.mjs <pid>`. Exit 0 when the tree was killed or was already dead, 1 when the kill
 * failed, 2 for a refused id or bad arguments. Only a plain decimal number is an id (`0x10` and `12abc` are not).
 * @es La línea de comandos. Salida 0 si se mató o ya estaba muerto, 1 si falló, 2 si se rechazó el id o los argumentos.
 */
export function run(argv, out = console.log, deps = {}) {
  if (argv.length !== 1) {
    say(out, 'usage');

    return EXIT_BY_OUTCOME.refused;
  }

  const report = killTree(/^\d+$/.test(argv[0]) ? Number(argv[0]) : Number.NaN, deps);

  if (report.outcome === 'killed') say(out, 'killed', { pid: report.pid, count: report.killed.length, pids: report.killed.join(', ') });
  if (report.outcome === 'already-dead') say(out, 'alreadyDead', { pid: report.pid });
  if (report.outcome === 'failed') say(out, 'failed', { pid: report.pid, detail: report.detail });
  if (report.outcome === 'refused') say(out, 'refused', { pid: argv[0] });

  return EXIT_BY_OUTCOME[report.outcome];
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(run(process.argv.slice(2)));
