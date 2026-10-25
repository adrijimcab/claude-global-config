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
const { readCommit, resolveLong } = await load('commit-paths.mjs');
const { MAX_PATHSPEC_FILE_BYTES, readPathspecFile: readPathspecFileUnsafe } = await load('pathspec-file.mjs');
const { indexDisagreesWithBoth, parseStatus: parseStatusUnsafe } = await load('index-state.mjs');

/** A reader that throws is a failed check, never a crash of the proof. @es Un lector que lanza es un check fallido, nunca una caída de la prueba. */
const safely = (reader) => (...args) => {
  try {
    return reader(...args);
  } catch (error) {
    return { threw: String(error) };
  }
};
const parseStatus = safely(parseStatusUnsafe);
const readPathspecFile = safely(readPathspecFileUnsafe);
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
const read = (...args) => safely(readCommit)(args);

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
check('parse: the fused `--pathspec-from-file=list` names its file and consumes nothing', [read('--pathspec-from-file=list', 'a').pathspecFile, read('--pathspec-from-file=list', 'a').paths], ['list', ['a']]);
check('parse: the separated `--pathspec-from-file list` names its file and consumes it', [read('--pathspec-from-file', 'list', 'a').pathspecFile, read('--pathspec-from-file', 'list', 'a').paths], ['list', ['a']]);
check('parse: `--no-pathspec-from-file` forgets the file', read('--pathspec-from-file=list', '--no-pathspec-from-file').pathspecFile, undefined);
check('parse: no pathspec file by default', read('-m', 'msg').pathspecFile, undefined);
check('parse: `--pathspec-file-nul` is read', [read('--pathspec-file-nul').pathspecNul, read('--pathspec-file-nul', '--no-pathspec-file-nul').pathspecNul, read('-m', 'x').pathspecNul], [true, false, false]);
check('parse: `-o` is read as only, with no path', [read('-o').only, read('--amend', '-o').only, read('-m', 'x').only], [true, true, false]);
check('parse: `--only` is read as only', read('--only', 'a').only, true);
check('parse: `--no-only` cancels `--only`', read('--only', '--no-only').only, false);
check('parse: `-U 3` consumes its value', read('-U', '3', 'a').paths, ['a']);
check('parse: `-U3` carries its value', read('-U3', 'a').paths, ['a']);
check('parse: `--no-all` cancels `--all`', read('--all', '--no-all').all, false);
check('parse: `--no-include` cancels `--include`', read('--include', '--no-include').include, false);
check('parse: `-p` and `-s` are flags', read('-p', '-s', 'a').paths, ['a']);

// ---- ABBREVIATIONS follow git: an exact name, else the only option that starts with the word.
check('abbreviation: `--incl` is `--include`', read('--incl', 'a').include, true);
check('abbreviation: `--inc` is `--include` (the only option that starts so)', read('--inc', 'a').include, true);
check('abbreviation: `--on` is `--only`', read('--on').only, true);
check('abbreviation: `--dry` is `--dry-run`', read('--dry').dryRun, true);
check('abbreviation: `--dr` is `--dry-run`', read('--dr').dryRun, true);
check('abbreviation: `--al` is ambiguous (all, allow-empty...) and is not `--all`', read('--al').all, false);
check('abbreviation: `--all` is exact even though other options start with it', read('--all').all, true);
check('abbreviation: `--a` is ambiguous and consumes nothing', read('--a', 'x').paths, ['x']);
check('abbreviation: `--path` is `--pathspec-from-file` or `--pathspec-file-nul`: ambiguous, consumes nothing', read('--path', 'x').paths, ['x']);
check('abbreviation: `--pathspec-from` is `--pathspec-from-file` and takes its value', [read('--pathspec-from', 'list', 'a').pathspecFile, read('--pathspec-from', 'list', 'a').paths], ['list', ['a']]);
check('abbreviation: `--auth` is `--author` and takes its value', read('--auth', 'x <y>', 'a').paths, ['a']);
check('abbreviation: `--reu` is `--reuse-message` and takes its value', read('--reu', 'HEAD', 'a').paths, ['a']);
check('abbreviation: `--reed` is `--reedit-message` and takes its value', read('--reed', 'HEAD', 'a').paths, ['a']);
check('abbreviation: `--no-ver` is `--no-verify`, a flag', read('--no-ver', 'a').paths, ['a']);
check('abbreviation: `--no-al` is ambiguous, `--no-all` is exact', [read('--all', '--no-al').all, read('--all', '--no-all').all], [true, false]);
check('abbreviation: an unknown option consumes nothing', read('--frobnicate', 'a').paths, ['a']);
check('abbreviation: `--inter` is `--inter-hunk-context`... or `--interactive`: ambiguous, consumes nothing', read('--inter', 'a').paths, ['a']);
check('abbreviation: `--inter-` is `--inter-hunk-context` and takes its value', read('--inter-', '2', 'a').paths, ['a']);
check('resolveLong: an exact name', resolveLong('message'), 'message');
check('resolveLong: the only candidate', resolveLong('mess'), 'message');
check('resolveLong: an ambiguous prefix', resolveLong('al'), undefined);
check('resolveLong: no candidate', resolveLong('zzz'), undefined);
check('parse: no pathspec at all', read('-m', 'msg').paths, []);
check('parse: a lone `-` is a path word', read('-').paths, ['-']);

