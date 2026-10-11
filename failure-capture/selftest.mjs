#!/usr/bin/env node
/**
 * Discrimination proof for `capture.mjs promote` — the escalation arm of the failure-capture loop.
 *
 * WHAT IS UNDER TEST, and why it changed. `promote` used to close a recurring lesson once its rule text
 * had LANDED in a contract: token on disk, parity gate green, ledger line collapsed to a stub. The
 * owner's stop-the-line directive (`~/.claude/CLAUDE.md`, "STOP THE LINE ON THE SECOND OCCURRENCE")
 * ruled that insufficient on measurement — `measurement-failure-is-not-a-zero` recurred an eighth time
 * with its rule already promoted into both contracts — so closing now requires EITHER a mechanism whose
 * own selftest is RUN and seen to pass, OR a written reason why no mechanism is possible.
 *
 * EVERY STATE THE DECISION RANGES OVER IS EXERCISED, in both directions: refused with no closure, with a
 * mechanism path that does not exist, with one that has no selftest, with one whose selftest fails, with
 * one that never names the lesson, with both flags, with a reason too thin to be a reason, and with the
 * rule text still missing; closed with a passing mechanism and with a recorded reason. A mechanism that
 * is only ever refused has not been shown to decide anything.
 *
 * "RUNS", NOT "EXISTS". One case's selftest writes a sentinel file; the case passes only if that file is
 * on disk afterwards, so a `promote` that merely checked for a `selftest.mjs` could not satisfy it.
 *
 * FIXTURES ARE CONSTRUCTED, NEVER LIVE. `capture.mjs` derives every path from its own location and from
 * the home directory, so each case copies it into a fresh temporary repository and runs it with `HOME`
 * and `USERPROFILE` pointed at a fresh temporary home. The real ledger, contracts and incident log are
 * never read or written.
 *
 * @es Prueba de DISCRIMINACIÓN de `capture.mjs promote`. Antes cerraba una lección recurrente en cuanto
 * el texto de la regla ATERRIZABA; la directiva de parar la línea lo dictaminó insuficiente con medición,
 * así que cerrar exige un mecanismo cuyo selftest se EJECUTA y pasa, o un motivo escrito de por qué no
 * cabe ninguno. Se ejercita cada estado en ambas direcciones; «EJECUTA» se prueba con un fichero
 * centinela; y los fixtures se CONSTRUYEN en un repositorio y un home temporales.
 */

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { contractFileId } from './closure.mjs';
import { holdsWholeLine } from './conservation.mjs';
import { provisionLoop, worldEnv } from './fixture-loop.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('failure-capture');

const KEY = 'lesson-under-test';
const REASON = 'a claim written in prose cannot be detected by any hook; measured 0 of 6 recall';
const scratch = mkdtempSync(path.join(os.tmpdir(), 'failure-capture-selftest-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) {
    passed += 1;

    return;
  }

  failures.push(`${name}${detail === undefined ? '' : ` — ${detail}`}`);
}

/** Writes `files` (relative POSIX path -> contents) under `root`. @es Escribe `files` bajo `root`. */
function write(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, ...relative.split('/'));

    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
}

/** A passing, a failing and a sentinel-writing selftest, as source. @es Selftests que pasan, fallan o escriben un centinela. */
const PASSING_SELFTEST = 'process.stdout.write("1/1 passed\\n");\nprocess.exit(0);\n';
const FAILING_SELFTEST = 'process.stdout.write("0/1 passed\\n");\nprocess.exit(1);\n';
const SENTINEL_SELFTEST = 'import { writeFileSync } from "node:fs";\nimport path from "node:path";\nwriteFileSync(path.join(import.meta.dirname, "selftest-ran.txt"), "ran", "utf8");\nprocess.exit(0);\n';

/**
 * A fresh world: a repository holding a copy of the loop under test and four candidate mechanisms, and a
 * home holding a ledger that carries `KEY` twice-recurred plus an orchestrator contract. `ruleLanded`
 * controls whether the rule's token is in `CLAUDE.md`, so the pre-existing token check stays exercised.
 * @es Un mundo nuevo: repositorio con copia del loop y cuatro mecanismos candidatos, y un home con el
 * ledger (clave recurrida dos veces) y el contrato del orquestador.
 */
