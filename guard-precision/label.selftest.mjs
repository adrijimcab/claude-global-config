#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `guard-precision/label.mjs`: the hand-labelling command. It draws a reproducible
 * random sample of UNLABELLED blocks per guard, shows their evidence, and records `--correct <blockId>` /
 * `--false <blockId>` through the journal. Every case builds its journals under a temp `HOOK_STATE_DIR` with
 * the real v2 writer; the real home is never touched.
 *
 * THE STATE SPACE: a guard with many unlabelled blocks / few / none / no blocks at all (only an orphan
 * outcome, only legacy lines, an empty directory); a sample smaller than, equal to and larger than the
 * unlabelled population; the same seed twice, another seed, another guard with the same ids; a draw that
 * must be uniform (no id favoured); a block with and without a tool use id and a reason; a label of a block
 * that is correct / false / unknown / an orphan's id / of another guard / already labelled the same / labelled
 * the other way (the last label decides); every refused command line (unknown token, missing / blank /
 * duplicate option, conflicting options, a bad sample size, a bad mechanism name, a guard with no journal);
 * a sample that must write nothing; a state root that cannot be read; and the real process.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `label.mjs`, el comando de etiquetado a mano: saca una muestra aleatoria
 * reproducible de bloqueos SIN ETIQUETAR por guard, muestra su evidencia y registra `--correct <blockId>` /
 * `--false <blockId>` por el journal. Cada caso construye sus journals bajo un `HOOK_STATE_DIR` temporal con
 * el escritor v2 real; el home real no se toca. Espacio de estados: un guard con muchos bloqueos sin
 * etiquetar / pocos / ninguno / sin bloqueos (solo un desenlace huérfano, solo líneas heredadas, un
 * directorio vacío); una muestra menor, igual y mayor que la población; la misma semilla dos veces, otra
 * semilla, otro guard con los mismos ids; un sorteo que debe ser uniforme (ningún id favorecido); un
 * bloqueo con y sin id de uso de herramienta y motivo; la etiqueta de un bloqueo acertado / falso /
 * desconocido / con el id de un huérfano / de otro guard / ya etiquetado igual / etiquetado al revés (decide
 * la última); cada línea de comandos rechazada (token desconocido, opción ausente / en blanco / repetida,
 * opciones en conflicto, un tamaño de muestra erróneo, un nombre de mecanismo erróneo, un guard sin
 * journal); una muestra que no debe escribir nada; una raíz de estado que no se puede leer; y el proceso real.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { appendRecord, digestInput, journalPath } from '../hook-state/journal.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const saved = { HOOK_STATE_DIR: process.env.HOOK_STATE_DIR, HOOK_CLAUDE_HOME: process.env.HOOK_CLAUDE_HOME };
const scratch = mkdtempSync(path.join(tmpdir(), 'label-selftest-'));
const stateRoot = path.join(scratch, 'state');
const claudeRoot = path.join(scratch, 'claude');
process.env.HOOK_STATE_DIR = stateRoot;
process.env.HOOK_CLAUDE_HOME = claudeRoot;

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const CLOCK = Date.UTC(2026, 9, 4, 12, 0, 0);
const LATER = Date.UTC(2026, 9, 5, 8, 30, 0);
const idOf = (index) => `B${String(index).padStart(2, '0')}`;
const decide = (mechanism, blockId, extra = {}) => appendRecord(mechanism, { kind: 'decision', blockId, inputDigest: digestInput(blockId), ...extra }, { now: CLOCK });
const evidenced = (mechanism, blockId) => decide(mechanism, blockId, { toolUseId: `toolu_${blockId}`, reason: `rule for ${blockId}` });
const outcome = (mechanism, kind, blockId) => appendRecord(mechanism, { kind, blockId, inputDigest: digestInput(blockId) }, { now: CLOCK });
const records = (mechanism) => (existsSync(journalPath(mechanism)) ? readFileSync(journalPath(mechanism), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)) : []);
const everyLineBilingual = (lines) => lines.length > 0 && lines.every((line) => / @es /.test(line));

let loaded;

try {
  loaded = await import('./label.mjs');
} catch (error) {
  failures.push(`the module does not load — ${error.message}`);
}

