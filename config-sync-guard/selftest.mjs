#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for config-sync-guard — the `Stop` mechanism enforcing the owner directive
 * "Config de agentes versionada y subida en el momento" (`~/.claude/rules/00-owner-mandates.md`).
 *
 * Exercises `decide()`'s whole state space with constructed fixtures and injected dependencies, then
 * `attribution.mjs`'s liveness filtering against REAL constructed transcript files (with real, deliberately
 * backdated mtimes — the one property `isLive` actually reads), then runs the real `guard.mjs` process
 * end to end over one small, real, constructed git repo.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de config-sync-guard. Ejercita `decide()` con fixtures construidos, la
 * liveness real de `attribution.mjs` contra transcripts reales con mtime retrasado a propósito, y
 * `guard.mjs` de punta a punta sobre un repo git real y construido.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { agentRecords, isLive, liveAgentWrites, liveOwnerOf } from './attribution.mjs';
import { pathspecCommitCommand } from './commit-advice.mjs';
import { commandDismiss, MINIMUM_REASON_LENGTH, parseArgs, readDismissals } from './dismiss.mjs';
import { decide } from './decide.mjs';
import { measureFingerprint } from './fingerprint.mjs';
import { evaluate } from './guard.mjs';
import { parseStatusPorcelain } from './status.mjs';
import { parseAheadLog } from './unpushed-commits.mjs';
import { writtenPathsIn } from './transcript-writes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD_CLI = path.join(HERE, 'guard.mjs');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);

  if (actualText === expectedText) {
    passed += 1;
    return;
  }

  failures.push(`${name} — expected ${expectedText}, got ${actualText}`);
}

/** A fake repo for `decide()`. `worktree` defaults to `HERE` (a real, existing directory), so "exists" is true unless a test overrides it to a nonexistent path. @es Un repo falso para `decide()`. */
function fakeRepo(name, { statusOk = true, statusText = '## master...origin/master\n', logOk = true, logText = '', worktree = HERE } = {}) {
  const answer = (ok, stdout) => ({ ok, stdout, stderr: ok ? '' : 'simulated git failure' });

  return {
    name,
    worktree,
    run: (args) => (args.includes('log') ? answer(logOk, logText) : answer(statusOk, statusText)),
    gitPrefix: `git-${name}`,
    pushCommand: `push-${name}`
  };
}

/** One transcript line holding a tool call, in the shape the harness writes. @es Una línea de transcript con una llamada a herramienta, con la forma del harness. */
const toolCall = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const edit = (filePath) => toolCall('Edit', { file_path: filePath });
const bash = (command) => toolCall('Bash', { command });
const prose = (text) => JSON.stringify({ type: 'user', message: { content: text } });

/** A live agent of `session` whose transcript is `lines`: what `liveAgentWrites` builds from a real file. @es Un agente vivo de `session` con transcript `lines`. */
const liveAgent = (session, ...lines) => ({ session, writes: writtenPathsIn(lines.join('\n')) });
const agents = (entries) => new Map(Object.entries(entries));

/** `git log --name-only` text for commits `[[hash, subject, ...paths]]`, in the format `readAheadCommits` requests. @es Texto de `git log --name-only`. */
const logOf = (...commits) => commits.map(([hash, subject, ...paths]) => `\x01${hash} ${subject}\n\n${paths.join('\n')}\n`).join('');

const STOP_PAYLOAD = (overrides = {}) => ({ session_id: 's-1', hook_event_name: 'Stop', stop_hook_active: false, ...overrides });

function verdictKind(payload, deps) {
  const result = decide(payload, deps);

  return result === undefined ? 'allow' : result.kind;
}

// ---------------------------------------------------------------------------------------------
// STATE: clean -> allow
// ---------------------------------------------------------------------------------------------
check('clean repo -> allow', verdictKind(STOP_PAYLOAD(), { repos: [fakeRepo('r')], liveAgents: new Map() }), 'allow');

// ---------------------------------------------------------------------------------------------
// STATE: ahead -> block
// ---------------------------------------------------------------------------------------------
{
  const repo = fakeRepo('r', { statusText: '## master...origin/master [ahead 2]\n' });
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map() });

  check('ahead of remote -> block', result?.kind, 'block');
  check('ahead of remote: the finding names the ahead count', result?.dirtyRepos?.[0]?.aheadCount, 2);
}

// ---------------------------------------------------------------------------------------------
// STATE: dirty mine (unattributed) -> block
// ---------------------------------------------------------------------------------------------
{
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M foo.txt\n' });
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map() });

  check('dirty, no live owner -> block', result?.kind, 'block');
  check('the unattributed list names the path', result?.dirtyRepos?.[0]?.unattributed, [path.join(HERE, 'foo.txt')]);
}

