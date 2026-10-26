#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `selftest-runner/pollution.mjs`. Every case runs on state CONSTRUCTED in a temp
 * directory: a git sandbox is the Claude home (`HOOK_CLAUDE_HOME` points at it), a second sandbox is the main
 * checkout, a plain directory is the temp root. The real home is never read here.
 *
 * THE STATE SPACE: which directories are watched (derived from git's ignored listing: an ignored state dir
 * inside a tracked guard, one inside a wholly ignored guard, a top-level `state/`, a guard created AFTER the
 * first snapshot that no list could name, an ignored directory that is not a state dir); what a run can do to
 * a watched file (add, remove, rewrite with the same size and a new mtime, grow); the checkout (modify a
 * tracked file, add an untracked one, touch an already-modified one, stage a rename, a different checkout
 * than the home); the temp root (a leftover, a created-and-removed entry, a pre-existing entry the run
 * removes); the locator scan (a candidate list that never decides); the git environment of a hook; the
 * command line (green, red, not measured, a failing command); and the language of every printed line.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `pollution.mjs`. Cada caso corre sobre estado CONSTRUIDO en un directorio
 * temporal: un sandbox git es el home de Claude, otro es el checkout principal y un directorio simple es la
 * raíz temporal. El home real nunca se lee aquí. Espacio de estados: qué directorios se vigilan (derivados
 * del listado de ignorados de git), qué puede hacer una corrida con un fichero vigilado, el checkout, la raíz
 * temporal, el escáner de candidatos (una lista que nunca decide), el entorno git de un hook, la línea de
 * comandos y el idioma de cada línea impresa.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';
import { createGitSandbox } from '../selftest-fixtures/git-sandbox.mjs';
import { annotate, locateHomedirUses } from './pollution-candidates.mjs';
import { MESSAGES } from './pollution-messages.mjs';
import { compareSnapshots, main, measureRun } from './pollution.mjs';
import { SnapshotError, snapshotOf, stateDirsOf } from './pollution-snapshot.mjs';

// Every child this selftest spawns resolves its state here, never in the real home. @es Cada hijo resuelve su estado aquí.
isolateState('pollution');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** What `action` returns, or `'threw'` after recording the throw. @es Lo que devuelve `action`, o `'threw'`. */
function safely(action) {
  try {
    return action();
  } catch (error) {
    failures.push(`threw — ${error.message}`);

    return 'threw';
  }
}

const cleanups = [];

function finish() {
  for (const cleanup of cleanups) safely(cleanup);

  if (failures.length > 0) {
    console.error(`pollution selftest FAILED (${failures.length}/${passed + failures.length}):\n${failures.join('\n')}`);
    process.exit(1);
  }

  console.log(`pollution selftest: ${passed} checks passed`);
}

process.on('uncaughtException', (error) => {
  failures.push(`threw — ${error.stack}`);
  finish();
});

const write = (file, text = 'x') => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const summary = (changes) => changes.map(({ area, path: changed, change }) => `${area}:${changed}:${change}`).sort();
const capture = () => {
  const lines = [];
  const errors = [];

  return { lines, errors, sink: { log: (line) => lines.push(line), error: (line) => (lines.push(line), errors.push(line)) } };
};

// --- the constructed home: an allowlist repository like the real one ---
const home = createGitSandbox();
const checkoutBox = createGitSandbox();
const scratch = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'pollution-selftest-')));
const tempRoot = path.join(scratch, 'temp');
const homeRoot = home.repoDir;
const savedHome = process.env.HOOK_CLAUDE_HOME;

mkdirSync(tempRoot);
cleanups.push(() => home.cleanup(), () => checkoutBox.cleanup(), () => rmSync(scratch, { recursive: true, force: true }), () => {
  if (savedHome === undefined) delete process.env.HOOK_CLAUDE_HOME;
  else process.env.HOOK_CLAUDE_HOME = savedHome;
});
process.env.HOOK_CLAUDE_HOME = homeRoot;

