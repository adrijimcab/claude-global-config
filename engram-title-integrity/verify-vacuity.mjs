#!/usr/bin/env node
/**
 * Prove the reserved exit code 3 actually FIRES on an empty set.
 *
 * A vacuity guard that has never been seen to go red is the exact thing it exists to prevent: a run
 * that inspected nothing and reported success. Asserting "it exits 3 if the set is empty" from
 * reading the source is the same unverified move. So this builds a genuinely empty store, points a
 * copy of the census at it, and requires exit 3 — and then points the same copy at the real store and
 * requires exit 0, because a script that ALWAYS exits 3 would also pass the first half.
 *
 * The original is never edited; the copy is mutated in a scratch directory, as in `mutants.mjs`.
 *
 * @es Demuestra que el código reservado 3 SE DISPARA de verdad con un conjunto vacío. Un guard de
 * vacuidad que nunca se ha visto en rojo es justo lo que pretende evitar. Construye una tienda vacía
 * de verdad, apunta una copia del censo a ella y exige salida 3; luego la apunta a la tienda real y
 * exige salida 0, porque un script que SIEMPRE saliera 3 también pasaría la primera mitad.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_DB = 'C:/Users/adrian.jimenez/.engram/engram.db';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${expected}, got ${actual})`}`);
};

const dir = mkdtempSync(join(tmpdir(), 'engram-vacuity-'));
try {
  // An EMPTY store with the real shape: the table exists and has zero rows. This is the state that
  // must produce 3 — not a missing file, which would merely crash and prove nothing.
  // FORWARD SLASHES, and this is not cosmetic. The path is substituted into a JS single-quoted
  // string literal in the copied script; a Windows path puts `\U`, `\A`, `\T` there, which are
  // invalid or silently-eaten escapes, and the copy then fails to open a database that exists.
  // Measured: the first version of this file did exactly that and reported exit 1 instead of 3,
  // which reads as "the vacuity guard is broken" when the harness was the broken part.
  // @es BARRAS NORMALES, y no es cosmético: la ruta se sustituye dentro de un literal de cadena JS y
  // una ruta Windows mete `\U`, `\A`, `\T`, escapes inválidos o comidos. La primera versión de este
  // fichero hizo justo eso y devolvió 1 en vez de 3, que se lee como «el guard está roto» cuando la
  // rota era la prueba.
  const emptyDb = join(dir, 'empty.db').split('\\').join('/');
  const seed = new DatabaseSync(emptyDb);
  seed.exec(
    'CREATE TABLE observations (id INTEGER PRIMARY KEY, sync_id TEXT, session_id TEXT, type TEXT, title TEXT NOT NULL, content TEXT NOT NULL, project TEXT, scope TEXT, topic_key TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT)'
  );
  seed.exec('CREATE TABLE sync_mutations (seq INTEGER PRIMARY KEY, target_key TEXT, entity TEXT, entity_key TEXT, op TEXT, payload TEXT, source TEXT, occurred_at TEXT, acked_at TEXT, project TEXT)');
  seed.close();

  for (const file of ['blank-title.mjs', 'backfill.mjs']) cpSync(join(HERE, file), join(dir, file));

  const target = join(dir, 'backfill.mjs');
  const source = readFileSync(target, 'utf8');
  if (!source.includes(REAL_DB)) {
    console.error('FAIL  could not find the DB path to repoint in the copy.');
    process.exit(1);
  }

  writeFileSync(target, source.replace(REAL_DB, emptyDb), 'utf8');
  const vacuous = spawnSync(process.execPath, [target], { encoding: 'utf8' });
  check('an EMPTY observations table exits 3', vacuous.status, 3);
  check('and says so on stderr', vacuous.stderr.includes('VACUOUS'), true);

  // The other direction: the same copy, pointed at the real store, must NOT exit 3. Without this a
  // script that always exited 3 would look like a working vacuity guard.
  writeFileSync(target, source, 'utf8');
  const real = spawnSync(process.execPath, [target], { encoding: 'utf8' });
  check('the real, populated store does NOT exit 3', real.status === 3, false);
  check('the real store exits 0 (currently clean)', real.status, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('The vacuity guard discriminates: empty -> 3, populated -> 0.');
