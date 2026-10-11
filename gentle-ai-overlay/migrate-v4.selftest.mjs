#!/usr/bin/env node
/**
 * Proves the v4 migration DISCRIMINATES, on constructed homes only (never a real one): the plan's hook removal on
 * the hook alone, beside another hook, and on a near miss; the version reader; the saved set across files,
 * directories, absent paths, links and paths that climb out; and the CLI through a fake gentle-ai and a stub
 * overlay: refused on the wrong version, a dry run that writes nothing, a migration that removes, syncs, pins and
 * verifies, a failing sync, a failing check, and a rollback that gives the home back byte for byte, also when the
 * pinned snapshot was pruned. Every printed line carries both languages.
 *
 * @es Prueba que la migración a v4 DISCRIMINA, solo sobre homes construidos: la eliminación del hook sola, junto a
 * otro hook y ante un casi-acierto; el lector de versión; el conjunto guardado con ficheros, directorios, rutas
 * ausentes, enlaces y rutas que salen del home; y el CLI con un gentle-ai falso y un overlay de mentira: rechazo
 * con la versión equivocada, simulación que no escribe, migración que quita, sincroniza, fija y verifica, un sync
 * que falla, un check que falla y una vuelta atrás que devuelve el home byte a byte, también si la instantánea
 * fijada fue podada. Toda línea impresa lleva los dos idiomas.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATHS_REMOVED_BEFORE_SYNC, RE_RENDERED_AGENTS, RETIRED_PATHS, versionOf, withoutPreflightHook } from './migrate-v4-plan.mjs';
import { restoreSet, saveSet } from './migration-backup.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const roots = [];
const results = [];
const test = (name, body) => {
  try {
    body();
    results.push(`PASS ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}\n     ${error.message}`);
  }
};
const expect = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const root = () => {
  const made = mkdtempSync(path.join(tmpdir(), 'migrate-v4-selftest-'));
  roots.push(made);
  return made;
};
const put = (base, relative, text) => {
  mkdirSync(path.dirname(path.join(base, relative)), { recursive: true });
  writeFileSync(path.join(base, relative), text, 'utf8');
};
/** Every file under `base` with its bytes, sorted. @es Cada fichero bajo `base` con sus bytes, ordenado. */
const treeOf = (base, skip = []) => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      const relative = path.relative(base, full).split(path.sep).join('/');
      if (skip.some((prefix) => relative.startsWith(prefix))) return [];
      return statSync(full).isDirectory() ? walk(full) : [[relative, readFileSync(full, 'utf8')]];
    });
  return Object.fromEntries(walk(base).sort());
};

// ---------------------------------------------------------------- the plan

const PREFLIGHT = { type: 'command', command: 'gentle-ai sdd-preflight-hook --agent claude-code', timeout: 30 };
const OTHER = { type: 'command', command: 'node dispatch.mjs pretooluse-delegation.json' };
const settingsWith = (entries) => ({ theme: 'auto', hooks: { SessionStart: [{ matcher: '', hooks: [OTHER] }], PreToolUse: entries }, effortLevel: 'high' });

test('plan: the preflight hook alone in its entry -> the entry is dropped, the rest kept in order', () => {
  const { settings, removed } = withoutPreflightHook(settingsWith([{ matcher: 'Bash', hooks: [OTHER] }, { matcher: 'Agent', hooks: [PREFLIGHT] }]));
  expect(removed, 1, 'removed');
  expect(settings, settingsWith([{ matcher: 'Bash', hooks: [OTHER] }]), 'settings');
});
test('plan: the preflight hook beside another hook -> only it goes, the entry stays', () => {
  const { settings, removed } = withoutPreflightHook(settingsWith([{ matcher: 'Agent', hooks: [OTHER, PREFLIGHT] }]));
  expect([removed, settings.hooks.PreToolUse], [1, [{ matcher: 'Agent', hooks: [OTHER] }]], 'entry');
});
test('plan near miss: a command that only mentions the preflight is kept; no hooks at all is unchanged', () => {
  const echo = { type: 'command', command: 'echo gentle-ai sdd-preflight-hook' };
  expect(withoutPreflightHook(settingsWith([{ matcher: 'Agent', hooks: [echo] }])).removed, 0, 'mention');
  expect(withoutPreflightHook({ theme: 'auto' }), { settings: { theme: 'auto' }, removed: 0 }, 'no hooks');
});
test('plan: the version reader takes only `gentle-ai <version>`', () => {
  expect([versionOf('gentle-ai 4.0.0\n'), versionOf('gentle-ai 4.0.0 (dev)'), versionOf('other 4.0.0'), versionOf('')], ['4.0.0', undefined, undefined, undefined], 'versions');
});
test('plan: 38 retired paths and 8 re-rendered agents, all under .claude, none twice', () => {
  expect([RETIRED_PATHS.length, RE_RENDERED_AGENTS.length, new Set(PATHS_REMOVED_BEFORE_SYNC).size], [38, 8, 46], 'counts');
  expect(PATHS_REMOVED_BEFORE_SYNC.every((relative) => relative.startsWith('.claude/')), true, 'under .claude');
});

