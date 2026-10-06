#!/usr/bin/env node
/**
 * Selftest of the mutation SCOPE check: which modules decide, which campaigns mutate which modules, and
 * what the check says about the difference. Every fixture is constructed here (file lists, a throwaway git
 * repository, campaign files written to a temp directory) and every expectation is worked out by hand, so
 * the verdicts cannot drift with the repository that holds this file; the repository itself is measured by
 * `scope-repository.selftest.mjs`.
 *
 * The states the decisions range over: a module that decides by being DISPATCHED (a manifest under
 * `hook-dispatch/`, a manifest elsewhere, an unreadable one, one that lists a missing guard, one that lists
 * a guard outside the repository), by being a HOOK ENTRY that emits a verdict (each word of the verdict
 * vocabulary, a quiet entry, a verdict word in a file that is no hook entry, a sidecar with no file), by being
 * a HOOK ENTRY that calls a VERDICT HELPER it imports (each declaration kind, an alias, an import over several
 * lines or after another, a helper never called, a quiet neighbour, a private builder, a bare specifier, a
 * module the tree lacks), by its NAME (each segment, the near misses, a test file, a campaign file, a non-JavaScript file), by DECLARATION
 * (with and without a reason, naming a file that is gone), or by several of them at once; a deciding module
 * covered by one campaign, by two, by none; a campaign over a module that does not decide; a campaign that
 * cannot be planned. The planner runs the REAL child process over campaign files written here: one that
 * calls the runner twice, never, throws, exits non-zero, prints noise that looks like a plan, or never ends.
 *
 * @es Selftest del chequeo de ALCANCE de mutación: qué módulos deciden, qué campañas mutan qué módulos y
 * qué dice el chequeo de la diferencia. Cada fixture se construye aquí (listas de ficheros, un repo git
 * desechable, campañas escritas en un directorio temporal) y cada expectativa se calcula a mano; el
 * repositorio mismo lo mide `scope-repository.selftest.mjs`. Estados: un módulo que decide por ser DESPACHADO
 * (manifiesto bajo `hook-dispatch/`, uno de fuera, uno ilegible, uno que lista una guardia ausente o ajena al
 * repo), por ser una ENTRADA DE HOOK que emite veredicto (cada palabra del vocabulario, una entrada callada, una
 * palabra en un fichero que no es hook, un sidecar sin fichero), por LLAMAR a un HELPER DE VEREDICTO que
 * importa (cada tipo de declaración, un alias, un import en varias líneas o tras otro, un helper nunca llamado,
 * un vecino callado, un constructor privado, un especificador desnudo, un módulo ausente), por su NOMBRE (cada segmento, los casi, un
 * test, una campaña, un fichero no JavaScript), por DECLARACIÓN (con y sin motivo, de un fichero que ya no
 * está), o por varias a la vez; cubierto por una campaña, por dos, por ninguna; una campaña sobre un módulo
 * que no decide; una campaña que no se puede planificar. El planificador corre el proceso hijo REAL sobre
 * campañas escritas aquí: una que llama al corredor dos veces, ninguna, lanza, sale con error, imprime ruido
 * que parece un plan, o no termina.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isCampaignFile, planCampaign } from './campaign-plan.mjs';
import { VERDICT_VOCABULARY, decidingModules, verdictHelpersOf } from './deciding-modules.mjs';
import { exitCodeOf, listPopulation, renderScope, scopeOf } from './scope.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('mutation-proof');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIBLINGS = ['scope.mjs', 'campaign-plan.mjs', 'deciding-modules.mjs'];
const SCOPE_CLI = path.join(HERE, 'scope.mjs');

let passed = 0;
let total = 0;

function expect(name, predicate) {
  total += 1;

  if (predicate) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name} @es FALLO ${name}`);
  }
}

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

/** `decidingModules` over a constructed tree: `texts` maps a file to its content, every key is a file. @es Sobre un árbol construido. */
function decidingIn(texts, extraFiles = [], declared = []) {
  return decidingModules({ files: [...Object.keys(texts), ...extraFiles], readText: (file) => texts[file], declared });
}

const reasonsOf = (found, file) => found.modules.get(file);
const NO_PLAN = () => ({ targets: [], problems: [] });

expect('importing the check runs nothing: it measures only when started as the command', process.exitCode === undefined);

// --- which files are campaigns.
expect('a campaign is `mutants.mjs`, in any folder', isCampaignFile('mutants.mjs') && isCampaignFile('guard/mutants.mjs'));
expect('a campaign is `<name>.mutants.mjs`', isCampaignFile('failure-capture/budget-verdict.mutants.mjs'));
expect('a campaign is `<name>-mutants.mjs` (this repository has them)', isCampaignFile('integrate/install-mutants.mjs'));
expect('the runner is no campaign, though its name ends the same way', !isCampaignFile('mutation-proof/run-mutants.mjs') && !isCampaignFile('run-mutants.mjs'));
expect('a selftest, a source and a backup are no campaign', !isCampaignFile('a/selftest.mjs') && !isCampaignFile('a/mutants.mjs.bak') && !isCampaignFile('a/mutantsx.mjs') && !isCampaignFile('a/guard.mjs'));
expect('a campaign is JavaScript: `mutants.js` is not one', !isCampaignFile('a/mutants.js'));