write(path.join(homeRoot, '.gitignore'), '*\n!/.gitignore\n!/guard-a/\n!/guard-a/**\n/guard-a/state/\n');
write(path.join(homeRoot, 'guard-a', 'code.mjs'), "import { homedir } from 'node:os';\nexport const where = () => homedir();\n");
write(path.join(homeRoot, 'guard-c', 'quiet.mjs'), 'export const quiet = 1;\n');
write(path.join(homeRoot, 'guard-a', 'state', 'seed.json'), '{}');
write(path.join(homeRoot, 'guard-b', 'state', 'seed.json'), '{}');
write(path.join(homeRoot, 'state', 'seed.json'), '{}');
write(path.join(homeRoot, 'projects', 'transcript.jsonl'), 'line\n');
home.git(['add', '-A']);
home.git(['add', '-f', 'guard-c/quiet.mjs']);
home.git(['commit', '-q', '-m', 'seed']);
write(path.join(homeRoot, 'guard-a', 'fresh.mjs'), "import { homedir } from 'node:os';\nexport const fresh = homedir();\n");
write(path.join(homeRoot, 'guard-b', 'ignored.mjs'), "import { homedir } from 'node:os';\nexport const hidden = homedir();\n");

const options = { home: homeRoot, tempDir: tempRoot, env: home.env };
const run = (action) => measureRun(action, options);
const stateOf = (relative) => path.join(homeRoot, ...relative.split('/'));

// --- the population is derived from git ---
check('population: every ignored state directory, wherever the guard sits, and no other ignored directory', stateDirsOf({ home: homeRoot, env: home.env }), ['guard-a/state', 'guard-b/state', 'state']);
check('population: a guard created after the first look joins the next one (nothing lists it)', (() => {
  write(stateOf('guard-new/state/first.json'));

  return stateDirsOf({ home: homeRoot, env: home.env });
})(), ['guard-a/state', 'guard-b/state', 'guard-new/state', 'state']);
rmSync(stateOf('guard-new'), { recursive: true, force: true });
check('population: a hook that exports GIT_DIR does not redirect the listing', stateDirsOf({ home: homeRoot, env: { ...home.env, GIT_DIR: path.join(scratch, 'nowhere') } }), ['guard-a/state', 'guard-b/state', 'state']);
check('population: the snapshot reports the directories it watched', snapshotOf(options).stateDirs, ['guard-a/state', 'guard-b/state', 'state']);
check('population: a state directory that is NOT ignored (untracked) is not part of it, git reports it as checkout state', (() => {
  write(stateOf('guard-a/extra/state/loose.json'));

  const found = stateDirsOf({ home: homeRoot, env: home.env });

  rmSync(stateOf('guard-a/extra'), { recursive: true });

  return found;
})(), ['guard-a/state', 'guard-b/state', 'state']);
check('snapshot: git\'s trailing NUL leaves no phantom empty-path entry in the checkout map', [...snapshotOf(options).checkout.keys()].includes(''), false);
check('population: the run reports the directories it watched', run(() => 'idle').stateDirs, ['guard-a/state', 'guard-b/state', 'state']);
check('temp: the default root is the system temp directory, read when called', (() => {
  const variables = ['TEMP', 'TMP', 'TMPDIR'];
  const saved = variables.map((name) => process.env[name]);

  write(path.join(tempRoot, 'marker'));
  for (const name of variables) process.env[name] = tempRoot;

  const names = [...snapshotOf({ home: homeRoot, env: home.env }).temp.keys()];

  variables.forEach((name, at) => {
    if (saved[at] === undefined) delete process.env[name];
    else process.env[name] = saved[at];
  });
  unlinkSync(path.join(tempRoot, 'marker'));

  return names;
})(), ['marker']);

// --- an untouched run ---
check('untouched run: GREEN, no change at all', run(() => 'idle').changes, []);
check('untouched run: the result of the run comes back', run(() => 42).result, 42);

