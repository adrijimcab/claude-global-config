#!/usr/bin/env node
/**
 * ON-DEMAND check, deliberately NOT part of the selftest: compares the committed engram DDL fixture
 * (`engram-v3-schema.mjs`) with the live engram database's `sqlite_master`, so a schema change in a newer
 * engram is noticed and the fixture re-captured.
 *
 *   node odd-mirror-guard/schema-drift-check.mjs        exit 0 same, 1 drift, 2 no live database to compare
 *
 * @es Chequeo BAJO DEMANDA, a propósito fuera del selftest: compara el DDL fijo de engram con el
 * `sqlite_master` de la base viva, para notar un cambio de esquema en un engram nuevo y recapturar el fixture.
 * Salida 0 igual, 1 deriva, 2 sin base viva que comparar.
 */

import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { defaultDatabasePath } from '../backlog-owner-guard/resolve-topic-key.mjs';
import { ENGRAM_SCHEMA_CAPTURE, OBSERVATIONS_DDL, SESSIONS_DDL } from './engram-v3-schema.mjs';

const databasePath = defaultDatabasePath();

if (!existsSync(databasePath)) {
  process.stdout.write(`NOT MEASURED: no live engram database at ${databasePath} @es sin base viva en ${databasePath}\n`);
  process.exit(2);
}

const live = new DatabaseSync(databasePath, { readOnly: true });
const ddl = (name) => live.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)?.sql;
const drift = [['sessions', SESSIONS_DDL], ['observations', OBSERVATIONS_DDL]].filter(([name, fixture]) => ddl(name) !== fixture).map(([name]) => name);

live.close();

if (drift.length > 0) {
  process.stdout.write(`DRIFT: ${drift.join(', ')} differ from the fixture captured with engram ${ENGRAM_SCHEMA_CAPTURE.engramVersion} on ${ENGRAM_SCHEMA_CAPTURE.capturedOn}. @es DERIVA: re-capture the fixture.\n`);
  process.exit(1);
}

process.stdout.write(`OK: the fixture matches the live schema (engram ${ENGRAM_SCHEMA_CAPTURE.engramVersion}, ${ENGRAM_SCHEMA_CAPTURE.capturedOn}). @es el fixture coincide con el esquema vivo.\n`);
