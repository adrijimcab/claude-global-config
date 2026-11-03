#!/usr/bin/env node
/**
 * Proves the mutation runner itself DISCRIMINATES. Every fixture is CONSTRUCTED here, in a temporary
 * directory: a tiny mechanism, a tiny selftest for it, and a campaign that runs the runner sitting NEXT TO
 * this file — so when `mutants.mjs` mutates a sandbox copy of the runner, this selftest measures that copy.
 * Nothing is read from a live guard, whose legitimate edits would otherwise redden this proof.
 *
 * The state space is the runner's verdicts: KILLED, SURVIVED, BROKEN, REFUSED (absent, ambiguous, no parse
 * check, outside the copied paths, a mutated file that is missing or beside the fleet; any one stops the run
 * before the baseline, naming them all) and NOT MEASURED (red
 * baseline, a sandbox missing a file the selftest reads without importing, an import that resolves to no
 * file, unparseable original, empty campaign). What is COPIED is exercised too: a module imported from a
 * folder no `paths` names, a file only the campaign names, a file read beside the selftest (so folders are
 * copied, not single files), and an explicit `paths` entry added to the derived set. Each is
 * exercised, and so are the two cases that must NOT be caught by a refusal: a runtime crash is a kill (printed
 * apart as CRASHED: `kill-kind.selftest.mjs` owns how a crash is told from an assertion), and a replacement
 * carrying `$&` is written literally. The fixture selftest logs every run it makes, so "refused
 * before anything runs" and "BROKEN is never run" are counted, not assumed.
 *
 * @es Prueba que el runner DISCRIMINA con fixtures CONSTRUIDOS en un directorio temporal; cada veredicto del
 * runner se ejercita y cada ejecución del selftest del fixture se cuenta.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { EXIT_NOT_MEASURED, FAILURE_LINE, concurrencyOf, failFastOf, occurrencesOf } from './run-mutants.mjs';

const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run-mutants.mjs');

const MECHANISM = `export function isAdult(age) {
  if (age >= 18) return true;
  else return false;
}

export function describe(age) {
  return age > 99 ? 'old' : 'young';
}

export function greeting(name) {
  return 'hello ' + name;
}

export const motto = 'untested';
export const first = 'twin';
export const second = 'twin';
`;

/** A top-level FILE the fixture selftest imports: the closure copies a root-level file, never the root. */
const EXPECTED = "export const EXPECTED_GREETING = 'hello x';\n";

/** A module in ANOTHER folder the fixture selftest imports: no `paths` names `lib/`, the closure copies it. */
const HELPER = 'export function isEven(n) {\n  return n % 2 === 0;\n}\n';

/** A file only a campaign names: the selftest never loads it, so a mutant there survives, but runs. */
const UNUSED = "export const unused = 'unused';\n";

/** A live file beside the fleet's copied paths: no mutant may ever write to it. */
const OUTSIDE = "export const outside = 'outside';\n";

const GREEN_ASSERTIONS = `[isAdult(18) === true, isAdult(17) === false, describe(5) === 'young', greeting('x') === EXPECTED_GREETING, isEven(4), sibling === 'sibling\\n']`;
const RED_ASSERTIONS = `[isAdult(18) === false]`;

/**
 * The fixture selftest READS `sibling.txt` from its own folder without importing it, so a closure that copied
 * single files instead of their folders would leave it behind. `prelude` adds lines before the results.
 */
const fixtureSelftest = (assertions, prelude = '') => `import { appendFileSync, readFileSync } from 'node:fs';
import { describe, greeting, isAdult } from './decide.mjs';
import { EXPECTED_GREETING } from '../expected.mjs';
import { isEven } from '../lib/helper.mjs';
${prelude}
appendFileSync(process.env.MUTATION_PROOF_RUN_LOG, 'run\\n');

const sibling = readFileSync(new URL('./sibling.txt', import.meta.url), 'utf8');
const results = ${assertions};
const passed = results.filter(Boolean).length;

console.log(\`\${passed}/\${results.length} passed\`);
process.exit(passed === results.length ? 0 : 1);
`;

