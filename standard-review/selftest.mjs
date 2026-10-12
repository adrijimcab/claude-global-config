#!/usr/bin/env node
/**
 * Selftest of the standard review: what a unit is (`unit.mjs`), the rubric (`rubric.mjs`), what counts as a
 * review in the model's answer (`findings.mjs`), where verdicts live and how a tree finds its own
 * (`verdict-store.mjs`), the review itself with the model injected (`review.mjs`), the landing requirement
 * (`review-requirement.mjs`) and the command line. No test calls a real model. The git fixtures are built here
 * in the system temp directory, and the standard is a fixture file, never the live one.
 *
 * @es Selftest de la revisión contra el estándar: qué es una unidad, la rúbrica, qué cuenta como revisión en la
 * respuesta del modelo, dónde viven los veredictos y cómo un árbol encuentra el suyo, la revisión con el modelo
 * inyectado, el requisito del aterrizaje y la línea de órdenes. Ningún test llama a un modelo real. Los
 * fixtures git se construyen aquí en el directorio temporal, y el estándar es un fichero de fixture, nunca el vivo.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';

isolateState('standard-review');

const SCRATCH = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'standard-review-')));

/**
 * COMPLETION SENTINEL: an import that ran a module's `main()` would end this process half way, green.
 * @es CENTINELA: un import que corriera el `main()` de un módulo terminaría este proceso a mitad, en verde.
 */
let summarised = false;
process.on('exit', () => {
  rmSync(SCRATCH, { recursive: true, force: true });
  if (summarised) return;

  console.error('FAIL the selftest exited before printing its summary @es FALLO el selftest salió antes de imprimir su resumen');
  process.exitCode = 1;
});

process.env.GIT_CONFIG_GLOBAL = path.join(SCRATCH, 'gitconfig');
process.env.GIT_CONFIG_NOSYSTEM = '1';
process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 'fixture';
process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 'fixture@example.invalid';
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '');