function world(name, { ruleLanded = true, incidents, mentions = 1, inLedger = true } = {}) {
  const root = path.join(scratch, name);
  const repo = path.join(root, 'repo');
  const home = path.join(root, 'home');
  const loop = path.join(repo, '.claude', 'failure-capture');

  mkdirSync(path.join(loop, 'state'), { recursive: true });

  provisionLoop(loop, (file) => file !== 'selftest.mjs');

  write(repo, {
    // The repository is a PROJECT (`project.mjs`): it holds `.claude/CLAUDE.md`, and its config names the
    // scope the b100 cases below were written against.
    // @es El repositorio es un PROYECTO: tiene `.claude/CLAUDE.md` y su config nombra el alcance.
    '.claude/CLAUDE.md': '# Project instructions\n',
    '.claude/failure-capture.json': JSON.stringify({ scope: 'b100-am-ui' }),
    '.claude/failure-capture/state/incidents.jsonl': `${(incidents ?? [{ key: KEY, actor: 'orchestrator', lesson: 'x', date: '2026-09-14' }]).map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    '.claude/good-guard/guard.mjs': `// closes ${KEY}\n`,
    '.claude/good-guard/selftest.mjs': SENTINEL_SELFTEST,
    '.claude/red-guard/guard.mjs': `// closes ${KEY}\n`,
    '.claude/red-guard/selftest.mjs': FAILING_SELFTEST,
    '.claude/untested-guard/guard.mjs': `// closes ${KEY}\n`,
    '.claude/unrelated-guard/guard.mjs': '// closes some other lesson entirely\n',
    '.claude/unrelated-guard/selftest.mjs': PASSING_SELFTEST,
    // A mechanism that SHARES its directory carries a proof named after it — the `fleet-env/` spelling.
    // @es Un mecanismo que COMPARTE directorio lleva una prueba con su nombre.
    '.claude/module-guard/delivery.mjs': `// closes ${KEY}\n`,
    '.claude/module-guard/delivery.selftest.mjs': SENTINEL_SELFTEST,
    '.claude/module-guard/selftest.mjs': PASSING_SELFTEST,
    // The same, with the module-named proof RED and a green one beside it: proof-shopping.
    // @es Igual, con la prueba propia en ROJO y otra verde al lado: ir de compras de pruebas.
    '.claude/shopping-guard/delivery.mjs': `// closes ${KEY}\n`,
    '.claude/shopping-guard/delivery.selftest.mjs': FAILING_SELFTEST,
    '.claude/shopping-guard/selftest.mjs': PASSING_SELFTEST,
  });

  write(home, {
    '.claude/lessons-ledger.md': inLedger
      ? `# Lessons Ledger\n\n---\n- [global] 2026-09-14 — a lesson that recurred -> RULE: do the thing <!--fc:${KEY}#2-->\n`
      : '# Lessons Ledger\n\n---\n- [global] 2026-09-14 — an unrelated lesson <!--fc:another-lesson#2-->\n',
    // `mentions` is how many PARAGRAPHS name the key — the convention this project uses to add a new
    // FACE to a promoted rule, and what the growth check counts.
    // @es `mentions` son los párrafos que nombran la clave: la convención con la que se añade una CARA.
    // El contrato del orquestador vive desde el 2026-09-28 en `~/.claude/rules/promoted-rules.md`, no en
    // CLAUDE.md. Un CLAUDE.md que nombra la clave NO debe bastar: se escribe igual para probarlo.
    '.claude/rules/promoted-rules.md': ruleLanded ? `# Contract\n\n${Array.from({ length: mentions }, (_, at) => `- ${KEY}: face ${String(at + 1)}, written down.`).join('\n')}\n` : '# Contract\n',
    '.claude/CLAUDE.md': `# Old home of the contract\n\n- ${KEY}: named here, which no longer counts as landed.\n`,
  });

  return { repo, home, loop };
}

/** Today as YYYY-MM-DD in local time, the way `capture.mjs` dates a promotion. @es Hoy como AAAA-MM-DD en hora local, como fecha `capture.mjs` una promoción. */
const todayLocal = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** The evidence file a world's home ledger archives `KEY` to, read as it is on disk. @es La evidencia de `KEY` del ledger del home de un mundo. */
const homeEvidence = (target) => {
  const file = path.join(target.home, '.claude', 'lessons', 'evidence', `${KEY}.md`);

  return existsSync(file) ? readFileSync(file, 'utf8') : '';
};

