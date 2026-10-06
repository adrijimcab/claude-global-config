#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `baseline-record/counts.mjs`: the per-guard journal line counts and the hook
 * registry entry counts. Every case runs on a home CONSTRUCTED in a temp directory, never the real one.
 *
 * THE STATE SPACE: journals (several guards, a nested journal, a file without a trailing newline, an empty
 * file, a non-journal file, a `.jsonl` outside a state directory, no journals at all), the registry
 * (settings with several events, groups and hooks; manifests of different sizes, a non-manifest file, a
 * broken manifest; sidecars tracked, untracked, git-ignored, nested; no git repository; no settings file).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `counts.mjs`: líneas de journal por guardia y entradas del registro de
 * hooks. Cada caso corre sobre un home CONSTRUIDO en un directorio temporal, nunca el real. Espacio de
 * estados: journals (varias guardias, uno anidado, sin salto final, vacío, ajeno al estado, ninguno) y
 * registro (settings con varios eventos, manifiestos, uno roto, sidecars rastreados, sin rastrear, ignorados
 * por git, sin repositorio, sin settings).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { journalCounts, registryCounts } from './counts.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('baseline-record');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** What `action` returns; a throw is a failed check, never a crash of the selftest. @es Lo que devuelve `action`; un fallo es un check fallido. */
function attempt(action) {
  try {
    return action();
  } catch (error) {
    failures.push(`threw — ${error.message}`);

    return {};
  }
}

const scratch = mkdtempSync(path.join(tmpdir(), 'counts-selftest-'));
let counter = 0;

/** A constructed home holding the given files. @es Un home construido con esos ficheros. */
function makeHome(files) {
  counter += 1;
  const home = path.join(scratch, `home-${counter}`);

  mkdirSync(home, { recursive: true });

  for (const [relative, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(home, relative)), { recursive: true });
    writeFileSync(path.join(home, relative), content);
  }

  return home;
}

const git = (home, ...args) => spawnSync('git', ['-C', home, ...args], { encoding: 'utf8' });

// --- journals ---
{
  const home = makeHome({
    'alpha/state/decisions.jsonl': '{"a":1}\n{"a":2}\n{"a":3}\n',
    'alpha/state/deep/more.jsonl': '{"d":1}\n',
    'beta/state/last.jsonl': '{"b":1}\n{"b":2}',
    'beta/state/empty.jsonl': '',
    'beta/state/notes.txt': 'not a journal\nat all\n',
    'gamma/elsewhere/loose.jsonl': 'not in a state dir\n',
    'failure-capture/state/incidents.jsonl': '{"i":1}\n{"i":2}\n'
  });
  const counts = attempt(() => journalCounts(home));

  check('journals: lines are counted per guard, summed across its journals', counts.perGuard, { alpha: 4, beta: 2, 'failure-capture': 2 });
  check('journals: the total is the sum of every journal', counts.totalLines, 8);
  check('journals: every journal is listed with its own count, in path order', counts.files?.map((entry) => [entry.file, entry.lines]), [['alpha/state/decisions.jsonl', 3], ['alpha/state/deep/more.jsonl', 1], ['beta/state/empty.jsonl', 0], ['beta/state/last.jsonl', 2], ['failure-capture/state/incidents.jsonl', 2]]);
  check('journals: a file without a trailing newline keeps its last line', counts.files?.find((entry) => entry.file === 'beta/state/last.jsonl')?.lines, 2);
  check('journals: a guard with no journal is absent, not zero', Object.hasOwn(counts.perGuard ?? {}, 'gamma'), false);

  const none = attempt(() => journalCounts(makeHome({ 'alpha/readme.md': 'x' })));

  check('journals: a home with no journal counts zero, without failing', [none.perGuard, none.totalLines, none.files], [{}, 0, []]);
}

// --- registry ---
{
  const home = makeHome({
    'settings.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: 'a' }, { command: 'b' }] }, { hooks: [{ command: 'c' }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ command: 'd' }, { command: 'e' }] }], SessionStart: [], Notification: [{ matcher: 'x' }] } }),
    'hook-dispatch/manifests/nested.json/inner.txt': 'a directory named like a manifest',
    'hook-dispatch/manifests/stop.json': JSON.stringify({ event: 'Stop', guards: ['a', 'b', 'c'] }),
    'hook-dispatch/manifests/pre.json': JSON.stringify({ event: 'PreToolUse', guards: ['a'] }),
    'hook-dispatch/manifests/readme.txt': 'not a manifest',
    'hook-dispatch/manifests/broken.json': '{ not json',
    'guard-one/guard.mjs.hook-registration.json': '{}',
    'guard-two/deep/guard.mjs.hook-registration.json': '{}',
    'guard-three/guard.mjs.hook-registration.json': '{}',
    'ignored/guard.mjs.hook-registration.json': '{}',
    '.gitignore': '/ignored/\n'
  });

  git(home, 'init', '-q');
  git(home, 'add', '.gitignore', 'guard-one');

  const registry = attempt(() => registryCounts(home));

  check('registry: every event is counted by groups and by hooks', registry.settings?.events, { Stop: { groups: 2, hooks: 3 }, PreToolUse: { groups: 1, hooks: 2 }, SessionStart: { groups: 0, hooks: 0 }, Notification: { groups: 1, hooks: 0 } });
  check('registry: the settings total is the sum of every hook', registry.settings?.totalHooks, 5);
  check('registry: each manifest is counted by its guards, a non-manifest and a directory are skipped, a broken one is named', Object.entries(registry.manifests?.files ?? {}).sort(), [['broken.json', 'unreadable'], ['pre.json', 1], ['stop.json', 3]]);
  check('registry: the manifest total sums only readable manifests', registry.manifests?.totalGuards, 4);
  check('registry: sidecars are tracked plus untracked, nested included, ignored excluded', registry.sidecars, 3);

  const bare = attempt(() => registryCounts(makeHome({ 'settings.json': '{}' })));

  check('registry: a home that is no git repository cannot count sidecars, and says so', bare.sidecars, 'unmeasurable');
  check('registry: settings with no hooks count zero', [bare.settings?.events, bare.settings?.totalHooks], [{}, 0]);
  check('registry: no manifests directory counts zero', [bare.manifests?.files, bare.manifests?.totalGuards], [{}, 0]);

  const missing = attempt(() => registryCounts(makeHome({})));

  check('registry: a missing settings file is named, not zero', missing.settings, 'unreadable');
}

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
