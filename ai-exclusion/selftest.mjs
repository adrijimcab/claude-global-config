#!/usr/bin/env node
/**
 * Self-test for ai-exclusion on CONSTRUCTED clones (temp repositories, never a real clone): a fresh clone, a
 * re-run, hand-written lines kept byte for byte, a linked worktree writing the common directory, `--check`
 * ok/stale/missing, `--dry-run` writing nothing, a tracked-file conflict, a malformed block, CRLF, and the
 * declared list itself. It touches no state of `~/.claude`.
 *
 * @es Auto-test de ai-exclusion sobre clones CONSTRUIDOS (repos temporales, nunca un clon real): clon nuevo,
 * repetición, líneas a mano intactas byte a byte, worktree enlazado que escribe el directorio común,
 * `--check` ok/stale/missing, `--dry-run` sin escribir, conflicto con fichero versionado, bloque malformado,
 * CRLF y la propia lista declarada. No toca estado de `~/.claude`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AI_PATHS } from './ai-paths.mjs';
import { BEGIN_MARKER, END_MARKER, blockState, withBlock } from './block.mjs';
import { run } from './cli.mjs';

let failures = 0;

function check(ok, line) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

const root = mkdtempSync(path.join(tmpdir(), 'ai-exclusion-selftest-'));
const PATTERNS = AI_PATHS.map((entry) => entry.pattern);

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function newClone(name, tracked = {}) {
  const dir = path.join(root, name);

  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  writeFileSync(path.join(dir, 'README.txt'), 'x\n');
  for (const [file, text] of Object.entries(tracked)) writeFileSync(path.join(dir, file), text);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');

  return dir;
}

const excludeOf = (dir) => path.join(dir, '.git', 'info', 'exclude');
const read = (file) => readFileSync(file, 'utf8');

/** A check that must answer, never crash: a throw is a failed check. @es Un check que debe responder, nunca romper: un error es un check fallido. */
const attempt = (fn) => {
  try {
    return fn();
  } catch {
    return false;
  }
};

/** Runs the CLI and returns `{ code, log, error }`. @es Ejecuta la CLI y devuelve `{ code, log, error }`. */
function cli(...argv) {
  const log = [];
  const error = [];
  const code = run(argv, { log: (text) => log.push(text), error: (text) => error.push(text) });

  return { code, log: log.join('\n'), error: error.join('\n') };
}