// --- deciding by DISPATCH: the manifest of a dispatcher.
const MANIFEST = JSON.stringify({ event: 'Stop', guards: ['../../alpha/guard.mjs', '../../beta/guard.mjs'] });
const dispatched = decidingIn({ 'hook-dispatch/manifests/stop.json': MANIFEST, 'alpha/guard.mjs': 'permissionDecision', 'beta/guard.mjs': 'permissionDecision' });

expect('a guard listed by a manifest that emits no verdict does not decide: it records, it does not refuse', (() => {
  const found = decidingIn({ 'hook-dispatch/manifests/stop.json': MANIFEST, 'alpha/guard.mjs': 'writes the ledger', 'beta/guard.mjs': 'writes the ledger' });

  return found.modules.size === 0 && found.problems.length === 0;
})());
expect('a guard two manifests list carries both', same(reasonsOf(decidingIn({ 'hook-dispatch/a.json': JSON.stringify({ guards: ['../g.mjs'] }), 'hook-dispatch/b.json': JSON.stringify({ guards: ['../g.mjs'] }), 'g.mjs': 'permissionDecision' }), 'g.mjs'), ['hook entry that emits a verdict', 'dispatched by hook-dispatch/a.json', 'dispatched by hook-dispatch/b.json']));
expect('a guard listed by a manifest under hook-dispatch/ that emits a verdict decides', dispatched.modules.has('alpha/guard.mjs') && dispatched.modules.has('beta/guard.mjs'));
expect('and the reasons say it emits a verdict and name the manifest', same(reasonsOf(dispatched, 'alpha/guard.mjs'), ['hook entry that emits a verdict', 'dispatched by hook-dispatch/manifests/stop.json']));
expect('a guard path is resolved from the manifest folder, so `../` climbs out of manifests/', !dispatched.modules.has('hook-dispatch/alpha/guard.mjs') && dispatched.problems.length === 0);
expect('a manifest directly in hook-dispatch/ resolves its guards from there', decidingIn({ 'hook-dispatch/pre.json': JSON.stringify({ event: 'Stop', guards: ['../alpha/guard.mjs'] }), 'alpha/guard.mjs': 'permissionDecision' }).modules.has('alpha/guard.mjs'));
expect('a folder that merely CONTAINS the name is not hook-dispatch/', decidingIn({ 'x/my-hook-dispatch/stop.json': MANIFEST, 'alpha/guard.mjs': 'permissionDecision', 'beta/guard.mjs': 'permissionDecision' }).modules.size === 0);
expect('a file under hook-dispatch/ that is not JSON is not read as a manifest', (() => {
  const found = decidingIn({ 'hook-dispatch/dispatch.mjs': 'export const x = 1;' });

  return found.modules.size === 0 && found.problems.length === 0;
})());
expect('the same JSON elsewhere is not a manifest and is not even read', decidingIn({ 'other/stop.json': MANIFEST, 'alpha/guard.mjs': 'permissionDecision', 'beta/guard.mjs': 'permissionDecision' }).modules.size === 0);
expect('a JSON under hook-dispatch/ with no guards list is data, not a finding', (() => {
  const found = decidingIn({ 'hook-dispatch/notes.json': JSON.stringify({ event: 'Stop' }) });

  return found.modules.size === 0 && found.problems.length === 0;
})());
expect('a manifest that does not parse is a PROBLEM that names it, never "no guards"', (() => {
  const found = decidingIn({ 'hook-dispatch/manifests/broken.json': '{ not json' });

  return found.modules.size === 0 && found.problems.length === 1 && found.problems[0].includes('hook-dispatch/manifests/broken.json');
})());
expect('a manifest that lists a guard the tree does not hold is a PROBLEM that names both', (() => {
  const found = decidingIn({ 'hook-dispatch/manifests/stop.json': MANIFEST, 'alpha/guard.mjs': '' });

  return found.problems.length === 1 && found.problems[0].includes('beta/guard.mjs') && found.problems[0].includes('hook-dispatch/manifests/stop.json');
})());
expect('a guard spelled under the home folder or outside the repository is another repository\'s, and is skipped', (() => {
  const found = decidingIn({ 'hook-dispatch/manifests/stop.json': JSON.stringify({ event: 'Stop', guards: ['~/.claude/x/guard.mjs', '../../../outside/guard.mjs', 7] }) });

  return found.modules.size === 0 && found.problems.length === 0;
})());

// --- deciding by being a HOOK ENTRY that emits a verdict.
const PINNED_VERDICT_WORDS = ['permissionDecision', "decision: 'block'", 'decision: "block"', 'exitCode = 2', 'process.exit(2)'];

expect(`the module lists exactly the ${PINNED_VERDICT_WORDS.length} pinned verdict words`, same(VERDICT_VOCABULARY, PINNED_VERDICT_WORDS));

