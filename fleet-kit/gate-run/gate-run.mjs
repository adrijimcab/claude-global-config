#!/usr/bin/env node
/**
 * gate-run — runs the repository's declared unit suite on a CLEAN tree and records the verdict for that
 * exact tree, so the landing guard can later ask "did a complete, green unit-suite run grade the tree
 * this branch is about to point at?"
 *
 *   node ~/.claude/fleet-kit/gate-run/gate-run.mjs [--worktree <dir>]
 *
 * Exit: 0 green · 1 red · 2 no verdict (no config, suite disabled, dirty tree, lock held, the run moved
 * HEAD or changed the tree, npm not found).
 *
 * WHY CLEAN ONLY. A verdict is keyed by `HEAD^{tree}`. A dirty tree is not that tree, and hashing a dirty
 * tree into a synthetic one would grade bytes no commit holds. So a dirty tree earns no verdict, and a run
 * that leaves the tree dirty or moves HEAD is recorded as an ERROR rather than green: what it graded is no
 * longer what the verdict would name.
 *
 * @es gate-run — corre la suite unitaria declarada sobre un árbol LIMPIO y registra el veredicto de ese
 * árbol exacto. Solo árboles limpios: un árbol sucio no es `HEAD^{tree}`. Una corrida que ensucia el árbol
 * o mueve HEAD queda como ERROR, nunca verde.
 */

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';

import { findConfig } from '../config/load-config.mjs';
import { isDisabled } from '../config/validate.mjs';
import { gitAsker, mustAsk, porcelainEntries } from '../lib/git.mjs';
import { runWhenMain } from '../lib/hook-io.mjs';
import { repositoryStateDir } from '../lib/state.mjs';
import { releaseLock, takeLock } from './run-lock.mjs';
import { STATES, suiteIdentity, writeVerdict } from './verdicts.mjs';

export const EXIT = Object.freeze({ GREEN: 0, RED: 1, NO_VERDICT: 2 });

/** The CLI exit for each recorded state. @es La salida del CLI para cada estado registrado. */
const EXIT_OF_STATE = Object.freeze({ [STATES.GREEN]: EXIT.GREEN, [STATES.RED]: EXIT.RED, [STATES.ERROR]: EXIT.NO_VERDICT });

/** npm's own CLI script beside this node binary: spawned with `process.execPath`, never a `.cmd` shim. @es El CLI de npm junto a este node. */
export const npmCliPath = () => path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

/**
 * Runs `npm run <script>` in `cwd`, streaming output to `logFile`.
 * @returns the exit status, or `null` when the process could not run or was killed.
 * @es Corre `npm run <script>` en `cwd`, volcando la salida a `logFile`.
 */
export function runNpmScript({ cwd, script, logFile }) {
  const cli = npmCliPath();

  if (!existsSync(cli)) throw new Error(`npm CLI not found at ${cli}`);

  const log = openSync(logFile, 'w');

  try {
    const result = spawnSync(process.execPath, [cli, 'run', script], { cwd, stdio: ['ignore', log, log], windowsHide: true });

    return result.error === undefined && result.signal === null ? result.status : null;
  } finally {
    closeSync(log);
  }
}

/**
 * Why a finished run cannot vouch for the tree it started on, or `undefined` when it can.
 * @es Por qué una corrida terminada no puede avalar el árbol en que empezó, o `undefined`.
 */
export function integrityProblem({ commit, headAfter, entriesAfter, exitCode }) {
  if (headAfter !== commit) return `HEAD moved during the run (${commit} -> ${headAfter})`;
  if (entriesAfter.length > 0) return `the run left ${entriesAfter.length} porcelain entr${entriesAfter.length === 1 ? 'y' : 'ies'} in the tree`;
  if (exitCode === null) return 'the suite process did not exit on its own';

  return undefined;
}

/** The recorded state: an integrity problem is an ERROR whatever the exit code said. @es El estado registrado. */
export function stateOf(reason, exitCode) {
  if (reason !== undefined) return STATES.ERROR;

  return exitCode === 0 ? STATES.GREEN : STATES.RED;
}

/**
 * The whole decision for one worktree. Every side effect is injectable so the selftest drives every
 * state on constructed repositories.
 * @returns `{ exitCode, message, verdict? }`.
 * @es La decisión completa para un worktree.
 */
export function gateRun(worktree, { runSuite = runNpmScript, stateRoot, now = () => new Date() } = {}) {
  const found = findConfig(worktree);

  if (found === undefined) return { exitCode: EXIT.NO_VERDICT, message: `gate-run: no .claude/fleet-kit.json governs ${worktree}` };

  const { config, repository } = found;

  if (isDisabled(config.unitSuite)) return { exitCode: EXIT.NO_VERDICT, message: `gate-run: the unit suite is disabled for this repository — ${config.unitSuite.reason}` };

  const ask = gitAsker(repository.top);
  const before = porcelainEntries(ask);

  if (before.length > 0) return { exitCode: EXIT.NO_VERDICT, message: `gate-run: refused — the tree has ${before.length} porcelain entr${before.length === 1 ? 'y' : 'ies'}; a verdict must describe HEAD^{tree} exactly` };

  const stateDir = repositoryStateDir(repository.mainCheckout, stateRoot);
  const runId = `run-${now().getTime()}-${process.pid}`;
  const lockFile = path.join(stateDir, 'run.lock');
  const lock = takeLock(lockFile, runId);

  if (!lock.taken) return { exitCode: EXIT.NO_VERDICT, message: `gate-run: another run holds this repository (${JSON.stringify(lock.holder)})` };

  try {
    const commit = mustAsk(ask, 'rev-parse', 'HEAD');
    const tree = mustAsk(ask, 'rev-parse', 'HEAD^{tree}');
    const runDir = path.join(stateDir, 'runs', runId);
    const logFile = path.join(runDir, 'output.log');
    const startedAt = now().toISOString();

    mkdirSync(runDir, { recursive: true });

    const exitCode = runSuite({ cwd: path.join(repository.top, config.unitSuite.cwd), script: config.unitSuite.npmScript, logFile });
    const reason = integrityProblem({ commit, headAfter: mustAsk(ask, 'rev-parse', 'HEAD'), entriesAfter: porcelainEntries(ask), exitCode });
    const state = stateOf(reason, exitCode);
    const verdict = { tree, commit, suite: suiteIdentity(config.unitSuite), state, exitCode, ...(reason === undefined ? {} : { reason }), runId, startedAt, finishedAt: now().toISOString(), log: logFile, worktree: repository.top };
    const file = writeVerdict(repository.mainCheckout, verdict, stateRoot);
    return { exitCode: EXIT_OF_STATE[state], message: `gate-run: ${state.toUpperCase()} for tree ${tree} (commit ${commit}) — ${verdict.suite}, exit ${String(exitCode)}${reason === undefined ? '' : `; ${reason}`}\n  verdict: ${file}\n  log:     ${logFile}`, verdict };
  } finally {
    releaseLock(lockFile, runId);
  }
}

function main() {
  const flag = process.argv.indexOf('--worktree');
  const worktree = path.resolve(flag === -1 ? process.cwd() : process.argv[flag + 1] ?? '');

  try {
    const { exitCode, message } = gateRun(worktree);

    process.stdout.write(`${message}\n`);
    process.exitCode = exitCode;
  } catch (error) {
    process.stdout.write(`gate-run: malfunction, no verdict — ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = EXIT.NO_VERDICT;
  }
}

runWhenMain(import.meta.url, main);
