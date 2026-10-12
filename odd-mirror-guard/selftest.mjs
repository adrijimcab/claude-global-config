#!/usr/bin/env node
/**
 * Self-test for odd-mirror-guard, against a project and an engram database CONSTRUCTED here, never the live
 * ones. The database carries engram's real v3 `sessions` and `observations` tables, built from the DDL captured
 * in `engram-v3-schema.mjs` (never read from the machine: a selftest depends on no live state). Whether that
 * fixture still matches the live schema is the separate, on-demand `schema-drift-check.mjs`.
 *
 * THE STATE SPACE, enumerated from the decision:
 *   - THE MIRROR: absent (refuse); soft-deleted (refuse, it is absent); another project's (refuse); older
 *     than the file (refuse); written the same second as the file (allow, 1 s is engram's resolution);
 *     newer (allow); the project name spelled `Foo_Bar` against `foo-bar` (still the same project).
 *   - THE PROJECT: no `odd/` (allow); an empty `odd/tasks` (allow); a non-Markdown file there (ignored);
 *     several features, one fresh and one not (only the bad one is named).
 *   - THE CALLER: a subagent by `agent_id` and by transcript path (allow); a stop already inside a refusal
 *     (allow); the orchestrator (decided).
 *   - WHO HAS SEEN IT: the same session twice (second passes); a new feature changes the set (shown again);
 *     another session (shown again).
 *   - WHEN IT CANNOT MEASURE: an unreadable store allows AND records a malfunction, never reading as fresh.
 *   - THE SHIM: the real `guard.mjs` process on stdin, BOM-prefixed, and an unreadable payload.
 *
 * @es Auto-test contra un proyecto y una base de engram CONSTRUIDOS aquí, nunca los vivos. La base lleva las
 * tablas v3 reales `sessions` y `observations`, con el DDL capturado en `engram-v3-schema.mjs` (nunca leído de
 * la máquina); si ese fixture sigue igual al esquema vivo lo dice `schema-drift-check.mjs`, bajo demanda. Estados: el espejo (ausente, borrado, de otro proyecto, más viejo, del mismo segundo, más nuevo,
 * nombre con otra grafía), el proyecto (sin `odd/`, `odd/tasks` vacío, un fichero no Markdown, varias
 * features), el llamante (subagente, parada ya dentro de un rechazo, orquestador), quién lo vio (misma
 * sesión, feature nueva, otra sesión), cuando no se puede medir (almacén ilegible: deja pasar y anota la
 * avería) y el proceso real por stdin, con BOM y con un payload ilegible.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { isolateState } from '../hook-state/locations.mjs';
import { OBSERVATIONS_DDL, SESSIONS_DDL } from './engram-v3-schema.mjs';
import { featureDocuments } from './feature-documents.mjs';
import { decide, mirrorTopicKey } from './guard.mjs';

// The state of the guard under test, and of any child it spawns, lives in a temp directory.
// @es El estado de la guardia probada, y el de todo hijo que lance, vive en un directorio temporal.
isolateState('odd-mirror-guard');

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'guard.mjs');
const root = mkdtempSync(path.join(os.tmpdir(), 'odd-mirror-guard-'));

/** The constructed engram database; closed before the temp directory goes (Windows cannot delete an open file). @es La base construida; se cierra antes de borrar el directorio. */
let database;