for (const word of PINNED_VERDICT_WORDS) {
  expect(`a hook entry whose source holds the verdict word ${JSON.stringify(word)} decides`, decidingIn({ 'x/hook.mjs': `emit(${word});`, 'x/hook.mjs.hook-registration.json': '{}' }).modules.has('x/hook.mjs'));
}

const quiet = decidingIn({ 'x/hook.mjs': 'console.log("formats a file");', 'x/hook.mjs.hook-registration.json': '{}' });

expect('a hook entry that emits no verdict does not decide', quiet.modules.size === 0);
expect('a verdict word in a file that is no hook entry does not make it decide', decidingIn({ 'x/lib.mjs': 'permissionDecision' }).modules.size === 0);
expect('a sidecar whose hook file is not in the tree is ignored here (the registration self-check owns that)', decidingIn({ 'x/hook.mjs.hook-registration.json': '{}' }).modules.size === 0);
expect('a sidecar with no hook file beside it decides nothing even if every file reads as a verdict', decidingModules({ files: ['x/hook.mjs.hook-registration.json'], readText: () => 'permissionDecision', declared: [] }).modules.size === 0);
expect('and the reason says the entry emits a verdict', same(reasonsOf(decidingIn({ 'x/hook.mjs': 'permissionDecision', 'x/hook.mjs.hook-registration.json': '{}' }), 'x/hook.mjs'), ['hook entry that emits a verdict']));

// --- deciding by being a HOOK ENTRY that emits its verdict through a HELPER it imports.
// The shared hook-io shape: one export builds the verdict, its neighbours do not. @es La forma de hook-io compartido.
const HOOK_IO = `/** A refusal. */
export const deny = (reason) => ({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason } });

/** Context, not a refusal; the next export's comment names permissionDecision without building one. */
export const advise = (context) => ({ hookSpecificOutput: { additionalContext: context } });

export function block(reason) {
  const output = {
    decision: 'block',
    reason
  };

  return output;
}

export async function blockLater(reason) {
  return { decision: "block", reason };
}

export let exitBlocking = () => {
  process.exitCode = 2;
};

export class Refusal {
  emit() {
    process.exit(2);
  }
}

export function quiet(x) {
  return x;
}
const trailing = 'permissionDecision';
function deniedButPrivate() {
  return { permissionDecision: 'deny' };
}
`;
const SIDECAR = '{}';
const viaHelper = (entrySource, extra = {}) => decidingIn({ 'x/lib/hook-io.mjs': HOOK_IO, 'x/hook.mjs': entrySource, 'x/hook.mjs.hook-registration.json': SIDECAR, ...extra });
const decidesViaHelper = (entrySource, extra) => viaHelper(entrySource, extra).modules.has('x/hook.mjs');

