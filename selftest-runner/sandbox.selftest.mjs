#!/usr/bin/env node
/**
 * Self-test for where the runner runs a selftest and what counts as an escape from its sandbox, against git
 * repositories and homes CONSTRUCTED here. The runner under test is given a constructed "real" home and temp
 * directory, so a broken sandbox writes there, never into the home of whoever runs this.
 *
 * THE STATE SPACE, enumerated from what the verdict decides:
 *   - WHAT A CHILD IS GIVEN: `HOME`/`USERPROFILE` an empty home holding only an empty `.claude` that is
 *     `HOOK_CLAUDE_HOME`; `HOOK_STATE_DIR` empty and outside that home; `TMP`/`TEMP`/`TMPDIR` one empty private
 *     directory; `SELFTEST_TREE` the tree's top level. Each selftest gets its own, removed after; a variable
 *     spelled in another case is replaced, never duplicated.
 *   - THE HOME: a write under `~/.claude` (through `homedir()` or `HOOK_CLAUDE_HOME`), a write elsewhere in the
 *     home, an empty directory, and `~/.claude` removed are each RED and named; a write into `HOOK_STATE_DIR` is not.
 *   - THE TEMP: a file and a file in a subdirectory left behind are RED, named file by file.
 *   - THE TREE: a path `git status` did not list (added), lists differently (a tracked file changed, a dirty file
 *     touched again, a tracked file deleted), or no longer lists (removed) is RED and named; an ignored path is not
 *     watched. A tree git cannot read after a selftest stops the run, exit 2, with nothing later run.
 *   - WHOSE WRITE: a process writing the REAL home and temp while the selftest runs never turns it red.
 *   - THE REPORT: exit status and escapes both shown; areas home, temp, tree in that order, each sorted.
 *
 * @es Auto-test de dónde corre el runner cada selftest y qué cuenta como fuga de su sandbox, contra repos y homes
 * CONSTRUIDOS aquí. El runner recibe un home y un temporal "reales" construidos, así un sandbox roto escribe ahí,
 * nunca en el home de quien lo ejecuta. Estados: qué recibe el hijo (home vacío con `.claude` vacío, estado fuera
 * del home, temporal privado, `SELFTEST_TREE`; uno por selftest, borrado después; una variable en otra grafía se
 * reemplaza); el home (escrituras bajo `~/.claude` o fuera, un directorio vacío y `~/.claude` borrado son ROJO; el
 * estado en `HOOK_STATE_DIR` no); el temporal (cada resto, fichero a fichero); el árbol (añadido, cambiado o ya no
 * listado por `git status`; lo ignorado no se vigila; un árbol ilegible detiene la corrida con 2); de quién es la
 * escritura (otro proceso que escribe el home y el temporal REALES nunca lo pone rojo); y el informe.
 */

import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { RUN, fixtureKit } from './fixtures.mjs';
import { runSelftests } from './run.mjs';
import { createSandbox, removeSandbox, sandboxEnv } from './sandbox.mjs';
import { isolateState } from '../hook-state/locations.mjs';

isolateState('selftest-runner-sandbox');

const { check, bareDir, repo, finish } = fixtureKit('selftest-runner sandbox selftest');

/** A constructed "real" home with live state, and a constructed "real" temp. @es Un home y un temporal "reales" construidos. */
function realWorld() {
  const home = bareDir();
  const temp = bareDir();

  mkdirSync(path.join(home, '.claude', 'guard-x', 'state'), { recursive: true });
  writeFileSync(path.join(home, '.claude', 'guard-x', 'state', 'journal.jsonl'), '{"line":1}\n');

  return { home, temp };
}

/** Every path under `directory`, relative, sorted. @es Cada ruta bajo `directory`, relativa y ordenada. */
const everything = (directory) => readdirSync(directory, { recursive: true }).map(String).sort();