// --- writes under the state directories ---
check('a fixture selftest writing under the home guard state is RED naming the path', summary(run(() => write(path.join(process.env.HOOK_CLAUDE_HOME, 'guard-a', 'state', 'journal.jsonl'))).changes), ['state:guard-a/state/journal.jsonl:added']);
unlinkSync(stateOf('guard-a/state/journal.jsonl'));
check('a write into a wholly ignored guard is RED too', summary(run(() => write(stateOf('guard-b/state/x.json'))).changes), ['state:guard-b/state/x.json:added']);
unlinkSync(stateOf('guard-b/state/x.json'));
check('a write into the top-level state directory is RED', summary(run(() => write(stateOf('state/y.json'))).changes), ['state:state/y.json:added']);
unlinkSync(stateOf('state/y.json'));
check('a guard that did not exist before the run and that no list names is RED naming its file (the population is derived)', summary(run(() => write(stateOf('zz-unlisted/state/leak.json'))).changes), ['state:zz-unlisted/state/leak.json:added', 'state:zz-unlisted/state:added']);
rmSync(stateOf('zz-unlisted'), { recursive: true, force: true });
check('a deleted state file is RED (and the directory it emptied leaves the population)', summary(run(() => unlinkSync(stateOf('guard-a/state/seed.json'))).changes), ['state:guard-a/state/seed.json:removed', 'state:guard-a/state:removed']);
write(stateOf('guard-a/state/seed.json'), '{}');
check('a rewrite of the same size with a new mtime is RED (content cannot be told apart by size)', summary(run(() => {
  write(stateOf('guard-a/state/seed.json'), '[]');
  utimesSync(stateOf('guard-a/state/seed.json'), new Date(2020, 0, 1), new Date(2020, 0, 1));
}).changes), ['state:guard-a/state/seed.json:changed']);
write(stateOf('guard-a/state/seed.json'), '{}');
utimesSync(stateOf('guard-a/state/seed.json'), new Date(2022, 0, 1), new Date(2022, 0, 1));
check('a grown file whose mtime is put back is RED (the size alone tells)', summary(run(() => {
  write(stateOf('guard-a/state/seed.json'), '{"grown":true}');
  utimesSync(stateOf('guard-a/state/seed.json'), new Date(2022, 0, 1), new Date(2022, 0, 1));
}).changes), ['state:guard-a/state/seed.json:changed']);
write(stateOf('guard-a/state/seed.json'), '{}');
check('a rewrite of the same bytes with a new mtime is RED (the touch is the pollution)', summary(run(() => utimesSync(stateOf('guard-a/state/seed.json'), new Date(2021, 0, 1), new Date(2021, 0, 1))).changes), ['state:guard-a/state/seed.json:changed']);
check('a grown state file is RED', summary(run(() => write(stateOf('guard-b/state/seed.json'), '{"more":true}')).changes), ['state:guard-b/state/seed.json:changed']);
write(stateOf('guard-b/state/seed.json'), '{}');
check('a new empty state subdirectory is RED', summary(run(() => mkdirSync(stateOf('guard-a/state/sub'))).changes), ['state:guard-a/state/sub:added']);
rmSync(stateOf('guard-a/state/sub'), { recursive: true });
check('a write into an ignored directory that is not a state directory is NOT pollution (live transcripts)', run(() => write(stateOf('projects/transcript.jsonl'), 'more\n')).changes, []);
write(stateOf('projects/transcript.jsonl'), 'line\n');
symlinkSync(stateOf('projects'), stateOf('guard-b/state/linked'), 'junction');
check('a link inside a state directory is not entered: a write to its target is NOT pollution', run(() => write(stateOf('projects/other.jsonl'))).changes, []);
unlinkSync(stateOf('projects/other.jsonl'));
unlinkSync(stateOf('guard-b/state/linked'));

// --- the main checkout ---
write(stateOf('guard-a/state/seed.json'), '{}');
check('checkout: a modified tracked file is RED naming it', summary(run(() => write(stateOf('guard-a/code.mjs'), 'export {};\n')).changes), ['checkout:guard-a/code.mjs:added']);
check('checkout: touching a file that was already modified before the run is RED (same status line, new content)', summary(run(() => write(stateOf('guard-a/code.mjs'), 'export const more = 1;\n')).changes), ['checkout:guard-a/code.mjs:changed']);
check('checkout: restoring the file is RED as well (the status line disappears)', summary(run(() => home.git(['checkout', '--', 'guard-a/code.mjs'])).changes), ['checkout:guard-a/code.mjs:removed']);
check('checkout: a new untracked file is RED', summary(run(() => write(stateOf('guard-a/new.mjs'), 'export {};\n')).changes), ['checkout:guard-a/new.mjs:added']);
unlinkSync(stateOf('guard-a/new.mjs'));
check('checkout: a staged rename is RED naming both paths, never paired into a bogus one', summary(run(() => home.git(['mv', 'guard-c/quiet.mjs', 'guard-c/loud.mjs'])).changes), ['checkout:guard-c/loud.mjs:added', 'checkout:guard-c/quiet.mjs:added']);
home.git(['mv', 'guard-c/loud.mjs', 'guard-c/quiet.mjs']);
home.git(['reset', '-q', '--hard']);
check('checkout: a deleted tracked file is RED', summary(run(() => unlinkSync(stateOf('guard-c/quiet.mjs'))).changes), ['checkout:guard-c/quiet.mjs:added']);
home.git(['checkout', '--', 'guard-c/quiet.mjs']);
write(stateOf('guard-c/quiet.mjs'), 'export const quiet = 2;\n');
check('checkout: staging an already-modified file is RED (same content, new status)', summary(run(() => home.git(['add', 'guard-c/quiet.mjs'])).changes), ['checkout:guard-c/quiet.mjs:changed']);
home.git(['reset', '-q', '--hard']);
mkdirSync(stateOf('guard-a/untracked-dir'));
write(stateOf('guard-a/untracked-dir/one.txt'));
utimesSync(stateOf('guard-a/untracked-dir'), new Date(2020, 0, 1), new Date(2020, 0, 1));
check('checkout: a file added inside an already-untracked directory is RED (git collapses it to the directory)', summary(run(() => write(stateOf('guard-a/untracked-dir/two.txt'))).changes), ['checkout:guard-a/untracked-dir/:changed']);
rmSync(stateOf('guard-a/untracked-dir'), { recursive: true });
check('checkout: after the repair the tree is clean again', run(() => 'idle').changes, []);