const { unitOf, treeOf, MAX_DIFF_BYTES } = await import('./unit.mjs');
const { buildPrompt, standardItemsOf } = await import('./rubric.mjs');
const { readReview } = await import('./findings.mjs');
const { recordVerdict, verdictOf, verdictsPath } = await import('./verdict-store.mjs');
const { REVIEW_MODEL, REVIEW_TIMEOUT_MS, reviewUnit, runCommandLine } = await import('./review.mjs');
const { reviewRequirementOf } = await import('./review-requirement.mjs');

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${label}: got ${JSON.stringify(actual)?.slice(0, 300)}, expected ${JSON.stringify(expected)?.slice(0, 300)}`);
};

const git = (cwd, ...args) => {
  const run = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`fixture git ${args.join(' ')} failed: ${run.stderr}`);
  return run.stdout.trim();
};
const put = (root, name, content) => {
  mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  writeFileSync(path.join(root, name), content);
};
/** The result of `work`, or `{ threw: <message> }`: a throw is an assertion failure, never a crash of the selftest. @es El resultado de `work`, o `{ threw }`. */
const attempt = async (work) => {
  try {
    return await work();
  } catch (error) {
    return { threw: error.message };
  }
};
const throwsText = async (work) => {
  try {
    await work();
    return 'did not throw';
  } catch (error) {
    return error.message;
  }
};

const STANDARD = '# Fixture standard\n\n1. **Tie-break.** Correctness first.\n2. **KISS.** Simple.\n3. **SOLID.** One responsibility.\n   2. a nested line that is not an item\n2026-10-12 a dated line\n(4) a parenthesised line\n3. a repeated item number\n';
const standardFile = path.join(SCRATCH, 'standard.md');
writeFileSync(standardFile, STANDARD);

// A repository with a base commit and one work commit. @es Un repositorio con un commit base y uno de trabajo.
let counter = 0;
function repository({ files = { 'a.txt': 'new\n', 'src/b.mjs': 'export const b = 1;\n' } } = {}) {
  counter += 1;
  const root = path.join(SCRATCH, `r${counter}`);
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'master');
  put(root, 'a.txt', 'old\n');
  put(root, 'identity.txt', `${counter}\n`); // a different tree per fixture, outside every diff
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  for (const [name, content] of Object.entries(files)) put(root, name, content);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'work');
  return { root, base };
}

// --- THE UNIT. @es LA UNIDAD.
const fixture = repository();
const EMPTY_UNIT = { tree: '', base: '', files: [], diff: '', bytes: -1 };
const unit = (() => {
  try {
    return unitOf({ worktree: fixture.root, base: fixture.base });
  } catch {
    return EMPTY_UNIT;
  }
})();
check('unit: the tree is the HEAD tree hash', unit.tree, git(fixture.root, 'rev-parse', 'HEAD^{tree}'));
check('unit: treeOf agrees', treeOf(fixture.root), unit.tree);
check('unit: the files are the changed ones', unit.files.sort(), ['a.txt', 'src/b.mjs']);
check('unit: the diff holds the change', unit.diff.includes('+export const b = 1;') && unit.diff.includes('-old'), true);
check('unit: the bytes are the diff size', unit.bytes, Buffer.byteLength(unit.diff));
check('unit: the base is the resolved commit', unit.base, fixture.base);
check('unit: a ref as base is resolved', (await attempt(() => unitOf({ worktree: fixture.root, base: 'HEAD~1' }))).base, fixture.base);

check('unit: a base that starts with a dash is refused', (await throwsText(() => unitOf({ worktree: fixture.root, base: '--output=x' }))).includes('is not a ref'), true);
check('unit: an unknown base is refused', (await throwsText(() => unitOf({ worktree: fixture.root, base: 'no-such-ref' }))).includes('no-such-ref'), true);
check('unit: an empty range is refused', (await throwsText(() => unitOf({ worktree: fixture.root, base: 'HEAD' }))).includes('changes nothing'), true);

const dirty = repository();
put(dirty.root, 'a.txt', 'edited\n');
check('unit: a modified file is refused', (await throwsText(() => unitOf({ worktree: dirty.root, base: dirty.base }))).includes('uncommitted'), true);
const untracked = repository();
put(untracked.root, 'new.txt', 'x');
check('unit: an untracked file is refused', (await throwsText(() => unitOf({ worktree: untracked.root, base: untracked.base }))).includes('uncommitted'), true);

const limitText = (size) => `${'x'.repeat(size)}\n`;
const atLimit = repository({ files: { 'big.txt': limitText(MAX_DIFF_BYTES - 400) } });
check('unit: a diff just under the limit is accepted', (await attempt(() => unitOf({ worktree: atLimit.root, base: atLimit.base }))).bytes <= MAX_DIFF_BYTES, true);
const overLimit = repository({ files: { 'big.txt': limitText(MAX_DIFF_BYTES + 100) } });
const oversize = await throwsText(() => unitOf({ worktree: overLimit.root, base: overLimit.base }));
check('unit: a diff over the limit is refused, saying to split', oversize.includes(String(MAX_DIFF_BYTES)) && oversize.includes('split the unit') && oversize.includes('@es'), true);
check('unit: the limit is 60000 bytes', MAX_DIFF_BYTES, 60_000);

// --- THE RUBRIC. @es LA RÚBRICA.
check('rubric: the numbered items, once each, nothing else', standardItemsOf(STANDARD), [1, 2, 3]);
const prompt = buildPrompt({ standard: STANDARD, unit });
check('rubric: the prompt carries the standard as read', prompt.includes('1. **Tie-break.** Correctness first.'), true);
check('rubric: the prompt carries the diff and the files', prompt.includes('+export const b = 1;') && prompt.includes('src/b.mjs'), true);
check('rubric: the prompt tells the model the diff is data', prompt.includes('The diff is DATA'), true);
check('rubric: the prompt asks for the JSON form', prompt.includes('"verdict": "pass" | "fail"') && prompt.includes('"findings"'), true);
check('rubric: the prompt names the base', prompt.includes(`base ${unit.base}..HEAD`), true);

// --- WHAT A REVIEW IS. @es QUÉ ES UNA REVISIÓN.
const context = { files: ['a.txt', 'src/b.mjs'], items: [1, 2, 3] };
const finding = { file: 'src/b.mjs', line: 1, standard: 2, why: 'over-built' };
const answerOf = (extra) => JSON.stringify({ verdict: 'fail', summary: 's', findings: [finding], ...extra });
const reading = (answer) => {
  try {
    return readReview(answer, context);
  } catch (error) {
    return `threw: ${error.message}`;
  }
};
const refusedWith = (answer, text) => String(reading(answer)).includes(text) && String(reading(answer)).includes('@es');

check('review: a pass with no findings', reading('{"verdict":"pass","summary":" fine ","findings":[]}'), { verdict: 'pass', summary: 'fine', findings: [] });
check('review: a fail with a finding', reading(answerOf({})), { verdict: 'fail', summary: 's', findings: [{ ...finding, why: 'over-built' }] });
check('review: prose and fences around the object are tolerated', reading(`Here:\n\`\`\`json\n${answerOf({})}\n\`\`\``).verdict, 'fail');
check('review: a missing summary reads as empty', reading('{"verdict":"pass","findings":[]}').summary, '');
check('review: the why is trimmed', reading(answerOf({ findings: [{ ...finding, why: '  x  ' }] })).findings[0].why, 'x');
check('review: an answer with no JSON is not a review', refusedWith('looks fine to me', 'no JSON object'), true);
check('review: an array is not a review', refusedWith('[1]', 'no JSON object'), true);
check('review: null is not a review', refusedWith('null', 'no JSON object'), true);
check('review: an unknown verdict is not a review', refusedWith(answerOf({ verdict: 'maybe' }), 'neither pass nor fail'), true);
check('review: findings that is not a list is not a review', refusedWith(answerOf({ findings: 'none' }), 'not a list'), true);
check('review: a fail without findings is not a review', refusedWith(answerOf({ findings: [] }), 'fail without findings'), true);
check('review: a pass that lists findings is not a review', refusedWith(answerOf({ verdict: 'pass' }), 'pass that lists findings'), true);
check('review: a finding that is not an object is not a review', refusedWith(answerOf({ findings: ['x'] }), 'not an object'), true);
check('review: a null finding is not a review', refusedWith(answerOf({ findings: [null] }), 'not an object'), true);
check('review: a finding on a file the unit did not change is refused', refusedWith(answerOf({ findings: [{ ...finding, file: 'other.mjs' }] }), 'did not change'), true);
check('review: line 0 is refused', refusedWith(answerOf({ findings: [{ ...finding, line: 0 }] }), 'line of 1 or more'), true);
check('review: a fractional line is refused', refusedWith(answerOf({ findings: [{ ...finding, line: 1.5 }] }), 'line of 1 or more'), true);
check('review: a string line is refused', refusedWith(answerOf({ findings: [{ ...finding, line: '3' }] }), 'line of 1 or more'), true);
check('review: an item the standard lacks is refused', refusedWith(answerOf({ findings: [{ ...finding, standard: 9 }] }), 'does not exist'), true);
check('review: a string item is refused', refusedWith(answerOf({ findings: [{ ...finding, standard: '2' }] }), 'does not exist'), true);
check('review: a finding without why is refused', refusedWith(answerOf({ findings: [{ ...finding, why: '  ' }] }), 'no why'), true);
check('review: a non-string why is refused', refusedWith(answerOf({ findings: [{ ...finding, why: 3 }] }), 'no why'), true);