/** The runner's environment pointed at `world`, with no state root of its own. @es El entorno del runner apuntado a `world`. */
function envOf(world) {
  const env = { ...process.env, HOME: world.home, USERPROFILE: world.home, HOOK_CLAUDE_HOME: path.join(world.home, '.claude'), TMP: world.temp, TEMP: world.temp, TMPDIR: world.temp };

  delete env.HOOK_STATE_DIR;

  return env;
}

/**
 * Runs the real runner over `tree` in `world`, from a cwd that is not the tree, so the tree it names cannot be
 * mistaken for its cwd.
 * @es Ejecuta el runner real sobre `tree` en `world`, desde un cwd que no es el árbol.
 */
const runIn = (tree, world) => spawnSync(process.execPath, [RUN, '--root', tree], { cwd: world.temp, encoding: 'utf8', env: envOf(world) });

/**
 * A child's stderr quoted into a failure label, every line prefixed, so a crash trace it holds is never read
 * as this selftest's own crash.
 * @es El stderr de un hijo citado en una etiqueta de fallo, con cada línea prefijada, para que una traza suya
 * nunca se lea como un crash de este selftest.
 */
const quoted = (text) => text.replace(/^/gm, '  | ');

/** A fixture selftest: imports, then `body`, then exit 0. @es Un selftest de fixture: imports, `body` y salida 0. */
const script = (body) => `import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';\nimport os from 'node:os';\nimport path from 'node:path';\n${body}\nprocess.exit(0);\n`;

/** One selftest `a/selftest.mjs` running `body` in a fresh world. @es Un selftest que ejecuta `body` en un mundo nuevo. */
function caseOf(body, { tracked = {}, loose = {}, ignore = '' } = {}) {
  const world = realWorld();
  const tree = repo({ tracked: { 'a/selftest.mjs': script(body), ...tracked }, loose, ignore });
  const before = { home: everything(world.home), temp: everything(world.temp) };
  const run = runIn(tree, world);

  check(JSON.stringify(everything(world.home)) === JSON.stringify(before.home) && JSON.stringify(everything(world.temp)) === JSON.stringify(before.temp), `the real home and temp are untouched by the child: ${everything(world.home)} ${everything(world.temp)}`);

  return { ...run, tree, world };
}

// ── What a child is given ────────────────────────────────────────────────────────────────────────
const probe = script(`import { existsSync, readdirSync } from 'node:fs';
import module from 'node:module';
const compileCache = module.enableCompileCache().status;
const e = process.env;
const list = (d) => (d && existsSync(d) ? readdirSync(d) : null);
writeFileSync('seen.json', JSON.stringify({ compileCache, HOME: e.HOME, USERPROFILE: e.USERPROFILE, homedir: os.homedir(), claude: e.HOOK_CLAUDE_HOME, state: e.HOOK_STATE_DIR, TMP: e.TMP, TEMP: e.TEMP, TMPDIR: e.TMPDIR, tmpdir: os.tmpdir(), tree: e.SELFTEST_TREE, homeList: list(os.homedir()), claudeList: list(e.HOOK_CLAUDE_HOME), stateList: list(e.HOOK_STATE_DIR), tempList: list(os.tmpdir()) }));`);
const probeWorld = realWorld();
const probed = repo({ tracked: { 'a/selftest.mjs': probe, 'b/selftest.mjs': probe }, ignore: 'seen.json\n' });
const probeRun = runIn(probed, probeWorld);
const seenFile = (name) => path.join(probed, name, 'seen.json');
const seen = ['a', 'b'].map((name) => (existsSync(seenFile(name)) ? JSON.parse(readFileSync(seenFile(name), 'utf8')) : {}));

