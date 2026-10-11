#!/usr/bin/env node
/**
 * Proof of `supersede`: the rule a ledger line states is replaced by the current one without losing the line
 * it replaces. The WHOLE old line is archived to the evidence store with a note of what superseded it, the
 * evidence is re-read from disk, and only then is the ledger written, once and read back; the line keeps its
 * scope, date, tally and marker, so a recurrence still folds into it. Anything it cannot do faithfully (no
 * such lesson, a promoted one, a rule it refuses, an archive or a write that lies, a held lock) leaves the
 * ledger byte-identical and says why in both languages. Every fixture is CONSTRUCTED in a temporary
 * directory: the real ledger and evidence are never read.
 *
 * @es Prueba de `supersede`: la regla que enuncia una línea del ledger se sustituye por la vigente sin perder
 * la línea que reemplaza. La línea vieja ENTERA se archiva en el almacén de evidencia con una nota de qué la
 * sustituyó, la evidencia se relee de disco y solo entonces se escribe el ledger, una vez y releído; la línea
 * conserva alcance, fecha, recuento y marcador, así que una reincidencia sigue plegándose en ella. Lo que no
 * puede hacer con fidelidad (lección inexistente, promovida, una regla que rechaza, un archivo o una
 * escritura que miente, un lock ocupado) deja el ledger idéntico byte a byte y dice por qué en los dos
 * idiomas. Todo fixture se CONSTRUYE en un directorio temporal: nunca se lee el ledger ni la evidencia reales.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { holdsWholeLine } from './conservation.mjs';
import { appendEvidence } from './evidence.mjs';
import { HEADER } from './ledgers.mjs';
import { isTiered, parseEntry, readMarker, splitRule, tieredLine } from './ledger-line.mjs';
import { provisionLoop, worldEnv } from './fixture-loop.mjs';
import { describeSupersede, runSupersede } from './supersede.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('failure-capture');

const scratch = mkdtempSync(path.join(os.tmpdir(), 'supersede-selftest-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 500)}`}`);
}

const readOr = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

const SCOPE = 'demo';
const DATE = '2026-10-06';
const RULE = 'a worker runs only the gates that read what it touched and never starts the whole chain.';
const BY = 'AGENT-LEDGER.md §0b and §3 (owner directive 2026-10-01)';

// A fat keyed line (the marker names the key), a tiered marker-less one (only its pointer names the key), a stub.
const FAT = `- [${SCOPE}] 2026-07-07 — (×9) Nine times I called something green from a measure that was not the gate -> RULE: green is answered only by running the aggregate chain whole. <!--fc:green-rule#9-->`;
const TIERED = tieredLine({ scope: SCOPE, date: '2026-07-06', rule: 'never trust a member script as the verdict on the gate.', key: 'member-script' }).line;
const OTHER = tieredLine({ scope: SCOPE, date: '2026-07-05', tally: '(×2)', rule: 'an unrelated rule that must not move at all.', key: 'unrelated-rule', marker: '<!--fc:unrelated-rule#2-->' }).line;
const DUPLICATE = tieredLine({ scope: SCOPE, date: '2026-07-08', rule: 'a second line that carries the same key by its pointer.', key: 'green-rule' }).line;
const NO_LABEL = `- [${SCOPE}] 2026-07-07 — a line that states no rule label at all, so there is nothing to replace <!--fc:no-label#1-->`;
const UNREADABLE = `- [${SCOPE}] no date here, so no head to read <!--fc:bad-line#1-->`;
const STUB = `- [promoted] 2026-09-29 — guard-key: no mechanism <!--fc:guard-key#3-->`;

/** A fresh ledger with `lines`, its lock and its pre-run text. @es Un ledger nuevo con `lines`, su lock y su texto previo. */
function world(name, lines) {
  const dir = path.join(scratch, name);
  const file = path.join(dir, 'lessons-ledger.md');

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${HEADER(SCOPE, '`x`')}${lines.join('\n')}\n`, 'utf8');

  const text = readFileSync(file, 'utf8');
  const load = () => [{ scope: SCOPE, file, lines: readFileSync(file, 'utf8').split('\n') }];

  return { dir, file, text, load, lock: path.join(dir, 'ledger.lock'), evidence: (key) => path.join(dir, 'lessons', 'evidence', `${key}.md`) };
}

/** One run; a run that throws is a failed check, never a crash of this proof. @es Una ejecución; una que lanza es un check fallido, nunca un crash de esta prueba. */
const supersede = (target, overrides = {}, deps) => {
  try {
    return runSupersede({ load: target.load, key: 'green-rule', rule: RULE, by: BY, date: DATE, lockFile: target.lock, deps, ...overrides });
  } catch (error) {
    return { status: 'threw', held: false, problems: [String(error)], amended: undefined };
  }
};
const said = (outcome) => describeSupersede(outcome).join('\n');
const bilingual = (outcome) => describeSupersede(outcome).every((line) => line.includes(' @es '));

// --- a keyed fat line: the old line is archived whole, the new one keeps scope, date, tally and marker -----
{
  const target = world('keyed', [OTHER, FAT, TIERED]);
  const outcome = supersede(target);
  const lines = readOr(target.file).split('\n');
  const at = lines.findIndex((line) => line.includes('<!--fc:green-rule#9-->'));
  const current = lines[at] ?? '';
  const entry = parseEntry(current);
  const split = entry.ok ? splitRule(entry.body) : entry;

  check('a keyed line is superseded: status 0, nothing refused', outcome.status === 0 && outcome.problems.length === 0 && outcome.amended?.changed === true, JSON.stringify(outcome));
  check('...it keeps its scope, its date, its (×9) tally and its marker, so a recurrence still folds into it', entry.ok && entry.scope === SCOPE && entry.date === '2026-07-07' && split.tally === '(×9)' && readMarker(current)?.key === 'green-rule' && readMarker(current)?.count === 9, current);
  check('...it states the current rule, then what superseded it, then its pointer: the line is tiered', split.ok && split.rule.startsWith(RULE) && split.rule.includes(`Superseded ${DATE} by ${BY}.`) && isTiered(current), current);
  check('...the old line is a whole line of the evidence file, with the note of what superseded it and the line that replaced it', holdsWholeLine(readOr(target.evidence('green-rule')), FAT) && readOr(target.evidence('green-rule')).includes(`Superseded ${DATE} by ${BY}`) && holdsWholeLine(readOr(target.evidence('green-rule')), `Superseded ${DATE} by ${BY}; replaced by: ${current}`), readOr(target.evidence('green-rule')));
  check('...every other line and the header are byte-identical', lines.filter((line, index) => index !== at).join('\n') === target.text.split('\n').filter((line) => line !== FAT).join('\n') && readOr(target.file).startsWith(HEADER(SCOPE, '`x`')), readOr(target.file));
  check('...the report is bilingual and says what changed', bilingual(outcome) && said(outcome).includes('green-rule') && said(outcome).includes('superseded') && said(outcome).includes('sustituida') && said(outcome).includes('caracteres'), said(outcome));

  const afterFirst = readOr(target.file);
  const evidenceFirst = readOr(target.evidence('green-rule'));
  const again = supersede(target);

  check('the same supersede run again changes nothing, and says so in both languages', again.status === 0 && bilingual(again) && again.amended?.changed === false && readOr(target.file) === afterFirst && readOr(target.evidence('green-rule')) === evidenceFirst && said(again).includes('already'), `${JSON.stringify(again)}\n${said(again)}`);

  const amended = supersede(target, { rule: 'a worker runs only the gates that read what it touched, derived from its own diff.' });

  check('a later supersede of the same lesson archives the line as it was, and the earlier archive stays', amended.status === 0 && holdsWholeLine(readOr(target.evidence('green-rule')), FAT) && holdsWholeLine(readOr(target.evidence('green-rule')), current) && readOr(target.file).includes('derived from its own diff.'), readOr(target.evidence('green-rule')));
}

// --- the texts are trimmed, and a directive that already ends a sentence does not get a second dot --------
{
  const target = world('trimmed', [FAT]);

  supersede(target, { rule: `   ${RULE}   `, by: `  ${BY}.  ` });

  check('the rule and the directive are trimmed and the line holds exactly one dot after the directive', readOr(target.file).includes(`RULE: ${RULE} Superseded ${DATE} by ${BY}. Evidence: lessons/evidence/green-rule.md <!--fc:green-rule#9-->`), readOr(target.file));
}