expect('the verdict helpers of a module are exactly its exports whose OWN declaration holds a verdict word, of every declaration kind', same([...verdictHelpersOf(HOOK_IO)].toSorted(), ['Refusal', 'block', 'blockLater', 'deny', 'exitBlocking']));
expect('a hook entry that calls a verdict helper it imports decides, and the reason names the helper and its module', same(reasonsOf(viaHelper("import { deny } from './lib/hook-io.mjs';\nexport const evaluate = () => deny('no');"), 'x/hook.mjs'), ['hook entry that emits a verdict through deny() of x/lib/hook-io.mjs']));
expect('a helper reached by `../` from the entry is found too', decidingIn({ 'lib/hook-io.mjs': HOOK_IO, 'x/hook.mjs': "import { deny } from '../lib/hook-io.mjs';\ndeny('no');", 'x/hook.mjs.hook-registration.json': SIDECAR }).modules.has('x/hook.mjs'));
expect('a helper-emitting entry a manifest dispatches carries the manifest too', same(reasonsOf(decidingIn({ 'hook-dispatch/m.json': JSON.stringify({ guards: ['../x/hook.mjs'] }), 'x/lib/hook-io.mjs': HOOK_IO, 'x/hook.mjs': "import { deny } from './lib/hook-io.mjs';\ndeny('no');" }), 'x/hook.mjs'), ['hook entry that emits a verdict through deny() of x/lib/hook-io.mjs', 'dispatched by hook-dispatch/m.json']));
expect('every helper the entry calls is named, in import order', same(reasonsOf(viaHelper("import { advise, deny, block } from './lib/hook-io.mjs';\ndeny('a'); block('b'); advise('c');"), 'x/hook.mjs'), ['hook entry that emits a verdict through deny() of x/lib/hook-io.mjs, block() of x/lib/hook-io.mjs']));
expect('an import that spans several lines is read', decidesViaHelper("import {\n  advise,\n  deny\n} from './lib/hook-io.mjs';\ndeny('no');"));
expect('an aliased helper is followed under its local name, and the reason names the exported one', same(reasonsOf(viaHelper("import { deny as refuse } from './lib/hook-io.mjs';\nrefuse('no');"), 'x/hook.mjs'), ['hook entry that emits a verdict through deny() of x/lib/hook-io.mjs']));
expect('a local name holding `$` is matched literally', decidesViaHelper("import { deny as $deny } from './lib/hook-io.mjs';\n$deny('no');"));
expect('a space before the call parenthesis is still a call', decidesViaHelper("import { deny } from './lib/hook-io.mjs';\ndeny ('no');"));
expect('an entry that imports only a helper that emits no verdict does not decide', !decidesViaHelper("import { advise, quiet } from './lib/hook-io.mjs';\nadvise('a'); quiet(1);"));
expect('an entry that imports a verdict helper but never calls it does not decide', !decidesViaHelper("import { advise, deny } from './lib/hook-io.mjs';\nadvise('a');"));
expect('a call of another name that ends like the helper, or of a property named like it, is no call of it', !decidesViaHelper("import { deny } from './lib/hook-io.mjs';\nundeny('a'); my$deny('b'); io.deny('c');"));
expect('an export with no verdict in its own declaration is no helper, whatever follows it at the top level', !decidesViaHelper("import { quiet } from './lib/hook-io.mjs';\nquiet(1);") && !verdictHelpersOf(HOOK_IO).has('quiet'));
expect('a private function that builds a verdict is no exported helper', !decidesViaHelper("import { deniedButPrivate } from './lib/hook-io.mjs';\ndeniedButPrivate();"));
expect('a bare specifier is another repository\'s code and is never followed, even when a same-named folder sits beside the entry', !decidesViaHelper("import { deny } from 'lib/hook-io.mjs';\ndeny('no');"));
expect('a helper module the tree does not hold is never read (the real reader throws on it), and makes no decision and no problem', (() => {
  const texts = { 'x/hook.mjs': "import { deny } from './gone/hook-io.mjs';\ndeny('no');", 'x/hook.mjs.hook-registration.json': SIDECAR };

  try {
    const found = decidingModules({ files: Object.keys(texts), readText: (file) => { if (!(file in texts)) throw new Error(`ENOENT ${file}`); return texts[file]; }, declared: [] });

    return found.modules.size === 0 && found.problems.length === 0;
  } catch {
    return false;
  }
})());
expect('an entry whose helper import is not its first line is read', decidesViaHelper("import path from 'node:path';\nimport { deny } from './lib/hook-io.mjs';\ndeny(path.sep);"));
expect('a helper call in a file that is no hook entry does not make it decide', decidingIn({ 'x/lib/hook-io.mjs': HOOK_IO, 'x/lib.mjs': "import { deny } from './lib/hook-io.mjs';\ndeny('no');" }).modules.size === 0);
expect('an entry that holds a verdict word itself keeps the plain reason, helper or not', same(reasonsOf(viaHelper("import { deny } from './lib/hook-io.mjs';\ndeny('no'); // permissionDecision"), 'x/hook.mjs'), ['hook entry that emits a verdict']));

// --- deciding by NAME.
for (const name of ['a/decide.mjs', 'a/decision.mjs', 'a/run-verdict.mjs', 'a/tree-verdicts.mjs', 'a/decide-more.mjs', 'a/verdict.cjs', 'a/decide.js', 'a/tree.verdict.mjs']) {
  expect(`${name} decides by its name`, decidingIn({ [name]: '' }).modules.has(name));
}
for (const name of ['a/decider.mjs', 'a/undecided.mjs', 'a/predecision.mjs', 'a/verdicting.mjs', 'a/decide.selftest.mjs', 'a/decide-selftest.mjs', 'a/decide.mutants.mjs', 'a/decide-mutants.mjs', 'a/decide.json', 'a/decide.md']) {
  expect(`${name} does not decide by its name`, (() => {
    const found = decidingIn({ [name]: '' });

    return found.modules.size === 0 && found.outOfReach.size === 0;
  })());
}
expect('the name decides only by the file name, not by a folder called decide/', decidingIn({ 'decide/helper.mjs': '' }).modules.size === 0);
expect('and the reason says which name', same(reasonsOf(decidingIn({ 'a/tree-verdicts.mjs': '' }), 'a/tree-verdicts.mjs'), ['named verdicts']));

const unreachable = decidingIn({ 'a/decide.ts': '', 'a/decide.mts': '', 'a/decide.cts': '', 'a/decide.tsx': '', 'x/hook.ts': 'permissionDecision', 'x/hook.ts.hook-registration.json': '{}' });

expect('a deciding file the runner cannot parse (TypeScript) is OUT OF REACH, not a module nobody can cover', unreachable.modules.size === 0 && ['a/decide.ts', 'a/decide.mts', 'a/decide.cts', 'a/decide.tsx', 'x/hook.ts'].every((file) => unreachable.outOfReach.has(file)));

// --- deciding by DECLARATION.
const declared = decidingIn({ 'integrate/landing.mjs': '' }, [], [{ file: 'integrate/landing.mjs', why: 'moves the integration branch' }]);

