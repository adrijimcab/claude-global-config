#!/usr/bin/env node
/**
 * Proves the mutation runner itself DISCRIMINATES. Every fixture is CONSTRUCTED here, in a temporary
 * directory: a tiny mechanism, a tiny selftest for it, and a campaign that runs the runner sitting NEXT TO
 * this file — so when `mutants.mjs` mutates a sandbox copy of the runner, this selftest measures that copy.
 * Nothing is read from a live guard, whose legitimate edits would otherwise redden this proof.
 *
 * The state space is the runner's verdicts: KILLED, SURVIVED, BROKEN, REFUSED (absent, ambiguous, no parse
 * check, outside the copied paths) and NOT MEASURED (red baseline, a sandbox missing a file the selftest
 * needs, unparseable original, empty campaign). Each is
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

import { EXIT_NOT_MEASURED, occurrencesOf } from './run-mutants.mjs';

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

/** A top-level FILE the fixture selftest imports: `paths` must copy single files, not only directories. */
const EXPECTED = "export const EXPECTED_GREETING = 'hello x';\n";

/** A live file beside the fleet's copied paths: no mutant may ever write to it. */
const OUTSIDE = "export const outside = 'outside';\n";

const GREEN_ASSERTIONS = `[isAdult(18) === true, isAdult(17) === false, describe(5) === 'young', greeting('x') === EXPECTED_GREETING]`;
const RED_ASSERTIONS = `[isAdult(18) === false]`;

const fixtureSelftest = (assertions) => `import { appendFileSync } from 'node:fs';
import { describe, greeting, isAdult } from './decide.mjs';
import { EXPECTED_GREETING } from '../expected.mjs';

appendFileSync(process.env.MUTATION_PROOF_RUN_LOG, 'run\\n');

const results = ${assertions};
const passed = results.filter(Boolean).length;

console.log(\`\${passed}/\${results.length} passed\`);
process.exit(passed === results.length ? 0 : 1);
`;

const cases = [];
const check = (name, holds) => cases.push({ name, holds });

/** Builds a fixture fleet, runs one campaign over it, and reports what the runner said and did. */
function campaign({ assertions = GREEN_ASSERTIONS, extraFiles = {}, paths = ['mech', 'expected.mjs'], mutants }) {
  const fleet = mkdtempSync(path.join(os.tmpdir(), 'mutation-proof-fixture-'));
  const runLog = path.join(fleet, 'runs.log');

  try {
    mkdirSync(path.join(fleet, 'mech'));
    mkdirSync(path.join(fleet, 'other'));
    writeFileSync(path.join(fleet, 'mech', 'decide.mjs'), MECHANISM);
    writeFileSync(path.join(fleet, 'mech', 'selftest.mjs'), fixtureSelftest(assertions));
    writeFileSync(path.join(fleet, 'other', 'outside.mjs'), OUTSIDE);
    writeFileSync(path.join(fleet, 'expected.mjs'), EXPECTED);
    writeFileSync(runLog, '');

    for (const [file, content] of Object.entries(extraFiles)) writeFileSync(path.join(fleet, file), content);

    const script = path.join(fleet, 'campaign.mjs');

    writeFileSync(
      script,
      `import { runMutants } from ${JSON.stringify(pathToFileURL(RUNNER).href)};
const survivors = runMutants({ fleetRoot: ${JSON.stringify(fleet)}, paths: ${JSON.stringify(paths)}, selftest: 'mech/selftest.mjs', mutants: ${JSON.stringify(mutants)} });
process.exit(survivors === 0 ? 0 : 1);
`
    );

    const run = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, MUTATION_PROOF_RUN_LOG: runLog }, timeout: 120_000 });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;

    return {
      status: run.status,
      output,
      runs: occurrencesOf(readFileSync(runLog, 'utf8'), 'run\n'),
      outsideAfter: readFileSync(path.join(fleet, 'other', 'outside.mjs'), 'utf8'),
      verdictOf: (label) => output.split('\n').find((line) => line.includes(label))?.slice(0, 8).trim()
    };
  } finally {
    rmSync(fleet, { recursive: true, force: true });
  }
}

// ── the counter every refusal rests on ──────────────────────────────────────────────────────────────
check('occurrencesOf counts a single occurrence once', occurrencesOf('abc', 'b') === 1);
check('occurrencesOf counts overlapping starts, so "aa" in "aaa" is ambiguous', occurrencesOf('aaa', 'aa') === 2);
check('occurrencesOf reports absence as zero', occurrencesOf('abc', 'z') === 0);

