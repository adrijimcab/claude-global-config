#!/usr/bin/env node
/**
 * The decisions of company-commit-guard, each broken once, that `selftest.mjs` must catch. The runner and
 * its rules live in `../mutation-proof/run-mutants.mjs`.
 * @es Las decisiones de company-commit-guard, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const DECIDE = 'company-commit-guard/decide.mjs';
const ARGUMENTS = 'company-commit-guard/commit-arguments.mjs';
const GUARD = 'company-commit-guard/guard.mjs';

const MUTANTS = [
  // --- decide.mjs: which commands and which repositories.
  ['a tool with no shell dialect is no longer exempted', DECIDE, 'if (dialect === undefined || ', 'if ('],
  ['a non-commit git subcommand is judged as a commit', DECIDE, "invocation.subcommand === 'commit'", "invocation.subcommand !== 'push'"],
  ['an unusable list no longer refuses the commit (fail open)', DECIDE, 'if (config.problem !== undefined) return { problem: config.problem };', ''],
  ['a repository with only personal remotes is judged too', DECIDE, 'if (dir === undefined || companyRemoteNames(dir, config.hosts).length === 0) continue;', 'if (dir === undefined) continue;'],
  ['the first company commit with findings no longer stops the search', DECIDE, 'if (findings.length > 0) return { dir, findings };', ''],

  // --- decide.mjs: the message sources.
  ['the -F - heredoc body is no longer read', DECIDE, "if (file === '-' || file === '/dev/stdin') {", 'if (false) {'],
  ['/dev/stdin is no longer read as the heredoc', DECIDE, " || file === '/dev/stdin'", ''],
  ['a -F file is resolved against the guard\'s cwd, not the repository', DECIDE, 'readFileSync(path.resolve(dir, file), \'utf8\')', 'readFileSync(file, \'utf8\')'],
  ['a reused commit message is no longer read', DECIDE, "for (const revision of parsed.reuse) findings.push(", "for (const revision of []) findings.push("],
  ['message texts are no longer scanned', DECIDE, 'const findings = parsed.texts.flatMap(({ label, text }) => scanText(text, names, label));', 'const findings = [];'],

  // --- decide.mjs: the committed content.
  ['-a / --only / a pathspec no longer compare with HEAD', DECIDE, "parsed.all || parsed.only || parsed.paths.length > 0 ? 'HEAD' : '--cached'", "'--cached'"],
  ['the pathspec no longer limits the diff', DECIDE, "const scope = parsed.paths.length > 0 ? ['--', ...parsed.paths] : [];", 'const scope = [];'],
  ['a repository with no HEAD no longer falls back to the index', DECIDE, "if (!diff.ok && base === 'HEAD') {", 'if (false) {'],
  ['deleted paths are listed too', DECIDE, "'--name-only', '--diff-filter=ACMRT', ...scope", "'--name-only', ...scope"],
  ['the path listing ignores the pathspec', DECIDE, "'--name-only', '--diff-filter=ACMRT', ...scope", "'--name-only', '--diff-filter=ACMRT'"],
  ['staged paths are no longer scanned', DECIDE, 'return [...scanPaths(listing.stdout.split(\'\\n\').filter((line) => line.length > 0), names), ...scanAdded(addedLines(diff.stdout), names)];', 'return scanAdded(addedLines(diff.stdout), names);'],
  ['added lines are no longer scanned', DECIDE, 'return [...scanPaths(listing.stdout.split(\'\\n\').filter((line) => line.length > 0), names), ...scanAdded(addedLines(diff.stdout), names)];', 'return scanPaths(listing.stdout.split(\'\\n\').filter((line) => line.length > 0), names);'],

  // --- commit-arguments.mjs.
  ['-a no longer sets "all"', ARGUMENTS, "if (letter === 'a') parsed.all = true;", ''],
  ['-o no longer sets "only"', ARGUMENTS, "if (letter === 'o') parsed.only = true;", ''],
  ['-F is read as a message text instead of a file', ARGUMENTS, "['F', 'files']", "['F', 'texts']"],
  ['-C is read as a message file instead of a reused commit', ARGUMENTS, "['C', 'reuse']", "['C', 'files']"],
  ['an attached -mVALUE is no longer read', ARGUMENTS, 'attached.length > 0 ? attached : next', 'next'],
  ['an attached -mVALUE also swallows the next word', ARGUMENTS, 'return attached.length > 0 || next === undefined ? 0 : 1;', 'return 1;'],
  ['a dangling value flag records undefined', ARGUMENTS, 'if (value === undefined) return;\n\n', ''],
  ['--message=value loses everything after a second =', ARGUMENTS, "attached.join('=')", 'attached[0]'],
  ['a long flag with a separate value leaves that value as a path', ARGUMENTS, 'if (takesValue && !inline) index += 1;', ''],
  ['--all is not recognised', ARGUMENTS, "if (flag === '--all') parsed.all = true;", 'if (false) parsed.all = true;'],
  ['--only is not recognised', ARGUMENTS, "else if (flag === '--only') parsed.only = true;", ''],
  ['--author is not a text', ARGUMENTS, "['--author', 'commit author'], ", ''],
  ['--trailer is not a text', ARGUMENTS, ", ['--trailer', 'commit trailer']", ''],
  ['--file is not a message file', ARGUMENTS, "const FILE_FLAGS = new Set(['--file']);", 'const FILE_FLAGS = new Set([]);'],
  ['--reuse-message is not a reused commit', ARGUMENTS, "const REUSE_FLAGS = new Set(['--reuse-message', '--reedit-message']);", "const REUSE_FLAGS = new Set(['--reedit-message']);"],
  ['words after -- are no longer paths', ARGUMENTS, 'parsed.paths.push(...args.slice(index + 1));', ''],

  // --- guard.mjs.
  ['the refusal loses its Spanish mirror', GUARD, "    `@es ${GUARD_NAME} RECHAZÓ este comando: commitea en un repositorio de empresa (${dir}) contenido que nombra una herramienta de IA.`,\n", ''],
  ['the refusal loses its English headline', GUARD, '    `${GUARD_NAME} REFUSED this command: it commits into a company repository (${dir}) content that names an AI tool.`,\n', ''],
  ['the refusal no longer lists the findings in the Spanish half', GUARD, "    list,\n    '',\n    'POR QUÉ.", "    '',\n    'POR QUÉ."],
  ['the refusal no longer states the Spanish remedy', GUARD, "    'Quita el nombre del mensaje, del fichero en stage o de la línea añadida y vuelve a commitear.'", "    ''"],
  ['a missing list is reported with the commit refusal instead of its own', GUARD, 'verdict.problem === undefined ? refusalText(verdict) : missingListRefusal(GUARD_NAME, verdict.problem)', 'refusalText({ dir: "x", findings: [] })'],
  ['a BOM is no longer stripped', GUARD, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['the guard denies when it throws instead of failing open', GUARD, '  } catch {\n    return undefined;\n  }\n}', '  } catch {\n    return { hookSpecificOutput: { hookEventName: \'PreToolUse\', permissionDecision: \'deny\', permissionDecisionReason: \'crash\' } };\n  }\n}']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['company-commit-guard', 'company-config', 'company-remote', 'company-scan', 'selftest-fixtures', 'shell-command', 'cherry-pick-guard', 'hook-payloads', 'hook-dispatch', 'hook-state', 'bilingual-output', 'mutation-proof'],
  selftest: 'company-commit-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