/** Runs `promote` inside a world and returns `{ status, out, ledger, incidents, promoted }`. @es Ejecuta `promote` en un mundo. */
function promote(target, extraArgs) {
  let status = 0;
  let out = '';

  try {
    out = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'promote', '--key', KEY, ...extraArgs], {
      cwd: target.repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: worldEnv(target.home, { loop: target.loop }),
      timeout: 60_000,
    });
  } catch (error) {
    status = typeof error?.status === 'number' ? error.status : 'did-not-run';
    out = `${error?.stdout ?? ''}${error?.stderr ?? ''}`;
  }

  const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

  return {
    status,
    out,
    ledger: read(path.join(target.home, '.claude', 'lessons-ledger.md')),
    // The stub of a global lesson is in the file the harness does not load (`ledger-routes.mjs`). @es El muñón de una lección global está en el fichero que el harness no carga.
    stubs: read(path.join(target.home, '.claude', 'lessons-promoted.md')),
    incidents: read(path.join(target.loop, 'state', 'incidents.jsonl')),
    promoted: read(path.join(target.loop, 'state', 'promoted.md')),
  };
}

/** Asserts a refusal: non-zero, the ledger line untouched, and the stated reason on the output. @es Afirma una negativa. */
function refused(name, run, fragment) {
  check(`${name}: refused (non-zero exit)`, run.status === 1, `exit ${run.status}: ${run.out.trim().slice(0, 300)}`);
  check(`${name}: the ledger line is NOT collapsed to a stub`, !run.ledger.includes('[promoted]'), run.ledger);
  check(`${name}: the refusal says why ("${fragment}")`, run.out.includes(fragment), run.out.trim().slice(0, 400));
}

// ---------------------------------------------------------------------------------------------
// REFUSED
// ---------------------------------------------------------------------------------------------

{
  const run = promote(world('no-closure'), []);

  refused('no closure given', run, '--mechanism');
  check('no closure given: the refusal names the other option too', run.out.includes('--no-mechanism'), run.out.trim().slice(0, 400));
}

refused('a mechanism path that does not exist', promote(world('missing-path'), ['--mechanism', '.claude/no-such-guard/guard.mjs']), 'does not exist');

refused('a mechanism whose selftest FAILS', promote(world('red-selftest'), ['--mechanism', '.claude/red-guard/guard.mjs']), 'exited 1');

refused('a mechanism with no selftest beside it', promote(world('untested'), ['--mechanism', '.claude/untested-guard/guard.mjs']), 'no selftest');

refused('a passing mechanism that never names the lesson', promote(world('unrelated'), ['--mechanism', '.claude/unrelated-guard/guard.mjs']), `never names "${KEY}"`);

refused('both a mechanism and a no-mechanism reason', promote(world('both'), ['--mechanism', '.claude/good-guard/guard.mjs', '--no-mechanism', REASON]), 'not both');

refused('a no-mechanism reason too short to be a reason', promote(world('thin-reason'), ['--no-mechanism', 'none']), 'reason');

refused('a reason spanning two lines, which would orphan the one-line ledger entry', promote(world('two-line-reason'), ['--no-mechanism', `${REASON}\nsecond line`]), 'one line');

refused('a flag given with no value', promote(world('bare-flag'), ['--mechanism']), '--mechanism');

refused(
  'a key that appears in no ledger line at all — there is no lesson to close',
  promote(world('not-a-lesson', { inLedger: false }), ['--mechanism', '.claude/good-guard/guard.mjs']),
  'is not a lesson in the ledger'
);

refused(
  'a mechanism whose OWN proof is red, with a green selftest.mjs beside it (no proof-shopping)',
  promote(world('proof-shopping'), ['--mechanism', '.claude/shopping-guard/delivery.mjs']),
  'exited 1'
);

refused(
  'the rule text has not landed, even with a passing mechanism — the old token check still binds',
  promote(world('rule-missing', { ruleLanded: false }), ['--mechanism', '.claude/good-guard/guard.mjs']),
  'has not actually landed'
);

{
  // Another writer holds the ledger lock: promote stands aside, in both languages, writing nothing.
  // @es Otro escritor tiene el lock del ledger: promote se aparta, en ambos idiomas, sin escribir nada.
  const target = world('ledger-locked');

  write(target.loop, { 'state/ledger.lock': '' });

  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);
  refused('the ledger is locked by another writer', run, 'the ledger is locked by another writer');
  check('the locked ledger: the refusal is bilingual and says nothing was changed', run.out.includes(' @es ') && run.out.includes('Nothing was changed'), run.out.trim().slice(0, 400));
  check('the locked ledger: no closure is recorded and the holder\'s lock is untouched', run.promoted === '' && !run.incidents.includes('"kind":"promotion"') && existsSync(path.join(target.loop, 'state', 'ledger.lock')), run.incidents);
}

