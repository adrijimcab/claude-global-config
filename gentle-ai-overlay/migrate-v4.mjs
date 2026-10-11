#!/usr/bin/env node
/**
 * The host step of the move to gentle-ai v4 (ODD), and its way back. It is run AFTER the owner configuration that
 * matches v4 is in the home (this file ships with it), with gentle-ai 4.0.0 already installed:
 *
 *   node ~/.claude/gentle-ai-overlay/migrate-v4.mjs                 plan only, writes nothing
 *   node ~/.claude/gentle-ai-overlay/migrate-v4.mjs --apply         back up, remove, sync, verify
 *   node ~/.claude/gentle-ai-overlay/migrate-v4.mjs --rollback <backup dir> [--apply]   with gentle-ai 2.9.1 installed
 *
 * The migration saves every path it changes and the whole `~/.gentle-ai` under `~/.gentle-ai-migrations/v4-<time>/`,
 * removes the paths `migrate-v4-plan.mjs` names, drops the retired preflight hook, syncs through the overlay wrapper
 * (which re-applies the owner customizations), pins the snapshot that sync took, and verifies. The rollback runs
 * `gentle-ai restore <that snapshot>` and then puts every saved path back. Each direction REFUSES (exit 2) unless
 * `gentle-ai --version` is the version it needs. Exit 0 done, 1 a step or a check failed, 2 refused.
 * `--gentle-ai-node-script <file>` runs a node script as gentle-ai and `--overlay <dir>` names the overlay: both
 * exist for the selftest, which never touches a real home.
 *
 * @es El paso de host del cambio a gentle-ai v4 (ODD), y su vuelta atrás. Se corre DESPUÉS de que la configuración
 * del dueño que corresponde a v4 esté en el home (este fichero viene con ella), con gentle-ai 4.0.0 ya instalado.
 * La migración guarda cada ruta que cambia y todo `~/.gentle-ai` bajo `~/.gentle-ai-migrations/v4-<hora>/`, quita
 * las rutas que nombra `migrate-v4-plan.mjs`, elimina el hook de preflight retirado, sincroniza con el envoltorio
 * del overlay (que reaplica las personalizaciones del dueño), fija la instantánea que tomó ese sync y verifica. La
 * vuelta atrás corre `gentle-ai restore <esa instantánea>` y luego devuelve cada ruta guardada. Cada sentido se
 * RECHAZA (salida 2) si `gentle-ai --version` no es la versión que necesita. Salida 0 hecho, 1 falló un paso o una
 * comprobación, 2 rechazado.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { MIGRATE_V4_MESSAGES } from './migrate-v4-messages.mjs';
import { MIGRATE_VERSION, PATHS_REMOVED_BEFORE_SYNC, RE_RENDERED_AGENTS, RETIRED_PATHS, ROLLBACK_VERSION, SETTINGS_PATH, versionOf, withoutPreflightHook } from './migrate-v4-plan.mjs';
import { assertNoLink, inside, restoreSet, saveSet } from './migration-backup.mjs';

const SYNC_ARGS = ['--agent', 'claude-code', '--scope', 'global'];
const OWNERSHIP = '.claude/agents/.gentle-ai-native-agent-ownership.json';
/** Everything the migration saves before it changes anything. @es Todo lo que la migración guarda antes de cambiar nada. */
const SAVED_PATHS = ['.gentle-ai/', ...PATHS_REMOVED_BEFORE_SYNC, SETTINGS_PATH, '.claude/CLAUDE.md', '.claude/gentle-ai-overlay/lazy/', OWNERSHIP];
const RECORD = 'migration.json';
const PINNED = 'gentle-ai-snapshot';
const speaker = makeSpeaker(MIGRATE_V4_MESSAGES);

const FLAG_OF = { home: '--home', gentleAi: '--gentle-ai', script: '--gentle-ai-node-script', overlay: '--overlay', rollback: '--rollback' };