expect('a declared file decides, with its stated reason', same(reasonsOf(declared, 'integrate/landing.mjs'), ['declared: moves the integration branch']));
expect('a declared file the tree does not hold is a PROBLEM that names it', decidingIn({}, [], [{ file: 'integrate/gone.mjs', why: 'was a verdict' }]).problems.some((problem) => problem.includes('integrate/gone.mjs')));
expect('a declaration with no reason is a PROBLEM, so the owner can always read why a module is demanded', decidingIn({ 'integrate/landing.mjs': '' }, [], [{ file: 'integrate/landing.mjs', why: '  ' }]).problems.some((problem) => problem.includes('integrate/landing.mjs')));
expect('a declaration that is no object with a file is a PROBLEM that says it names none', (() => {
  const found = decidingIn({}, [], [null, { why: 'x' }, { file: '', why: 'x' }]);

  return found.problems.length === 3 && found.problems.every((problem) => problem.includes('names no file'));
})());

const several = decidingIn({ 'hook-dispatch/m.json': JSON.stringify({ guards: ['../a/decide.mjs'] }), 'a/decide.mjs': 'permissionDecision' }, [], [{ file: 'a/decide.mjs', why: 'pinned' }]);

expect('a module that decides in several ways is ONE module with every reason, in rule order', several.modules.size === 1 && same(reasonsOf(several, 'a/decide.mjs'), ['hook entry that emits a verdict', 'dispatched by hook-dispatch/m.json', 'named decide', 'declared: pinned']));
expect('a selftest or a campaign a manifest lists is never a deciding module', decidingIn({ 'hook-dispatch/m.json': JSON.stringify({ guards: ['../a/selftest.mjs', '../a/mutants.mjs'] }), 'a/selftest.mjs': 'permissionDecision', 'a/mutants.mjs': 'permissionDecision' }).modules.size === 0);
expect('a selftest declared deciding is a PROBLEM, never a quiet drop', decidingIn({ 'a/x.selftest.mjs': '' }, [], [{ file: 'a/x.selftest.mjs', why: 'by mistake' }]).problems.some((problem) => problem.includes('a/x.selftest.mjs')));

// --- the scope: campaigns against deciding modules.
const SCOPE_FILES = ['hook-dispatch/m.json', 'a/guard.mjs', 'a/lib.mjs', 'a/mutants.mjs', 'b/guard.mjs', 'b/y.mutants.mjs', 'b/x.mutants.mjs', 'c/guard.mjs', 'run-mutants.mjs'];
const SCOPE_TEXTS = { 'hook-dispatch/m.json': JSON.stringify({ guards: ['../c/guard.mjs', '../a/guard.mjs', '../b/guard.mjs'] }), 'a/guard.mjs': 'permissionDecision', 'b/guard.mjs': 'permissionDecision', 'c/guard.mjs': 'permissionDecision' };
const PLANS = {
  'a/mutants.mjs': { targets: ['a/guard.mjs', 'a/lib.mjs', 'a/aux.mjs'], problems: [] },
  'b/x.mutants.mjs': { targets: ['b/guard.mjs'], problems: [] },
  'b/y.mutants.mjs': { targets: ['b/guard.mjs', 'a/lib.mjs'], problems: [] }
};
const asked = [];
const scope = scopeOf({
  files: SCOPE_FILES,
  readText: (file) => SCOPE_TEXTS[file],
  declared: [],
  plan: (campaign) => {
    asked.push(campaign);

    return PLANS[campaign] ?? { targets: [], problems: [`unexpected campaign ${campaign}`] };
  }
});

expect('only campaign files are planned', same(asked.toSorted(), ['a/mutants.mjs', 'b/x.mutants.mjs', 'b/y.mutants.mjs']));
expect('a deciding module covered by a campaign lists it', same(scope.deciding.find((entry) => entry.file === 'a/guard.mjs')?.campaigns, ['a/mutants.mjs']));
expect('a module covered by two campaigns lists both, sorted', same(scope.deciding.find((entry) => entry.file === 'b/guard.mjs')?.campaigns, ['b/x.mutants.mjs', 'b/y.mutants.mjs']));
expect('a deciding module no campaign mutates is a GAP, and only that one', same(scope.gaps, ['c/guard.mjs']));
expect('a module mutated though it does not decide is OPTIONAL, with its campaigns', same(scope.optional, [{ file: 'a/aux.mjs', campaigns: ['a/mutants.mjs'] }, { file: 'a/lib.mjs', campaigns: ['a/mutants.mjs', 'b/y.mutants.mjs'] }]));
expect('a deciding module is never listed as optional', !scope.optional.some((entry) => entry.file.endsWith('guard.mjs')));
expect('deciding modules come sorted by path', same(scope.deciding.map((entry) => entry.file), ['a/guard.mjs', 'b/guard.mjs', 'c/guard.mjs']));
expect('a scope with a gap exits 1', exitCodeOf(scope) === 1);
expect('modules out of reach come sorted by path', same(scopeOf({ files: ['b/decide.ts', 'a/decide.ts'], readText: () => undefined, declared: [], plan: NO_PLAN }).outOfReach.map((entry) => entry.file), ['a/decide.ts', 'b/decide.ts']));