{
  // A line is written to the ledger while promote waits for the lock: promote must read the ledger only
  // once it holds the lock, or it writes back its stale copy and the line is lost. The wait is bounded
  // (promote gives up after two seconds) and the late write comes well inside it.
  // @es Se escribe una línea en el ledger mientras promote espera el lock: promote debe leer el ledger solo
  // cuando ya tiene el lock, o reescribe su copia vieja y la línea se pierde. La espera está acotada.
  const target = world('ledger-changed-while-waiting');
  const ledgerFile = path.join(target.home, '.claude', 'lessons-ledger.md');
  const late = '- [global] 2026-09-30 — a lesson captured while promote waited -> RULE: keep me <!--fc:late-lesson#1-->';

  write(target.loop, { 'state/ledger.lock': '' });

  const child = spawn(process.execPath, [path.join(target.loop, 'capture.mjs'), 'promote', '--key', KEY, '--mechanism', '.claude/good-guard/guard.mjs'], { cwd: target.repo, stdio: 'ignore', env: worldEnv(target.home, { loop: target.loop }) });
  const closed = new Promise((resolve) => child.on('close', resolve));

  await new Promise((resolve) => setTimeout(resolve, 1200));
  appendFileSync(ledgerFile, `${late}\n`, 'utf8');
  rmSync(path.join(target.loop, 'state', 'ledger.lock'), { force: true });

  const status = await closed;
  const after = readFileSync(ledgerFile, 'utf8');
  const stubs = readFileSync(path.join(path.dirname(ledgerFile), 'lessons-promoted.md'), 'utf8');

  check('promote that waited for the lock closes the lesson', status === 0 && stubs.includes('[promoted]') && stubs.includes('<!--fc:lesson-under-test#2-->') && !after.includes('<!--fc:lesson-under-test#'), `exit ${String(status)}: ${after}\n${stubs}`);
  check('...and keeps the line written while it waited, because it read the ledger under the lock', after.includes('<!--fc:late-lesson#1-->'), after);
}

