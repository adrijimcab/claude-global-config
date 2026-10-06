#!/usr/bin/env node
/**
 * The decisions of `hook-state/locations.mjs`, each broken once, that `locations.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `locations.mjs`, rotas una a una, que `locations.selftest.mjs` debe detectar. Un
 * mutante que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const L = 'hook-state/locations.mjs';

const MUTANTS = [
  // --- the variables are read at each call (H1-d) ---
  ['the environment is snapshotted at import', L, 'const readEnv = (name) => process.env[name];', 'const readEnv = ((snapshot) => (name) => snapshot[name])({ ...process.env });'],
  ['HOOK_CLAUDE_HOME is read under another name', L, "export const CLAUDE_HOME_VARIABLE = 'HOOK_CLAUDE_HOME';", "export const CLAUDE_HOME_VARIABLE = 'CLAUDE_HOME';"],
  ['HOOK_STATE_DIR is read under another name', L, "export const STATE_ROOT_VARIABLE = 'HOOK_STATE_DIR';", "export const STATE_ROOT_VARIABLE = 'STATE_DIR';"],

  // --- the home ---
  ['the home default is a different directory', L, "homedir(), '.claude'", "homedir(), '.claud'"],
  ['HOOK_CLAUDE_HOME is ignored', L, 'return override ? path.resolve(override) : ', 'return '],
  ['an empty HOOK_CLAUDE_HOME counts as set', L, 'return override ? path.resolve', 'return override !== undefined ? path.resolve'],
  ['HOOK_CLAUDE_HOME is not made absolute', L, 'path.resolve(override)', 'override'],

  // --- the state directory ---
  ['HOOK_STATE_DIR is ignored', L, 'root ? path.join(path.resolve(root), mechanism) : ', ''],
  ['an empty HOOK_STATE_DIR counts as set', L, 'return root ? path.join', 'return root !== undefined ? path.join'],
  ['HOOK_STATE_DIR is not made absolute', L, 'path.join(path.resolve(root), mechanism)', 'path.join(root, mechanism)'],
  ['every mechanism shares the root of HOOK_STATE_DIR', L, 'path.join(path.resolve(root), mechanism)', 'path.resolve(root)'],
  ['the default state directory ignores HOOK_CLAUDE_HOME', L, 'stateDirIn(claudeHome(), mechanism)', "stateDirIn(path.join(homedir(), '.claude'), mechanism)"],
  ['the default layout has no state segment', L, "const STATE_FOLDER = 'state';", "const STATE_FOLDER = '';"],
  ['a given home is not made absolute', L, 'path.join(path.resolve(home), mechanism, STATE_FOLDER)', 'path.join(home, mechanism, STATE_FOLDER)'],
  ['a given home takes a mechanism that is a path', L, '  assertMechanism(mechanism);\n\n  return path.join(path.resolve(home)', '  return path.join(path.resolve(home)'],

  // --- the root the state hangs from ---
  ['stateRoot ignores HOOK_STATE_DIR', L, 'return root ? path.resolve(root) : claudeHome();', 'return claudeHome();'],
  ['stateRoot counts an empty HOOK_STATE_DIR as set', L, 'return root ? path.resolve(root) : claudeHome();', 'return root !== undefined ? path.resolve(root) : claudeHome();'],
  ['stateRoot does not make HOOK_STATE_DIR absolute', L, 'return root ? path.resolve(root) : claudeHome();', 'return root ? root : claudeHome();'],

  // --- the listings ---
  ['a link counts as a real directory', L, 'import { lstatSync, mkdtempSync', 'import { statSync as lstatSync, mkdtempSync'],
  ['a file named state counts as a state directory', L, '?.isDirectory() === true;', '!== undefined;'],
  ['a name that is not plain is listed', L, 'entry.isDirectory() && isMechanismName(entry.name)', 'entry.isDirectory()'],
  ['a plain file is listed as a mechanism', L, 'entry.isDirectory() && isMechanismName(entry.name)', 'isMechanismName(entry.name)'],
  ['the listing is not sorted', L, '.map((entry) => entry.name)\n    .sort();', '.map((entry) => entry.name);'],
  ['an absent directory throws instead of listing nothing', L, '  if (lstatSync(directory, { throwIfNoEntry: false }) === undefined) return [];\n', ''],
  ['an unreadable root reads as empty', L, '  if (lstatSync(directory, { throwIfNoEntry: false }) === undefined) return [];', '  if (!isRealDirectory(directory)) return [];'],
  ['mechanismsWithState keeps a mechanism without state', L, 'plainChildren(stateRoot(), readDirectory).filter((name) => isRealDirectory(stateDir(name)))', 'plainChildren(stateRoot(), readDirectory)'],
  ['mechanismsWithState always reads the Claude home', L, 'plainChildren(stateRoot(), readDirectory)', 'plainChildren(claudeHome(), readDirectory)'],
  ['stateDirsUnder keeps a mechanism without state', L, '\n    .filter(({ directory }) => isRealDirectory(directory));', ';'],
  ['isMechanismName accepts any string', L, "typeof name === 'string' && PLAIN_NAME.test(name)", "typeof name === 'string'"],

  // --- the mechanism name ---
  ['the mechanism name is not checked', L, '  assertMechanism(mechanism);\n\n  const root', '  const root'],
  ['any value that prints as a name is accepted', L, "typeof mechanism !== 'string' || ", ''],
  ['the name check never refuses', L, '!PLAIN_NAME.test(mechanism)', 'false'],
  ['a name may start with a dot', L, '/^[A-Za-z0-9][', '/^[A-Za-z0-9.]['],
  ['a name may contain a dot', L, '[A-Za-z0-9_-]*$/', '[A-Za-z0-9_.-]*$/'],
  ['a name is matched anywhere, not from its start', L, '/^[A-Za-z0-9]', '/[A-Za-z0-9]'],
  ['a name is matched without its end', L, '*$/', '*/'],

  // --- isolateState ---
  ['isolateState does not set the variable', L, '  process.env[STATE_ROOT_VARIABLE] = root;\n', ''],
  ['isolateState reuses one directory', L, 'mkdtempSync(path.join(tmpdir(), `hook-state-${label}-`))', 'path.join(tmpdir(), `hook-state-${label}`)'],
  ['isolateState leaves its directory behind', L, "  process.once('exit', () => rmSync(root, { recursive: true, force: true }));\n", ''],
  ['isolateState accepts any label', L, '  assertMechanism(label);\n\n  const root = mkdtempSync', '  const root = mkdtempSync']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state', 'bilingual-output'],
  selftest: 'hook-state/locations.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