// --- THE STORE. @es EL ALMACÉN.
const lookup = (tree) => {
  try {
    return verdictOf(tree);
  } catch (error) {
    return `threw: ${error.message}`;
  }
};

check('store: a tree never reviewed has no verdict', lookup('t-none'), undefined);
const base = { base: 'b', summary: 's', findings: [], model: 'm', costUsd: 0.01, durationMs: 5 };
recordVerdict({ ...base, tree: 't1', verdict: 'pass' });
check('store: the recorded verdict is found by its tree', [verdictOf('t1')?.verdict, verdictOf('t1')?.tree], ['pass', 't1']);
check('store: another tree finds nothing', verdictOf('t2'), undefined);
check('store: the record is timestamped', typeof verdictOf('t1')?.ts, 'string');
recordVerdict({ ...base, tree: 't1', verdict: 'fail', findings: [finding] });
check('store: the latest line of a tree wins', verdictOf('t1')?.verdict, 'fail');
recordVerdict({ ...base, tree: 't1', verdict: 'pass' });
check('store: a later pass takes the fail back', verdictOf('t1')?.verdict, 'pass');
writeFileSync(verdictsPath(), `${JSON.stringify({ tree: 't3', verdict: 'pass', findings: [] })}\nnot json\n${JSON.stringify({ tree: 't3', verdict: 'maybe', findings: [] })}\n${JSON.stringify({ tree: 't3', verdict: 'pass' })}\n${JSON.stringify({ tree: 3, verdict: 'pass', findings: [] })}\n`, { flag: 'a' });
check('store: lines that are not records grant nothing, an earlier good one stays', verdictOf('t3')?.verdict, 'pass');
check('store: a record with a non-string tree is ignored', [lookup(3), lookup('3')], [undefined, undefined]);
writeFileSync(verdictsPath(), `${JSON.stringify({ tree: 't4', verdict: 'pass' })}
`, { flag: 'a' });
check('store: a record without a findings list is ignored', lookup('t4'), undefined);

