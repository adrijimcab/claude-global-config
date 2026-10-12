#!/usr/bin/env node
/**
 * Proof that the clean-code checker DISCRIMINATES. State space: every verdict (enforced, configured-only,
 * absent, unmeasured) of every kind of gate, built from COMMITTED fixture projects under `fixtures/` and from
 * ESLint / compiler answers injected as plain functions (no tool is installed, no live machine state is read);
 * the landing path (a unit suite, a whole-gate script, `pre`/`post` scripts, a script aggregator, a workspace run,
 * a hook, a blocking and an allowed-failure CI job, a launcher prefix); the rule thresholds (at, just over and
 * under the limit, a warning, off, no options so the default applies); dependency-cruiser read by evaluating its
 * regexes; jscpd and `npm audit` settings from a file and from the command line; and the command: usage, a bad
 * root, `--strict`, and that every printed evidence line is bilingual.
 *
 * @es Prueba de que el checker de código limpio DISCRIMINA. Espacio de estados: cada veredicto (aplicado,
 * solo-configurado, ausente, sin medir) de cada tipo de gate, armado con proyectos fixture VERSIONADOS en
 * `fixtures/` y con respuestas de ESLint y del compilador inyectadas como funciones simples (no se instala
 * ninguna herramienta, no se lee estado vivo de la máquina); el camino de aterrizaje (suite de unidad, script de
 * gate completo, scripts `pre`/`post`, un agregador, una ejecución de workspace, un hook, un job de CI bloqueante
 * y uno que puede fallar, un prefijo de lanzador); los umbrales de reglas (en el límite, justo por encima y por
 * debajo, un aviso, apagada, sin opciones y se aplica el default); dependency-cruiser leído evaluando sus regex;
 * ajustes de jscpd y `npm audit` desde fichero y desde línea de comandos; y el comando: uso, raíz inválida,
 * `--strict`, y que cada línea de evidencia impresa es bilingüe.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeSpeaker } from '../../bilingual-output/speaker.mjs';

import { ciJobs } from './ci-jobs.mjs';
import { main, parseArguments, rootsSummary } from './check.mjs';
import { collectFacts } from './collect-facts.mjs';
import { limitOf, severityOf } from './eslint-verdicts.mjs';
import { scriptSample, templateSample } from './eslint-facts.mjs';
import { forbids, forbidsCycles } from './layering-probe.mjs';
import { MESSAGES } from './messages.mjs';
import { GATES, SECURITY_RULES, gatesOf } from './profile.mjs';
import { aggregatedNames, commandsOf, scriptNamed, splitCommands } from './shell-commands.mjs';
import { gradeProject } from './verdicts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', name);

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** The strong ESLint answer: every rule of the profile at its limit. @es La respuesta fuerte de ESLint. */
const STRONG_SCRIPT = {
  complexity: [2, { max: 13 }],
  'max-depth': [2, { max: 4 }],
  'max-params': [2, 5],
  'max-lines-per-function': [2, { max: 100, skipBlankLines: true }],
  'max-lines': [2, { max: 400 }],
  'max-statements': [2, { max: 30 }],
  'sonarjs/cognitive-complexity': [2],
  ...Object.fromEntries(SECURITY_RULES.map((rule) => [rule, [2]])),
};
const STRONG_TEMPLATE = { '@angular-eslint/template/cyclomatic-complexity': [2, { maxComplexity: 10 }] };

/** A print-config that answers `scriptRules` for source files and `templateRules` for templates. @es Un print-config que responde reglas para fuentes y plantillas. */
const answering = (scriptRules, templateRules = STRONG_TEMPLATE) => (root, file) => ({ rules: file.endsWith('.html') ? templateRules : scriptRules });
const strictTsc = () => ({ file: 'tsconfig.json', strict: true });

/** The graded verdicts of a fixture, by gate id. @es Los veredictos calificados de un fixture, por id de gate. */
async function gradeFixture(name, printConfig, showConfig = strictTsc) {
  const facts = await collectFacts(fixture(name), { printConfig, showConfig });

  return { facts, byId: Object.fromEntries(gradeProject(facts).map((verdict) => [verdict.id, verdict])) };
}

const stateOf = (graded, id) => graded.byId[id].verdict;
const evidenceIds = (graded, id) => graded.byId[id].evidence.map((entry) => entry.id);