check(probeRun.status === 0 && probeRun.stdout.includes('2/2 green'), `two clean children are GREEN: ${probeRun.status} ${probeRun.stdout}${quoted(probeRun.stderr)}`);
for (const [index, given] of seen.entries()) {
  const label = `child ${index}`;
  check(typeof given.homedir === 'string', `${label}: recorded what it was given`);
  if (typeof given.homedir !== 'string') continue;
  check(given.HOME === given.homedir && given.USERPROFILE === given.homedir, `${label}: HOME and USERPROFILE are what homedir() returns: ${given.HOME} ${given.USERPROFILE} ${given.homedir}`);
  check(given.claude === path.join(given.homedir, '.claude'), `${label}: HOOK_CLAUDE_HOME is the sandbox home's .claude: ${given.claude}`);
  check(JSON.stringify(given.homeList) === '[".claude"]' && JSON.stringify(given.claudeList) === '[]', `${label}: the home holds only an empty .claude: ${given.homeList} ${given.claudeList}`);
  check(path.isAbsolute(given.state ?? '') && JSON.stringify(given.stateList) === '[]' && !given.state.startsWith(given.homedir), `${label}: HOOK_STATE_DIR is absolute, empty and outside the home: ${given.state}`);
  check(given.TMP === given.tmpdir && given.TEMP === given.tmpdir && given.TMPDIR === given.tmpdir && JSON.stringify(given.tempList) === '[]', `${label}: TMP, TEMP and TMPDIR are one empty directory, what tmpdir() returns: ${given.TMP} ${given.TEMP} ${given.TMPDIR} ${given.tmpdir}`);
  check(given.tree === probed, `${label}: SELFTEST_TREE is the tree's top level: ${given.tree}`);
  check(given.compileCache === 3, `${label}: Node's compile cache is disabled (status 3), so npm leaves no cache in the temp: ${given.compileCache}`);
  for (const place of [given.homedir, given.state, given.tmpdir]) {
    check(typeof place === 'string' && !place.startsWith(probeWorld.home) && place !== probeWorld.temp && !place.startsWith(probed), `${label}: ${place} is neither in the real home nor in the tree, nor the real temp itself`);
    check(!existsSync(place), `${label}: ${place} is removed when the selftest ends`);
  }
}
check(new Set(seen.flatMap((given) => [given.homedir, given.state, given.tmpdir])).size === 6, 'each selftest gets a sandbox of its own, never shared');

const unit = createSandbox(bareDir());
const unitEnv = sandboxEnv(unit, { base: { Temp: 'stale', home: 'stale', Hook_State_Dir: 'stale', PATH: 'kept' }, tree: '.' });
check(!('Temp' in unitEnv) && !('home' in unitEnv) && !('Hook_State_Dir' in unitEnv) && unitEnv.TEMP === unit.temp && unitEnv.HOME === unit.home && unitEnv.HOOK_STATE_DIR === unit.state, `a variable spelled in another case is replaced, never left beside the new one: ${Object.keys(unitEnv)}`);
check(unitEnv.PATH === 'kept' && unitEnv.SELFTEST_TREE === path.resolve('.'), 'the rest of the environment is kept and the tree is made absolute');
removeSandbox(unit);
check(!existsSync(unit.root), 'removeSandbox removes the whole sandbox');

// ── The home ─────────────────────────────────────────────────────────────────────────────────────
const viaHomedir = caseOf("const target = path.join(os.homedir(), '.claude', 'x', 'state', 'a.jsonl');\nmkdirSync(path.dirname(target), { recursive: true });\nwriteFileSync(target, 'x');");
check(viaHomedir.status === 1 && viaHomedir.stdout.includes('RED    a/selftest.mjs (exit 0)'), `a child that exits 0 but writes ~/.claude through homedir() is RED: ${viaHomedir.status} ${viaHomedir.stdout}`);
check(viaHomedir.stdout.includes('    escaped its sandbox: 1 path(s) written outside its seams @es '), `the escape is counted, bilingual: ${viaHomedir.stdout}`);
check(viaHomedir.stdout.includes('    ~/.claude/x/state/a.jsonl written in its sandbox home: a module bypassed the state seam (hook-state/locations.mjs) @es ~/.claude/x/state/a.jsonl escrito'), `the path is named relative to the home: ${viaHomedir.stdout}`);
check(viaHomedir.stdout.includes('0/1 green'), 'the summary counts it red');

