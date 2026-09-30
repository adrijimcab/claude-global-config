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

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEY = 'lesson-under-test';
const REASON = 'a claim written in prose cannot be detected by any hook; measured 0 of 6 recall';
const scratch = mkdtempSync(path.join(os.tmpdir(), 'failure-capture-selftest-'));

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

  for (const file of readdirSync(HERE)) {
    if (file.endsWith('.mjs') && file !== 'selftest.mjs') copyFileSync(path.join(HERE, file), path.join(loop, file));
  }

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

/** Runs `promote` inside a world and returns `{ status, out, ledger, incidents, promoted }`. @es Ejecuta `promote` en un mundo. */
function promote(target, extraArgs) {
  let status = 0;
  let out = '';

  try {
    out = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'promote', '--key', KEY, ...extraArgs], {
      cwd: target.repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOME: target.home, USERPROFILE: target.home },
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

// ---------------------------------------------------------------------------------------------
// THE TEXT MUST GROW WHEN THE LESSON COMES BACK (`promotion-to-contract-read-as-prevention`)
// ---------------------------------------------------------------------------------------------

/** An incident and a closure of it, so a world can describe a lesson that was promoted and RECURRED. @es Un incidente y su cierre. */
const promotedOn = (at, tokenCount) => ({ kind: 'promotion', key: KEY, target: 'claude-md', tokenCount, date: at.slice(0, 10), at });
const recurredOn = (at) => ({ key: KEY, actor: 'orchestrator', lesson: 'it came back', date: at.slice(0, 10), at });

refused(
  'a key that recurred after its closure, re-promoted over UNCHANGED text',
  promote(world('stale-text', { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), promotedOn('2026-09-02T10:00:00.000Z', 1), recurredOn('2026-09-03T10:00:00.000Z')], mentions: 1 }), ['--mechanism', '.claude/good-guard/guard.mjs']),
  'has not grown'
);

{
  const target = world('grown-text', { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), promotedOn('2026-09-02T10:00:00.000Z', 1), recurredOn('2026-09-03T10:00:00.000Z')], mentions: 2 });
  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('...but the same recurrence closes once the text names the new face', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
}

{
  const target = world('no-recurrence', { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), promotedOn('2026-09-02T10:00:00.000Z', 1)], mentions: 1 });
  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('NEAR MISS: re-closing an old promotion with a MECHANISM, with no recurrence since, is not blocked', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
}

{
  const legacy = { kind: 'promotion', key: KEY, target: 'claude-md', date: '2026-09-02', at: '2026-09-02T10:00:00.000Z' };
  const target = world('legacy-closure', { incidents: [recurredOn('2026-09-01T10:00:00.000Z'), legacy, recurredOn('2026-09-03T10:00:00.000Z')], mentions: 1 });
  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('NEAR MISS: a closure recorded before token counts existed demands nothing (it knows no baseline)', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
}

// ---------------------------------------------------------------------------------------------
// CLOSED
// ---------------------------------------------------------------------------------------------

{
  const target = world('mechanism');
  const run = promote(target, ['--mechanism', '.claude/good-guard/guard.mjs']);

  check('a passing mechanism closes the lesson (exit 0)', run.status === 0, `exit ${run.status}: ${run.out.trim().slice(0, 400)}`);
  check('...and its selftest was RUN, not merely found (the sentinel it writes is on disk)', existsSync(path.join(target.repo, '.claude', 'good-guard', 'selftest-ran.txt')), 'no sentinel');
  check('...the ledger stub names the mechanism', run.ledger.includes('[promoted]') && run.ledger.includes('.claude/good-guard/guard.mjs'), run.ledger);
  check('...the incident log records the closure with the selftest exit code', run.incidents.includes('"mechanism":".claude/good-guard/guard.mjs"') && run.incidents.includes('"selftestExit":0'), run.incidents);
  // Without this figure the NEXT promotion has no baseline to compare the contract text against, so the
  // growth check silently stops demanding anything. @es Sin esta cifra, la próxima promoción no tiene
  // línea base y la comprobación de crecimiento deja de exigir nada en silencio.
  check('...and the token count of the contract text AT THIS CLOSURE, which the next promotion measures against', run.incidents.includes('"tokenCount":1'), run.incidents);
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
  check('...the reason is in the ledger stub VERBATIM', run.ledger.includes('[promoted]') && run.ledger.includes(REASON), run.ledger);
  check('...and in the incident log VERBATIM', run.incidents.includes(JSON.stringify(REASON)), run.incidents);

  // A closure record shares the incident log; `status` must still count incidents, not closures.
  // @es Un registro de cierre comparte el log; `status` debe seguir contando incidentes, no cierres.
  const status = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'status'], { cwd: target.repo, encoding: 'utf8', env: { ...process.env, HOME: target.home, USERPROFILE: target.home } });

  check('...and status counts the one incident, not the closure record beside it', status.includes('incidents recorded: 1'), status);
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
      env: { ...process.env, HOME: target.home, USERPROFILE: target.home },
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

  const keys = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'keys'], { cwd: target.repo, encoding: 'utf8', env: { ...process.env, HOME: target.home, USERPROFILE: target.home } });
  check('alcance: `keys` lista las claves de LOS DOS ledgers', keys.includes('project-only-lesson') && keys.includes('global-new-lesson') && keys.includes(KEY), keys);
}

{
  const target = world('promote-in-project');
  write(target.repo, { '.claude/lessons-ledger.md': `# Lessons Ledger — b100-am-ui\n\n---\n- [b100-am-ui] 2026-09-20 — project lesson -> RULE: x <!--fc:project-promoted#2-->\n` });
  write(target.home, { '.claude/rules/promoted-rules.md': '# Contract\n\n- project-promoted: written down.\n' });
  const run = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'promote', '--key', 'project-promoted', '--no-mechanism', REASON], {
    cwd: target.repo,
    encoding: 'utf8',
    env: { ...process.env, HOME: target.home, USERPROFILE: target.home },
  });
  const repoLedger = readFileSync(path.join(target.repo, '.claude', 'lessons-ledger.md'), 'utf8');

  check('alcance: promover una clave del ledger del PROYECTO colapsa SU línea, en SU archivo', repoLedger.includes('[promoted]') && repoLedger.includes('project-promoted'), `${run}\n${repoLedger}`);
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
  const baseEnv = { ...envWithoutSession, HOME: target.home, USERPROFILE: target.home };
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

rmSync(scratch, { recursive: true, force: true });

process.stdout.write(`failure-capture selftest: ${passed} passed, ${failures.length} failed\n`);

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);

process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