const cases = [];
const check = (name, holds) => cases.push({ name, holds });

/** Builds a fixture fleet, runs one campaign over it, and reports what the runner said and did. */
function campaign({ assertions = GREEN_ASSERTIONS, prelude = '', extraFiles = {}, paths, mutants, environment = {}, runnerIn = 'fleet' }) {
  // The fleet sits inside a parent of its own, so a file BESIDE the fleet exists for a mutant to name.
  const parent = mkdtempSync(path.join(os.tmpdir(), 'mutation-proof-fixture-'));
  const fleet = path.join(parent, 'fleet');
  const runLog = path.join(parent, 'runs.log');

  try {
    for (const folder of ['mech', 'other', 'lib', 'tool', 'fixtures']) mkdirSync(path.join(fleet, folder), { recursive: true });
    mkdirSync(path.join(parent, 'neighbour'));
    writeFileSync(path.join(fleet, 'mech', 'decide.mjs'), MECHANISM);
    writeFileSync(path.join(fleet, 'mech', 'selftest.mjs'), fixtureSelftest(assertions, prelude));
    writeFileSync(path.join(fleet, 'mech', 'sibling.txt'), 'sibling\n');
    writeFileSync(path.join(fleet, 'lib', 'helper.mjs'), HELPER);
    writeFileSync(path.join(fleet, 'tool', 'unused.mjs'), UNUSED);
    writeFileSync(path.join(fleet, 'fixtures', 'data.txt'), 'data\n');
    writeFileSync(path.join(fleet, 'other', 'outside.mjs'), OUTSIDE);
    writeFileSync(path.join(parent, 'neighbour', 'outside.mjs'), OUTSIDE);
    writeFileSync(path.join(fleet, 'expected.mjs'), EXPECTED);
    writeFileSync(runLog, '');

    for (const [file, content] of Object.entries(extraFiles)) writeFileSync(path.join(fleet, file), content);

    // The selftest runner a campaign derives its fleet from: in the fleet itself, in a tree above it, or nowhere.
    const runnerTree = { fleet, parent, none: undefined }[runnerIn];

    if (runnerTree !== undefined) {
      mkdirSync(path.join(runnerTree, 'selftest-runner'), { recursive: true });
      writeFileSync(path.join(runnerTree, 'selftest-runner', 'run.mjs'), '// the fixture runner marks this tree as a fleet\n');
    }

    const script = path.join(fleet, 'campaign.mjs');

    writeFileSync(
      script,
      `import { runMutants } from ${JSON.stringify(pathToFileURL(RUNNER).href)};
const survivors = runMutants({ fleetRoot: ${JSON.stringify(fleet)},${paths === undefined ? '' : ` paths: ${JSON.stringify(paths)},`} selftest: 'mech/selftest.mjs', mutants: ${JSON.stringify(mutants)} });
process.exit(survivors === 0 ? 0 : 1);
`
    );

    const run = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, SELFTEST_FLEET: undefined, ...environment, MUTATION_PROOF_RUN_LOG: runLog }, timeout: 120_000 });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;

    return {
      status: run.status,
      output,
      runs: occurrencesOf(readFileSync(runLog, 'utf8'), 'run\n'),
      log: readFileSync(runLog, 'utf8'),
      outsideAfter: readFileSync(path.join(fleet, 'other', 'outside.mjs'), 'utf8'),
      neighbourAfter: readFileSync(path.join(parent, 'neighbour', 'outside.mjs'), 'utf8'),
      verdictOf: (label) => output.split('\n').find((line) => line.includes(label))?.slice(0, 8).trim()
    };
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

