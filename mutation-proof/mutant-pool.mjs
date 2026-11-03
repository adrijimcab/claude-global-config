#!/usr/bin/env node
/**
 * Runs the mutants of ONE campaign in parallel and writes their raw outcomes; it decides no verdict.
 * `run-mutants.mjs` starts it with `spawnSync`, so `runMutants` stays synchronous for every campaign, and then
 * classifies and prints each outcome in plan order with the same code as a sequential run.
 *
 * WHY A SEPARATE PROCESS: parallel children need an event loop, and `runMutants` is a synchronous API that
 * dozens of campaigns call. Running the pool as its own process keeps that contract unchanged.
 *
 * ISOLATION, the condition for a parallel verdict to mean what a sequential one means: each mutant gets its own
 * sandbox copy (as before) AND its own TEMP/TMP/TMPDIR inside that sandbox, so two selftests can never meet in a
 * shared temporary file. A collision would turn into a red selftest and read as a KILL the selftest never made.
 *
 * TIMEOUT kills the whole process tree (`taskkill /T /F` on Windows, the process group elsewhere): a selftest
 * spawns children, and killing only its node process would leave them running.
 *
 *   node mutant-pool.mjs <job.json>      job: { selftest, fleet, timeoutMs, concurrency, root, snapshot,
 *                                          copied, plans: [{ file, original, replacement }], output,
 *                                          failFast, failureLine }
 *   output (JSON): [{ syntaxError } | { checkFailure } | { run: { status, signal, stdout, stderr, error } }]
 *
 * @es Corre en paralelo los mutantes de UNA campaña y escribe sus resultados crudos; no decide ningún veredicto.
 * @es `run-mutants.mjs` lo arranca con `spawnSync`, así `runMutants` sigue siendo síncrono para todas las campañas,
 * @es y después clasifica e imprime cada resultado en el orden del plan con el mismo código que una corrida
 * @es secuencial. Cada mutante tiene su propia copia y su propio TEMP/TMP/TMPDIR dentro de ella, así dos
 * @es selftests nunca coinciden en un temporal compartido (eso se leería como una muerte que el selftest no
 * @es provocó). El timeout mata el árbol entero de procesos, no solo el node del selftest.
 */
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_OUTPUT = 256 * 1024 * 1024;

const job = JSON.parse(await readFile(process.argv[2], 'utf8'));
const results = new Array(job.plans.length);
let next = 0;
let done = 0;

await Promise.all(Array.from({ length: Math.min(job.concurrency, job.plans.length) }, worker));
await writeFile(job.output, JSON.stringify(results));

async function worker() {
  for (let index = next++; index < job.plans.length; index = next++) {
    results[index] = await measureOne(job.plans[index]);
    done += 1;
    process.stderr.write(`  [${done}/${job.plans.length}] ${job.plans[index].label}\n`);
  }
}

async function measureOne({ file, original, replacement }) {
  const sandbox = await mkdtemp(path.join(job.root, 'mutant-'));

  try {
    for (const needed of job.copied) await cp(path.join(job.snapshot, needed), path.join(sandbox, needed), { recursive: true });

    const target = path.join(sandbox, file);
    const source = await readFile(target, 'utf8');
    const at = source.indexOf(original);

    // The plan proved the text occurs exactly once; slice, never String.prototype.replace ($& and friends).
    // @es El plan probó que el texto aparece una sola vez; se corta, nunca String.prototype.replace ($& y compañía).
    await writeFile(target, source.slice(0, at) + replacement + source.slice(at + original.length));

    const check = await run(process.execPath, ['--check', target], { ...process.env }, 0);

    if (check.status !== 0) {
      const syntaxError = check.stderr.split('\n').map((line) => line.trimEnd()).find((line) => line.startsWith('SyntaxError'));

      return check.status === 1 && syntaxError !== undefined ? { syntaxError } : { checkFailure: `exit ${check.status}, signal ${check.signal}` };
    }

    const temp = path.join(sandbox, '.tmp');

    await mkdir(temp, { recursive: true });

    const env = { ...process.env, SELFTEST_FLEET: job.fleet, TEMP: temp, TMP: temp, TMPDIR: temp };

    return { run: await run(process.execPath, [path.join(sandbox, job.selftest)], env, job.timeoutMs, job.failFast ? new RegExp(job.failureLine) : undefined) };
  } finally {
    await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/**
 * Runs a child to the end, or kills its whole tree at the timeout; never rejects. With `failureLine`, the first
 * complete stdout line that matches it also ends the run: the selftest has just reported a failed check, so the
 * outcome is exit 1 with `stoppedAt` naming that line (`run-mutants.mjs` only passes it when calibrated safe).
 * @es Corre un hijo hasta el final, o mata su árbol al vencer el tiempo; nunca rechaza. Con `failureLine`, la primera
 * línea completa de stdout que la cumple también termina la corrida: el selftest acaba de informar un check fallido,
 * así que el resultado es salida 1 con `stoppedAt` nombrando esa línea.
 */
function run(command, args, env, timeoutMs, failureLine) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, detached: process.platform !== 'win32', windowsHide: true });
    const out = { stdout: '', stderr: '' };
    let signal = null;
    let stoppedAt;
    let scanned = 0;
    let timer;

    for (const stream of ['stdout', 'stderr']) {
      child[stream].setEncoding('utf8');
      child[stream].on('data', (chunk) => {
        if (out[stream].length < MAX_OUTPUT) out[stream] += chunk;
        if (stream !== 'stdout' || failureLine === undefined || stoppedAt !== undefined) return;

        const end = out.stdout.lastIndexOf('\n');

        for (const line of out.stdout.slice(scanned, end + 1).split('\n')) {
          if (failureLine.test(line)) {
            stoppedAt = line.trim();
            killTree(child.pid);
            break;
          }
        }
        scanned = Math.max(scanned, end + 1);
      });
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        signal = 'SIGTERM';
        killTree(child.pid);
      }, timeoutMs);
    }

    child.on('error', (error) => { clearTimeout(timer); resolve({ status: null, signal, stdout: out.stdout, stderr: out.stderr, error: error.message }); });
    child.on('close', (status, closeSignal) => {
      clearTimeout(timer);
      if (stoppedAt !== undefined && signal === null) {
        resolve({ status: 1, signal: null, stdout: out.stdout, stderr: out.stderr, stoppedAt });
        return;
      }
      resolve({ status: signal === null ? status : null, signal: signal ?? closeSignal, stdout: out.stdout, stderr: out.stderr });
    });
  });
}

function killTree(pid) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone @es ya terminó */ }
}
