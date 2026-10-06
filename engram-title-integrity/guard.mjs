#!/usr/bin/env node
/**
 * `PreToolUse` guard on engram `mem_save` — an observation must arrive with a usable title.
 *
 * WHY THIS EXISTS, and why a backfill alone was not the answer. On 2026-08-04 a worker measured 66
 * untitled observations and backfilled every one. That repair was real and it held. Ten NEW untitled
 * observations were written between 2026-08-05 14:51 and 2026-08-11 07:52 — starting the day after.
 * History was fixed; the intake was not, so the defect refilled immediately. This is the intake.
 *
 * THE INTAKE IS STILL OPEN, measured rather than assumed. Against engram 1.20.0 on 2026-09-02:
 *   engram save "" "…"      -> `Memory saved: #2 "" (manual)`, exit 0
 *   engram save "   " "…"   -> `Memory saved: #3 "   " (manual)`, exit 0
 *   MCP mem_save title:""   -> `Memory saved: "" (manual)`, observation 559
 * The column is `TEXT NOT NULL` and the MCP schema says `required: ["title"]`, and BOTH are satisfied
 * by the empty string. `required` constrains PRESENCE, never CONTENT. Nothing upstream refuses this.
 * The run of titled saves since 2026-08-11 is callers behaving, not a closed door.
 *
 * WHAT AN UNTITLED OBSERVATION COSTS, measured, not inferred from the field name:
 *   1. `engram search` renders each hit as `[2] #2 (manual) — <title>`; blank ends the line at the
 *      dash. The row stays reachable through FTS5 content tokens, so it is not lost — but the handle
 *      every listing shows for it is empty, and a store is browsed by those handles.
 *   2. `engram doctor` raises `sync_mutation_payload_missing_required_fields` at severity BLOCKING,
 *      one finding per untitled observation, and cloud replication does not proceed past it.
 *
 * WHAT IT CHECKS: that a title exists and contains at least one non-whitespace character. NOT that it
 * is a good title — no hook can judge that. The point is that the caller must produce one, and having
 * to write it is the moment the caller decides what the observation is actually about.
 *
 * WHY IT IS NOT ROUTED AROUND: it is trivially satisfiable, and the refusal quotes the store's own
 * convention plus the caller's first line, so the fix is usually to paste the sentence already
 * written in the content.
 *
 * FAILS OPEN on every malfunction of its own. Memory is a support system: a guard that can wedge
 * `mem_save` would cost more than every untitled observation ever written. Unreadable stdin,
 * unparseable JSON, a payload shape it does not recognise, an unexpected throw anywhere — all allow.
 * It denies ONLY on the positive condition "this is a mem_save AND its title is structurally blank".
 *
 * M5: no regex. Exit code is always 0; the decision is carried in the JSON on stdout, per the
 * `PreToolUse` contract.
 *
 * @es Guard de `PreToolUse` sobre `mem_save` de engram: una observación debe llegar con título usable.
 * El backfill del 2026-08-04 arregló 66 y AL DÍA SIGUIENTE empezaron a entrar 10 nuevas: se arregló la
 * historia y no la ENTRADA. Medido contra engram 1.20.0: la entrada sigue abierta hoy — `NOT NULL` y
 * `required` los cumple la cadena vacía, porque `required` restringe PRESENCIA, no CONTENIDO. Coste
 * medido: la búsqueda muestra el resultado sin asa, y `doctor` bloquea la replicación en la nube.
 * FALLA EN ABIERTO ante cualquier avería propia: la memoria es un sistema de apoyo y un guard capaz
 * de atascar `mem_save` costaría más que todas las observaciones sin título juntas.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { isBlankTitle } from './blank-title.mjs';

/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('engram-title-integrity');

/**
 * The save tools this covers. Engram is mounted twice in this workspace — directly and through the
 * plugin — and a guard that knew only one name would sit there looking healthy while every save went
 * through the other. Both names are listed for that reason.
 *
 * `mem_update` is deliberately NOT covered: it edits an existing observation, whose title may
 * legitimately be untouched by the call. `mem_save` is where a title is born.
 *
 * @es Herramientas cubiertas. Engram está montado DOS veces (directo y vía plugin); un guard que solo
 * conociera un nombre parecería sano mientras todo pasa por el otro. `mem_update` queda fuera a
 * propósito: edita una observación existente y su título puede no venir en la llamada.
 */
export const SAVE_TOOLS = new Set(['mcp__engram__mem_save', 'mcp__plugin_engram_engram__mem_save']);

/**
 * Decide on one hook payload.
 *
 * Returns `undefined` to ALLOW — including for every shape it does not understand, which is what
 * makes the fail-open posture structural rather than a promise in a comment. It returns a refusal
 * only from the positive condition.
 *
 * @es Decide sobre un payload. Devuelve `undefined` para PERMITIR, también ante cualquier forma que
 * no entienda: así el fallo-en-abierto es estructural y no una promesa en un comentario.
 */
