#!/usr/bin/env node
/**
 * Proof of the one question `git.mjs` owns: how the kit runs git. Every state is a REAL git: a repository built in
 * a sandbox for the status and output, a hanging alias for the timeout, a PATH without git for a git that never
 * started, and a parent process whose environment selects ANOTHER repository (as a git hook's does) for the
 * environment clearing. The scripted double `fake.mjs` is proved here too, since every other selftest will trust it.
 *
 * @es Prueba de la pregunta que posee `git.mjs`: cómo el kit corre git. Cada estado es un git REAL: un repositorio
 * en un sandbox para el estado y la salida, un alias colgado para el tiempo, un PATH sin git para un git que nunca
 * arrancó, y un proceso padre cuyo entorno elige OTRO repositorio (como el de un hook de git) para la limpieza del
 * entorno. El doble guionado `fake.mjs` también se prueba aquí, porque todos los demás selftests confiarán en él.
 */

import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createGitSandbox } from '../selftest-fixtures/git-sandbox.mjs';

const here = (name) => pathToFileURL(path.join(import.meta.dirname, name)).href;
const port = await import(here('git.mjs'));
const { createFakeGit } = await import(here('fake.mjs'));
const { runGit, gitOutput, gitAsker, mustAsk, entriesOf, GitFailure, GIT_TIMEOUT_MS } = port;

const results = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

/** The value of `run`, or 'THROWS' so a crash is a failed check and not an aborted selftest. @es El valor, o 'THROWS'. */
const attempt = (run) => {
  try {
    return run();
  } catch {
    return 'THROWS';
  }
};

/** The error `run` throws, as `{ kind, message }`; `{ kind: 'none' }` when it does not throw. @es El error que lanza `run`. */
const thrown = (run) => {
  try {
    run();
    return { kind: 'none', message: '' };
  } catch (error) {
    return { kind: error instanceof GitFailure ? 'GitFailure' : 'other', message: String(error.message) };
  }
};

const sandbox = createGitSandbox();
process.once('exit', () => sandbox.cleanup());
const repo = sandbox.repoDir;
const other = createGitSandbox({ parent: sandbox.root });
process.once('exit', () => other.cleanup());

writeFileSync(path.join(repo, 'base.txt'), 'base');
writeFileSync(path.join(repo, 'big.txt'), 'x'.repeat(1_500_000));
sandbox.git(['add', 'base.txt', 'big.txt']);
sandbox.git(['commit', '-q', '-m', 'base']);

// Status and output. / Estado y salida.
const inside = attempt(() => runGit(repo, ['rev-parse', '--is-inside-work-tree']));
check('a successful command reports status 0, its raw stdout, empty stderr and no timeout', inside, { status: 0, stdout: 'true\n', stderr: '', timedOut: false });
const refused = attempt(() => runGit(repo, ['rev-parse', '--verify', 'no-such-ref']));
check('a failing command reports git\'s own non-zero status, not null, and says why', [refused.status !== 0 && refused.status !== null, refused.stderr.length > 0, refused.timedOut], [true, true, false]);
check('the working directory is the one given', attempt(() => runGit(repo, ['rev-parse', '--show-toplevel']).status), 0);
check('a directory that is no repository is answered by git, not by an exception', attempt(() => runGit(sandbox.plainDir('plain'), ['rev-parse', '--git-dir']).status !== 0), true);
check('the git options come before the arguments', attempt(() => runGit(undefined, ['rev-parse', '--show-toplevel'], { gitOptions: ['-C', repo] }).stdout), attempt(() => runGit(repo, ['rev-parse', '--show-toplevel']).stdout));
check('input reaches the standard input of git', attempt(() => runGit(repo, ['hash-object', '--stdin'], { input: 'hello\n' }).stdout), 'ce013625030ba8dba906f756967f9e9ca394464a\n');
check('an answer above the default buffer of node is delivered whole', attempt(() => runGit(repo, ['show', 'HEAD:big.txt']).stdout.length), 1_500_000);
check('the default timeout is 15 seconds', GIT_TIMEOUT_MS, 15000);

