#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for the pure readers of `commit-index-guard`, with no git and no repository: how a
 * `git commit` invocation is read (`commit-paths.mjs`: git's own option table), how `git status --porcelain -z`
 * is read (`index-state.mjs`), how a path is quoted into a suggested command and what the notice and the
 * refusal say (`messages.mjs`). Every option that takes a value is named HERE, never read from the table under
 * test, so removing one from the table cannot also remove its test.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de los lectores puros de `commit-index-guard`, sin git ni repositorio: cómo se
 * lee una invocación de `git commit` (la tabla de opciones propia de git), cómo se lee `git status --porcelain
 * -z`, cómo se entrecomilla una ruta en un comando sugerido y qué dicen el aviso y la negativa. Cada opción con
 * valor se nombra AQUÍ, nunca se lee de la tabla bajo prueba.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (file) => import(pathToFileURL(path.join(HERE, file)).href);
const { readCommit } = await load('commit-paths.mjs');
const { indexDisagreesWithBoth, parseStatus } = await load('index-state.mjs');
const { noticeText, refusalText, shellWord } = await load('messages.mjs');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;
    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---- PARSING: git's own option table.
const read = (...args) => readCommit(args);

check('parse: `-- a b` are paths', read('-m', 'msg', '--', 'a', 'b').paths, ['a', 'b']);
check('parse: the value of -m is not a path', read('-m', 'msg', 'a').paths, ['a']);
check('parse: the value of -F is not a path', read('-F', 'file', 'a').paths, ['a']);
check('parse: the value of -C is not a path', read('-C', 'HEAD', 'a').paths, ['a']);
check('parse: the value of -c is not a path', read('-c', 'HEAD', 'a').paths, ['a']);
check('parse: the value of -t is not a path', read('-t', 'tpl', 'a').paths, ['a']);
check('parse: `-am msg` consumes msg and flags -a', [read('-am', 'msg', 'a').paths, read('-am', 'msg', 'a').all], [['a'], true]);
check('parse: `-mmsg` carries its value', read('-mmsg', 'a').paths, ['a']);
check('parse: `--author x` consumes x', read('--author', 'x <x@y>', 'a').paths, ['a']);
check('parse: `--message=m` is self-contained', read('--message=m', 'a').paths, ['a']);
check('parse: `--message m` consumes m', read('--message', 'm', 'a').paths, ['a']);
check('parse: an abbreviated `--mess m` consumes m', read('--mess', 'm', 'a').paths, ['a']);
check('parse: `--date d` consumes d', read('--date', 'd', 'a').paths, ['a']);
check('parse: `--fixup x` consumes x', read('--fixup', 'x', 'a').paths, ['a']);
check('parse: `--trailer t` consumes t', read('--trailer', 't', 'a').paths, ['a']);
check('parse: `-S` takes no separate value', read('-S', 'a').paths, ['a']);
check('parse: `-S` inside a cluster stops the cluster', read('-aS', 'a').paths, ['a']);
check('parse: `-u` takes no separate value', read('-u', 'a').paths, ['a']);
check('parse: `--no-verify` is a flag', read('--no-verify', 'a').paths, ['a']);
check('parse: `-n` is a flag', read('-n', 'a').paths, ['a']);
check('parse: `-o a b` names both', read('-o', 'a', 'b').paths, ['a', 'b']);
check('parse: after `--` a dash word is a path', read('--', '-weird').paths, ['-weird']);
check('parse: `--all` is read', read('--all').all, true);
check('parse: `-i` is read', read('-i', 'a').include, true);
check('parse: `--include` is read', read('--include', 'a').include, true);
check('parse: `-ai` flags both', [read('-ai').all, read('-ai').include], [true, true]);
check('parse: `-m` before `a` in a cluster is not -a', read('-ma').all, false);
check('parse: `--dry-run` is read', read('--dry-run').dryRun, true);
check('parse: a later `--no-dry-run` wins', read('--dry-run', '--no-dry-run').dryRun, false);
check('parse: `--pathspec-from-file` is reported as not looked at', read('--pathspec-from-file=list').fromFile, true);
check('parse: no pathspec at all', read('-m', 'msg').paths, []);
check('parse: a lone `-` is a path word', read('-').paths, ['-']);

// ---- STATUS records: every column state, a rename's origin, untracked.
check('status: MM', parseStatus('MM a\0'), [{ path: 'a', code: 'MM' }]);
check('status: staged only', parseStatus('M  a\0'), [{ path: 'a', code: 'M ' }]);
check('status: worktree only', parseStatus(' M a\0'), [{ path: 'a', code: ' M' }]);
check('status: a rename is followed by its origin, which is not a path', parseStatus('R  new.txt\0renamed-from.txt\0M  b\0'), [{ path: 'new.txt', code: 'R ' }, { path: 'b', code: 'M ' }]);
check('status: a worktree rename is followed by its origin too', parseStatus(' R new.txt\0renamed-from.txt\0M  b\0').map((entry) => entry.path), ['new.txt', 'b']);
check('status: untracked and ignored carry no index state', parseStatus('?? u\0!! i\0'), []);
check('status: empty', parseStatus(''), []);
check('status: a path with a space', parseStatus('MM a b\0'), [{ path: 'a b', code: 'MM' }]);

// ---- QUOTING of the suggested commands.
check('quoting: a plain path is bare', shellWord('sub/c.txt'), 'sub/c.txt');
check('quoting: a path with a space is single-quoted', shellWord('a b.txt'), "'a b.txt'");
check('quoting: a single quote is closed and reopened', shellWord("it's.txt"), "'it'\\''s.txt'");
check('quoting: a dollar sign is quoted', shellWord('$x.txt'), "'$x.txt'");
check('quoting: an empty path is quoted', shellWord(''), "''");
// ---- MORE PARSING: every long option that takes a value is named HERE (never read from the table under test), and the optional-value short options.
for (const name of ['--message', '--file', '--reedit-message', '--reuse-message', '--template', '--author', '--date', '--fixup', '--squash', '--cleanup', '--trailer', '--unified', '--inter-hunk-context']) {
  check(`parse: ${name} consumes its value`, read(name, 'v', 'a').paths, ['a']);
}

check('parse: `-Sabc` is one signing key, and a letter inside it takes nothing', read('-Sabc', 'a').paths, ['a']);
check('parse: `-uc` is one untracked-files mode', read('-uc', 'a').paths, ['a']);

// ---- MORE QUOTING: every character a plain path may hold stays bare.
check('quoting: letters, digits and punctuation of a plain path stay bare', shellWord('Qa_b-c@d%e+f=g:h,i.j/k1'), 'Qa_b-c@d%e+f=g:h,i.j/k1');

// ---- MESSAGES: every status code is described in both languages, and each next step is given in both.
const notice = noticeText([{ path: 'a.txt', code: 'MM' }]);
const worktreeNotice = noticeText([{ path: 'w', code: ' M' }]);
const stagedNotice = noticeText([{ path: 's', code: 'M ' }]);
const count = (text, part) => text.split(part).length - 1;

check('message: a worktree-only code is described in English and Spanish', [worktreeNotice.includes('w [ M]: the worktree differs from the index'), worktreeNotice.includes('w [ M]: el árbol de trabajo difiere del índice')], [true, true]);
check('message: a staged-only code is described in English and Spanish', [stagedNotice.includes('s [M ]: the staged content differs from HEAD'), stagedNotice.includes('s [M ]: el contenido en stage difiere de HEAD')], [true, true]);
check('message: an MM code is described in English and Spanish', [notice.includes('the index holds a variant that is neither HEAD nor the worktree'), notice.includes('el índice guarda una variante que no es ni HEAD ni el árbol de trabajo')], [true, true]);

const fullNotice = noticeText([{ path: 'a.txt', code: 'MM' }]);
const fullRefusal = refusalText([{ path: 'a.txt', code: 'MM' }]);

check('message: the notice gives each next step in both languages', [count(fullNotice, 'git diff -- a.txt'), count(fullNotice, 'git add -- a.txt'), count(fullNotice, 'git commit -m "<type(scope): description>" -- a.txt'), count(fullNotice, 'git commit -m "<tipo(ámbito): descripción>" -- a.txt')], [2, 2, 1, 1]);
check('message: the refusal gives each next step in both languages', [count(fullRefusal, 'git add -- a.txt'), count(fullRefusal, 'git commit -m "<type(scope): description>" -- a.txt'), count(fullRefusal, 'git commit -m "<tipo(ámbito): descripción>" -- a.txt'), count(fullRefusal, '-- <paths>'), count(fullRefusal, '-- <rutas>')], [2, 1, 1, 1, 1]);
check('message: the refusal says nothing is discarded, in both languages', [fullRefusal.includes('Do NOT restore'), fullRefusal.includes('NO uses restore')], [true, true]);
check('message: the notice is English first, then the @es mirror', fullNotice.indexOf('COMMIT-INDEX GUARD:') < fullNotice.indexOf('@es COMMIT-INDEX GUARD:') && fullNotice.indexOf('@es COMMIT-INDEX GUARD:') > 0, true);
check('message: the refusal is English first, then the @es mirror', fullRefusal.indexOf('COMMIT-INDEX GUARD REFUSED') < fullRefusal.indexOf('@es COMMIT-INDEX GUARD RECHAZÓ') && fullRefusal.indexOf('@es COMMIT-INDEX GUARD RECHAZÓ') > 0, true);
check('message: the notice says nothing is discarded, in both languages', [fullNotice.includes('nothing here is to be discarded; do NOT restore'), fullNotice.includes('aquí no se descarta nada; NO uses restore')], [true, true]);
check('message: the notice warns that a bare commit is refused, in both languages', [fullNotice.includes('a commit with no pathspec is refused'), fullNotice.includes('un commit sin pathspec se rechaza')], [true, true]);


// ---- THE TWO COLUMNS: the index disagrees with BOTH HEAD and the worktree only when both columns differ.
check('columns: MM disagrees with both', indexDisagreesWithBoth({ code: 'MM' }), true);
check('columns: a staged-only path does not', indexDisagreesWithBoth({ code: 'M ' }), false);
check('columns: a worktree-only path does not', indexDisagreesWithBoth({ code: ' M' }), false);
check('columns: an added-then-modified path disagrees with both', indexDisagreesWithBoth({ code: 'AM' }), true);

const total = passed + failures.length;

for (const failure of failures) console.log(`FAIL  ${failure}`);
console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}  commit-index-guard parse selftest: ${passed}/${total}`);
process.exit(failures.length === 0 ? 0 : 1);