// ---------------------------------------------------------------- the saved set

test('saved set: a file, a directory and an absent path come back exactly; a path created later is removed', () => {
  const home = root();
  put(home, 'a/file.md', 'uno — ñandú');
  put(home, 'tree/x/y.md', 'deep 日本');
  const into = path.join(root(), 'backup');
  expect(saveSet({ home, paths: ['a/file.md', 'tree/', 'absent.md'], into }).entries.map((entry) => entry.existed), [true, true, false], 'existed');
  const before = treeOf(home);
  put(home, 'a/file.md', 'changed');
  rmSync(path.join(home, 'tree'), { recursive: true });
  put(home, 'absent.md', 'created later');
  restoreSet({ home, from: into });
  expect(treeOf(home), before, 'home after restore');
});
test('saved set refuses: an existing backup, a path climbing out, a link, a saved copy gone missing', () => {
  const home = root();
  put(home, 'kept.md', 'k');
  const into = path.join(root(), 'backup');
  saveSet({ home, paths: ['kept.md'], into });
  const throws = (body, label) => {
    let thrown = '';
    try {
      body();
    } catch (error) {
      thrown = error.message;
    }
    expect(thrown.includes('@es'), true, `${label} refused bilingually (${thrown})`);
  };
  throws(() => saveSet({ home, paths: ['kept.md'], into }), 'existing backup');
  throws(() => saveSet({ home, paths: ['../outside.md'], into: path.join(root(), 'b') }), 'climbing out');
  mkdirSync(path.join(home, 'target'));
  symlinkSync(path.join(home, 'target'), path.join(home, 'linked'), 'junction');
  throws(() => saveSet({ home, paths: ['linked'], into: path.join(root(), 'c') }), 'link');
  rmSync(path.join(into, 'files', 'kept.md'));
  throws(() => restoreSet({ home, from: into }), 'missing saved copy');
  expect(readFileSync(path.join(home, 'kept.md'), 'utf8'), 'k', 'nothing removed by a refused restore');
});

// ---------------------------------------------------------------- the CLI, on a constructed home

const FAKE_CLI = `import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
appendFileSync(path.join(dir, 'calls.log'), JSON.stringify(args) + '\\n');
const setting = (name, fallback) => (existsSync(path.join(dir, name)) ? readFileSync(path.join(dir, name), 'utf8').trim() : fallback);
if (args[0] === '--version') console.log('gentle-ai ' + setting('version.txt', '4.0.0'));
const restorable = () => existsSync(path.join(process.env.USERPROFILE, '.gentle-ai', 'backups', args[1])) && setting('restore-exit.txt', '0') === '0';
process.exitCode = args[0] === 'sync' ? Number(setting('dryrun-exit.txt', '0')) : args[0] === 'restore' && !restorable() ? 1 : 0;
`;
const STUB_SYNC = `import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const home = process.env.GENTLE_AI_OVERLAY_HOME;
const dir = path.dirname(fileURLToPath(import.meta.url));
const agents = path.join(home, '.claude', 'agents');
mkdirSync(agents, { recursive: true });
for (const name of ${JSON.stringify(RE_RENDERED_AGENTS.map((relative) => path.basename(relative)))}) writeFileSync(path.join(agents, name), 'rendered by v4');
writeFileSync(path.join(agents, '.gentle-ai-native-agent-ownership.json'), '{}');
mkdirSync(path.join(home, '.gentle-ai', 'backups', '20261011000000.1'), { recursive: true });
writeFileSync(path.join(home, '.gentle-ai', 'backups', '20261011000000.1', 'manifest.json'), '{}');
writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'v4 render');
process.exitCode = existsSync(path.join(dir, 'sync-exit.txt')) ? Number(readFileSync(path.join(dir, 'sync-exit.txt'), 'utf8')) : 0;
`;
const STUB_CHECK = `import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
process.exitCode = existsSync(path.join(dir, 'check-exit.txt')) ? Number(readFileSync(path.join(dir, 'check-exit.txt'), 'utf8')) : 0;
`;

