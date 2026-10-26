#!/usr/bin/env node
/**
 * `SubagentStart` hook: tells every worker, `Explore` included, where its project contract is and what the
 * route rule is. The decision lives in `worker-pointer.mjs`; this file reads the payload and prints the
 * envelope the harness delivers into the worker's own context.
 *
 * WHY THIS EVENT. `PreToolUse.additionalContext` reaches the CALLER, not the spawned worker, and a `Task|Agent`
 * matcher never sees a `SendMessage` resume; `SubagentStart` fires for both and delivers into the worker
 * (measured in the b100-am-ui project, whose own hook this generalises). WHY A POINTER AND NOT THE CONTRACT: see
 * `pointer-text.mjs`. Projects whose workers load `CLAUDE.md` already have the contract; the pointer covers the
 * ones that do not (`Explore` agents: 3 of 250 subagent transcripts of the Discovery project never held the
 * contract).
 *
 * NEVER BLOCKS: every failure prints nothing and exits 0. A worker without a pointer is bad; a fleet that cannot
 * start a worker is worse.
 *
 * @es Hook de `SubagentStart`: dice a todo worker, `Explore` incluido, dónde está el contrato de su proyecto y
 * cuál es la regla de ruta. La decisión vive en `worker-pointer.mjs`; este fichero lee el payload e imprime el
 * sobre que el harness entrega en el contexto del worker. POR QUÉ ESTE EVENTO: `PreToolUse.additionalContext`
 * llega al LLAMANTE y un matcher `Task|Agent` no ve un resume por `SendMessage`; `SubagentStart` dispara en ambos
 * y entrega dentro del worker. POR QUÉ UN PUNTERO: ver `pointer-text.mjs`. NUNCA BLOQUEA.
 */

import { context, hookMain, parsePayload, runWhenMain } from '../hook-io/hook-io.mjs';
import { workerPointer } from './worker-pointer.mjs';

/**
 * The hook envelope for a raw payload, or `undefined` when it cannot be read. Exported for the selftest.
 * @es El sobre de hook para un payload crudo, o `undefined` si no se puede leer. Exportada para el selftest.
 */
export function envelopeFor(raw, env = process.env) {
  try {
    const payload = parsePayload(raw);

    return context('SubagentStart', workerPointer(payload, env));
  } catch {
    return undefined;
  }
}

// Only as the main process: imported by the selftest, the hook must not read its stdin.
runWhenMain(import.meta.url, hookMain(envelopeFor));
