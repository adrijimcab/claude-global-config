#!/usr/bin/env node
/**
 * Proof of `report.mjs`, `status.mjs` and `messages.mjs` over a CONSTRUCTED subagent store, a constructed
 * git worktree, and an injected process listing.
 * @es Prueba de `report.mjs`, `status.mjs` y `messages.mjs` sobre un almacén de subagentes CONSTRUIDO, un
 * worktree de git construido y un listado de procesos inyectado.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MESSAGE_TABLE } from './messages.mjs';
import { buildReport, renderLines } from './report.mjs';
import { run } from './status.mjs';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'worker-status-'));
const results = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const assistant = (content) => JSON.stringify({ type: 'assistant', message: { content } });
/** The value of `run`, or 'THROWS' so a crash is a failed check and not an aborted selftest. @es El valor, o 'THROWS'. */
const attempt = (run) => {
  try {
    return run();
  } catch {
    return 'THROWS';
  }
};
const runIt = (argv, sink, deps) => attempt(() => run(argv, sink, deps));
const capture = () => {
  const sink = { out: [], err: [], log: (line) => sink.out.push(line), error: (line) => sink.err.push(line) };

  return sink;
};

try {
  const root = path.join(scratch, 'projects');
  const dir = path.join(root, 'proj-a', 'sess', 'subagents');
  const worktree = path.join(scratch, 'wt');

  mkdirSync(dir, { recursive: true });
  mkdirSync(worktree);

  const addAgent = (id, meta, lines) => {
    writeFileSync(path.join(dir, `agent-${id}.meta.json`), JSON.stringify(meta));
    writeFileSync(path.join(dir, `agent-${id}.jsonl`), `${lines.join('\n')}\n`);
  };
  const call = assistant([{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'npm test' } }]);

  addAgent('w1', { worktreePath: worktree }, [call]);
  addAgent('w2', {}, [call]);
  addAgent('w3', { worktreePath: path.join(scratch, 'gone') }, [call]);

  const transcript = path.join(dir, 'agent-w1.jsonl');
  const mtime = statSync(transcript).mtimeMs;
  const gitFake = (cwd) => ({ branch: 'b', head: 'h s', base: 'origin/m', ahead: 1, dirty: 2, cwd });
  const processes = (wt) => [{ pid: 9, commandLine: `node ${wt} ${'z'.repeat(300)}` }];
  const deps = { root, now: mtime + 90_000, processes, git: gitFake };

  // ── buildReport ──
  const report = buildReport('w1', deps);

  check('report: id and transcript path', [report.id, report.transcript], ['agent-w1', transcript]);
  check('report: last write is the transcript mtime as ISO', report.lastWrite, new Date(mtime).toISOString());
  check('report: age in seconds from the injected clock', report.ageSeconds, 90);
  check('report: age never goes negative', buildReport('w1', { ...deps, now: mtime - 5000 }).ageSeconds, 0);
  check('report: last record kind, tool and command', report.last, { kind: 'assistant:tool_use', tool: 'Bash', command: 'npm test' });
  check('report: worktree from the harness record', report.worktree, worktree);
  check('report: processes carry the pid and a truncated command', [report.processes[0].pid, report.processes[0].command.length], [9, 120]);
  check('report: git state from the injected reader', report.git.cwd, worktree);
  check('report: an unknown id is undefined', attempt(() => buildReport('nope', deps)), undefined);

  const bare = buildReport('w2', deps);

  check('report: no worktree means no processes and no git', [bare.worktree, bare.processes, bare.git], [undefined, [], undefined]);

  const gone = buildReport('w3', deps);

  check('report: a vanished worktree keeps its processes but has no git', [gone.processes.length, gone.git], [1, undefined]);

  // ── renderLines ──
  const lines = renderLines(report);

  check('render: every line is bilingual (English then @es)', lines.every((line) => line.includes(' @es ')), true);
  check('render: transcript, age, last, worktree, git and process lines', lines.length, 6);
  check('render: the last record shows tool and command', lines[2].includes('Bash: npm test'), true);
  check('render: the git line carries ahead and base', lines[4].includes('1 ahead of origin/m'), true);
  check('render: the Spanish labels are real Spanish', lines[0].includes('Transcripción') && lines[3].includes('Árbol de trabajo'), true);
  check('render: no worktree says so', renderLines(bare).some((line) => line.includes('shows no worktree')), true);
  check('render: no worktree prints no git or process lines', renderLines(bare).length, 4);
  check('render: unreadable git says so', renderLines({ ...report, git: undefined }).some((line) => line.includes('not readable as a git checkout')), true);
  check('render: no live process says so', renderLines({ ...report, processes: [] }).some((line) => line.includes('No live process')), true);
  check('render: unknown base and ahead print a question mark', renderLines({ ...report, git: { ...report.git, base: undefined, ahead: undefined } })[4].includes('? ahead of ?'), true);
  check('render: a record without tool shows the bare kind', renderLines({ ...report, last: { kind: 'user:text' } })[2].startsWith('Last record: user:text @es'), true);
  check('render: a tool without command shows only the tool', renderLines({ ...report, last: { kind: 'assistant:tool_use', tool: 'Task' } })[2].includes('Task @es'), true);

  // ── messages ──
  check('messages: every entry has both halves', Object.values(MESSAGE_TABLE).every((message) => message.en.length > 0 && message.es.length > 0), true);

  // ── run (the CLI over injected deps) ──
  const text = capture();

  check('cli: a known id exits 0', runIt(['w1'], text, deps), 0);
  check('cli: text mode prints the report lines', text.out[0].split('\n').length, 6);

  const json = capture();

  check('cli: --json exits 0', runIt(['w1', '--json'], json, deps), 0);
  check('cli: --json prints parseable JSON with the id', attempt(() => JSON.parse(json.out[0]).id), 'agent-w1');
  check('cli: --json can precede the id', runIt(['--json', 'w1'], capture(), deps), 0);

  const unknown = capture();

  check('cli: an unknown id exits 1', runIt(['nope'], unknown, deps), 1);
  check('cli: the unknown-id message is bilingual and names the id', unknown.err[0]?.includes('"nope"') && unknown.err[0]?.includes(' @es '), true);
  check('cli: the unknown-id message prints nothing on stdout', unknown.out, []);

  const usage = capture();

  check('cli: no id exits 1 with usage', [runIt([], usage, deps), usage.err[0]?.startsWith('Usage:'), usage.err[0]?.includes(' @es Uso:')], [1, true, true]);
  check('cli: --project-dir without a value exits 1', runIt(['w1', '--project-dir'], capture(), deps), 1);
  check('cli: --project-dir restricts to that project', runIt(['w1', '--project-dir', path.join(root, 'proj-a')], capture(), { ...deps }), 0);
  check('cli: --project-dir of another project finds nothing', runIt(['w1', '--project-dir', path.join(root, 'proj-b')], capture(), deps), 1);
  check('cli: the project dir value is not taken as the id', runIt(['--project-dir', path.join(root, 'proj-a'), 'w1'], capture(), deps), 0);

  const spawned = spawnSync(process.execPath, [path.join(import.meta.dirname, 'status.mjs'), 'no-such-agent-id-zzz'], { encoding: 'utf8' });

  check('cli process: an unknown id exits 1 with a bilingual stderr', [spawned.status, spawned.stderr.includes(' @es ')], [1, true]);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failed}/${results.length} cases green`);
process.exit(failed === 0 ? 0 : 1);
