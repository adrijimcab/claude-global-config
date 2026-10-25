#!/usr/bin/env node
/**
 * The decisions of the review stop hook, each broken once, that `selftest.mjs` must catch. The runner and its rules
 * (green baseline, exactly-once target, parse check) live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del hook de parada de revisión, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const D = 'review-site/decide.mjs';
const H = 'review-site/stop-hook.mjs';
const J = 'review-site/journal.mjs';

const MUTANTS = [
  // --- decide.mjs: where gentle-ai's hook runs.
  ['a linked worktree is skipped and a main checkout runs', D, "return isLinked(cwd) ? { run: true, reason: 'linked-worktree'", "return !isLinked(cwd) ? { run: true, reason: 'linked-worktree'"],
  ['every directory runs gentle-ai', D, "return isLinked(cwd) ? { run: true,", "return true ? { run: true,"],
  ['no directory runs gentle-ai', D, "return isLinked(cwd) ? { run: true, reason: 'linked-worktree', cwd, ...identity } : { run: false,", "return false ? { run: true, reason: 'linked-worktree', cwd, ...identity } : { run: false,"],
  ['a directory git cannot classify is skipped instead of failing open', D, "return { run: true, reason: 'fail-open', cwd,", "return { run: false, reason: 'fail-open', cwd,"],
  ['a payload that is not JSON is skipped instead of failing open', D, "if (payload === undefined) return { run: true,", "if (payload === undefined) return { run: false,"],
  ['a payload that is a JSON array is read as a payload', D, " && !Array.isArray(parsed)", ''],
  ['a null payload is read as a payload', D, "parsed !== null && typeof parsed === 'object'", "typeof parsed === 'object'"],
  ['the byte-order mark is not stripped', D, 'text.charCodeAt(0) === 0xfeff ? text.slice(1) : text', 'text'],
  ['a payload without cwd is not asked about the process directory', D, 'const cwd = payload.cwd ?? fallbackCwd;', "const cwd = payload.cwd ?? '/';"],
  ['a cwd that is not a string is used as it is', D, "(typeof payload.cwd !== 'string' || payload.cwd === '')", 'false'],
  ['an empty cwd is used as it is', D, " || payload.cwd === '')", ')'],
  ['the event and session are not carried to the journal', D, 'const identity = { event: payload.hook_event_name, session: payload.session_id };', 'const identity = {};'],

  // --- stop-hook.mjs: how gentle-ai is run.
  ['gentle-ai does not receive the payload', H, '{ input, stdio:', '{ input: Buffer.alloc(0), stdio:'],
  ['gentle-ai is run with other arguments', H, "['review', 'stop-hook', '--agent', 'claude-code']", "['review', 'stop-hook']"],
  ['gentle-ai output is swallowed', H, "stdio: ['pipe', 'inherit', 'inherit']", "stdio: ['pipe', 'ignore', 'ignore']"],
  ['gentle-ai exit code is lost', H, 'return result.status ?? 1;', 'return 0;'],
  ['a gentle-ai killed by a signal reads as success', H, 'return result.status ?? 1;', 'return result.status ?? 0;'],
  ['a gentle-ai that cannot start reads as success', H, 'if (result.error) return COMMAND_NOT_FOUND;', 'if (result.error) return 0;'],
  ['a gentle-ai that cannot start is not reported in Spanish', H, ' @es review-site: gentle-ai no pudo ejecutarse', ' review-site: gentle-ai no pudo ejecutarse'],
  ['a gentle-ai that cannot start is not reported at all', H, 'if (result.error) process.stderr.write(', 'if (false) process.stderr.write('],
  ['a skipped hook exits non-zero', H, 'decision.run ? runGentleAi(input, process.env) : 0', 'decision.run ? runGentleAi(input, process.env) : 1'],
  ['the decision is not journaled', H, '  recordDecision(decision);\n', ''],
  ['the injected stand-in is ignored', H, 'injected === undefined ? [\'gentle-ai\'] : JSON.parse(injected)', "['gentle-ai']"],

  ['a decision module that cannot load drops the review', H, "return { run: true, reason: 'fail-open', detail: error instanceof", "return { run: false, reason: 'fail-open', detail: error instanceof"],
  ['a journal that cannot load crashes the hook', H, '/* evidence, never a precondition @es evidencia, nunca una precondición */', "throw new Error('journal');"],

  // --- journal.mjs: what is recorded.
  ['a skipped hook is journaled as run', J, "if (!run) return 'skipped';", "if (!run) return 'ran';"],
  ['a hook run on a linked worktree is journaled as a fail-open', J, "reason === 'linked-worktree' ? 'ran' : 'fail-open'", "reason === 'linked-worktree' ? 'fail-open' : 'ran'"],
  ['a fail-open is journaled as an ordinary run', J, "reason === 'linked-worktree' ? 'ran' : 'fail-open'", "'ran'"],
  ['the journal cannot be told apart by reason', J, 'decision: decisionName(run, reason), reason, event', 'decision: decisionName(run, reason), event']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['settings.json', 'git-worktree', 'selftest-fixtures', 'hook-state', 'hook-io'],
  selftest: 'review-site/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
