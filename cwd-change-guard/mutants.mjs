#!/usr/bin/env node
/**
 * The decisions of `cwd-change-guard` (`orchestrator-cwd-change-leaked-to-workers`), each broken once, that
 * `selftest.mjs` must catch. The runner and its rules — green unmutated baseline, exactly-once target,
 * parse check — live in `../mutation-proof/run-mutants.mjs`. Each row names the DECISION it removes, not the
 * line it edits, and keeps the code runnable so a kill means the selftest CHECKED the decision.
 *
 * @es Las decisiones de `cwd-change-guard`, rotas una a una, que `selftest.mjs` debe cazar. Cada fila nombra
 * la DECISIÓN que elimina, no la línea que edita, y deja el código ejecutable para que una muerte signifique
 * que el selftest COMPROBÓ la decisión.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // --- who is asked.
  ['a subagent is refused too: the caller identity is never consulted', 'cwd-change-guard/decide.mjs', 'if (isSubagentCaller(payload)) return undefined;', ''],
  ['the identity check looks at `agent_id` only: a transcript-only subagent reads as the main session', 'hook-caller/identify-caller.mjs', 'return hasAgentId || hasSubagentTranscript;', 'return hasAgentId;'],
  ['the identity check looks at the transcript only: an `agent_id`-only subagent reads as the main session', 'hook-caller/identify-caller.mjs', 'return hasAgentId || hasSubagentTranscript;', 'return hasSubagentTranscript;'],
  ['a call that runs no shell is decided as bash', 'cwd-change-guard/decide.mjs', 'if (dialect === undefined || toolInput === null', 'if (toolInput === null'],
  ['a background call is refused: the clock mode is never consulted', 'cwd-change-guard/decide.mjs', 'if (toolInput.run_in_background === true) return undefined;', ''],

  // --- what counts.
  ['only the FIRST command of the line is judged', 'cwd-change-guard/decide.mjs', 'if (executable === undefined || !DIRECTORY_CHANGERS.has(executable)) continue;', 'if (index > 0 || executable === undefined || !DIRECTORY_CHANGERS.has(executable)) continue;'],
  ['command position is ignored: only the first word is read, so an env prefix hides the cd', 'cwd-change-guard/decide.mjs', 'const at = commandWordIndex(command.words);', 'const at = 0;'],
  ['`pushd` is no longer a directory changer', 'cwd-change-guard/decide.mjs', "'pushd', ", ''],
  ['`popd` is no longer a directory changer', 'cwd-change-guard/decide.mjs', "'popd', ", ''],
  ['`chdir` is no longer a directory changer', 'cwd-change-guard/decide.mjs', "'chdir', ", ''],
  ['`Set-Location` is no longer a directory changer', 'cwd-change-guard/decide.mjs', "'set-location', ", ''],
  ['`sl` is no longer a directory changer', 'cwd-change-guard/decide.mjs', "'sl', ", ''],
  ['`Push-Location` is no longer a directory changer', 'cwd-change-guard/decide.mjs', "'push-location', ", ''],
  ['`Pop-Location` is no longer a directory changer', 'cwd-change-guard/decide.mjs', ", 'pop-location'", ''],
  ['`cd` itself is no longer a directory changer', 'cwd-change-guard/decide.mjs', "new Set(['cd', ", 'new Set(['],

  // --- what never counts.
  ['a `( … )` subshell is refused: bash depth is ignored', 'cwd-change-guard/decide.mjs', 'if (dialect === DIALECTS.BASH && command.depth > 0) continue;', ''],
  ['commands inside `bash -c` / `$( )` / `cmd /c` are judged as the line\'s own', 'cwd-change-guard/decide.mjs', '{ includeNested: false }', '{ includeNested: true }'],
  ['the shared parser always emits nested commands: the option is ignored', 'shell-command/shell-command.mjs', '    if (includeNested) {', '    if (true) {'],
  ['the left side of a pipe / a background job is judged as the session shell', 'cwd-change-guard/decide.mjs', 'if (SUBSHELL_SEPARATORS.has(command.separator)) return false;', ''],
  ['the right side of a pipe is judged as the session shell', 'cwd-change-guard/decide.mjs', 'return previous === undefined || !PIPE_SEPARATORS.has(previous.separator);', 'return true;'],
  ['`&` no longer marks a background job', 'cwd-change-guard/decide.mjs', "new Set(['|', '|&', '&'])", "new Set(['|', '|&'])"],
  ['a cd AFTER a background job is treated as backgrounded too', 'cwd-change-guard/decide.mjs', 'return previous === undefined || !PIPE_SEPARATORS.has(previous.separator);', "return previous === undefined || !SUBSHELL_SEPARATORS.has(previous.separator);"],

  // --- the data face, owned by the shared parser: a heredoc body is not a command.
  ['heredoc bodies are scanned as commands', 'shell-command/shell-command.mjs', "if (operator === '\\n') this.skipHeredocBodies();", ''],

  // --- the shim.
  ['the shim never asks the decision', 'cwd-change-guard/guard.mjs', 'offender = offendingDirectoryChange(payload);', 'offender = undefined;'],
  ['the shim answers "allow" while journaling a refusal', 'cwd-change-guard/guard.mjs', "permissionDecision: 'deny'", "permissionDecision: 'allow'"],
  ['the refusal no longer names the subshell shape', 'cwd-change-guard/guard.mjs', "'  2. a subshell:          ( cd <dir> && <command> )',", ''],
  ['the refusal no longer names the background shape', 'cwd-change-guard/guard.mjs', "'  3. a background call:   the same command with `run_in_background: true`.',", ''],
  ['the refusal loses its Spanish mirror', 'cwd-change-guard/guard.mjs', '`@es CWD-CHANGE GUARD RECHAZÓ esta llamada', '`CWD-CHANGE GUARD RECHAZÓ esta llamada'],
  ['a BOM-prefixed payload is no longer read', 'cwd-change-guard/guard.mjs', 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['cwd-change-guard', 'shell-command', 'hook-caller', 'hook-dispatch', 'hook-payloads', 'mutation-proof', 'cherry-pick-guard', 'exit-code-guard', 'eval-guard', 'gentle-ai-sync-guard', 'collision-guard', 'commit-pathspec-guard', 'config-sync-guard'],
  selftest: 'cwd-change-guard/selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