// ---- STATUS records: every column state, a rename's origin, untracked.
const HEAD_BLOB = 'a'.repeat(40);
const INDEX_BLOB = 'b'.repeat(40);
const WORKTREE_MODE = '100644 100644 100644';
const ordinary = (code, name, blob = INDEX_BLOB) => `1 ${code} N... ${WORKTREE_MODE} ${HEAD_BLOB} ${blob} ${name}\0`;

check('status: MM carries its index blob', parseStatus(ordinary('MM', 'a')), [{ path: 'a', code: 'MM', blob: INDEX_BLOB }]);
check('status: staged only, a dot in the second column is a blank', parseStatus(ordinary('M.', 'a')), [{ path: 'a', code: 'M ', blob: INDEX_BLOB }]);
check('status: worktree only, a dot in the first column is a blank', parseStatus(ordinary('.M', 'a')), [{ path: 'a', code: ' M', blob: INDEX_BLOB }]);
check('status: a rename carries its new name and its index blob; its origin record is not an entry', parseStatus(`2 RM N... ${WORKTREE_MODE} ${HEAD_BLOB} ${INDEX_BLOB} R100 new.txt\x001 an old name that looks like a record.txt\0${ordinary('M.', 'b')}`), [{ path: 'new.txt', code: 'RM', blob: INDEX_BLOB }, { path: 'b', code: 'M ', blob: INDEX_BLOB }]);
check('status: an unmerged path carries the blob of stage 2', parseStatus(`u UU N... 100644 100644 100644 100644 ${'1'.repeat(40)} ${'2'.repeat(40)} ${'3'.repeat(40)} conflict.txt\0`), [{ path: 'conflict.txt', code: 'UU', blob: '2'.repeat(40) }]);
check('status: untracked, ignored and header records carry no index state', parseStatus('? u\0! i\0# branch.oid x\0'), []);
check('status: empty', parseStatus(''), []);
check('status: a path with spaces', parseStatus(ordinary('MM', 'a b c.txt')), [{ path: 'a b c.txt', code: 'MM', blob: INDEX_BLOB }]);
check('status: a record that is cut short is skipped', parseStatus('1 MM N...\0'), []);
check('status: a record of an unknown type is skipped', parseStatus('9 MM x\0'), []);
check('status: a record whose type is not followed by a space is skipped', parseStatus(`1MM MM N... ${WORKTREE_MODE} ${HEAD_BLOB} ${INDEX_BLOB} path.txt\0`), []);

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


// ---- EVERY LONG OPTION `git commit -h` PRINTS (git 2.54), written HERE: each is recognised, and a value option consumes its value.
const HELP_FLAGS = ['quiet', 'verbose', 'reset-author', 'signoff', 'edit', 'status', 'gpg-sign', 'all', 'include', 'interactive', 'patch', 'only', 'verify', 'dry-run', 'short', 'branch', 'ahead-behind', 'porcelain', 'long', 'null', 'amend', 'allow-empty', 'allow-empty-message', 'post-rewrite', 'untracked-files', 'pathspec-file-nul'];
const HELP_VALUE_OPTIONS = ['file', 'author', 'date', 'message', 'reedit-message', 'reuse-message', 'fixup', 'squash', 'trailer', 'template', 'cleanup', 'unified', 'inter-hunk-context', 'pathspec-from-file'];

for (const name of HELP_FLAGS) {
  check(`option --${name} is recognised and consumes nothing`, [resolveLong(name), resolveLong(`no-${name}`), read(`--${name}`, 'a').paths], [name, `no-${name}`, ['a']]);
}

for (const name of HELP_VALUE_OPTIONS) {
  check(`option --${name} is recognised with its --no- form, and takes a value`, [resolveLong(name), resolveLong(`no-${name}`), read(`--${name}`, 'v', 'a').paths, read(`--no-${name}`, 'a').paths], [name, `no-${name}`, ['a'], ['a']]);
}

check('options git spells only as --no-verify and --no-post-rewrite are recognised', [resolveLong('no-verify'), resolveLong('no-post-rewrite')], ['no-verify', 'no-post-rewrite']);

// ---- THE PATHSPEC FILE: newline or NUL separated, quoted paths, bounded, and every failure a value.
const fake = (text, size = text.length) => ({ readFile: () => text, sizeOf: () => size });
const lines = (text, nul = false) => safely(readPathspecFile)({ file: 'list', directory: 'C:/work', nul }, fake(text));