// ---------------------------------------------------------------------------------------------
// STATE: dirty owned by a live agent -> allow. Attribution is WRITTEN, never mentioned: the path must
// be the target of a structured file-writing call in the live agent's transcript (`attribution.mjs`).
// ---------------------------------------------------------------------------------------------
{
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M foo.txt\n' });
  const liveAgents = agents({ 'agent-x': liveAgent('s-2', edit('C:\\fake\\foo.txt')) });

  check('dirty, and a LIVE agent WROTE the path -> allow', verdictKind(STOP_PAYLOAD(), { repos: [repo], liveAgents }), 'allow');
}
{
  // Measured 2026-10-01: 8 of 8 live transcripts MENTIONED lessons-ledger.md (the contract text that
  // imports it rides in every context), so every ledger hunk was excused. A mention excuses nothing.
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M lessons-ledger.md\n' });
  const mentioned = agents({ 'agent-x': liveAgent('s-2', prose('@~/.claude/lessons-ledger.md is imported'), bash('rg -n RULE lessons-ledger.md')) });
  const written = agents({ 'agent-x': liveAgent('s-2', edit('C:\\Users\\me\\.claude\\lessons-ledger.md')) });

  check('dirty, a live agent only MENTIONED/READ the path (prose, shell command) -> block', verdictKind(STOP_PAYLOAD(), { repos: [repo], liveAgents: mentioned }), 'block');
  check('dirty, the same path WRITTEN by a live agent (absolute Edit path) -> allow', verdictKind(STOP_PAYLOAD(), { repos: [repo], liveAgents: written }), 'allow');
}

// ---------------------------------------------------------------------------------------------
// THE SECOND FACE, found in live use the day this guard shipped: `git status --porcelain` collapses a
// wholly-untracked NEW directory into ONE entry (`?? dir/`), never the individual files inside — this
// tool's own `config-sync-guard/` tripped as "unattributed" despite every file inside being Written
// directly. Verified against a REAL, constructed git repo before fixing (see `attribution.mjs`'s own
// docblock): `?? sub/` for two brand-new files under `sub/`, never `sub/a.txt`/`sub/b.txt`. Under the
// current substring-over-full-transcript design, the collapsed directory's own NAME just needs to
// appear anywhere in a live agent's transcript text — e.g. inside a file_path it DID write.
// ---------------------------------------------------------------------------------------------
{
  // A git status line reporting a wholly-new, untracked DIRECTORY (`??  new-dir/`), never a file.
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n?? new-dir/\n' });
  const liveAgents = agents({ 'agent-x': liveAgent('s-2', edit('C:\\fake\\new-dir\\inner-file.ts')) });

  check('a collapsed, wholly-untracked NEW DIRECTORY is attributed when a live agent wrote a file under it -> allow', verdictKind(STOP_PAYLOAD(), { repos: [repo], liveAgents }), 'allow');
}
{
  // The SAME collapsed directory, but no live agent's transcript mentions its name at all -> still blocks.
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n?? new-dir/\n' });

  check('a collapsed NEW DIRECTORY no live agent\'s transcript mentions -> block', verdictKind(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map() }), 'block');
}

// ---------------------------------------------------------------------------------------------
// CHANGED ON PURPOSE (2026-10-01): a path a live agent's Bash/PowerShell command merely NAMES used to
// be attributed to it. A command naming a path may read it, so naming is a mention and excuses nothing;
// only a structured write does. A shell-written path now blocks (the safe direction; dismiss covers it).
// ---------------------------------------------------------------------------------------------
{
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M owned-dir/generated.json\n' });
  const liveAgents = agents({ 'agent-shell': liveAgent('s-2', bash('node scripts/gen.mjs > owned-dir/generated.json')) });

  check('a path a live agent\'s shell command only NAMES -> block', verdictKind(STOP_PAYLOAD(), { repos: [repo], liveAgents }), 'block');
}
{
  // A live agent that wrote a DIFFERENT file, and a same-named file elsewhere -> block.
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M owned-dir/generated.json\n' });
  const liveAgents = agents({ 'agent-other': liveAgent('s-2', edit('C:\\fake\\unrelated-dir\\other-output.txt'), edit('C:\\fake\\other-dir\\generated.json'), edit('C:\\fake\\not-owned-dir\\generated.json')) });

  check('the live agent wrote a different path, a same-named file elsewhere, and a longer directory name ending alike -> block', verdictKind(STOP_PAYLOAD(), { repos: [repo], liveAgents }), 'block');
}

// ---------------------------------------------------------------------------------------------
// STATE: dirty owned by a DEAD agent -> block. Tested at the decide() level the same as "dirty
// mine" (a dead agent's transcript is simply ABSENT from the liveAgents map decide() consumes — that
// absence is exactly what `liveAgentWrites` produces for a dead agent, proven separately below at
// the attribution.mjs level with a REAL backdated transcript file).
// ---------------------------------------------------------------------------------------------
{
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M foo.txt\n' });
  // A live-texts map that mentions a DIFFERENT path only (standing in for "the agent who once touched
  // foo.txt is now dead, so it teaches nothing about foo.txt any more").
  const liveAgents = agents({ 'agent-y': liveAgent('s-2', edit('C:\\fake\\unrelated.txt')) });

  check('dirty, owning agent is DEAD (absent from the live map) -> block', verdictKind(STOP_PAYLOAD(), { repos: [repo], liveAgents }), 'block');
}