if (loaded !== undefined) {
  const { DEFAULT_SAMPLE, DEFAULT_SEED, drawSample, main } = loaded;
  const { bilingual } = await import('./label-messages.mjs');
  const { MIN_LABELLED } = await import('./report.mjs');
  const safe = (action) => {
    try {
      return action();
    } catch (error) {
      return { threw: error.message };
    }
  };
  const run = (argv, now = CLOCK) => {
    const out = [];
    const err = [];
    const code = safe(() => main(argv, { sink: { log: (text) => out.push(text), error: (text) => err.push(text) }, now }));

    return { code, out, err };
  };
  /** The block ids a run listed for `mechanism`, in the order printed. @es Los ids de bloqueo que una corrida listó para `mechanism`, en el orden impreso. */
  const sampled = (out, mechanism) => {
    const start = out.findIndex((line) => line.startsWith(`${mechanism}: `));

    if (start === -1) return undefined;

    const rows = [];

    for (const line of out.slice(start + 1)) {
      const found = /^block (\S+): /.exec(line);

      if (found === null) break;
      rows.push(found[1]);
    }

    return rows;
  };

  // --- the fixtures ---
  for (let index = 1; index <= 30; index += 1) evidenced('guard-a', idOf(index));
  outcome('guard-a', 'dismissal', 'B01');
  outcome('guard-a', 'true-positive-report', 'B02');
  decide('guard-b', 'N1');
  decide('guard-b', 'N2', { toolUseId: 'toolu_N2' });
  decide('guard-b', 'N3', { reason: 'only a reason' });
  evidenced('guard-c', 'C1');
  evidenced('guard-c', 'C2');
  outcome('guard-c', 'false-positive-report', 'C1');
  outcome('guard-c', 'true-positive-report', 'C2');
  outcome('guard-d', 'dismissal', 'ZZ');
  mkdirSync(path.dirname(journalPath('guard-e')), { recursive: true });
  writeFileSync(path.join(path.dirname(journalPath('guard-e')), 'refusals.jsonl'), '{"ts":"x"}\n');
  mkdirSync(path.join(stateRoot, 'empty-guard'), { recursive: true });
  for (let index = 1; index <= 30; index += 1) evidenced('guard-f', idOf(index));

  const unlabelledOfA = Array.from({ length: 28 }, (_, index) => idOf(index + 3));

  // --- the defaults ---
  check('the default sample is as big as the minimum of labelled blocks, the default seed is 1', [DEFAULT_SAMPLE, MIN_LABELLED, DEFAULT_SEED], [10, 10, '1']);

  // --- drawSample: pure, reproducible, uniform ---
  const draw = (ids, options) => safe(() => drawSample(ids, options));
  const idsOf30 = Array.from({ length: 30 }, (_, index) => idOf(index + 1));
  const base = { seed: '1', mechanism: 'guard-a', size: 5 };
  const first = draw(idsOf30, base);
  check('a draw is the requested number of distinct ids of the population', [first.length, new Set(first).size, first.every((id) => idsOf30.includes(id))], [5, 5, true]);
  check('a draw is sorted by id', first, [...first].sort());
  check('the same seed, guard and population draw the same ids', draw(idsOf30, base), first);
  check('the order of the population does not change the draw', draw([...idsOf30].reverse(), base), first);
  check('another seed draws other ids', draw(idsOf30, { ...base, seed: '2' }).join() === first.join(), false);
  check('another guard with the same ids draws other ids', draw(idsOf30, { ...base, mechanism: 'guard-f' }).join() === first.join(), false);
  check('a draw bigger than the population is the whole population', draw(idsOf30.slice(0, 4), { ...base, size: 9 }), idsOf30.slice(0, 4));
  check('a draw as big as the population is the whole population', draw(idsOf30.slice(0, 4), { ...base, size: 4 }), idsOf30.slice(0, 4));
  check('a draw of an empty population is empty', draw([], base), []);
  check('a draw does not change the population it is given', (() => { const copy = [...idsOf30].reverse(); drawSample(copy, base); return copy; })(), [...idsOf30].reverse());
  const tally = { B01: 0, B02: 0, B03: 0 };

  for (let seed = 0; seed < 300; seed += 1) tally[draw(['B01', 'B02', 'B03'], { seed: String(seed), mechanism: 'guard-a', size: 1 })[0]] += 1;
  check('no id is favoured: one of three ids drawn over 300 seeds each comes up between 60 and 140 times', Object.values(tally).map((count) => count >= 60 && count <= 140), [true, true, true]);
  check('the draw is pinned, so a sample is the same on every platform', [first, draw(idsOf30, { seed: 'abc', mechanism: 'guard-f', size: 3 })], [['B06', 'B16', 'B24', 'B27', 'B28'], ['B04', 'B08', 'B28']]);

  // --- the sample mode ---
  const before = ['guard-a', 'guard-b', 'guard-c', 'guard-d', 'guard-f'].map((mechanism) => readFileSync(journalPath(mechanism), 'utf8'));
  const sample = run([]);
  check('a sample exits 0 and prints nothing on the error stream', [sample.code, sample.err], [0, []]);
  check('every line of a sample is bilingual', everyLineBilingual(sample.out), true);
  check('a sample writes nothing to any journal', ['guard-a', 'guard-b', 'guard-c', 'guard-d', 'guard-f'].map((mechanism) => readFileSync(journalPath(mechanism), 'utf8')), before);
  const listed = sampled(sample.out, 'guard-a');
  check('the guard-a header says 10 of 28 unlabelled blocks, the seed and the labelled share', sample.out.find((line) => line.startsWith('guard-a: ')), bilingual('sample-header', { mechanism: 'guard-a', shown: 10, unlabelled: 28, seed: '1', labelled: 2, blocks: 30 }));
  check('guard-a lists the default 10 distinct unlabelled blocks, sorted', [listed?.length, new Set(listed).size, listed?.every((id) => unlabelledOfA.includes(id)), listed?.join() === [...(listed ?? [])].sort().join()], [10, 10, true, true]);
  check('the sample of guard-a is the draw of its unlabelled blocks', listed, draw(unlabelledOfA, { seed: '1', mechanism: 'guard-a', size: 10 }));
  check('the labelled blocks of guard-a are never listed', [listed?.includes('B01'), listed?.includes('B02')], [false, false]);
  check('a block line shows the block id, the time, the tool use, the digest start and the reason', sample.out.find((line) => line.startsWith(`block ${listed?.[0]}: `)), bilingual('sample-block', { blockId: listed?.[0], ts: new Date(CLOCK).toISOString(), toolUseId: `toolu_${listed?.[0]}`, digest: digestInput(listed?.[0] ?? '').slice(0, 12), reason: `rule for ${listed?.[0]}` }));
  check('guard-b lists its 3 blocks, all of them as the whole population', [sample.out.find((line) => line.startsWith('guard-b: ')), sampled(sample.out, 'guard-b')], [bilingual('sample-header', { mechanism: 'guard-b', shown: 3, unlabelled: 3, seed: '1', labelled: 0, blocks: 3 }), ['N1', 'N2', 'N3']]);
  check('a block without a tool use or a reason prints a dash for each', [sample.out.find((line) => line.startsWith('block N1: ')), sample.out.find((line) => line.startsWith('block N2: ')), sample.out.find((line) => line.startsWith('block N3: '))], ['N1', 'N2', 'N3'].map((blockId) => bilingual('sample-block', { blockId, ts: new Date(CLOCK).toISOString(), toolUseId: blockId === 'N2' ? 'toolu_N2' : '-', digest: digestInput(blockId).slice(0, 12), reason: blockId === 'N3' ? 'only a reason' : '-' })));
  check('a guard with every block labelled says 0 of 0 and lists nothing', [sample.out.find((line) => line.startsWith('guard-c: ')), sampled(sample.out, 'guard-c')], [bilingual('sample-header', { mechanism: 'guard-c', shown: 0, unlabelled: 0, seed: '1', labelled: 2, blocks: 2 }), []]);
  check('a guard with no blocks, with only legacy lines, with no journal or with a non-plain name is not listed', ['guard-d', 'guard-e', 'empty-guard'].map((mechanism) => sampled(sample.out, mechanism)), [undefined, undefined, undefined]);
  check('the guards are listed in sorted order and the usage closes the sample', [sample.out.filter((line) => /^guard-\w: /.test(line)).map((line) => line.slice(0, 7)), sample.out.at(-1)], [['guard-a', 'guard-b', 'guard-c', 'guard-f'], bilingual('sample-usage')]);
  check('the usage is printed once', sample.out.filter((line) => line === bilingual('sample-usage')).length, 1);
  check('the same sample is printed twice', run([]).out, sample.out);
  check('another seed prints another sample and says its seed', [run(['--seed', 'second']).out.join('\n') === sample.out.join('\n'), run(['--seed', 'second']).out.some((line) => line.startsWith('guard-a: 10 of 28 unlabelled blocks sampled (seed second);'))], [false, true]);
  check('guards with the same ids are sampled independently', sampled(sample.out, 'guard-f')?.join() === listed?.join(), false);
  const small = run(['--sample', '3']);
  check('--sample 3 lists 3 blocks and says so', [sampled(small.out, 'guard-a')?.length, small.out.some((line) => line.startsWith('guard-a: 3 of 28 unlabelled')), sampled(small.out, 'guard-b')?.length], [3, true, 3]);
  check('a smaller sample is a prefix of the ranking: the 3 are among the 10', sampled(small.out, 'guard-a')?.every((id) => listed?.includes(id)), true);
  const everything = run(['--sample', '100']);
  check('a sample bigger than the population lists every unlabelled block', sampled(everything.out, 'guard-a'), unlabelledOfA);
  const one = run(['--mechanism', 'guard-b']);
  check('--mechanism limits the sample to that guard', [one.code, one.out.filter((line) => /^guard-\w: /.test(line)).length, sampled(one.out, 'guard-b')], [0, 1, ['N1', 'N2', 'N3']]);
  const none = run(['--mechanism', 'guard-d']);
  check('a guard with no blocks says that no guard has blocks to label, exit 0', [none.code, none.out, none.err], [0, [bilingual('no-blocks')], []]);
  const absent = run(['--mechanism', 'guard-nope']);
  check('a guard with no journal is refused, exit 2, on the error stream', [absent.code, absent.out, absent.err], [2, [], [bilingual('no-guard', { mechanism: 'guard-nope' })]]);
  const unsafeName = run(['--mechanism', '../x']);
  check('a mechanism name that is not plain is refused, exit 2, bilingual', [unsafeName.code, unsafeName.out, everyLineBilingual(unsafeName.err), /plain name/.test(unsafeName.err[0] ?? '')], [2, [], true, true]);

  // --- labelling ---
  const correct = run(['--mechanism', 'guard-a', '--correct', 'B05'], LATER);
  check('labelling a block correct exits 0 and prints its one bilingual line', [correct.code, correct.out, correct.err], [0, [bilingual('labelled-correct', { blockId: 'B05', mechanism: 'guard-a' })], []]);
  const added = records('guard-a').slice(32);
  check('it appends exactly one true-positive-report with the clock, the digest of the id and no reason', [added.length, added[0]?.v, added[0]?.kind, added[0]?.blockId, added[0]?.ts, added[0]?.inputDigest, added[0]?.toolUseId, 'reason' in (added[0] ?? {})], [1, 2, 'true-positive-report', 'B05', new Date(LATER).toISOString(), digestInput('B05'), null, false]);
  const falsified = run(['--mechanism', 'guard-a', '--false', 'B06'], LATER);
  check('labelling a block false exits 0 and says it stays in force', [falsified.code, falsified.out, falsified.err], [0, [bilingual('labelled-false', { blockId: 'B06', mechanism: 'guard-a' })], []]);
  check('it appends a false-positive-report, never a dismissal (a dismissal would lift the block)', records('guard-a').slice(33).map((record) => [record.kind, record.blockId, record.inputDigest]), [['false-positive-report', 'B06', digestInput('B06')]]);
  const resampled = run(['--sample', '100']);
  check('labelled blocks leave the sample and the labelled share grows', [sampled(resampled.out, 'guard-a')?.includes('B05'), sampled(resampled.out, 'guard-a')?.includes('B06'), sampled(resampled.out, 'guard-a')?.length, resampled.out.some((line) => line.startsWith('guard-a: 26 of 26 unlabelled blocks sampled (seed 1); 4 of 30 blocks labelled.'))], [false, false, 26, true]);
  const again = run(['--mechanism', 'guard-a', '--correct', 'B05']);
  check('the same label twice is refused, exit 2, and recorded once', [again.code, again.out, again.err, records('guard-a').length], [2, [], [bilingual('already-labelled', { blockId: 'B05', mechanism: 'guard-a', label: 'correct' })], 34]);
  const againFalse = run(['--mechanism', 'guard-a', '--false', 'B06']);
  check('the same false label twice is refused and names the label', [againFalse.code, againFalse.err, records('guard-a').length], [2, [bilingual('already-labelled', { blockId: 'B06', mechanism: 'guard-a', label: 'false' })], 34]);
  const flipped = run(['--mechanism', 'guard-a', '--correct', 'B06']);
  check('a human may change their mind: the other label is recorded', [flipped.code, records('guard-a').at(-1)?.kind, records('guard-a').length], [0, 'true-positive-report', 35]);
  check('after changing their mind the last label is the one that counts', [run(['--mechanism', 'guard-a', '--correct', 'B06']).code, run(['--mechanism', 'guard-a', '--false', 'B06']).code], [2, 0]);
  const dismissed = run(['--mechanism', 'guard-a', '--correct', 'B01']);
  check('a block already dismissed may be confirmed correct: the last label decides', [dismissed.code, records('guard-a').at(-1)?.kind], [0, 'true-positive-report']);
  const unknown = run(['--mechanism', 'guard-a', '--correct', 'NOPE']);
  check('an unknown block is refused, exit 2, nothing written', [unknown.code, unknown.out, unknown.err, records('guard-a').length], [2, [], [bilingual('unknown-block', { blockId: 'NOPE', mechanism: 'guard-a' })], 37]);
  check('the id of an orphan outcome is not a block', [run(['--mechanism', 'guard-d', '--false', 'ZZ']).code, records('guard-d').length], [2, 1]);
  check('a block of another guard is not a block of this one', [run(['--mechanism', 'guard-b', '--correct', 'B05']).code, run(['--mechanism', 'guard-a', '--correct', 'N1']).code, records('guard-b').length], [2, 2, 3]);
  check('a guard with no journal cannot be labelled', [run(['--mechanism', 'guard-nope', '--correct', 'X']).code, run(['--mechanism', 'guard-nope', '--correct', 'X']).err], [2, [bilingual('no-guard', { mechanism: 'guard-nope' })]]);
  check('a refused label writes no state directory', existsSync(path.join(stateRoot, 'guard-nope')), false);

  // --- refused command lines: exit 2, a bilingual line on the error stream, nothing written ---
  const lines = records('guard-a').length;
  const refused = (argv, expected) => {
    const result = run(argv);

    return JSON.stringify([result.code, result.out, result.err, records('guard-a').length === lines]) === JSON.stringify([2, [], [expected], true]) ? 'ok' : JSON.stringify(result);
  };
  check('an unknown token is refused and named', refused(['--nope'], bilingual('unknown-option', { option: '--nope' })), 'ok');
  check('a stray argument is refused and named', refused(['guard-a'], bilingual('unknown-option', { option: 'guard-a' })), 'ok');
  check('--json is not an option of this command', refused(['--json'], bilingual('unknown-option', { option: '--json' })), 'ok');
  check('a label without --mechanism is refused', refused(['--correct', 'B09'], bilingual('missing-argument', { option: '--mechanism' })), 'ok');
  check('--false without --mechanism is refused', refused(['--false', 'B09'], bilingual('missing-argument', { option: '--mechanism' })), 'ok');
  check('--mechanism without a value is refused', refused(['--mechanism'], bilingual('missing-argument', { option: '--mechanism' })), 'ok');
  check('--mechanism followed by an option is refused', refused(['--mechanism', '--correct', 'B09'], bilingual('missing-argument', { option: '--mechanism' })), 'ok');
  check('a blank --mechanism is refused', refused(['--mechanism', '  ', '--correct', 'B09'], bilingual('missing-argument', { option: '--mechanism' })), 'ok');
  check('--correct without a block id is refused', refused(['--mechanism', 'guard-a', '--correct'], bilingual('missing-argument', { option: '--correct' })), 'ok');
  check('--false without a block id is refused', refused(['--mechanism', 'guard-a', '--false'], bilingual('missing-argument', { option: '--false' })), 'ok');
  check('a blank block id is refused', refused(['--mechanism', 'guard-a', '--false', ' '], bilingual('missing-argument', { option: '--false' })), 'ok');
  check('--sample without a value is refused', refused(['--sample'], bilingual('missing-argument', { option: '--sample' })), 'ok');
  check('--seed without a value is refused', refused(['--seed'], bilingual('missing-argument', { option: '--seed' })), 'ok');
  check('a blank --seed is refused', refused(['--seed', ' '], bilingual('missing-argument', { option: '--seed' })), 'ok');
  check('--correct and --false together are refused', refused(['--mechanism', 'guard-a', '--correct', 'B09', '--false', 'B10'], bilingual('options-conflict', { first: '--correct', second: '--false' })), 'ok');
  check('--false and --correct together are refused and named in the order given', refused(['--mechanism', 'guard-a', '--false', 'B10', '--correct', 'B09'], bilingual('options-conflict', { first: '--false', second: '--correct' })), 'ok');
  check('a label with --sample is refused', refused(['--mechanism', 'guard-a', '--correct', 'B09', '--sample', '3'], bilingual('options-conflict', { first: '--correct', second: '--sample' })), 'ok');
  check('a false label with --seed is refused', refused(['--mechanism', 'guard-a', '--false', 'B09', '--seed', 'x'], bilingual('options-conflict', { first: '--false', second: '--seed' })), 'ok');
  check('an option given twice is refused', refused(['--mechanism', 'guard-a', '--mechanism', 'guard-b'], bilingual('duplicate-option', { option: '--mechanism' })), 'ok');
  check('--correct given twice is refused', refused(['--mechanism', 'guard-a', '--correct', 'B09', '--correct', 'B10'], bilingual('duplicate-option', { option: '--correct' })), 'ok');
  for (const bad of ['0', '-2', '1.5', 'abc', '1e3', '0x10', '3 ', '99999999999999999999']) check(`--sample ${JSON.stringify(bad)} is refused`, refused(['--sample', bad], bilingual('bad-sample', { value: bad })), 'ok');
  check('--sample 1 is the smallest sample', [run(['--sample', '1']).code, sampled(run(['--sample', '1']).out, 'guard-a')?.length], [0, 1]);

  // --- the real process ---
  const cli = (argv, env = {}) => spawnSync(process.execPath, [path.join(HERE, 'label.mjs'), ...argv], { encoding: 'utf8', env: { ...process.env, ...env } });
  const spawned = cli(['--mechanism', 'guard-b']);
  check('the process exits 0 and prints the bilingual sample on stdout only', [spawned.status, spawned.stderr, spawned.stdout.trim().split('\n').length, spawned.stdout.trim().split('\n').every((line) => / @es /.test(line))], [0, '', 5, true]);
  const spawnedLabel = cli(['--mechanism', 'guard-b', '--false', 'N1']);
  check('the process labels a block and records it under HOOK_STATE_DIR', [spawnedLabel.status, spawnedLabel.stdout.trim(), records('guard-b').at(-1)?.kind], [0, bilingual('labelled-false', { blockId: 'N1', mechanism: 'guard-b' }), 'false-positive-report']);
  const spawnedBad = cli(['--nope']);
  check('the process exits 2 on a refusal, prints it on stderr only', [spawnedBad.status, spawnedBad.stdout, spawnedBad.stderr.trim()], [2, '', bilingual('unknown-option', { option: '--nope' })]);
  const emptyHome = cli([], { HOOK_STATE_DIR: path.join(scratch, 'nothing-here') });
  check('a home with no state at all exits 0 and says no guard has blocks', [emptyHome.status, emptyHome.stdout.trim()], [0, bilingual('no-blocks')]);
  const blocker = path.join(scratch, 'a-file');
  writeFileSync(blocker, 'x');
  const broken = cli(['--mechanism', 'guard-q', '--correct', 'Q'], { HOOK_STATE_DIR: blocker });
  check('a state root that cannot be read exits 1 with a bilingual message, not a stack trace', [broken.status, broken.stdout, /^The command failed: .+\. @es El comando falló: .+\.$/.test(broken.stderr.trim()), broken.stderr.includes('    at ')], [1, '', true, false]);
  const brokenSample = cli([], { HOOK_STATE_DIR: blocker });
  check('a sample over a state root that cannot be read exits 1 the same way', [brokenSample.status, brokenSample.stdout, /^The command failed: /.test(brokenSample.stderr)], [1, '', true]);
  const home = path.join(scratch, 'home');
  mkdirSync(path.join(home, 'guard-z', 'state'), { recursive: true });
  writeFileSync(path.join(home, 'guard-z', 'state', 'journal.jsonl'), `${JSON.stringify({ v: 2, kind: 'decision', blockId: 'Z1', inputDigest: 'x' })}\n`);
  const homed = cli([], { HOOK_STATE_DIR: '', HOOK_CLAUDE_HOME: home });
  check('without HOOK_STATE_DIR the Claude home is read', [homed.status, homed.stdout.includes('guard-z: 1 of 1 unlabelled blocks sampled'), homed.stdout.includes('block Z1: ')], [0, true, true]);
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(path.join(HERE, 'label.mjs')).href)}); console.log('imported');`], { encoding: 'utf8', env: process.env });
  check('importing the module runs no command and prints nothing of its own', [imported.status, imported.stdout.trim(), imported.stderr], [0, 'imported', '']);
  check('nothing was written under the fallback Claude home', existsSync(claudeRoot), false);
}

for (const [key, value] of Object.entries(saved)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