{
  // No state directory, so the lock file cannot be created: the refusal names that, not contention.
  // @es Sin directorio de estado no se puede crear el lock: la negativa nombra eso, no una contienda.
  const target = world('no-state-dir');

  rmSync(path.join(target.loop, 'state'), { recursive: true, force: true });

  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('a lock that cannot be created is refused with its real cause, not as contention', run.status !== 0 && run.out.includes('could not be created') && run.out.includes('ENOENT') && !run.out.includes('locked by another writer'), `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
  check('...in both languages, and the ledger line is not collapsed', run.out.includes(' @es ') && !run.ledger.includes('[promoted]'), run.out.trim().slice(0, 400));
}

// ---------------------------------------------------------------------------------------------
// THE TEXT MUST GROW WHEN THE LESSON COMES BACK (`promotion-to-contract-read-as-prevention`)
// ---------------------------------------------------------------------------------------------

/** An incident and a closure of it, so a world can describe a lesson that was promoted and RECURRED. @es Un incidente y su cierre. */
// `file` is the contract file the count was measured on; by default the one the named world will compare.
// @es `file` es el fichero sobre el que se midió la cuenta; por defecto, el que comparará el mundo nombrado.
const contractOf = (name) => contractFileId(path.join(scratch, name, 'home', '.claude', 'rules', 'promoted-rules.md'));
const promotedOn = (name, at, faces, file = contractOf(name)) => ({ kind: 'promotion', key: KEY, target: 'claude-md', faces: { [file]: faces }, date: at.slice(0, 10), at });
const recurredOn = (at) => ({ key: KEY, actor: 'orchestrator', lesson: 'it came back', date: at.slice(0, 10), at });

refused(
  'a key that recurred after its closure, re-promoted over UNCHANGED text',
  promote(world('stale-text', { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), promotedOn('stale-text', '2026-09-02T10:00:00.000Z', 1), recurredOn('2026-09-03T10:00:00.000Z')], mentions: 1 }), ['--mechanism', '.claude/good-guard/guard.mjs']),
  'has not grown'
);

{
  const target = world('grown-text', { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), promotedOn('grown-text', '2026-09-02T10:00:00.000Z', 1), recurredOn('2026-09-03T10:00:00.000Z')], mentions: 2 });
  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('...but the same recurrence closes once the text names the new face', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
}

{
  const target = world('no-recurrence', { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), promotedOn('no-recurrence', '2026-09-02T10:00:00.000Z', 1)], mentions: 1 });
  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('NEAR MISS: re-closing an old promotion with a MECHANISM, with no recurrence since, is not blocked', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
}

{
  const legacy = { kind: 'promotion', key: KEY, target: 'claude-md', date: '2026-09-02', at: '2026-09-02T10:00:00.000Z' };
  const target = world('legacy-closure', { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), legacy, recurredOn('2026-09-03T10:00:00.000Z')], mentions: 1 });
  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('NEAR MISS: a closure recorded before token counts existed demands nothing (it knows no baseline)', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
}

// A baseline is only comparable on the SAME file (2026-09-30: counts taken on two different files made a
// grown text read as "2 vs 3"). @es Una línea base solo es comparable sobre el MISMO fichero.
{
  const target = world('other-file-baseline', { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), promotedOn('other-file-baseline', '2026-09-02T10:00:00.000Z', 3, contractFileId(path.join(scratch, 'elsewhere', 'AGENT-LEDGER.md'))), recurredOn('2026-09-03T10:00:00.000Z')], mentions: 2 });
  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('NEAR MISS: a baseline measured on ANOTHER file (3) must not refuse a text that grew here (2)', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
}

{
  const name = 'newest-same-file';
  const incidents = [recurredOn('2026-09-01T10:00:00.000Z'), promotedOn(name, '2026-09-02T10:00:00.000Z', 1), promotedOn(name, '2026-09-04T10:00:00.000Z', 3), recurredOn('2026-09-05T10:00:00.000Z')];

  refused('the baseline is the NEWEST same-file closure (3), not an older one (1) the text has outgrown', promote(world(name, { incidents, mentions: 2 }), ['--mechanism', '.claude/good-guard/guard.mjs']), 'has not grown');
}

{
  const name = 'legacy-does-not-shadow';
  const legacy = { kind: 'promotion', key: KEY, target: 'claude-md', tokenCount: 5, date: '2026-09-04', at: '2026-09-04T10:00:00.000Z' };
  const incidents = [recurredOn('2026-09-01T10:00:00.000Z'), promotedOn(name, '2026-09-02T10:00:00.000Z', 1), legacy, recurredOn('2026-09-05T10:00:00.000Z')];

  refused('a NEWER legacy closure (no file) neither shadows nor replaces the file-tagged baseline: 1 vs 1 still refuses', promote(world(name, { incidents, mentions: 1 }), ['--mechanism', '.claude/good-guard/guard.mjs']), 'has not grown');
}

{
  const name = 'legacy-with-count-only';
  const legacy = { kind: 'promotion', key: KEY, target: 'claude-md', tokenCount: 3, date: '2026-09-02', at: '2026-09-02T10:00:00.000Z' };
  const run = promote(world(name, { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), legacy, recurredOn('2026-09-03T10:00:00.000Z')], mentions: 2 }), ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('legacy record WITH a count but no file is no baseline for any file: a grown text (2) is not refused against it (3)', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
}

{
  const name = 'file-without-count';
  const pre = { kind: 'promotion', key: KEY, target: 'claude-md', date: '2026-09-02', at: '2026-09-02T10:00:00.000Z' };
  const run = promote(world(name, { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), pre, recurredOn('2026-09-03T10:00:00.000Z')], mentions: 1 }), ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('NEAR MISS: a record with no faces has no baseline either', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
}

// ---------------------------------------------------------------------------------------------
// CLOSED
// ---------------------------------------------------------------------------------------------

{
  const target = world('mechanism');
  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('a passing mechanism closes the lesson (exit 0)', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
  check('...and its selftest was RUN, not merely found (the sentinel it writes is on disk)', existsSync(path.join(target.repo, '.claude', 'good-guard', 'selftest-ran.txt')), 'no sentinel');
  check('...the ledger stub names the mechanism', run.stubs.includes('[promoted]') && run.stubs.includes('.claude/good-guard/guard.mjs'), run.stubs);
  // Changed on purpose with `ledger-tiering-budget`: the stub is the MINIMAL one (date, key, mechanism path,
  // marker), not the old long sentence, and the full line is archived in evidence. @es Cambiado a propósito.
  check('...and the stub is EXACTLY the minimal one: promotion date, key, mechanism path, the original marker', run.stubs.split('\n').includes(`- [promoted] ${todayLocal()} — ${KEY}: mechanism .claude/good-guard/guard.mjs <!--fc:${KEY}#2-->`), run.stubs);
  check('...the line it replaced is archived WHOLE in the evidence file beside the ledger, with the closure note', holdsWholeLine(homeEvidence(target), `- [global] 2026-09-14 — a lesson that recurred -> RULE: do the thing <!--fc:${KEY}#2-->`) && homeEvidence(target).includes('closed by mechanism .claude/good-guard/guard.mjs (selftest run, exit 0)'), homeEvidence(target));
  check('...and nothing is written to the old state/promoted.md: the evidence store is the one place', run.promoted === '', run.promoted);
  check('...the incident log records the closure with the selftest exit code', run.incidents.includes('"mechanism":".claude/good-guard/guard.mjs"') && run.incidents.includes('"selftestExit":0'), run.incidents);
  // Without this figure the NEXT promotion has no baseline to compare the contract text against, so the
  // growth check silently stops demanding anything. @es Sin esta cifra, la próxima promoción no tiene
  // línea base y la comprobación de crecimiento deja de exigir nada en silencio.
  check('...and the FACES of the contract text AT THIS CLOSURE, keyed by the one normalised spelling of the file the comparison uses', run.incidents.includes(`"faces":{${JSON.stringify(contractOf('mechanism'))}:1}`), run.incidents);
}

{
  const target = world('module-named');
  const run = promote(target, ['--mechanism', '.claude/module-guard/delivery.mjs']);

  check('a module-named proof closes the lesson (exit 0)', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
  check('...and it was the MODULE-NAMED one that RAN (its sentinel is on disk)', existsSync(path.join(target.repo, '.claude', 'module-guard', 'selftest-ran.txt')), 'no sentinel');
}

{
  const target = world('reason');
  const run = promote(target, ['--no-mechanism', REASON]);

  check('a written reason closes the lesson (exit 0)', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
  // Changed on purpose with `ledger-tiering-budget`: the reason is no longer in the ledger stub (that is what
  // made every promotion regrow the always-loaded set); it is VERBATIM in the evidence file, and the stub
  // says only that there is no mechanism. @es Cambiado a propósito: el motivo ya no va en el muñón.
  check('...the ledger stub says only "no mechanism": the reason is NOT in it', run.stubs.split('\n').includes(`- [promoted] ${todayLocal()} — ${KEY}: no mechanism <!--fc:${KEY}#2-->`) && !run.stubs.includes(REASON) && !run.ledger.includes(REASON), run.stubs);
  check('...the reason is in the evidence file VERBATIM, beside the archived original', homeEvidence(target).includes(`no mechanism is possible: ${REASON}`) && holdsWholeLine(homeEvidence(target), `- [global] 2026-09-14 — a lesson that recurred -> RULE: do the thing <!--fc:${KEY}#2-->`), homeEvidence(target));
  check('...and in the incident log VERBATIM', run.incidents.includes(JSON.stringify(REASON)), run.incidents);

  // A closure record shares the incident log; `status` must still count incidents, not closures.
  // @es Un registro de cierre comparte el log; `status` debe seguir contando incidentes, no cierres.
  const status = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'status'], { cwd: target.repo, encoding: 'utf8', env: worldEnv(target.home, { loop: target.loop }) });

  check('...and status counts the one incident, not the closure record beside it', status.includes('incidents recorded: 1'), status);
  check('...and status no longer lists the promoted lesson as due: the stub in the ledger says it landed', !status.includes('PROMOTION DUE'), status);
}

{
  // The same ledger BEFORE any promotion owes one (count 2), so the assertion above is not vacuous; and a
  // promotion recorded by the OLD tool in `state/promoted.md` is still honoured, read-only.
  // @es El mismo ledger ANTES de promover debe una promoción, así la aserción anterior no es vacía; y una
  // promoción registrada por la herramienta ANTIGUA en `state/promoted.md` se sigue respetando.
  const statusOf = (target) => execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'status'], { cwd: target.repo, encoding: 'utf8', env: worldEnv(target.home, { loop: target.loop }) });
  const before = world('status-due');
  const legacy = world('status-legacy');

  write(legacy.loop, { 'state/promoted.md': `2026-09-01 — ${KEY} -> the contract; closed by mechanism x\n- [global] old line\n\n` });

  check('status lists a recurred, unpromoted lesson as due', statusOf(before).includes(`PROMOTION DUE`) && statusOf(before).includes(KEY), statusOf(before));
  check('status still honours a promotion recorded in the old state/promoted.md', !statusOf(legacy).includes('PROMOTION DUE'), statusOf(legacy));

  // The pre-shortening shape of a promoted line: the long sentence the old `promote` wrote. It IS a promotion
  // (only `promote` writes the `[promoted]` label), so status treats it as landed and never as due.
  // @es La forma anterior de una línea promovida: la frase larga de la `promote` antigua. ES una promoción
  // (solo `promote` escribe la etiqueta `[promoted]`), así que status la da por aterrizada y nunca por pendiente.
  const fat = world('status-fat-promoted');

  write(fat.home, { '.claude/lessons-ledger.md': `# Lessons Ledger\n\n---\n- [promoted] 2026-09-01 — ${KEY}: now a binding rule in ~/.claude/rules/promoted-rules.md; closed by mechanism x (selftest run, exit 0); full incident history in y <!--fc:${KEY}#2-->\n` });

  check('status treats a legacy FAT [promoted] ledger line as landed, not due', statusOf(fat).includes('keyed lessons: 1') && !statusOf(fat).includes('PROMOTION DUE'), statusOf(fat));
}