// --- shell commands: structure of a script line ---------------------------------------------------------------
check('a chain splits at && || ; and |', splitCommands('a && b || c; d | e').join('|') === 'a|b|c|d|e');
check('a separator inside quotes does not split', splitCommands('node -e "a && b" && c').length === 2);
check('a launcher prefix is stripped', commandsOf('npx --no-install knip')[0].join(' ') === 'knip' && commandsOf('cross-env NO_CLEAR=1 NODE_ENV=x eslint .')[0][0] === 'eslint' && commandsOf('CI=1 npm exec -- depcruise src')[0][0] === 'depcruise');
check('quotes are removed from words', commandsOf('npm audit "--audit-level=high"')[0][2] === '--audit-level=high');
check('npm run, run-script, test and start name a script', scriptNamed(['npm', 'run', 'x']) === 'x' && scriptNamed(['pnpm', 'run-script', 'y']) === 'y' && scriptNamed(['npm', 'test']) === 'test' && scriptNamed(['yarn', 'test']) === undefined && scriptNamed(['node', 'run', 'x']) === undefined);
check('an aggregator names its scripts, not its flags', aggregatedNames(['jiti', 'scripts/run-checks/run-checks.ts', 'lint', '--fast', 'knip']).join() === 'lint,knip' && aggregatedNames(['npm-run-all', 'a', 'b']).join() === 'a,b' && aggregatedNames(['node', 'x.js', 'a']).length === 0);

// --- CI jobs ----------------------------------------------------------------------------------------------------
const jobs = ciJobs(readFileSync(path.join(fixture('configured-angular'), '.gitlab-ci.yml'), 'utf8'));
check('hidden templates and global keywords are not jobs', jobs.map((job) => job.name).join() === 'lint,audit');
check('allow_failure at the job level is read', jobs[1].allowFailure === true && jobs[0].allowFailure === false);
check('a job lists its script lines with their line numbers', jobs[0].commands.length === 1 && jobs[0].commands[0].text === 'npm run build:ci-pr' && jobs[0].commands[0].line === 10);
const nested = ciJobs('job:\n  rules:\n    - if: x\n      allow_failure: true\n  script:\n    - |\n      # comment\n      npm audit\n    - *alias\n');
check('allow_failure nested in rules is not the job setting', nested[0].allowFailure === false);
check('a block scalar keeps its command lines and drops comments and aliases', nested[0].commands.map((command) => command.text).join() === 'npm audit');
const sibling = ciJobs('job:\n  script:\n    - one\n  artifacts:\n    paths:\n      - dist\n');
check('a sibling key ends the script section', sibling[0].commands.map((command) => command.text).join() === 'one');
check('allow_failure false is not a failure allowance', ciJobs('job:\n  allow_failure: false\n  script:\n    - x\n')[0].allowFailure === false);

// --- dependency-cruiser read by its regexes --------------------------------------------------------------------
const probe = { from: 'src/app/core/a.ts', to: 'src/app/pages/b.ts' };
const rule = (over) => ({ forbidden: [{ severity: 'error', from: { path: '/core/' }, to: { path: '/pages/' }, ...over }] });
check('a matching error rule forbids the probe', forbids(rule({}), probe));
check('a warning does not forbid', !forbids(rule({ severity: 'warn' }), probe));
check('a non-matching from does not forbid', !forbids(rule({ from: { path: '/domain/' } }), probe));
check('a non-matching to does not forbid', !forbids(rule({ to: { path: '/adapters/' } }), probe));
check('pathNot on the from side exempts the probe', !forbids(rule({ from: { path: '/core/', pathNot: '/core/a' } }), probe));
check('a list of path patterns matches any', forbids(rule({ to: { path: ['/adapters/', '/pages/'] } }), probe));
check('a side with no path matches everything', forbids(rule({ from: {} }), probe) && forbids(rule({ from: undefined }), probe));
check('no rules forbid nothing', !forbids({}, probe) && !forbids({ forbidden: [] }, probe));
check('a cycle rule needs error, circular and an unrestricted from', forbidsCycles({ forbidden: [{ severity: 'error', from: {}, to: { circular: true } }] }) && !forbidsCycles({ forbidden: [{ severity: 'warn', from: {}, to: { circular: true } }] }) && !forbidsCycles({ forbidden: [{ severity: 'error', from: { path: 'x' }, to: { circular: true } }] }) && !forbidsCycles({ forbidden: [{ severity: 'error', from: {}, to: { circular: false } }] }));