// ---------------------------------------------------------------------------------------------
// STATE SPACE: unpushed commits. A commit ahead of the remote is excused for THIS session only when a
// live agent of ANOTHER session wrote every path it changes, and no live agent of this session wrote
// any of them. `decide()` reads this session from the payload (`STOP_PAYLOAD` is session `s-1`).
// @es ESPACIO DE ESTADOS: commits sin subir. Se excusa solo si un agente vivo de OTRA sesión escribió
// cada ruta y ninguno vivo de ESTA sesión escribió alguna.
// ---------------------------------------------------------------------------------------------
{
  const ahead = (count, ...commits) => fakeRepo('r', { statusText: `## master...origin/master [ahead ${String(count)}]\n`, logText: logOf(...commits) });
  const other = agents({ 'agent-other': liveAgent('s-2', edit('C:\\wt\\cfg\\foo\\a.mjs'), edit('C:\\wt\\cfg\\foo\\b.mjs')) });
  const both = agents({ 'agent-other': liveAgent('s-2', edit('C:\\wt\\cfg\\foo\\a.mjs')), 'agent-own': liveAgent('s-1', edit('C:\\wt\\cfg\\foo\\a.mjs')) });
  const own = agents({ 'agent-own': liveAgent('s-1', edit('C:\\wt\\cfg\\foo\\a.mjs')) });
  const mentioned = agents({ 'agent-other': liveAgent('s-2', bash('git -C wt show foo/a.mjs')) });
  const verdictFor = (repo, liveAgents, payload = STOP_PAYLOAD()) => decide(payload, { repos: [repo], liveAgents });
  const one = ['aaa1111', 'feat: a', 'foo/a.mjs'];

  const foreign = verdictFor(ahead(1, one), other);

  check('an ahead commit whose every path ANOTHER session\'s live agent wrote -> note, never a block', foreign?.kind, 'note');
  check('the note names the commit and the live agent that owns it', foreign?.notes?.[0]?.includes('aaa1111') && foreign?.notes?.[0]?.includes('agent-other'), true);
  check('an ahead commit this session\'s own live agent wrote -> block', verdictFor(ahead(1, one), own)?.kind, 'block');
  check('an ahead commit written by another session AND by this one -> block (ours)', verdictFor(ahead(1, one), both)?.kind, 'block');
  check('an ahead commit nobody live wrote -> block', verdictFor(ahead(1, one), new Map())?.kind, 'block');
  check('an ahead commit another live agent only MENTIONED -> block', verdictFor(ahead(1, one), mentioned)?.kind, 'block');
  check('a mixed commit (one path written by another session, one by nobody) -> block', verdictFor(ahead(1, ['bbb2222', 'feat: b', 'foo/a.mjs', 'foo/c.mjs']), other)?.kind, 'block');
  check('a commit that changes no path (empty) -> block', verdictFor(ahead(1, ['ccc3333', 'chore: empty']), other)?.kind, 'block');
  check('a payload with no session id cannot tell "another session" -> block', verdictFor(ahead(1, one), other, { hook_event_name: 'Stop' })?.kind, 'block');
  check('a git log that fails leaves every ahead commit unowned, even with output -> block', verdictFor(fakeRepo('r', { statusText: '## master...origin/master [ahead 1]\n', logOk: false, logText: logOf(one) }), other)?.kind, 'block');

  const split = verdictFor(ahead(2, one, ['ddd4444', 'feat: mine', 'foo/c.mjs']), other);

  check('two ahead commits, one another session\'s and one unowned -> block', split?.kind, 'block');
  check('the block names only the unowned commit, and counts one unowned', [split?.dirtyRepos?.[0]?.unownedCommits?.map((entry) => entry.hash), split?.dirtyRepos?.[0]?.unownedAhead], [['ddd4444'], 1]);
  check('more commits ahead than the log lists -> the surplus blocks', verdictFor(ahead(2, one), other)?.kind, 'block');
}