process.once('exit', () => {
  try {
    database?.close();
  } catch {
    /* closing a handle that never opened must not stop the cleanup */
  }

  rmSync(root, { recursive: true, force: true });
});

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}\n`);
  }
}

// ── the constructed engram database, from the captured v3 DDL ─────────────────────────────────────
const databasePath = path.join(root, 'engram.db');

database = new DatabaseSync(databasePath);
database.exec(SESSIONS_DDL);
database.exec(OBSERVATIONS_DDL);

database.prepare("INSERT INTO sessions (id, project, directory) VALUES ('s1', 'foo-bar', '/x')").run();

const insertObservation = database.prepare(
  "INSERT INTO observations (session_id, type, title, content, project, scope, topic_key, updated_at, deleted_at) VALUES ('s1', 'manual', 't', 'c', ?, 'project', ?, ?, ?)",
);

/** One mirror row. @es Una fila de espejo. */
const mirror = (feature, updatedAt, { project = 'foo-bar', deletedAt = null } = {}) => insertObservation.run(project, mirrorTopicKey(feature), updatedAt, deletedAt);

// ── the constructed project ───────────────────────────────────────────────────────────────────────
const DOCUMENT_AT = '2026-10-12 10:00:10';
const documentSeconds = Date.parse('2026-10-12T10:00:10Z') / 1000;
let projectCount = 0;
const featuresOf = new Map();
let transcriptCount = 0;

/** A transcript whose only call is an Edit of one document. @es Un transcript con un solo Edit de un documento. */
function editTranscript(dir, feature) {
  transcriptCount += 1;

  const file = path.join(root, `transcript-${transcriptCount}.jsonl`);

  writeFileSync(file, `${JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(dir, 'odd', 'tasks', `${feature}.md`) } }] } })}\n`);

  return file;
}

/** A project directory named `Foo_Bar` holding the given features, each file stamped DOCUMENT_AT. @es Un proyecto `Foo_Bar` con las features dadas. */
function project(features, { extra = [] } = {}) {
  projectCount += 1;

  const dir = path.join(root, `p${projectCount}`, 'Foo_Bar');

  mkdirSync(dir, { recursive: true });

  if (features !== undefined) {
    mkdirSync(path.join(dir, 'odd', 'tasks'), { recursive: true });

    for (const name of [...features.map((feature) => `${feature}.md`), ...extra]) {
      const file = path.join(dir, 'odd', 'tasks', name);

      writeFileSync(file, '# tasks\n');
      utimesSync(file, documentSeconds, documentSeconds);
    }
  }

  featuresOf.set(dir, features ?? []);

  return dir;
}

/**
 * A session transcript whose Write calls created the given features' documents in `dir` (default: all of them).
 * @es Un transcript de sesión cuyas llamadas Write crearon los documentos de las features dadas en `dir`.
 */
function transcriptOf(dir, wrote = featuresOf.get(dir) ?? []) {
  transcriptCount += 1;

  const file = path.join(root, `transcript-${transcriptCount}.jsonl`);
  const lines = wrote.map((feature) => JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: path.join(dir, 'odd', 'tasks', `${feature}.md`) } }] } }));

  writeFileSync(file, `${lines.join('\n')}\n`);

  return file;
}

const payload = (session, extra = {}) => ({ hook_event_name: 'Stop', session_id: session, cwd: root, ...extra });
let stateCount = 0;
const freshState = () => path.join(root, `state-${(stateCount += 1)}`);
const run = (dir, session, options = {}) => decide(payload(session, { transcript_path: transcriptOf(dir, options.wrote), ...options.payload }), { projectRoot: dir, databasePath, stateDir: options.stateDir ?? freshState() });
const blocked = (output) => output?.decision === 'block';

// ── missing / stale / fresh ───────────────────────────────────────────────────────────────────────
process.stdout.write('the mirror, absent then older then equal then newer\n');

mirror('stale-one', '2026-10-12 10:00:09');
mirror('same-second', DOCUMENT_AT);
mirror('fresh-one', '2026-10-12 10:00:11');
mirror('deleted-one', '2026-10-12 10:00:30', { deletedAt: '2026-10-12 10:00:31' });
mirror('other-project', '2026-10-12 10:00:30', { project: 'someone-else' });

const missing = run(project(['no-mirror']), 'a1');

check('a document with no mirror is refused', blocked(missing), JSON.stringify(missing));
check('the refusal names the feature, its mirror topic_key and says MISSING', missing?.reason.includes('no-mirror') && missing.reason.includes('odd/no-mirror/tasks') && missing.reason.includes('MISSING'), missing?.reason);
check('the refusal is bilingual: the Spanish explanation follows the English one', missing?.reason.includes('@es Un documento ODD se guarda'), missing?.reason);

const stale = run(project(['stale-one']), 'a2');

check('a mirror older than the file is refused', blocked(stale), JSON.stringify(stale));
check('the stale refusal says STALE and shows both instants', stale?.reason.includes('STALE') && stale.reason.includes('10:00:09') && stale.reason.includes('10:00:10'), stale?.reason);
check('a mirror written the same second as the file is allowed', run(project(['same-second']), 'a3') === undefined);
check('a mirror newer than the file is allowed', run(project(['fresh-one']), 'a4') === undefined);
check('a soft-deleted mirror counts as absent', blocked(run(project(['deleted-one']), 'a5')));
check("another project's mirror with the same topic_key does not count", blocked(run(project(['other-project']), 'a6')));
check('`Foo_Bar` and `foo-bar` are the same project', run(project(['fresh-one']), 'a7') === undefined);

const mixed = run(project(['fresh-one', 'no-mirror', 'stale-one']), 'a8');

check('with several features only the bad ones are named', blocked(mixed) && mixed.reason.includes('no-mirror') && mixed.reason.includes('stale-one') && !mixed.reason.includes('fresh-one'), mixed?.reason);

// ── nothing to check ──────────────────────────────────────────────────────────────────────────────
process.stdout.write('nothing to check\n');

check('a project with no odd directory is allowed', run(project(undefined), 'b1') === undefined);
check('only Markdown files are documents', featureDocuments(project(['a', 'b'], { extra: ['notes.txt'] })).documents.map((d) => d.feature).join() === 'a,b');
check('an empty odd/tasks is allowed', run(project([]), 'b2') === undefined);
check('a non-Markdown file in odd/tasks is ignored', run(project([], { extra: ['notes.txt'] }), 'b3') === undefined);

// ── who is calling ────────────────────────────────────────────────────────────────────────────────
process.stdout.write('who is calling\n');

const bad = project(['no-mirror']);

check('a subagent caller (agent_id) is allowed', run(bad, 'c1', { payload: { agent_id: 'agent-1' } }) === undefined);
check('a subagent transcript path is allowed', run(bad, 'c2', { payload: { transcript_path: path.join(root, 'projects', 'x', 'sess', 'subagents', 'agent-1.jsonl') } }) === undefined);
check('a stop already inside a refusal is allowed', run(bad, 'c3', { payload: { stop_hook_active: true } }) === undefined);
check('a SubagentStop event is allowed', run(bad, 'c4', { payload: { hook_event_name: 'SubagentStop' } }) === undefined);

// ── once per set ──────────────────────────────────────────────────────────────────────────────────
process.stdout.write('once per set of findings\n');

const onceState = freshState();
const onceProject = project(['no-mirror']);

check('first time: refused', blocked(run(onceProject, 'd1', { stateDir: onceState })));
check('same session, same findings: allowed', run(onceProject, 'd1', { stateDir: onceState }) === undefined);
check('another session: refused again', blocked(run(onceProject, 'd2', { stateDir: onceState })));

const grown = project(['no-mirror', 'also-missing']);

check('same session, a NEW finding changes the set: refused again', blocked(run(grown, 'd1', { stateDir: onceState })));

const swapState = freshState();

check('swap: first feature missing, refused', blocked(run(project(['first-missing']), 'd3', { stateDir: swapState })));
check('swap: same count but a DIFFERENT feature is a different set, refused again', blocked(run(project(['second-missing']), 'd3', { stateDir: swapState })));

// ── unmeasured ────────────────────────────────────────────────────────────────────────────────────
process.stdout.write('when it cannot measure\n');

const unreadableState = freshState();
const unreadable = decide(payload('e1', { transcript_path: transcriptOf(bad) }), { projectRoot: bad, databasePath: path.join(root, 'absent', 'engram.db'), stateDir: unreadableState });
const observed = existsSync(path.join(unreadableState, 'observed.jsonl')) ? readFileSync(path.join(unreadableState, 'observed.jsonl'), 'utf8') : '';

check('an unreadable store allows (fails open), never reads as fresh', unreadable === undefined);
check('and records the malfunction', observed.includes('"malfunction"') && observed.includes('no-mirror'), observed);

// ── the real shim ─────────────────────────────────────────────────────────────────────────────────
process.stdout.write('the real shim, end to end\n');

const shimState = path.join(root, 'shim-state');
const shim = (input, dir) =>
  spawnSync(process.execPath, ['--no-warnings', GUARD], {
    input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ENGRAM_DATA_DIR: path.dirname(databasePath), HOOK_STATE_DIR: shimState },
    encoding: 'utf8',
    windowsHide: true,
  });

const shimBlock = shim(`﻿${JSON.stringify(payload('f1', { transcript_path: transcriptOf(bad) }))}`, bad);
let shimOutput;

try {
  shimOutput = JSON.parse(shimBlock.stdout);
} catch {
  shimOutput = undefined;
}

check('BOM-prefixed payload on a bad project: exit 0 and a block decision', shimBlock.status === 0 && blocked(shimOutput) && shimOutput.reason.includes('no-mirror'), JSON.stringify(shimBlock));

const freshProject = project(['fresh-one']);
const shimClean = shim(JSON.stringify(payload('f2', { transcript_path: transcriptOf(freshProject) })), freshProject);

check('a fresh mirror: exit 0 and no output', shimClean.status === 0 && shimClean.stdout === '', JSON.stringify(shimClean));

// ── authorship: only the documents THIS session wrote ──────────────────────────────────────────────
process.stdout.write('whose documents are judged\n');

const shared = project(['mine-missing', 'theirs-missing', 'theirs-other']);

check('a document written by another session is ignored', run(shared, 'g1', { wrote: [] }) === undefined);

const mineOnly = run(shared, 'g2', { wrote: ['mine-missing'] });

check('a document written by this session is judged', blocked(mineOnly) && mineOnly?.reason.includes('mine-missing'), JSON.stringify(mineOnly));
check("in a mixed set only this session's documents are reported", blocked(mineOnly) && !mineOnly.reason.includes('theirs-missing') && !mineOnly.reason.includes('theirs-other'), mineOnly?.reason);
check('an Edit of the document counts as writing it too', blocked(decide(payload('g3', { transcript_path: editTranscript(shared, 'mine-missing') }), { projectRoot: shared, databasePath, stateDir: freshState() })));
check('a write of the same relative path in ANOTHER checkout is not this project', run(shared, 'g4', { wrote: [], payload: { transcript_path: transcriptOf(project(['mine-missing'])) } }) === undefined);
check('a payload with no transcript cannot attribute, so it allows', run(shared, 'g5', { payload: { transcript_path: undefined } }) === undefined);

const unreadableTranscriptState = freshState();

check('an unreadable transcript allows AND records it', run(shared, 'g6', { stateDir: unreadableTranscriptState, payload: { transcript_path: path.join(root, 'no-such.jsonl') } }) === undefined && readFileSync(path.join(unreadableTranscriptState, 'observed.jsonl'), 'utf8').includes('transcript-unread'));

const noDocumentsState = freshState();

check('a project with no documents does not even read the transcript', run(project(undefined), 'g7', { stateDir: noDocumentsState, payload: { transcript_path: undefined } }) === undefined && !existsSync(path.join(noDocumentsState, 'observed.jsonl')));

const shimGarbage =shim('not json', bad);

check('an unreadable payload fails open: exit 0, no output', shimGarbage.status === 0 && shimGarbage.stdout === '');

database.close();
process.stdout.write(`\nodd-mirror-guard selftest: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