// --- ESLint rule readings -------------------------------------------------------------------------------------
check('severity words and numbers read alike', severityOf('error') === 2 && severityOf(2) === 2 && severityOf(['warn']) === 1 && severityOf([0]) === 0 && severityOf(undefined) === 0 && severityOf('off') === 0);
check('a limit is a number, an object max, maxComplexity or maximum, else the default', limitOf([2, 9], 1) === 9 && limitOf([2, { max: 8 }], 1) === 8 && limitOf([2, { maxComplexity: 7 }], 1) === 7 && limitOf([2, { maximum: 6 }], 1) === 6 && limitOf([2], 5) === 5 && limitOf([2, { skipBlankLines: true }], 4) === 4 && limitOf('error', 3) === 3);
check('the sample is a component or service under the root src first, never a spec', scriptSample(['projects/lib/src/a.ts', 'src/z.spec.ts', 'src/b.ts', 'src/c.service.ts'], 'angular') === 'src/c.service.ts' && scriptSample(['projects/lib/src/a.ts', 'src/b.ts'], 'angular') === 'src/b.ts' && scriptSample(['projects/lib/src/a.ts', 'x/b.ts'], 'angular') === 'projects/lib/src/a.ts' && scriptSample(['q.stories.ts', 'q.d.ts'], 'angular') === undefined);
check('a node sample is a plain module, never a selftest or a config', scriptSample(['a.selftest.mjs', 'a.mutants.mjs', 'x.config.js', 'tool.mjs'], 'node') === 'tool.mjs');
check('a template sample prefers the root src', templateSample(['projects/l/src/a.component.html', 'src/b.component.html']) === 'src/b.component.html' && templateSample(['a.html']) === undefined);

// --- the landing path and the four states, from the committed fixtures ------------------------------------------
const enforced = await gradeFixture('enforced-angular', answering(STRONG_SCRIPT));
const angularGates = gatesOf('angular');

check('every Angular gate is graded once', Object.keys(enforced.byId).length === angularGates.length && angularGates.every((gate) => enforced.byId[gate.id] !== undefined));
for (const gate of angularGates) check(`${gate.id} is enforced on the fully wired fixture`, stateOf(enforced, gate.id) === 'enforced');
check('the unit suite named in fleet-kit.json is a landing root', enforced.facts.landing.roots.some((root) => root.kind === 'unit-suite' && root.name === 'build:ci-pr'));
check('the landing guard reaches a gate through the unit suite', enforced.byId.complexity.landingGuard === true);
check('a prebuild-style pre script of a followed script is followed', stateOf(enforced, 'strict-typescript') === 'enforced' && evidenceIds(enforced, 'strict-typescript').includes('reached'));
check('a stack with no eslint config is not asked for an ESLint answer', (await collectFacts(fixture('absent-node'), { printConfig: () => { throw new Error('must not run'); } })).eslint.samples.script === undefined);

const configured = await gradeFixture('configured-angular', answering(STRONG_SCRIPT));

check('lint through the whole-gate script and a blocking CI job is enforced', stateOf(configured, 'lint-on-landing') === 'enforced' && configured.byId['lint-on-landing'].landingGuard === false);
check('a rule is enforced when ESLint answers it and lint is on the landing path', stateOf(configured, 'complexity') === 'enforced');
for (const id of ['circular-dependencies', 'hexagonal-layering', 'duplication', 'dead-code']) check(`${id} reached only from a hook is configured-only`, stateOf(configured, id) === 'configured-only' && evidenceIds(configured, id).includes('reached-not-enforcing'));
check('npm audit reached only from an allowed-failure CI job and a hook is configured-only', stateOf(configured, 'dependency-audit') === 'configured-only');
check('strict TypeScript with no type-checking command on the path is configured-only', stateOf(configured, 'strict-typescript') === 'configured-only');
check('madge is named as an equivalent, never credited', evidenceIds(configured, 'circular-dependencies').includes('madge-declared') && !evidenceIds(enforced, 'circular-dependencies').includes('madge-declared'));
check('hook and CI roots are listed with their kinds', configured.facts.landing.roots.map((root) => root.kind).sort().join() === 'ci-job,ci-job-allowed-failure,hook,integration-script');

const weak = await gradeFixture('weak-angular', answering({
  complexity: [2, { max: 14 }],
  'max-depth': ['warn', { max: 4 }],
  'max-params': 'off',
  'max-lines-per-function': [2],
  'max-lines': [2, 401],
  'sonarjs/cognitive-complexity': [2, 16],
  ...Object.fromEntries(SECURITY_RULES.slice(0, 9).map((ruleId) => [ruleId, [2]])),
}, {}));