const viaVariable = caseOf("const target = path.join(process.env.HOOK_CLAUDE_HOME, 'y', 'state', 'b.jsonl');\nmkdirSync(path.dirname(target), { recursive: true });\nwriteFileSync(target, 'x');");
check(viaVariable.status === 1 && viaVariable.stdout.includes('    ~/.claude/y/state/b.jsonl written in its sandbox home'), `a write through HOOK_CLAUDE_HOME is RED and named: ${viaVariable.stdout}`);

const outsideClaude = caseOf("writeFileSync(path.join(os.homedir(), 'notes.txt'), 'x');\nmkdirSync(path.join(os.homedir(), '.claude', 'empty'));");
check(outsideClaude.status === 1 && outsideClaude.stdout.includes('    ~/notes.txt written') && outsideClaude.stdout.includes('    ~/.claude/empty written'), `a write elsewhere in the home and an empty directory are named: ${outsideClaude.stdout}`);

const claudeRemoved = caseOf("rmSync(process.env.HOOK_CLAUDE_HOME, { recursive: true });");
check(claudeRemoved.status === 1 && claudeRemoved.stdout.includes('    ~/.claude removed from its sandbox home'), `removing the empty ~/.claude is named: ${claudeRemoved.stdout}`);

const throughSeam = caseOf("const target = path.join(process.env.HOOK_STATE_DIR, 'guard-x', 'journal.jsonl');\nmkdirSync(path.dirname(target), { recursive: true });\nwriteFileSync(target, 'x');");
check(throughSeam.status === 0 && throughSeam.stdout.includes('1/1 green'), `a write through HOOK_STATE_DIR is no escape: ${throughSeam.stdout}`);

// ── The temp ─────────────────────────────────────────────────────────────────────────────────────
const leftover = caseOf("writeFileSync(path.join(os.tmpdir(), 'left.txt'), 'x');\nmkdirSync(path.join(os.tmpdir(), 'd'));\nwriteFileSync(path.join(os.tmpdir(), 'd', 'inner.txt'), 'x');");
check(leftover.status === 1 && leftover.stdout.includes('    $TMP/d/inner.txt left behind in its private temp directory @es ') && leftover.stdout.includes('    $TMP/left.txt left behind'), `each file left in the temp is named: ${leftover.stdout}`);
check(!leftover.stdout.includes('    $TMP/d left'), 'a directory with contents is not named, its contents are');

// A link left in the temp is named, never entered, and removing the sandbox never follows it.
// @es Un enlace que queda en el temporal se nombra sin cruzarlo, y borrar el sandbox nunca lo sigue.
const beyond = bareDir();
writeFileSync(path.join(beyond, 'kept.txt'), 'x');
const linked = caseOf(`import { symlinkSync } from 'node:fs';\nsymlinkSync(${JSON.stringify(beyond)}, path.join(os.tmpdir(), 'link'), 'junction');`);
check(linked.status === 1 && linked.stdout.includes('    $TMP/link left behind') && !linked.stdout.includes('kept.txt'), `a link is named, never entered: ${linked.stdout}`);
check(existsSync(path.join(beyond, 'kept.txt')), 'removing the sandbox does not follow a link out of it');