try {
  // --- the declared list
  check(PATTERNS.length === new Set(PATTERNS).size, 'the declared list has no duplicate pattern');
  check(['.claude/', '.agents/', '.atl/', '.engram/', '/openspec/', '/odd/'].every((pattern) => PATTERNS.includes(pattern)), 'the list holds the owner-named AI paths');
  check(AI_PATHS.every((entry) => entry.tool.length > 0), 'every entry names its tool');

  // --- fresh clone
  const fresh = newClone('fresh');
  const first = cli(fresh);

  check(first.code === 0 && first.log.startsWith('written:'), 'a fresh clone is written (exit 0)');
  check(read(excludeOf(fresh)).includes(BEGIN_MARKER) && PATTERNS.every((pattern) => read(excludeOf(fresh)).includes(`\n${pattern}\n`)), 'the block with every pattern is in info/exclude');
  check(read(excludeOf(fresh)).startsWith('# git ls-files --others'), 'the default git header stays at the top');
  mkdirSync(path.join(fresh, '.claude'));
  writeFileSync(path.join(fresh, '.claude', 'state.json'), '{}');
  mkdirSync(path.join(fresh, 'odd', 'tasks'), { recursive: true });
  writeFileSync(path.join(fresh, 'odd', 'tasks', 'f.md'), 'x');
  writeFileSync(path.join(fresh, 'src.txt'), 'x');
  check(git(fresh, 'status', '--porcelain') === '?? src.txt\n', 'git really hides the AI paths and still shows a normal file');
  check(!existsSync(path.join(fresh, '.gitignore')), 'the versioned .gitignore is never created');

  // --- re-run
  const before = read(excludeOf(fresh));
  const second = cli(fresh);

  check(second.code === 0 && second.log.startsWith('unchanged:') && read(excludeOf(fresh)) === before, 're-running changes nothing, byte for byte');

  // --- hand lines preserved around a stale block
  const handTop = '# my notes\r\nsecret.txt\n\n';
  const handBottom = '\n# tail\n*.tmp';
  const staleText = `${handTop}${BEGIN_MARKER}\nold-pattern\n${END_MARKER}${handBottom}`;
  const hand = newClone('hand');

  writeFileSync(excludeOf(hand), staleText);
  check(cli('--check', hand).code === 1 && cli('--check', hand).log.startsWith('stale:'), '--check reports a stale block with exit 1');
  check(read(excludeOf(hand)) === staleText, '--check writes nothing');
  check(cli(hand).code === 0, 'a stale block is replaced');
  const replaced = read(excludeOf(hand));

  check(replaced.startsWith(handTop) && replaced.endsWith(handBottom), 'every line outside the markers is byte-identical (CR, missing final newline)');
  check(!replaced.includes('old-pattern') && replaced.split(BEGIN_MARKER).length === 2, 'the old block content is gone and there is exactly one block');
  check(cli('--check', hand).code === 0 && cli('--check', hand).log.startsWith('ok:'), '--check reports ok with exit 0 once current');

  // --- check missing
  const missing = newClone('missing');

  writeFileSync(excludeOf(missing), 'only-hand\n');
  check(cli('--check', missing).code === 1 && cli('--check', missing).log.startsWith('missing:'), '--check reports a missing block with exit 1');

  // --- dry-run
  const dry = newClone('dry');
  const dryBefore = read(excludeOf(dry));
  const dryRun = cli('--dry-run', dry);

  check(dryRun.code === 0 && dryRun.log.startsWith('would-write:') && dryRun.log.includes('.claude/') && read(excludeOf(dry)) === dryBefore, '--dry-run prints the block and writes nothing');

  // --- hand lines listing the same pattern are reported
  const listed = newClone('listed');

  writeFileSync(excludeOf(listed), '.claude/\n');
  check(cli('--dry-run', listed).log.includes('also listed by hand outside the block: .claude/. @es'), 'a pattern already listed by hand is reported, and kept');

  // --- missing info directory
  const noInfo = newClone('no-info');

  rmSync(path.join(noInfo, '.git', 'info'), { recursive: true, force: true });
  check(cli(noInfo).code === 0 && PATTERNS.every((pattern) => read(excludeOf(noInfo)).includes(pattern)), 'a clone with no info/ directory gets it created');

  // --- linked worktree writes the COMMON dir
  const main = newClone('main');
  const linked = path.join(root, 'main-linked');

  git(main, 'worktree', 'add', '-q', '-b', 'side', linked);
  const viaLinked = cli(linked);

  check(viaLinked.code === 0 && realpathSync.native(viaLinked.log.split('\n')[0].slice('written: '.length)) === realpathSync.native(excludeOf(main)), 'running from a linked worktree writes the common info/exclude');
  mkdirSync(path.join(linked, '.atl'));
  writeFileSync(path.join(linked, '.atl', 'registry.md'), 'x');
  check(git(linked, 'status', '--porcelain') === '', 'the linked worktree hides the AI paths through the shared file');
  check(cli('--check', main).code === 0, 'the main checkout sees the same block as current');

  // --- conflict with a tracked file
  const tracked = newClone('tracked', { '.cursorrules': 'rules\n' });
  const conflict = cli(tracked);

  check(conflict.code === 2 && conflict.log.startsWith('conflict:') && conflict.error.includes('.cursorrules'), 'a tracked AI file is a conflict (exit 2), named');
  check(!read(excludeOf(tracked)).includes(BEGIN_MARKER), 'a conflict writes nothing');
  check(cli('--check', tracked).code === 2, '--check also reports the conflict');

  // --- malformed block
  const broken = newClone('broken');

  writeFileSync(excludeOf(broken), `keep-me\n${BEGIN_MARKER}\nhalf\n`);
  const malformed = cli(broken);

  check(malformed.code === 2 && malformed.error.includes('malformed') && read(excludeOf(broken)) === `keep-me\n${BEGIN_MARKER}\nhalf\n`, 'a half block is refused (exit 2) and the file stays untouched');
  writeFileSync(excludeOf(broken), `${END_MARKER}\n${BEGIN_MARKER}\n`);
  check(cli(broken).code === 2, 'markers out of order are refused');

  // --- CRLF files keep CRLF
  const crlf = newClone('crlf');

  writeFileSync(excludeOf(crlf), '# a\r\nb\r\n');
  cli(crlf);
  check(read(excludeOf(crlf)).split('\n').every((line, index, all) => index === all.length - 1 || line.endsWith('\r')), 'a CRLF file gets a CRLF block (no mixed endings)');
  check(cli('--check', crlf).code === 0, 'the CRLF block reads back as ok');

  // --- a marker text inside a hand line is not a marker
  const inline = newClone('inline');
  const inlineText = `see ${END_MARKER} and ${BEGIN_MARKER}
`;

  writeFileSync(excludeOf(inline), inlineText);
  check(cli(inline).code === 0 && read(excludeOf(inline)).startsWith(inlineText), 'marker text in the middle of a hand line is kept as a hand line');

  // --- pure block functions
  check(attempt(() => blockState('', PATTERNS) === 'missing' && blockState(withBlock('', PATTERNS), PATTERNS) === 'ok'), 'blockState: empty text is missing, a written one is ok');
  check(attempt(() => blockState(withBlock('', PATTERNS), ['other']) === 'stale'), 'blockState: a different list is stale');
  check(attempt(() => withBlock('', ['p'])) === `${BEGIN_MARKER}\np\n${END_MARKER}\n`, 'withBlock on an empty file is the block alone, no leading blank line');
  check(withBlock('a', PATTERNS).startsWith('a\n\n') && withBlock('a\n', PATTERNS).startsWith('a\n\n'), 'withBlock separates an appended block from hand text by one blank line');

  // --- usage and git failure
  check(cli().code === 2 && cli('--nope', fresh).code === 2 && cli('--check', '--dry-run', fresh).code === 2 && cli(fresh, fresh).code === 2, 'a bad call is exit 2');
  const outside = mkdtempSync(path.join(root, 'not-a-repo-'));

  check(cli(outside).code === 2 && cli(outside).error.includes('failed'), 'a path that is no repository is exit 2, not a crash');
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
