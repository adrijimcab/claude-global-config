#!/usr/bin/env node
/**
 * The decisions of the git port, each broken once, that `selftest.mjs` must catch. The runner and its rules (green
 * baseline, exactly-once target, parse check) live in `../mutation-proof/run-mutants.mjs`. Not mutated, because no
 * process can observe it: `windowsHide: true` (a console window that never opens).
 *
 * @es Las decisiones del puerto de git, rotas una a una, que `selftest.mjs` debe cazar. No se muta lo que ningún
 * proceso puede observar: `windowsHide: true` (una ventana de consola que nunca se abre).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const G = 'git-port/git.mjs';
const F = 'git-port/fake.mjs';

const MUTANTS = [
  ['the default bound of a command changes', G, 'export const GIT_TIMEOUT_MS = 15000;', 'export const GIT_TIMEOUT_MS = 20000;'],
  ['a command without a timeout option gets a one millisecond bound', G, 'timeoutMs = GIT_TIMEOUT_MS,', 'timeoutMs = 1,'],
  ['the timeout is not applied', G, 'timeout: timeoutMs,', 'timeout: 0,'],
  ['the answer is limited to the buffer of node', G, 'maxBuffer: 256 * 1024 * 1024,', 'maxBuffer: 1024 * 1024,'],
  ['the working directory is ignored', G, 'cwd, encoding', 'encoding'],
  ['the input is not sent to git', G, 'input, timeout:', 'timeout:'],
  ['the git options come after the arguments', G, "[...gitOptions, ...args], {", "[...args, ...gitOptions], {"],
  ['GIT_DIR of the parent reaches git', G, "'GIT_DIR', ", ''],
  ['GIT_WORK_TREE of the parent reaches git', G, "'GIT_WORK_TREE', ", ''],
  ['GIT_INDEX_FILE of the parent reaches git', G, "'GIT_INDEX_FILE', ", ''],
  ['GIT_COMMON_DIR of the parent reaches git', G, ", 'GIT_COMMON_DIR']", ']'],
  ['no selector is removed', G, 'if (!inheritSelectors) for (const name of REPOSITORY_SELECTORS) delete childEnv[name];', ''],
  ['the selectors are removed even when the caller asks to inherit them', G, 'if (!inheritSelectors) for', 'if (true) for'],
  ['the selectors are inherited unless the caller says otherwise', G, 'inheritSelectors = false }', 'inheritSelectors = true }'],
  ['a selector the caller passes in env is cleared', G, "  if (!inheritSelectors) for (const name of REPOSITORY_SELECTORS) delete childEnv[name];\n  Object.assign(childEnv, env);", "  Object.assign(childEnv, env);\n  if (!inheritSelectors) for (const name of REPOSITORY_SELECTORS) delete childEnv[name];"],
  ['git may prompt', G, "childEnv.GIT_TERMINAL_PROMPT = '0';", "childEnv.GIT_TERMINAL_PROMPT ??= '1';"],
  ['the variables of the caller are dropped', G, 'Object.assign(childEnv, env);', ''],
  ['fleet-kit stops inheriting the selectors of the command it judges', 'fleet-kit/lib/git.mjs', 'inheritSelectors: true }', 'inheritSelectors: false }'],
  ['worktree-landing inherits the selectors of the process', 'worktree-landing/git.mjs', "env: { GCM_INTERACTIVE: 'never' } })", "env: { GCM_INTERACTIVE: 'never' }, inheritSelectors: true })"],
  ['stderr loses the spawn error', G, "${result.error ? result.error.message : ''}", ''],
  ['a timeout is not reported', G, "timedOut: result.error?.code === 'ETIMEDOUT'", 'timedOut: false'],
  ['every command reads as timed out', G, "timedOut: result.error?.code === 'ETIMEDOUT'", 'timedOut: true'],
  ['stdout of a failed spawn is not defaulted', G, "stdout: result.stdout ?? '',", 'stdout: result.stdout,'],
  ['a timeout is worded as an exit', G, "answer.timedOut ? 'timed out' :", "false ? 'timed out' :"],
  ['the Spanish half of a timeout is missing', G, "answer.timedOut ? 'agotó el tiempo' :", "false ? 'agotó el tiempo' :"],
  ['the English half names no exit', G, '`exit ${answer.status}: ${answer.stderr.trim()}`', '`${answer.stderr.trim()}`'],
  ['the Spanish half is missing', G, ' @es ${what} falló (${porque}).', ''],
  ['a failure is not a GitFailure', G, 'return new GitFailure(', 'return new Error('],
  ['gitOutput returns stdout of a failed command', G, 'if (answer.status === 0) return answer.stdout;\n  throw failure([', 'if (answer.status !== null) return answer.stdout;\n  throw failure(['],
  ['gitOutput leaves the git options out of the message', G, "['git', ...(options?.gitOptions ?? []), ...args]", "['git', ...args]"],
  ['mustAsk returns stdout of a failed command', G, "if (answer.status === 0) return answer.stdout;\n  throw failure(`git", "if (answer.status !== null) return answer.stdout;\n  throw failure(`git"],
  ['mustAsk throws on a message on stderr', G, "if (answer.status === 0) return answer.stdout;\n  throw failure(`git", "if (answer.status === 0 && answer.stderr === '') return answer.stdout;\n  throw failure(`git"],
  ['an asker ignores its options', G, '(...args) => runGit(cwd, args, options)', '(...args) => runGit(cwd, args)'],
  ['an asker ignores its directory', G, '(...args) => runGit(cwd, args, options)', '(...args) => runGit(undefined, args, options)'],
  ['empty entries are kept', G, ".filter((entry) => entry !== '')", ''],
  ['entries are split on newline', G, "split('\\0')", "split('\\n')"],
  ['the double answers without defaults', F, "{ status: 0, stdout: '', stderr: '', timedOut: false, ...script[key] }", '{ ...script[key] }'],
  ['the double answers a command nobody scripted', F, 'if (!Object.hasOwn(script, key)) throw', 'if (false) throw'],
  ['the double does not record its calls', F, 'calls.push({ cwd, args, options });', ''],
  ['the double does not record a refused command', F, 'calls.push({ cwd, args, options });', "if (Object.hasOwn(script, args.join(' '))) calls.push({ cwd, args, options });"],
  ['the double ask drops the directory-less call', F, 'ask: (...args) => run(undefined, args)', 'ask: (...args) => run(undefined, args.slice(1))']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['selftest-fixtures'],
  selftest: 'git-port/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
