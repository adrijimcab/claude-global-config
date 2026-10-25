#!/usr/bin/env node
/**
 * `PreToolUse` guard on delegation and resume: a brief must carry a `ROUTE:` line (`direct` or
 * `tracked-odd <feature-name>`), required the same way the MEASURED and HYPOTHESIS markers are. The decision
 * lives in `route-line.mjs`; this file is the hook shim: read the payload, inspect the brief, refuse a missing
 * or malformed line and explain which of the states it is in.
 *
 * WHY. A worker cannot tell from a brief whether it should open or touch a feature document
 * (`odd/tasks/<feature>.md`), and the orchestrator owns those documents. The line says it. The CHOICE of value
 * stays the orchestrator's: this guard checks the form and never guesses the size or risk of the work.
 *
 * WHERE A BRIEF LIVES is `BRIEF_CARRIERS` of brief-provenance, the one map of which tool carries its text in
 * which field: `Agent` and `Task` in `prompt`, `SendMessage` in `message`. This guard is registered for exactly
 * those tools in `guard.mjs.hook-registration.json`, and `selftest.mjs` proves the declaration matches.
 *
 * FAILS OPEN on every malfunction of its own: a guard able to wedge delegation is a larger hazard than the
 * one it closes.
 *
 * @es Guard de `PreToolUse` sobre delegación y resume: un brief debe llevar una línea `ROUTE:` (`direct` o
 * `tracked-odd <nombre-de-feature>`), exigida igual que los marcadores MEASURED y HYPOTHESIS. La decisión vive
 * en `route-line.mjs`; este fichero es el shim. POR QUÉ: un worker no puede saber por el brief si debe abrir o
 * tocar un documento de feature, y esos documentos son del orquestador. ELEGIR el valor sigue siendo del
 * orquestador: este guard comprueba la forma y nunca adivina el tamaño ni el riesgo. DÓNDE VIVE UN BRIEF lo dice
 * `BRIEF_CARRIERS` de brief-provenance, el único mapa de qué herramienta lleva su texto en qué campo. FALLA
 * ABIERTO ante todo fallo propio.
 */

import { briefOf } from '../brief-provenance/provenance.mjs';
import { deny, hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { refusalReason } from './refusal-text.mjs';
import { inspectRoute } from './route-line.mjs';

/**
 * The hook output (deny) for a raw payload whose brief lacks a well-formed ROUTE line, or `undefined`.
 * Exported so `~/.claude/hook-dispatch/dispatch.mjs` can run it in its own process.
 * @es La salida de hook (deny) para un payload crudo cuyo brief no lleva una línea ROUTE bien formada, o `undefined`.
 */
export function evaluate(raw) {
  const payload = tryParsePayload(raw);

  if (payload === undefined) return undefined;

  const brief = briefOf(payload);

  if (brief === undefined) return undefined;

  const reason = refusalReason(inspectRoute(brief.text), brief);

  if (reason === undefined) return undefined;

  return deny(reason);
}

/** `evaluate` for the standalone hook: a malfunction of this guard allows the delegation. @es `evaluate` para el hook independiente: una avería de esta guardia deja pasar la delegación. */
const evaluateOrAllow = (raw) => {
  try {
    return evaluate(raw);
  } catch {
    return undefined;
  }
};

const standalone = hookMain(evaluateOrAllow);

// Only as the main process: imported by the dispatcher or a selftest, the hook must not read their stdin.
// The process then ends with status 0.
// @es Solo como proceso principal: importado por el dispatcher o un selftest, el hook no debe leer su stdin.
// El proceso termina con estado 0.
runWhenMain(import.meta.url, () => standalone().then(() => process.exit(0)));
