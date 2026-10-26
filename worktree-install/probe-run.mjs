/**
 * RUNS a probe plan in a worktree's project root and returns its verdict: the red probe, then the green one,
 * each through the project's own runner, each with the probe spec written just before and removed just after.
 *
 * WHAT IT LEAVES BEHIND: nothing it created. The probe file is written only where no file of that name exists,
 * and before each run the entries of the project root and of its `node_modules` (when that is a real
 * directory) are listed; every entry that appears during the run (a `coverage/` report, a `.vite` cache) is
 * removed afterwards. Only what appeared is removed, so nothing that was there before is touched, and a link
 * that appeared is unlinked, never followed.
 *
 * THE EXECUTABLE IS THE PACKAGE'S OWN `bin` SCRIPT, run with this node. Never a `.cmd` shim (Windows refuses to
 * spawn one without a shell), and never a global install: the point is the runner the worktree's tree resolves.
 *
 * A RUN THAT CANNOT START IS NOT A PASS. A missing package, an occupied probe path, a spawn error and a timeout
 * each come back as such, and `classifyProbe` maps them to verdicts that keep the own install.
 *
 * @es EJECUTA un plan de sonda en la raíz de proyecto de un worktree: la sonda roja y luego la verde, por el
 * runner del propio proyecto, escribiendo el spec justo antes y quitándolo justo después. No deja nada que
 * haya creado: se listan las entradas de la raíz y de su `node_modules` real antes de cada corrida y se quita
 * solo lo que apareció (un `coverage/`, una caché `.vite`); un enlace que apareció se desenlaza, nunca se
 * sigue. El ejecutable es el script `bin` del propio paquete, corrido con este node. Una corrida que no puede
 * arrancar no es un aprobado.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { readJsonObject } from '../project-profile/facts.mjs';
import { PROBE_KINDS, probeSource } from './probe-plan.mjs';
import { classifyProbe, PROBE_VERDICT } from './strategy.mjs';

/** How many trailing output lines a verdict keeps as evidence. @es Cuántas líneas finales guarda un veredicto. */
const TAIL_LINES = 12;

/**
 * The absolute path of `name` in `pkg`'s `bin` field, resolved from `projectRoot`'s `node_modules`, or
 * `undefined` when the package or the entry is missing.
 * @es La ruta absoluta del `bin` `name` de `pkg`, o `undefined`.
 */
export function binOf(projectRoot, pkg, name) {
  const packageDir = path.join(projectRoot, 'node_modules', ...pkg.split('/'));
  const manifest = readJsonObject(path.join(packageDir, 'package.json'));
  const bin = manifest?.bin;
  const relative = typeof bin === 'string' ? bin : bin?.[name];

  return typeof relative === 'string' ? path.join(packageDir, relative) : undefined;
}

/** The names in `directory`, or `[]` when it is not a readable real directory. @es Los nombres de `directory`. */
function entriesOf(directory) {
  try {
    return lstatSync(directory).isDirectory() ? readdirSync(directory) : [];
  } catch {
    return [];
  }
}

/** Removes `target` without following it: a link is unlinked, a directory removed recursively. @es Quita `target` sin seguirlo. */
function removeCreated(target) {
  try {
    if (lstatSync(target).isSymbolicLink()) unlinkSync(target);
    else rmSync(target, { recursive: true, force: true });
  } catch {
    /* already gone */
  }
}

/** The directories whose new entries a run cleans up. @es Los directorios cuyas entradas nuevas se limpian. */
const watchedOf = (projectRoot) => [projectRoot, path.join(projectRoot, 'node_modules')];

/** The last lines of a run's output. @es Las últimas líneas de la salida. */
const tailOf = (result) => `${result.stdout ?? ''}\n${result.stderr ?? ''}`.split('\n').filter((line) => line.trim() !== '').slice(-TAIL_LINES);

/**
 * One run of one probe kind. Returns `{ status, signal, error, timedOut, tail }`.
 * @es Una corrida de un tipo de sonda.
 */
function runOnce({ projectRoot, plan, bin, kind, timeoutMs, spawn }) {
  const probeFile = path.join(projectRoot, plan.file);
  const before = watchedOf(projectRoot).map((directory) => new Set(entriesOf(directory)));

  if (existsSync(probeFile)) return { status: null, signal: null, error: 'probe-path-occupied', timedOut: false, tail: [probeFile] };

  try {
    mkdirSync(path.dirname(probeFile), { recursive: true });
    writeFileSync(probeFile, probeSource(plan, kind), 'utf8');

    const result = spawn(process.execPath, [bin, ...plan.args], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      env: { ...process.env, CI: 'true' }
    });
    const timedOut = result.error?.code === 'ETIMEDOUT';

    return {
      status: result.status,
      signal: timedOut ? null : result.signal,
      error: result.error === undefined || timedOut ? undefined : String(result.error.code ?? result.error.message),
      timedOut,
      tail: tailOf(result)
    };
  } finally {
    removeCreated(probeFile);
    watchedOf(projectRoot).forEach((directory, at) => {
      for (const name of entriesOf(directory)) if (!before[at].has(name)) removeCreated(path.join(directory, name));
    });
  }
}

/**
 * The probe's verdict in `projectRoot`: `{ verdict, red, green }`, where `red` and `green` are the two runs.
 *
 * @param options.projectRoot The worktree's project root, whose `node_modules` is the tree under proof.
 * @param options.plan A plan from `probePlanFor` (an `ok: false` plan is the NO_PROBE verdict, run nothing).
 * @param options.timeoutMs The ceiling of each run; reaching it is a TIMEOUT, never a pass.
 * @param options.spawn Injectable `spawnSync`.
 * @es El veredicto de la sonda en `projectRoot`.
 */
export function runProbe({ projectRoot, plan, timeoutMs, spawn = spawnSync }) {
  if (plan?.ok !== true) return { verdict: PROBE_VERDICT.NO_PROBE, reason: plan?.reason };

  const bin = binOf(projectRoot, plan.package, plan.bin);

  if (bin === undefined || !existsSync(bin)) {
    return { verdict: PROBE_VERDICT.COULD_NOT_RUN, reason: `no ${plan.package} bin "${plan.bin}" in this tree` };
  }

  const runs = {};

  for (const kind of PROBE_KINDS) runs[kind] = runOnce({ projectRoot, plan, bin, kind, timeoutMs, spawn });

  return { verdict: classifyProbe(runs.red, runs.green), red: runs.red, green: runs.green };
}
