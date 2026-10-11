#!/usr/bin/env node
/**
 * Proof that a capture is never lost between the spool and the ledger: `reconcile` removes a spooled
 * entry only AFTER every ledger it touched was written, a ledger is replaced atomically (temp file +
 * rename, so a crash mid-write cannot leave a half ledger), and an incident is logged only for a fold
 * that reached the ledger. The failure is injected with a read-only ledger. Every fixture is CONSTRUCTED
 * in a temporary directory: the real ledger and spool are never read or written.
 *
 * @es Prueba de que una captura nunca se pierde entre el spool y el ledger: `reconcile` borra una entrada
 * del spool solo DESPUÉS de escribir cada ledger que tocó, un ledger se reemplaza de forma atómica (fichero
 * temporal + renombrado, así una caída a media escritura no deja un ledger a medias) y un incidente se
 * registra solo para un pliegue que llegó al ledger. El fallo se inyecta con un ledger de solo lectura.
 * Todo fixture se CONSTRUYE en un directorio temporal: nunca se toca el ledger ni el spool reales.
 */

import { chmodSync, existsSync, linkSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isolateState, stateDirIn } from '../hook-state/locations.mjs';
import { makeCaptureWorld } from './capture-world.mjs';
import { writeLedger } from './ledgers.mjs';

isolateState('failure-capture');

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-reconcile-order-')));
// Removed on every exit, a throw included. @es Se elimina en toda salida, también ante una excepción.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 500)}`));

const HEAD = '# Lessons Ledger — global\n\n---\n';
const lessonFor = (key) => `what went wrong for ${key} -> root cause -> RULE: do it right every time`;
const captureOf = (world, key) => world.run(['capture', '--key', key, '--scope', 'global', '--actor', 'orchestrator', '--lesson', lessonFor(key)]);
const spoolOf = (world) => {
  const dir = path.join(stateDirIn(path.join(world.home, '.claude'), 'failure-capture'), 'spool');

  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.json') && !name.startsWith('.')) : [];
};
const linesOf = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line.length > 0) : []);
const markersIn = (text, key) => text.split(`<!--fc:${key}#`).length - 1;

// --- a ledger that cannot be written leaves the capture in the spool, and logs nothing ----------------
{
  const world = makeCaptureWorld({ scratch, name: 'unwritable', files: { 'home/.claude/lessons-ledger.md': HEAD } });

  chmodSync(world.ledger, 0o444);

  const failed = captureOf(world, 'first-lesson');

  check('a capture whose ledger cannot be written does not exit 0', failed.status !== 0, failed.out);
  check('...and its spooled entry is still there, so the lesson is not lost', spoolOf(world).length === 1, `spool: ${JSON.stringify(spoolOf(world))} | ${failed.out}`);
  check('...and no incident was logged for a fold that never reached the ledger', linesOf(world.incidents).length === 0, linesOf(world.incidents).join(' | '));

  check('...and the failed write left no temporary file beside the ledger', readdirSync(path.dirname(world.ledger)).filter((name) => name.endsWith('.tmp')).length === 0, readdirSync(path.dirname(world.ledger)).join(', '));

  chmodSync(world.ledger, 0o666);

  const retried = captureOf(world, 'second-lesson');

  check('once the ledger is writable again the next capture exits 0', retried.status === 0, retried.out);

  const ledger = readFileSync(world.ledger, 'utf8');

  check('...and the held entry is folded exactly once, beside the new one', markersIn(ledger, 'first-lesson') === 1 && markersIn(ledger, 'second-lesson') === 1, ledger);
  check('...with one incident per capture and an empty spool', linesOf(world.incidents).length === 2 && spoolOf(world).length === 0, `${linesOf(world.incidents).length} incidents, spool ${JSON.stringify(spoolOf(world))}`);
}

// --- the success path still empties the spool and logs one incident ------------------------------------
{
  const world = makeCaptureWorld({ scratch, name: 'plain', files: { 'home/.claude/lessons-ledger.md': HEAD } });
  const done = captureOf(world, 'plain-lesson');

  check('a plain capture exits 0', done.status === 0, done.out);
  check('...the ledger holds the lesson once', markersIn(readFileSync(world.ledger, 'utf8'), 'plain-lesson') === 1);
  check('...the spool is empty and one incident was logged', spoolOf(world).length === 0 && linesOf(world.incidents).length === 1, `${spoolOf(world).length} spooled, ${linesOf(world.incidents).length} incidents`);
}

// --- a ledger is REPLACED, never overwritten in place --------------------------------------------------
{
  const file = path.join(scratch, 'atomic-ledger.md');
  const alias = path.join(scratch, 'atomic-alias.md');

  writeFileSync(file, 'before\n', 'utf8');
  linkSync(file, alias);
  writeLedger({ file, lines: ['after'] });

  check('writeLedger writes the new text to the ledger path', readFileSync(file, 'utf8') === 'after');
  check('...by replacing the file (a hard link to the old one still reads the old text), so a crash mid-write cannot leave a half ledger', readFileSync(alias, 'utf8') === 'before\n', readFileSync(alias, 'utf8'));
  check('...and leaves no temporary file beside it', readdirSync(scratch).filter((name) => name.includes('atomic-ledger') && name !== 'atomic-ledger.md').length === 0, readdirSync(scratch).join(', '));
}

console.log(`reconcile-order selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