// --- THE REVIEW WITH THE MODEL INJECTED. @es LA REVISIÓN CON EL MODELO INYECTADO.
const asked = [];
const askWith = (answer, extra = {}) => async (promptText, options) => {
  asked.push({ promptText, options });
  return { answer, costUsd: 0.02, durationMs: 1234, ...extra };
};
const passAnswer = '{"verdict":"pass","summary":"clean","findings":[]}';

const reviewed = repository();
const first = await attempt(() => reviewUnit({ worktree: reviewed.root, base: reviewed.base, ask: askWith(passAnswer), standardFile }));
check('reviewUnit: a pass is returned and recorded by the tree', [first.verdict, first.reused, verdictOf(treeOf(reviewed.root))?.verdict], ['pass', false, 'pass']);
check('reviewUnit: the cost and the time are kept', [first.costUsd, first.durationMs, first.model], [0.02, 1234, REVIEW_MODEL]);
check('reviewUnit: the model gets the rubric with the standard and the diff', asked[0]?.promptText.includes('Fixture standard') === true && asked[0].promptText.includes('+export const b = 1;'), true);
check('reviewUnit: the model call is bounded and named', asked[0]?.options, { timeoutMs: REVIEW_TIMEOUT_MS, model: REVIEW_MODEL });
const second = await attempt(() => reviewUnit({ worktree: reviewed.root, base: reviewed.base, ask: askWith('never read'), standardFile }));
check('reviewUnit: a tree that holds a pass is not reviewed again', [second.reused, asked.length], [true, 1]);

const failing = repository();
const failed = await attempt(() => reviewUnit({ worktree: failing.root, base: failing.base, ask: askWith(answerOf({}), { costUsd: 0.5 }), standardFile }));
check('reviewUnit: a fail is returned with its findings and recorded', [failed.verdict, failed.findings?.length, verdictOf(treeOf(failing.root))?.verdict], ['fail', 1, 'fail']);
await attempt(() => reviewUnit({ worktree: failing.root, base: failing.base, ask: askWith(passAnswer), standardFile }));
check('reviewUnit: a fail is reviewed again, never reused', verdictOf(treeOf(failing.root))?.verdict, 'pass');

const garbled = repository();
check('reviewUnit: an answer that is not a review throws', (await throwsText(() => reviewUnit({ worktree: garbled.root, base: garbled.base, ask: askWith('hmm'), standardFile }))).includes('not a review'), true);
check('reviewUnit: and records nothing', verdictOf(treeOf(garbled.root)), undefined);
const broken = repository();
const modelDown = async () => {
  throw new Error('The model run failed');
};
check('reviewUnit: a model failure propagates', await throwsText(() => reviewUnit({ worktree: broken.root, base: broken.base, ask: modelDown, standardFile })), 'The model run failed');
check('reviewUnit: and records nothing either', verdictOf(treeOf(broken.root)), undefined);
const calls = asked.length;
const oversized = repository({ files: { 'big.txt': limitText(MAX_DIFF_BYTES + 100) } });
await throwsText(() => reviewUnit({ worktree: oversized.root, base: oversized.base, ask: askWith(passAnswer), standardFile }));
check('reviewUnit: an oversized unit never reaches the model', asked.length, calls);
check('reviewUnit: a missing standard throws', (await throwsText(() => reviewUnit({ worktree: garbled.root, base: garbled.base, ask: askWith(passAnswer), standardFile: path.join(SCRATCH, 'absent.md') }))).length > 0, true);

