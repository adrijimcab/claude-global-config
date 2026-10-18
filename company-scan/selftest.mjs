#!/usr/bin/env node
/**
 * Self-test for company-scan on hand-built diffs and listings: line numbering across hunks, the
 * `+++`-looking content line, deletions, per-commit attribution, and the finding shapes.
 * @es Auto-test de company-scan con diffs y listados construidos a mano.
 */

import { addedLines, pathsByCommit } from './diff-added.mjs';
import { attributionHits } from './attribution.mjs';
import { renderFindings, scanAdded, scanMessage, scanPaths, scanText } from './findings.mjs';
import { globMatches } from './path-glob.mjs';
import { BLOCKED_GLOBS, parseBlockedPaths, toolPathTerms } from './tool-paths.mjs';

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
check(scanPaths(['.claude/rules.md', 'src/ok.ts'], NAMES).map((finding) => `${finding.where}=${finding.name}`).join() === '.claude/rules.md=claude,.claude/rules.md=.claude/*', 'a path naming a tool is a finding by its name AND by its blocked glob; a clean path is not');
check(scanPaths(['.claude/rules.md'], NAMES)[0].excerpt === '(path) .claude/rules.md', 'a path finding says it is a path');

const many = Array.from({ length: 25 }, (_, index) => ({ where: `f:${index}`, name: 'claude', excerpt: 'e' }));
const rendered = renderFindings(many);

check(rendered.split('\n').length === 21 && rendered.includes('... and 5 more. @es ... y 5 más.'), 'the list is capped at 20 and says how many more, in both languages');
check(renderFindings(many.slice(0, 2)).split('\n').length === 2 && !renderFindings(many.slice(0, 2)).includes('more'), 'a short list has no "more" line');

// --- AI tool PATHS (tool-paths.mjs over blocked-paths, path-glob.mjs): every glob, the matcher, the loader, the near misses.
const terms = (path) => toolPathTerms(path).join();

for (const [path, term] of [
  ['.cursor/rules/a.mdc', '.cursor/*'], ['pkg/.gemini/settings.json', '*/.gemini/*'], ['.codex/config.toml', '.codex/*'], ['.opencode/x.json', '.opencode/*'],
  ['.kimi/x.json', '.kimi/*'], ['.windsurf/rules.md', '.windsurf/*'], ['.atl/skill-registry.md', '.atl/*'], ['.mimocode/x.json', '.mimocode/*'],
  ['.playwright-mcp/page.yml', '.playwright-mcp/*'], ['.agents/x.md', '.agents/*'], ['scripts/agent-lifecycle/a.ts', '*/agent-lifecycle/*'],
  ['.claude/settings.json', '.claude/*'], ['Discovery-FE/.claude/x.md', '*/.claude/*'], ['CLAUDE.md', 'CLAUDE.md'], ['docs/CLAUDE.md', '*/CLAUDE.md'],
  ['AGENTS.md', 'AGENTS.md'], ['docs/GEMINI.md', '*/GEMINI.md'], ['.aider.conf.yml', '.aider*'], ['pkg/.aider.conf.yml', '*/.aider*'],
  ['AGENT-LEDGER.md', 'AGENT-LEDGER*'], ['docs/AGENT-LEDGER-es.md', '*/AGENT-LEDGER*'], ['rules.cursorrules', '*.cursorrules'],
  ['.github/copilot-instructions.md', '.github/copilot-instructions.md'], ['scripts/agent-worktree-lifecycle/a.ts', '*agent-worktree*'],
  ['src/subagents.ts', '*subagent*'], ['docs/agent-contract.md', '*agent-contract*']
]) check(terms(path) === term, `tool path ${term} matches ${path}`);