{
  // The archive cannot be written (its path is a DIRECTORY): promote refuses in both languages, changes
  // nothing in the ledger and records no closure — the line is never shortened without its archive.
  // @es El archivo no se puede escribir (su ruta es un DIRECTORIO): promote se niega, en ambos idiomas, sin
  // cambiar el ledger ni registrar el cierre: la línea nunca se acorta sin su archivo.
  const target = world('evidence-unwritable');

  mkdirSync(path.join(target.home, '.claude', 'lessons', 'evidence', `${KEY}.md`), { recursive: true });

  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('an unwritable archive refuses the promotion (exit 1) and names why', run.status === 1 && run.out.includes('could not be written') && run.out.includes('not promoted'), `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
  check('...in both languages', run.out.includes(' @es ') && run.out.includes('no se promovió'), run.out.trim().slice(0, 400));
  check('...the ledger is byte-identical and no closure is recorded', !run.ledger.includes('[promoted]') && run.ledger.includes('- [global] 2026-09-14 — a lesson that recurred') && !run.incidents.includes('"kind":"promotion"'), run.ledger);
}

// ---------------------------------------------------------------------------------------------
// ALCANCE: cada lección va al ledger de su alcance, y una clave existente se suma donde ya está
// (`ledgers.mjs`). Desde el 2026-09-28 las lecciones de b100 viven en el proyecto, no en el home.
// ---------------------------------------------------------------------------------------------

{
  const target = world('scope-routing');
  const capture = (key, scope) =>
    execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'capture', '--key', key, '--scope', scope, '--actor', 'orchestrator', '--lesson', `what went wrong for ${key} -> root cause -> RULE: do it right`], {
      cwd: target.repo,
      encoding: 'utf8',
      env: worldEnv(target.home, { loop: target.loop }),
    });
  const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
  const homeLedger = () => read(path.join(target.home, '.claude', 'lessons-ledger.md'));
  const repoLedger = () => read(path.join(target.repo, '.claude', 'lessons-ledger.md'));

  capture('project-only-lesson', 'b100-am-ui');
  check('alcance: una lección b100 NUEVA entra al ledger del PROYECTO', repoLedger().includes('<!--fc:project-only-lesson#1-->'), repoLedger());
  check('alcance: ...y NO al del home', !homeLedger().includes('project-only-lesson'), homeLedger());
  check('alcance: el ledger nuevo del proyecto nace con encabezado que dice quién lo carga', repoLedger().startsWith('# Lessons Ledger — b100-am-ui') && repoLedger().includes('.claude/CLAUDE.md'), repoLedger().slice(0, 200));

  capture('global-new-lesson', 'global');
  check('alcance: una lección global NUEVA entra al ledger del HOME', homeLedger().includes('<!--fc:global-new-lesson#1-->') && !repoLedger().includes('global-new-lesson'), homeLedger());

  capture(KEY, 'b100-am-ui');
  check('alcance: la recurrencia de una clave del home se suma EN EL HOME aunque llegue con alcance b100', homeLedger().includes(`<!--fc:${KEY}#3-->`) && !repoLedger().includes(KEY), `${homeLedger()}\n---\n${repoLedger()}`);

  capture('project-only-lesson', 'global');
  check('alcance: la recurrencia de una clave del proyecto se suma EN EL PROYECTO aunque llegue con alcance global', repoLedger().includes('<!--fc:project-only-lesson#2-->') && !homeLedger().includes('project-only-lesson'), repoLedger());

  const keys = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'keys'], { cwd: target.repo, encoding: 'utf8', env: worldEnv(target.home, { loop: target.loop }) });
  check('alcance: `keys` lista las claves de LOS DOS ledgers', keys.includes('project-only-lesson') && keys.includes('global-new-lesson') && keys.includes(KEY), keys);
}