// --- THE LANDING REQUIREMENT. @es EL REQUISITO DEL ATERRIZAJE.
const unreviewed = repository();
const requirement = (worktree) => {
  try {
    return reviewRequirementOf({ worktree });
  } catch (error) {
    return { ok: 'threw', reason: error.message, lines: [error.message] };
  }
};
const missing = requirement(unreviewed.root);
check('requirement: an unreviewed tree is refused as review-missing', [missing.ok, missing.reason], [false, 'review-missing']);
const [missingEnglish = '', missingSpanish = ''] = (missing.lines?.[0] ?? '').split('@es');
check('requirement: the refusal names the command in both languages', [missingEnglish.includes('review.mjs'), missingSpanish.includes('review.mjs'), missingEnglish.includes(unreviewed.root)], [true, true, true]);
check('requirement: the refusal names the tree', missing.lines?.[0]?.includes(treeOf(unreviewed.root)), true);
const reviewedRequirement = requirement(reviewed.root);
check('requirement: a reviewed tree is accepted', reviewedRequirement, { ok: true, tree: treeOf(reviewed.root) });
recordVerdict({ ...base, tree: treeOf(unreviewed.root), verdict: 'fail', summary: 'too clever', findings: [finding] });
const failedRequirement = requirement(unreviewed.root);
check('requirement: a failed tree is refused as review-failed', [failedRequirement.ok, failedRequirement.reason], [false, 'review-failed']);
check('requirement: the failure lists the finding with file:line and item', failedRequirement.lines?.some((line) => line.includes('src/b.mjs:1') && line.includes('item 2') && line.includes('over-built')), true);
check('requirement: the failure says what to do, bilingual', failedRequirement.lines?.[0]?.includes('too clever') === true && failedRequirement.lines[0].includes('@es'), true);
put(reviewed.root, 'src/c.mjs', 'export const c = 1;\n');
git(reviewed.root, 'add', '-A');
git(reviewed.root, 'commit', '-q', '-m', 'more');
check('requirement: a pass does not survive a change of the tree', requirement(reviewed.root).reason, 'review-missing');

// --- THE COMMAND LINE. @es LA LÍNEA DE ÓRDENES.
const cliRun = (argv, ask) => runCommandLine(argv, { ask, standardFile });
const cliFixture = repository();
const args = ['--worktree', cliFixture.root, '--base', cliFixture.base];
const cliFail = await cliRun(args, askWith(answerOf({})));
check('cli: a fail exits 1 and prints the finding', [cliFail.exitCode, cliFail.stdout.startsWith('FAIL tree '), cliFail.stdout.includes('src/b.mjs:1 [standard item 2] over-built')], [1, true, true]);
const cliPass = await cliRun(args, askWith(passAnswer));
check('cli: a pass exits 0 and prints the cost and time', [cliPass.exitCode, cliPass.stdout.startsWith('PASS tree '), cliPass.stdout.includes('$0.0200, 1.2 s')], [0, true, true]);
const cliAgain = await cliRun(args, askWith('never read'));
check('cli: a recorded pass says so', [cliAgain.exitCode, cliAgain.stdout.includes('already recorded')], [0, true]);
const cliGarbled = await cliRun(['--worktree', garbled.root, '--base', garbled.base], askWith('hmm'));
check('cli: an answer that is not a review exits 2', [cliGarbled.exitCode, cliGarbled.stderr.startsWith('NOT REVIEWED'), cliGarbled.stderr.includes('@es')], [2, true, true]);
for (const bad of [[], ['--worktree', cliFixture.root], ['--base', 'x', '--worktree', cliFixture.root], [...args, 'extra'], ['--worktree', '', '--base', 'x']]) {
  const usage = await cliRun(bad, askWith(passAnswer));
  check(`cli: arguments ${JSON.stringify(bad)} exit 2 with the usage`, [usage.exitCode, usage.stderr.startsWith('Usage:')], [2, true]);
}
const real = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'review.mjs')], { encoding: 'utf8' });
check('cli: the real command with no arguments exits 2 with the usage', [real.status, real.stderr.startsWith('Usage:')], [2, true]);
const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'review.mjs')).href)})`], { encoding: 'utf8' });
check('cli: importing the module runs nothing', [imported.status, imported.stdout, imported.stderr], [0, '', '']);

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
summarised = true;
process.exitCode = failures.length === 0 ? 0 : 1;
