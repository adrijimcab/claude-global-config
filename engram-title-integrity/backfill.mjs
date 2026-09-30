#!/usr/bin/env node
/**
 * TASK #107 — census and backfill of engram observations saved without a usable title.
 *
 * WHAT THE DEFECT ACTUALLY IS. `observations.title` is declared `TEXT NOT NULL`, so a NULL title is
 * impossible and never was the defect. What the store accepts is the EMPTY STRING, which satisfies
 * NOT NULL while carrying nothing. Measured on 2026-09-02: 0 rows with a NULL title, 10 rows with
 * `title = ''`. Every count this task has ever carried was measuring that, badly:
 *
 *   - the original brief claimed 490. Never true; it quoted a recorded BELIEF as a measurement.
 *   - a worker measured 66 on 2026-08-04 and backfilled them. That repair was real and it held —
 *     the snapshot `.engram-backup-task107/engram-snapshot-stage2-pre-outbox.db` shows 0 blanks.
 *   - 10 NEW blanks were then written between 2026-08-05 14:51 and 2026-08-11 07:52, starting the
 *     day AFTER that backfill.
 *
 * That last line is the whole finding. The 2026-08-04 repair fixed history and left the INTAKE open,
 * so the defect refilled immediately. Re-measured on the live intake on 2026-09-02 against engram
 * 1.20.0: `engram save "" ...` exits 0, `engram save "   " ...` exits 0, and MCP `mem_save` with
 * `title: ""` returned `Memory saved: "" (manual)` as observation 559. The defect is not historical.
 * It is dormant, and it stopped on 2026-08-11 only because callers happened to pass titles. So this
 * file is HALF the remedy; `guard.mjs` beside it is the other half, and shipping this one alone
 * would reproduce the 2026-08-04 outcome exactly.
 *
 * WHY A BLANK TITLE COSTS SOMETHING. Two measured consequences, neither assumed from the field name:
 *   1. Search. `engram search` renders a result as `[2] #2 (manual) — <title>`; with a blank title
 *      the line ends at the dash. The row is still reachable by content tokens through FTS5, so it is
 *      not lost — but the handle every listing shows for it is empty.
 *   2. Cloud replication, and this one BLOCKS. `engram doctor` reports
 *      `sync_mutation_payload_missing_required_fields` for each pending outbox row whose payload has
 *      no title, one per blank observation, and its own severity is `blocking`.
 *
 * Consequence 2 is why this script repairs TWO tables. Titling `observations` alone leaves the
 * already-enqueued `sync_mutations` payloads blank and doctor still blocked — the reason the previous
 * attempt has a snapshot named `stage2-pre-outbox`.
 *
 * WHAT IT REFUSES TO DO. It never edits `content`. A recorded observation is evidence; a title is a
 * handle added beside it. Each title below was derived by reading the observation and is asserted
 * against a content prefix, so a row whose content is not what was read is REFUSED, not retitled.
 *
 * NON-VACUITY. If the set of rows to inspect resolves empty, this exits with the reserved code 3
 * rather than reporting success. A backfill that titled nothing and printed OK is the defect class
 * this project keeps finding.
 *
 * M5: no regex anywhere. Blankness is decided structurally, character by character.
 *
 * Exit codes: 0 applied/clean · 1 refused (a precondition failed) · 2 usage · 3 VACUOUS.
 *
 * @es Censo y backfill de observaciones sin título usable. El defecto NO es un título NULL — la
 * columna es `NOT NULL` — sino la CADENA VACÍA, que cumple NOT NULL sin llevar nada. Medido: 490 era
 * falso, 66 fue real y se reparó el 2026-08-04, y aparecieron 10 nuevos AL DÍA SIGUIENTE porque
 * aquella reparación arregló la historia y dejó la ENTRADA abierta. Verificado contra engram 1.20.0:
 * la entrada sigue abierta hoy. Repara dos tablas (`observations` y los payloads ya encolados en
 * `sync_mutations`, que son los que bloquean `doctor`), nunca toca `content`, y sale con el código
 * reservado 3 si el conjunto resulta vacío.
 */

import { DatabaseSync } from 'node:sqlite';

// The blankness predicate is IMPORTED, never redefined here. If the census and the guard each
// carried their own idea of "blank" they could disagree, and the guard would then admit exactly the
// rows this file is still cleaning up — which is the two-repairs-a-day-apart shape that produced the
// defect in the first place.
// @es El predicado de vacuidad se IMPORTA, nunca se redefine aquí: si el censo y el guard tuvieran
// ideas distintas de «vacío», el guard admitiría justo las filas que este fichero limpia.
import { isBlankTitle } from './blank-title.mjs';

const DB_PATH = 'C:/Users/adrian.jimenez/.engram/engram.db';

