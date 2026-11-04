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
 * IN PARALLEL (`parallel-mandate.md`). The selftests run at once through a bounded pool: `SELFTEST_CONCURRENCY` when
 * it is a whole number of at least 1, else `min(8, cores - 2)`, at least 1. Each selftest's GREEN or RED line (and,
 * for a RED one, why) is printed as soon as it and every selftest listed before it have ended, so the report keeps
 * the discovery order whatever finishes first; the summary line comes last. Streaming changes WHEN lines appear,
 * never which lines, their order, or the exit code.
 * @es EN PARALELO: los selftests corren a la vez con un pool acotado (`SELFTEST_CONCURRENCY` si es un entero de al
 * menos 1; si no, `min(8, núcleos - 2)`, mínimo 1). La línea de cada uno se imprime cuando terminaron él y todos los
 * anteriores, así el informe conserva el orden de descubrimiento; el resumen va al final.
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
 * change to the tree's `git status`, and, when the tree is a linked worktree, any change to its MAIN checkout's
 * `git status`. Home and temp are each selftest's own, so they are judged per selftest. The tree is SHARED: with a
 * concurrency of 1 it is read around each selftest, as before; in parallel it is read once around the whole batch,
 * because a write by one selftest would show in the readings of every selftest running beside it. A change there
 * turns the run RED with every path named and says to run with `SELFTEST_CONCURRENCY=1` to name the selftest. The
 * real home is not watched, so a live session writing it during a run cannot make the run red. A tree git cannot
 * read stops the run, exit 2: no later selftest could be judged.
 *
 * @es Ejecuta todos los selftests del repositorio y da UN veredicto: 0 todo verde, 1 alguno rojo, 2 no
 * medido. Cada selftest corre en su propio proceso y con su directorio como cwd. No hay opción de
 * filtro, salto ni corte al primer fallo, a propósito: un subconjunto elegido no es un veredicto del
 * repositorio. AISLAMIENTO POR CONSTRUCCIÓN: cada selftest corre en un sandbox privado (`sandbox.mjs`) que se
 * borra al acabar: `HOME` y `USERPROFILE` son un home vacío, `HOOK_CLAUDE_HOME` su `.claude` vacío,
 * `HOOK_STATE_DIR` una raíz de estado nueva fuera de ese home, y `TMP`, `TEMP` y `TMPDIR` un temporal privado.
 * EL ÁRBOL BAJO PRUEBA se pasa explícito en `SELFTEST_TREE` (el nivel superior absoluto de `--root`): un
 * selftest que necesita leer el árbol lo lee de ahí, nunca por `homedir()`. Un selftest de proyecto que importa
 * un módulo COMPARTIDO de la flota lo resuelve desde `SELFTEST_FLEET`, de solo lectura. EL VEREDICTO DE FUGAS
 * (`sandbox-verdict.mjs`) mira solo lo que ningún otro proceso escribe: el home y el temporal de cada selftest, que
 * son suyos y se juzgan por selftest, y el `git status` del árbol y de su checkout PRINCIPAL, que es COMPARTIDO: con
 * concurrencia 1 se lee alrededor de cada selftest; en paralelo, una vez alrededor de toda la tanda, porque lo que
 * escribe uno aparecería en las lecturas de los que corren a su lado. Un cambio ahí pone la corrida ROJA con cada
 * ruta y dice que se corra con `SELFTEST_CONCURRENCY=1` para nombrar al selftest. El home real no se vigila. Un árbol
 * que git no puede leer detiene la corrida con 2.
 */

import { statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { runChild } from './child-run.mjs';
import { DiscoveryError, discoverSelftests } from './discovery.mjs';
import { MESSAGES } from './messages.mjs';
import { createSandbox, removeSandbox, sandboxEnv } from './sandbox.mjs';
import { escapesOf, sandboxEscapes, treeEscapes } from './sandbox-verdict.mjs';
import { writeLineSync } from './stream.mjs';
import { TreeStatusError, mainCheckoutOf, treeStatus } from './tree-status.mjs';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const EXIT_GREEN = 0;
const EXIT_RED = 1;
const EXIT_NOT_MEASURED = 2;
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

/** The variable that sets how many selftests run at once. @es La variable que fija cuántos selftests corren a la vez. */
export const CONCURRENCY_VARIABLE = 'SELFTEST_CONCURRENCY';

/** The most selftests the default runs at once. @es El máximo de selftests a la vez por defecto. */
const DEFAULT_CONCURRENCY_CAP = 8;

/** The cores the default leaves to the rest of the machine. @es Los núcleos que el valor por defecto deja libres. */
const CORES_LEFT_FREE = 2;

/** What a batch-level stop names instead of one selftest. @es Lo que nombra una parada de tanda en vez de un selftest. */
const PARALLEL_BATCH = '(parallel batch)';

const speaker = makeSpeaker(MESSAGES);

/**
 * How many selftests run at once: `SELFTEST_CONCURRENCY` when it is a whole number of at least 1, else
 * `min(8, cores - 2)`, at least 1.
 * @es Cuántos selftests corren a la vez: `SELFTEST_CONCURRENCY` si es un entero de al menos 1; si no,
 * `min(8, núcleos - 2)`, mínimo 1.
 */
export function concurrencyOf(env = process.env, cores = availableParallelism()) {
  const requested = Number(env[CONCURRENCY_VARIABLE]);

  if (Number.isInteger(requested) && requested >= 1) return requested;

  return Math.max(1, Math.min(DEFAULT_CONCURRENCY_CAP, cores - CORES_LEFT_FREE));
}

/**
 * Runs one selftest in a sandbox of its own, removed afterwards. Returns why it is red (its exit) and what it
 * left outside its seams; `failure` is null when it exited green. With `watchTree` (a concurrency of 1) the tree
 * and its main checkout are read around it; without it only its own sandbox is judged here. Throws
 * `TreeStatusError` when git cannot read the tree before or after it.
 * @es Ejecuta un selftest en un sandbox propio, que se borra después. Devuelve por qué está rojo y lo que dejó
 * fuera de sus costuras. Con `watchTree` (concurrencia 1) el árbol y su checkout principal se leen alrededor de él;
 * sin él, aquí solo se juzga su propio sandbox. Lanza `TreeStatusError` si git no puede leer el árbol.
 */
async function runOne({ root, gitDir, entry, timeoutMs, spawn, watchTree }) {
  const sandbox = createSandbox();

  try {
    const env = sandboxEnv(sandbox, { base: process.env, tree: root, gitDir });

    if (!watchTree) return { failure: await exitOf({ root, entry, timeoutMs, spawn, env }), escapes: sandboxEscapes(sandbox) };

    const mainCheckout = mainCheckoutOf(root);
    const treeBefore = treeStatus(root);
    const checkoutBefore = mainCheckout === undefined ? undefined : treeStatus(mainCheckout);
    const failure = await exitOf({ root, entry, timeoutMs, spawn, env });
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
async function exitOf({ root, entry, timeoutMs, spawn, env }) {
  const file = path.join(root, entry.path);
  try {
    statSync(file);
  } catch {
    return { exit: 'missing', reason: speaker.line('missing'), output: '' };
  }
  const result = await spawn(process.execPath, [file], {
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

/** The lines that name each escape. @es Las líneas que nombran cada fuga. */
function escapeLines(escapes) {
  return escapes.map((escape) => `    ${speaker.line(`escape-${escape.area}-${escape.change}`, { path: escape.path })}`);
}

/** The report lines of a red selftest after its RED line. @es Las líneas del informe de un selftest rojo tras su línea RED. */
function whyRed({ failure, escapes }) {
  const lines = [];

  if (escapes.length > 0) {
    lines.push(`    ${speaker.line('escaped', { count: escapes.length })}`);
    lines.push(...escapeLines(escapes));
  }
  if (failure === null) return lines;
  if (failure.reason !== '') lines.push(`    ${failure.reason}`);

  return [...lines, ...indent(failure.output)];
}

/**
 * The tree and its main checkout read once, for the batch of a parallel run. Throws `TreeStatusError` when git
 * cannot read either.
 * @es El árbol y su checkout principal leídos una vez, para la tanda de una corrida paralela.
 */
function treeReading(root) {
  const mainCheckout = mainCheckoutOf(root);

  return { mainCheckout, tree: treeStatus(root), checkout: mainCheckout === undefined ? undefined : treeStatus(mainCheckout) };
}

/** The tree changes between two batch readings. @es Los cambios del árbol entre dos lecturas de la tanda. */
function batchEscapes(root, before, after) {
  const checkout = before.mainCheckout === undefined ? undefined : { top: before.mainCheckout, before: before.checkout, after: after.checkout };

  return treeEscapes({ tree: root, treeBefore: before.tree, treeAfter: after.tree, checkout });
}

/**
 * `spawn` is injectable so a result no host produces on demand (a POSIX signal death) can be fed to the
 * verdict; it may answer synchronously or with a promise, and defaults to `runChild` (`child-run.mjs`).
 * @es `spawn` es inyectable para poder alimentar al veredicto un resultado que ningún host produce a
 * demanda; puede responder directo o con una promesa, y por defecto es `runChild`.
 * `onLine` receives each report line as it is produced, in report order; the returned `report` is the same
 * lines. `notMeasured`, present only with exit 2, is why nothing (more) was measured. `concurrency` defaults to
 * `concurrencyOf()`.
 * @es `onLine` recibe cada línea del informe al producirse, en el orden del informe; el `report` devuelto son las
 * mismas líneas. `notMeasured`, solo con salida 2, dice por qué no se midió (más). `concurrency` por defecto es
 * `concurrencyOf()`.
 * @param {{ root: string, gitDir?: string, timeoutMs?: number, spawn?: Function, onLine?: (line: string) => void, concurrency?: number }} options
 * @returns {Promise<{ exitCode: number, report: string[], notMeasured?: string }>}
 * @es Devuelve el código de salida y las líneas del informe.
 */
export async function runSelftests({ root, gitDir, timeoutMs = DEFAULT_TIMEOUT_MS, spawn = runChild, onLine = () => {}, concurrency = concurrencyOf() }) {
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
  const stopped = (tree, selftest, reason) => {
    const notMeasured = speaker.line('tree-unreadable', { tree, selftest, reason });
    return { exitCode: EXIT_NOT_MEASURED, report: [...report, notMeasured], notMeasured };
  };
  // The tree is shared state: read around each selftest only when they run one at a time (see the header).
  // @es El árbol es estado compartido: se lee alrededor de cada selftest solo cuando corren de a uno.
  const watchTree = concurrency === 1;
  let batchBefore;

  if (!watchTree) {
    try {
      batchBefore = treeReading(discovered.root);
    } catch (error) {
      if (!(error instanceof TreeStatusError)) throw error;
      return stopped(error.tree, PARALLEL_BATCH, error.reason);
    }
  }

  const outcomes = new Array(discovered.entries.length);
  let next = 0;
  let reported = 0;
  let green = 0;
  let unreadable;
  // Prints every outcome whose predecessors are all printed, so the report keeps the discovery order.
  // @es Imprime cada resultado cuyos anteriores ya se imprimieron, así el informe conserva el orden.
  const flush = () => {
    while (reported < outcomes.length && outcomes[reported] !== undefined) {
      const entry = discovered.entries[reported];
      const outcome = outcomes[reported];
      const label = entry.untracked ? ' UNTRACKED' : '';
      reported += 1;
      if (outcome.failure === null && outcome.escapes.length === 0) {
        green += 1;
        emit(`GREEN  ${entry.path} (exit 0)${label}`);
        continue;
      }
      emit(`RED    ${entry.path} (exit ${outcome.failure === null ? 0 : outcome.failure.exit})${label}`, ...whyRed(outcome));
    }
  };
  const worker = async () => {
    for (let index = next++; index < discovered.entries.length && unreadable === undefined; index = next++) {
      const entry = discovered.entries[index];
      try {
        outcomes[index] = await runOne({ root: discovered.root, gitDir, entry, timeoutMs, spawn, watchTree });
      } catch (error) {
        if (!(error instanceof TreeStatusError)) throw error;
        unreadable ??= { error, entry };
        return;
      }
      if (unreadable === undefined) flush();
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, discovered.entries.length) }, worker));

  if (unreadable !== undefined) return stopped(unreadable.error.tree, unreadable.entry.path, unreadable.error.reason);

  let leaked = [];

  if (!watchTree) {
    try {
      leaked = batchEscapes(discovered.root, batchBefore, treeReading(discovered.root));
    } catch (error) {
      if (!(error instanceof TreeStatusError)) throw error;
      return stopped(error.tree, PARALLEL_BATCH, error.reason);
    }
    if (leaked.length > 0) emit(`RED    ${speaker.line('batch-escaped', { count: leaked.length })}`, ...escapeLines(leaked));
  }

  emit(speaker.line('summary', { green, total: discovered.entries.length }));
  return { exitCode: green === discovered.entries.length && leaked.length === 0 ? EXIT_GREEN : EXIT_RED, report };
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
 * Runs the command line and prints the report; resolves the process exit code.
 * @es Ejecuta la línea de órdenes e imprime el informe; resuelve el código de salida del proceso.
 */
async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    speaker.complain('usage');
    return EXIT_NOT_MEASURED;
  }
  const { exitCode, notMeasured } = await runSelftests({ root: parsed.root, gitDir: parsed.gitDir, onLine: writeLineSync });
  // Why nothing (more) was measured goes to stderr; the lines already streamed are not repeated.
  // @es Por qué no se midió (más) va a stderr; las líneas ya emitidas no se repiten.
  if (notMeasured !== undefined) speaker.dataError(notMeasured);
  return exitCode;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exitCode = await main();