// --- a tiered marker-less line is found by the key its evidence pointer names ------------------------------
{
  const target = world('pointer-key', [FAT, TIERED]);
  const outcome = supersede(target, { key: 'member-script' });
  const lines = readOr(target.file).split('\n');
  const line = lines.find((one) => one.includes('lessons/evidence/member-script.md'));

  check('a marker-less tiered line is found by its pointer key and superseded, with no marker invented', outcome.status === 0 && line !== undefined && line.includes(RULE) && !line.includes('<!--fc:') && line.startsWith(`- [${SCOPE}] 2026-07-06 — RULE: `), `${JSON.stringify(outcome)}\n${line}`);
  check('...its old line is archived whole under its own key', holdsWholeLine(readOr(target.evidence('member-script')), TIERED));
  check('...the keyed line beside it is untouched', lines.includes(FAT));
}

// --- what it refuses, and the ledger stays as it was -------------------------------------------------------
for (const [name, lines, overrides, english, spanish] of [
  ['a key no line carries', [FAT, TIERED], { key: 'no-such-lesson' }, 'no ledger line carries the key', 'ninguna línea del ledger lleva la clave'],
  ['a key that is not kebab-case', [FAT], { key: 'Bad Key' }, 'lowercase kebab-case', 'kebab-case en minúsculas'],
  ['a key two lines carry', [FAT, DUPLICATE], {}, 'lines carry the key', 'líneas del ledger llevan la clave'],
  ['a promoted lesson', [STUB], { key: 'guard-key' }, 'is promoted', 'está promovida'],
  ['a line that cannot be read', [UNREADABLE], { key: 'bad-line' }, 'no "[scope] date — " head', 'no tiene cabecera'],
  ['a line with no RULE: label', [NO_LABEL], { key: 'no-label' }, 'no "RULE: " label', 'no tiene la etiqueta "RULE: "'],
  ['a rule under the minimum length', [FAT], { rule: 'too short' }, 'at least 20 characters', 'al menos 20 caracteres'],
  ['a rule holding a RULE: label', [FAT], { rule: 'RULE: a second label would make the line read back with two' }, 'must not contain "RULE:"', 'no puede contener "RULE:"'],
  ['a rule on two lines', [FAT], { rule: 'a rule that runs\nover two lines for no reason at all' }, 'must be one line', 'debe ser de una sola línea'],
  ['a rule holding a marker opener', [FAT], { rule: 'a rule that holds <!--fc:x#1--> inside it, which is not allowed' }, '<!--fc:', '<!--fc:'],
  ['no rule', [FAT], { rule: undefined }, '--rule', '--rule'],
  ['no superseding directive', [FAT], { by: undefined }, '--by', '--by'],
  ['a blank superseding directive', [FAT], { by: '   ' }, '--by is required', '--by es obligatorio'],
  ['a superseding directive on two lines', [FAT], { by: 'one line\nand another' }, '--by must be one line', '--by debe ser de una sola línea'],
]) {
  const target = world(`refuse-${String(passed)}`, lines);
  const outcome = supersede(target, overrides);

  check(`${name} is refused with status 1, in both languages, naming why`, outcome.status === 1 && outcome.problems.length > 0 && said(outcome).includes(english) && said(outcome).includes(spanish) && bilingual(outcome), `${JSON.stringify(outcome)}\n${said(outcome)}`);
  check(`...and the ledger is byte-identical and no evidence is written`, readOr(target.file) === target.text && !existsSync(path.dirname(target.evidence('x'))), readOr(target.file));
}

