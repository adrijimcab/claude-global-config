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
  ['HOOK_CLAUDE_HOME is read under another name', L, "readEnv('HOOK_CLAUDE_HOME')", "readEnv('CLAUDE_HOME')"],
  ['HOOK_STATE_DIR is read under another name', L, "readEnv('HOOK_STATE_DIR')", "readEnv('STATE_DIR')"],

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
  ['the default state directory ignores HOOK_CLAUDE_HOME', L, "path.join(claudeHome(), mechanism, 'state')", "path.join(homedir(), '.claude', mechanism, 'state')"],
  ['the default state directory has no state segment', L, "path.join(claudeHome(), mechanism, 'state')", 'path.join(claudeHome(), mechanism)'],

  // --- the mechanism name ---
  ['the mechanism name is not checked', L, 'assertMechanism(mechanism);', ''],
  ['any value that prints as a name is accepted', L, "typeof mechanism !== 'string' || ", ''],
  ['the name check never refuses', L, '!PLAIN_NAME.test(mechanism)', 'false'],
  ['a name may start with a dot', L, '/^[A-Za-z0-9][', '/^[A-Za-z0-9.]['],
  ['a name may contain a dot', L, '[A-Za-z0-9_-]*$/', '[A-Za-z0-9_.-]*$/'],
  ['a name is matched anywhere, not from its start', L, '/^[A-Za-z0-9]', '/[A-Za-z0-9]'],
  ['a name is matched without its end', L, '*$/', '*/']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state'],
  selftest: 'hook-state/locations.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
