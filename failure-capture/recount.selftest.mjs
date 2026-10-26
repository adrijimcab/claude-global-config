#!/usr/bin/env node
/**
 * Proof of `recount`: a counter that counted one incident more than once is lowered without losing the line it
 * replaces. The WHOLE old line is archived with the old count, the new one and the reason; the evidence is re-read;
 * only then is the ledger written, once and read back, and only the marker's number changes. A raise, an unknown or
 * repeated key, a promoted stub, a lie of the disk or a held lock leaves the ledger byte-identical and says why in both
 * languages. `--dry-run` writes NOTHING, proven over the whole world tree, the state directory included. Every fixture
 * is constructed in a temporary directory: the real ledger is never read.
 *
 * @es Prueba de `recount`: un contador que contó un incidente más de una vez se baja sin perder la línea que reemplaza.
 * La línea vieja ENTERA se archiva con el número viejo, el nuevo y el motivo; se relee la evidencia; solo entonces se
 * escribe el ledger, una vez y releído, y solo cambia el número del marcador. Una subida, una clave desconocida o
 * repetida, un muñón promovido, un disco que miente o un lock ocupado dejan el ledger idéntico y dicen por qué en los
 * dos idiomas. `--dry-run` no escribe NADA, probado sobre todo el árbol del mundo, directorio de estado incluido.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { holdsWholeLine } from './conservation.mjs';
import { appendEvidence } from './evidence.mjs';
import { HEADER } from './ledgers.mjs';
import { readMarker, tieredLine } from './ledger-line.mjs';
import { provisionLoop, worldEnv } from './fixture-loop.mjs';
import { describeRecount, runRecount } from './recount.mjs';
import { isolateState } from '../hook-state/locations.mjs';

isolateState('failure-capture');

const scratch = mkdtempSync(path.join(os.tmpdir(), 'recount-selftest-'));

process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 500)}`}`);
}

const readOr = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

const SCOPE = 'global';
const DATE = '2026-10-26';
const KEY = 'shell-payload-quoting-corrupted-data';
const REASON = 'one incident was captured twice by the same session, so one recurrence never happened';

// The real shape of the line this command was built for: a tiered line whose marker over-counts. @es La forma real.
const COUNTED = tieredLine({ scope: SCOPE, date: '2026-10-16', rule: 'Paths passed from bash to PowerShell or cmd are never assembled inline with backslashes and variables.', key: KEY, marker: `<!--fc:${KEY}#4-->` }).line;
// A marker-less line pointing at the same evidence: it holds no counter, so it is never the one recounted.
const POINTER_ONLY = `- [${SCOPE}] 2026-06-30 — (×4) RULE: any payload with quotes goes in a script file. Evidence: lessons/evidence/${KEY}.md`;
const OTHER = tieredLine({ scope: SCOPE, date: '2026-07-05', tally: '(×2)', rule: 'an unrelated rule that must not move at all.', key: 'unrelated-rule', marker: '<!--fc:unrelated-rule#2-->' }).line;
const TWIN = tieredLine({ scope: SCOPE, date: '2026-07-08', rule: 'a second line that carries the same marker key.', key: KEY, marker: `<!--fc:${KEY}#2-->` }).line;
const STUB = `- [promoted] 2026-09-29 — ${KEY}: no mechanism <!--fc:${KEY}#3-->`;

function world(name, lines) {
  const dir = path.join(scratch, name);
  const file = path.join(dir, 'lessons-ledger.md');

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${HEADER(SCOPE, '`x`')}${lines.join('\n')}\n`, 'utf8');

  return { dir, file, text: readFileSync(file, 'utf8'), load: () => [{ scope: SCOPE, file, lines: readFileSync(file, 'utf8').split('\n') }], lock: path.join(dir, 'ledger.lock'), evidence: path.join(dir, 'lessons', 'evidence', `${KEY}.md`) };
}

const recount = (target, overrides = {}, deps) => {
  try {
    return runRecount({ load: target.load, key: KEY, count: 3, reason: REASON, date: DATE, lockFile: target.lock, deps, ...overrides });
  } catch (error) {
    return { status: 'threw', held: false, problems: [String(error)], recounted: undefined };
  }
};
const said = (outcome) => describeRecount(outcome).join('\n');
const bilingual = (outcome) => describeRecount(outcome).filter((line) => !line.startsWith('  ')).every((line) => line.includes(' @es '));

// --- the recount: only the marker's number changes, the old line is archived whole with the reason -------------
{
  const target = world('recount', [POINTER_ONLY, OTHER, COUNTED]);
  const outcome = recount(target);
  const lines = readOr(target.file).split('\n');
  const at = lines.findIndex((line) => readMarker(line)?.key === KEY);

  check('the counter is lowered: status 0, 4 -> 3', outcome.status === 0 && outcome.recounted?.from === 4 && outcome.recounted?.to === 3 && outcome.recounted?.changed === true, JSON.stringify(outcome));
  check('...only the marker number changed', lines[at] === COUNTED.replace(`#4-->`, `#3-->`), lines[at]);
  check('...every other line, the marker-less pointer line and the header are byte-identical', lines.filter((_, index) => index !== at).join('\n') === target.text.split('\n').filter((line) => line !== COUNTED).join('\n'), readOr(target.file));
  check('...the old line is a whole line of the evidence, with the old count, the new one and the reason', holdsWholeLine(readOr(target.evidence), COUNTED) && holdsWholeLine(readOr(target.evidence), `Recounted ${DATE} from 4 to 3: ${REASON}`) && readOr(target.evidence).includes(`(recounted)`), readOr(target.evidence));
  check('...the report is bilingual and says what changed', bilingual(outcome) && said(outcome).includes('recounted 4 -> 3') && said(outcome).includes('recontada'), said(outcome));

  const after = readOr(target.file);
  const evidence = readOr(target.evidence);
  const again = recount(target);

  check('the same recount again changes nothing, and says so in both languages', again.status === 0 && again.recounted?.changed === false && readOr(target.file) === after && readOr(target.evidence) === evidence && said(again).includes('already counts 3') && bilingual(again), said(again));
}

{
  const target = world('reason-trimmed', [COUNTED]);

  recount(target, { reason: `   ${REASON}   ` });

  check('the reason is trimmed in the evidence note', holdsWholeLine(readOr(target.evidence), `Recounted ${DATE} from 4 to 3: ${REASON}`), readOr(target.evidence));
}

{
  const target = world('to-one', [COUNTED]);

  check('a counter can go down to 1', recount(target, { count: 1 }).status === 0 && readOr(target.file).includes(`<!--fc:${KEY}#1-->`), readOr(target.file));
}

// --- a dry run: the planned line, and nothing written, not even the lock ---------------------------------------
{
  const target = world('dry', [COUNTED]);
  const outcome = recount(target, { dryRun: true });

  check('a dry run reports the line it would write', outcome.status === 0 && outcome.dryRun === true && outcome.line === COUNTED.replace('#4-->', '#3-->') && said(outcome).includes(outcome.line), said(outcome));
  check('...says it wrote nothing, in both languages', said(outcome).includes('dry run, nothing written') && said(outcome).includes('simulacro, nada escrito'), said(outcome));
  check('...and writes nothing: the ledger, no evidence, no lock', readOr(target.file) === target.text && !existsSync(target.evidence) && !existsSync(target.lock), JSON.stringify(readdirSync(target.dir)));
  check('a dry run is refused like a real run when the plan is refused', recount(world('dry-raise', [COUNTED]), { dryRun: true, count: 5 }).status === 1);

  writeFileSync(target.lock, '');

  check('a dry run needs no lock: a held one does not stop it', recount(target, { dryRun: true }).status === 0);
}

// --- what it refuses, and the ledger stays as it was ------------------------------------------------------------
for (const [name, lines, overrides, english, spanish] of [
  ['a raise', [COUNTED], { count: 5 }, 'is above the counter (4)', 'supera el contador (4)'],
  ['a key no counter carries', [POINTER_ONLY], {}, 'no ledger line carries a counter', 'ninguna línea del ledger lleva un contador'],
  ['a key two counters carry', [COUNTED, TWIN], {}, '2 ledger lines carry a counter', 'líneas del ledger llevan un contador'],
  ['a promoted stub', [STUB], { count: 2 }, 'is promoted', 'está promovida'],
  ['a key that is not kebab-case', [COUNTED], { key: 'Bad Key' }, 'lowercase kebab-case', 'kebab-case en minúsculas'],
  ['a count of zero', [COUNTED], { count: 0 }, 'at least 1', 'al menos 1'],
  ['a count that is not a whole number', [COUNTED], { count: 2.5 }, 'whole number', 'número entero'],
  ['a count that is not a number', [COUNTED], { count: Number.NaN }, 'whole number', 'número entero'],
  ['no reason', [COUNTED], { reason: undefined }, '--reason is required', '--reason es obligatorio'],
  ['a reason too short to say why', [COUNTED], { reason: 'captured twice' }, 'at least 25 characters', 'al menos 25 caracteres'],
  ['a reason padded with blanks to the minimum', [COUNTED], { reason: `${' '.repeat(20)}captured twice${' '.repeat(20)}` }, 'at least 25 characters', 'al menos 25 caracteres'],
  ['a reason on two lines', [COUNTED], { reason: 'one incident was captured twice\nby the same session that day' }, 'must be one line', 'debe ser de una sola línea'],
]) {
  const target = world(`refuse-${String(passed)}`, lines);
  const outcome = recount(target, overrides);

  check(`${name} is refused with status 1, in both languages, naming why`, outcome.status === 1 && said(outcome).includes(english) && said(outcome).includes(spanish) && bilingual(outcome), `${JSON.stringify(outcome)}\n${said(outcome)}`);
  check('...and the ledger is byte-identical and no evidence is written', readOr(target.file) === target.text && !existsSync(target.evidence), readOr(target.file));
}

// --- the proofs, with the disk made to lie ----------------------------------------------------------------------
{
  const target = world('half-archive', [COUNTED]);
  const outcome = recount(target, {}, { appendEvidence: (input) => appendEvidence({ ...input, line: input.line.slice(0, 50), note: undefined }) });

  check('an archive that kept only part of the old line leaves the ledger byte-identical and fails', readOr(target.file) === target.text && outcome.status === 1 && said(outcome).includes('not a whole line of the evidence file'), JSON.stringify(outcome));
}

{
  const target = world('archive-refused', [COUNTED]);
  const outcome = recount(target, {}, { appendEvidence: () => ({ ok: false, problem: 'refused. @es rechazado.' }) });

  check('an archive that cannot be written leaves the ledger byte-identical and fails with its reason', readOr(target.file) === target.text && outcome.status === 1 && said(outcome).includes('refused.') && said(outcome).includes('could not be proved safe'), JSON.stringify(outcome));
}

{
  const target = world('no-evidence-read', [COUNTED]);
  const outcome = recount(target, {}, { readEvidence: () => undefined });

  check('an archive that cannot be re-read proves nothing: the ledger stays and the run fails', readOr(target.file) === target.text && outcome.status === 1 && said(outcome).includes('absent or unreadable'), JSON.stringify(outcome));
}

for (const [name, mangle] of [['drops its last characters', (text) => text.slice(0, -5)], ['writes another counter', (text) => text.replace('#3-->', '#2-->')], ['fails', () => { throw new Error('disk full'); }]]) {
  const target = world(`write-${name.split(' ')[0]}`, [COUNTED]);
  const outcome = recount(target, {}, { writeText: (file, text) => writeFileSync(file, mangle(text), 'utf8') });

  check(`a ledger write that ${name} is detected on re-read and the old ledger is restored`, readOr(target.file) === target.text && outcome.status === 1 && said(outcome).includes('RESTORED') && said(outcome).includes('RESTAURADO'), JSON.stringify(outcome));
}

// --- the lock ---------------------------------------------------------------------------------------------------
{
  const target = world('locked', [COUNTED]);

  writeFileSync(target.lock, '');

  const outcome = recount(target);

  check('a held ledger lock gives status 2 and writes nothing', outcome.status === 2 && outcome.held === true && readOr(target.file) === target.text && !existsSync(target.evidence) && existsSync(target.lock), JSON.stringify(outcome));
  check('...the refusal says the ledger is locked, in both languages', said(outcome).includes('locked by another writer') && bilingual(outcome), said(outcome));
}

{
  const target = world('read-under-lock', [COUNTED]);
  let reads = 0;
  let lockedWhenRead;
  const load = () => {
    reads += 1;
    lockedWhenRead = existsSync(target.lock);

    return target.load();
  };
  const outcome = runRecount({ load, key: KEY, count: 3, reason: REASON, date: DATE, lockFile: target.lock });

  check('the ledger is loaded exactly once, and while the lock is held', outcome.status === 0 && reads === 1 && lockedWhenRead === true, `reads ${String(reads)}, locked ${String(lockedWhenRead)}`);
}

// --- the command, end to end, in a home of its own --------------------------------------------------------------
{
  const root = path.join(scratch, 'cli');
  const repo = path.join(root, 'repo');
  const home = path.join(root, 'home');
  const loop = path.join(repo, '.claude', 'failure-capture');
  const ledger = path.join(home, '.claude', 'lessons-ledger.md');

  mkdirSync(loop, { recursive: true });
  mkdirSync(path.join(home, '.claude', 'rules'), { recursive: true });
  provisionLoop(loop);
  writeFileSync(path.join(repo, '.claude', 'CLAUDE.md'), '# Project\n', 'utf8');
  writeFileSync(path.join(repo, '.claude', 'failure-capture.json'), JSON.stringify({ scope: 'demo' }), 'utf8');
  writeFileSync(path.join(repo, '.claude', 'lessons-ledger.md'), `${HEADER('demo', '`x`')}`, 'utf8');
  writeFileSync(ledger, `${HEADER('global', '`x`')}${POINTER_ONLY}\n${COUNTED}\n`, 'utf8');

  const run = (...args) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, [path.join(loop, 'capture.mjs'), ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...worldEnv(home, { loop }), CLAUDE_CODE_SESSION_ID: 'recount-selftest' }, timeout: 60_000 }) };
    } catch (error) {
      return { status: typeof error?.status === 'number' ? error.status : 'did-not-run', out: `${error?.stdout ?? ''}${error?.stderr ?? ''}` };
    }
  };

  /** Every file and directory under the world, with its bytes: what a write-free command must leave as it was. @es Cada fichero y directorio del mundo con sus bytes. */
  const tree = (directory) => readdirSync(directory).sort().flatMap((name) => {
    const full = path.join(directory, name);

    return statSync(full).isDirectory() ? [`${full}/`, ...tree(full)] : [`${full} ${readFileSync(full, 'base64')}`];
  });

  const usage = run('--help');

  check('the usage names recount, its flags and --dry-run, in both languages', usage.out.includes('recount') && usage.out.includes('--count') && usage.out.includes('--reason') && usage.out.includes('--dry-run') && usage.out.includes('baja un contador'), usage.out);

  const before = tree(root);
  const dry = run('recount', '--key', KEY, '--count', '3', '--reason', REASON, '--dry-run');

  check('the command dry run exits 0 and prints the line it would write', dry.status === 0 && dry.out.includes(COUNTED.replace('#4-->', '#3-->')), `exit ${dry.status}: ${dry.out}`);
  check('...and writes NOTHING anywhere in the world, the state directory and the lock included', JSON.stringify(tree(root)) === JSON.stringify(before), JSON.stringify(tree(root).filter((entry) => !before.includes(entry))));

  const bad = run('recount', '--key', KEY, '--count', '3x', '--reason', REASON);

  check('a count that is not digits is refused by the command and the ledger is untouched', bad.status === 1 && bad.out.includes('whole number') && readOr(ledger).includes(`#4-->`), `exit ${bad.status}: ${bad.out}`);

  const done = run('recount', '--key', KEY, '--count', '3', '--reason', REASON);
  const now = new Date();
  const localToday = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const evidence = readOr(path.join(home, '.claude', 'lessons', 'evidence', `${KEY}.md`));

  check('the command recounts the home ledger line and exits 0', done.status === 0 && readOr(ledger).includes(`<!--fc:${KEY}#3-->`) && !readOr(ledger).includes(`#4-->`), `exit ${done.status}: ${done.out}\n${readOr(ledger)}`);
  check('...archives the old line beside the home ledger, dated today', holdsWholeLine(evidence, COUNTED) && holdsWholeLine(evidence, `Recounted ${localToday} from 4 to 3: ${REASON}`), evidence);
  check('...everything it printed is bilingual', done.out.split('\n').filter((line) => line.length > 0).every((line) => line.includes(' @es ')), done.out);
}

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture recount selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