// --- the proofs, with the file system made to lie ----------------------------------------------------------
{
  const target = world('half-archive', [FAT]);
  const halfArchive = (input) => appendEvidence({ ...input, line: input.line.slice(0, 50), note: undefined });
  const outcome = supersede(target, {}, { appendEvidence: halfArchive });

  check('an archive that kept only part of the old line leaves the ledger byte-identical, names the deficit and fails', readOr(target.file) === target.text && outcome.status === 1 && said(outcome).includes('not a whole line of the evidence file') && said(outcome).includes('no es una línea entera de la evidencia'), `${JSON.stringify(outcome)}`);
}

{
  const target = world('longer-line', [FAT]);
  const longer = (input) => appendEvidence({ ...input, line: `${input.line} and some more words`, note: undefined });
  const outcome = supersede(target, {}, { appendEvidence: longer });

  check('an archive that holds the old line only inside a longer line proves nothing: the ledger stays and the run fails', readOr(target.file) === target.text && outcome.status === 1 && said(outcome).includes('not a whole line of the evidence file'), JSON.stringify(outcome));
}

{
  const target = world('archive-refused', [FAT]);
  const outcome = supersede(target, {}, { appendEvidence: () => ({ ok: false, problem: 'refused. @es rechazado.' }) });

  check('an archive that cannot be written leaves the ledger byte-identical and fails with its reason', readOr(target.file) === target.text && outcome.status === 1 && said(outcome).includes('refused.') && said(outcome).includes('rechazado.'), JSON.stringify(outcome));
}