const complete = scopeOf({ files: ['x/decide.mjs', 'x/mutants.mjs'], readText: () => undefined, declared: [], plan: () => ({ targets: ['x/decide.mjs'], problems: [] }) });

expect('a scope with every deciding module covered has no gap and exits 0', complete.gaps.length === 0 && complete.problems.length === 0 && exitCodeOf(complete) === 0);

const broken = scopeOf({ files: ['x/decide.mjs', 'x/mutants.mjs'], readText: () => undefined, declared: [], plan: () => ({ targets: [], problems: ['it exited 3'] }) });

expect('a campaign that cannot be planned is a PROBLEM that names it, and the gap it leaves is still counted', broken.problems.length === 1 && broken.problems[0].includes('x/mutants.mjs') && broken.problems[0].includes('it exited 3') && same(broken.gaps, ['x/decide.mjs']));
expect('a scope that could not measure exits 2, ahead of a gap', exitCodeOf(broken) === 2);

const manifestProblem = scopeOf({ files: ['hook-dispatch/m.json'], readText: () => '{', declared: [], plan: NO_PLAN });

expect('a problem found while defining the deciding modules reaches the scope', manifestProblem.problems.length === 1 && exitCodeOf(manifestProblem) === 2);

// --- the report.
const lines = renderScope(scope);

expect('the report opens with the totals, in both languages', lines[0].includes('3 deciding') && lines[0].includes('2 covered') && lines[0].includes('1 gap') && lines[0].includes('@es'));
expect('a gap line names the module and why it is demanded', lines.some((line) => line.startsWith('GAP') && line.includes('c/guard.mjs') && line.includes('dispatched by hook-dispatch/m.json')));
expect('an optional line names the module and its campaigns, and says the owner decides', lines.some((line) => line.startsWith('OPTIONAL') && line.includes('a/lib.mjs (a/mutants.mjs, b/y.mutants.mjs)')) && lines.some((line) => line.includes('keep or drop')));
expect('a covered module is not a line of its own', !lines.some((line) => line.startsWith('GAP') && line.includes('a/guard.mjs')));
expect('a problem has its own line', renderScope(broken).some((line) => line.startsWith('PROBLEM') && line.includes('it exited 3')));
expect('a module out of reach carries every reason it decides', renderScope(scopeOf({ files: ['hook-dispatch/m.json', 'a/decide.ts'], readText: (file) => (file === 'a/decide.ts' ? 'permissionDecision' : JSON.stringify({ guards: ['../a/decide.ts'] })), declared: [], plan: NO_PLAN })).some((line) => line.startsWith('OUT OF REACH') && line.includes('hook entry that emits a verdict; dispatched by hook-dispatch/m.json; named decide')));
expect('a module out of reach is reported as information', renderScope(scopeOf({ files: ['a/decide.ts'], readText: () => undefined, declared: [], plan: NO_PLAN })).some((line) => line.startsWith('OUT OF REACH') && line.includes('a/decide.ts')));
expect('a complete scope says so', renderScope(complete).some((line) => line.includes('no deciding module without a campaign')));
expect('a complete scope has no optional header and a scope with a gap does not say OK', !renderScope(complete).some((line) => line.startsWith('OPTIONAL')) && !lines.some((line) => line.startsWith('OK')));
expect('a scope with a problem and no gap does not say OK either', !renderScope({ deciding: [], gaps: [], optional: [], outOfReach: [], problems: ['x'] }).some((line) => line.startsWith('OK')));
expect('a gap line carries every reason', renderScope(scopeOf({ files: ['hook-dispatch/m.json', 'a/decide.mjs'], readText: (file) => (file === 'a/decide.mjs' ? 'permissionDecision' : JSON.stringify({ guards: ['../a/decide.mjs'] })), declared: [], plan: NO_PLAN })).some((line) => line.startsWith('GAP') && line.includes('hook entry that emits a verdict; dispatched by hook-dispatch/m.json; named decide')));

// --- the planner, over the real child process.
const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), 'mutation-scope-selftest-')));

function campaignFile(relative, source) {
  const file = path.join(sandbox, relative);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);

  return relative;
}

const calling = (fleetRoot, files) => `runMutants({ fleetRoot: ${JSON.stringify(fleetRoot)}, paths: ['x'], selftest: 'x/selftest.mjs', mutants: ${JSON.stringify(files.map((file) => ['label', file, 'original', 'replacement']))} })`;
const RUNNER_IMPORT = "import { runMutants } from '../mutation-proof/run-mutants.mjs';";

