#!/usr/bin/env node
/**
 * Runs every selftest the repository holds and gives ONE verdict: exit 0 all green, 1 any red, 2 not
 * measured. Each selftest runs in its own process with its own directory as cwd. There is no filter, skip
 * or fail-fast option on purpose: a self-selected subset is not a verdict about the repository, and a
 * selftest that is red at baseline is reported RED, never omitted. To run one selftest, call it with node.
 *
 * Usage: node run.mjs [--root <dir> [--git-dir <dir>]]
 *
 * `--git-dir` names the repository of a tree its code repository ignores (a tooling tree versioned elsewhere,
 * like b100-am-ui's `.claude`); that repository then decides which selftests exist (`discovery.mjs`).
 * @es `--git-dir` nombra el repositorio de un árbol que su repo de código ignora; ese repositorio decide entonces
 * qué selftests existen.
 *
 * Each selftest's GREEN or RED line (and, for a RED one, why) is printed the moment that selftest ends, so a
 * long run is watchable; the summary line comes last. Streaming changes WHEN lines appear, never which lines,
 * their order, or the exit code.
 *
 * ISOLATION BY CONSTRUCTION. Each selftest runs in a private sandbox of its own (`sandbox.mjs`), removed when it
 * ends: `HOME` and `USERPROFILE` are an empty sandbox home, `HOOK_CLAUDE_HOME` its empty `.claude`,
 * `HOOK_STATE_DIR` a fresh state root outside that home, and `TMP`, `TEMP` and `TMPDIR` a private temp directory.
 * THE TREE UNDER TEST is passed explicitly as `SELFTEST_TREE` (the absolute top level `--root` resolves to): a
 * selftest that has to read the tree reads it from there, never through `homedir()`, which now names the
 * sandbox. A project selftest that imports a SHARED fleet module resolves it from `SELFTEST_FLEET`, the fleet
 * that holds this runner, read-only by contract. With `--git-dir`, each selftest also receives it, absolute, as
 * `SELFTEST_GIT_DIR` (absent otherwise), because its tree is ignored by the repository `git rev-parse` would answer.
 * @es Con `--git-dir`, cada selftest recibe además ese directorio, absoluto, como `SELFTEST_GIT_DIR` (ausente si no),
 * porque su árbol lo ignora el repositorio que respondería `git rev-parse`.
 *
 * THE LEAK VERDICT (`sandbox-verdict.mjs`) looks only at what no other process writes: anything left in the
 * sandbox home (a module that bypassed the state seam), anything left in the private temp directory, and any
 * change to the tree's `git status` across the selftest, and, when the tree is a linked worktree, any change to its
 * MAIN checkout's `git status`. Any of them turns the selftest RED whatever its exit,
 * each path named. The real home is not watched, so a live session writing it during a run cannot make the run
 * red. A tree git cannot read stops the run, exit 2: no later selftest could be judged.
 *
 * @es Ejecuta todos los selftests del repositorio y da UN veredicto: 0 todo verde, 1 alguno rojo, 2 no
 * medido. La línea GREEN o RED de cada selftest (y, si es RED, el porqué) se imprime en cuanto ese selftest
 * termina; el resumen va al final. El flujo cambia CUÁNDO aparecen las líneas, nunca cuáles, su orden ni el
 * código de salida. Cada selftest corre en su propio proceso y con su directorio como cwd. No hay opción de
 * filtro, salto ni corte al primer fallo, a propósito: un subconjunto elegido no es un veredicto del
 * repositorio. AISLAMIENTO POR CONSTRUCCIÓN: cada selftest corre en un sandbox privado (`sandbox.mjs`) que se
 * borra al acabar: `HOME` y `USERPROFILE` son un home vacío, `HOOK_CLAUDE_HOME` su `.claude` vacío,
 * `HOOK_STATE_DIR` una raíz de estado nueva fuera de ese home, y `TMP`, `TEMP` y `TMPDIR` un temporal privado.
 * EL ÁRBOL BAJO PRUEBA se pasa explícito en `SELFTEST_TREE` (el nivel superior absoluto de `--root`): un
 * selftest que necesita leer el árbol lo lee de ahí, nunca por `homedir()`. Un selftest de proyecto que importa
 * un módulo COMPARTIDO de la flota lo resuelve desde `SELFTEST_FLEET`, de solo lectura. EL VEREDICTO DE FUGAS
 * (`sandbox-verdict.mjs`) mira solo lo que ningún otro proceso escribe: lo que quede en el home del sandbox, lo
 * que quede en el temporal privado, cualquier cambio del `git status` del árbol y, si el árbol es un worktree
 * enlazado, de su checkout PRINCIPAL; cualquiera pone el selftest
 * ROJO, sea cual sea su salida, con cada ruta. El home real no se vigila, así una sesión viva que lo escriba no
 * puede poner roja la corrida. Un árbol que git no puede leer detiene la corrida con 2.
 */

