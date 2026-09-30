#!/usr/bin/env node
/**
 * Remove pending outbox mutations that reference an observation which no longer exists.
 *
 * WHY THIS EXISTS, and it is a finding in its own right. Establishing whether the blank-title intake
 * was still open required actually attempting a blank-title save on the live path (a past refusal is
 * not evidence about a current capability). MCP `mem_save` accepted `title: ""` and produced
 * observation 559; `engram delete 559 --hard` then reported `Observation #559 hard-deleted` and
 * exited 0 — but LEFT BOTH of its outbox rows behind, an `upsert` and a `delete`, each carrying a
 * blank title. `engram doctor` went from 10 blocking findings to 12.
 *
 * So: a hard delete does not purge the entity's pending mutations, and a blank-title row that is
 * deleted from `observations` still blocks cloud replication forever. That is worth reporting
 * upstream; here it just has to be cleaned up, because it is residue I created.
 *
 * WHAT IT REFUSES TO DO. It deletes ONLY mutations whose `entity_key` matches no row in
 * `observations` at all — genuinely orphaned. A mutation for a live observation is never touched, and
 * neither is an acked one. Exits 3 if the candidate set resolves empty, so "cleaned nothing,
 * reported success" is not a reachable outcome.
 *
 * M5: no regex. Exit codes: 0 done/clean · 1 refused · 3 VACUOUS.
 *
 * @es Elimina mutaciones pendientes del outbox que apuntan a una observación inexistente. Hallazgo
 * propio: `engram delete --hard` sale 0 pero NO purga las mutaciones pendientes de la entidad, así
 * que una fila sin título borrada de `observations` sigue bloqueando la replicación para siempre.
 * Solo borra huérfanas reales; nunca toca una mutación de una observación viva ni una ya confirmada.
 */

import { DatabaseSync } from 'node:sqlite';

const DB_PATH = 'C:/Users/adrian.jimenez/.engram/engram.db';

function main() {
  const apply = process.argv.includes('--apply');
  const db = new DatabaseSync(DB_PATH, { readOnly: !apply });

  const liveSyncIds = new Set(db.prepare('SELECT sync_id FROM observations').all().map((r) => r.sync_id));
  const pending = db
    .prepare("SELECT seq, entity_key, op FROM sync_mutations WHERE entity='observation' AND acked_at IS NULL ORDER BY seq")
    .all();

  if (pending.length === 0) {
    db.close();
    process.exit(3);
  }

  const orphans = pending.filter((row) => !liveSyncIds.has(row.entity_key));

  console.log(`pending observation mutations : ${pending.length}`);
  console.log(`orphaned (no such observation): ${orphans.length}`);
  for (const row of orphans) console.log(`  seq=${row.seq} op=${row.op} entity_key=${row.entity_key}`);

  if (orphans.length === 0) {
    console.log('CLEAN — no orphaned mutations.');
    db.close();
    return;
  }

  if (!apply) {
    console.log('DRY RUN — nothing written. Re-run with --apply.');
    db.close();
    return;
  }

  const remove = db.prepare('DELETE FROM sync_mutations WHERE seq = ?');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of orphans) {
      const result = remove.run(row.seq);
      if (result.changes !== 1) throw new Error(`expected 1 row for seq=${row.seq}, deleted ${result.changes}`);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    console.error(`REFUSED: rolled back, nothing written. ${error.message}`);
    process.exit(1);
  }

  console.log(`REMOVED ${orphans.length} orphaned mutation(s).`);
  db.close();
}

main();