/** A home as 2.9.1 leaves it, with a fake gentle-ai and a stub overlay beside it. @es Un home como lo deja 2.9.1, con un gentle-ai falso y un overlay de mentira. */
function world({ version = '4.0.0' } = {}) {
  const base = root();
  const home = path.join(base, 'home');
  PATHS_REMOVED_BEFORE_SYNC.forEach((relative) => put(home, relative.endsWith('/') ? `${relative}SKILL.md` : relative, `2.9.1 ${relative} — ñandú`));
  put(home, '.claude/settings.json', `${JSON.stringify(settingsWith([{ matcher: 'Agent', hooks: [PREFLIGHT] }]), null, 2)}\n`);
  put(home, '.claude/CLAUDE.md', '2.9.1 render');
  put(home, '.claude/gentle-ai-overlay/lazy/review.md', 'stash');
  put(home, '.gentle-ai/state.json', '{"installed_binary_version":"2.9.1"}');
  put(home, '.gentle-ai/backups/20260928000000.1/manifest.json', '{}');
  put(base, 'cli/fake-gentle-ai.mjs', FAKE_CLI);
  put(base, 'cli/version.txt', version);
  put(base, 'overlay/sync.mjs', STUB_SYNC);
  put(base, 'overlay/check.mjs', STUB_CHECK);
  // PATH holds node alone, so no code path, mutated or not, can reach a real gentle-ai. @es PATH lleva solo node,
  // así que ningún camino del código, mutado o no, puede llegar a un gentle-ai real.
  const env = { ...process.env, PATH: path.dirname(process.execPath) };
  const run = (args) => spawnSync(process.execPath, [path.join(HERE, 'migrate-v4.mjs'), '--home', home, '--gentle-ai-node-script', path.join(base, 'cli', 'fake-gentle-ai.mjs'), '--overlay', path.join(base, 'overlay'), ...args], { encoding: 'utf8', env });
  return { base, home, run, calls: () => readFileSync(path.join(base, 'cli', 'calls.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) };
}
const printed = (result) => `${result.stdout}${result.stderr}`.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('HELD') && !line.startsWith('FAILED'));
const bilingual = (result) => printed(result).every((line) => line.includes('@es ') || line.trimStart().startsWith('@es') || line.startsWith('usage') || line.startsWith('       '));
const backupOf = (home) => path.join(home, '.gentle-ai-migrations', readdirSync(path.join(home, '.gentle-ai-migrations'))[0]);

test('CLI: the wrong gentle-ai version -> exit 2, nothing written, refusal in both languages', () => {
  const w = world({ version: '2.9.1' });
  const before = treeOf(w.home);
  const result = w.run(['--apply']);
  expect([result.status, treeOf(w.home)], [2, before], 'exit and home');
  expect(bilingual(result), true, `bilingual (${result.stderr})`);
});
test('CLI: a flag without its value -> exit 2, before the version is even asked', () => {
  const w = world();
  const result = w.run(['--rollback', '--apply']);
  expect([result.status, existsSync(path.join(w.base, 'cli', 'calls.log'))], [2, false], 'exit, no CLI call');
  expect(result.stderr.includes('--rollback needs a value'), true, `names the flag (${result.stderr})`);
  expect(bilingual(result), true, 'bilingual');
});
test('CLI dry run: exit 0, the plan names 46 paths present and 1 hook, nothing written', () => {
  const w = world();
  const before = treeOf(w.home);
  const result = w.run([]);
  expect([result.status, treeOf(w.home)], [0, before], 'exit and home');
  expect(result.stdout.includes('remove 46 of 46') && result.stdout.includes('remove 1 retired'), true, `plan (${result.stdout})`);
  expect(bilingual(result), true, 'bilingual');
});
test('CLI migrate: retired paths gone, agents re-rendered, hook gone, snapshot pinned, verified -> exit 0', () => {
  const w = world();
  const result = w.run(['--apply']);
  expect(result.status, 0, `exit (${result.stdout}${result.stderr})`);
  expect(RETIRED_PATHS.some((relative) => existsSync(path.join(w.home, relative))), false, 'retired gone');
  expect(RE_RENDERED_AGENTS.map((relative) => readFileSync(path.join(w.home, relative), 'utf8')).every((text) => text === 'rendered by v4'), true, 'agents re-rendered');
  expect(withoutPreflightHook(JSON.parse(readFileSync(path.join(w.home, '.claude/settings.json'), 'utf8'))).removed, 0, 'hook gone');
  const backup = backupOf(w.home);
  expect(JSON.parse(readFileSync(path.join(backup, 'migration.json'), 'utf8')).snapshot, '20261011000000.1', 'snapshot recorded');
  expect(existsSync(path.join(backup, 'gentle-ai-snapshot', '20261011000000.1', 'manifest.json')), true, 'snapshot pinned');
  expect(w.calls().some((args) => args.join(' ') === 'sync --agent claude-code --scope global --dry-run'), true, 'dry run verified');
  expect(bilingual(result), true, 'bilingual');
});
for (const [label, file, step] of [['the overlay sync exits 1', 'overlay/sync-exit.txt', 'sync'], ['the overlay check exits 1', 'overlay/check-exit.txt', 'check'], ['the sync dry run exits 1', 'cli/dryrun-exit.txt', 'dry run']]) {
  test(`CLI migrate: ${label} -> exit 1 and the rollback command is printed`, () => {
    const w = world();
    put(w.base, file, '1');
    const result = w.run(['--apply']);
    expect([result.status, result.stderr.includes('--rollback')], [1, true], `${step} (${result.stderr})`);
    expect(bilingual(result), true, 'bilingual');
  });
}
test('CLI rollback: needs 2.9.1, restores the pinned snapshot and gives the home back byte for byte, also after a prune', () => {
  const w = world();
  const before = treeOf(w.home);
  w.run(['--apply']);
  const backup = backupOf(w.home);
  expect(w.run(['--rollback', backup, '--apply']).status, 2, 'refused on 4.0.0');
  put(w.base, 'cli/version.txt', '2.9.1');
  rmSync(path.join(w.home, '.gentle-ai', 'backups', '20261011000000.1'), { recursive: true });
  const migrated = treeOf(w.home);
  const dry = w.run(['--rollback', backup]);
  expect([dry.status, treeOf(w.home)], [0, migrated], 'dry run writes nothing');
  expect(w.calls().some((args) => args[0] === 'restore'), false, 'dry run restores nothing');
  const result = w.run(['--rollback', backup, '--apply']);
  expect(result.status, 0, `exit (${result.stdout}${result.stderr})`);
  expect(w.calls().some((args) => args.join(' ') === 'restore 20261011000000.1 --yes'), true, 'restore ran');
  expect(treeOf(w.home, ['.gentle-ai-migrations/']), before, 'home after rollback');
  expect(bilingual(result) && bilingual(dry), true, 'bilingual');
});

test('CLI rollback: a failing `gentle-ai restore` -> exit 1 and the saved paths are NOT put back', () => {
  const w = world();
  w.run(['--apply']);
  const backup = backupOf(w.home);
  put(w.base, 'cli/version.txt', '2.9.1');
  put(w.base, 'cli/restore-exit.txt', '1');
  const migrated = treeOf(w.home);
  const result = w.run(['--rollback', backup, '--apply']);
  expect([result.status, treeOf(w.home)], [1, migrated], 'exit and home');
  expect(bilingual(result), true, 'bilingual');
});

roots.forEach((made) => rmSync(made, { recursive: true, force: true }));
results.forEach((line) => console.log(line));
const failed = results.filter((line) => line.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed @es ${results.length - failed}/${results.length} correctos`);
process.exitCode = failed === 0 ? 0 : 1;
