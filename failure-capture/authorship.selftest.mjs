#!/usr/bin/env node
/**
 * Proof that `capture.mjs` journals WHO wrote the home configuration it changed, so the turn guard of a
 * different session is never blamed for it (`config-sync-guard/authored-writes.mjs`). Driven end to end:
 * the real `capture.mjs` runs in a CONSTRUCTED world (a temporary home holding a copy of the loop), with
 * `--session`, and the journal it leaves in that world's state is read back and matched against the
 * ledger's real mtime. The real home, ledger and journal are never read or written.
 *
 * @es Prueba de que `capture.mjs` registra QUIÉN escribió la configuración del home que cambió, para que
 * la guardia de turno de OTRA sesión no cargue con ella. De punta a punta: el `capture.mjs` real corre en un
 * mundo CONSTRUIDO (un home temporal con copia del bucle), con `--session`, y el journal que deja en el
 * estado de ese mundo se relee y se compara con el mtime real del ledger. Nunca se toca el home real.
 */

import { existsSync, mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { authorsAt, readAuthoredWrites } from '../config-sync-guard/authored-writes.mjs';
import { isolateState, stateDirIn } from '../hook-state/locations.mjs';
import { lessonFor, makeCaptureWorld } from './capture-world.mjs';

isolateState('failure-capture');

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-authorship-')));
// Removed on every exit, a throw included. @es Se elimina en toda salida, también ante una excepción.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 500)}`));

const world = makeCaptureWorld({ scratch, name: 'authorship', files: { 'home/.claude/lessons-ledger.md': '# Lessons Ledger — global\n\n---\n' } });
const journal = path.join(stateDirIn(path.join(world.home, '.claude'), 'config-sync-guard'), 'authored-writes.jsonl');
const capture = (session, key) => world.run(['capture', '--key', key, '--scope', 'global', '--actor', 'orchestrator', '--lesson', lessonFor(key), '--session', session]);
const authorsOfLedger = () => authorsAt(readAuthoredWrites(journal), world.ledger, statSync(world.ledger).mtimeMs);

const first = capture('session-a', 'first-lesson');

check('the first capture exits 0', first.status === 0, first.out);
check('the ledger it wrote is credited to its session at the ledger\'s real mtime', JSON.stringify(authorsOfLedger()) === '["session-a"]', `${JSON.stringify(authorsOfLedger())} | ${first.out}`);

const second = capture('session-b', 'second-lesson');

check('the second capture exits 0', second.status === 0, second.out);
check('the ledger now belongs to the session that wrote it last, and to no other', JSON.stringify(authorsOfLedger()) === '["session-b"]', `${JSON.stringify(authorsOfLedger())} | ${second.out}`);

const recorded = readAuthoredWrites(journal).length;
const reading = world.run(['keys']);

check('a command that writes nothing adds nothing to the journal', reading.status === 0 && readAuthoredWrites(journal).length === recorded, `${reading.out} | ${String(readAuthoredWrites(journal).length)} vs ${String(recorded)}`);
check('only the files that changed are journaled, not the whole configuration', readAuthoredWrites(journal).every((record) => record.path.endsWith('lessons-ledger.md')), JSON.stringify(readAuthoredWrites(journal)));
check('the journal lives in the world\'s own state', existsSync(journal), journal);

process.stdout.write(`authorship.selftest: ${String(passed)} passed, ${String(failures.length)} failed\n`);

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);

process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