// ── the counter every refusal rests on ──────────────────────────────────────────────────────────────
check('occurrencesOf counts a single occurrence once', occurrencesOf('abc', 'b') === 1);
check('occurrencesOf counts overlapping starts, so "aa" in "aaa" is ambiguous', occurrencesOf('aaa', 'aa') === 2);
check('occurrencesOf reports absence as zero', occurrencesOf('abc', 'z') === 0);

// ── every per-mutant verdict ────────────────────────────────────────────────────────────────────────
const LABELS = {
  kill: 'the age threshold is loosened',
  survivor: 'an untested constant changes',
  absent: 'a threshold that is not in the file',
  twice: 'a literal that occurs twice',
  broken: 'one arm of the if/else is deleted, leaving a dangling else',
  crash: 'describe reads a name that does not exist',
  dollar: 'a replacement carrying a dollar pattern',
  typescript: 'a TypeScript file',
  outside: 'a path that climbs out of the sandbox onto a live file',
  imported: 'a decision in a module the selftest imports from another folder',
  unused: 'a file only the campaign names',
  missingFile: 'a mutated file that does not exist',
  neighbour: 'an existing file beside the fleet'
};

// Every verdict a mutant that RUNS can earn, in one campaign, on the SEQUENTIAL path (the reference the parallel
// path is compared with below). @es Cada veredicto de un mutante que CORRE, en el camino SECUENCIAL.
const MIXED_MUTANTS = [
    [LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18'],
    [LABELS.survivor, 'mech/decide.mjs', "'untested'", "'changed'"],
    [LABELS.broken, 'mech/decide.mjs', 'if (age >= 18) return true;', ''],
    [LABELS.crash, 'mech/decide.mjs', "return age > 99 ? 'old' : 'young';", 'return notDeclaredAnywhere;'],
    [LABELS.dollar, 'mech/decide.mjs', "'hello '", "'$&'"],
    [LABELS.imported, 'lib/helper.mjs', 'n % 2 === 0', 'n % 2 === 1'],
    [LABELS.unused, 'tool/unused.mjs', "'unused'", "'used'"]
];
const mixed = campaign({ environment: { MUTATION_CONCURRENCY: '1' }, mutants: MIXED_MUTANTS });

check('a mutant that breaks the tested decision is KILLED', mixed.verdictOf(LABELS.kill) === 'KILLED');
check('a mutant the selftest cannot see SURVIVES', mixed.verdictOf(LABELS.survivor) === 'SURVIVED');
check('a mutant that no longer parses is BROKEN, not KILLED', mixed.verdictOf(LABELS.broken) === 'BROKEN');
check('a runtime crash on a path the selftest drives is a kill, printed apart as CRASHED — the mutated code ran', mixed.verdictOf(LABELS.crash) === 'CRASHED');
check('a replacement carrying $& is written literally, so it is KILLED, not BROKEN', mixed.verdictOf(LABELS.dollar) === 'KILLED');
check('a mutant in a module the selftest imports from a folder no `paths` names is planned and KILLED, not refused', mixed.verdictOf(LABELS.imported) === 'KILLED');
check('a file only the campaign names is copied too, so its mutant runs and SURVIVES instead of being refused', mixed.verdictOf(LABELS.unused) === 'SURVIVED');
check('only the baseline and the six runnable mutants ran: a BROKEN mutant never runs', mixed.runs === 7);
check('the tally counts BROKEN mutants as survivors', mixed.output.includes('4/7 mutants killed (3 by assertion, 1 by crash)'));
check('a campaign with survivors exits 1', mixed.status === 1);

// Every refusal, beside a mutant that would be KILLED: the plan holds them all before the baseline, so the run
// stops there, names each one and runs nothing. @es Cada rechazo, junto a un mutante que moriría: el plan los
// conoce antes de la línea base, así que la corrida se detiene ahí, los nombra y no corre nada.
const refused = campaign({
  extraFiles: { 'mech/notes.ts': 'export const note: string = "note";\n' },
  mutants: [
    [LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18'],
    [LABELS.absent, 'mech/decide.mjs', 'age >= 99', 'age > 99'],
    [LABELS.twice, 'mech/decide.mjs', "'twin'", "'triplet'"],
    [LABELS.typescript, 'mech/notes.ts', '"note"', '"other"'],
    // From any sandbox under <fleet>/scratch/mutation-proof/, three levels up is the fleet itself.
    [LABELS.outside, '../../../other/outside.mjs', "'outside'", "'inside'"],
    [LABELS.missingFile, 'mech/absent.mjs', 'x', 'y'],
    [LABELS.neighbour, '../neighbour/outside.mjs', "'outside'", "'inside'"]
  ]
});
const REFUSED_LABELS = [LABELS.absent, LABELS.twice, LABELS.typescript, LABELS.outside, LABELS.missingFile, LABELS.neighbour];
const notMeasuredLine = refused.output.split('\n').findIndex((line) => line.startsWith('NOT MEASURED'));
const namedAfterStop = refused.output.split('\n').slice(notMeasuredLine + 1);

check('an absent target is REFUSED, saying 0 occurrences', refused.verdictOf(LABELS.absent) === 'REFUSED' && refused.output.includes('occurs 0 times'));
check('a target occurring twice is REFUSED, saying 2 occurrences', refused.verdictOf(LABELS.twice) === 'REFUSED' && refused.output.includes('occurs 2 times'));
check('a file with no parse check is REFUSED', refused.verdictOf(LABELS.typescript) === 'REFUSED');
check('a path that climbs out of the sandbox is REFUSED, and the live file it names is untouched', refused.verdictOf(LABELS.outside) === 'REFUSED' && refused.outsideAfter === OUTSIDE);
check('a mutated file that does not exist is REFUSED on its own, not a closure that cannot be followed', refused.verdictOf(LABELS.missingFile) === 'REFUSED' && refused.output.includes('mech/absent.mjs does not exist'));
check('an existing file beside the fleet is never copied, so its mutant is REFUSED and the file is untouched', refused.verdictOf(LABELS.neighbour) === 'REFUSED' && refused.neighbourAfter === OUTSIDE);
check('a campaign holding a refused mutant stops as NOT MEASURED, with its own exit code', refused.status === EXIT_NOT_MEASURED && notMeasuredLine !== -1);
check('the stop counts the refused mutants and says it in both languages', refused.output.includes('6 planned mutant(s) are refused') && refused.output.includes('@es 6 mutante(s)'));
check('the stop names every refused mutant', REFUSED_LABELS.every((label) => namedAfterStop.includes(`  - ${label}`)));
check('the stop names no mutant the plan accepted', !namedAfterStop.includes(`  - ${LABELS.kill}`));
check('a refused campaign runs nothing, not even the baseline', refused.runs === 0 && refused.verdictOf(LABELS.kill) === undefined);

const stale = campaign({ mutants: [[LABELS.absent, 'mech/decide.mjs', 'age >= 99', 'age > 99']] });

check('a campaign whose only target went stale stops before the baseline, exit 2', stale.status === EXIT_NOT_MEASURED && stale.runs === 0 && stale.output.includes('1 planned mutant(s) are refused'));

// ── a clean campaign ────────────────────────────────────────────────────────────────────────────────
const clean = campaign({ mutants: [[LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18']] });

check('a campaign whose every mutant is killed exits 0', clean.status === 0 && clean.output.includes('1/1 mutants killed'));

// ── the preconditions: nothing is measured ─────────────────────────────────────────────────────────
const redBaseline = campaign({ assertions: RED_ASSERTIONS, mutants: [[LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18']] });

check('a red baseline refuses to measure, with its own exit code', redBaseline.status === EXIT_NOT_MEASURED && redBaseline.output.includes('NOT MEASURED'));
check('a red baseline runs no mutant', redBaseline.runs === 1 && redBaseline.verdictOf(LABELS.kill) === undefined);

const unparseable = campaign({
  extraFiles: { 'mech/unparsed.mjs': 'export const broken = ;\n' },
  mutants: [['a mutant in a file that never parsed', 'mech/unparsed.mjs', 'broken', 'mended']]
});

check('an UNMUTATED file that does not parse refuses to measure: BROKEN would mean nothing', unparseable.status === EXIT_NOT_MEASURED && unparseable.output.includes('UNMUTATED mech/unparsed.mjs does not parse'));
check('an unparseable original stops the run before the baseline', unparseable.runs === 0);

const READS_FIXTURE = "const data = readFileSync(new URL('../fixtures/data.txt', import.meta.url), 'utf8');\n";
const FIXTURE_ASSERTIONS = GREEN_ASSERTIONS.replace(']', ", data === 'data\\n']");

const incomplete = campaign({ prelude: READS_FIXTURE, assertions: FIXTURE_ASSERTIONS, mutants: [[LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18']] });

check('a campaign that omits a file the selftest READS but never imports refuses to measure, not "every mutant killed"', incomplete.status === EXIT_NOT_MEASURED && incomplete.verdictOf(LABELS.kill) === undefined);

const withFixtures = campaign({ prelude: READS_FIXTURE, assertions: FIXTURE_ASSERTIONS, paths: ['fixtures'], mutants: [[LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18']] });

check('an explicit `paths` entry is ADDED to the derived files, so the fixture it names is there', withFixtures.status === 0 && withFixtures.verdictOf(LABELS.kill) === 'KILLED');

const ghost = campaign({ prelude: "import { ghost } from './ghost.mjs';\n", mutants: [[LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18']] });

check("a selftest importing a file that does not exist refuses to measure, naming the specifier, before anything runs", ghost.status === EXIT_NOT_MEASURED && ghost.output.includes("'./ghost.mjs'") && ghost.runs === 0);

const empty = campaign({ mutants: [] });

check('an empty campaign refuses to measure: 0/0 killed proves nothing', empty.status === EXIT_NOT_MEASURED && empty.runs === 0);

// ── the fleet a selftest imports shared modules from ───────────────────────────────────────────────
const FLEET_ASSERTIONS = (expected) => GREEN_ASSERTIONS.replace(']', `, process.env.SELFTEST_FLEET === ${JSON.stringify(expected)}]`);
const KILL_MUTANT = [[LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18']];

// The fixture's parent holds the run log, so a selftest reads the parent, and the fleet inside it, from that path.
const IMPORTS_PATH = "import path from 'node:path';\n";
const PARENT = 'path.dirname(process.env.MUTATION_PROOF_RUN_LOG)';
const fleetItself = campaign({ prelude: IMPORTS_PATH, assertions: GREEN_ASSERTIONS.replace(']', `, process.env.SELFTEST_FLEET === path.join(${PARENT}, 'fleet')]`), mutants: KILL_MUTANT });

check('a fleet root that holds the selftest runner is the fleet its selftests import from', fleetItself.status === 0 && fleetItself.verdictOf(LABELS.kill) === 'KILLED');

const fleetAbove = campaign({ prelude: IMPORTS_PATH, assertions: GREEN_ASSERTIONS.replace(']', `, process.env.SELFTEST_FLEET === ${PARENT}]`), runnerIn: 'parent', mutants: KILL_MUTANT });

check('a tree above the fleet root that holds the selftest runner is the fleet, the way the runner derives it', fleetAbove.status === 0 && fleetAbove.verdictOf(LABELS.kill) === 'KILLED');

const HOME_FLEET = path.join(os.homedir(), '.claude');
const noFleet = campaign({ assertions: FLEET_ASSERTIONS(HOME_FLEET), runnerIn: 'none', mutants: KILL_MUTANT });

check(
  'a tree with no selftest runner above it refuses to measure, telling the caller to set SELFTEST_FLEET in both languages',
  noFleet.status === EXIT_NOT_MEASURED && noFleet.output.includes('set SELFTEST_FLEET') && noFleet.output.includes('@es') && noFleet.output.includes('fijar SELFTEST_FLEET')
);
check('a tree with no selftest runner never hands the home fleet to a selftest: nothing runs', noFleet.runs === 0 && noFleet.verdictOf(LABELS.kill) === undefined);

const callerFleet = campaign({ assertions: FLEET_ASSERTIONS('the-callers-fleet'), environment: { SELFTEST_FLEET: 'the-callers-fleet' }, mutants: KILL_MUTANT });

check('a fleet the caller already named reaches the selftest unchanged, over the runner the tree holds', callerFleet.status === 0 && callerFleet.verdictOf(LABELS.kill) === 'KILLED');

const callerFleetNoRunner = campaign({ assertions: FLEET_ASSERTIONS('the-callers-fleet'), environment: { SELFTEST_FLEET: 'the-callers-fleet' }, runnerIn: 'none', mutants: KILL_MUTANT });

check('a fleet the caller named is used even where no tree holds a runner', callerFleetNoRunner.status === 0 && callerFleetNoRunner.verdictOf(LABELS.kill) === 'KILLED');

// ── parallel mutants: concurrencyOf and mutant-pool.mjs ─────────────────────────────────────────────
// A parallel verdict must mean what a sequential one means: same verdicts, same order, same tally, and no two
// mutants sharing a temporary folder (a collision would read as a kill the selftest never made).
// @es Un veredicto en paralelo debe significar lo mismo que uno secuencial: mismos veredictos, mismo orden, mismo
// recuento, y ningún par de mutantes compartiendo carpeta temporal (un choque se leería como una muerte falsa).
const throws = (action) => { try { action(); return false; } catch { return true; } };

check('concurrencyOf takes the campaign value first', concurrencyOf(3, { MUTATION_CONCURRENCY: '5' }, 32) === 3);
check('concurrencyOf takes MUTATION_CONCURRENCY when the campaign sets none', concurrencyOf(undefined, { MUTATION_CONCURRENCY: '5' }, 32) === 5);
check('concurrencyOf defaults to the free cores, at most 8', concurrencyOf(undefined, {}, 32) === 8 && concurrencyOf(undefined, {}, 6) === 4);
check('concurrencyOf never goes below 1', concurrencyOf(undefined, {}, 2) === 1 && concurrencyOf(0, {}, 32) === 1);
check('concurrencyOf refuses a value that is not a whole number', throws(() => concurrencyOf(undefined, { MUTATION_CONCURRENCY: 'many' }, 32)));

const TMP_PRELUDE = "import { tmpdir } from 'node:os';\nappendFileSync(process.env.MUTATION_PROOF_RUN_LOG, 'tmp ' + tmpdir() + '\\n');";
const verdictLines = (output) => output.split('\n').filter((line) => /^(KILLED|SURVIVED|CRASHED|BROKEN)/.test(line)).map((line) => line.replace(/ \(.*$/, '').replace(/ — .*$/, ''));
const parallel = campaign({ prelude: TMP_PRELUDE, environment: { MUTATION_CONCURRENCY: '3' }, mutants: MIXED_MUTANTS });
const sequentialAgain = campaign({ prelude: TMP_PRELUDE, environment: { MUTATION_CONCURRENCY: '1' }, mutants: MIXED_MUTANTS });
const mutantTemps = parallel.log.split('\n').filter((line) => line.startsWith('tmp ')).map((line) => line.slice(4)).filter((dir) => dir.endsWith(`${path.sep}.tmp`));

check('the parallel path announces its pool', parallel.output.includes('RUNNING  7 mutants, 3 at a time'));
check('the sequential path never starts a pool', !sequentialAgain.output.includes('RUNNING '));
check('the parallel path prints the same verdicts in the same order as the sequential one', verdictLines(parallel.output).join('\n') === verdictLines(sequentialAgain.output).join('\n') && verdictLines(parallel.output).length === 7);
check('the parallel path gives the same tally and exit code', parallel.output.includes('4/7 mutants killed (3 by assertion, 1 by crash)') && parallel.status === 1);
check('the parallel path runs the same selftests: the baseline and the six runnable mutants', parallel.runs === 7);
check('every parallel mutant ran with its own temporary folder inside its sandbox', mutantTemps.length === 6 && new Set(mutantTemps).size === 6 && mutantTemps.every((dir) => dir.includes(`${path.sep}mutant-`)));

// ── stop at the first failed check (pool only, calibrated on the green baseline) ────────────────────
// The cut must never invent a kill: a failure-looking line in a GREEN baseline turns it off for that campaign.
// @es El corte nunca debe inventar una muerte: una línea con pinta de fallo en la línea base EN VERDE lo apaga.
check('FAILURE_LINE matches the failure lines the selftests print', ['FAIL x', '  FAIL x', 'RED  y.selftest.mjs', 'not ok 3 - z', '✘ w', 'FAILED: q'].every((line) => FAILURE_LINE.test(line)));
check('FAILURE_LINE ignores passing lines that mention a failure', ['ok   FAIL is printed on a refusal', 'PASS  x', '3/3 passed', 'the run FAILED nothing'].every((line) => !FAILURE_LINE.test(line)));
check('failFastOf is on when the green baseline prints no failure-looking line', failFastOf({ stdout: 'ok a\n3/3 passed\n', stderr: '' }, {}).on === true);
check('failFastOf is off when the green baseline prints a failure-looking line', failFastOf({ stdout: 'RED  fixture.selftest.mjs\n3/3 passed\n', stderr: '' }, {}).on === false);
check('failFastOf is off with MUTATION_FAIL_FAST=0', failFastOf({ stdout: '3/3 passed\n', stderr: '' }, { MUTATION_FAIL_FAST: '0' }).on === false);

const HANG_AFTER_FAIL = "if (isAdult(18) !== true) { console.log('FAIL early: isAdult(18) changed'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 8000); }";
const KILL_ONLY = [[LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18']];
const timed = (options) => { const started = Date.now(); const result = campaign(options); return { ...result, ms: Date.now() - started }; };
const cut = timed({ prelude: HANG_AFTER_FAIL, environment: { MUTATION_CONCURRENCY: '2' }, mutants: KILL_ONLY });
const uncut = timed({ prelude: HANG_AFTER_FAIL, environment: { MUTATION_CONCURRENCY: '2', MUTATION_FAIL_FAST: '0' }, mutants: KILL_ONLY });

check('the pool stops a mutant at its first failed check, as an assertion kill', cut.verdictOf(LABELS.kill) === 'KILLED' && cut.output.includes('stopped at its first failed check: FAIL early') && cut.status === 0);
check('the stop saves the time the selftest would still have spent', cut.ms < 7000 && uncut.ms >= 8000);
check('with MUTATION_FAIL_FAST=0 the mutant runs to its end and is still KILLED', uncut.verdictOf(LABELS.kill) === 'KILLED' && !uncut.output.includes('stopped at its first failed check'));

const LOUD = "console.log('FAIL-looking line printed on every run, the green baseline included');";
const loud = campaign({ prelude: LOUD, environment: { MUTATION_CONCURRENCY: '2' }, mutants: [[LABELS.survivor, 'mech/decide.mjs', "'untested'", "'changed'"]] });

check('a failure-looking line in the green baseline turns the stop off, so it cannot invent a kill', loud.verdictOf(LABELS.survivor) === 'SURVIVED' && loud.output.includes('stop at the first failed check: off (the green baseline prints failure-looking lines)'));

// ── verdict ─────────────────────────────────────────────────────────────────────────────────────────
const failed = cases.filter(({ holds }) => !holds);

for (const { name, holds } of cases) console.log(`${holds ? 'ok  ' : 'FAIL'} ${name}`);

console.log(`\n${cases.length - failed.length}/${cases.length} passed`);

process.exit(failed.length === 0 ? 0 : 1);