/** Flags in, options out; `missing` names a flag given without its value. @es Flags entran, opciones salen; `missing` nombra un flag sin valor. */
function optionsOf(argv) {
  const valueOf = (flag) => {
    const at = argv.indexOf(flag);
    if (at < 0) return undefined;
    const value = argv[at + 1];
    return value === undefined || value.startsWith('--') ? null : value;
  };
  const named = Object.fromEntries(Object.entries(FLAG_OF).map(([name, flag]) => [name, valueOf(flag)]));
  const missing = Object.entries(named).find(([, value]) => value === null);
  if (missing !== undefined) return { missing: FLAG_OF[missing[0]] };
  const home = path.resolve(named.home ?? homedir());
  return { ...named, home, apply: argv.includes('--apply'), overlay: path.resolve(named.overlay ?? path.join(home, '.claude', 'gentle-ai-overlay')) };
}

/** How every child process is run: the home pinned, the chosen gentle-ai first. @es Cómo corre cada proceso hijo: el home fijado y el gentle-ai elegido primero. */
function childWorld(options) {
  const env = { ...process.env, HOME: options.home, USERPROFILE: options.home, GENTLE_AI_OVERLAY_HOME: options.home };
  if (options.script !== undefined) env.GENTLE_AI_OVERLAY_CLI_SCRIPT = options.script;
  if (options.gentleAi !== undefined) env.PATH = `${path.dirname(path.resolve(options.gentleAi))}${path.delimiter}${env.PATH ?? ''}`;
  const gentleAi = options.script !== undefined ? [process.execPath, options.script] : [options.gentleAi ?? 'gentle-ai'];
  const run = (command, args, stdio = 'pipe') => spawnSync(command, args, { env, encoding: 'utf8', stdio, windowsHide: true });
  return { gentleAi: (args, stdio) => run(gentleAi[0], [...gentleAi.slice(1), ...args], stdio), node: (script, args, stdio) => run(process.execPath, [script, ...args], stdio), shown: gentleAi.join(' ') };
}

/** The installed version is the one this direction needs, or the refusal is printed. @es La versión instalada es la que necesita este sentido, o se imprime el rechazo. */
function versionHolds(world, expected) {
  const answer = world.gentleAi(['--version']);
  const actual = versionOf(answer.stdout) ?? `${answer.stdout ?? ''}${answer.stderr ?? ''}`.trim();
  if (actual === expected) return true;
  speaker.complain('refused.version', { expected, command: world.shown, actual });
  return false;
}

const present = (home, relative) => existsSync(inside(home, relative));
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const snapshotsIn = (home) => (present(home, '.gentle-ai/backups') ? readdirSync(inside(home, '.gentle-ai/backups')) : []);
const preflightHooksIn = (home) => (present(home, SETTINGS_PATH) ? withoutPreflightHook(readJson(inside(home, SETTINGS_PATH))).removed : 0);
const stamp = () => new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replace('.', '-');

