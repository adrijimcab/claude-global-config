#!/usr/bin/env node
/**
 * Stop hook — the journal of the prompt judges (premise and voice). It NEVER blocks: it records what the native `prompt` Stop hooks
 * (`prompt.mjs`, `../voice-judge/prompt.mjs`) decided, which no other hook can see, so `guard-precision/` can sample and label those blocks
 * like any other guard's.
 *
 * HOW. When the judge answers `ok: false`, its reason (which starts with `MARKER`) is fed back to Claude and the
 * turn continues; the next Stop then arrives with `stop_hook_active: true`. Only on such a stop does this hook
 * read the last `TAIL_RECORDS` records of `transcript_path` and take every string that holds the marker in a
 * record that is neither the assistant's own nor a tool result (reading `prompt.mjs` or this file puts the
 * marker in a tool result; quoting it puts it in an assistant record). The reason is the text from the marker
 * on, cut to `REASON_LIMIT`. Each reason is one `decision` of the `premise-judge` mechanism, keyed by the sha256
 * of session id and reason, so the same feedback met again on a later stop of the same chain, or in two records
 * of one stop, is journaled once. Every Stop also counts one run of the judge in the fires counter.
 *
 * WHAT IS NOT KNOWN. Which record type the harness writes the prompt hook's feedback as is not documented; the
 * search is deliberately format-agnostic for that reason. UNVERIFIED until H8 (`checklists/host-backlog.md`)
 * sees a real block journaled on the owner's host.
 *
 * FAIL OPEN: any error of its own leaves the turn alone; it never prints.
 *
 * EACH JUDGE ON ITS OWN. The judges it journals (premise, voice, pending) are read from `JOURNALED_JUDGES`, and each
 * judge's marker is imported from its own `prompt.mjs` only when the hook runs (`loadJournaledJudges`). A judge
 * whose prompt cannot load, or exports no marker text, is skipped alone: the others are still journaled.
 *
 * @es CADA JUEZ POR SU CUENTA: la marca de cada juez se importa de su propio `prompt.mjs` solo al correr el hook; un
 * juez cuyo prompt no carga, o no exporta una marca de texto, se salta solo y los demás se siguen registrando.
 *
 * @es Hook Stop: el journal del juez de premisas. NUNCA bloquea: registra lo que decidió el hook `prompt` nativo,
 * que ningún otro hook ve, para que `guard-precision/` muestree y etiquete esos bloqueos como los de cualquier
 * guardia. CÓMO: con `ok: false` el motivo (que empieza por `MARKER`) vuelve a Claude y el turno sigue; la
 * siguiente parada llega con `stop_hook_active: true`, y solo entonces lee los últimos `TAIL_RECORDS` registros
 * del transcript y toma cada cadena con la marca en un registro que no es del asistente ni un resultado de
 * herramienta. Cada motivo es un `decision` del mecanismo `premise-judge`, con clave sha256 de sesión y motivo,
 * así que la misma realimentación vista otra vez se registra una sola vez. Cada Stop cuenta una corrida del
 * juez. LO QUE NO SE SABE: el tipo de registro con que el harness escribe esa realimentación no está
 * documentado; por eso la búsqueda no depende del formato. NO VERIFICADO hasta H8. FALLA ABIERTO.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendRecord, digestInput, incrementFires, journalPath, newId } from '../hook-state/journal.mjs';
import { lastRecords } from '../hook-state/jsonl-tail.mjs';
import { MARKER } from './prompt.mjs';

/** The mechanism: this folder's name, as the dispatcher and `guard-precision/` call it. @es El mecanismo. */
export const MECHANISM = 'premise-judge';

/** The mechanism of the voice judge (`../voice-judge/prompt.mjs`). @es El mecanismo del juez de voz. */
export const VOICE_MECHANISM = 'voice-judge';

/** The mechanism of the pending judge (`../pending-judge/prompt.mjs`). @es El mecanismo del juez de pendientes. */
export const PENDING_MECHANISM = 'pending-judge';

/**
 * Every prompt judge this guard journals: its mechanism and the module whose `MARKER` its block reasons start with.
 * @es Cada juez de prompt que esta guardia registra: su mecanismo y el módulo cuya `MARKER` inicia sus motivos.
 */
export const JOURNALED_JUDGES = Object.freeze([
  { mechanism: MECHANISM, module: './prompt.mjs' },
  { mechanism: VOICE_MECHANISM, module: '../voice-judge/prompt.mjs' },
  { mechanism: PENDING_MECHANISM, module: '../pending-judge/prompt.mjs' },
]);

/** How a judge's prompt is imported: relative to this file. A seam. @es Cómo se importa el prompt de un juez. */
export const importPromptModule = (specifier) => import(specifier);

/**
 * `{ mechanism, marker }` of every journaled judge whose prompt loads and exports a marker text, in table order.
 * @es `{ mechanism, marker }` de cada juez cuyo prompt carga y exporta una marca de texto, en el orden de la tabla.
 */
