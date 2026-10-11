#!/usr/bin/env node
/**
 * Self-test for company-scan on hand-built diffs and listings: line numbering across hunks, the
 * `+++`-looking content line, deletions, per-commit attribution, and the finding shapes.
 * @es Auto-test de company-scan con diffs y listados construidos a mano.
 */

import { addedLines, pathsByCommit } from './diff-added.mjs';
import { renderFindings, scanAdded, scanPaths, scanText } from './findings.mjs';

let failures = 0;
let total = 0;

function check(ok, line) {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

const NUL = String.fromCharCode(0);
const NAMES = ['claude', 'gentle-ai'];
const show = (entries) => entries.map((entry) => `${entry.path}:${entry.line}=${entry.text}`).join('|');

const twoHunks = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -3,0 +4,2 @@',
  '+first',
  '+second',
  '@@ -10 +12 @@',
  '-old',
  '+replaced',
  ''
].join('\n');

check(show(addedLines(twoHunks)) === 'src/a.ts:4=first|src/a.ts:5=second|src/a.ts:12=replaced', 'added lines carry the file and the NEW line number across hunks, with a count-less hunk header');

const lookalike = ['+++ b/f.txt', '@@ -0,0 +1,2 @@', '++ not a header', '+real', ''].join('\n');

check(show(addedLines(lookalike)) === 'f.txt:1=+ not a header|f.txt:2=real', 'NEAR MISS: an added line whose content makes it look like a "+++ " header is still a content line');

const removal = ['--- a/gone.txt', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-a', '-b', ''].join('\n');

check(addedLines(removal).length === 0, 'a deleted file adds nothing');
check(show(addedLines([removal, '+++ b/after.txt', '@@ -0,0 +1 @@', '+z', ''].join('\n'))) === 'after.txt:1=z', 'removed lines end their hunk, so the next file header is read as a header');

const twoFiles = ['+++ b/one.txt', '@@ -0,0 +1 @@', '+x', '+++ b/dir with space/two.txt\t', '@@ -0,0 +1 @@', '+y', ''].join('\n');

check(show(addedLines(twoFiles)) === 'one.txt:1=x|dir with space/two.txt:1=y', 'the file changes at each header; a trailing tab and a space in the path are handled');

const twoCommits = [`${NUL}aaa`, '+++ b/one.txt', '@@ -0,0 +1 @@', '+x', '', `${NUL}bbb`, '+++ b/two.txt', '@@ -0,0 +1 @@', '+y', ''].join('\n');
const attributed = addedLines(twoCommits);

check(attributed.map((entry) => `${entry.commit}:${entry.path}`).join() === 'aaa:one.txt,bbb:two.txt', 'each added line is attributed to its commit');
check(addedLines('').length === 0 && addedLines('not a diff at all').length === 0, 'garbage and empty input add nothing');

const listing = [`${NUL}aaa`, '', 'one.txt', 'dir/two.txt', `${NUL}bbb`, '', 'three.txt', ''].join('\n');

check(pathsByCommit(listing).map((entry) => `${entry.commit}:${entry.path}`).join() === 'aaa:one.txt,aaa:dir/two.txt,bbb:three.txt', 'paths are attributed to their commit');

const message = scanText('Add the feature\n\nCo-authored by Claude here\nthanks', NAMES, 'commit message');

check(message.length === 1 && message[0].where === 'commit message' && message[0].name === 'claude' && message[0].excerpt === 'Co-authored by Claude here', 'a message finding names the label, the name and the LINE around the hit');
check(scanText('claudette only', NAMES, 'x').length === 0, 'NEAR MISS: claudette is not a finding');

const long = scanText(`${'x '.repeat(200)}claude`, NAMES, 'x');

check(long[0].excerpt.length <= 103 && long[0].excerpt.endsWith('...'), 'a very long line is cut in the excerpt');

check(scanAdded(addedLines(twoHunks).map((entry) => ({ ...entry, text: entry.line === 5 ? 'use gentle-ai' : entry.text })), NAMES).map((finding) => finding.where).join() === 'src/a.ts:5', 'an added-line finding is located as path:line');
check(scanPaths(['.claude/rules.md', 'src/ok.ts'], NAMES).map((finding) => finding.where).join() === '.claude/rules.md', 'a path naming a tool is a finding; a clean path is not');
check(scanPaths(['.claude/rules.md'], NAMES)[0].excerpt === '(path) .claude/rules.md', 'a path finding says it is a path');

const many = Array.from({ length: 25 }, (_, index) => ({ where: `f:${index}`, name: 'claude', excerpt: 'e' }));
const rendered = renderFindings(many);

check(rendered.split('\n').length === 21 && rendered.includes('... and 5 more. @es ... y 5 más.'), 'the list is capped at 20 and says how many more, in both languages');
check(renderFindings(many.slice(0, 2)).split('\n').length === 2 && !renderFindings(many.slice(0, 2)).includes('more'), 'a short list has no "more" line');

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