check(terms('.CURSOR\\Rules\\A.mdc') === '.cursor/*', 'matching ignores case and reads a Windows separator');
check(terms('src/cursor-styles.css') === '' && terms('src/app/cursor.component.ts') === '', 'NEAR MISS: "cursor" in a file name is CSS vocabulary, not the .cursor directory');
check(terms('docs/my.cursor.notes.md') === '', 'NEAR MISS: ".cursor" inside a file name is not a directory segment');
check(terms('src/agents/list.ts') === '' && terms('docs/agents.md.txt') === '', 'NEAR MISS: an "agents" folder and "agents.md.txt" are not AGENTS.md');
check(terms('docs/aiderman.md') === '' && terms('src/agent-ledger') === '*/AGENT-LEDGER*', 'NEAR MISS: "aiderman" lacks the ".aider" prefix, while a bare AGENT-LEDGER segment still matches');
check(terms('.cursor') === '', 'a FILE named .cursor is not a directory');
check(terms('docs/notagents.md') === '' && terms('agents.md/x.ts') === '', 'NEAR MISS: AGENTS.md is a whole file name, not a suffix and not a directory');
check(terms('docs/my.aider.md') === '' && terms('docs/old-agent-ledger.md') === '' && terms('a.cursorrules.bak') === '', 'NEAR MISS: a prefix or suffix glob must sit at the edge of its segment');
check(terms('src/claude-api.ts') === '' && terms('docs/claude.md.bak') === '', 'NEAR MISS: a "claude" word in a file name is not the .claude directory nor CLAUDE.md');

// The 27 globs b100-am-ui enforced in its own list before the lists were unified, all still present.
const B100_GLOBS = ['.agents/*', '.claude/*', '.cursor/*', '.gemini/*', '.codex/*', '.opencode/*', '.kimi/*', '.windsurf/*', '.aider*', '.atl/*', '.mimocode/*',
  '.playwright-mcp/*', 'CLAUDE.md', 'GEMINI.md', 'AGENTS.md', '*/CLAUDE.md', '*/GEMINI.md', '*/AGENTS.md', 'AGENT-LEDGER*', '*.cursorrules',
  '.github/copilot-instructions.md', '*agent-worktree*', '*subagent*', '*/agent-lifecycle/*', 'agent-lifecycle/*', '*agent-contract*', '*/AGENT-LEDGER*'];
check(B100_GLOBS.length === 27 && B100_GLOBS.every((glob) => BLOCKED_GLOBS.includes(glob)), `the shared list holds all 27 of b100-am-ui's globs (${B100_GLOBS.filter((glob) => BLOCKED_GLOBS.includes(glob)).length} of 27)`);
check(BLOCKED_GLOBS.length === 39 && new Set(BLOCKED_GLOBS).size === 39, `the shared list holds 39 distinct globs (${BLOCKED_GLOBS.length})`);
const sampleOf = (glob) => glob.replaceAll('*', 'x').replaceAll('?', 'q');
check(BLOCKED_GLOBS.every((glob) => toolPathTerms(sampleOf(glob)).includes(glob)), 'every glob of the shared list blocks a path built from it');
check(['src/app/app.component.ts', 'README.md', 'docs/adr/0001-lib.md'].every((path) => terms(path) === ''), 'three neutral paths match no glob');

// path-glob.mjs: shell `case` semantics.
check(globMatches('*', '') && globMatches('*', 'a/b/c') && globMatches('a/*', 'a/b/c'), '"*" matches the empty run and crosses "/"');
check(globMatches('a?c', 'abc') && !globMatches('a?c', 'ac') && !globMatches('a?c', 'abbc'), '"?" matches exactly one character');
check(globMatches('a*b*c', 'aXbYbZc') && !globMatches('a*b*c', 'aXbYbZ'), 'a later "*" backtracks to the last star');
check(!globMatches('abc', 'abcd') && !globMatches('abcd', 'abc') && globMatches('abc', 'abc'), 'the WHOLE path must match, neither a prefix nor a longer glob');
check(globMatches('a**', 'a') && !globMatches('a*', 'b'), 'trailing stars match nothing, and a literal head still has to match');

