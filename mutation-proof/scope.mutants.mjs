#!/usr/bin/env node
/**
 * The decisions of the mutation SCOPE check, each broken once, that `scope.selftest.mjs` must catch: which
 * files are campaigns, how a campaign is planned, which modules decide and by which rule, what counts as a gap,
 * and what the command exits with. The runner mutates a COPY of `mutation-proof/`. Every mutant keeps the code
 * runnable and changes what it DECIDES, so a kill is an assertion kill, never a crash. Not mutated, on purpose:
 * the platform separator join of a target (the same text on Linux, so the mutant is equivalent here), the type
 * guards whose removal can only throw, and the error branch of a failed spawn that no fixture can provoke.
 * @es Las decisiones del chequeo de ALCANCE de mutación, rotas una a una, que `scope.selftest.mjs` debe cazar:
 * qué ficheros son campañas, cómo se planifica una, qué módulos deciden y por qué regla, qué es un hueco y con
 * qué sale el comando. Cada mutante deja el código ejecutable y cambia lo que DECIDE. No se mutan, a propósito:
 * el cambio de separador por plataforma, las guardas de tipo cuya retirada solo puede lanzar, y la rama de error
 * de un spawn fallido que ningún fixture puede provocar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from './run-mutants.mjs';

const PLAN = 'mutation-proof/campaign-plan.mjs';
const DECIDING = 'mutation-proof/deciding-modules.mjs';
const SCOPE = 'mutation-proof/scope.mjs';

const MUTANTS = [
  // --- WHICH FILES ARE CAMPAIGNS
  ['`mutants.mjs` is no campaign', PLAN, "name === 'mutants.mjs' ||", 'false ||'],
  ['`<name>.mutants.mjs` is no campaign', PLAN, "name.endsWith('.mutants.mjs') ||", 'false ||'],
  ['`<name>-mutants.mjs` is no campaign', PLAN, "name.endsWith('-mutants.mjs');", 'false;'],
  ['the runner is a campaign', PLAN, 'if (name === RUNNER_FILE) return false;', ''],

  // --- HOW A CAMPAIGN IS PLANNED
  ['the runner is never swapped for the stand-in', PLAN, 'if (path.posix.basename(specifier) === RUNNER_FILE)', 'if (false)'],
  ['every import is swapped for the stand-in', PLAN, 'if (path.posix.basename(specifier) === RUNNER_FILE)', 'if (true)'],
  ['the swap is never registered', PLAN, 'if (process.env[PLAN_FILE_ENV] !== undefined && isMainThread) register', 'if (false) register'],
  ['the swap is registered in whatever process imports the planner', PLAN, 'if (process.env[PLAN_FILE_ENV] !== undefined && isMainThread) register', 'if (isMainThread) register'],
  ['the stand-in tells the campaign the run failed', PLAN, '  return 0;\n', '  return 1;\n'],
  ['the stand-in overwrites the plan of an earlier call', PLAN, '  appendFileSync(process.env[', '  writeFileSync(process.env['],
  ['the stand-in records the label instead of the file', PLAN, 'mutant[1]', 'mutant[0]'],
  ['the child is told no file to write the plan to', PLAN, '[PLAN_FILE_ENV]: planFile', '[PLAN_FILE_ENV]: `${planFile}.other`'],
  ['a campaign has almost no time to plan', PLAN, 'const DEFAULT_TIMEOUT_MS = 60_000;', 'const DEFAULT_TIMEOUT_MS = 1;'],
  ['a timeout reads like any other failure', PLAN, "child.error?.code === 'ETIMEDOUT'", "child.error?.code === 'ETIMEDOUTX'"],
  ['a child that exits non-zero is planned anyway', PLAN, 'if (child.status !== 0) return', 'if (false) return'],
  ['a campaign that never called the runner has an empty plan', PLAN, 'if (plans.length === 0) return', 'if (false) return'],
  ['a missing plan file reads as one empty plan', PLAN, 'if (!existsSync(planFile)) return [];', "if (!existsSync(planFile)) return [{ fleetRoot: '/', files: [] }];"],
  ['a target is reported absolute', PLAN, 'path.relative(root, path.resolve(plan.fleetRoot, file))', 'path.resolve(plan.fleetRoot, file)'],
  ['a file mutated twice is listed twice', PLAN, '[...new Set(targets)].toSorted()', '[...targets].toSorted()'],
  ['the targets come in the order they were found', PLAN, '[...new Set(targets)].toSorted()', '[...new Set(targets)]'],
  ['the error line is the first line, whatever it says', PLAN, "lines.find((line) => /^[A-Za-z]*Error\\b/.test(line.trim())) ?? lines[0] ?? 'no error output'", "lines[0] ?? 'no error output'"],
  ['a TypeError is not found as an error line', PLAN, '/^[A-Za-z]*Error\\b/', '/^Error\\b/'],
  ['an error line that is not there reads as silence', PLAN, "?? lines[0] ?? 'no error output'", "?? 'no error output'"],
  ['silence says nothing', PLAN, "?? lines[0] ?? 'no error output'", '?? lines[0] ?? \'\''],
  ['a blank line counts as the first line', PLAN, '.filter((line) => line.trim().length > 0);', ';'],

  // --- WHICH MODULES DECIDE
  ['the manifest folder has another name', DECIDING, "const MANIFEST_FOLDER = 'hook-dispatch';", "const MANIFEST_FOLDER = 'hook-dispatcher';"],
  ['any file under the manifest folder is read as a manifest', DECIDING, "file.endsWith('.json') && file.split('/')", 'file.split(\'/\')'],
  ['a folder that merely contains the name holds manifests', DECIDING, "file.split('/').includes(MANIFEST_FOLDER)", 'file.includes(MANIFEST_FOLDER)'],
  ['a guard under the home folder is looked for in the repository', DECIDING, "!guard.startsWith('~/')", 'true'],
  ['a guard outside the repository is looked for in it', DECIDING, ".filter((guard) => !guard.startsWith('../'))", '.filter(() => true)'],
  ['a guard the repository does not hold is dispatched all the same', DECIDING, 'if (present.has(guard)) entries.set(', 'if (true) entries.set('],
  ['a dispatched guard does not say which manifest dispatches it', DECIDING, 'entries.set(guard, [...(entries.get(guard) ?? []), manifest]);', 'entries.set(guard, entries.get(guard) ?? []);'],
  ['the sidecars are looked for by their prefix', DECIDING, 'file.endsWith(HOOK_SIDECAR_SUFFIX)', 'file.startsWith(HOOK_SIDECAR_SUFFIX)'],
  ['a sidecar with no hook file beside it is a hook entry', DECIDING, 'if (present.has(entry)) entries.set(', 'if (true) entries.set('],
  ['a hook that emits no verdict decides', DECIDING, '      if (calls.length === 0) continue;\n', ''],
  ['a hook decides only with EVERY verdict word', DECIDING, 'VERDICT_VOCABULARY.some((word)', 'VERDICT_VOCABULARY.every((word)'],
  ['a hook that emits a verdict is not told so', DECIDING, "add(entry, 'hook entry that emits a verdict');", "add(entry, 'hook entry');"],
  ['a hook whose own source holds a verdict word is not read as deciding', DECIDING, 'if (holdsVerdict(source)) add(', 'if (false) add('],

  // --- WHICH HOOKS DECIDE THROUGH A VERDICT HELPER
  ['a helper is never looked for', DECIDING, 'const calls = helperCallsOf(entry, source, present, readText);', 'const calls = [];'],
  ['a helper-emitting hook does not say which helper', DECIDING, '`hook entry that emits a verdict through ${calls.join(\', \')}`', "'hook entry that emits a verdict'"],
  ['the helpers a hook calls are run together', DECIDING, '${calls.join(\', \')}', "${calls.join('')}"],
  ['a bare specifier is followed like a relative one', DECIDING, String.raw`from\s*['"](\.{1,2}\/[^'"]+)['"]`, String.raw`from\s*['"]([^'"]+)['"]`],
  ['an import is read only at the very start of the entry', DECIDING, '[\'"]/gm;', '[\'"]/g;'],
  ['a helper module the tree does not hold is read all the same', DECIDING, '    if (!present.has(helperModule)) continue;\n', ''],
  ['the helper module is resolved from the repository root, not from the entry', DECIDING, 'path.posix.join(path.posix.dirname(entry), specifier)', 'path.posix.join(specifier)'],
  ['an imported name is never told from its alias', DECIDING, String.raw`binding.trim().split(/\s+as\s+/)`, '[binding.trim()]'],
  ['an alias is called under the exported name', DECIDING, 'const [imported, local = imported] =', 'const [imported, , local = imported] ='],
  ['a helper the entry imports but never calls makes it decide', DECIDING, 'helpers.has(imported) && new RegExp(', 'helpers.has(imported) || new RegExp('],
  ['any imported name is a helper', DECIDING, 'helpers.has(imported) && new RegExp(', 'true && new RegExp('],
  ['a property call of the same name is a call of the helper', DECIDING, String.raw`(?<![\\w$.])`, String.raw`(?<![\\w$])`],
  ['a longer name ending like the helper is a call of it', DECIDING, String.raw`(?<![\\w$.])`, String.raw`(?<![$.])`],
  ['a name ending in `$` plus the helper is a call of it', DECIDING, String.raw`(?<![\\w$.])`, String.raw`(?<![\\w.])`],
  ['a `$` in a local name is read as an anchor', DECIDING, '${local.replaceAll(\'$\', \'\\\\$\')}', '${local}'],
  ['a space before the call parenthesis hides the call', DECIDING, String.raw`\\s*\\(`, String.raw`\\(`],
  ['the reason names the local alias, not the exported helper', DECIDING, 'calls.push(`${imported}() of', 'calls.push(`${binding.trim()}() of'],
  ['the reason names no module', DECIDING, '() of ${helperModule}`', '()`'],
  ['every export of a helper module is a helper', DECIDING, "if (holdsVerdict(lines.slice(at, end).join('\\n'))) helpers.add(", 'if (true) helpers.add('],
  ['a declaration that is not exported is a helper', DECIDING, String.raw`/^export\s+(?:async`, String.raw`/^(?:export\s+)?(?:async`],
  ['an async function is no helper', DECIDING, String.raw`(?:async\s+)?`, ''],
  ['a function is no helper', DECIDING, String.raw`(?:function\*?|const|let|class)`, '(?:const|let|class)'],
  ['a constant is no helper', DECIDING, String.raw`(?:function\*?|const|let|class)`, String.raw`(?:function\*?|let|class)`],
  ['a `let` is no helper', DECIDING, String.raw`(?:function\*?|const|let|class)`, String.raw`(?:function\*?|const|class)`],
  ['a class is no helper', DECIDING, String.raw`(?:function\*?|const|let|class)`, String.raw`(?:function\*?|const|let)`],
  ['a declaration is only its first line', DECIDING, '    while (end < lines.length && !NEXT_STATEMENT.test(lines[end])) end += 1;\n', ''],
  ['a declaration runs to the end of the file', DECIDING, String.raw`const NEXT_STATEMENT = /^\S/;`, 'const NEXT_STATEMENT = /(?!)/;'],
  ['`permissionDecision` is no verdict word', DECIDING, "'permissionDecision', ", ''],
  ['a single-quoted block is no verdict word', DECIDING, `"decision: 'block'", `, ''],
  ['a double-quoted block is no verdict word', DECIDING, `'decision: "block"', `, ''],
  ['`exitCode = 2` is no verdict word', DECIDING, "'exitCode = 2', ", ''],
  ['`process.exit(2)` is no verdict word', DECIDING, ", 'process.exit(2)'", ''],
  ['any file with a name decides, code or not', DECIDING, 'CODE_EXTENSIONS.has(path.posix.extname(candidate))', 'true'],
  ['any segment makes a file decide', DECIDING, 'DECIDING_SEGMENTS.includes(part)', 'true'],
  ['`decide` is no deciding segment', DECIDING, "['decide', 'decision', 'verdict', 'verdicts']", "['decision', 'verdict', 'verdicts']"],
  ['`decision` is no deciding segment', DECIDING, "['decide', 'decision', 'verdict', 'verdicts']", "['decide', 'verdict', 'verdicts']"],
  ['`verdict` is no deciding segment', DECIDING, "['decide', 'decision', 'verdict', 'verdicts']", "['decide', 'decision', 'verdicts']"],
  ['`verdicts` is no deciding segment', DECIDING, "['decide', 'decision', 'verdict', 'verdicts']", "['decide', 'decision', 'verdict']"],
  ['a name is not split on dashes', DECIDING, ".split('-')", ".split('+')"],
  ['a name is not split on dots', DECIDING, '.flatMap((part) => part.split(\'.\'))', '.flatMap((part) => [part])'],
  ['a campaign decides', DECIDING, 'return isCampaignFile(file) ||', 'return false ||'],
  ['`selftest.mjs` decides', DECIDING, "name === 'selftest.mjs' ||", 'false ||'],
  ['`<name>.selftest.mjs` decides', DECIDING, "name.endsWith('.selftest.mjs') ||", 'false ||'],
  ['`<name>-selftest.mjs` decides', DECIDING, "name.endsWith('-selftest.mjs');", 'false;'],
  ['a test file is added like any module', DECIDING, 'if (isTestingFile(file)) return;\n\n    candidates', 'candidates'],
  ['a declaration with an empty file name is read as one with a file', DECIDING, "typeof file !== 'string' || file.length === 0", "typeof file !== 'string'"],
  ['a declaration with a blank reason is accepted', DECIDING, "typeof declaration.why !== 'string' || declaration.why.trim().length === 0", "typeof declaration.why !== 'string'"],
  ['a declared file the repository lacks is accepted', DECIDING, 'else if (!present.has(file))', 'else if (false)'],
  ['a declared selftest is accepted', DECIDING, 'else if (isTestingFile(file))', 'else if (false)'],
  ['a second reason replaces the first', DECIDING, 'candidates.set(file, [...(candidates.get(file) ?? []), reason]);', 'candidates.set(file, [reason]);'],
  ['the dispatch reason names no manifest', DECIDING, '`dispatched by ${manifest}`', "'dispatched'"],
  ['the name reason names no segment', DECIDING, '`named ${segment}`', "'named'"],
  ['the declared reason hides why', DECIDING, '`declared: ${declaration.why}`', "'declared'"],
  ['what the runner can parse is out of reach and the rest is a module', DECIDING, '(MUTABLE_EXTENSIONS.has(path.posix.extname(file)) ? modules : outOfReach)', '(MUTABLE_EXTENSIONS.has(path.posix.extname(file)) ? outOfReach : modules)'],
  ['`.mjs` is not mutable', DECIDING, "new Set(['.mjs', '.cjs', '.js'])", "new Set(['.cjs', '.js'])"],
  ['`.cjs` is not mutable', DECIDING, "new Set(['.mjs', '.cjs', '.js'])", "new Set(['.mjs', '.js'])"],
  ['`.js` is not mutable', DECIDING, "new Set(['.mjs', '.cjs', '.js'])", "new Set(['.mjs', '.cjs'])"],
  ['`.ts` is no code', DECIDING, "'.ts', '.mts', '.cts', '.tsx'", "'.mts', '.cts', '.tsx'"],
  ['`.mts` is no code', DECIDING, "'.ts', '.mts', '.cts', '.tsx'", "'.ts', '.cts', '.tsx'"],
  ['`.cts` is no code', DECIDING, "'.ts', '.mts', '.cts', '.tsx'", "'.ts', '.mts', '.tsx'"],
  ['`.tsx` is no code', DECIDING, "'.ts', '.mts', '.cts', '.tsx'", "'.ts', '.mts', '.cts'"],

  // --- THE SCOPE: GAPS, OPTIONAL, EXIT CODES
  ['git is not asked for tracked files', SCOPE, "'--cached', ", ''],
  ['git is not asked for untracked files', SCOPE, "'--others', ", ''],
  ['git is not told to leave the ignored out', SCOPE, ", '--exclude-standard'", ''],
  ['a file that is gone from disk is still listed', SCOPE, "file !== '' && existsSync(path.join(root, file))", "file !== ''"],
  ['the empty entry after the last separator is listed', SCOPE, "file !== '' && existsSync(path.join(root, file))", 'existsSync(path.join(root, file))'],
  ['the population comes in git order', SCOPE, 'existsSync(path.join(root, file)))\n    .toSorted();', 'existsSync(path.join(root, file)));'],
  ['a failed git listing is an empty repository', SCOPE, 'listed.error !== undefined || listed.status !== 0', 'listed.error !== undefined'],
  ['a file that is no campaign is planned', SCOPE, 'files.filter(isCampaignFile)', 'files.filter((file) => isCampaignFile(file) || file === files[0])'],
  ['a problem of a campaign does not say which', SCOPE, 'planned.problems.map((problem) => `campaign ${campaign}: ${problem}`)', 'planned.problems'],
  ['the last campaign to mutate a file is the only one listed', SCOPE, '[...(covering.get(target) ?? []), campaign]', '[campaign]'],
  ['the campaigns of a module come in the order they were found', SCOPE, '(covering.get(file) ?? []).toSorted()', '(covering.get(file) ?? [])'],
  ['the deciding modules come in the order they were found', SCOPE, '[...found.modules.keys()].toSorted()', '[...found.modules.keys()]'],
  ['a covered module is a gap and an uncovered one is not', SCOPE, 'entry.campaigns.length === 0', 'entry.campaigns.length > 0'],
  ['a deciding module is listed as optional too', SCOPE, '.filter((file) => !found.modules.has(file))', '.filter(() => true)'],
  ['the optional modules come in the order they were found', SCOPE, '.toSorted()\n      .map((file) => ({ file, campaigns', '.map((file) => ({ file, campaigns'],
  ['the modules out of reach come in the order they were found', SCOPE, '[...found.outOfReach.keys()].toSorted()', '[...found.outOfReach.keys()]'],
  ['a problem does not outrank a gap', SCOPE, 'if (scope.problems.length > 0) return EXIT_NOT_MEASURED;', ''],
  ['a gap exits 0 and a complete scope exits 1', SCOPE, 'scope.gaps.length > 0 ? EXIT_GAP : 0', 'scope.gaps.length > 0 ? 0 : EXIT_GAP'],
  ['a gap exits with the not-measured code', SCOPE, 'const EXIT_GAP = 1;', 'const EXIT_GAP = 2;'],
  ['not measured exits with the gap code', SCOPE, 'const EXIT_NOT_MEASURED = 2;', 'const EXIT_NOT_MEASURED = 3;'],
  ['the covered count adds the gaps', SCOPE, 'scope.deciding.length - scope.gaps.length', 'scope.deciding.length + scope.gaps.length'],
  ['a gap does not say why it is demanded', SCOPE, "scope.deciding.find((entry) => entry.file === file).reasons.join('; ')", "scope.deciding.find((entry) => entry.file === file).reasons[0]"],
  ['the optional header is printed with nothing optional', SCOPE, 'if (scope.optional.length > 0) {', 'if (scope.optional.length >= 0) {'],
  ['the campaigns of an optional module are run together', SCOPE, "entry.campaigns.join(', ')", "entry.campaigns.join('')"],
  ['the reasons of a module out of reach are run together', SCOPE, "entry.reasons.join('; ')", "entry.reasons.join('')"],
  ['OK is said with a gap', SCOPE, 'if (scope.gaps.length === 0 && scope.problems.length === 0)', 'if (scope.problems.length === 0)'],
  ['OK is said with a problem', SCOPE, 'if (scope.gaps.length === 0 && scope.problems.length === 0)', 'if (scope.gaps.length === 0)'],
  ['a repository without a declaration cannot be measured', SCOPE, 'if (!existsSync(file)) return [];', 'if (false) return [];'],
  ['a declaration that is no list is accepted', SCOPE, '!Array.isArray(DECLARED_DECIDING)', 'false'],
  ['the declaration is not read', SCOPE, 'declared: await declaredIn(root)', 'declared: []'],
  ['a campaign is planned against the wrong root', SCOPE, 'planCampaign({ root, campaign })', "planCampaign({ root: '.', campaign })"],
  ['no argument measures nothing', SCOPE, 'if (argv.length === 0) return { root: OWN_ROOT };', ''],
  ['--git-dir is never read', SCOPE, "if (argv.length === 4 && argv[0] === '--root' && argv[2] === '--git-dir') return", 'if (false) return'],
  ['any third argument names the git dir', SCOPE, "argv.length === 4 && argv[0] === '--root' && argv[2] === '--git-dir'", "argv.length === 4 && argv[0] === '--root'"],
  ['the git dir named on the command line is dropped', SCOPE, 'measureRepository(options.root, { gitDir: options.gitDir })', 'measureRepository(options.root, {})'],
  ['the git dir is dropped on the way to the population', SCOPE, 'listPopulation(root, { gitDir });', 'listPopulation(root);'],
  ['a git dir is never used to list', SCOPE, "gitDir === undefined ? ['-C', root]", "true ? ['-C', root]"],
  ['an empty population is measured as one with nothing deciding', SCOPE, 'if (files.length === 0) {', 'if (false) {'],
  ['any first argument names the root', SCOPE, "argv.length === 2 && argv[0] === '--root'", 'argv.length === 2'],
  ['one argument names the root', SCOPE, "argv.length === 2 && argv[0] === '--root'", "argv[0] === '--root'"],
  ['the repository this copy sits in is the folder it is in', SCOPE, "path.dirname(fileURLToPath(import.meta.url)), '..')", "path.dirname(fileURLToPath(import.meta.url)), '.')"],
  ['a bad command line is measured as the own repository', SCOPE, 'if (options === undefined) {', 'if (false) {'],
  ['the check measures whenever it is imported', SCOPE, 'if (path.resolve(process.argv[1] ?? \'\') === fileURLToPath(import.meta.url))', 'if (true)']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  selftest: 'mutation-proof/scope.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