// Timeout and a git that never started. / Tiempo agotado y un git que nunca arrancó.
const hanging = `alias.hang=!"${process.execPath.replaceAll('\\', '/')}" -e "setTimeout(()=>{},5000)"`;
const slow = attempt(() => runGit(undefined, ['-c', hanging, 'hang'], { timeoutMs: 400 }));
check('a command that outlives its timeout reports null status and timedOut', [slow.status, slow.timedOut], [null, true]);
const missing = attempt(() => runGit(repo, ['--version'], { env: { PATH: '', Path: '' } }));
check('a missing git reports null status, empty stdout, not timed out, and names the failure on stderr', [missing.status, missing.stdout, missing.timedOut, missing.stderr.length > 0], [null, '', false, true]);

// Environment. / Entorno.
const SELECTORS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'];
const echo = '!echo "GIT_DIR=$GIT_DIR GIT_WORK_TREE=$GIT_WORK_TREE GIT_INDEX_FILE=$GIT_INDEX_FILE GIT_COMMON_DIR=$GIT_COMMON_DIR PROMPT=$GIT_TERMINAL_PROMPT EXTRA=$KIT_EXTRA"';
const seen = (options) => attempt(() => runGit(repo, ['-c', `alias.kitenv=${echo}`, 'kitenv'], options).stdout);
const inherited = Object.fromEntries(SELECTORS.map((name) => [name, process.env[name]]));

for (const name of SELECTORS) process.env[name] = path.join(other.repoDir, `.git-${name}`);
const inheritedView = seen({});
const forcedView = seen({ env: { GIT_TERMINAL_PROMPT: '1', KIT_EXTRA: 'yes' } });
for (const name of SELECTORS) {
  check(`${name} of the parent is not passed to git`, String(inheritedView).includes(`${name}=${path.join(other.repoDir, `.git-${name}`)}`), false);
}
check('with every selector set in the parent, git still answers about the directory it was given', attempt(() => runGit(repo, ['rev-parse', '--show-toplevel']).status), 0);
check('git never prompts, even when the caller asks for it', String(forcedView).includes('PROMPT=0'), true);
check('the variables the caller adds in env reach git', String(forcedView).includes('EXTRA=yes'), true);
for (const [name, value] of Object.entries(inherited)) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

// Selectors: inherited ones are cleared unless asked for; explicit ones are honoured. / Selectores.
const otherGit = path.join(other.repoDir, '.git');
const gitDirOf = (run) => attempt(() => run().stdout.trim());
const ownGitDir = gitDirOf(() => runGit(repo, ['rev-parse', '--git-dir']));
const fleetGit = await import(pathToFileURL(path.join(import.meta.dirname, '..', 'fleet-kit', 'lib', 'git.mjs')).href);
const landingGit = await import(pathToFileURL(path.join(import.meta.dirname, '..', 'worktree-landing', 'git.mjs')).href);

process.env.GIT_DIR = otherGit;
check('an inherited GIT_DIR is cleared by default', gitDirOf(() => runGit(repo, ['rev-parse', '--git-dir'])), ownGitDir);
check('an inherited GIT_DIR is kept with inheritSelectors', gitDirOf(() => runGit(repo, ['rev-parse', '--git-dir'], { inheritSelectors: true })), otherGit);
check('inheritSelectors false clears like the default', gitDirOf(() => runGit(repo, ['rev-parse', '--git-dir'], { inheritSelectors: false })), ownGitDir);
check('fleet-kit sees the GIT_DIR the process inherited', gitDirOf(() => fleetGit.runGit(repo, ['rev-parse', '--git-dir'])), otherGit);
check('worktree-landing clears the GIT_DIR the process inherited', gitDirOf(() => landingGit.git(repo, ['rev-parse', '--git-dir'])), ownGitDir);
delete process.env.GIT_DIR;
check('a GIT_DIR the caller passes in env is honoured', gitDirOf(() => runGit(repo, ['rev-parse', '--git-dir'], { env: { GIT_DIR: otherGit } })), otherGit);

const privateIndex = path.join(sandbox.root, 'private-index');
const indexed = () => attempt(() => runGit(repo, ['ls-files'], {}).stdout);
const realIndexBefore = indexed();
writeFileSync(path.join(repo, 'priv.txt'), 'private');
const added = attempt(() => runGit(repo, ['add', 'priv.txt'], { env: { GIT_INDEX_FILE: privateIndex } }).status);
check('a GIT_INDEX_FILE the caller passes in env is used by git', [added, existsSync(privateIndex), attempt(() => runGit(repo, ['ls-files'], { env: { GIT_INDEX_FILE: privateIndex } }).stdout.includes('priv.txt'))], [0, true, true]);
check('the real index is untouched by a command on a private index', indexed(), realIndexBefore);

