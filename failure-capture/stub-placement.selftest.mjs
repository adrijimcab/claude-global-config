#!/usr/bin/env node
/**
 * Proof that a promotion never leaves two stubs for one key: `placeStub` replaces the line the key already
 * has in the stub ledger and only appends when it has none, and `capture.mjs promote` uses it. The command
 * is driven in a CONSTRUCTED world holding both the full line and an earlier stub (the state a crash between
 * the promotion's two writes leaves); the real ledger is never read.
 *
 * @es Prueba de que una promoción nunca deja dos muñones para una clave: `placeStub` reemplaza la línea que
 * la clave ya tiene en el ledger de muñones y solo añade cuando no tiene ninguna, y `capture.mjs promote` lo
 * usa. El comando se maneja en un mundo CONSTRUIDO con la línea completa y un muñón anterior (el estado que
 * deja una caída entre las dos escrituras de la promoción); nunca se lee el ledger real.
 */

import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isolateState } from '../hook-state/locations.mjs';
import { makeCaptureWorld } from './capture-world.mjs';
import { readMarker } from './ledger-line.mjs';
import { placeStub } from './stub-placement.mjs';

isolateState('failure-capture');

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-stub-placement-')));
// Removed on every exit, a throw included. @es Se elimina en toda salida, también ante una excepción.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 500)}`));

const KEY = 'promote-lesson-key';
const OTHER = 'some-other-key';
const stub = (key, date, count) => `- [promoted] ${date} — ${key}: no mechanism <!--fc:${key}#${String(count)}-->`;

// --- the module ----------------------------------------------------------------------------------------
{
  const home = { lines: ['# header', stub(OTHER, '2026-09-01', 2)] };

  check('a key with no line in the stub ledger is appended', placeStub(home, KEY, stub(KEY, '2026-10-11', 3), readMarker) === 'added' && home.lines.length === 3 && home.lines[2] === stub(KEY, '2026-10-11', 3), home.lines.join(' | '));

  const again = placeStub(home, KEY, stub(KEY, '2026-10-12', 4), readMarker);

  check('a key that already has a line is REPLACED, not given a second one', again === 'replaced' && home.lines.length === 3 && home.lines[2] === stub(KEY, '2026-10-12', 4), home.lines.join(' | '));
  check('...and the stubs of other keys are untouched', home.lines[1] === stub(OTHER, '2026-09-01', 2), home.lines.join(' | '));
}

// --- the command ---------------------------------------------------------------------------------------
{
  const REASON = 'a claim written in prose cannot be detected by any hook; measured 0 of 6 recall. @es una afirmación escrita en prosa no la detecta ningún hook; recuerdo medido 0 de 6.';
  const world = makeCaptureWorld({
    scratch,
    name: 'full-line-and-old-stub',
    files: {
      'home/.claude/lessons-ledger.md': `# Lessons Ledger — global\n\n---\n- [global] 2026-09-14 — it recurred -> RULE: do the thing <!--fc:${KEY}#3-->\n`,
      'home/.claude/lessons-promoted.md': `# Promoted lesson stubs — NOT loaded\n\n---\n\n${stub(KEY, '2026-10-01', 2)}\n`,
      'home/.claude/rules/promoted-rules.md': `# Contract\n- (\`${KEY}\`) face one.\n`
    }
  });
  const done = world.run(['promote', '--key', KEY, '--no-mechanism', REASON]);
  const stubs = readFileSync(path.join(world.home, '.claude', 'lessons-promoted.md'), 'utf8');
  const ledger = readFileSync(world.ledger, 'utf8');

  check('promote over a full line that already has a stub exits 0', done.status === 0, done.out);
  check('...the key has exactly one stub afterwards', stubs.split(`<!--fc:${KEY}#`).length - 1 === 1, stubs);
  check('...that stub is the new one (it carries the full line\'s counter)', stubs.includes(`<!--fc:${KEY}#3-->`) && !stubs.includes(`<!--fc:${KEY}#2-->`), stubs);
  check('...and the loaded ledger no longer holds the full line', !ledger.includes(`<!--fc:${KEY}#`), ledger);
}

console.log(`stub-placement selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
