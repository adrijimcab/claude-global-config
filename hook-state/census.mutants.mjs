#!/usr/bin/env node
/**
 * The decisions of `hook-state/census.mjs`, each broken once, that `census.selftest.mjs` must catch. The runner
 * and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that only
 * crashes the selftest count as a survivor. The selftest also runs the census on the sandbox's copy of the tree,
 * so the campaign copies every directory a rule reads.
 *
 * @es Las decisiones de `census.mjs`, rotas una a una, que `census.selftest.mjs` debe detectar. El selftest
 * también corre el censo sobre la copia del árbol del sandbox, así que la campaña copia cada directorio que lee.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const C = 'hook-state/census.mjs';
const FLEET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MUTANTS = [
  // --- what is walked ---
  ['a state directory is walked', C, "'.git', '.deploy-backups', '.runs', 'state-archive']", "'.git', '.deploy-backups', '.runs', 'state-archive'].filter((name) => name !== 'state')"],
  ['node_modules is walked', C, "const UNWALKED = new Set(['node_modules', ", 'const UNWALKED = new Set(['],
  ['a vendored copy is read as this tree', C, "const VENDORED = ['fleet-kit/vendor/'];", 'const VENDORED = [];'],
  ['a selftest is read as production', C, '!isSelftest(file) && !isCampaign(file) &&', '!isCampaign(file) &&'],
  ['a campaign is read as production', C, '!isSelftest(file) && !isCampaign(file) &&', '!isSelftest(file) &&'],
  ['a dotted selftest name is not a selftest', C, "path.posix.basename(file) === 'selftest.mjs' || file.endsWith('.selftest.mjs')", "path.posix.basename(file) === 'selftest.mjs'"],
  ['a bare mutants.mjs is not a campaign', C, "path.posix.basename(file) === 'mutants.mjs' || file.endsWith('.mutants.mjs')", "file.endsWith('.mutants.mjs')"],
  ['a file that is not .mjs is read', C, "entry.isFile() && entry.name.endsWith('.mjs')", 'entry.isFile()'],

  // --- what a line is ---
  ['a comment is read as code', C, "const isComment = (line) => ['//', '*', '/*'].some((opener) => line.trimStart().startsWith(opener));", 'const isComment = () => false;'],
  ['a comment opened by * is read as code', C, "['//', '*', '/*'].some(", "['//', '/*'].some("],
  ['only single quotes are read', C, "const QUOTES = [\"'\", '\"', '`'];", "const QUOTES = [\"'\"];"],
  ['a resolve of state is not a join', C, "(line.includes('join(') || line.includes('resolve('))", "line.includes('join(')"],
  ['any line naming state is a join', C, "&& (line.includes('join(') || line.includes('resolve('))", ''],
  ['HOOK_CLAUDE_HOME may be named', C, "const VARIABLES = ['HOOK_STATE_DIR', 'HOOK_CLAUDE_HOME'];", "const VARIABLES = ['HOOK_STATE_DIR'];"],
  ['the home built without .claude is a finding', C, "line.includes('homedir()') && QUOTES.some((quote) => line.includes(`${quote}.claude${quote}`))", "line.includes('homedir()')"],
  ['the module itself is a finding', C, '    if (file === MODULE || file === CENSUS) continue;\n\n    readFileSync', '    if (file === CENSUS) continue;\n\n    readFileSync'],
  ['an excuse silences nothing', C, '        if (!excuses.has(file)) findings.push({ file, line: index + 1 });', '        findings.push({ file, line: index + 1 });'],
  ['an unused excuse is not a finding', C, '    if (!matching.has(file)) findings.push({ file, line: 0, unused: true });', '    void file;'],
  ['the line number is 0-based', C, 'findings.push({ file, line: index + 1 })', 'findings.push({ file, line: index })'],
  ['a listed home stops being excused', C, "['hook-dispatch/latency.mjs', \"the harness's session transcripts (`~/.claude/projects`), not hook state\"]", "['hook-dispatch/latency-gone.mjs', \"the harness's session transcripts (`~/.claude/projects`), not hook state\"]"],

  // --- what a module imports ---
  ['an import over several lines is missed', C, "if (!(line.trimStart().startsWith('import') || line.includes('} from '))) continue;", "if (!line.trimStart().startsWith('import')) continue;"],
  ['a bare import is missed', C, "const bareAt = line.trimStart().startsWith(`import ${quote}`) ? line.indexOf(`import ${quote}`) + 'import '.length : -1;", 'const bareAt = -1;'],
  ['a package import is read as a module of the tree', C, "(specifier.startsWith('./') || specifier.startsWith('../'))", '(specifier !== "")'],
  ['an import is not resolved against its file', C, 'path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))', 'specifier'],
  ['only direct importers are on the module', C, 'imported.some((target) => target === MODULE || on.has(target))', 'imported.some((target) => target === MODULE)'],
  ['a selftest is on the module', C, 'if (on.has(file) || !isProduction(file) || file === MODULE) continue;', 'if (on.has(file) || file === MODULE) continue;'],

  // --- which selftests must isolate ---
  ['a selftest beside the module is not held', C, 'if (beside || naming) held.set(', 'if (naming) held.set('],
  ['a selftest naming the module from elsewhere is not held', C, 'if (beside || naming) held.set(', 'if (beside) held.set('],
  ['a selftest of another directory is held for the file name alone', C, 'const beside = path.posix.dirname(file) === directory && source.includes(', 'const beside = source.includes('],
  ['isolateState does not count as redirecting', C, "source.includes('isolateState(') || source.includes('process.env.HOOK_STATE_DIR = ')", "source.includes('process.env.HOOK_STATE_DIR = ')"],
  ['an own HOOK_STATE_DIR does not count as redirecting', C, "source.includes('isolateState(') || source.includes('process.env.HOOK_STATE_DIR = ')", "source.includes('isolateState(')"],
  ['every selftest is held as isolating', C, '.filter(([file]) => !redirectsState(text.get(file)))', '.filter(() => false)'],

  // --- the literal mechanisms ---
  ['the alias stateDirOf is not read', C, "const CALLS = [\"stateDir('\", \"stateDirOf('\"];", "const CALLS = [\"stateDir('\"];"],
  ['only the first call of a line is read', C, '          at = line.indexOf(call, start);', '          at = -1;'],
  ['a comment names a mechanism', C, '      if (isComment(line)) continue;\n\n      for (const call of CALLS)', '      for (const call of CALLS)'],
  ['the literal mechanisms are not sorted', C, '  return [...found].sort();\n}\n\n/** Rule (a).', '  return [...found];\n}\n\n/** Rule (a).']
];

/** Every directory of the tree the census reads, never a run's output or another tree. @es Cada directorio del árbol que lee el censo. */
const paths = readdirSync(FLEET, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !['.git', 'node_modules', 'worktrees', 'scratch', 'state', 'state-archive', '.claude'].includes(entry.name))
  .map((entry) => entry.name);

const survivors = runMutants({
  fleetRoot: FLEET,
  paths,
  selftest: 'hook-state/census.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