/**
 * The backfill, keyed by `sync_id` because it is stable across the store and is also the outbox's
 * `entity_key`, so one key repairs both tables.
 *
 * `contentStartsWith` is a REFUSAL condition, not decoration. These titles were written by reading
 * each observation; if the row no longer starts with what was read, the title no longer describes it
 * and the correct action is to stop rather than to label it anyway.
 *
 * On the titles themselves: derived from the ones already in this store, which carry a CLAIM rather
 * than a category — "check:i18n flip root cause — generated-tree definition restated in 3 disagreeing
 * places", not "i18n notes". A reader scanning a result list should learn the finding from the title
 * alone.
 * @es Backfill indexado por `sync_id`: es estable y además es el `entity_key` del outbox, así que una
 * sola clave repara ambas tablas. `contentStartsWith` es una condición de RECHAZO: si la fila ya no
 * empieza como lo que leí, el título ya no la describe y lo correcto es parar. Los títulos siguen la
 * convención de la tienda: llevan una AFIRMACIÓN, no una categoría.
 */
export const BACKFILL = [
  {
    syncId: 'obs-c1df60164b83c733',
    contentStartsWith: 'TASK #97 Phase 2 (b100-am-ui) — documented all 116 top-level declarations',
    title: '#97 Phase 2 — detached doc blocks: API Extractor only reads TSDoc directly preceding the declaration'
  },
  {
    syncId: 'obs-f0f791c8505f9f81',
    contentStartsWith: 'TASK #98 CLOSED — the "flipping" i18n gate was never stochastic',
    title: '#98 CLOSED — the i18n gate flip was a step function of tree state, never a race'
  },
  {
    syncId: 'obs-016be20f1fa7b2bb',
    contentStartsWith: 'TASK #67 CLOSED — comment rot: three JSDoc/doc claims the code never supported',
    title: '#67 CLOSED — comment rot: three gates stayed green while the prose lied, none reads text for truth'
  },
  {
    syncId: 'obs-359d664af1881c37',
    contentStartsWith: 'SESSION CHECKPOINT 2026-08-10 — full state',
    title: 'Session checkpoint 2026-08-10 — 29 open tasks measured, plus 4 orphan branches develop may lack'
  },
  {
    syncId: 'obs-77b37436e75b1b4e',
    contentStartsWith: 'TASK #121 — BINDING CLARIFICATION requested by the owner',
    title: '#121 clarification — "blob differs" means unique OR stale; by itself it never means ahead'
  },
  {
    syncId: 'obs-e6572b9de41a0f9e',
    contentStartsWith: 'OWNER DECISION 2026-08-10 — the StackBlitz export must CARRY the library',
    title: 'Owner decision — the StackBlitz export must carry the library; the internal registry can never resolve'
  },
  {
    syncId: 'obs-dc751c0a5ebe662e',
    contentStartsWith: 'TASK #108 PART 1 DELIVERED + THE DECISIVE STACKBLITZ FINDING',
    title: '#108 — no generated StackBlitz export ever emitted index.html; the registry was never the blocker'
  },
  {
    syncId: 'obs-3247e9b2f267615a',
    contentStartsWith: 'TWO NEW ROOT CAUSES for orphan worktree directories (#106)',
    title: '#106 — `git worktree remove` leaves node_modules behind and manufactures an orphan (1211 junctions)'
  },
  {
    syncId: 'obs-d327afe7fd0210d6',
    contentStartsWith: "LESSON — a new guard's FIRST real use exposed a state I never enumerated",
    title: 'LESSON guard-that-cannot-go-red (3rd) — the near miss is the state you never enumerate'
  },
  {
    syncId: 'obs-2b501cc7798f052f',
    contentStartsWith: 'TASK #121 CLOSED — the four "orphan branches holding content develop lacks" held ZERO unique bytes',
    title: '#121 CLOSED — the four orphan branches held zero unique bytes; all 3 differing files would regress develop'
  },
  // Written 2026-09-02 13:27:46 by a CONCURRENT worker, while this very task was measuring the
  // store — twenty minutes after the ten rows above had been titled and the count read back as 0.
  //
  // It is the best evidence in this file that the defect is not historical. The run of titled saves
  // from 2026-08-11 to 2026-09-02 was callers behaving, not a closed door, and the moment another
  // agent saved without a title the store took it silently, exactly as it did in August. Anyone
  // tempted to ship the backfill without `guard.mjs` should read this entry first.
  // @es Escrita el 2026-09-02 por un worker CONCURRENTE mientras esta misma tarea medía la tienda,
  // veinte minutos después de titular las diez de arriba y leer el recuento como 0. Es la mejor
  // prueba de que el defecto no es histórico: la racha de guardados con título era gente
  // comportándose, no una puerta cerrada.
  {
    syncId: 'obs-74414a703ef0dc10',
    contentStartsWith: 'TASK #26 mutation testing (b100-am-ui) — MEASUREMENTS on develop',
    title: "#26 mutation testing — Stryker's disableTypeChecks prepends @ts-nocheck to every file and fakes a RED"
  }
];

const fail = (code, message) => {
  console.error(message);
  process.exit(code);
};