check('a limit one over the profile is configured-only', stateOf(weak, 'complexity') === 'configured-only' && evidenceIds(weak, 'complexity')[0] === 'rule-too-loose');
check('a warning is configured-only, because it does not fail', stateOf(weak, 'max-depth') === 'configured-only' && evidenceIds(weak, 'max-depth')[0] === 'rule-warns');
check('a rule that is off is absent', stateOf(weak, 'max-params') === 'absent' && evidenceIds(weak, 'max-params')[0] === 'rule-off');
check('a rule with no options is graded at the rule default', stateOf(weak, 'max-lines-per-function') === 'enforced' && stateOf(weak, 'max-statements') === 'absent');
check('a numeric limit over the profile is configured-only', stateOf(weak, 'max-lines') === 'configured-only');
check('cognitive complexity above 15 is configured-only', stateOf(weak, 'cognitive-complexity') === 'configured-only');
check('nine of ten security rules is configured-only and names the missing one', stateOf(weak, 'security-lint') === 'configured-only' && weak.byId['security-lint'].evidence[0].params.missing === SECURITY_RULES[9]);
check('a template with no rule answered is absent', stateOf(weak, 'template-complexity') === 'absent');
check('a cycle rule at warn is configured-only', stateOf(weak, 'circular-dependencies') === 'configured-only' && evidenceIds(weak, 'circular-dependencies')[0] === 'no-circular-rule');
check('layering missing probes is configured-only and names them', stateOf(weak, 'hexagonal-layering') === 'configured-only' && weak.byId['hexagonal-layering'].evidence[0].params.missing === 'core-not-from-adapters, domain-framework-free');
check('jscpd tokens from the command line override the file and a loose threshold fails', stateOf(weak, 'duplication') === 'configured-only' && weak.byId.duplication.evidence[0].params.tokens === 120 && weak.byId.duplication.evidence[0].params.from === 'command line');
check('knip with ignore entries is enforced and reports the debt, nested lists included', stateOf(weak, 'dead-code') === 'enforced' && weak.byId['dead-code'].evidence.some((entry) => entry.id === 'knip-ignore-debt' && entry.params.count === 4));
check('npm audit at critical, or with no level, is configured-only', stateOf(weak, 'dependency-audit') === 'configured-only' && weak.byId['dependency-audit'].evidence[0].params.levels === 'critical, unstated');

const looseTemplate = await gradeFixture('enforced-angular', answering(STRONG_SCRIPT, { '@angular-eslint/template/cyclomatic-complexity': [2, { maxComplexity: 12 }] }));
const noSecurity = await gradeFixture('configured-angular', answering({ complexity: [2, { max: 13 }] }));
const workspace = await gradeFixture('workspace-node', answering({}));

check('a template limit of 12 is above the profile 10', stateOf(looseTemplate, 'template-complexity') === 'configured-only' && looseTemplate.byId['template-complexity'].evidence[0].params.actual === 12);
check('security rules all missing is absent', stateOf(noSecurity, 'security-lint') === 'absent');
check('an enforced knip with no ignore entries reports no debt', !evidenceIds(enforced, 'dead-code').includes('knip-ignore-debt'));
check('a workspace-scoped run is recorded but not followed', stateOf(workspace, 'dead-code') === 'configured-only' && evidenceIds(workspace, 'dead-code').includes('not-reached'));
check('a post script of a followed script is followed, and a cycle of scripts terminates', stateOf(workspace, 'duplication') === 'enforced');
check('npm run is not an npm audit', stateOf(workspace, 'dependency-audit') === 'absent');

const unreadable = await gradeFixture('enforced-angular', () => ({ error: 'boom' }), () => ({ file: 'tsconfig.json', error: 'no compiler' }));

check('an ESLint that cannot run leaves its rules unmeasured, with the reason', stateOf(unreadable, 'complexity') === 'unmeasured' && unreadable.byId.complexity.evidence[0].params.reason === 'boom');
check('a compiler that cannot run leaves strict TypeScript unmeasured', stateOf(unreadable, 'strict-typescript') === 'unmeasured');
check('lint-on-landing is graded without running ESLint', stateOf(unreadable, 'lint-on-landing') === 'enforced');
check('a tsconfig that is not strict is absent', stateOf(await gradeFixture('enforced-angular', answering(STRONG_SCRIPT), () => ({ file: 'tsconfig.json', strict: false })), 'strict-typescript') === 'absent');
check('a project with no tsconfig is absent for strict TypeScript', stateOf(await gradeFixture('enforced-angular', answering(STRONG_SCRIPT), () => ({ file: 'tsconfig.json', missing: true })), 'strict-typescript') === 'absent');

const absent = await gradeFixture('absent-node', answering({}));