// ---------------------------------------------------------------------------------------------
// STATE SPACE: dismissals, scoped to a fingerprint (`fingerprint.mjs`) of the EXACT repo state at
// the moment of the dismissal. `fingerprintOf` and `dismissals` are injected fakes throughout this
// block — never the real `measureFingerprint`/`readDismissals()` — so these are pure unit tests of
// `decide.mjs`'s own matching logic; the REAL fingerprint mechanism against a real git repo is proven
// separately, below, in the end-to-end section.
// ---------------------------------------------------------------------------------------------
{
  // No dismissal recorded at all -> block. Absence excuses nothing.
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M foo.txt\n' });
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map(), fingerprintOf: () => 'fixed-fingerprint-1', dismissals: [] });

  check('dirty, no dismissal recorded -> block', result?.kind, 'block');
}
{
  // A dismissal recorded for this EXACT repo + fingerprint -> allow, but with a note, never silently.
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M foo.txt\n' });
  const dismissals = [{ repo: 'r', fingerprint: 'fixed-fingerprint-1', at: '2026-09-30T00:00:00.000Z', reason: 'the frozen agent\'s work here awaits an owner decision' }];
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map(), fingerprintOf: () => 'fixed-fingerprint-1', dismissals });

  check('dirty, a MATCHING dismissal -> note, never a silent allow and never a block', result?.kind, 'note');
  check('the note names when it was dismissed and carries the reason', result?.notes?.[0]?.includes('dismissed at 2026-09-30T00:00:00.000Z') && result?.notes?.[0]?.includes('owner decision'), true);
}
{
  // A dismissal exists for this repo, but the CONTENT changed since (a different tree id) -> block.
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M foo.txt\n' });
  const dismissals = [{ repo: 'r', fingerprint: '0:tree-before-the-edit', at: '2026-09-30T00:00:00.000Z', reason: 'dismissed before foo.txt was edited again' }];
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map(), fingerprintOf: () => '0:tree-after-the-edit', dismissals });

  check('dirty, dismissal is for a DIFFERENT content fingerprint (edited since) -> block', result?.kind, 'block');
}
{
  // A dismissal exists for this repo, but a NEW PATH appeared since (still a different tree id) ->
  // block — a tree hash is content-addressed over EVERY path, so an added path changes it exactly as
  // an edited byte does; same mechanism as the content-change case, different real-world trigger.
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M foo.txt\n?? new-file.txt\n' });
  const dismissals = [{ repo: 'r', fingerprint: '0:tree-before-new-file', at: '2026-09-30T00:00:00.000Z', reason: 'dismissed before new-file.txt ever appeared' }];
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map(), fingerprintOf: () => '0:tree-after-new-file', dismissals });

  check('dirty, a new path appeared since the dismissal -> block', result?.kind, 'block');
}
{
  // A dismissal exists, but the AHEAD COUNT changed since (2 -> 3) -> block. `fingerprintOf` here
  // mirrors `measureFingerprint`'s own shape (ahead count + a tree id) so the ahead segment is
  // genuinely derived from the SAME statusText `decide.mjs` already parses, not hand-waved.
  const repo = fakeRepo('r', { statusText: '## master...origin/master [ahead 3]\n M foo.txt\n' });
  const fingerprintOf = (candidate) => {
    const status = candidate.run(['status', '--porcelain=v1', '--branch']);
    const { aheadCount } = parseStatusPorcelain(status.stdout);

    return `${String(aheadCount)}:fixed-tree`;
  };
  const dismissals = [{ repo: 'r', fingerprint: '2:fixed-tree', at: '2026-09-30T00:00:00.000Z', reason: 'dismissed when only 2 commits sat ahead of the remote' }];
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map(), fingerprintOf, dismissals });

  check('dirty, ahead count changed since the dismissal (2 -> 3) -> block', result?.kind, 'block');
}
{
  // A dismissal exists for this repo+fingerprint, but the fingerprint could NOT be measured this
  // time (a git failure, no gitDir, whatever) -> block. An unmeasured state never reads as "matches a
  // past excuse" — the same fail-toward-block stance as every other measurement in this mechanism.
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M foo.txt\n' });
  const dismissals = [{ repo: 'r', fingerprint: 'irrelevant-because-unmeasured', at: '2026-09-30T00:00:00.000Z', reason: 'this dismissal exists but cannot be reached this time' }];
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map(), fingerprintOf: () => undefined, dismissals });

  check('dirty, fingerprint could not be measured this time -> block, never excused by luck', result?.kind, 'block');
}
{
  // A dismissal exists for a DIFFERENT repo name sharing the SAME fingerprint value -> block. A
  // fingerprint alone is not a key: it is scoped to (repo name, fingerprint) TOGETHER.
  const repo = fakeRepo('r', { statusText: '## master...origin/master\n M foo.txt\n' });
  const dismissals = [{ repo: 'a-different-repo', fingerprint: 'fixed-fingerprint-1', at: '2026-09-30T00:00:00.000Z', reason: 'this dismissal belongs to a different declared repo entirely' }];
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map(), fingerprintOf: () => 'fixed-fingerprint-1', dismissals });

  check('dirty, a dismissal with the same fingerprint but a DIFFERENT repo name -> block', result?.kind, 'block');
}

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: readDismissals — tolerant of a malformed line, empty (never thrown) when unreadable.
// ---------------------------------------------------------------------------------------------
check(
  'readDismissals parses a well-formed JSONL line',
  readDismissals({ read: () => '{"repo":"r","fingerprint":"f","at":"2026-01-01T00:00:00.000Z","reason":"x"}\n' }),
  [{ repo: 'r', fingerprint: 'f', at: '2026-01-01T00:00:00.000Z', reason: 'x' }]
);
check(
  'readDismissals skips a malformed line rather than throwing, keeping the good ones',
  readDismissals({ read: () => 'not json at all\n{"repo":"r","fingerprint":"f","at":"t","reason":"y"}\n' }).length,
  1
);
check(
  'readDismissals returns empty when the file cannot be read at all (never seen as clean)',
  readDismissals({
    read: () => {
      throw new Error('ENOENT');
    }
  }),
  []
);