write(path.join(checkoutBox.repoDir, 'tracked.txt'), 'a');
checkoutBox.git(['add', '-A']);
checkoutBox.git(['commit', '-q', '-m', 'seed']);
const apart = { ...options, checkout: checkoutBox.repoDir };
check('checkout: another checkout than the home is watched on its own', summary(measureRun(() => write(path.join(checkoutBox.repoDir, 'tracked.txt'), 'b'), apart).changes), ['checkout:tracked.txt:added']);
write(path.join(checkoutBox.repoDir, 'tracked.txt'), 'a');
check('checkout: and a home write is not mistaken for a change of that other checkout', summary(measureRun(() => write(stateOf('state/z.json')), apart).changes), ['state:state/z.json:added']);
unlinkSync(stateOf('state/z.json'));

// --- the temp root ---
check('temp: a leftover entry the run created is RED naming it', summary(run(() => write(path.join(tempRoot, 'leak-1', 'file'))).changes), ['temp:leak-1:added']);
rmSync(path.join(tempRoot, 'leak-1'), { recursive: true });
check('temp: an entry the run created and removed is GREEN', run(() => {
  write(path.join(tempRoot, 'gone', 'file'));
  rmSync(path.join(tempRoot, 'gone'), { recursive: true });
}).changes, []);
write(path.join(tempRoot, 'older'), 'x');
check('temp: an entry that existed before the run and that the run rewrites is not a leftover', run(() => write(path.join(tempRoot, 'older'), 'longer text')).changes, []);
check('temp: an entry that existed before the run and that the run removes is not a leftover', run(() => unlinkSync(path.join(tempRoot, 'older'))).changes, []);
check('compare: the changes come sorted by area then path', compareSnapshots({ state: new Map(), checkout: new Map(), temp: new Map() }, { state: new Map([['b', 's'], ['a', 's']]), checkout: new Map([['z', 's']]), temp: new Map([['c', 's']]) }).map(({ area, path: changed }) => `${area}/${changed}`), ['checkout/z', 'state/a', 'state/b', 'temp/c']);
check('temp: compare reads only additions of the temp root', summary(compareSnapshots({ state: new Map(), checkout: new Map(), temp: new Map([['a', 's']]) }, { state: new Map(), checkout: new Map(), temp: new Map([['a', 't'], ['b', 's']]) })), ['temp:b:added']);

// --- when the population cannot be measured ---
check('failure: a home that is not a git repository is refused, in both languages', (() => {
  try {
    snapshotOf({ home: tempRoot, tempDir: tempRoot, env: { ...home.env, GIT_CEILING_DIRECTORIES: scratch } });

    return 'no error';
  } catch (error) {
    return [error instanceof SnapshotError, error.message.includes('@es')];
  }
})(), [true, true]);
check('failure: a throwing run propagates and is never read as GREEN', (() => {
  try {
    run(() => {
      throw new Error('boom');
    });

    return 'no error';
  } catch (error) {
    return error.message;
  }
})(), 'boom');

