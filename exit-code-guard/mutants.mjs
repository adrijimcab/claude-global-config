#!/usr/bin/env node
/**
 * The decisions of the exit-code guard, each broken once, that `selftest.mjs` must catch. The runner and
 * its rules — green unmutated baseline, exactly-once target, parse check — live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * A campaign is the answer to "would this selftest stay green over that breakage?", so each row names the
 * decision it removes rather than the line it edits. The three decisions this guard now owns
 * (`status-echo`, `pipeline-status`, `harness-kill`) are all represented, including the branch in the
 * shim that routes to each — a decision nothing calls is a decision that cannot fire.
 *
 * @es Las decisiones del guard, rotas una a una, que `selftest.mjs` debe cazar. Cada fila nombra la
 * DECISIÓN que elimina, no la línea que edita, e incluye la rama del shim que enruta a cada módulo:
 * una decisión que nadie llama es una decisión que no puede dispararse.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // --- pipeline-status: `$?` read about a pipeline bash has already discarded.
  ['`pipefail` no longer rescues a pipeline, so the repair the refusal names is refused too', 'exit-code-guard/pipeline-status.mjs', 'if (pipefailIsSet(commands)) return undefined;', ''],
  ['a `$?` reader is not required to START a statement, so a pipeline member reads as one', 'exit-code-guard/pipeline-status.mjs', 'if (!STATEMENT_ENDS.has(last.separator)) continue;', ''],
  ['the preceding statement need not be a pipeline: every `$?` read is refused', 'exit-code-guard/pipeline-status.mjs', 'if (previous.separator !== PIPE) continue;', ''],
  ['any command CARRYING the characters counts as consuming the status', 'exit-code-guard/pipeline-status.mjs', 'return at !== -1 && STATUS_CONSUMERS.has(executableName(command.words[at]));', 'return at !== -1;'],
  ['the tools are swapped: bash, which HAS the defect, is no longer decided', 'exit-code-guard/pipeline-status.mjs', "if (toolName !== 'Bash' ||", "if (toolName !== 'PowerShell' ||"],

  // --- harness-kill: a hook-running git operation on a clock shorter than the hooks.
  ['a background run is bound by the foreground clock', 'exit-code-guard/harness-kill.mjs', 'if (toolInput.run_in_background === true) return undefined;', ''],
  ['the declared minimum is not enough: the boundary value is refused', 'exit-code-guard/harness-kill.mjs', 'timeout >= MINIMUM_TIMEOUT_MS', 'timeout > MINIMUM_TIMEOUT_MS'],
  ['`--no-verify` — git\'s own "no hooks" — no longer exempts', 'exit-code-guard/harness-kill.mjs', 'if (flags.some((word) => NO_HOOKS.has(word))) return undefined;', ''],
  ['`--abort` / `--quit` / `--skip`, which commit nothing, are refused', 'exit-code-guard/harness-kill.mjs', 'if (flags.some((word) => NO_COMMIT.has(word))) return undefined;', ''],
  ['a plain cherry-pick is refused although a CLEAN pick never reaches pre-commit', 'exit-code-guard/harness-kill.mjs', 'if (RESUMABLE.has(subcommand.name) && flags.includes(CONTINUE))', 'if (RESUMABLE.has(subcommand.name))'],
  ['command position is ignored: a git word anywhere counts, so a MENTION is refused', 'exit-code-guard/harness-kill.mjs', 'const at = commandWordIndex(command.words);', "const at = command.words.findIndex((word) => executableName(word) === 'git');"],

  // --- the shim: a decision nothing routes to cannot fire.
  ['the shim never asks the pipeline decision', 'exit-code-guard/guard.mjs', 'if (pipeline !== undefined) return pipelineReason(pipeline);', ''],
  ['the shim never asks the harness-kill decision', 'exit-code-guard/guard.mjs', 'return harnessKillReason(killable, hooks,', 'return undefined && harnessKillReason(killable, hooks,'],

  // --- the hook premise: the harness-kill refusal speaks only where commit hooks really run.
  ['a repository without commit hooks is refused anyway', 'exit-code-guard/guard.mjs', '  if (hooks !== undefined && hooks.length === 0) return undefined;\n', ''],
  ['an unmeasurable directory reads as "no hooks"', 'exit-code-guard/commit-hooks.mjs', '  if (hooks === undefined) return undefined;\n  if (!existsSync(hooks)) return [];', '  if (hooks === undefined) return [];\n  if (!existsSync(hooks)) return [];'],
  ['*.sample templates count as hooks', 'exit-code-guard/commit-hooks.mjs', 'return COMMIT_HOOKS.filter((name) => present.has(name));', 'return [...present];'],
  ['the line\'s own cd is ignored: hooks are measured where the line starts', 'exit-code-guard/harness-kill.mjs', 'directory: gitDirectoryOf(command, directory)', 'directory: cwd'],
  ['git -C is ignored: hooks are measured in the directory the line cd-ed into', 'exit-code-guard/harness-kill.mjs', "if (command.words[index] === '-C') resolved =", 'if (false) resolved ='],
  ['core.hooksPath is ignored: only .git/hooks is read', 'exit-code-guard/commit-hooks.mjs', "['-C', directory, 'rev-parse', '--path-format=absolute', '--git-path', 'hooks']", "['-C', directory, 'rev-parse', '--path-format=absolute', '--git-dir']"],
  ['the shim never asks the status-echo decision', 'exit-code-guard/guard.mjs', 'if (endsByPrintingStatus(tool, input?.command)) return REASONS[tool];', ''],

  // --- status-echo: the decision this guard was born with.
  ['a newline no longer separates bash statements, so the echo is not seen as last', 'exit-code-guard/status-echo.mjs', "if (character === ';' || character === '\\n') {", "if (character === ';') {"],

  // --- the data face, owned by the shared parser: a heredoc body is not a command.
  ['heredoc bodies are scanned as commands', 'shell-command/shell-command.mjs', "if (operator === '\\n') this.skipHeredocBodies();", '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['exit-code-guard', 'shell-command', 'cherry-pick-guard', 'mutation-proof', 'hook-payloads'],
  selftest: 'exit-code-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
