#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `selftest-fixtures/git-sandbox.mjs`. Every case runs on repositories CONSTRUCTED
 * in a temp directory, never on a real repository of the machine.
 *
 * THE STATE SPACE: a sandbox created under a directory that sits INSIDE an outer repository (the escape the
 * ceiling exists to stop, proved by a control that climbs without it), a parent reached through a junction or
 * symlink (git sees the real path, so a ceiling spelled with the link does not match), a process environment
 * that already points git at another repository (what a git hook exports), the identity and configuration
 * isolation that lets a fixture commit, the cleanup (links removed without following them, nested ones too,
 * read-only files, a second cleanup), the failures (a parent that does not exist, a `git init` that fails,
 * and that the failed one leaves nothing behind) and the language of every thrown text.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `git-sandbox.mjs`. Cada caso corre sobre repositorios CONSTRUIDOS en un
 * directorio temporal, nunca sobre un repositorio real. Espacio de estados: un sandbox bajo un directorio
 * DENTRO de un repositorio externo (con un control que sube sin el techo), un padre alcanzado por junction o
 * symlink, un entorno que ya apunta git a otro repositorio, el aislamiento de identidad y configuración, la
 * limpieza (enlaces sin seguirlos, anidados, ficheros de solo lectura, una segunda limpieza), los fallos y el
 * idioma de cada texto lanzado.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createGitSandbox, MESSAGES } from './git-sandbox.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/**
 * What `action` returns, or `'threw'` after recording the throw: a throw is a failed check, never an
 * uncaught crash that a mutant could hide behind. @es Lo que devuelve `action`, o `'threw'`.
 */
function safely(action) {
  try {
    return action();
  } catch (error) {
    failures.push(`threw — ${error.message}`);

    return 'threw';
  }
}

/**
 * Ends the run: removes the scratch directory and reports. An uncaught throw is recorded as a FAILED check
 * here, so a mutant that only crashes the selftest cannot pass as killed by a crash. The scratch holds
 * junctions made by the cases; they are unlinked first so the removal never follows one.
 * @es Termina la corrida. Un throw sin capturar se registra como check FALLIDO. Los junctions se desenlazan primero.
 */
function finish() {
  if (existsSync(path.join(scratch, 'via-link'))) unlinkSync(path.join(scratch, 'via-link'));

  rmSync(scratch, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(`git-sandbox selftest FAILED (${failures.length}/${passed + failures.length}):\n${failures.join('\n')}`);
    process.exit(1);
  }

  console.log(`git-sandbox selftest: ${passed} checks passed`);
}

process.on('uncaughtException', (error) => {
  failures.push(`threw — ${error.message}`);
  finish();
});

const GIT_SELECTORS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR'];
const scratch = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'git-sandbox-selftest-')));
const sameDirectory = (left, right) => path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
const emptyConfig = path.join(scratch, 'empty.gitconfig');
const leakyConfig = path.join(scratch, 'leaky.gitconfig');

writeFileSync(emptyConfig, '');
writeFileSync(leakyConfig, '[alias]\n\tleak = status\n');

/** The selftest's own git, on the repository it constructs: no inherited selector, no ceiling, no user config. @es El git propio del selftest. */
function rawGit(args, cwd) {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Outer', GIT_AUTHOR_EMAIL: 'outer@example.test', GIT_COMMITTER_NAME: 'Outer', GIT_COMMITTER_EMAIL: 'outer@example.test' };

  for (const name of [...GIT_SELECTORS, 'GIT_CEILING_DIRECTORIES']) delete env[name];

  return spawnSync('git', args, { cwd, env, encoding: 'utf8' });
}

/**
 * Everything about a repository a stray write would change: tracked changes, staged content, HEAD, history
 * size, the index and the local configuration. Untracked files are left out ON PURPOSE: the sandboxes live
 * under the outer repository while they exist, so they show there as untracked until they are cleaned.
 * @es Todo lo que cambiaría una escritura ajena. Los no rastreados se dejan fuera A PROPÓSITO: los sandboxes viven bajo el repositorio externo mientras existen.
 */
function snapshotOf(repo) {
  return ['status --porcelain=v1 -uno', 'rev-parse HEAD', 'rev-list --all --count', 'ls-files', 'config --local --list'].map((command) => rawGit(command.split(' '), repo).stdout);
}

// --- the outer repository the sandboxes are created under ---
const outer = path.join(scratch, 'outer');
const work = path.join(outer, 'work');

mkdirSync(work, { recursive: true });
rawGit(['init', '-q', '-b', 'main', outer], scratch);
writeFileSync(path.join(outer, 'tracked.txt'), 'tracked\n');
rawGit(['add', 'tracked.txt'], outer);
rawGit(['commit', '-q', '-m', 'outer commit'], outer);

