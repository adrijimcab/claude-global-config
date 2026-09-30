/**
 * WHERE the worker a brief reaches will run: the main checkout, or a linked worktree of it.
 *
 * Two of this guard's three faces depend on it and on nothing else — creating a worktree, or using a
 * relative path to gitignored tooling, is perfectly feasible in the main checkout and infeasible in a
 * linked worktree — so the answer is its own module, and every source of it is named in the result.
 *
 * THE SOURCES, each measured:
 * - A delegation (`Agent`/`Task`) carries `tool_input.isolation`; 210 of the 387 delegations in session
 *   c45d798b carry `"worktree"`, the rest carry no such field.
 * - A resume (`SendMessage`) carries `tool_input.to`, the recipient's raw agent id. The harness writes
 *   `<dirname(transcript_path)>/<session_id>/subagents/agent-<id>.meta.json`, whose `worktreePath` names
 *   the recipient's worktree (128 of that session's 266 metas carry it). A meta may instead carry a
 *   `cwd` inside `.claude/worktrees/` with no `worktreePath` (agent a30ec848, whose worktree was
 *   created by its parent), which locates the recipient just as well. `transcript_path` is the MAIN
 *   session's transcript even when a subagent sends (captured SendMessage payload, sent by an agent).
 * - Either surface may carry a `TENANCY:` heading line naming `.claude/worktrees/…`.
 * A resume addressed by NAME has no meta to read; unless its TENANCY line says otherwise, the worker is
 * treated as unlocated and the worktree faces stay silent — fail open, stated.
 *
 * THE MAIN CHECKOUT is the hook's `cwd` (or the process's, which the harness sets to the same directory)
 * with any `/.claude/worktrees/…` tail removed, so a guard firing inside a worker still names the
 * checkout that owns the gitignored tooling.
 *
 * @es DÓNDE correrá el worker: el checkout principal o un worktree enlazado. Fuentes medidas: `isolation`
 * en una delegación, el meta del harness del destinatario de un `SendMessage` (su `worktreePath`), y una
 * línea `TENANCY:` que nombre `.claude/worktrees/…`. Un resume dirigido por NOMBRE queda sin ubicar y las
 * caras de worktree callan: falla abierto, declarado. El checkout principal es el `cwd` sin la cola
 * `/.claude/worktrees/…`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const WORKTREES_SEGMENT = '/.claude/worktrees/';
const TENANCY_WORD = 'TENANCY';

/** A path with forward slashes, for comparisons that must not depend on the platform's separator. @es Una ruta con barras normales. */
const forward = (path) => path.split('\\').join('/');

/** The main checkout that owns `cwd`. @es El checkout principal dueño de `cwd`. */
export function mainCheckoutOf(cwd) {
  const at = forward(cwd).indexOf(WORKTREES_SEGMENT);

  return at === -1 ? cwd : cwd.slice(0, at);
}

/** The first `TENANCY:` heading line that names a linked worktree, or `undefined`. @es La primera línea TENANCY que nombra un worktree. */
function tenancyWorktreeLine(text) {
  return text.split('\n').find((line) => {
    const trimmed = line.trim();

    return trimmed.startsWith(TENANCY_WORD) && trimmed.includes(':') && forward(trimmed).includes('.claude/worktrees/');
  });
}

/**
 * The recipient's worktree according to the harness meta — its `worktreePath`, else a `cwd` inside a
 * linked worktree — or `undefined`.
 * @es El worktree del destinatario según el meta del harness: `worktreePath`, o un `cwd` dentro de un worktree.
 */
function recipientWorktree(payload) {
  const to = payload?.tool_input?.to;
  const transcript = payload?.transcript_path;
  const session = payload?.session_id;

  if (typeof to !== 'string' || typeof transcript !== 'string' || typeof session !== 'string') return undefined;

  try {
    const meta = JSON.parse(readFileSync(join(dirname(transcript), session, 'subagents', `agent-${to}.meta.json`), 'utf8'));

    if (typeof meta?.worktreePath === 'string' && meta.worktreePath.length > 0) return meta.worktreePath;

    return typeof meta?.cwd === 'string' && forward(meta.cwd).includes(WORKTREES_SEGMENT) ? meta.cwd : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `{ mainCheckout, linkedWorktree, evidence }` for the worker `payload` reaches with `text`.
 * `evidence` says in words how the location was established, for the refusal to quote.
 * @es Dónde corre el worker, con la evidencia en palabras para que la cite el rechazo.
 */
export function workerLocation(payload, text, processCwd = process.cwd()) {
  const cwd = typeof payload?.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : processCwd;
  const mainCheckout = mainCheckoutOf(cwd);

  if (payload?.tool_input?.isolation === 'worktree') return { mainCheckout, linkedWorktree: true, evidence: 'the delegation sets isolation: "worktree"' };

  const worktree = recipientWorktree(payload);

  if (worktree !== undefined) return { mainCheckout, linkedWorktree: true, evidence: `agent ${payload.tool_input.to} runs in ${worktree}` };

  const tenancy = tenancyWorktreeLine(text);

  if (tenancy !== undefined) return { mainCheckout, linkedWorktree: true, evidence: `the brief's TENANCY line names a linked worktree: ${tenancy.trim()}` };

  return { mainCheckout, linkedWorktree: false, evidence: 'no isolation, no recipient worktree, no TENANCY worktree' };
}