// parseBlockedPaths: the loader.
check(parseBlockedPaths('# c\n\n.a/*\r\n  *b*  \n#d\n').join() === '.a/*,*b*', 'comments, blank lines, CR and surrounding spaces are skipped');
let threw = '';
try { parseBlockedPaths('.a/*\n[ab]x\n'); } catch (error) { threw = error.message; }
check(threw.includes('[ab]x') && threw.includes('@es'), 'a glob with "[" is refused loudly, in both languages');
threw = '';
try { parseBlockedPaths('# only a comment\n\n'); } catch (error) { threw = error.message; }
check(threw.includes('no glob') && threw.includes('@es'), 'an empty list is refused loudly, never read as "nothing is blocked"');
check(toolPathTerms('x/y.md', ['*/y.md', 'z*']).join() === '*/y.md', 'toolPathTerms takes an injected list and returns the globs as written');

check(scanPaths(['.cursor/a.mdc', 'src/ok.ts'], NAMES).map((finding) => `${finding.where}=${finding.name}`).join() === '.cursor/a.mdc=.cursor/*', 'scanPaths reports a tool path with its glob and says it is a tool path');
check(scanPaths(['.cursor/a.mdc'], NAMES)[0]?.excerpt === '(tool path) .cursor/a.mdc', 'a tool-path finding says what kind it is');

// --- attribution in a commit MESSAGE (attribution.mjs): the phrases, the emoji and the near misses.
const attributionOf = (text) => attributionHits(text).map((hit) => `${hit.name}@${hit.line}`).join();

check(attributionOf('feat: x\n\nCo-Authored-By: A <a@x.test>') === 'co authored by@3', 'Co-Authored-By matches and reports its line');
check(attributionOf('Co authored by me') === 'co authored by@1' && attributionOf('CO-AUTHORED-BY: x') === 'co authored by@1', 'the spaced spelling and the upper-case spelling match');
check(attributionOf('Generated with a tool') === 'generated with@1' && attributionOf('Generated\nwith a tool') === 'generated with@1', '"Generated with" matches, also across a line break');
check(attributionOf('(cherry picked from commit 1)') === 'cherry picked from@1' && attributionOf('cherry-picked from x') === 'cherry picked from@1' && attributionOf('cherrypicked from x') === 'cherrypicked from@1', 'cherry-pick provenance matches in each spelling');
check(attributionOf('robot \u{1F916} here') === '\u{1F916}@1', 'the robot emoji matches');
check(attributionOf('test: regenerated with the script') === '' && attributionOf('docs: regenerated with --update') === '', 'NEAR MISS: "regenerated with" is another word, not "generated with"');
check(attributionOf('ensure:harness-generated) with care') === '' && attributionOf('harness-generated with care') === '', 'NEAR MISS: a hyphenated or clause-broken "generated" is not the phrase');
check(attributionOf('generated by the build, with care') === '' && attributionOf('co-authored, by hand') === '', 'NEAR MISS: a comma inside the phrase defeats it');
check(attributionOf('see the co-authored-by-agreement doc') === '', 'NEAR MISS: a longer compound that merely starts with the phrase parts is another term');
check(attributionOf('generated-- with care') === '' && attributionOf('generated --with care') === '', 'NEAR MISS: joiners next to the phrase break it, whichever side they sit on');
check(attributionOf('a\n\nb\nCo-Authored-By: x') === 'co authored by@4', 'the line is counted across blank lines');
check(attributionOf('feat: add the user-agent header') === '' && attributionOf('') === '', 'plain text and an empty message have no attribution');
check(scanMessage('feat: x\n\nCo-Authored-By: Claude', NAMES, 'commit message').map((finding) => finding.name).join() === 'claude,co authored by', 'scanMessage reports the tool name and the attribution together');
check(scanMessage('feat: x\n\nGenerated with a tool', NAMES, 'm')[0]?.excerpt === '(attribution) Generated with a tool', 'an attribution finding quotes its line');
check(scanText('Co-Authored-By: Someone', NAMES, 'x').length === 0, 'scanText alone (added lines, not messages) never judges attribution');

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