import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { DiscoveryError, discoverSelftests } from './discovery.mjs';
import { MESSAGES } from './messages.mjs';
import { createSandbox, removeSandbox, sandboxEnv } from './sandbox.mjs';
import { escapesOf } from './sandbox-verdict.mjs';
import { writeLineSync } from './stream.mjs';
import { TreeStatusError, mainCheckoutOf, treeStatus } from './tree-status.mjs';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const EXIT_GREEN = 0;
const EXIT_RED = 1;
const EXIT_NOT_MEASURED = 2;
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

const speaker = makeSpeaker(MESSAGES);

/**
 * Runs one selftest in a sandbox of its own, removed afterwards. Returns why it is red (its exit) and what it
 * left outside its seams; `failure` is null when it exited green. Throws `TreeStatusError` when git cannot
 * read the tree before or after it.
 * @es Ejecuta un selftest en un sandbox propio, que se borra después. Devuelve por qué está rojo (su salida) y
 * lo que dejó fuera de sus costuras; `failure` es null si salió en verde. Lanza `TreeStatusError` si git no
 * puede leer el árbol antes o después.
 */
function runOne({ root, gitDir, entry, timeoutMs, spawn }) {
  const sandbox = createSandbox();

  try {
    const mainCheckout = mainCheckoutOf(root);
    const treeBefore = treeStatus(root);
    const checkoutBefore = mainCheckout === undefined ? undefined : treeStatus(mainCheckout);
    const failure = exitOf({ root, entry, timeoutMs, spawn, env: sandboxEnv(sandbox, { base: process.env, tree: root, gitDir }) });
    const treeAfter = treeStatus(root);
    const checkout = mainCheckout === undefined ? undefined : { top: mainCheckout, before: checkoutBefore, after: treeStatus(mainCheckout) };

    return { failure, escapes: escapesOf({ sandbox, tree: root, treeBefore, treeAfter, checkout }) };
  } finally {
    removeSandbox(sandbox);
  }
}

/**
 * Runs one selftest with `env`. Returns why it is red, or null when it is green.
 * @es Ejecuta un selftest con `env`. Devuelve por qué está rojo, o null si está verde.
 */
function exitOf({ root, entry, timeoutMs, spawn, env }) {
  const file = path.join(root, entry.path);
  try {
    statSync(file);
  } catch {
    return { exit: 'missing', reason: speaker.line('missing'), output: '' };
  }
  const result = spawn(process.execPath, [file], {
    cwd: path.dirname(file),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: OUTPUT_LIMIT_BYTES,
    env,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error?.code === 'ETIMEDOUT') {
    return { exit: 'timeout', reason: speaker.line('timed-out', { seconds: Math.round(timeoutMs / 1000) }), output };
  }
  if (result.error) {
    return { exit: 'error', reason: speaker.line('not-run', { reason: result.error.message }), output };
  }
  if (result.status === 0) return null;
  const signal = result.signal ? speaker.line('killed-by', { signal: result.signal }) : '';
  return { exit: result.status ?? 'signal', reason: signal, output };
}

/** @param {string} text @es Indenta cada línea de la salida del selftest. */
function indent(text) {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => `    ${line}`);
}

/** The report lines of a red selftest after its RED line. @es Las líneas del informe de un selftest rojo tras su línea RED. */
function whyRed({ failure, escapes }) {
  const lines = [];

  if (escapes.length > 0) {
    lines.push(`    ${speaker.line('escaped', { count: escapes.length })}`);
    lines.push(...escapes.map((escape) => `    ${speaker.line(`escape-${escape.area}-${escape.change}`, { path: escape.path })}`));
  }
  if (failure === null) return lines;
  if (failure.reason !== '') lines.push(`    ${failure.reason}`);

  return [...lines, ...indent(failure.output)];
}