// ── The tree ─────────────────────────────────────────────────────────────────────────────────────
const treeBody = "writeFileSync('data.txt', 'changed');\nwriteFileSync('new.txt', 'x');\nmkdirSync('newdir');\nwriteFileSync(path.join('newdir', 'f.txt'), 'x');\nappendFileSync('dirty.txt', 'again');\nrmSync('gone.txt');\nrmSync('scratch.txt');\nwriteFileSync('ignored.txt', 'x');";
const treeCase = caseOf(treeBody, { tracked: { 'a/data.txt': 'one', 'a/gone.txt': 'one' }, loose: { 'a/dirty.txt': 'dirty', 'a/scratch.txt': 'x' }, ignore: 'ignored.txt\n' });
const inTree = (relative) => path.join(treeCase.tree, relative);
check(treeCase.status === 1 && treeCase.stdout.includes('escaped its sandbox: 6 path(s)'), `every change to the tree is counted, the ignored file is not: ${treeCase.stdout}`);
check(treeCase.stdout.includes(`    ${inTree('a/new.txt')} added to the tree under test @es `), `an untracked file the selftest created is named: ${treeCase.stdout}`);
check(treeCase.stdout.includes(`    ${inTree('a/newdir/f.txt')} added to the tree`), `a file in a new untracked directory is named itself: ${treeCase.stdout}`);
check(treeCase.stdout.includes(`    ${inTree('a/data.txt')} changed in the tree`) && treeCase.stdout.includes(`    ${inTree('a/gone.txt')} changed in the tree`), 'a tracked file changed and one deleted are named');
check(treeCase.stdout.includes(`    ${inTree('a/dirty.txt')} changed in the tree`), 'a file already dirty and touched again is named');
check(treeCase.stdout.includes(`    ${inTree('a/scratch.txt')} no longer differs from the index`), 'a path git no longer lists is named');
check(!treeCase.stdout.includes('ignored.txt'), 'an ignored path is not watched');

// Index-only changes on a committed tree: a staged rename is its two paths, and staging an untouched file
// changes its status, not its bytes.
// @es Cambios solo de índice en un árbol con commit: un renombre preparado son sus dos rutas, y preparar un
// fichero sin tocarlo cambia su estado, no sus bytes.
const indexBody = "import { spawnSync } from 'node:child_process';\nspawnSync('git', ['mv', 'old.txt', 'renamed.txt']);\nspawnSync('git', ['add', 'staged.txt']);";
const indexWorld = realWorld();
const indexTree = repo({ tracked: { 'a/selftest.mjs': script(indexBody), 'a/old.txt': 'one' }, loose: { 'a/staged.txt': 'x' }, commit: true });
const indexRun = runIn(indexTree, indexWorld);
const inIndexTree = (relative) => path.join(indexTree, relative);
check(indexRun.status === 1 && indexRun.stdout.includes(`    ${inIndexTree('a/old.txt')} added to the tree`) && indexRun.stdout.includes(`    ${inIndexTree('a/renamed.txt')} added to the tree`), `a staged rename names both paths: ${indexRun.stdout}`);
check(indexRun.stdout.includes(`    ${inIndexTree('a/staged.txt')} changed in the tree`), `staging an untouched file is a change: ${indexRun.stdout}`);

// ── Whose write: a concurrent writer to the REAL home and temp ──────────────────────────────────────
const concurrentWorld = realWorld();
const concurrent = repo({
  tracked: { 'a/selftest.mjs': "import { existsSync, writeFileSync } from 'node:fs';\nwriteFileSync('started', 'x');\nconst deadline = Date.now() + 8000;\nwhile (!existsSync('release') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));\nprocess.exit(existsSync('release') ? 0 : 1);\n" },
  ignore: 'started\nrelease\n',
});
const raced = await new Promise((resolve) => {
  const child = spawn(process.execPath, [RUN, '--root', concurrent], { cwd: concurrent, env: envOf(concurrentWorld) });
  let stdout = '';
  let wrote = false;
  const poll = setInterval(() => {
    if (wrote || !existsSync(path.join(concurrent, 'a', 'started'))) return;
    wrote = true;
    appendFileSync(path.join(concurrentWorld.home, '.claude', 'guard-x', 'state', 'journal.jsonl'), 'live session\n');
    mkdirSync(path.join(concurrentWorld.home, '.claude', 'guard-new', 'state'), { recursive: true });
    writeFileSync(path.join(concurrentWorld.home, '.claude', 'guard-new', 'state', 'fires.json'), '{}');
    writeFileSync(path.join(concurrentWorld.temp, 'stray.txt'), 'x');
    writeFileSync(path.join(concurrent, 'a', 'release'), 'x');
  }, 25);
  const guard = setTimeout(() => child.kill(), 30_000);

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.on('close', (code) => {
    clearInterval(poll);
    clearTimeout(guard);
    resolve({ code, stdout, wrote });
  });
});
check(raced.wrote && raced.code === 0 && raced.stdout.includes('1/1 green'), `a process writing the real home and temp during the selftest does not turn it red: wrote ${raced.wrote}, exit ${raced.code}, ${raced.stdout}`);