// ── every per-mutant verdict, in one campaign ───────────────────────────────────────────────────────
const LABELS = {
  kill: 'the age threshold is loosened',
  survivor: 'an untested constant changes',
  absent: 'a threshold that is not in the file',
  twice: 'a literal that occurs twice',
  broken: 'one arm of the if/else is deleted, leaving a dangling else',
  crash: 'describe reads a name that does not exist',
  dollar: 'a replacement carrying a dollar pattern',
  typescript: 'a TypeScript file',
  outside: 'a path that climbs out of the sandbox onto a live file'
};

const mixed = campaign({
  extraFiles: { 'mech/notes.ts': 'export const note: string = "note";\n' },
  mutants: [
    [LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18'],
    [LABELS.survivor, 'mech/decide.mjs', "'untested'", "'changed'"],
    [LABELS.absent, 'mech/decide.mjs', 'age >= 99', 'age > 99'],
    [LABELS.twice, 'mech/decide.mjs', "'twin'", "'triplet'"],
    [LABELS.broken, 'mech/decide.mjs', 'if (age >= 18) return true;', ''],
    [LABELS.crash, 'mech/decide.mjs', "return age > 99 ? 'old' : 'young';", 'return notDeclaredAnywhere;'],
    [LABELS.dollar, 'mech/decide.mjs', "'hello '", "'$&'"],
    [LABELS.typescript, 'mech/notes.ts', '"note"', '"other"'],
    // From any sandbox under <fleet>/scratch/mutation-proof/, three levels up is the fleet itself.
    [LABELS.outside, '../../../other/outside.mjs', "'outside'", "'inside'"]
  ]
});

check('a mutant that breaks the tested decision is KILLED', mixed.verdictOf(LABELS.kill) === 'KILLED');
check('a mutant the selftest cannot see SURVIVES', mixed.verdictOf(LABELS.survivor) === 'SURVIVED');
check('an absent target is REFUSED, saying 0 occurrences', mixed.verdictOf(LABELS.absent) === 'REFUSED' && mixed.output.includes('occurs 0 times'));
check('a target occurring twice is REFUSED, saying 2 occurrences', mixed.verdictOf(LABELS.twice) === 'REFUSED' && mixed.output.includes('occurs 2 times'));
check('a mutant that no longer parses is BROKEN, not KILLED', mixed.verdictOf(LABELS.broken) === 'BROKEN');
check('a runtime crash on a path the selftest drives is a kill, printed apart as CRASHED — the mutated code ran', mixed.verdictOf(LABELS.crash) === 'CRASHED');
check('a replacement carrying $& is written literally, so it is KILLED, not BROKEN', mixed.verdictOf(LABELS.dollar) === 'KILLED');
check('a file with no parse check is REFUSED', mixed.verdictOf(LABELS.typescript) === 'REFUSED');
check('a path that climbs out of the sandbox is REFUSED, and the live file it names is untouched', mixed.verdictOf(LABELS.outside) === 'REFUSED' && mixed.outsideAfter === OUTSIDE);
check('only the baseline and the four runnable mutants ran: refused and BROKEN mutants never run', mixed.runs === 5);
check('the tally counts refused and BROKEN mutants as survivors', mixed.output.includes('3/9 mutants killed (2 by assertion, 1 by crash)'));
check('a campaign with survivors exits 1', mixed.status === 1);

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

const incomplete = campaign({ paths: ['mech'], mutants: [[LABELS.kill, 'mech/decide.mjs', 'age >= 18', 'age > 18']] });

check('a campaign whose paths omit a file the selftest needs refuses to measure, not "every mutant killed"', incomplete.status === EXIT_NOT_MEASURED && incomplete.verdictOf(LABELS.kill) === undefined);

const empty = campaign({ mutants: [] });

check('an empty campaign refuses to measure: 0/0 killed proves nothing', empty.status === EXIT_NOT_MEASURED && empty.runs === 0);

// ── verdict ─────────────────────────────────────────────────────────────────────────────────────────
const failed = cases.filter(({ holds }) => !holds);

for (const { name, holds } of cases) console.log(`${holds ? 'ok  ' : 'FAIL'} ${name}`);

console.log(`\n${cases.length - failed.length}/${cases.length} passed`);

process.exit(failed.length === 0 ? 0 : 1);