// --- the locator scan: candidates, never a verdict ---
const uses = locateHomedirUses({ root: homeRoot, env: home.env });
check('locator: tracked and untracked sources that call homedir() are candidates, with line and mechanism; an ignored one and a bare import are not', uses, [{ file: 'guard-a/code.mjs', line: 2, mechanism: 'guard-a' }, { file: 'guard-a/fresh.mjs', line: 2, mechanism: 'guard-a' }]);
check('locator: a root that is not a repository gives no candidates instead of failing', locateHomedirUses({ root: tempRoot, env: { ...home.env, GIT_CEILING_DIRECTORIES: scratch } }), []);
check('locator: a green run never runs the scan, a red run runs it once', (() => {
  let scans = 0;
  const locate = () => {
    scans += 1;

    return [];
  };

  measureRun(() => 'idle', { ...options, locate });

  const afterGreen = scans;

  measureRun(() => write(stateOf('state/scan.json')), { ...options, locate });
  unlinkSync(stateOf('state/scan.json'));

  return [afterGreen, scans];
})(), [0, 1]);
check('locator: a candidate annotates a change but a change without a candidate is still reported', annotate([{ area: 'state', path: 'guard-a/state/j', change: 'added' }, { area: 'state', path: 'guard-b/state/j', change: 'added' }], uses).map((change) => change.candidate), [true, false]);
check('locator: a run that writes where no source calls homedir() is still RED', summary(run(() => write(stateOf('guard-b/state/q.json'))).changes), ['state:guard-b/state/q.json:added']);
unlinkSync(stateOf('guard-b/state/q.json'));
check('locator: a candidate whose directory the run leaves alone does not make the run RED', run(() => uses.length).changes, []);

// --- the command line ---
const fixture = path.join(scratch, 'writer.mjs');
const quietFixture = path.join(scratch, 'quiet.mjs');
const failing = path.join(scratch, 'failing.mjs');
const toucher = path.join(scratch, 'toucher.mjs');
const noisyFixture = path.join(scratch, 'noisy.mjs');
const locationsUrl =pathToFileURL(path.resolve(import.meta.dirname, '..', 'hook-state', 'locations.mjs')).href;

write(fixture, `import { mkdirSync, writeFileSync } from 'node:fs';\nimport path from 'node:path';\nimport { claudeHome } from '${locationsUrl}';\nconst dir = path.join(claudeHome(), 'guard-a', 'state');\nmkdirSync(dir, { recursive: true });\nwriteFileSync(path.join(dir, 'child.json'), '{}');\n`);
write(toucher, "import { mkdirSync, writeFileSync } from 'node:fs';\nimport path from 'node:path';\nmkdirSync(path.dirname(process.argv[2]), { recursive: true });\nwriteFileSync(process.argv[2], 'touched');\n");
write(quietFixture, 'process.exit(0);\n');
write(noisyFixture, "console.log('child-said-hi');\n");
write(failing, 'process.exit(3);\n');

const red = capture();
const redCode = main(['--home', homeRoot, '--temp', tempRoot, '--', process.execPath, fixture], { sink: red.sink, env: home.env });

check('cli: a child that writes under the home state is RED, exit 1', redCode, 1);
check('cli: the report names the path, flags the candidate and ends RED, all bilingual', [red.lines.some((line) => line.includes('guard-a/state/child.json')), red.lines.some((line) => line.includes('guard-a') && line.includes('homedir()')), red.lines.at(-1).includes('RED')], [true, true, true]);
check('cli: every printed line carries its Spanish half', red.lines.filter((line) => !line.includes('@es')), []);
check('cli: the red line counts what was polluted', red.lines.at(-1).includes('polluted 1 path'), true);
unlinkSync(stateOf('guard-a/state/child.json'));

const plain = capture();

check('cli: a change in a directory no source calls homedir() from is RED without a candidate line', [main(['--home', homeRoot, '--temp', tempRoot, '--', process.execPath, toucher, stateOf('guard-b/state/plain.json')], { sink: plain.sink, env: home.env }), plain.lines.some((line) => line.includes('candidate'))], [1, false]);
unlinkSync(stateOf('guard-b/state/plain.json'));

const apartTemp = capture();

check('cli: --temp names the root watched for leftovers', [main(['--home', homeRoot, '--temp', tempRoot, '--', process.execPath, toucher, path.join(tempRoot, 'cli-leak')], { sink: apartTemp.sink, env: home.env }), apartTemp.lines.some((line) => line.includes('cli-leak'))], [1, true]);
unlinkSync(path.join(tempRoot, 'cli-leak'));

const apartCheckout = capture();

