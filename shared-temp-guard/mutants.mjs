#!/usr/bin/env node
/**
 * The decisions of shared-temp-guard, each broken once, that `selftest.mjs` must catch. The runner and its rules
 * (green baseline first, exactly-once targets, parse-checked mutants) live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de shared-temp-guard, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const GUARD = 'shared-temp-guard/guard.mjs';
const TARGETS = 'shared-temp-guard/shared-temp-targets.mjs';
const OPTIONS = 'shared-temp-guard/option-writes.mjs';
const REFUSAL = 'shared-temp-guard/refusal.mjs';

const MUTANTS = [
  // who is judged
  ['the main session is treated as a worker, so the orchestrator is refused too', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', ''],
  ['every caller is allowed, so a worker may write to the root', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', 'return undefined;'],
  // the verdict and its failure mode
  ['a refusal is never produced', GUARD, 'if (offenders.length === 0) return undefined;', 'return undefined;'],
  ['an internal failure refuses the call instead of failing open', GUARD, 'return undefined; // fail open: a malfunction of the decision must never block a call', "throw new Error('boom');"],
  // BOM row retired: the guard parses through hook-io's `tryParsePayload`, whose mutants pin the BOM.
  // @es Fila del BOM retirada: el guard parsea con `tryParsePayload` de hook-io, cuyos mutantes fijan el BOM.
  ['the files named by options are not part of the call\'s targets', GUARD, '[...toolCallWrites(payload), ...optionNamed]', '[...toolCallWrites(payload)]'],
  ['a shell line is never read for option targets', GUARD, "dialect !== undefined && typeof command === 'string'", 'false'],
  ['the offending target is not named', GUARD, 'refusalText(offenders[0].path, offenders[0].via)', "refusalText('(target)', offenders[0].via)"],
  // what is inside the root
  ['the session tree is not exempt, so the scratchpad is refused', TARGETS, '!isInSessionTree(spelling, root)', 'true'],
  ['the session tree test accepts a prefix, so claudette and the claude entry pass', TARGETS, '`${root}/${SESSION_TREE}/`', '`${root}/${SESSION_TREE}`'],
  ['containment is a bare prefix, so a sibling sharing the root name is inside', TARGETS, 'candidate === root || candidate.startsWith(`${root}/`)', 'candidate.startsWith(root)'],
  ['the root itself is not inside the root', TARGETS, 'candidate === root || candidate.startsWith(`${root}/`)', 'candidate.startsWith(`${root}/`)'],
  // every spelling of the root
  ['case is not folded', TARGETS, "const foldsCase = process.platform === 'win32';", 'const foldsCase = false;'],
  ['the file system never expands the 8.3 short form', TARGETS, 'head = realpathSync.native(head);', 'head = path.resolve(head);'],
  ['the root is compared as spelled, not canonical', TARGETS, 'roots.map(canonical).some(', 'roots.some('],
  ['Git Bash /tmp is not recognised', TARGETS, 'isWithin(withoutDrive, GIT_BASH_TMP)', 'false'],
  ['the drive letter is not stripped before the /tmp test', TARGETS, "own.charAt(1) === ':' ? own.slice(2) : own", 'own'],
  ['a target that does not resolve is not skipped', TARGETS, "if (typeof target.path !== 'string') return false;", ''],
  // the option-named files
  ['--output style options are not read', OPTIONS, "const OUTPUT_OPTIONS = ['--output', '--output-file', '--out-file', '--outfile'];", 'const OUTPUT_OPTIONS = [];'],
  ['--output-file is not read', OPTIONS, "'--output-file', ", ''],
  ['--out-file is not read', OPTIONS, "'--out-file', ", ''],
  ['--outfile is not read', OPTIONS, ", '--outfile'", ''],
  ['git commit --file is not read', OPTIONS, "const COMMIT_FILE_OPTIONS = ['--file'];", 'const COMMIT_FILE_OPTIONS = [];'],
  ['the fused -Xvalue spelling is not read', OPTIONS, "word.startsWith(`-${shortLetter}`) && !word.startsWith('--') && word.length > 2", 'false'],
  ['the long name=value spelling is not read', OPTIONS, 'longName !== undefined', 'false'],
  ['the separate-word spelling is not read', OPTIONS, "longNames.includes(word) || word === `-${shortLetter}`", 'false'],
  ['-F is read for every git subcommand, not only commit', OPTIONS, "invocation.subcommand !== 'commit'", 'false'],
  ['a bare - (stdin) is a file', OPTIONS, "word === undefined || word === '' || word === '-'", "word === undefined || word === ''"],
  ['a variable target is resolved as a literal name', OPTIONS, "raw.includes('$') || raw.includes('%')", 'false'],
  ['an unknowable directory is resolved against nothing', OPTIONS, "if (directory === undefined) return { path: undefined, unresolvable: `the directory this ${via} runs in is unknowable`, via };", ''],
  ['the cd tracking of the shared parser is ignored: options resolve against the start directory', OPTIONS, 'resolved(raw, directory, platform, \'an output option\')', 'resolved(raw, path.resolve(cwd), platform, \'an output option\')'],
  // the refusal
  ['the English half loses the first incident', REFUSAL, "'2026-10-12: one worker read another session\\'s edit6.mjs, and another committed with an m1.txt message file',", "'2026-10-12: it happened.',"],
  ['the refusal stops naming the second incident date', REFUSAL, "'that a different session had overwritten. Measured again 2026-10-18: a worker wrote its mutant-campaign',", "'that a different session had overwritten. Measured again: a worker wrote its mutant-campaign',"],
  ['the refusal stops naming the scratchpad remedy', REFUSAL, "'SCRATCHPAD (<tmp>/claude/<project>/<session>/scratchpad/, the path your session prompt names), with a',", "'SCRATCHPAD (the path your session prompt names), with a',"],
  ['the Spanish half loses its accent mark', REFUSAL, "'SHARED-TEMP GUARD RECHAZÓ esta escritura", "'SHARED-TEMP GUARD RECHAZO esta escritura"],
  ['the Spanish half stops naming the target', REFUSAL, '({target}, vía {via})', '(vía {via})']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['shared-temp-guard', 'mutation-proof', 'hook-caller', 'hook-payloads', 'shell-command', 'cherry-pick-guard', 'bilingual-output', 'write-targets'],
  selftest: 'shared-temp-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