export async function loadJournaledJudges({ importModule = importPromptModule } = {}) {
  const loaded = await Promise.all(JOURNALED_JUDGES.map(async ({ mechanism, module }) => {
    try {
      const { MARKER: marker } = await importModule(module);

      return typeof marker === 'string' && marker !== '' ? { mechanism, marker } : undefined;
    } catch {
      // This judge goes unjournaled; the others do not. @es Este juez queda sin registrar; los demás no.
      return undefined;
    }
  }));

  return loaded.filter((judge) => judge !== undefined);
}

/** Transcript records read back on a continued stop. @es Registros del transcript que se leen en una parada continuada. */
export const TAIL_RECORDS = 200;

/** Journal records read back to tell a reason already journaled. @es Registros del journal que se releen. */
export const JOURNAL_TAIL = 500;

/** The longest reason journaled, in characters (the dispatcher's own limit). @es El motivo más largo que se registra. */
export const REASON_LIMIT = 300;

/**
 * True when `value` holds a tool result anywhere (an array is an object: `Object.values` walks it too).
 * @es Verdadero si `value` lleva un resultado de herramienta en cualquier parte (un array también se recorre).
 */
function holdsToolResult(value) {
  if (value === null || typeof value !== 'object') return false;
  if (value.type === 'tool_result') return true;

  return Object.values(value).some(holdsToolResult);
}

/** Every string of `value` that holds `marker`, from the marker on. @es Cada cadena con la marca, desde la marca. */
function markedTexts(value, marker) {
  if (typeof value === 'string') return value.includes(marker) ? [value.slice(value.indexOf(marker))] : [];
  if (value === null || typeof value !== 'object') return [];

  return Object.values(value).flatMap((inner) => markedTexts(inner, marker));
}

/**
 * The judge's block reasons in `records`, distinct and in order: marked strings of records that are neither the
 * assistant's nor a tool result, trimmed and cut to `REASON_LIMIT`.
 * @es Los motivos de bloqueo del juez en `records`, distintos y en orden.
 */
export function judgeReasons(records, marker = MARKER) {
  const reasons = records
    .filter((record) => record?.type !== 'assistant' && record?.toolUseResult === undefined && !holdsToolResult(record))
    .flatMap((record) => markedTexts(record, marker))
    .map((text) => text.trim().slice(0, REASON_LIMIT));

  return [...new Set(reasons)];
}

/**
 * The input digests already journaled for the judge; none before its first block (no journal yet).
 * @es Las huellas ya registradas para el juez; ninguna antes de su primer bloqueo (aún sin journal).
 */
function journaledDigests(mechanism) {
  try {
    return new Set(lastRecords(journalPath(mechanism), JOURNAL_TAIL).map((record) => record?.inputDigest));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();

    throw error;
  }
}

/**
 * Journals the blocks of `judges` (`loadJournaledJudges()`) for one Stop payload and returns how many it added.
 * @es Registra los bloqueos de `judges` para un payload de Stop y devuelve cuántos añadió.
 */
export function journalJudgeBlocks(payload, judges) {
  if (payload?.stop_hook_active !== true || typeof payload.transcript_path !== 'string') return 0;

  const session = typeof payload.session_id === 'string' ? payload.session_id : '';
  const records = lastRecords(payload.transcript_path, TAIL_RECORDS);
  let added = 0;

  for (const { mechanism, marker } of judges) {
    const known = journaledDigests(mechanism);

    for (const reason of judgeReasons(records, marker)) {
      const inputDigest = digestInput(`${session}\n${reason}`);

      if (known.has(inputDigest)) continue;

      // `judgeReasons` gives each reason once, so no digest repeats within this loop.
      // @es `judgeReasons` da cada motivo una vez: ninguna huella se repite dentro de este bucle.
      appendRecord(mechanism, { kind: 'decision', blockId: newId(), toolUseId: null, inputDigest, event: 'Stop', reason });
      added += 1;
    }
  }

  return added;
}

/**
 * Always `undefined`: the turn is never held. Exported for `~/.claude/hook-dispatch/dispatch.mjs`.
 * @es Siempre `undefined`: el turno nunca se retiene. Exportada para el dispatcher.
 */
export async function evaluate(raw, { importModule = importPromptModule } = {}) {
  try {
    const payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

    for (const { mechanism } of JOURNALED_JUDGES) incrementFires(mechanism);
    journalJudgeBlocks(payload, await loadJournaledJudges({ importModule }));
  } catch {
    // Journaling is evidence, never a decision: a failure here loses a record, not a turn.
    // @es Registrar es evidencia, nunca una decisión: un fallo pierde un registro, no un turno.
  }

  return undefined;
}

const main = () => {
  const chunks = [];

  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', async () => {
    await evaluate(Buffer.concat(chunks).toString('utf8'));
    process.exit(0);
  });
};

// Only as the main process; imported (the dispatcher, a selftest) it must not read stdin.
// @es Solo como proceso principal; importada no debe leer stdin.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