{
  const target = world('promote-in-project');
  write(target.repo, { '.claude/lessons-ledger.md': `# Lessons Ledger — b100-am-ui\n\n---\n- [b100-am-ui] 2026-09-20 — project lesson -> RULE: x <!--fc:project-promoted#2-->\n` });
  // A project lesson is promoted into the PROJECT's contract, not the global rules file (`promotion-target.mjs`).
  // @es Una lección de proyecto se promueve al contrato del PROYECTO, no al fichero global de reglas.
  write(target.repo, { '.claude/CLAUDE.md': '# Project instructions\n\n- project-promoted: written down.\n' });
  const run = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'promote', '--key', 'project-promoted', '--no-mechanism', REASON], {
    cwd: target.repo,
    encoding: 'utf8',
    env: worldEnv(target.home, { loop: target.loop }),
  });
  const repoLedger = readFileSync(path.join(target.repo, '.claude', 'lessons-ledger.md'), 'utf8');

  check('alcance: promover una clave del ledger del PROYECTO colapsa SU línea, en SU archivo', repoLedger.includes('[promoted]') && repoLedger.includes('project-promoted'), `${run}\n${repoLedger}`);

  const projectStatus = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'status'], { cwd: target.repo, encoding: 'utf8', env: worldEnv(target.home, { loop: target.loop }) });

  check('alcance: ...y `status` ve el muñón del ledger del PROYECTO: la clave ya no está pendiente', projectStatus.includes('keyed lessons') && !projectStatus.includes('project-promoted (2x)'), projectStatus);

  const projectEvidence = path.join(target.repo, '.claude', 'lessons', 'evidence', 'project-promoted.md');

  check('alcance: ...y archiva la línea original en la evidencia junto al ledger del PROYECTO, no en la del home', existsSync(projectEvidence) && readFileSync(projectEvidence, 'utf8').includes('- [b100-am-ui] 2026-09-20 — project lesson -> RULE: x <!--fc:project-promoted#2-->') && !existsSync(path.join(target.home, '.claude', 'lessons', 'evidence', 'project-promoted.md')), existsSync(projectEvidence) ? readFileSync(projectEvidence, 'utf8') : 'no evidence file');
}