try {
  const plain = planCampaign({ root: sandbox, campaign: campaignFile('thing/mutants.mjs', `${RUNNER_IMPORT}\nprocess.exit(${calling(path.join(sandbox, 'thing'), ['x/two.mjs', 'x/one.mjs', 'x/one.mjs'])});`) });

  expect('the planner reports the mutated files, once each, relative to the repository root', same(plain.targets, ['thing/x/one.mjs', 'thing/x/two.mjs']) && plain.problems.length === 0);

  const twice = planCampaign({ root: sandbox, campaign: campaignFile('thing/two.mutants.mjs', `${RUNNER_IMPORT}\n${calling(sandbox, ['p/a.mjs'])};\n${calling(sandbox, ['q/b.mjs'])};`) });

  expect('a campaign that calls the runner twice contributes both plans', same(twice.targets, ['p/a.mjs', 'q/b.mjs']) && twice.problems.length === 0);

  campaignFile('kit/vendor/mutation-proof/run-mutants.mjs', 'export function runMutants() { throw new Error("the real runner must never run while planning"); }');
  campaignFile('kit/testing/campaign.mjs', "import { fileURLToPath } from 'node:url';\nimport { runMutants } from '../vendor/mutation-proof/run-mutants.mjs';\nexport function runCampaign(selftest, mutants) { runMutants({ fleetRoot: fileURLToPath(new URL('..', import.meta.url)), paths: ['h'], selftest, mutants }); }");
  campaignFile('kit/h/mutants.mjs', "import { runCampaign } from '../testing/campaign.mjs';\nrunCampaign('h/selftest.mjs', [['label', 'h/decision.mjs', 'o', 'r']]);");

  const throughWrapper = planCampaign({ root: sandbox, campaign: 'kit/h/mutants.mjs' });

  expect('even with a real runner on disk the planner swaps it: the wrapper\'s plan is read', throughWrapper.problems.length === 0 && same(throughWrapper.targets, ['kit/h/decision.mjs']));

  campaignFile('real/run-mutants.mjs', 'export const real = true;');

  expect('importing the planner leaves this process\'s own imports alone: a runner imported here is the real one', (await import(pathToFileURL(path.join(sandbox, 'real', 'run-mutants.mjs')).href)).real === true);

  const never = planCampaign({ root: sandbox, campaign: campaignFile('thing/never.mutants.mjs', 'console.log("nothing to run");') });

  expect('a campaign that never calls the runner is a PROBLEM, not an empty plan', never.targets.length === 0 && never.problems.length === 1 && never.problems[0].includes('never called'));

  const thrown = planCampaign({ root: sandbox, campaign: campaignFile('thing/throws.mutants.mjs', `${RUNNER_IMPORT}\nthrow new Error('the fixture is gone');`) });

  expect('a campaign that throws is a PROBLEM carrying its first error line', thrown.problems.length === 1 && thrown.problems[0].includes('the fixture is gone'));

  const failing = planCampaign({ root: sandbox, campaign: campaignFile('thing/exits.mutants.mjs', `${RUNNER_IMPORT}\n${calling(sandbox, ['p/a.mjs'])};\nprocess.exit(3);`) });

  expect('a campaign that exits non-zero is a PROBLEM even though it printed a plan', failing.problems.length === 1 && failing.problems[0].includes('exit 3'));

  const noisy = planCampaign({
    root: sandbox,
    campaign: campaignFile('thing/noisy.mutants.mjs', `${RUNNER_IMPORT}\nconsole.log('{"fleetRoot":"/","files":["fake/plan.mjs"]}');\nconsole.error('{"fleetRoot":"/","files":["fake/plan.mjs"]}');\n${calling(sandbox, ['real/one.mjs'])};`)
  });

  expect('what a campaign prints cannot pass for its plan', same(noisy.targets, ['real/one.mjs']));

  const hanging = planCampaign({ root: sandbox, campaign: campaignFile('thing/hangs.mutants.mjs', `${RUNNER_IMPORT}\nsetInterval(() => {}, 1000);`), timeoutMs: 1500 });

  expect('a campaign that never ends is a PROBLEM that says it timed out', hanging.problems.length === 1 && hanging.problems[0].includes('timed out'));

  const plainWords = planCampaign({ root: sandbox, campaign: campaignFile('thing/words.mutants.mjs', "console.error('\\nthe selftest folder was moved');\nprocess.exit(4);") });

  expect('a campaign that dies with words that are no error still has its words reported', plainWords.problems.length === 1 && plainWords.problems[0].includes('the selftest folder was moved'));

  const typed = planCampaign({ root: sandbox, campaign: campaignFile('thing/typed.mutants.mjs', "null.property;") });

  expect('the error line of a TypeError or a SyntaxError is found like that of an Error', typed.problems.length === 1 && typed.problems[0].includes('TypeError'));

  const silent = planCampaign({ root: sandbox, campaign: campaignFile('thing/silent.mutants.mjs', 'process.exit(5);') });

  expect('a campaign that dies silent says so', silent.problems.length === 1 && silent.problems[0].includes('no error output'));

  const elsewhere = planCampaign({ root: path.join(sandbox, 'no-such-root'), campaign: 'thing/mutants.mjs' });

  expect('a root that does not exist is a PROBLEM, whichever way the child fails', elsewhere.problems.length === 1 && elsewhere.problems[0].includes('exit 1') && elsewhere.targets.length === 0);

  const missing = planCampaign({ root: sandbox, campaign: 'thing/absent.mutants.mjs' });

  expect('a campaign file that is not there is a PROBLEM', missing.problems.length === 1);

  // --- the population and the command line, over a throwaway git repository.
  const repository = realpathSync(mkdtempSync(path.join(tmpdir(), 'mutation-scope-repository-')));
  const git = (...args) => spawnSync('git', ['-C', repository, ...args], { encoding: 'utf8' });

  git('init', '-q');
  writeFileSync(path.join(repository, '.gitignore'), 'ignored/\n');
  mkdirSync(path.join(repository, 'ignored'));
  writeFileSync(path.join(repository, 'ignored', 'x.mjs'), '');
  writeFileSync(path.join(repository, 'tracked.mjs'), '');
  writeFileSync(path.join(repository, 'gone.mjs'), '');
  git('add', 'tracked.mjs', 'gone.mjs', '.gitignore');
  rmSync(path.join(repository, 'gone.mjs'));
  writeFileSync(path.join(repository, 'untracked.mjs'), '');
  mkdirSync(path.join(repository, 'sub'));
  writeFileSync(path.join(repository, 'sub', 'decide.mjs'), 'export const decide = () => 1;\n');

  expect('the population is what git lists: tracked and untracked-not-ignored, minus ignored and minus deleted', same(listPopulation(repository), ['.gitignore', 'sub/decide.mjs', 'tracked.mjs', 'untracked.mjs']));
  expect('a directory that is not a git repository cannot be listed, and the error is bilingual', (() => {
    try {
      listPopulation(sandbox);

      return false;
    } catch (error) {
      return error instanceof Error && error.message.includes('@es');
    }
  })());

  const cli = (...args) => spawnSync(process.execPath, [SCOPE_CLI, ...args], { encoding: 'utf8', timeout: 60_000 });
  const uncovered = cli('--root', repository);

  expect('the command exits 1 and names the gap when a deciding module has no campaign', uncovered.status === 1 && uncovered.stdout.includes('GAP') && uncovered.stdout.includes('sub/decide.mjs'));

  writeFileSync(path.join(repository, 'sub', 'mutants.mjs'), `${RUNNER_IMPORT.replace('../mutation-proof', '.')}\nprocess.exit(${calling(path.join(repository, 'sub'), ['decide.mjs'])});`);

  const covered = cli('--root', repository);

  expect('the command exits 0 once a campaign mutates it', covered.status === 0 && !covered.stdout.includes('GAP') && covered.stdout.includes('no deciding module without a campaign'));
  mkdirSync(path.join(repository, 'mutation-proof'));
  writeFileSync(path.join(repository, 'sub', 'landing.mjs'), 'export const land = () => 1;\n');
  writeFileSync(path.join(repository, 'mutation-proof', 'declared-deciding.mjs'), "export const DECLARED_DECIDING = [{ file: 'sub/landing.mjs', why: 'lands the branch' }];\n");

  const declaredGap = cli('--root', repository);

  expect('the repository\'s own declaration is read, from the repository measured', declaredGap.status === 1 && declaredGap.stdout.includes('sub/landing.mjs') && declaredGap.stdout.includes('declared: lands the branch'));

  writeFileSync(path.join(repository, 'mutation-proof', 'declared-deciding.mjs'), 'export const DECLARED_DECIDING = 7;\n');

  expect('a declaration that is no list measures nothing (exit 2) and says which list', (() => {
    const result = cli('--root', repository);

    return result.status === 2 && result.stderr.includes('DECLARED_DECIDING');
  })());

  expect('--root with no directory measures nothing (exit 2)', cli('--root').status === 2);

  mkdirSync(path.join(repository, 'mutation-proof'), { recursive: true });
  writeFileSync(path.join(repository, 'mutation-proof', 'declared-deciding.mjs'), 'export const DECLARED_DECIDING = [];\n');

  for (const sibling of SIBLINGS) copyFileSync(path.join(HERE, sibling), path.join(repository, 'mutation-proof', sibling));

  expect('an option that is not --root measures nothing even when it has a value', cli('--bogus', repository).status === 2);

  const own = spawnSync(process.execPath, [path.join(repository, 'mutation-proof', 'scope.mjs')], { encoding: 'utf8', timeout: 60_000 });

  expect('with no argument the check measures the repository it sits in', own.status === 0 && own.stdout.includes('1 deciding module(s), 1 covered, 0 gap(s)'));
  expect('an unknown argument measures nothing (exit 2) and the usage is bilingual', (() => {
    const result = cli('--bogus');

    return result.status === 2 && result.stderr.includes('Usage') && result.stderr.includes('@es');
  })());
  expect('a root that is not a repository measures nothing (exit 2)', cli('--root', sandbox).status === 2);

  rmSync(repository, { recursive: true, force: true });
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\n${passed}/${total} passed @es ${passed}/${total} correctas`);
process.exit(passed === total ? 0 : 1);