// gitOutput. / gitOutput.
check('gitOutput returns the stdout of a command that succeeded', attempt(() => gitOutput(repo, ['rev-parse', '--is-inside-work-tree'])), 'true\n');
const failed = thrown(() => gitOutput(repo, ['rev-parse', '--verify', 'no-such-ref']));
check('gitOutput throws a GitFailure when git says no', failed.kind, 'GitFailure');
check('the failure names the command and the exit, English first, then @es Spanish', [failed.message.startsWith('git rev-parse --verify no-such-ref failed (exit '), failed.message.includes('. @es git rev-parse --verify no-such-ref falló (salida ')], [true, true]);
const timeout = thrown(() => gitOutput(undefined, ['-c', hanging, 'hang'], { timeoutMs: 400 }));
check('a timeout is named as such in both languages', [timeout.kind, timeout.message.includes('failed (timed out)'), timeout.message.includes('falló (agotó el tiempo)')], ['GitFailure', true, true]);
check('the git options appear in the failure message', thrown(() => gitOutput(undefined, ['rev-parse', 'no-such-ref'], { gitOptions: ['-C', repo] })).message.startsWith(`git -C ${repo} rev-parse no-such-ref failed`), true);

// gitAsker, mustAsk, entriesOf.
const ask = gitAsker(repo, { timeoutMs: 5000 });
const toplevel = attempt(() => runGit(repo, ['rev-parse', '--show-toplevel']).stdout);
check('an asker is bound to its directory', attempt(() => ask('rev-parse', '--show-toplevel').stdout), toplevel);
check('an asker is bound to its git options', attempt(() => gitAsker(undefined, { gitOptions: ['-C', repo] })('rev-parse', '--show-toplevel').stdout), toplevel);
check('mustAsk returns the stdout of an answer that succeeded', attempt(() => mustAsk(ask, 'rev-parse', '--is-inside-work-tree')), 'true\n');
const must = thrown(() => mustAsk(ask, 'rev-parse', '--verify', 'no-such-ref'));
check('mustAsk throws a bilingual GitFailure naming the command and its status', [must.kind, must.message.startsWith('git rev-parse --verify no-such-ref failed ('), must.message.includes('. @es git rev-parse --verify no-such-ref falló (salida ')], ['GitFailure', true, true]);
check('mustAsk reads status zero as success even with a message on stderr', attempt(() => mustAsk(() => ({ status: 0, stdout: 'ok', stderr: 'warning' }), 'x')), 'ok');
check('entriesOf splits on NUL and drops empty entries', [entriesOf('a\0b\0'), entriesOf(''), entriesOf('a\0\0b')], [['a', 'b'], [], ['a', 'b']]);

// The scripted double. / El doble guionado.
const fake = createFakeGit({ 'rev-parse HEAD': { stdout: 'abc' }, 'status --porcelain': { status: 1, stderr: 'boom' }, 'fetch': { timedOut: true, status: null } });
check('the double answers a scripted command with defaults filled in', attempt(() => fake.ask('rev-parse', 'HEAD')), { status: 0, stdout: 'abc', stderr: '', timedOut: false });
check('the double keeps the status, stderr and timeout it was scripted with', [attempt(() => fake.ask('status', '--porcelain')), attempt(() => fake.ask('fetch'))], [{ status: 1, stdout: '', stderr: 'boom', timedOut: false }, { status: null, stdout: '', stderr: '', timedOut: true }]);
check('the double answers through run with the same shape and records the directory and options', [attempt(() => fake.run('/d', ['rev-parse', 'HEAD'], { gitOptions: ['-C', '/d'] }).stdout), fake.calls.at(-1)], ['abc', { cwd: '/d', args: ['rev-parse', 'HEAD'], options: { gitOptions: ['-C', '/d'] } }]);
check('the double records every call in order', fake.calls.map((call) => call.args.join(' ')), ['rev-parse HEAD', 'status --porcelain', 'fetch', 'rev-parse HEAD']);
const stray = thrown(() => fake.ask('push'));
check('the double refuses a command nobody scripted, in both languages', [stray.kind, stray.message.includes('git push'), stray.message.includes('@es')], ['other', true, true]);
check('a refused command is still recorded', fake.calls.at(-1)?.args, ['push']);
check('the double works with mustAsk and gitAsker-shaped callers', attempt(() => mustAsk(fake.ask, 'rev-parse', 'HEAD')), 'abc');

const passed = results.filter(Boolean).length;

console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
