#!/usr/bin/env node
/**
 * `PreToolUse` guard on the edit tools AND the shell tools — `tree-written-during-its-full-chain`. Refuses a write
 * whose target lies inside the tree a RUNNING full chain measures, so a chain's verdict is never coloured by edits
 * made while it reads the tree.
 *
 * MEASURED INCIDENT, 2026-10-26. The ~/.claude selftest runner ran in the background on worktree land-backlog-1-6;
 * in the same turn checklists/master-backlog.md was edited and committed there. brief-feasibility,
 * commit-index-guard and foreign-delete-guard went red; the re-run with no writes showed those reds were false.
 * ROOT CAUSE: a background chain was treated as finished work, and nothing knew which tree it was measuring.
 *
 * WHICH CHAIN RUNS, AND WHERE. The full-chain lock's own record: `file-lock-adapter.mjs` `liveHolder()` answers with
 * the holder record only while the lock's owner process is ALIVE (the lock's own reader rule, `liveOwnerOf`), so a
 * chain whose runner died never freezes a write — a stale lock blocking every write is exactly what would get this
 * guard switched off. The record names the absolute tree (`measured-tree.mjs`); a record without one (written before
 * the tree was recorded) cannot say where the chain measures, and passes.
 *
 * WHAT IS A WRITE INTO THE TREE: `tree-writes.mjs`. EVERY caller is held to it, the main session and the workers
 * alike: whoever writes, the chain counts it.
 *
 * FAILS OPEN on every malfunction of its own: a guard that cannot decide must not silence a safe write.
 *
 * @es Guardia `PreToolUse` sobre las herramientas de edición Y las de shell. Rechaza una escritura cuyo destino está
 * dentro del árbol que mide una cadena completa EN MARCHA, para que su veredicto nunca lo tiñan ediciones hechas
 * mientras lee el árbol. INCIDENTE MEDIDO el 2026-10-26: con el runner de ~/.claude en segundo plano sobre
 * land-backlog-1-6 se editó y commiteó checklists/master-backlog.md allí, y tres selftests dieron rojos falsos. QUÉ
 * CADENA CORRE Y DÓNDE: el propio registro del lock, solo mientras el proceso dueño está VIVO (un lock caducado que
 * bloqueara toda escritura haría que se apagara esta guardia); un registro sin árbol pasa. QUÉ ES ESCRIBIR EN EL
 * ÁRBOL: `tree-writes.mjs`. TODO llamador está sujeto. Falla ABIERTO ante cualquier fallo propio.
 */

import path from 'node:path';

import { deny, hookMain, parsePayload, runWhenMain } from '../hook-io/hook-io.mjs';
import { stateDir } from '../hook-state/locations.mjs';
import { fileLockAdapter } from './file-lock-adapter.mjs';
import { speak } from './messages.mjs';
import { writesIntoTree } from './tree-writes.mjs';

/** The record of the chain running now, or `undefined`. @es El registro de la cadena que corre ahora, o `undefined`. */
const runningChain = () => fileLockAdapter(stateDir('full-chain-lock')).liveHolder();

/**
 * The bilingual refusal for the writes one call makes into the tree of `holder`.
 * @es La negativa bilingüe para las escrituras de una llamada en el árbol de `holder`.
 */
export function refusalText(holder, writes) {
  return speak().line('tree-write-refusal', {
    targets: writes.map(({ path: target, via }) => `  - ${target} (${via})`).join('\n'),
    holderChain: holder.chain,
    holderProject: holder.project,
    holderSession: holder.session,
    holderPid: holder.pid,
    holderStartedAt: holder.startedAt,
    holderTree: holder.tree
  });
}

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to allow. Exported for the dispatcher.
 * @param options.holderOf Replaces the lock reading (a test seam). @es Sustituye la lectura del lock.
 * @param options.decide Replaces `writesIntoTree` (a test seam). @es Sustituye a `writesIntoTree`.
 * @es La salida de hook para un payload crudo, o `undefined` para permitir. Falla abierto.
 */
export function evaluate(raw, { holderOf = runningChain, decide = writesIntoTree } = {}) {
  let holder;
  let writes;

  try {
    holder = holderOf();

    if (holder === undefined || typeof holder.tree !== 'string' || !path.isAbsolute(holder.tree)) return undefined;

    writes = decide(parsePayload(raw), holder.tree);
  } catch {
    return undefined; // fail open: a malfunction of the lock reading or of the decision must never block a write
  }

  if (writes.length === 0) return undefined;

  return deny(refusalText(holder, writes));
}

// Only as the main process; imported by the dispatcher or a selftest, it does not run.
// @es Solo como proceso principal; importada por el dispatcher o un selftest, no corre.
runWhenMain(import.meta.url, hookMain(evaluate));