const outerBefore = snapshotOf(outer);
const sandbox = safely(() => createGitSandbox({ parent: work }));

// --- the sandbox itself ---
check('sandbox: the root lies directly under the real parent, named for what it is', [path.dirname(sandbox.root) === realpathSync.native(work), path.basename(sandbox.root).startsWith('git-sandbox-')], [true, true]);
check('sandbox: the repository is initialised inside the root', [existsSync(path.join(sandbox.repoDir, '.git')), sameDirectory(path.dirname(sandbox.repoDir), sandbox.root)], [true, true]);
check('sandbox: git run in it sees the sandbox repository as its top level', sameDirectory(sandbox.git(['rev-parse', '--show-toplevel']).stdout.trim(), sandbox.repoDir), true);
const second = createGitSandbox({ parent: work });

check('sandbox: two sandboxes never share a root', second.root !== sandbox.root, true);

// --- the ceiling (H8-d): a directory outside the repo does not climb into the outer repository ---
const plain = sandbox.plainDir('plain');
const noClimb = sandbox.git(['rev-parse', '--show-toplevel'], { cwd: plain });
const climbing = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: plain, encoding: 'utf8', env: Object.fromEntries(Object.entries(sandbox.env).filter(([name]) => name !== 'GIT_CEILING_DIRECTORIES')) });

check('ceiling: the control, without it, climbs into the outer repository (the fixture really sits under one)', [climbing.status, sameDirectory(climbing.stdout.trim(), outer)], [0, true]);
check('ceiling: with it, rev-parse in a plain directory fails to climb', noClimb.status !== 0, true);
check('ceiling: the variable names the real path of the parent', sandbox.env.GIT_CEILING_DIRECTORIES, realpathSync.native(work));
check('ceiling: a plain directory is created inside the root', [existsSync(plain), sameDirectory(path.dirname(plain), sandbox.root)], [true, true]);

// --- identity and configuration isolation: a fixture can commit on a machine with no git identity ---
writeFileSync(path.join(sandbox.repoDir, 'a.txt'), 'a\n');
check('commit: add and commit work with no user configuration', [sandbox.git(['add', 'a.txt']).status, sandbox.git(['commit', '-q', '-m', 'first']).status], [0, 0]);
check('commit: the author and the committer are the sandbox identity', sandbox.git(['log', '-1', '--format=%an <%ae> %cn <%ce>']).stdout.trim(), 'Git Sandbox <git-sandbox@example.test> Git Sandbox <git-sandbox@example.test>');
check('config: the system configuration is switched off and the global one is an empty file inside the sandbox', [sandbox.env.GIT_CONFIG_NOSYSTEM, sameDirectory(path.dirname(sandbox.env.GIT_CONFIG_GLOBAL), sandbox.root), readFileSync(sandbox.env.GIT_CONFIG_GLOBAL, 'utf8')], ['1', true, '']);
check('config: the initial branch is main', sandbox.git(['symbolic-ref', '--short', 'HEAD']).stdout.trim(), 'main');

// --- a parent reached through a junction: git sees the real path, so the ceiling must be the real path ---
const viaLink = path.join(scratch, 'via-link');

symlinkSync(work, viaLink, 'junction');

const linked = safely(() => createGitSandbox({ parent: viaLink }));
const linkedPlain = linked.plainDir('plain');

check('junction parent: the ceiling is the resolved path, not the link', linked.env.GIT_CEILING_DIRECTORIES, realpathSync.native(work));
check('junction parent: a plain directory still does not climb into the outer repository', linked.git(['rev-parse', '--show-toplevel'], { cwd: linkedPlain }).status !== 0, true);

// --- a process that already points git elsewhere (what a git hook exports) ---
const inherited = Object.fromEntries([...GIT_SELECTORS, 'GIT_CONFIG_GLOBAL'].map((name) => [name, process.env[name]]));

process.env.GIT_CONFIG_GLOBAL = leakyConfig;

process.env.GIT_DIR = path.join(outer, '.git');
process.env.GIT_WORK_TREE = outer;
process.env.GIT_INDEX_FILE = path.join(outer, '.git', 'index');
process.env.GIT_OBJECT_DIRECTORY = path.join(outer, '.git', 'objects');
process.env.GIT_COMMON_DIR = path.join(outer, '.git');

const hooked = safely(() => createGitSandbox({ parent: scratch }));

for (const name of GIT_SELECTORS) check(`environment: ${name} is not passed on to the sandbox git`, name in hooked.env, false);

check('environment: with every selector exported, the sandbox still has its own top level', sameDirectory(hooked.git(['rev-parse', '--show-toplevel']).stdout.trim(), hooked.repoDir), true);
check('environment: a global configuration exported by the process is real (control) and the sandbox does not read it', [spawnSync('git', ['config', '--get', 'alias.leak'], { cwd: scratch, encoding: 'utf8' }).status, hooked.git(['config', '--get', 'alias.leak']).status], [0, 1]);

