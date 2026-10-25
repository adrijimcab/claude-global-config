#!/usr/bin/env node
/**
 * The decisions of company-push-guard, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules live in `../mutation-proof/run-mutants.mjs`.
 * @es Las decisiones de company-push-guard, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const DECIDE = 'company-push-guard/decide.mjs';
const ARGUMENTS = 'company-push-guard/push-arguments.mjs';
const RANGE = 'company-push-guard/pushed-range.mjs';
const GUARD = 'company-push-guard/guard.mjs';

const MUTANTS = [
  // --- decide.mjs: which commands, which remote.
  ['a tool with no shell dialect is no longer exempted', DECIDE, 'if (dialect === undefined || ', 'if ('],
  ['a non-push git subcommand is judged as a push', DECIDE, "invocation.subcommand === 'push'", "invocation.subcommand !== 'commit'"],
  ['an unusable list no longer refuses the push (fail open)', DECIDE, 'if (config.problem !== undefined) return { problem: config.problem };', ''],
  ['a push to a personal remote is judged too', DECIDE, 'if (!destination.company) continue;', ''],
  ['a remote is company only by its FIRST url (the push url is ignored)', DECIDE, 'named.some((remote) => isCompanyUrl(remote.url, hosts))', 'isCompanyUrl(named[0].url, hosts)'],
  ['a raw URL is never company', DECIDE, 'company: isCompanyUrl(word, hosts), known:', 'company: false, known:'],
  ['a push with no repository word does not resolve to origin', DECIDE, "?? 'origin';", "?? 'nowhere';"],
  ['the branch push remote is ignored', DECIDE, "ofBranch('pushRemote') ?? ", ''],
  ['--no-verify is no longer refused', DECIDE, 'if (parsed.noVerify) return { dir, noVerify: true };', ''],
  ['--no-verify is refused before the destination is known (personal pushes too)', DECIDE, 'if (!destination.company) continue;\n    if (parsed.noVerify) return { dir, noVerify: true };', 'if (parsed.noVerify) return { dir, noVerify: true };\n    if (!destination.company) continue;'],
  ['the range of a raw URL is not narrowed by the company remotes\' tracking refs', DECIDE, 'known: sameUrl.length > 0 ? sameUrl : companyRemoteNames(dir, hosts)', 'known: []'],
  ['the tracking refs of the named remote are not used to exclude what it has', DECIDE, 'known: [word] }', 'known: [] }'],
  ['an unfollowable cd no longer falls back to the starting directory', DECIDE, 'invocationDirectory(invocation) ?? cwd;', "invocationDirectory(invocation) ?? '/nonexistent-dir';"],
  ['remote.pushDefault is ignored', DECIDE, "setting(dir, 'remote.pushDefault') ?? ", ''],
  ['branch.<b>.remote is ignored', DECIDE, "ofBranch('remote') ?? ", ''],

  // --- push-arguments.mjs.
  ['--no-verify is not recognised', ARGUMENTS, "if (flag === '--no-verify') parsed.noVerify = true;", 'if (false) parsed.noVerify = true;'],
  ['-n is read as --no-verify', ARGUMENTS, "if (flag === '--no-verify') parsed.noVerify = true;", "if (flag === '--no-verify' || flag === '-n') parsed.noVerify = true;"],
  ['--all is not recognised', ARGUMENTS, "else if (flag === '--all' || flag === '--branches') parsed.all = true;", ''],
  ['--tags is not recognised', ARGUMENTS, "else if (flag === '--tags') parsed.tags = true;", ''],
  ['--mirror is not recognised', ARGUMENTS, "else if (flag === '--mirror') parsed.mirror = true;", ''],
  ['--delete is not recognised', ARGUMENTS, "else if (flag === '--delete') parsed.deleting = true;", ''],
  ['-d is not recognised as a deletion', ARGUMENTS, "if (word.includes('d')) parsed.deleting = true;", ''],
  ['--repo=X is not read', ARGUMENTS, "else if (flag === '--repo' && attached.length > 0) parsed.repository = attached.join('=');", ''],
  ['--repo X is not read', ARGUMENTS, "else if (flag === '--repo') parsed.repository = args[index + 1];", ''],
  ['-o does not consume its value', ARGUMENTS, "if (word.endsWith('o')) index += 1; // -o <push-option>", ''],
  ['a long flag with a separate value does not consume it', ARGUMENTS, 'index += 1;\n    }\n  }', '}\n  }'],
  ['--force-with-lease swallows the next positional', ARGUMENTS, "const ATTACHED_ONLY = new Set(['--signed', '--force-with-lease', '--recurse-submodules']);", "const ATTACHED_ONLY = new Set(['--signed', '--recurse-submodules']);"],
  ['--repo X leaves the first refspec as the repository', ARGUMENTS, 'parsed.refspecs = repositoryGivenByFlag ? positionals : positionals.slice(1);', 'parsed.refspecs = positionals.slice(1);'],
  ['words after -- are no longer positional', ARGUMENTS, 'positionals.push(...args.slice(index + 1));', ''],

  // --- pushed-range.mjs.
  ['a glob refspec is not expanded', RANGE, "if (source.includes('*')) return [`--glob=${source}`];", ''],
  ['an unresolvable refspec source is kept', RANGE, 'return runGit(dir, [\'rev-parse\', \'--verify\', \'-q\', `${source}^{commit}`]).ok ? [source] : [];', 'return [source];'],
  ['--delete still judges the refspecs', RANGE, 'if (parsed.deleting) return [];', ''],
  ['--mirror is not judged', RANGE, "if (parsed.mirror) return ['--all'];", ''],
  ['--all does not add the branches', RANGE, "if (parsed.all) revisions.push('--branches');", ''],
  ['--tags does not add the tags', RANGE, "if (parsed.tags) revisions.push('--tags');", ''],
  ['HEAD is judged even when a refspec names the source', RANGE, 'const selectsNothingElse = parsed.refspecs.length === 0 && !parsed.all && !parsed.tags;', 'const selectsNothingElse = true;'],
  ['HEAD is not judged when the push names nothing', RANGE, 'if (selectsNothingElse && runGit', 'if (false && runGit'],
  ['what the remote already has is judged again', RANGE, "const range = [...revisions, '--not', ...remoteNames.map((name) => `--remotes=${name}`), '--'];", "const range = [...revisions, '--'];"],
  ['commit messages are not scanned', RANGE, "return scanMessage(message, names, `commit ${short(commit)} message`);", 'return [];'],
  ['attribution in commit messages is not judged', RANGE, "return scanMessage(message, names, `commit ${short(commit)} message`);", "return scanMessage(message, names, `commit ${short(commit)} message`).filter((finding) => finding.name === 'claude');"],
  ['added lines are not scanned', RANGE, 'found.push(...scanText(entry.text, names, `${entry.path}:${entry.line} (${short(entry.commit)})`));', ''],
  ['added paths are not scanned', RANGE, 'found.push(...scanPaths([entry.path], names).map((finding) => ({ ...finding, where: `${entry.path} (${short(entry.commit)})` })));', ''],
  ['deleted paths are listed too', RANGE, "'--name-only', '--diff-filter=ACMRT', '--format=%x00%H'", "'--name-only', '--format=%x00%H'"],

  // --- guard.mjs.
  ['the findings refusal loses its Spanish mirror', GUARD, "    `@es ${GUARD_NAME} RECHAZÓ este comando: sube a un remoto de empresa (desde ${dir}) commits que nombran una herramienta de IA.`,\n", ''],
  ['the findings refusal loses its English headline', GUARD, '    `${GUARD_NAME} REFUSED this command: it pushes to a company remote (from ${dir}) commits that name an AI tool.`,\n', ''],
  ['the findings refusal states no Spanish remedy', GUARD, "    'Reescribe los commits infractores (mensaje, ruta o línea) para que no lleven ese nombre y vuelve a subir.'", "    ''"],
  ['the findings are not listed in the Spanish half', GUARD, "    list,\n    '',\n    'POR QUÉ.", "    '',\n    'POR QUÉ."],
  ['the --no-verify refusal loses its Spanish half', GUARD, "    'Haz el push sin `--no-verify`.'", "    ''"],
  ['the --no-verify refusal loses its English half', GUARD, "    'Run the push without `--no-verify`.',\n", ''],
  ['a missing list is reported as a findings refusal', GUARD, 'if (verdict.problem !== undefined) return missingListRefusal(GUARD_NAME, verdict.problem);', ''],
  ['a --no-verify verdict is reported as a findings refusal', GUARD, 'return verdict.noVerify === true ? noVerifyRefusal(verdict) : findingsRefusal(verdict);', 'return findingsRefusal(verdict);'],
  ['the payload is parsed without the BOM-tolerant port parser', GUARD, 'judgePush(parsePayload(raw))', 'judgePush(JSON.parse(raw))'],
  ['the guard denies when it throws instead of failing open', GUARD, '  } catch {\n    return undefined;\n  }\n}', "  } catch {\n    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'crash' } };\n  }\n}"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['company-push-guard', 'company-config', 'company-remote', 'company-scan', 'selftest-fixtures', 'shell-command', 'cherry-pick-guard', 'hook-payloads', 'hook-dispatch', 'hook-state', 'bilingual-output', 'mutation-proof'],
  selftest: 'company-push-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