{
  const target = world('no-evidence-read', [FAT]);
  const outcome = supersede(target, {}, { readEvidence: () => undefined });

  check('an archive that cannot be re-read proves nothing: the ledger stays and the run fails', readOr(target.file) === target.text && outcome.status === 1 && said(outcome).includes('absent or unreadable'), JSON.stringify(outcome));
}

for (const [name, mangle] of [['drops its last characters', (text) => text.slice(0, -5)], ['changes a counter', (text) => text.replace('#9', '#8')], ['fails', () => { throw new Error('disk full'); }]]) {
  const target = world(`write-${name.split(' ')[0]}`, [FAT]);
  const outcome = supersede(target, {}, { writeText: (file, text) => writeFileSync(file, mangle(text), 'utf8') });

  check(`a ledger write that ${name} is detected on re-read and the old ledger is restored`, readOr(target.file) === target.text && outcome.status === 1 && outcome.amended === undefined && said(outcome).includes('RESTORED') && said(outcome).includes('RESTAURADO'), `${JSON.stringify(outcome)}\n${readOr(target.file)}`);
}

// --- a held lock refuses without writing -------------------------------------------------------------------
{
  const target = world('locked', [FAT]);

  writeFileSync(target.lock, '');

  const outcome = supersede(target);

  check('a held ledger lock gives status 2 and writes nothing: no ledger change, no evidence, the holder\'s lock stays', outcome.status === 2 && outcome.held === true && readOr(target.file) === target.text && !existsSync(path.dirname(target.evidence('x'))) && existsSync(target.lock), JSON.stringify(outcome));
  check('...the refusal says the ledger is locked, in both languages', said(outcome).includes('locked by another writer') && said(outcome).includes(' @es ') && bilingual(outcome), said(outcome));
}

