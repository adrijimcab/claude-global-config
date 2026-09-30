#!/usr/bin/env node
/**
 * The decisions of commit-pathspec-guard (`acted-on-a-live-actors-working-state`), each broken once, that
 * `selftest.mjs` must catch. The runner and its rules — green unmutated baseline, exactly-once target,
 * parse check — live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de la guardia, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // --- decide.mjs: which repo a commit lands in.
  ['a `-C` value no longer overrides the directory `cd` resolved, so `-C` into a declared repo goes unseen', 'commit-pathspec-guard/decide.mjs', 'directory = resolveAgainst(directory, gitOptions[index + 1]);', ''],
  ['the fused `-C=value` form is no longer read, so that spelling of `-C` escapes detection', 'commit-pathspec-guard/decide.mjs', "if (option.startsWith('-C=')) directory = resolveAgainst(directory, option.slice('-C='.length));", ''],
  ['a non-`commit` git subcommand is treated as a commit too, so `git status`/`add` inside a declared repo are refused', 'commit-pathspec-guard/decide.mjs', "if (invocation.subcommand !== 'commit') continue;", "if (invocation.subcommand !== 'status') continue;"],
  ['a commit outside any declared repo falls back to the FIRST declared repo, so b100-am-ui itself gets refused too', 'commit-pathspec-guard/decide.mjs', 'const repo = repoAt(gitOptionDirectory(invocation.gitOptions, invocation.directory));', 'const repo = repoAt(gitOptionDirectory(invocation.gitOptions, invocation.directory)) ?? declaredRepos()[0];'],

  // --- decide.mjs: the pathspec test itself.
  ['`--` is no longer required to be FOLLOWED by a path, so a trailing bare `--` counts as a pathspec', 'commit-pathspec-guard/decide.mjs', 'if (separatorAt !== -1 && separatorAt < args.length - 1) return true;', 'if (separatorAt !== -1) return true;'],
  ['`--only` no longer exempts a commit, so the form the refusal itself recommends would be refused too', 'commit-pathspec-guard/decide.mjs', "return args.includes(ONLY_FLAG);", 'return false;'],

  // --- decide.mjs: the wrapper's OWN script directory, never the caller's cwd.
  ['the wrapper is identified by the CALLER\'s directory instead of its own script argument, so calling it from elsewhere escapes detection', 'commit-pathspec-guard/decide.mjs', 'const scriptPath = resolveAgainst(directory, nativeSpelling(scriptWord, platform));\n    const repo = repoAt(path.dirname(scriptPath));', 'const repo = repoAt(directory);'],
  ['a script whose basename is NOT `backup-repo.mjs` is treated as the wrapper anyway, so any node script commits unpathspec-checked into any declared repo it happens to sit in', 'commit-pathspec-guard/decide.mjs', 'if (scriptWord === undefined || path.basename(scriptWord).toLowerCase() !== BACKUP_WRAPPER_BASENAME) continue;', 'if (scriptWord === undefined) continue;'],
  ['the wrapper\'s first argument no longer has to BE `commit`, so `add`/`push` through the wrapper are misread as commits', 'commit-pathspec-guard/decide.mjs', "if (args[0] !== 'commit') continue;", ''],
  ['`node` is no longer required as the executable, so any command naming a path ending in `backup-repo.mjs` is read as the wrapper', 'commit-pathspec-guard/decide.mjs', "if (at === -1 || executableName(command.words[at]) !== 'node') continue;", 'if (at === -1) continue;'],

  // --- decide.mjs: the entry gate.
  ['a tool with no known shell dialect is no longer exempted, so a `command`-shaped field on ANY tool would be evaluated as bash', 'commit-pathspec-guard/decide.mjs', 'if (dialect === undefined) return undefined;', ''],

  // --- guard.mjs: the shim itself.
  ['the shim never asks the decision at all, so nothing is ever refused', 'commit-pathspec-guard/guard.mjs', 'if (offender === undefined) return undefined;', 'return undefined;'],
  ['the refusal loses its Spanish mirror', 'commit-pathspec-guard/guard.mjs', "    `@es COMMIT-PATHSPEC GUARD RECHAZÓ este comando: commitea en ${repo.name}, un repositorio de respaldo`,\n", ''],
  ['the refusal no longer names the staged-set comparison command', 'commit-pathspec-guard/guard.mjs', "    'and BEFORE committing, compare the staged set with what you actually intended:',\n    '',\n    '  git diff --cached --name-only',\n    '',\n", ''],

  // --- the data face, owned by the shared parser: a heredoc body and an echoed string are not commands.
  ['heredoc bodies are scanned as commands, so an ECHOED mention of the refused shape would be refused', 'shell-command/shell-command.mjs', "if (operator === '\\n') this.skipHeredocBodies();", '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['commit-pathspec-guard', 'shell-command', 'cherry-pick-guard', 'config-sync-guard', 'mutation-proof', 'hook-payloads'],
  selftest: 'commit-pathspec-guard/selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