for (const [name, value] of Object.entries(inherited)) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

check('environment: the outer repository was not touched by a sandbox built under hook variables', snapshotOf(outer), outerBefore);

// --- cleanup: links are removed WITHOUT following them, at any depth ---
const external = path.join(scratch, 'external');

mkdirSync(external);
writeFileSync(path.join(external, 'canary.txt'), 'canary');

const doomed = createGitSandbox({ parent: scratch });

mkdirSync(path.join(doomed.root, 'deep', 'er'), { recursive: true });
symlinkSync(external, path.join(doomed.root, 'deep', 'er', 'nested-link'), 'junction');
symlinkSync(external, path.join(doomed.root, 'top-link'), 'junction');
writeFileSync(path.join(doomed.root, 'deep', 'readonly.txt'), 'locked');
chmodSync(path.join(doomed.root, 'deep', 'readonly.txt'), 0o444);
writeFileSync(path.join(doomed.repoDir, 'b.txt'), 'b\n');
doomed.git(['add', 'b.txt']);
doomed.git(['commit', '-q', '-m', 'objects are read-only on Windows']);

const removedLinks = safely(() => doomed.cleanup());

check('cleanup: the root is gone', existsSync(doomed.root), false);
check('cleanup: it reports the two links it unlinked without following', removedLinks, 2);
check('cleanup: the directory the links pointed at is intact', [existsSync(path.join(external, 'canary.txt')), readdirSync(external)], [true, ['canary.txt']]);
check('cleanup: a second cleanup does nothing and does not throw', safely(() => doomed.cleanup()), 0);

// --- failures ---
const missingParent = path.join(scratch, 'does-not-exist');
const noParent = (() => {
  try {
    createGitSandbox({ parent: missingParent });

    return 'no error';
  } catch (error) {
    return error.message;
  }
})();
const before = readdirSync(scratch).sort();
const failure = (runGit) => {
  try {
    createGitSandbox({ parent: scratch, runGit });

    return 'no error';
  } catch (error) {
    return error.message;
  }
};
const failedInit = failure(() => ({ status: 1, stdout: '', stderr: 'init exploded\r\nsecond line\n' }));
const silentInit = failure(() => ({ status: 1 }));

check('failure: a missing parent throws a bilingual error naming it', [noParent.includes(missingParent), noParent.includes(' @es '), noParent.startsWith('The parent directory')], [true, true, true]);
check('failure: a failed git init throws a bilingual error with the first line of the git text', [failedInit.includes('init exploded.'), failedInit.includes('second line'), failedInit.includes(' @es '), failedInit.startsWith('git init failed')], [true, false, true, true]);
check('failure: a failed git init that printed nothing still throws the bilingual error', [silentInit.startsWith('git init failed'), silentInit.includes(' @es ')], [true, true]);

const byDefault = createGitSandbox();

check('default parent: the sandbox is created in the real system temp directory', [path.dirname(byDefault.root) === realpathSync.native(tmpdir()), byDefault.env.GIT_CEILING_DIRECTORIES === realpathSync.native(tmpdir())], [true, true]);
check('default parent: and it is cleaned like any other', [byDefault.cleanup(), existsSync(byDefault.root)], [0, false]);
check('failure: a failed init leaves no sandbox directory behind', readdirSync(scratch).sort(), before);
check('failure: a git that cannot even start is reported by its error', (() => {
  try {
    createGitSandbox({ parent: scratch, runGit: () => ({ status: null, error: new Error('spawn git ENOENT') }) });

    return 'no error';
  } catch (error) {
    return error.message.includes('spawn git ENOENT');
  }
})(), true);

// --- language ---
check('language: every message of the table has both halves', Object.entries(MESSAGES).filter(([, { en, es }]) => !en || !es).map(([id]) => id), []);
check('language: the Spanish halves keep their accents', [MESSAGES.parentMissing.es.includes('él'), MESSAGES.initFailed.es.includes('falló')], [true, true]);
check('language: the table is not empty', Object.keys(MESSAGES).length, 2);

safely(() => sandbox.cleanup());
safely(() => second.cleanup());
safely(() => linked.cleanup());
safely(() => hooked.cleanup());
safely(() => unlinkSync(viaLink));

check('cleanup: removing the junction parent did not remove the repository it led to', existsSync(path.join(outer, 'tracked.txt')), true);
check('cleanup: the outer repository is exactly as it was after every sandbox came and went', snapshotOf(outer), outerBefore);
check('cleanup: and not one untracked file is left in it', rawGit(['status', '--porcelain=v1', '-uall'], outer).stdout, '');

finish();