{
  // The ledger is read only once the lock is held, so a line another writer adds meanwhile is never lost.
  // @es El ledger se lee solo con el lock ya tomado, así que una línea que otro escritor añada nunca se pierde.
  const target = world('read-under-lock', [FAT]);
  let reads = 0;
  let lockedWhenRead;
  const load = () => {
    reads += 1;
    lockedWhenRead = existsSync(target.lock);

    return target.load();
  };
  const counted = runSupersede({ load, key: 'green-rule', rule: RULE, by: BY, date: DATE, lockFile: target.lock });

  check('the ledger is loaded exactly once, and while the lock is held', counted.status === 0 && reads === 1 && lockedWhenRead === true, `reads ${String(reads)}, locked ${String(lockedWhenRead)}`);
}

// --- the command, end to end, in a home of its own -----------------------------------------------------------
{
  const repo = path.join(scratch, 'cli', 'repo');
  const home = path.join(scratch, 'cli', 'home');
  const loop = path.join(repo, '.claude', 'failure-capture');
  const ledger = path.join(repo, '.claude', 'lessons-ledger.md');

  // No state directory: a command that takes the ledger lock must make the directory the lock lives in.
  // @es Sin directorio de estado: un comando que toma el lock del ledger debe crear el directorio donde vive.
  mkdirSync(loop, { recursive: true });
  mkdirSync(path.join(home, '.claude', 'rules'), { recursive: true });
  provisionLoop(loop);
  writeFileSync(path.join(repo, '.claude', 'CLAUDE.md'), '# Project\n', 'utf8');
  writeFileSync(path.join(repo, '.claude', 'failure-capture.json'), JSON.stringify({ scope: SCOPE }), 'utf8');
  writeFileSync(path.join(home, '.claude', 'lessons-ledger.md'), `${HEADER('global', '`x`')}`, 'utf8');
  writeFileSync(ledger, `${HEADER(SCOPE, '`x`')}${FAT}\n`, 'utf8');

  const run = (...args) => {
    try {
      return { status: 0, out: execFileSync(process.execPath, [path.join(loop, 'capture.mjs'), ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: worldEnv(home, { loop }), timeout: 60_000 }) };
    } catch (error) {
      return { status: typeof error?.status === 'number' ? error.status : 'did-not-run', out: `${error?.stdout ?? ''}${error?.stderr ?? ''}` };
    }
  };

  const usage = run('--help');

  check('the usage names the command and its three flags, in both languages', usage.out.includes('supersede') && usage.out.includes('--key') && usage.out.includes('--rule') && usage.out.includes('--by') && usage.out.includes('sustituye'), usage.out);

  const missing = run('supersede', '--key', 'green-rule');

  check('a supersede without --rule or --by is refused, bilingual, and the ledger is untouched', missing.status === 1 && missing.out.includes('--rule') && missing.out.includes('--by') && missing.out.includes(' @es ') && readOr(ledger) === `${HEADER(SCOPE, '`x`')}${FAT}\n`, `exit ${missing.status}: ${missing.out}`);

  const done = run('supersede', '--key', 'green-rule', '--rule', RULE, '--by', BY);
  const after = readOr(ledger);
  const now = new Date();
  const localToday = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  check('the command supersedes the line of this project\'s own ledger, beside its own evidence, and exits 0', done.status === 0 && after.includes(`RULE: ${RULE} Superseded`) && holdsWholeLine(readOr(path.join(repo, '.claude', 'lessons', 'evidence', 'green-rule.md')), FAT), `exit ${done.status}: ${done.out}\n${after}`);
  check('...the line says it was superseded today', after.includes(`Superseded ${localToday} by ${BY}.`), after);
  check('...everything it printed is bilingual', done.out.split('\n').filter((line) => line.length > 0).every((line) => line.includes(' @es ')), done.out);
  check('...and the same command again is a clean no-op', run('supersede', '--key', 'green-rule', '--rule', RULE, '--by', BY).status === 0 && readOr(ledger) === after);
}

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture supersede selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
