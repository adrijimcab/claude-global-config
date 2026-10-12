/**
 * Reaps the processes of a CLOSED agent. Closing an agent leaves behind what it started: polling loops
 * (`until [ -f ... ]; do sleep 15; done`), watchers, servers. Session b100-am-ui-f8 measured loops alive 18 h
 * after their worker ended and three `watch-branches.sh` alive since the day their worktree was removed. This
 * module finds every process whose command line names the agent's worktree, its id or its scratch directory,
 * whatever its executable (bash, sh, node, cmd, powershell), kills each tree, and reports what it killed.
 *
 * What it will not do, each one a decision proven by `reaper.selftest.mjs`:
 *   - touch this process or any ancestor of it, even when its command line names the agent: `land.mjs` is run
 *     with `--worktree <dir>`, so the shell that runs it names the worktree it is about to reap;
 *   - touch another worktree, another agent or another session: the match has a boundary on both sides, and a
 *     blank name or a too-short id is no marker;
 *   - reap a main checkout: only a linked worktree, or a path that is already gone (`linked-worktree.mjs`);
 *   - kill twice: only the roots of the matched trees are killed, the rest die with them;
 *   - claim a kill it did not measure: a second listing says who is still alive, and a pid that now belongs to
 *     another program (its command line changed) is not a survivor.
 *
 * Entry point for other tools (`b100-am-ui/.claude/integrate/integrate.mjs --close`, `land.mjs`, the
 * SubagentStop hook): `reapAgentProcesses({ worktree, agentId, scratch }, deps?)`.
 *
 * @es Siega los procesos de un agente CERRADO. Cerrar un agente deja lo que arrancó: bucles de espera, watchers,
 * servidores. La sesión b100-am-ui-f8 midió bucles vivos 18 h después de acabar su worker y tres
 * `watch-branches.sh` vivos desde el día en que se retiró su worktree. Este módulo halla todo proceso cuya línea
 * de comandos nombra el worktree, el id o el scratch del agente, sea cual sea su ejecutable, mata cada árbol e
 * informa de lo que mató. No toca este proceso ni sus ancestros (`land.mjs` se corre con `--worktree <dir>`, así
 * que el shell que lo lanza nombra el worktree que va a segar); no toca otro worktree, agente ni sesión (límite
 * a ambos lados; un nombre en blanco o un id corto no es marcador); no siega un checkout principal; no mata dos
 * veces (solo las raíces); y no afirma un kill que no midió (un segundo listado dice quién sigue vivo).
 */

import { listProcesses } from '../worker-status/processes.mjs';
import { killTree } from '../process-control/kill-tree.mjs';
import { isReapableWorktree } from './linked-worktree.mjs';
import { speaker } from './messages.mjs';
import { markersOf, namesAny } from './ownership.mjs';
import { descendantsOf, lineageOf, rootsOf } from './process-tree.mjs';

/** How much of a command line a report line shows. @es Cuánto de una línea de comandos muestra una línea del informe. */
const COMMAND_LIMIT = 120;

const shown = ({ pid, commandLine }) => ({ pid, command: commandLine.length <= COMMAND_LIMIT ? commandLine : `${commandLine.slice(0, COMMAND_LIMIT)}…` });
const byPid = (left, right) => left.pid - right.pid;

/** Kills one tree with the shared killer; true unless it failed or refused. @es Mata un árbol con el ejecutor compartido. */
const killWithSharedKiller = (pid) => !['failed', 'refused'].includes(killTree(pid).outcome);

/**
 * @param {{ worktree?: string, agentId?: string, scratch?: string }} ownership what names the agent
 * @param {{ list?: () => Array<{ pid: number, parentPid?: number, commandLine: string }>, kill?: (pid: number) => boolean, selfPid?: number }} [deps]
 *   injected for proofs: the process listing, the tree killer, and the pid whose lineage is protected
 * @returns {{ refused?: string, matched: object[], protected: object[], killed: object[], survivors: object[], lines: string[] }}
 * @es Devuelve lo hallado, lo protegido, lo muerto, los supervivientes y las líneas bilingües del informe.
 */
export function reapAgentProcesses({ worktree, agentId, scratch } = {}, { list = listProcesses, kill = killWithSharedKiller, selfPid = process.pid } = {}) {
  const empty = { matched: [], protected: [], killed: [], survivors: [] };
  const markers = markersOf({ worktree, agentId, scratch });

  if (markers.length === 0) return { ...empty, refused: 'no-markers', lines: [speaker.line('no-markers')] };
  if (typeof worktree === 'string' && worktree.trim() !== '' && !isReapableWorktree(worktree)) {
    return { ...empty, refused: 'not-a-linked-worktree', lines: [speaker.line('not-a-linked-worktree', { path: worktree })] };
  }

  const rows = list();
  const own = lineageOf(rows, selfPid);
  const named = rows.filter((entry) => namesAny(markers, entry.commandLine));
  const left = named.filter((entry) => own.has(entry.pid));
  const matched = named.filter((entry) => !own.has(entry.pid));
  const roots = rootsOf(rows, matched);

  for (const root of roots) kill(root.pid, rows);

  const tracked = new Map(matched.map((entry) => [entry.pid, entry]));
  for (const root of roots) for (const below of descendantsOf(rows, root.pid)) tracked.set(below.pid, below);

  const after = list();
  const stillAlive = (entry) => after.some((candidate) => candidate.pid === entry.pid && candidate.commandLine === entry.commandLine);
  const survivors = [...tracked.values()].filter(stillAlive).sort(byPid);
  const killed = [...tracked.values()].filter((entry) => !stillAlive(entry)).sort(byPid);
  const lines = [
    ...(tracked.size === 0 ? [speaker.line('none')] : [speaker.line('summary', { count: killed.length, trees: roots.length })]),
    ...killed.map((entry) => speaker.line('killed', shown(entry))),
    ...survivors.map((entry) => speaker.line('survivor', shown(entry))),
    ...left.sort(byPid).map((entry) => speaker.line('protected', shown(entry)))
  ];

  return { matched: matched.sort(byPid), protected: left.sort(byPid), killed, survivors, lines };
}