// ---------------------------------------------------------------------------------------------
// STATE: repo missing -> allow with a message
// ---------------------------------------------------------------------------------------------
{
  const repo = fakeRepo('r', { worktree: path.join(HERE, 'this-directory-does-not-exist-at-all') });
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map() });

  check('missing repo -> allow (never a block)', result === undefined || result.kind === 'note', true);
  check('missing repo -> a note is produced', result?.kind, 'note');
  check('the note names the repo and says "not found"', result?.notes?.[0]?.includes('not found'), true);
}

// ---------------------------------------------------------------------------------------------
// STATE: git failure -> allow with a message, never a false clean
// ---------------------------------------------------------------------------------------------
{
  const repo = fakeRepo('r', { statusOk: false });
  const result = decide(STOP_PAYLOAD(), { repos: [repo], liveAgents: new Map() });

  check('git failure -> allow (never a block)', result === undefined || result.kind === 'note', true);
  check('git failure -> a note is produced, never silent success', result?.kind, 'note');
  check('the note says it could not verify, and does NOT claim clean', result?.notes?.[0]?.includes('cannot verify'), true);
}

// ---------------------------------------------------------------------------------------------
// stop_hook_active -> allow, even with a dirty, unattributed repo
// ---------------------------------------------------------------------------------------------
{
  const repo = fakeRepo('r', { statusText: '## master...origin/master [ahead 5]\n M foo.txt\n' });

  check('stop_hook_active -> allow regardless', verdictKind(STOP_PAYLOAD({ stop_hook_active: true }), { repos: [repo], liveAgents: new Map() }), 'allow');
}

// ---------------------------------------------------------------------------------------------
// malformed payload -> allow + exit 0, via the real evaluate()
// ---------------------------------------------------------------------------------------------
check('malformed JSON -> evaluate() allows (undefined)', evaluate('NOT JSON AT ALL'), undefined);
check('empty stdin -> evaluate() allows (undefined)', evaluate(''), undefined);