export function inspectSave(toolName, toolInput) {
  if (!SAVE_TOOLS.has(toolName)) return undefined;
  if (toolInput === null || typeof toolInput !== 'object') return undefined;

  const title = toolInput.title;

  // A non-string title is a distinct failure and deserves its own sentence. It is still refused:
  // the column is TEXT, so a number would be coerced and stored as a handle nobody can search for.
  if (title !== null && title !== undefined && typeof title !== 'string') {
    return { kind: 'non-string', received: typeof title, content: toolInput.content ?? toolInput.observation };
  }

  if (!isBlankTitle(title)) return undefined;

  return {
    kind: title === undefined || title === null ? 'absent' : title.length === 0 ? 'empty' : 'whitespace',
    received: typeof title,
    length: typeof title === 'string' ? title.length : 0,
    content: toolInput.content ?? toolInput.observation
  };
}

/**
 * Offer the caller the first line of what they were already writing. Most untitled saves in this
 * store opened with a sentence that IS the title — "TASK #98 CLOSED — the flipping i18n gate was
 * never stochastic" — so the cheapest correct fix is usually to lift it.
 * @es Ofrece al llamante la primera línea de lo que ya escribía: casi todas las observaciones sin
 * título de esta tienda empiezan por una frase que YA ES el título.
 */
function suggestion(content) {
  if (typeof content !== 'string') return undefined;
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length === 0) return undefined;
  return firstLine.length > 110 ? `${firstLine.slice(0, 107)}...` : firstLine;
}

function journal(entry) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(join(stateDirectory(), 'refusals.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* the journal is evidence, never a precondition: its failure must not change the decision */
  }
}

/**
 * NAME THE NEAR MISS. A refusal that says only "missing" to someone who DID send a title is
 * withholding the one fact that makes the fix obvious, and a control that is confusing to satisfy is
 * routed around — the same end state as one that cannot fire, reached by a different road.
 * @es NOMBRA EL CASI-ACIERTO. Decir solo «falta» a quien SÍ mandó un título oculta el único dato que
 * hace obvio el arreglo, y un control confuso se acaba rodeando.
 */
function reason(refusal) {
  const diagnosis = {
    absent: 'You sent no `title` at all.',
    empty: 'NEAR MISS — you sent `title`, but it is the EMPTY STRING. It is present, so it satisfies the column\'s NOT NULL and the schema\'s `required: ["title"]`; both constrain PRESENCE, not content.',
    whitespace: `NEAR MISS — you sent a \`title\` of ${refusal.length} whitespace character(s) and no visible text. It passes every presence check and reads as blank everywhere it is shown. Watch for a non-breaking space from a copy-paste: it looks exactly like a space.`,
    'non-string': `You sent \`title\` as a ${refusal.received}, not a string.`
  }[refusal.kind];

  const hint = suggestion(refusal.content);

  return [
    'ENGRAM TITLE GUARD refused this mem_save: the observation has no usable title.',
    '',
    diagnosis,
    '',
    ...(hint === undefined ? [] : [`Your content already opens with a usable one — try:`, '', `  title: "${hint}"`, '']),
    'The convention in this store is that a title carries a CLAIM, not a category:',
    '',
    '  good: "check:i18n flip root cause — generated-tree definition restated in 3 disagreeing places"',
    '  good: "#121 CLOSED — the four orphan branches held zero unique bytes"',
    '  bad : "i18n notes", "session update", "worktree stuff"',
    '',
    'Why this is refused rather than defaulted. A default would be a title nobody chose, on an',
    'observation nobody can then recognise — and it would hide the fact that the save was untitled.',
    'Two measured costs of letting it through: `engram search` prints each hit as',
    '`[2] #2 (manual) — <title>` and a blank one ends at the dash, so the row keeps no handle in any',
    'listing; and `engram doctor` raises a BLOCKING `sync_mutation_payload_missing_required_fields`',
    'per untitled observation, which stops cloud replication.',
    '',
    'This guard exists because backfilling was already tried alone. 66 untitled observations were',
    'repaired on 2026-08-04, and 10 new ones arrived over the following week because nothing refused',
    'them at the door. Write the title; it is the sentence you would use to find this again.'
  ].join('\n');
}

/**
 * La salida de hook para un payload crudo (deny para un `mem_save` sin título usable), o `undefined`.
 * Exportada para que `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso.
 */
export function evaluate(raw) {
  let payload;

  try {
    // A PowerShell-written payload can carry a UTF-8 BOM, which makes JSON.parse throw.
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    payload = JSON.parse(text);
  } catch {
    return undefined;
  }

  let refusal;
  try {
    refusal = inspectSave(payload?.tool_name, payload?.tool_input);
  } catch {
    // An unexpected throw in the decision is a malfunction of the guard, not a verdict on the save.
    return undefined;
  }

  if (refusal === undefined) return undefined;

  journal({
    at: new Date().toISOString(),
    session: payload?.session_id,
    tool: payload?.tool_name,
    kind: refusal.kind
  });

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason(refusal)
    }
  };
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));
  process.exit(0);
}

/**
 * Run only when executed as the hook, never on import.
 *
 * `main()` reads file descriptor 0. Without this check, `selftest.mjs` importing `inspectSave` would
 * block on the test runner's own stdin — the suite proving the guard works would hang before its
 * first assertion, which is a memorable way to make a guard look broken while it is fine.
 *
 * @es Se ejecuta solo como hook, nunca al importar: `main()` lee del descriptor 0, y sin esta
 * comprobación el selftest se quedaría bloqueado en su propio stdin antes de la primera aserción.
 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