/** The migration itself, once the version holds. @es La migración en sí, una vez que la versión se cumple. */
function migrate(options, world) {
  const { home } = options;
  const backup = inside(home, path.join('.gentle-ai-migrations', `v4-${stamp()}`));
  const sync = `node "${path.join(options.overlay, 'sync.mjs')}" ${SYNC_ARGS.join(' ')}`;
  if (!options.apply) {
    speaker.say('plan.header.migrate', { version: MIGRATE_VERSION });
    speaker.say('plan.backup', { dir: backup });
    speaker.say('plan.remove', { present: PATHS_REMOVED_BEFORE_SYNC.filter((relative) => present(home, relative)).length, total: PATHS_REMOVED_BEFORE_SYNC.length });
    speaker.say('plan.hook', { count: preflightHooksIn(home) });
    speaker.say('plan.sync', { command: sync });
    speaker.say('plan.verify');
    return 0;
  }
  const before = new Set(snapshotsIn(home));
  speaker.say('step.saved', { count: saveSet({ home, paths: SAVED_PATHS, into: backup }).entries.length, dir: backup });
  const removable = PATHS_REMOVED_BEFORE_SYNC.filter((relative) => present(home, relative));
  removable.forEach((relative) => assertNoLink(inside(home, relative)));
  removable.forEach((relative) => rmSync(inside(home, relative), { recursive: true, force: true }));
  speaker.say('step.removed', { count: removable.length });
  if (present(home, SETTINGS_PATH)) {
    const { settings, removed } = withoutPreflightHook(readJson(inside(home, SETTINGS_PATH)));
    if (removed > 0) writeFileSync(inside(home, SETTINGS_PATH), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    speaker.say('step.hook', { count: removed });
  }
  const synced = world.node(path.join(options.overlay, 'sync.mjs'), SYNC_ARGS, 'inherit');
  const taken = snapshotsIn(home).filter((id) => !before.has(id));
  writeFileSync(path.join(backup, RECORD), `${JSON.stringify({ to: MIGRATE_VERSION, from: ROLLBACK_VERSION, snapshot: taken.at(-1) ?? null }, null, 2)}\n`, 'utf8');
  if (taken.length > 0) {
    cpSync(inside(home, path.join('.gentle-ai', 'backups', taken.at(-1))), path.join(backup, PINNED, taken.at(-1)), { recursive: true, preserveTimestamps: true });
    speaker.say('step.snapshot', { id: taken.at(-1) });
  } else speaker.say('step.snapshot.none');
  if (synced.status !== 0) {
    speaker.complain('step.sync.failed', { status: synced.status, dir: backup, version: ROLLBACK_VERSION });
    return 1;
  }
  return verify(options, world, backup);
}

/** Every check of a finished migration, printed; 0 only when all hold. @es Cada comprobación de una migración terminada, impresa; 0 solo si todas se cumplen. */
function verify(options, world, backup) {
  const { home } = options;
  const checks = {
    'check.overlay': world.node(path.join(options.overlay, 'check.mjs'), ['--home', home]).status === 0,
    'check.retired': RETIRED_PATHS.every((relative) => !present(home, relative)),
    'check.hook': preflightHooksIn(home) === 0,
    'check.agents': RE_RENDERED_AGENTS.every((relative) => present(home, relative)),
    'check.dryRun': world.gentleAi(['sync', ...SYNC_ARGS, '--dry-run']).status === 0,
  };
  Object.entries(checks).forEach(([id, held]) => speaker.data(`${held ? 'HELD  ' : 'FAILED'} ${speaker.line(id)}`));
  const failed = Object.values(checks).filter((held) => !held).length;
  if (failed === 0) speaker.say('verify.done', { version: MIGRATE_VERSION, dir: backup });
  else speaker.complain('verify.failed', { failed, dir: backup, version: ROLLBACK_VERSION });
  return failed === 0 ? 0 : 1;
}

/** The way back, once the version holds. @es La vuelta atrás, una vez que la versión se cumple. */
function rollback(options, world) {
  const { home } = options;
  const backup = path.resolve(options.rollback);
  const { snapshot } = readJson(path.join(backup, RECORD));
  const count = readJson(path.join(backup, 'manifest.json')).entries.length;
  if (!options.apply) {
    speaker.say('plan.header.rollback', { version: ROLLBACK_VERSION });
    speaker.say('plan.rollback', { snapshot: String(snapshot), count, dir: backup });
    return 0;
  }
  if (snapshot !== null) {
    const live = inside(home, path.join('.gentle-ai', 'backups', snapshot));
    if (!existsSync(live)) cpSync(path.join(backup, PINNED, snapshot), live, { recursive: true, preserveTimestamps: true });
    const restored = world.gentleAi(['restore', snapshot, '--yes'], 'inherit');
    if (restored.status !== 0) {
      speaker.complain('rollback.restore.failed', { snapshot, status: restored.status });
      return 1;
    }
  }
  restoreSet({ home, from: backup });
  speaker.say('rollback.done', { snapshot: String(snapshot), count, dir: backup });
  return 0;
}

export function main(argv) {
  if (argv.includes('--help')) {
    speaker.say('usage');
    return 0;
  }
  const options = optionsOf(argv);
  if (options.missing !== undefined) {
    speaker.complain('refused.flag', { flag: options.missing });
    return 2;
  }
  const world = childWorld(options);
  const rollingBack = options.rollback !== undefined;
  if (!versionHolds(world, rollingBack ? ROLLBACK_VERSION : MIGRATE_VERSION)) return 2;
  return rollingBack ? rollback(options, world) : migrate(options, world);
}

const isEntryPoint = () => {
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (process.argv[1] !== undefined && isEntryPoint()) process.exitCode = main(process.argv.slice(2));