// The REAL `evaluate()`, with FAKE repos injected through its optional second parameter — proves the
// shim's OWN wiring (JSON parsing, block formatting, the journal write), not just `decide()` in
// isolation. See `guard.mjs`'s own docblock for why this seam exists and why production never uses it.
{
  const journalPath = path.join(HERE, 'state', 'refusals.jsonl');
  const journalledFor = (session) => (existsSync(journalPath) ? readFileSync(journalPath, 'utf8').split('\n').filter((line) => line.includes(session)).length : 0);
  const session = `selftest-evaluate-${String(process.pid)}-${String(Date.now())}`;
  const before = journalledFor(session);

  const dirtyRepo = fakeRepo('fixture-repo', { statusText: '## master...origin/master [ahead 1]\n M foo.txt\n?? sub/x.txt\n', logText: logOf(['eee5555', 'feat: e', 'foo.txt']) });
  const raw = JSON.stringify(STOP_PAYLOAD({ session_id: session }));
  const output = evaluate(raw, { repos: [dirtyRepo], liveAgents: new Map() });
  const advice = output?.hookSpecificOutput?.additionalContext ?? '';

  check('evaluate() with a real dirty finding returns a block decision', output?.decision, 'block');
  check('the block names the unowned commit', advice.includes('eee5555 feat: e'), true);
  check('the block recommends an explicit-pathspec commit of the unattributed path, never a sweeping add', advice.includes('add -- "foo.txt" "sub/x.txt" &&') && advice.includes('commit -m "type(scope): description" -- "foo.txt" "sub/x.txt"') && !advice.includes('add -A'), true);
  check('evaluate() names the guard in its additionalContext', output?.hookSpecificOutput?.additionalContext?.includes('CONFIG-SYNC-GUARD TRIPPED'), true);
  check('evaluate() journals the refusal for real, under this exact session id', journalledFor(session) - before, 1);

  const cleanOutput = evaluate(JSON.stringify(STOP_PAYLOAD({ session_id: session })), { repos: [fakeRepo('fixture-repo')], liveAgents: new Map() });

  check('evaluate() with a clean fixture repo allows', cleanOutput, undefined);
}

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: status.mjs parsing, in isolation.
// ---------------------------------------------------------------------------------------------
check('parseStatusPorcelain: clean', parseStatusPorcelain('## master...origin/master\n'), { aheadCount: 0, dirtyPaths: [] });
check('parseStatusPorcelain: ahead', parseStatusPorcelain('## master...origin/master [ahead 3]\n'), { aheadCount: 3, dirtyPaths: [] });
check('parseStatusPorcelain: dirty tracked + untracked', parseStatusPorcelain('## master...origin/master\n M tracked.ts\n?? untracked.ts\n'), { aheadCount: 0, dirtyPaths: ['tracked.ts', 'untracked.ts'] });
check('parseStatusPorcelain: no branch line at all -> 0 ahead', parseStatusPorcelain(' M a.ts\n').aheadCount, 0);
check('parseStatusPorcelain: non-string input is empty, never throws', parseStatusPorcelain(undefined), { aheadCount: 0, dirtyPaths: [] });

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: the parsers and the command text, in isolation.
// ---------------------------------------------------------------------------------------------
check(
  'writtenPathsIn collects exactly the file-writing tools\' targets, normalized and unique, and nothing a command or a result merely names',
  writtenPathsIn([edit('C:\\A\\One.ts'), edit('c:/a/one.ts'), toolCall('Write', { file_path: 'C:\\a\\two.ts' }), toolCall('MultiEdit', { file_path: 'C:\\a\\three.ts' }), toolCall('NotebookEdit', { notebook_path: 'C:\\a\\n.ipynb' }), bash('touch C:\\a\\four.ts'), toolCall('Read', { file_path: 'C:\\a\\five.ts' }), prose('C:\\a\\six.ts'), '{"tool_use": cut off', toolCall('Edit', {})].join('\n')),
  ['c:/a/one.ts', 'c:/a/two.ts', 'c:/a/three.ts', 'c:/a/n.ipynb']
);
check('parseAheadLog reads each commit with its paths, in order', parseAheadLog(logOf(['abc1234', 'feat: x: y', 'a/b.mjs', 'c.mjs'], ['def5678', 'chore: empty'])), [
  { hash: 'abc1234', subject: 'feat: x: y', paths: ['a/b.mjs', 'c.mjs'] },
  { hash: 'def5678', subject: 'chore: empty', paths: [] }
]);
check('pathspecCommitCommand stages then commits only the named paths, quoted, after `--`', pathspecCommitCommand('git -C ~/.claude', ['a b/c.mjs', 'd.mjs']), 'git -C ~/.claude add -- "a b/c.mjs" "d.mjs" && git -C ~/.claude commit -m "type(scope): description" -- "a b/c.mjs" "d.mjs"');

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: attribution.mjs, against REAL constructed transcript files (never the real fleet).
// ---------------------------------------------------------------------------------------------
{
  const scratch = mkdtempSync(path.join(tmpdir(), 'config-sync-guard-selftest-'));

  const liveTranscript = path.join(scratch, 'live.jsonl');
  const deadTranscript = path.join(scratch, 'dead.jsonl');

  writeFileSync(liveTranscript, `${edit('C:\\fake\\live.ts')}\n`, 'utf8');
  writeFileSync(deadTranscript, `${edit('C:\\fake\\dead.ts')}\n`, 'utf8');

  const now = Date.now();
  const longAgo = new Date(now - 60 * 60 * 1000); // 1h ago, past the 30-minute ACTIVE_WINDOW_MS

  utimesSync(deadTranscript, longAgo, longAgo); // REAL backdated mtime — the one property isLive reads

  const liveRecord = { id: 'agent-live', session: 's-live', transcript: liveTranscript };
  const deadRecord = { id: 'agent-dead', session: 's-dead', transcript: deadTranscript };

  check('isLive: a transcript written NOW is live', isLive(liveRecord, now), true);
  check('isLive: a transcript backdated past the window is DEAD', isLive(deadRecord, now), false);

  const texts = liveAgentWrites(now, [liveRecord, deadRecord]);

  check('liveAgentWrites includes the live agent, with its session and what it wrote', texts.get('agent-live'), { session: 's-live', writes: ['c:/fake/live.ts'] });
  check('liveAgentWrites EXCLUDES the dead agent entirely', texts.has('agent-dead'), false);
  check('liveOwnerOf finds the live agent for its own path', liveOwnerOf('C:\\fake\\live.ts', texts), 'agent-live');
  check('liveOwnerOf finds nothing for the dead agent\'s path (its transcript is not even in the map)', liveOwnerOf('C:\\fake\\dead.ts', texts), undefined);
  check('liveOwnerOf is case-insensitive (Windows paths)', liveOwnerOf('c:\\FAKE\\LIVE.TS', texts), 'agent-live');
  check('liveOwnerOf: no match in an unrelated path no live agent mentions', liveOwnerOf('C:\\somewhere-else\\x.ts', texts), undefined);
  // An unparseable dirty path (empty, or all separators) yields an EMPTY needle — without a guard,
  // `''.includes('')` is true for every string, so it would match the FIRST agent in the map by
  // accident regardless of content. Proves that guard is load-bearing, not merely present.
  check('liveOwnerOf: an empty/unparseable path never matches by accident, even with agents present', liveOwnerOf('', texts), undefined);

  rmSync(scratch, { recursive: true, force: true });
}