// ── The report ───────────────────────────────────────────────────────────────────────────────────
// `Z.txt` sorts before `a.txt` by code unit, after it in a case-insensitive listing; a removal sorts before an
// addition but is found after it. Only real sorting lists them right.
// @es `Z.txt` va antes que `a.txt` por unidad de código y después en un listado sin mayúsculas; un borrado va
// antes que una adición pero se encuentra después. Solo un orden real los lista bien.
const orderedBody = "writeFileSync('z-new.txt', 'x');\nrmSync('b-old.txt');\nwriteFileSync(path.join(os.tmpdir(), 'a.txt'), 'x');\nwriteFileSync(path.join(os.tmpdir(), 'Z.txt'), 'x');\nwriteFileSync(path.join(os.homedir(), '.claude', 'b.txt'), 'x');\nconsole.log('BOOM-MARK');\nprocess.exit(1);";
const ordered = caseOf(orderedBody, { loose: { 'a/b-old.txt': 'x' } });
const at = (text) => ordered.stdout.indexOf(text);
const positions = [at('~/.claude/b.txt'), at('$TMP/Z.txt'), at('$TMP/a.txt'), at(path.join(ordered.tree, 'a', 'b-old.txt')), at(path.join(ordered.tree, 'a', 'z-new.txt'))];
check(ordered.stdout.includes('RED    a/selftest.mjs (exit 1)') && ordered.stdout.includes('BOOM-MARK'), `a red selftest that also escaped reports its exit and output: ${ordered.stdout}`);
check(positions.every((position, index) => position > 0 && (index === 0 || position > positions[index - 1])), `escapes are listed home, temp, tree, each sorted: ${positions}`);

// ── A tree git cannot read stops the run ──────────────────────────────────────────────────────────
const unreadable = repo({
  tracked: {
    'a/selftest.mjs': script("renameSync(path.join('..', '.git'), path.join('..', 'moved-git'));"),
    'b/selftest.mjs': script("writeFileSync('ran', 'x');"),
  },
});
const stopped = runIn(unreadable, realWorld());
check(stopped.status === 2 && stopped.stderr.includes('Cannot read git status of the tree') && stopped.stderr.includes('a/selftest.mjs') && stopped.stderr.includes('@es '), `a tree git cannot read stops the run, not measured: ${stopped.status} ${quoted(stopped.stderr)}`);
check(!existsSync(path.join(unreadable, 'b', 'ran')) && !stopped.stdout.includes('green'), `nothing after it runs and no summary is printed: ${stopped.stdout}`);
const inProcess = (() => {
  try {
    return runSelftests({ root: repo({ tracked: { 'a/selftest.mjs': script("renameSync(path.join('..', '.git'), path.join('..', 'moved-git'));") } }) });
  } catch (error) {
    return { threw: error.message };
  }
})();
check(inProcess.exitCode === 2 && inProcess.notMeasured?.startsWith('Cannot read git status') && inProcess.report.at(-1) === inProcess.notMeasured, `in process the reason is returned and closes the report: ${JSON.stringify(inProcess)}`);

finish();