check('a node project is graded on the node gates only', Object.keys(absent.byId).length === gatesOf('node').length && absent.byId['template-complexity'] === undefined && absent.byId['strict-typescript'] === undefined);
for (const gate of gatesOf('node')) check(`${gate.id} is absent on the empty project`, stateOf(absent, gate.id) === 'absent');
check('an empty project has no landing root', absent.facts.landing.roots.length === 0 && absent.facts.stack === 'node');
check('the stack comes from @angular/core', enforced.facts.stack === 'angular');
check('the stack can be forced', (await collectFacts(fixture('absent-node'), { stack: 'angular', showConfig: strictTsc })).stack === 'angular');

// --- the profile itself ---------------------------------------------------------------------------------------
check('every gate id is unique', new Set(GATES.map((gate) => gate.id)).size === GATES.length);
check('every gate states a threshold and a bilingual why', GATES.every((gate) => gate.threshold !== undefined && gate.why.en.length > 20 && gate.why.es.length > 20 && gate.why.en !== gate.why.es));
check('every threshold names its provenance', GATES.every((gate) => /MEASURED|DEFAULT|DERIVED|kit|Discovery-FE|menu/.test(gate.why.en)));
const readme = readFileSync(path.join(here, 'README.md'), 'utf8');

for (const gate of GATES) check(`README names the gate ${gate.id}`, readme.includes(`\`${gate.id}\``));
for (const gate of GATES.filter((candidate) => candidate.kind === 'eslint-rule')) {
  const row = readme.split('\n').find((line) => line.startsWith(`| \`${gate.id}\``));

  check(`README row of ${gate.id} carries ${gate.rule} and the limit ${gate.max}`, row !== undefined && row.includes(gate.rule) && row.includes(` ${gate.max}`));
}
check('README carries the jscpd settings', readme.includes('`minTokens` 70, `threshold` 0') && readme.includes('--audit-level=high'));

// --- the command ------------------------------------------------------------------------------------------------
const sink = () => {
  const lines = { out: [], err: [] };

  return { lines, sink: { log: (text) => lines.out.push(text), error: (text) => lines.err.push(text) } };
};

check('arguments: a root alone is usable', parseArguments(['x'])?.root === 'x');
check('arguments: --stack and --strict are read', (() => { const options = parseArguments(['x', '--stack', 'node', '--strict']); return options.stack === 'node' && options.strict; })());
check('arguments: no root, a second root, an unknown flag or an unknown stack are refused', parseArguments([]) === undefined && parseArguments(['a', 'b']) === undefined && parseArguments(['a', '--nope']) === undefined && parseArguments(['a', '--stack', 'ruby']) === undefined && parseArguments(['a', '--stack']) === undefined);
check('roots are summarised by kind, a crowd as a count', rootsSummary([{ kind: 'hook', name: 'a' }, { kind: 'ci-job', name: '1' }, { kind: 'ci-job', name: '2' }, { kind: 'ci-job', name: '3' }, { kind: 'ci-job', name: '4' }]) === 'hook:a, ci-job x4');

const usage = sink();

check('no arguments prints the usage and exits 2', (await main([], makeSpeaker(MESSAGES, usage.sink))) === 2 && usage.lines.err.length === 1 && usage.lines.err[0].includes('@es'));

const missing = sink();

check('a root that is not a directory exits 2', (await main([path.join(here, 'no-such-folder')], makeSpeaker(MESSAGES, missing.sink))) === 2 && missing.lines.err[0].includes('@es'));

const report = sink();

check('a report exits 0 and every message line is bilingual', (await main([fixture('absent-node')], makeSpeaker(MESSAGES, report.sink))) === 0 && report.lines.out.filter((line) => line.startsWith('    - ')).every((line) => line.includes(' @es ')) && report.lines.out.at(-1).includes('0 enforced') && report.lines.out.at(-1).includes('14 absent'));
check('the report prints the state before the gate id', report.lines.out.some((line) => line.startsWith('ABSENT          lint-on-landing')));

const strict = sink();

check('--strict exits 1 when a gate is not enforced', (await main([fixture('absent-node'), '--strict'], makeSpeaker(MESSAGES, strict.sink))) === 1 && strict.lines.err[0].includes('14') && strict.lines.err[0].includes('@es'));

const forced = sink();

check('--stack grades the forced stack', (await main([fixture('absent-node'), '--stack', 'angular'], makeSpeaker(MESSAGES, forced.sink))) === 0 && forced.lines.out.at(-1).includes('16 gates'));

if (failures.length > 0) {
  console.error(`gates-kit clean-code checker selftest FAILED @es el selftest del checker de código limpio de gates-kit FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`gates-kit clean-code checker selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);
