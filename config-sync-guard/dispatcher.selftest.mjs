#!/usr/bin/env node
/**
 * END-TO-END PROOF of config-sync-guard through the REAL Stop dispatcher (`hook-dispatch/dispatch.mjs`):
 * a real manifest, real-shaped Stop payloads, a REAL git repo with a REAL remote and unpushed commits,
 * and REAL transcript files on disk read by the real `agentRecords`/`liveAgentWrites`. Only the two
 * owner repos are replaced (the guard's own `decideDeps` seam), so nothing here depends on, or touches,
 * the state of `~/.claude` or of the project backup.
 *
 * @es PRUEBA DE PUNTA A PUNTA de config-sync-guard por el dispatcher Stop REAL: manifiesto real, payloads
 * Stop con forma real, un repo git REAL con remoto REAL y commits sin subir, y transcripts REALES en disco
 * leídos por `agentRecords`/`liveAgentWrites`. Solo se reemplazan los dos repos del dueño.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { dispatch } from '../hook-dispatch/dispatch.mjs';
import { agentRecords, liveAgentWrites } from './attribution.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');
const OTHER_SESSION = 'session-other';
const THIS_SESSION = 'session-this';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const scratch = mkdtempSync(path.join(tmpdir(), 'config-sync-dispatch-'));
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', '-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// A real repo with a real remote; its one commit ahead changes `foo/a.mjs`.
const remote = path.join(scratch, 'remote.git');
const worktree = path.join(scratch, 'config');

mkdirSync(remote);
git(remote, 'init', '-q', '--bare');
git(scratch, 'clone', '-q', remote, worktree);
writeFileSync(path.join(worktree, 'seed.txt'), 'seed\n', 'utf8');
git(worktree, 'add', '--', 'seed.txt');
git(worktree, 'commit', '-q', '-m', 'chore: seed', '--', 'seed.txt');
git(worktree, 'push', '-q', '-u', 'origin', 'HEAD');
mkdirSync(path.join(worktree, 'foo'));
writeFileSync(path.join(worktree, 'foo', 'a.mjs'), 'export {};\n', 'utf8');
git(worktree, 'add', '--', 'foo/a.mjs');
git(worktree, 'commit', '-q', '-m', 'feat: worker change', '--', 'foo/a.mjs');

const repo = {
  name: 'fixture',
  worktree,
  gitDir: path.join(worktree, '.git'),
  run: (args) => {
    try {
      return { ok: true, stdout: git(worktree, ...args), stderr: '' };
    } catch (error) {
      return { ok: false, stdout: '', stderr: String(error?.stderr ?? error) };
    }
  },
  gitPrefix: `git -C "${worktree}"`,
  pushCommand: 'git push'
};

// Real transcript files, in the harness layout `projects/<project>/<session>/subagents/<agent>.{jsonl,meta.json}`.
const projects = path.join(scratch, 'projects');
const toolCall = (name, input) => `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } })}\n`;

function writeAgent(session, id, transcript) {
  const dir = path.join(projects, 'some-project', session, 'subagents');

  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.jsonl`), transcript, 'utf8');
  writeFileSync(path.join(dir, `${id}.meta.json`), '{}', 'utf8');
}

writeAgent(OTHER_SESSION, 'agent-worker', toolCall('Write', { file_path: 'C:\\wt\\config\\foo\\a.mjs' }));
writeAgent(OTHER_SESSION, 'agent-reader', toolCall('Bash', { command: 'rg RULE notes.md' }));

// The real dispatcher, over a real manifest naming the real guard; only its decision inputs are injected.
const manifest = path.join(scratch, 'stop.json');

writeFileSync(manifest, JSON.stringify({ event: 'Stop', guards: [GUARD] }), 'utf8');

async function stopThrough(sessionId, extra = {}) {
  const payload = { session_id: sessionId, transcript_path: path.join(projects, `${sessionId}.jsonl`), cwd: scratch, hook_event_name: 'Stop', stop_hook_active: false, ...extra };
  const importer = async (file) => {
    const module = await import(pathToFileURL(file).href);

    return { evaluate: (raw) => module.evaluate(raw, { repos: [repo], liveAgents: liveAgentWrites(Date.now(), agentRecords(projects)), dismissals: [] }) };
  };

  return dispatch(manifest, JSON.stringify(payload), { importer });
}

try {
  const commit = git(worktree, 'log', '-1', '--format=%h');
  const hash = commit.trim();

  const foreign = await stopThrough(THIS_SESSION);

  check('another session\'s worker commit ahead: the dispatcher lets the turn end', foreign.output?.decision, undefined);
  check('it says whose the commit is, and that it stays unpushed', foreign.output?.systemMessage?.includes(hash) && foreign.output?.systemMessage?.includes('agent-worker') && foreign.output?.systemMessage?.includes('another session'), true);
  check('the dispatcher reports no problem with the guard', foreign.problems, []);

  const own = await stopThrough(OTHER_SESSION);

  check('the SAME commit, seen from the session that owns the worker: the dispatcher blocks', own.output?.decision, 'block');
  check('the block names the unowned commit', own.output?.hookSpecificOutput?.additionalContext?.includes(`${hash} feat: worker change`), true);

  writeFileSync(path.join(worktree, 'notes.md'), 'hunk\n', 'utf8');

  const dirty = await stopThrough(THIS_SESSION);

  check('a dirty path a live agent only read (a shell command names it): the dispatcher blocks', dirty.output?.decision, 'block');
  check('the block recommends an explicit-pathspec commit, never a sweeping add', dirty.output?.hookSpecificOutput?.additionalContext?.includes('add -- "notes.md"') && !dirty.output?.hookSpecificOutput?.additionalContext?.includes('add -A'), true);

  const bounded = await stopThrough(THIS_SESSION, { stop_hook_active: true });

  check('stop_hook_active: the dispatcher lets the retry through', bounded.output, undefined);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

process.stdout.write(`config-sync-guard.dispatcher.selftest: ${String(passed)} passed, ${String(failures.length)} failed\n`);

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);

process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
