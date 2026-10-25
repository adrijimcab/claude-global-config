#!/usr/bin/env node
/**
 * Discrimination proof of the loop's PER-PROJECT routing (`project.mjs`), which made the loop global on
 * 2026-09-30. Every state its decisions range over, on constructed projects and a constructed home:
 *   - which project a directory belongs to: none, a top-level project, a subfolder project, a linked
 *     worktree mapped to its main checkout, and a sibling folder no project holds;
 *   - the scope: the folder name by default, the configured one when given, and a broken config refused;
 *   - the home (any injected one) is global configuration, never a project; a broken config fails, with
 *     exit 2 and a bilingual refusal, only the commands that read the project; `init` at the home is refused;
 *   - `init`: creates the ledger and the import once, and changes nothing the second time;
 *   - a capture from project A lands in A's ledger, and a spooled A entry folded by a process in project B
 *     still lands in A's ledger, never B's;
 *   - a worker promotion: into `.claude/CLAUDE.md` by default, into the configured contract files plus the
 *     contract parity when the project declares anchors, and refused while any file lacks the token or the
 *     shared parity engine reports drift.
 * @es Prueba de discriminación del ruteo POR PROYECTO del bucle, sobre proyectos y home construidos.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { projectOf } from './project.mjs';
import { provisionLoop, worldEnv } from './fixture-loop.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('failure-capture');

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The REAL path: Windows hands out the 8.3 spelling of the temp dir, and the loop reports real paths.
// @es La ruta REAL: Windows da la forma 8.3 del temporal y el bucle reporta rutas reales.
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-project-')));
const REASON = 'a claim written in prose cannot be detected by any hook; measured 0 of 6 recall. @es una afirmación escrita en prosa no la detecta ningún hook; recuerdo medido 0 de 6.';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 600)}`}`);
}

/** The `loadedSetCeiling` the project context of `directory` surfaces, or the text of the fault reading it raised, so a fault fails the check that expects a value instead of crashing the run. @es El `loadedSetCeiling` que muestra el contexto del proyecto de `directory`, o el texto del fallo al leerlo, para que un fallo haga fallar la comprobación en vez de tumbar la corrida. */
function ceilingOf(directory) {
  try {
    return projectOf(directory)?.loadedSetCeiling;
  } catch (error) {
    return `THREW: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * The project `directory` belongs to, or the text of the fault reading it raised: a check that expects a project (or
 * none) fails on a fault instead of crashing the run.
 * @es El proyecto al que pertenece `directory`, o el texto del fallo al leerlo: una comprobación que espera un proyecto
 * (o ninguno) falla ante un fallo en vez de tumbar la corrida.
 */
function projectAt(directory, options) {
  try {
    return projectOf(directory, options);
  } catch (error) {
    return `THREW: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * The `field` of the project `directory` belongs to, or the text of the fault reading it raised (never `undefined`
 * for a fault, so a check that expects no project cannot pass on one).
 * @es El campo `field` del proyecto al que pertenece `directory`, o el texto del fallo al leerlo (nunca `undefined`
 * ante un fallo, para que una comprobación que espera ningún proyecto no pase con uno).
 */
function fieldAt(directory, field, options) {
  const found = projectAt(directory, options);

  return typeof found === 'string' ? found : found?.[field];
}

/** Whether a value read through `projectAt`/`fieldAt` is a fault. @es Si un valor leído así es un fallo. */
const isFault = (value) => typeof value === 'string' && value.startsWith('THREW: ');

function write(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, ...relative.split('/'));

    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
}

/** An equality check, compared as JSON. @es Una comprobación de igualdad, comparada como JSON. */
const equal = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

function git(directory, ...args) {
  execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** A home holding a copy of the loop, so its state and ledger are the fixture's own. @es Un home con una copia del bucle. */
function makeHome(name) {
  const home = path.join(scratch, name, 'home');
  const loop = path.join(home, '.claude', 'failure-capture');

  mkdirSync(path.join(loop, 'state'), { recursive: true });
  provisionLoop(loop, (file) => !file.includes('selftest') && !file.includes('mutants'));
  write(home, { '.claude/lessons-ledger.md': '# Lessons Ledger — global\n\n---\n', '.claude/rules/promoted-rules.md': '# Contract\n' });

  return { home, cli: path.join(loop, 'capture.mjs'), incidents: path.join(loop, 'state', 'incidents.jsonl') };
}

/** Runs the CLI in `cwd` under `home`. @returns `{ status, out }`. @es Corre el CLI en `cwd` bajo `home`. */
function run({ home, cli }, cwd, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env: worldEnv(home) });

  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const LESSON = (key) => `what went wrong for ${key} -> root cause -> RULE: do it right every time`;
const capture = (world, cwd, key, scope, actor = 'orchestrator') => run(world, cwd, 'capture', '--key', key, '--scope', scope, '--actor', actor, '--lesson', LESSON(key));

// MEASURED 2026-09-30: a first draft of this selftest ran `init` from a folder whose walk reached the REAL
// home, and appended an import to the real `~/.claude/CLAUDE.md`. That file is fingerprinted before and
// after, so a fixture that escapes its sandbox fails here instead of passing silently. The real ledger is
// NOT fingerprinted: the live fleet appends to it while this runs (measured: a concurrent capture made
// that check red over a correct run), so its content cannot tell this test's writes from theirs.
// @es Un primer borrador escribió en el `~/.claude/CLAUDE.md` REAL; se comparan huellas antes y después.
// El ledger real no: la flota viva lo escribe mientras esto corre.
const USER_FILES = [path.join(os.homedir(), '.claude', 'CLAUDE.md')];
const fingerprint = () => USER_FILES.map((file) => (existsSync(file) ? readFileSync(file, 'utf8') : '<absent>')).join('\u0000');
const userFilesBefore = fingerprint();

try {
  // Every project lives UNDER the fixture home, as real ones live under the real home: the walk stops at
  // the home, whichever home the process was given.
  // @es Los proyectos viven BAJO el home del fixture, como los reales bajo el real.
  const world = makeHome('routing');
  const projects = path.join(world.home, 'projects');
  const plain = path.join(projects, 'plain');

  write(plain, { 'file.txt': 'x\n' });

  // --- which project a directory belongs to -----------------------------------------------------------
  const app = path.join(projects, 'app');
  const monorepo = path.join(projects, 'monorepo');
  const api = path.join(monorepo, 'services', 'api');

  write(app, { '.claude/CLAUDE.md': '# App\n', 'src/index.txt': 'x\n' });
  write(monorepo, { 'README.md': 'x\n', 'services/web/index.txt': 'x\n' });
  write(api, { '.claude/CLAUDE.md': '# Api\n', 'index.txt': 'x\n', '.claude/failure-capture.json': JSON.stringify({ scope: 'legacy-api' }) });
  git(monorepo, 'init', '--quiet');
  git(monorepo, 'config', 'user.email', 'fixture@example.invalid');
  git(monorepo, 'config', 'user.name', 'Fixture');
  git(monorepo, 'config', 'core.hooksPath', path.join(scratch, 'no-hooks'));
  write(monorepo, { '.git/info/exclude': '.claude/\n' });
  git(monorepo, 'add', '-A');
  git(monorepo, 'commit', '--quiet', '-m', 'initial');
  git(monorepo, 'worktree', 'add', '--quiet', '-b', 'work', path.join(scratch, 'monorepo-worktree'));

  equal('no project holds a plain folder', projectAt(plain), undefined);

  // THE ESCAPE (2026-09-30): HOME pointed at a fixture, cwd OUTSIDE it — the walk climbed to the account's
  // REAL home and took `~/.claude/CLAUDE.md` for a project. Probed in a child whose HOME is the fixture, and
  // read-only, so a regression reddens this check instead of writing to the real file.
  // @es LA FUGA: HOME en un fixture y cwd FUERA de él; el recorrido subía al home REAL de la cuenta.
  const outside = path.join(scratch, 'outside-the-fixture-home');
  const probe = path.join(scratch, 'project-probe.mjs');

  write(outside, { 'file.txt': 'x\n' });
  writeFileSync(probe, `import { projectOf } from ${JSON.stringify(pathToFileURL(path.join(HERE, 'project.mjs')).href)};\nprocess.stdout.write(JSON.stringify(projectOf(process.cwd())?.root ?? null));\n`);
  const escaped = spawnSync(process.execPath, [probe], { cwd: outside, encoding: 'utf8', env: worldEnv(world.home) });
  equal('a cwd outside a fixture HOME never resolves to the account\'s real home', escaped.stdout, 'null');
  equal('a top-level project: scope is the folder name by default', fieldAt(path.join(app, 'src'), 'scope'), 'app');
  equal('...its ledger is its own .claude/lessons-ledger.md', fieldAt(app, 'ledgerFile'), path.join(app, '.claude', 'lessons-ledger.md'));
  equal('...and its default worker contract is its .claude/CLAUDE.md', fieldAt(app, 'workerContracts'), [path.join(app, '.claude', 'CLAUDE.md')]);
  equal('a subfolder project takes its configured scope', fieldAt(api, 'scope'), 'legacy-api');
  equal('a sibling folder of the subfolder project is held by no project', projectAt(path.join(monorepo, 'services', 'web')), undefined);
  const linked = fieldAt(path.join(scratch, 'monorepo-worktree', 'services', 'api'), 'root');
  const main = fieldAt(api, 'root');

  check('the same subfolder inside a LINKED worktree maps to the main checkout project', !isFault(main) && typeof main === 'string' && linked === main, JSON.stringify([linked, main]));

  write(app, { '.claude/failure-capture.json': JSON.stringify({ scop: 'typo' }) });
  let thrown = '';

  try {
    projectOf(app);
  } catch (error) {
    thrown = error.message;
  }
  check('a broken project config THROWS, never reads as absent', thrown.includes('unknown key "scop"'), thrown);
  write(app, { '.claude/failure-capture.json': JSON.stringify({ parityGate: '.claude/parity.mjs' }) });
  thrown = '';

  try {
    projectOf(app);
  } catch (error) {
    thrown = error.message;
  }
  check('the retired parityGate key is refused, so no project keeps a gate the loop no longer runs', thrown.includes('unknown key "parityGate"'), thrown);
  for (const bad of [0, -5, 1.5, '140000', null]) {
    write(app, { '.claude/failure-capture.json': JSON.stringify({ loadedSetCeiling: bad }) });
    let refused = '';

    try {
      projectOf(app);
    } catch (error) {
      refused = error.message;
    }
    check(`a loadedSetCeiling of ${JSON.stringify(bad)} THROWS, bilingual`, refused.includes('"loadedSetCeiling" must be a positive integer') && refused.includes('@es'), refused);
  }
  write(app, { '.claude/failure-capture.json': JSON.stringify({ loadedSetCeiling: 140000 }) });
  equal('a valid loadedSetCeiling is surfaced by the project context', ceilingOf(app), 140000);
  rmSync(path.join(app, '.claude', 'failure-capture.json'));
  equal('no loadedSetCeiling is absent by default', ceilingOf(app), undefined);

  // --- the home is global configuration, never a project; and it is injectable --------------------------
  // A home that is NOT the process's own, handed in by the caller: the property under test is "whatever the
  // home is, its `.claude/CLAUDE.md` is user-level instructions", so it must hold for any home.
  // @es Un home que NO es el del proceso, entregado por quien llama: la propiedad es «sea cual sea el home,
  // su `.claude/CLAUDE.md` son instrucciones de usuario».
  const claimed = path.join(scratch, 'injected', 'home');
  const claimedApp = path.join(claimed, 'proj');
  const claimedApi = path.join(claimed, 'mono', 'services', 'api');

  write(claimed, { '.claude/CLAUDE.md': '# User\n', '.claude/failure-capture/x.txt': 'x\n' });
  write(claimedApp, { '.claude/CLAUDE.md': '# Proj\n', 'src/x.txt': 'x\n' });
  write(path.join(claimed, 'mono'), { '.claude/CLAUDE.md': '# Mono\n' });
  write(claimedApi, { '.claude/CLAUDE.md': '# Api\n', 'src/x.txt': 'x\n' });
  const under = (directory) => fieldAt(directory, 'root', { homes: [claimed] });

  equal('an injected home holding .claude/CLAUDE.md is not a project', under(claimed), undefined);
  equal('...nor is its own .claude folder', under(path.join(claimed, '.claude')), undefined);
  equal('...nor a folder inside that .claude folder', under(path.join(claimed, '.claude', 'failure-capture')), undefined);
  equal('...but a project beneath it is one', under(path.join(claimedApp, 'src')), claimedApp);
  equal('...and of nested projects the nearest wins', under(path.join(claimedApi, 'src')), claimedApi);

  // --- a command fails only when IT needs the project, and fails as a refusal, never as a stack trace ---
  const broken = path.join(projects, 'broken');
  const stackTrace = '\n    at ';

  write(broken, { '.claude/CLAUDE.md': '# Broken\n', '.claude/failure-capture.json': JSON.stringify({ scop: 'typo' }) });
  for (const [label, ...argv] of [['init', 'init'], ['keys', 'keys'], ['status', 'status'], ['capture', 'capture', '--key', 'broken-config-lesson', '--scope', 'global', '--actor', 'orchestrator', '--lesson', LESSON('broken-config-lesson')], ['promote', 'promote', '--key', 'broken-config-lesson', '--no-mechanism', REASON], ['condense', 'condense']]) {
    const refused = run(world, broken, ...argv);

    check(`${label} in a project with an invalid config exits 2`, refused.status === 2, `${String(refused.status)} ${refused.out}`);
    check(`...naming the defect in both languages, with no stack trace (${label})`, refused.out.includes('unknown key "scop"') && refused.out.includes('@es') && !refused.out.includes(stackTrace), refused.out);
  }
  check('dismiss needs no project, so an invalid config does not stop it', run(world, broken, 'dismiss', '--reason', REASON).status === 0);
  check('the usage text needs no project either', run(world, broken).status === 0);

  // --- the home itself: no project, the global ledger still works, init refuses ---------------------------
  const userInstructions = path.join(world.home, '.claude', 'CLAUDE.md');

  write(world.home, { '.claude/CLAUDE.md': '# User-level instructions\n' });
  for (const [label, directory] of [['the home', world.home], ['the home\'s own .claude folder', path.join(world.home, '.claude')]]) {
    const refused = run(world, directory, 'init');

    check(`init in ${label} is refused, in both languages`, refused.status === 1 && refused.out.includes('init REFUSED') && refused.out.includes('@es'), `${String(refused.status)} ${refused.out}`);
  }
  check('...and the user-level instructions are untouched', read(userInstructions) === '# User-level instructions\n', read(userInstructions));
  check('a global capture from the home is recorded in the global ledger', capture(world, world.home, 'global-from-home-lesson', 'global').status === 0 && read(path.join(world.home, '.claude', 'lessons-ledger.md')).includes('<!--fc:global-from-home-lesson#1-->'));

  // --- init ---------------------------------------------------------------------------------------------
  const first = run(world, api, 'init');
  const instructions = () => read(path.join(api, '.claude', 'CLAUDE.md'));

  check('init creates the project ledger with its header', first.status === 0 && read(path.join(api, '.claude', 'lessons-ledger.md')).startsWith('# Lessons Ledger — legacy-api'), first.out);
  check('init adds exactly one @lessons-ledger.md import', instructions().split('\n').filter((line) => line.trim() === '@lessons-ledger.md').length === 1, instructions());
  run(world, api, 'init');
  check('init a second time changes nothing', instructions().split('\n').filter((line) => line.trim() === '@lessons-ledger.md').length === 1, instructions());
  check('init outside every project is refused', run(world, plain, 'init').status !== 0);

  // --- routing ------------------------------------------------------------------------------------------
  check('a scope that is not this project\'s is refused', capture(world, app, 'wrong-scope-lesson', 'legacy-api').status !== 0);
  check('outside every project only the global scope is accepted', capture(world, plain, 'nowhere-lesson', 'app').status !== 0);
  capture(world, app, 'app-lesson', 'app');
  check('a capture in project A lands in A\'s ledger', read(path.join(app, '.claude', 'lessons-ledger.md')).includes('<!--fc:app-lesson#1-->'));
  check('...and in no other ledger', !read(path.join(api, '.claude', 'lessons-ledger.md')).includes('app-lesson') && !read(path.join(world.home, '.claude', 'lessons-ledger.md')).includes('app-lesson'));

  // A spooled entry from project A, left by a writer that lost the lock, folded by a capture in project B.
  const spooled = { key: 'spooled-app-lesson', scope: 'app', actor: 'orchestrator', lesson: LESSON('spooled-app-lesson'), date: '2026-09-30', session: 'x', at: new Date().toISOString(), project: { scope: 'app', ledgerFile: path.join(app, '.claude', 'lessons-ledger.md') } };

  write(world.home, { '.claude/failure-capture/state/spool/0000000000001-1-a.json': JSON.stringify(spooled) });
  capture(world, api, 'api-lesson', 'legacy-api');
  check('an A entry folded by a process in B lands in A\'s ledger', read(path.join(app, '.claude', 'lessons-ledger.md')).includes('<!--fc:spooled-app-lesson#1-->'));
  check('...never in B\'s', !read(path.join(api, '.claude', 'lessons-ledger.md')).includes('spooled-app-lesson'));
  run(world, api, 'init');
  check('init never rewrites a ledger that already exists', read(path.join(api, '.claude', 'lessons-ledger.md')).includes('<!--fc:api-lesson#1-->'));
  check('a capture from a linked worktree lands in the main checkout\'s project ledger', capture(world, path.join(scratch, 'monorepo-worktree', 'services', 'api'), 'from-worktree-lesson', 'legacy-api').status === 0 && read(path.join(api, '.claude', 'lessons-ledger.md')).includes('<!--fc:from-worktree-lesson#1-->'));

  // --- worker promotion ---------------------------------------------------------------------------------
  capture(world, app, 'worker-lesson', 'app', 'worker:general-purpose');
  capture(world, app, 'worker-lesson', 'app', 'worker:general-purpose');
  check('a worker promotion into the default contract is refused while CLAUDE.md lacks the token', run(world, app, 'promote', '--key', 'worker-lesson', '--no-mechanism', REASON).out.includes(`absent from ${path.join(app, '.claude', 'CLAUDE.md')}`));
  write(app, { '.claude/CLAUDE.md': '# App\n\n- worker-lesson: the rule, written down.\n' });
  const promoted = run(world, app, 'promote', '--key', 'worker-lesson', '--no-mechanism', REASON);

  check('...and closes once the token is in the project CLAUDE.md', promoted.status === 0 && read(path.join(app, '.claude', 'lessons-ledger.md')).includes('[promoted]'), promoted.out);
  check('...reporting that no contract parity was declared, never that one passed', promoted.out.includes('this project declares no contract parity'), promoted.out);

  write(api, {
    '.claude/failure-capture.json': JSON.stringify({ scope: 'legacy-api', workerContracts: ['.claude/AGENT-LEDGER.md', '.agents/AGENTS.md'] }),
    '.claude/AGENT-LEDGER.md': '# Ledger\n\n- api-worker-lesson: rule.\n',
    '.agents/AGENTS.md': '# Agents\n',
    '.claude/agent-contract/anchors.json': JSON.stringify({ english: ['.claude/AGENT-LEDGER.md'], spanish: ['.agents/AGENTS.md'], anchors: ['api-worker-lesson', 'second-anchor'] })
  });
  capture(world, api, 'api-worker-lesson', 'legacy-api', 'worker:general-purpose');
  capture(world, api, 'api-worker-lesson', 'legacy-api', 'worker:general-purpose');
  check('a configured contract: refused while ANY of its files lacks the token', run(world, api, 'promote', '--key', 'api-worker-lesson', '--no-mechanism', REASON).out.includes(`absent from ${path.join(api, '.agents', 'AGENTS.md')}`));
  write(api, { '.agents/AGENTS.md': '# Agents\n\n- api-worker-lesson: regla.\n' });
  const drifted = run(world, api, 'promote', '--key', 'api-worker-lesson', '--no-mechanism', REASON);

  check('declared anchors that drift between the two contracts refuse the promotion', drifted.status === 1 && drifted.out.includes('parity check is RED') && drifted.out.includes('second-anchor'), drifted.out);
  write(api, { '.claude/AGENT-LEDGER.md': '# Ledger\n\n- api-worker-lesson: rule. second-anchor.\n', '.agents/AGENTS.md': '# Agents\n\n- api-worker-lesson: regla. second-anchor.\n' });
  const gated = run(world, api, 'promote', '--key', 'api-worker-lesson', '--no-mechanism', REASON);

  check('anchors in parity and every file carrying the token closes it', gated.status === 0 && gated.out.includes('shared parity engine ran and found parity'), gated.out);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

check('the real user-level CLAUDE.md is untouched by every case above', fingerprint() === userFilesBefore);

process.stdout.write(`failure-capture project selftest: ${passed} passed, ${failures.length} failed\n`);
for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.exit(failures.length === 0 ? 0 : 1);
