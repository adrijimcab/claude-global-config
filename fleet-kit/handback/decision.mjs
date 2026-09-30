/**
 * May this worker hand its report back yet? Decided at `PreToolUse` on `SubagentHandback`, BEFORE the
 * report reaches its caller — the handback tool delivers it immediately, so a `SubagentStop` gate would
 * judge a claim the caller has already read and acted on.
 *
 * TWO CHECKS, IN THIS ORDER, and the order is a correctness requirement:
 *   1. UNCOMMITTED WORK refuses. A deliverable that exists only in one directory is invisible to every
 *      integration and destroyed by every cleanup. This half applies in every repository.
 *   2. UNCOVERED CHANGED LINES refuse, where the repository's config says `handback.coverage: "refuse"`.
 *      The grader diffs COMMITTED content, which is why it only runs once check 1 passed: with work still
 *      uncommitted it would grade a stale slice and could read "covered" over the real change. A result
 *      that cannot be graded (exit 2) refuses too, with its reason — an unmeasured change is not a
 *      covered one.
 *
 * THE LOOP BOUND. A worker whose only channel is the handback must never be trapped: after
 * {@link MAXIMUM_REFUSALS} refusals the handback passes, and the journal keeps what was refused. The cost,
 * stated: a worker that ignores three refusals can still report over the problem.
 *
 * WHO THE WORKER IS comes from the harness's own record (`<session>/subagents/agent-<id>.meta.json`),
 * never from the payload's `cwd`, which is wherever the worker last worked.
 *
 * @es ¿Puede este worker entregar ya su informe? Se decide en `PreToolUse` sobre `SubagentHandback`, ANTES
 * de que el informe llegue. DOS COMPROBACIONES, EN ESTE ORDEN: trabajo sin commitear rechaza (en todo
 * repositorio); líneas cambiadas sin cubrir rechazan donde la config lo pide, y solo después de la primera,
 * porque el calificador diffea contenido COMMITEADO. Tras {@link MAXIMUM_REFUSALS} negativas, el handback
 * pasa. Quién es el worker lo dice el registro del harness, nunca el `cwd`.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { findConfig } from '../config/load-config.mjs';
import { runDiffCoverage } from '../diff-coverage/diff-coverage.mjs';
import { gitAsker, porcelainEntries } from '../lib/git.mjs';

export const HANDBACK_TOOL = 'SubagentHandback';
export const MAXIMUM_REFUSALS = 3;

/**
 * The worktree the harness recorded for this worker, or `undefined` when it has none.
 * @es El worktree que el harness registró para este worker, o `undefined`.
 */
export function registeredWorktree(payload) {
  const transcript = payload?.transcript_path;
  const session = payload?.session_id;
  const agentId = payload?.agent_id;

  if (![transcript, session, agentId].every((value) => typeof value === 'string' && value.length > 0)) return undefined;

  const meta = path.join(path.dirname(transcript), session, 'subagents', `agent-${agentId}.meta.json`);

  if (!existsSync(meta)) return undefined;

  const worktreePath = JSON.parse(readFileSync(meta, 'utf8'))?.worktreePath;

  return typeof worktreePath === 'string' && worktreePath.length > 0 ? worktreePath : undefined;
}

/**
 * The refusal this handback earns, as `{ kind, detail, worktree }`, or `undefined` when it passes.
 * @param dependencies `{ worktreeOf, refusalsSoFar, runCoverage }`, injectable for the selftest.
 * @es La negativa que merece este handback, o `undefined` si pasa.
 */
export function handbackRefusal(payload, { worktreeOf = registeredWorktree, refusalsSoFar = () => 0, runCoverage = runDiffCoverage } = {}) {
  if (payload?.tool_name !== HANDBACK_TOOL) return undefined;

  const worktree = worktreeOf(payload);
  const governed = worktree === undefined || !existsSync(worktree) ? undefined : findConfig(worktree);

  if (governed === undefined || refusalsSoFar(payload.agent_id) >= MAXIMUM_REFUSALS) return undefined;

  const entries = porcelainEntries(gitAsker(worktree));

  if (entries.length > 0) return { kind: 'uncommitted', detail: entries.slice(0, 20).join('\n'), worktree };
  if (governed.config.handback.coverage !== 'refuse') return undefined;

  const coverage = runCoverage({ worktree, base: governed.config.integrationBranches[0] });

  return coverage.exitCode === 0 ? undefined : { kind: coverage.exitCode === 1 ? 'uncovered' : 'ungradable', detail: coverage.message, worktree };
}