// ---------------------------------------------------------------------------------------------
// SESSION STAMP: the replay of the 2026-09-30 incident. A lesson recorded WITHOUT `--session` was stamped
// `unknown`, and the Stop guard for that very session answered "nothing recorded". The stamp now comes from
// `CLAUDE_CODE_SESSION_ID` (which the harness exports to every shell); without it the old refusal must stand.
// @es SELLO DE SESIÓN: la reproducción del incidente del 2026-09-30. Sin `--session` el sello quedaba en
// `unknown` y el guard de Stop de esa misma sesión decía «nada registrado».
// ---------------------------------------------------------------------------------------------

{
  const target = world('session-stamp');
  const { CLAUDE_CODE_SESSION_ID: _inherited, ...envWithoutSession } = process.env;
  const baseEnv = worldEnv(target.home, { loop: target.loop, base: envWithoutSession });
  const captureAs = (key, session) =>
    execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'capture', '--key', key, '--scope', 'global', '--actor', 'orchestrator', '--lesson', `what went wrong for ${key} -> root cause -> RULE: stamp the session`], {
      cwd: target.repo,
      encoding: 'utf8',
      env: session === undefined ? baseEnv : { ...baseEnv, CLAUDE_CODE_SESSION_ID: session },
    });
  const stopFor = (session) =>
    execFileSync(process.execPath, [path.join(target.loop, 'turn-guard.mjs')], {
      cwd: target.repo,
      encoding: 'utf8',
      input: JSON.stringify({ session_id: session, hook_event_name: 'Stop', stop_hook_active: false, cwd: target.repo, last_assistant_message: 'I was wrong about the stamp: me equivoqué, the capture went to the other store.' }),
      env: baseEnv,
    });

  captureAs('session-from-harness', 'replay-session-a');
  const allowed = stopFor('replay-session-a');
  check('sello: una captura sin --session, con CLAUDE_CODE_SESSION_ID, deja terminar el turno de ESA sesión', allowed.trim() === '', allowed);

  captureAs('session-unknown', undefined);
  const refused = stopFor('replay-session-b');
  check('sello: sin --session ni CLAUDE_CODE_SESSION_ID el sello no es de esta sesión y el turno sigue bloqueado', refused.includes('block'), refused);
}

process.stdout.write(`failure-capture selftest: ${passed} passed, ${failures.length} failed\n`);

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);

process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
