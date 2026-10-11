#!/usr/bin/env node
/**
 * The decisions of the v4 migration, each broken once, that `migrate-v4.selftest.mjs` must catch. The runner and
 * its rules (green unmutated baseline, exactly-once target, parse check) live in `../mutation-proof/run-mutants.mjs`.
 * Each row names the decision it removes, not the line it edits.
 *
 * @es Las decisiones de la migración a v4, rotas una a una, que `migrate-v4.selftest.mjs` debe cazar. Cada fila
 * nombra la decisión que elimina, no la línea que edita.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMutants } from '../mutation-proof/run-mutants.mjs';

const PLAN = 'gentle-ai-overlay/migrate-v4-plan.mjs';
const BACKUP = 'gentle-ai-overlay/migration-backup.mjs';
const CLI = 'gentle-ai-overlay/migrate-v4.mjs';

const MUTANTS = [
  // --- the plan.
  ['a command that only mentions the preflight counts as it', PLAN, 'hook.command.trim().startsWith(PREFLIGHT_COMMAND)', 'hook.command.includes(PREFLIGHT_COMMAND)'],
  ['an entry left without hooks is kept', PLAN, ".filter((entry) => !Array.isArray(entry?.hooks) || entry.hooks.length > 0);", ';'],
  ['the removed hooks are not counted', PLAN, 'removed += entry.hooks.length - remaining.length;', ''],
  ['a version line with extra words is read as a version', PLAN, "return words.length === 2 && words[0] === 'gentle-ai'", "return words[0] === 'gentle-ai'"],
  ['the shared SDD files are not retired', PLAN, '  ...SHARED_SDD_FILES.map((name) => `.claude/skills/_shared/${name}`),\n', ''],
  ['the re-rendered agents are not removed before the sync', PLAN, 'export const PATHS_REMOVED_BEFORE_SYNC = [...RETIRED_PATHS, ...RE_RENDERED_AGENTS];', 'export const PATHS_REMOVED_BEFORE_SYNC = [...RETIRED_PATHS];'],

  // --- the saved set.
  ['a link is followed', BACKUP, 'if (stat.isSymbolicLink()) refuse(', 'if (false) refuse('],
  ['a path may climb out of the home', BACKUP, "back === '' || back.startsWith('..') ||", "back === '' ||"],
  ['a backup is overwritten', BACKUP, 'if (existsSync(into)) refuse(', 'if (false) refuse('],
  ['a path that did not exist is left in place by a restore', BACKUP, '    rmSync(absolute, { recursive: true, force: true });\n', ''],
  ['a saved copy gone missing is not refused', BACKUP, '({ existed, saved }) => existed && !existsSync(saved)', '() => false'],

  // --- the command.
  ['the version is not checked', CLI, 'if (actual === expected) return true;', 'return true;'],
  ['the rollback asks for the migration version', CLI, 'rollingBack ? ROLLBACK_VERSION : MIGRATE_VERSION', 'MIGRATE_VERSION'],
  ['a flag without its value is accepted', CLI, "if (options.missing !== undefined) {", 'if (false) {'],
  ['the migration dry run writes', CLI, "  if (!options.apply) {\n    speaker.say('plan.header.migrate'", "  if (false) {\n    speaker.say('plan.header.migrate'"],
  ['the rollback dry run writes', CLI, "  if (!options.apply) {\n    speaker.say('plan.header.rollback'", "  if (false) {\n    speaker.say('plan.header.rollback'"],
  ['the retired paths are not removed', CLI, '  removable.forEach((relative) => rmSync(inside(home, relative), { recursive: true, force: true }));\n', ''],
  ['the preflight hook stays in settings', CLI, 'if (removed > 0) writeFileSync(', 'if (false) writeFileSync('],
  ['the snapshot is not pinned', CLI, "    cpSync(inside(home, path.join('.gentle-ai', 'backups', taken.at(-1))), path.join(backup, PINNED, taken.at(-1)), { recursive: true, preserveTimestamps: true });\n", ''],
  ['a failed sync is verified as if it worked', CLI, 'if (synced.status !== 0) {', 'if (false) {'],
  ['the overlay check is not run', CLI, "'check.overlay': world.node(path.join(options.overlay, 'check.mjs'), ['--home', home]).status === 0,", "'check.overlay': true,"],
  ['the sync dry run is not run', CLI, "'check.dryRun': world.gentleAi(['sync', ...SYNC_ARGS, '--dry-run']).status === 0,", "'check.dryRun': true,"],
  ['a pruned snapshot is not put back before the restore', CLI, 'if (!existsSync(live)) cpSync(', 'if (false) cpSync('],
  ['a failed restore still puts the saved paths back', CLI, 'if (restored.status !== 0) {', 'if (false) {'],
  ['the saved paths are not put back', CLI, '  restoreSet({ home, from: backup });\n', ''],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['gentle-ai-overlay', 'bilingual-output'],
  selftest: 'gentle-ai-overlay/migrate-v4.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