check('agentRecords is empty for a nonexistent root, never throws', agentRecords(path.join(HERE, 'no-such-root')), []);
{
  const root = mkdtempSync(path.join(tmpdir(), 'config-sync-guard-records-'));
  const subagents = path.join(root, 'some-project', 'session-7', 'subagents');

  mkdirSync(subagents, { recursive: true });
  writeFileSync(path.join(subagents, 'agent-a.meta.json'), '{}', 'utf8');
  check('agentRecords names the session whose directory holds the transcript', agentRecords(root), [{ id: 'agent-a', session: 'session-7', transcript: path.join(subagents, 'agent-a.jsonl') }]);
  rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: the dismiss CLI's own validation.
// ---------------------------------------------------------------------------------------------
check('parseArgs reads --flag value pairs', parseArgs(['--repo', 'r', '--reason', 'because this drift is intentional and expected here']), { repo: 'r', reason: 'because this drift is intentional and expected here' });
{
  // A dismissal now MEASURES a fingerprint at record time — `repos`/`fingerprintOf` are injected fakes
  // so this never touches a real declared repo or spawns a real git process.
  const calls = [];
  const fakeDismissRepo = { name: 'r', worktree: HERE };
  const result = commandDismiss(
    { session: 's-1', repo: 'r', reason: 'this repo is a scratch clone, never meant to sync' },
    { append: (...args) => calls.push(args), mkdir: () => {}, repos: [fakeDismissRepo], fingerprintOf: () => '0:fixed-tree-hash' }
  );

  check('a long-enough reason, a declared repo, and a measurable fingerprint -> accepted and appended', result.ok, true);
  check('the dismissal is appended exactly once', calls.length, 1);
  check('the appended record carries the MEASURED fingerprint, not just the reason', calls[0]?.[1]?.includes('0:fixed-tree-hash'), true);
}
{
  const result = commandDismiss({ session: 's-1', reason: 'too short' }, { append: () => {}, mkdir: () => {} });

  check('a reason shorter than the minimum is REFUSED', result.ok, false);
  check('the refusal names the minimum length', result.problems.some((p) => p.includes(String(MINIMUM_REASON_LENGTH))), true);
}
{
  const result = commandDismiss(
    { session: 's-1', repo: 'does-not-exist', reason: 'this repo is a scratch clone, never meant to sync' },
    { append: () => {}, mkdir: () => {}, repos: [{ name: 'r', worktree: HERE }], fingerprintOf: () => '0:fixed-tree-hash' }
  );

  check('a --repo name matching no declared repo is REFUSED', result.ok, false);
  check('the refusal names the declared repos it accepts', result.problems.some((p) => p.includes('declared backup repos')), true);
}
{
  const calls = [];
  const result = commandDismiss(
    { session: 's-1', repo: 'r', reason: 'this repo is a scratch clone, never meant to sync' },
    { append: (...args) => calls.push(args), mkdir: () => {}, repos: [{ name: 'r', worktree: HERE }], fingerprintOf: () => undefined }
  );

  check('an UNMEASURABLE fingerprint REFUSES the dismissal outright', result.ok, false);
  check('a refused, unmeasurable dismissal appends nothing at all', calls.length, 0);
}

// ---------------------------------------------------------------------------------------------
// THE WHOLE HOOK, END TO END, over a REAL constructed git repo and a REAL `guard.mjs` process. This
// cannot use `decide.mjs`'s own default `declaredRepos()` (the two REAL owner repos) without either
// touching real state or being flaky against whatever is actually dirty on this machine right now —
// so this end-to-end proof targets the WIRING (stdin -> decide -> stdout -> journal) using the same
// pure `decide()` this selftest already trusts, invoked through the real `guard.mjs` module's own
// `evaluate()` — which is already exercised above via malformed-payload cases. What end-to-end
// coverage adds here is the REAL git repo path through `repos.mjs`'s own `runCommand`, proven via a
// throwaway repo and a hand-built `decide` call that mirrors exactly what `guard.mjs` does.
// @es EL HOOK ENTERO, sobre un repo git real construido. No puede usar los dos repos REALES del
// dueño sin tocar estado real; en su lugar prueba la ruta git real de `repos.mjs` con un repo
// desechable.
// ---------------------------------------------------------------------------------------------
{
  const scratch = mkdtempSync(path.join(tmpdir(), 'config-sync-guard-repo-'));
  const git = (...args) => execFileSync('git', ['-C', scratch, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  mkdirSync(scratch, { recursive: true });
  git('init', '-q');
  // A REAL, non-empty first commit — unlike an `--allow-empty` commit, this is guaranteed to create a
  // real `.git/index` on disk, which the byte-identical proof below needs something real to compare.
  writeFileSync(path.join(scratch, 'seed.txt'), 'seed\n', 'utf8');
  git('add', '-A');
  git('-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '-q', '-m', 'chore: init');

  const realRepo = {
    name: 'fixture',
    worktree: scratch,
    gitDir: path.join(scratch, '.git'),
    run: (args) => {
      try {
        const stdout = execFileSync('git', ['-C', scratch, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { ok: true, stdout, stderr: '' };
      } catch (error) {
        return { ok: false, stdout: '', stderr: String(error?.stderr ?? error) };
      }
    },
    gitPrefix: 'git',
    pushCommand: 'git push'
  };

  check('REAL git repo, clean, no upstream configured -> allow', verdictKind(STOP_PAYLOAD(), { repos: [realRepo], liveAgents: new Map() }), 'allow');

  // ---------------------------------------------------------------------------------------------
  // THE REAL FINGERPRINT MECHANISM, against a REAL git repo — never faked. Proves the three claims
  // `fingerprint.mjs`'s docblock makes: it returns a real string, it NEVER touches the repo's real
  // index (the byte-identical proof), and it actually DISCRIMINATES real content changes (the empty
  // "add" or a dropped `GIT_INDEX_FILE` mutant would both fail these).
  // ---------------------------------------------------------------------------------------------
  const indexPath = path.join(scratch, '.git', 'index');
  const fingerprintClean = measureFingerprint(realRepo);

  check('measureFingerprint on a real, clean repo returns a defined string fingerprint', typeof fingerprintClean, 'string');

  // A repo whose `run` reports a FAILED status, but whose gitDir/worktree are otherwise real and
  // fingerprint-able on their own — proves measureFingerprint refuses on the status failure alone,
  // never falling through to compute a tree hash regardless.
  const realRepoWithFailingStatus = { ...realRepo, run: () => ({ ok: false, stdout: '', stderr: 'simulated status failure' }) };

  check('measureFingerprint returns undefined when git status fails, even though the tree itself could still be hashed', measureFingerprint(realRepoWithFailingStatus), undefined);

  writeFileSync(path.join(scratch, 'untracked.txt'), 'hello\n', 'utf8');

  // THE BYTE-IDENTICAL PROOF, taken on a DIRTY tree (an untracked file genuinely present), never on
  // the clean one above. MEASURED directly, via the mutation campaign: on a CLEAN working tree, `git
  // add -A` has nothing to stage regardless of which index it targets, so a dropped `GIT_INDEX_FILE`
  // override survived a clean-tree version of this exact check — only a tree with something real to
  // stage can tell "used a throwaway index" apart from "used the real one and got lucky".
  const indexBeforeDirty = readFileSync(indexPath);
  const fingerprintWithUntracked = measureFingerprint(realRepo);
  const indexAfterDirty = readFileSync(indexPath);

  check('measureFingerprint DIFFERS once a real untracked file is added — the tree hash is content-addressed for real', fingerprintClean === fingerprintWithUntracked, false);
  check(
    'the real .git/index is left BYTE-IDENTICAL after fingerprinting a DIRTY tree (a temporary index was used, never the real one)',
    Buffer.compare(indexBeforeDirty, indexAfterDirty),
    0
  );

  const dirtyResult = decide(STOP_PAYLOAD(), { repos: [realRepo], liveAgents: new Map() });

  check('REAL git repo, one real untracked file, no live owner -> block', dirtyResult?.kind, 'block');
  check('REAL git repo: the unattributed path is the real untracked file', dirtyResult?.dirtyRepos?.[0]?.unattributed, [path.join(scratch, 'untracked.txt')]);

  const liveOwned = agents({ 'agent-z': liveAgent('s-2', edit(path.join(scratch, 'untracked.txt'))) });

  check('REAL git repo, same untracked file, now WRITTEN by a live agent -> allow', verdictKind(STOP_PAYLOAD(), { repos: [realRepo], liveAgents: liveOwned }), 'allow');

  // ---------------------------------------------------------------------------------------------
  // THE REAL DISMISSAL LIFECYCLE: a dismissal recorded against the EXACT current real fingerprint
  // excuses it (with a note, never silently) — and the SAME dismissal stops matching the instant the
  // real tree changes again, proving the whole stack end to end, never just the fake-repo unit tests.
  // ---------------------------------------------------------------------------------------------
  const dismissals = [{ repo: 'fixture', fingerprint: fingerprintWithUntracked, at: '2026-09-30T00:00:00.000Z', reason: 'the untracked scratch file here is deliberate test fixture debris' }];

  check('REAL git repo, a dismissal matching the EXACT current fingerprint -> allow with a note', verdictKind(STOP_PAYLOAD(), { repos: [realRepo], liveAgents: new Map(), dismissals }), 'note');

  writeFileSync(path.join(scratch, 'untracked.txt'), 'hello, but edited now\n', 'utf8');

  check('REAL git repo, the SAME dismissal no longer matches once the file\'s content changed -> block again', verdictKind(STOP_PAYLOAD(), { repos: [realRepo], liveAgents: new Map(), dismissals }), 'block');

  rmSync(scratch, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------
// THE WIRING: the guard is registered for Stop, and the REAL global manifest lists it.
// ---------------------------------------------------------------------------------------------
{
  const declaration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  check('the declaration registers Stop', declaration.registrations?.[0]?.event, 'Stop');

  // Read from `homedir()`, deliberately NOT relative to `HERE`: a mutation-proof sandbox copies this
  // selftest into a throwaway directory with no sibling `hook-dispatch/` at all.
  // @es Leído desde `homedir()`, nunca relativo a `HERE`: un sandbox de mutación no tiene `hook-dispatch/` hermano.
  const manifestPath = path.join(homedir(), '.claude', 'hook-dispatch', 'manifests', 'stop.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { guards: [] };
  check('the REAL global Stop manifest lists config-sync-guard', manifest.guards.some((entry) => entry.includes('config-sync-guard/guard.mjs')), true);
}

process.stdout.write(`config-sync-guard.selftest: ${String(passed)} passed, ${String(failures.length)} failed\n`);

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);

process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