check('cli: --checkout names the checkout watched, apart from the home', [main(['--home', homeRoot, '--checkout', checkoutBox.repoDir, '--temp', tempRoot, '--', process.execPath, toucher, path.join(checkoutBox.repoDir, 'tracked.txt')], { sink: apartCheckout.sink, env: home.env }), apartCheckout.lines.some((line) => line.includes('tracked.txt'))], [1, true]);
write(path.join(checkoutBox.repoDir, 'tracked.txt'), 'a');

const elsewhere = capture();

check('cli: --home wins over the environment: a write into the environment home is not seen from another home', [main(['--home', checkoutBox.repoDir, '--temp', tempRoot, '--', process.execPath, fixture], { sink: elsewhere.sink, env: home.env }), elsewhere.lines.some((line) => line.includes('Watching 0'))], [0, true]);
unlinkSync(stateOf('guard-a/state/child.json'));

const direct = spawnSync(process.execPath, [path.resolve(import.meta.dirname, 'pollution.mjs'), '--home', homeRoot, '--temp', tempRoot, '--', process.execPath, noisyFixture], { encoding: 'utf8', env: home.env });

check('cli: run as a script it exits with the verdict, prints it, and lets the command speak', [direct.status, direct.stdout.includes('GREEN'), direct.stdout.includes('child-said-hi')], [0, true, true]);

const green = capture();

check('cli: a child that touches nothing is GREEN, exit 0, the home taken from the environment', main(['--temp', tempRoot, '--', process.execPath, quietFixture], { sink: green.sink, env: home.env }), 0);
check('cli: the green report says how many state directories it watched', green.lines.some((line) => line.includes('3') && line.includes('state')), true);

const failed = capture();

check('cli: a failing command does not change the pollution verdict, and its exit status is reported', [main(['--temp', tempRoot, '--', process.execPath, failing], { sink: failed.sink, env: home.env }), failed.lines.some((line) => line.includes('ended with status 3') && line.includes('@es'))], [0, true]);

check('cli: a green run does not announce a command failure', green.lines.some((line) => line.includes('ended with status')), false);

const misuse = capture();

check('cli: an unknown option is not measured, exit 2', main(['--bogus', 'x', '--', process.execPath, quietFixture], { sink: capture().sink, env: home.env }), 2);
const valueless = capture();

check('cli: an option without a value is usage, exit 2 (not a home called `--`)', [main(['--home', '--', process.execPath, quietFixture], { sink: valueless.sink, env: home.env }), valueless.lines[0].includes('pollution.mjs [--home')], [2, true]);
check('cli: a command without `--` is not measured, exit 2', main([process.execPath, quietFixture], { sink: capture().sink, env: home.env }), 2);
check('cli: an unexpected failure is not swallowed as "not measured"', (() => {
  try {
    main(['--temp', path.join(scratch, 'no-such-dir'), '--', process.execPath, quietFixture], { sink: capture().sink, env: home.env });

    return 'no error';
  } catch {
    return 'threw';
  }
})(), 'threw');

check('cli: no `--` at all is not measured, exit 2, and the usage goes to the error stream', [main(['--home', homeRoot], { sink: misuse.sink, env: home.env }), misuse.errors.length, misuse.lines[0].includes('pollution.mjs [--home')], [2, 1, true]);
check('cli: a `--` with no command after it is usage, exit 2', main(['--home', homeRoot, '--'], { sink: capture().sink, env: home.env }), 2);
const unstartable = capture();
const notRepository = capture();

check('cli: a command that cannot start is not measured, exit 2, explained on the error stream', [main(['--temp', tempRoot, '--', path.join(scratch, 'no-such-program')], { sink: unstartable.sink, env: home.env }), unstartable.errors.length], [2, 1]);
check('cli: a home that is not a repository is not measured, exit 2, explained on the error stream', [main(['--home', tempRoot, '--temp', tempRoot, '--', process.execPath, quietFixture], { sink: notRepository.sink, env: { ...home.env, GIT_CEILING_DIRECTORIES: scratch } }), notRepository.errors.length], [2, 1]);

// --- language ---
check('language: every message has both halves', Object.entries(MESSAGES).filter(([, { en, es }]) => !en || !es).map(([id]) => id), []);
check('language: the Spanish halves keep their accents', [MESSAGES.red.es.includes('CONTAMINACIÓN'), MESSAGES['change-added'].es.includes('CONTAMINACIÓN')], [true, true]);
check('language: the scratch the selftest made is real directories only', statSync(tempRoot).isDirectory(), true);

finish();