check('pathspec file: one path per line', lines('a.ts\nsub/b.ts\n'), { ok: true, paths: ['a.ts', 'sub/b.ts'] });
check('pathspec file: blank lines are skipped', lines('a.ts\n\n\nb.ts'), { ok: true, paths: ['a.ts', 'b.ts'] });
check('pathspec file: a carriage return is not part of the path', lines('a.ts\r\nb.ts\r\n'), { ok: true, paths: ['a.ts', 'b.ts'] });
check('pathspec file: a line of only a carriage return is blank', lines('a.ts\n\r\nb.ts'), { ok: true, paths: ['a.ts', 'b.ts'] });
check('pathspec file: a quoted path is unquoted', lines('"a b.ts"\nc.ts'), { ok: true, paths: ['a b.ts', 'c.ts'] });
check('pathspec file: a path with a space and no quotes is kept whole', lines('a b.ts'), { ok: true, paths: ['a b.ts'] });
check('pathspec file: a lone quote is a path, not a quoted path', lines('"'), { ok: true, paths: ['"'] });
check('pathspec file: a quoted path that is not understood fails the whole read', lines('a.ts\n"\\q bad"\n').ok, false);
check('pathspec file: NUL separates paths and keeps newlines inside them', lines('a.ts\0b\nc.ts\0', true), { ok: true, paths: ['a.ts', 'b\nc.ts'] });
check('pathspec file: with NUL a quote is part of the path', lines('"a.ts"\0', true), { ok: true, paths: ['"a.ts"'] });
check('pathspec file: an empty file names nothing', lines(''), { ok: true, paths: [] });

const failureOf = (spec, ports) => safely(readPathspecFile)(spec, ports);

check('pathspec file: standard input cannot be read, in both languages', [failureOf({ file: '-', directory: 'C:/work' }).ok, failureOf({ file: '-', directory: 'C:/work' }).reason?.includes('standard input'), failureOf({ file: '-', directory: 'C:/work' }).reason?.includes('@es')], [false, true, true]);
check('pathspec file: no file name fails', [failureOf({ file: undefined, directory: 'C:/work' }).ok, failureOf({ file: '', directory: 'C:/work' }).ok], [false, false]);
check('pathspec file: an unknown directory fails', failureOf({ file: 'list', directory: undefined }).ok, false);
const LIMIT = 1_048_576;

check('pathspec file: the limit is one mebibyte', MAX_PATHSPEC_FILE_BYTES, LIMIT);
check('pathspec file: a file at the limit is read, one byte past it is not', [safely(readPathspecFile)({ file: 'list', directory: 'C:/work' }, fake('a', LIMIT)).ok,safely(readPathspecFile)({ file: 'list', directory: 'C:/work' }, fake('a', LIMIT + 1)).ok], [true, false]);
check('pathspec file: a too large file says so in both languages', [safely(readPathspecFile)({ file: 'list', directory: 'C:/work' }, fake('a', LIMIT + 1)).reason?.includes('larger than'), safely(readPathspecFile)({ file: 'list', directory: 'C:/work' }, fake('a', LIMIT + 1)).reason?.includes('@es')], [true, true]);
check('pathspec file: a path that only starts, or only ends, with a quote is a plain path', lines('"abc\nabc"'), { ok: true, paths: ['"abc', 'abc"'] });
check('pathspec file: an empty file name fails because it names a directory', failureOf({ file: '', directory: HERE }).ok, false);
check('pathspec file: a read that throws is a failure with the reason in both languages', [readPathspecFile({ file: 'nope', directory: 'C:/work' }, { readFile: () => { throw new Error('ENOENT: gone'); }, sizeOf: () => 1 }).reason?.includes('ENOENT: gone'), readPathspecFile({ file: 'nope', directory: 'C:/work' }, { readFile: () => { throw new Error('ENOENT: gone'); }, sizeOf: () => 1 }).reason?.includes('@es')], [true, true]);
check('pathspec file: a missing file on the real file system is a failure', readPathspecFile({ file: 'surely-not-there.txt', directory: HERE }).ok, false);
check('pathspec file: the name is resolved against the directory of the command', (() => {
  let asked;
  readPathspecFile({ file: 'list.txt', directory: 'C:/work/sub' }, { readFile: (target) => { asked = target; return ''; }, sizeOf: () => 0 });
  return asked.split('\\').join('/').endsWith('work/sub/list.txt');
})(), true);

// ---- THE TWO COLUMNS: the index disagrees with BOTH HEAD and the worktree only when both columns differ.
check('columns: MM disagrees with both', indexDisagreesWithBoth({ code: 'MM' }), true);
check('columns: a staged-only path does not', indexDisagreesWithBoth({ code: 'M ' }), false);
check('columns: a worktree-only path does not', indexDisagreesWithBoth({ code: ' M' }), false);
check('columns: an added-then-modified path disagrees with both', indexDisagreesWithBoth({ code: 'AM' }), true);

const total = passed + failures.length;

for (const failure of failures) console.log(`FAIL  ${failure}`);
console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}  commit-index-guard parse selftest: ${passed}/${total}`);
process.exit(failures.length === 0 ? 0 : 1);