function main() {
  const apply = process.argv.includes('--apply');
  const db = new DatabaseSync(DB_PATH, { readOnly: !apply });

  // ---- CENSUS ------------------------------------------------------------------------------
  // Scanned in JS, not in SQL, so blankness is decided by one predicate shared with the guard.
  const rows = db
    .prepare('SELECT id, sync_id, title, content, created_at, deleted_at FROM observations ORDER BY id')
    .all();

  if (rows.length === 0) {
    db.close();
    fail(3, 'VACUOUS: the observations table resolved to zero rows. Refusing to report success on an empty set.');
  }

  const blanks = rows.filter((row) => row.deleted_at === null && isBlankTitle(row.title));

  console.log(`store            : ${DB_PATH}`);
  console.log(`observations     : ${rows.length} (${rows.filter((r) => r.deleted_at === null).length} live)`);
  console.log(`blank-title live : ${blanks.length}`);

  if (blanks.length === 0) {
    console.log('');
    console.log('CLEAN — no live observation has a blank title. Nothing to backfill.');
    db.close();
    return;
  }

  // ---- PRECONDITIONS -----------------------------------------------------------------------
  // Every blank must be one this backfill has a reviewed title for. An UNKNOWN blank is a refusal,
  // never a silent skip: it means the defect produced a row nobody has read, and labelling it
  // automatically is precisely the "tidy it up" move the brief forbids.
  const bySyncId = new Map(BACKFILL.map((entry) => [entry.syncId, entry]));
  const unknown = blanks.filter((row) => !bySyncId.has(row.sync_id));

  if (unknown.length > 0) {
    db.close();
    fail(
      1,
      [
        `REFUSED: ${unknown.length} blank-title observation(s) have no reviewed title in this file.`,
        'These were written AFTER this backfill was authored, which means the intake is still open.',
        'Read each one and add it to BACKFILL — do not let an unread observation be titled automatically.',
        ...unknown.map((row) => `  id=${row.id} sync_id=${row.sync_id} created_at=${row.created_at}`)
      ].join('\n')
    );
  }

  const planned = [];
  for (const row of blanks) {
    const entry = bySyncId.get(row.sync_id);
    if (!row.content.startsWith(entry.contentStartsWith)) {
      db.close();
      fail(
        1,
        [
          `REFUSED: content drift on id=${row.id} sync_id=${row.sync_id}.`,
          'The reviewed title was derived from content this row no longer starts with, so it may no',
          'longer describe it. Re-read the observation and re-derive the title.',
          `  expected prefix: ${entry.contentStartsWith}`,
          `  actual prefix  : ${row.content.slice(0, entry.contentStartsWith.length)}`
        ].join('\n')
      );
    }
    planned.push({ id: row.id, syncId: row.sync_id, title: entry.title });
  }

  // ---- OUTBOX ------------------------------------------------------------------------------
  // The pending mutations are what `doctor` actually blocks on. Repair only UNACKED rows whose
  // payload title is blank, and only for a sync_id this run is titling.
  const outbox = [];
  for (const item of planned) {
    const mutations = db
      .prepare("SELECT seq, payload FROM sync_mutations WHERE entity='observation' AND entity_key=? AND acked_at IS NULL")
      .all(item.syncId);
    for (const mutation of mutations) {
      let payload;
      try {
        payload = JSON.parse(mutation.payload);
      } catch {
        continue; // an unparseable payload is not ours to rewrite
      }
      if (!isBlankTitle(payload.title)) continue;
      payload.title = item.title;
      outbox.push({ seq: mutation.seq, payload: JSON.stringify(payload) });
    }
  }

  console.log('');
  console.log(`planned observation titles : ${planned.length}`);
  console.log(`planned outbox payloads    : ${outbox.length}`);
  console.log('');
  for (const item of planned) console.log(`  ${String(item.id).padStart(4)}  ${item.title}`);

  if (!apply) {
    console.log('');
    console.log('DRY RUN — nothing written. Re-run with --apply to write.');
    db.close();
    return;
  }

  // ---- APPLY -------------------------------------------------------------------------------
  // One transaction: observations and their outbox payloads move together, because a half-applied
  // repair leaves doctor blocked on rows whose observation now looks fixed.
  const updateObservation = db.prepare('UPDATE observations SET title = ? WHERE sync_id = ? AND id = ?');
  const updateMutation = db.prepare('UPDATE sync_mutations SET payload = ? WHERE seq = ?');

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of planned) {
      const result = updateObservation.run(item.title, item.syncId, item.id);
      if (result.changes !== 1) throw new Error(`expected 1 row for id=${item.id}, changed ${result.changes}`);
    }
    for (const item of outbox) {
      const result = updateMutation.run(item.payload, item.seq);
      if (result.changes !== 1) throw new Error(`expected 1 row for seq=${item.seq}, changed ${result.changes}`);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    fail(1, `REFUSED: rolled back, nothing written. ${error.message}`);
  }

  // ---- READBACK ----------------------------------------------------------------------------
  const remaining = db
    .prepare('SELECT id, title, deleted_at FROM observations')
    .all()
    .filter((row) => row.deleted_at === null && isBlankTitle(row.title));

  console.log('');
  console.log(`APPLIED. blank-title live observations now: ${remaining.length}`);
  db.close();
  if (remaining.length !== 0) fail(1, 'REFUSED: blanks remain after apply.');
}

main();