/**
 * `spawn` is injectable so a result no host produces on demand (a POSIX signal death) can be fed to the
 * verdict; it defaults to `spawnSync`.
 * @es `spawn` es inyectable para poder alimentar al veredicto un resultado que ningún host produce a
 * demanda (muerte por señal POSIX); por defecto es `spawnSync`.
 * `onLine` receives each report line as it is produced, before the next selftest starts; the returned
 * `report` is the same lines. `notMeasured`, present only with exit 2, is why nothing (more) was measured.
 * @es `onLine` recibe cada línea del informe al producirse, antes de que empiece el siguiente selftest; el
 * `report` devuelto son las mismas líneas. `notMeasured`, solo con salida 2, dice por qué no se midió (más).
 * @param {{ root: string, gitDir?: string, timeoutMs?: number, spawn?: typeof spawnSync, onLine?: (line: string) => void }} options
 * @returns {{ exitCode: number, report: string[], notMeasured?: string }}
 * @es Devuelve el código de salida y las líneas del informe.
 */
export function runSelftests({ root, gitDir, timeoutMs = DEFAULT_TIMEOUT_MS, spawn = spawnSync, onLine = () => {} }) {
  let discovered;
  try {
    discovered = discoverSelftests(root, { gitDir });
  } catch (error) {
    if (!(error instanceof DiscoveryError)) throw error;
    return { exitCode: EXIT_NOT_MEASURED, report: [error.message], notMeasured: error.message };
  }
  if (discovered.entries.length === 0) {
    const nothing = speaker.line('nothing-found', { root: discovered.root });
    return { exitCode: EXIT_NOT_MEASURED, report: [nothing], notMeasured: nothing };
  }

  const report = [];
  const emit = (...lines) => {
    for (const line of lines) {
      report.push(line);
      onLine(line);
    }
  };
  let green = 0;
  for (const entry of discovered.entries) {
    const label = entry.untracked ? ' UNTRACKED' : '';
    let outcome;
    try {
      outcome = runOne({ root: discovered.root, gitDir, entry, timeoutMs, spawn });
    } catch (error) {
      if (!(error instanceof TreeStatusError)) throw error;
      const notMeasured = speaker.line('tree-unreadable', { tree: error.tree, selftest: entry.path, reason: error.reason });
      return { exitCode: EXIT_NOT_MEASURED, report: [...report, notMeasured], notMeasured };
    }
    if (outcome.failure === null && outcome.escapes.length === 0) {
      green += 1;
      emit(`GREEN  ${entry.path} (exit 0)${label}`);
      continue;
    }
    emit(`RED    ${entry.path} (exit ${outcome.failure === null ? 0 : outcome.failure.exit})${label}`, ...whyRed(outcome));
  }
  emit(speaker.line('summary', { green, total: discovered.entries.length }));
  return { exitCode: green === discovered.entries.length ? EXIT_GREEN : EXIT_RED, report };
}

/**
 * Reads the command line: nothing, `--root <dir>`, or `--root <dir> --git-dir <dir>`; anything else is refused,
 * so no filter can exist.
 * @es Lee la línea de órdenes: nada, `--root <dir>` o `--root <dir> --git-dir <dir>`; todo lo demás se rechaza,
 * así no puede existir filtro.
 * @param {string[]} argv
 * @returns {{ root: string, gitDir?: string } | { error: true }}
 */
function parseArgs(argv) {
  if (argv.length === 0) return { root: process.cwd() };
  if (argv.length === 2 && argv[0] === '--root') return { root: argv[1] };
  if (argv.length === 4 && argv[0] === '--root' && argv[2] === '--git-dir') return { root: argv[1], gitDir: argv[3] };
  return { error: true };
}

/**
 * Runs the command line and prints the report; returns the process exit code.
 * @es Ejecuta la línea de órdenes e imprime el informe; devuelve el código de salida del proceso.
 */
function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    speaker.complain('usage');
    return EXIT_NOT_MEASURED;
  }
  const { exitCode, notMeasured } = runSelftests({ root: parsed.root, gitDir: parsed.gitDir, onLine: writeLineSync });
  // Why nothing (more) was measured goes to stderr; the lines already streamed are not repeated.
  // @es Por qué no se midió (más) va a stderr; las líneas ya emitidas no se repiten.
  if (notMeasured !== undefined) speaker.dataError(notMeasured);
  return exitCode;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exitCode = main();
