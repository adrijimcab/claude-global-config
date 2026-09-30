/**
 * Real-shaped `PreToolUse` payloads for every fleet guard's proofs, built from a RECORDED payload of each
 * harness tool rather than from a guard's own idea of where its input lives.
 *
 * WHY THIS IS SHARED, and owned by no guard. It began inside `brief-provenance/`, which passed 26 of 26
 * while the surface it claimed was unguarded: it built `SendMessage` payloads with `prompt`, a field that
 * tool never carries. The same question — "what does the harness really send for tool X?" — is asked by
 * the exit-code and worktree-tenancy guards (PowerShell), by brief-audience (SendMessage, TaskCreate,
 * mem_save) and by the provenance study. A thing needed that many times is an abstraction, so the
 * recordings live here once, each `<tool>.pretooluse.json` carrying its own `provenance`: CAPTURED
 * verbatim from the live harness, or CONSTRUCTED with the evidence for its shape stated.
 *
 * THE FIELD IS NEVER NAMED HERE. A payload for new text is the recording with every string field that
 * carried the recorded text replaced: a field EQUAL to it receives the new text, and a field that was a
 * truncated PREVIEW of it (`…`-terminated prefix) receives the same-length preview. Which fields those
 * are is read off the recording, so a proof cannot agree with a guard by construction.
 *
 * NO REGEX (M5): `===`, `startsWith`, `endsWith` and `slice` on literals.
 *
 * @es Payloads `PreToolUse` con forma REAL para las pruebas de todos los guards de la flota, construidos
 * desde un payload REGISTRADO de cada herramienta. COMPARTIDO y sin dueño: la misma pregunta —«¿qué envía
 * de verdad el harness para X?»— la hacen varios guards, así que las grabaciones viven aquí una vez, cada
 * una con su `provenance` (CAPTURADA literal o CONSTRUIDA con su evidencia). El campo NUNCA se nombra: se
 * sustituye cada campo que llevaba el texto registrado. SIN REGEX.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const ELLIPSIS = '…';

/** The recording for `tool`: `{ provenance, text, payload }`. @es La grabación de `tool`. */
export function recordedPayload(tool) {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, `${tool}.pretooluse.json`), 'utf8'));
}

/** The value a recorded field must take for `text`, or `undefined` when the field never carried the recorded text. @es El valor que un campo registrado debe tomar para `text`. */
function substituted(value, recordedText, text) {
  if (value === recordedText) return text;

  if (typeof value !== 'string' || !value.endsWith(ELLIPSIS)) return undefined;

  const kept = value.slice(0, -ELLIPSIS.length);

  if (kept.length === 0 || !recordedText.startsWith(kept)) return undefined;

  return text.length <= value.length ? text : `${text.slice(0, kept.length)}${ELLIPSIS}`;
}

/**
 * The recording of `tool`, carrying `text` wherever the recording carried its own text.
 *
 * - `toolName` overrides `tool_name` for an alias sharing the shape (`Task` is the older name of `Agent`).
 * - `sessionId` REPLACES the recording's real session id and is required: guards journal refusals by
 *   session, that journal is evidence about REAL traffic, and a proof under a real id would forge it.
 * - `input` merges named fields over the substituted input, for a proof about a field OTHER than the
 *   recording's main text (a task's `subject`, a save's `title`) — named in the proof, never guessed here.
 * @es La grabación de `tool` llevando `text` donde llevaba el suyo. `sessionId` es obligatorio y sustituye
 * al real; `input` sobreescribe campos nombrados por la prueba.
 */
export function payloadFor(tool, text, { toolName = tool, sessionId, input = {} } = {}) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('payloadFor needs a sessionId naming the proof, so no replay is journaled as real traffic');

  const recorded = recordedPayload(tool);
  const toolInput = {};

  for (const [key, value] of Object.entries(recorded.payload.tool_input)) toolInput[key] = substituted(value, recorded.text, text) ?? value;

  return { ...recorded.payload, session_id: sessionId, tool_name: toolName, tool_input: { ...toolInput, ...input } };
}

/** Every string field of the recording that carried its text — the fields a correct guard may read. @es Cada campo que llevaba el texto en la grabación. */
export function textBearingFields(tool) {
  const recorded = recordedPayload(tool);

  return Object.entries(recorded.payload.tool_input)
    .filter(([, value]) => substituted(value, recorded.text, recorded.text) !== undefined)
    .map(([key]) => key);
}
