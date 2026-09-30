#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `backlog-owner-guard` — `worker-overwrote-master-backlog`.
 *
 * THE STATE SPACE THIS DECISION RANGES OVER, each one exercised below rather than only the happy path
 * (`guard-that-cannot-go-red`): caller identity (subagent vs. main session, by each signal alone and by
 * both), tool family (`mem_save` vs. `mem_update`/`mem_delete`), topic_key shape (master, non-master, and
 * the NEAR MISS of "master" appearing but not as the suffix), id resolution (resolves to master, resolves
 * to non-master, not found, no id at all, store unreadable), and this guard's OWN malfunctions (bad JSON,
 * an unrelated tool, a null `tool_input`) which must still ALLOW.
 *
 * THE ID-RESOLUTION TESTS RUN AGAINST A REAL, DISPOSABLE SQLITE DATABASE built with the same
 * `observations(id, topic_key)` shape as engram's own store (verified directly against the real store at
 * `~/.engram/engram.db` before writing `resolve-topic-key.mjs`) — never a mocked resolver function — so
 * this proof exercises the same `node:sqlite` code path the guard runs in production.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `backlog-owner-guard`. Espacio de estados: identidad del llamante,
 * familia de herramienta, forma del topic_key (maestro, no maestro, y el CASI-ACIERTO de "master" sin ser
 * sufijo), resolución de id (resuelve a maestro, a no maestro, no encontrado, sin id, almacén ilegible), y
 * los fallos PROPIOS de esta guardia (JSON inválido, herramienta ajena, `tool_input` nulo), que deben
 * seguir permitiendo. Las pruebas de resolución de id corren contra una base sqlite REAL y desechable con
 * la misma forma que el almacén real de engram — nunca un resolutor simulado.
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import path from 'node:path';

import { decide } from './decide.mjs';
import { evaluate, GUARDED_TOOLS } from './guard.mjs';
import { isSubagentCaller } from './identify-caller.mjs';
import { defaultDatabasePath, resolveTopicKeyById } from './resolve-topic-key.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = actual === expected || (Number.isNaN(actual) && Number.isNaN(expected));

  if (ok) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── a real, disposable sqlite database shaped like engram's own store ──────────────────────────────
const scratch = mkdtempSync(path.join(tmpdir(), 'backlog-owner-guard-selftest-'));
const dbPath = path.join(scratch, 'engram.db');

{
  const seed = new DatabaseSync(dbPath);

  seed.exec('CREATE TABLE observations (id INTEGER PRIMARY KEY, topic_key TEXT)');
  const insert = seed.prepare('INSERT INTO observations (id, topic_key) VALUES (?, ?)');

  insert.run(972, 'backlog/1.0.0-master');
  insert.run(100, 'feature/some-note');
  insert.run(101, 'backlog/master-plan'); // near miss: contains "master", suffix is "-plan"
  insert.run(102, null);
  seed.close();
}

const resolver = (id) => resolveTopicKeyById(id, { databasePath: dbPath });

// ── identify-caller.mjs: both signals, independently and together ──────────────────────────────────
check('agent_id alone marks a subagent', isSubagentCaller({ agent_id: 'a123' }), true);
check('subagents transcript path alone marks a subagent', isSubagentCaller({ transcript_path: 'C:\\...\\subagents\\agent-a123.jsonl' }), true);
check('both signals together still mark a subagent', isSubagentCaller({ agent_id: 'a123', transcript_path: 'C:\\...\\subagents\\agent-a123.jsonl' }), true);
check('neither signal is the main session', isSubagentCaller({ transcript_path: 'C:\\...\\session.jsonl' }), false);
check('an empty agent_id string does not count', isSubagentCaller({ agent_id: '', transcript_path: 'C:\\...\\session.jsonl' }), false);
check('a non-object payload is never a subagent', isSubagentCaller(null), false);
check('transcript_path containing "subagents" only as a substring elsewhere still counts (conservative OR)', isSubagentCaller({ transcript_path: 'C:\\repo\\subagents-archive\\old.jsonl' }), true);

// ── resolve-topic-key.mjs: against the real disposable sqlite database ─────────────────────────────
check('resolves a master row', resolveTopicKeyById(972, { databasePath: dbPath }).topicKey, 'backlog/1.0.0-master');
check('resolves a non-master row', resolveTopicKeyById(100, { databasePath: dbPath }).topicKey, 'feature/some-note');
check('resolves the near-miss row', resolveTopicKeyById(101, { databasePath: dbPath }).topicKey, 'backlog/master-plan');
check('resolves a null topic_key row', resolveTopicKeyById(102, { databasePath: dbPath }).topicKey, null);
check('an id not in the store is "not-found"', resolveTopicKeyById(999999, { databasePath: dbPath }).error, 'not-found');
check('a non-finite id is "no-id"', resolveTopicKeyById(undefined, { databasePath: dbPath }).error, 'no-id');
check('NaN id is "no-id"', resolveTopicKeyById(Number.NaN, { databasePath: dbPath }).error, 'no-id');
check('a missing database file is "store-unreadable"', resolveTopicKeyById(972, { databasePath: path.join(scratch, 'does-not-exist.db') }).error, 'store-unreadable');
check('defaultDatabasePath resolves to a non-empty path', typeof defaultDatabasePath() === 'string' && defaultDatabasePath().length > 0, true);

{
  const originalEngramDataDir = process.env.ENGRAM_DATA_DIR;

  process.env.ENGRAM_DATA_DIR = 'C:\\custom\\engram-dir';
  check('defaultDatabasePath honours a nonblank ENGRAM_DATA_DIR override', defaultDatabasePath(), path.join('C:\\custom\\engram-dir', 'engram.db'));

  process.env.ENGRAM_DATA_DIR = '   ';
  check('a whitespace-only ENGRAM_DATA_DIR falls back to the platform default', defaultDatabasePath(), path.join(os.homedir(), '.engram', 'engram.db'));

  if (originalEngramDataDir === undefined) delete process.env.ENGRAM_DATA_DIR;
  else process.env.ENGRAM_DATA_DIR = originalEngramDataDir;
}

// ── decide.mjs: the full state matrix, both mem_save and mem_update/mem_delete ──────────────────────
const subagentPayload = { agent_id: 'a7a6a1fc42286edd6' };
const mainSessionPayload = { session_id: 'main' };

check(
  'subagent mem_save onto the master topic_key is denied',
  decide(subagentPayload, 'mcp__engram__mem_save', { topic_key: 'backlog/1.0.0-master' }, resolver)?.kind,
  'save-master-topic-key'
);
check(
  'subagent mem_save onto a non-master topic_key is allowed',
  decide(subagentPayload, 'mcp__engram__mem_save', { topic_key: 'discovery/some-note' }, resolver),
  undefined
);
check(
  'subagent mem_save onto the near-miss topic_key is allowed',
  decide(subagentPayload, 'mcp__engram__mem_save', { topic_key: 'backlog/master-plan' }, resolver),
  undefined
);
check(
  'main session mem_save onto the master topic_key is always allowed',
  decide(mainSessionPayload, 'mcp__engram__mem_save', { topic_key: 'backlog/1.0.0-master' }, resolver),
  undefined
);
check(
  'the plugin-mounted mem_save name is covered the same way',
  decide(subagentPayload, 'mcp__plugin_engram_engram__mem_save', { topic_key: 'backlog/1.0.0-master' }, resolver)?.kind,
  'save-master-topic-key'
);

check(
  'subagent mem_update whose id resolves to the master row is denied',
  decide(subagentPayload, 'mcp__engram__mem_update', { id: 972 }, resolver)?.kind,
  'targets-master-observation'
);
check(
  'subagent mem_update whose id resolves to a non-master row is allowed',
  decide(subagentPayload, 'mcp__engram__mem_update', { id: 100 }, resolver),
  undefined
);
check(
  'subagent mem_update onto the near-miss row is allowed',
  decide(subagentPayload, 'mcp__engram__mem_update', { id: 101 }, resolver),
  undefined
);
check(
  'main session mem_update targeting the master row is always allowed',
  decide(mainSessionPayload, 'mcp__engram__mem_update', { id: 972 }, resolver),
  undefined
);
check(
  'subagent mem_update with NO id at all is denied, fail closed',
  decide(subagentPayload, 'mcp__engram__mem_update', {}, resolver)?.kind,
  'unresolvable-id'
);
check(
  'subagent mem_update with an id that does not exist is denied, fail closed',
  decide(subagentPayload, 'mcp__engram__mem_update', { id: 999999 }, resolver)?.kind,
  'unresolvable-id'
);
check(
  'main session mem_update with an unresolvable id is still always allowed',
  decide(mainSessionPayload, 'mcp__engram__mem_update', { id: 999999 }, resolver),
  undefined
);
check(
  'subagent mem_update RETARGETING a non-master row onto a master-shaped topic_key is denied',
  decide(subagentPayload, 'mcp__engram__mem_update', { id: 100, topic_key: 'backlog/1.0.0-master' }, resolver)?.kind,
  'retarget-into-master-topic-key'
);
check(
  'subagent mem_delete whose id resolves to the master row is denied',
  decide(subagentPayload, 'mcp__engram__mem_delete', { id: 972 }, resolver)?.kind,
  'targets-master-observation'
);
check(
  'subagent mem_delete whose id resolves to a non-master row is allowed',
  decide(subagentPayload, 'mcp__engram__mem_delete', { id: 100 }, resolver),
  undefined
);
check(
  'a store that cannot be read at all denies a subagent id-targeting call, fail closed',
  decide(subagentPayload, 'mcp__engram__mem_update', { id: 972 }, (id) => resolveTopicKeyById(id, { databasePath: path.join(scratch, 'missing.db') }))?.kind,
  'unresolvable-id'
);

check('an unrelated tool is ignored', decide(subagentPayload, 'mcp__engram__mem_search', { query: 'x' }, resolver), undefined);
check('a null tool_input is ignored', decide(subagentPayload, 'mcp__engram__mem_save', null, resolver), undefined);
check('a non-object payload is ignored (no crash)', decide(null, 'mcp__engram__mem_save', { topic_key: 'backlog/1.0.0-master' }, resolver), undefined);

// ── GUARDED_TOOLS: every mount point of every save-family tool this guard names ─────────────────────
for (const tool of [
  'mcp__engram__mem_save',
  'mcp__plugin_engram_engram__mem_save',
  'mcp__engram__mem_update',
  'mcp__plugin_engram_engram__mem_update',
  'mcp__engram__mem_delete',
  'mcp__plugin_engram_engram__mem_delete'
]) {
  check(`GUARDED_TOOLS names ${tool}`, GUARDED_TOOLS.has(tool), true);
}

// ── guard.mjs's evaluate(): the shim, end to end, over raw JSON text ────────────────────────────────
function rawPayload(object) {
  return JSON.stringify(object);
}

check(
  'evaluate() denies a subagent mem_save onto the master topic_key',
  evaluate(rawPayload({ agent_id: 'a123', tool_name: 'mcp__engram__mem_save', tool_input: { topic_key: 'backlog/1.0.0-master' } }))?.hookSpecificOutput?.permissionDecision,
  'deny'
);
check(
  'evaluate() allows a main-session mem_save onto the master topic_key',
  evaluate(rawPayload({ session_id: 'main', tool_name: 'mcp__engram__mem_save', tool_input: { topic_key: 'backlog/1.0.0-master' } })),
  undefined
);
check(
  'evaluate() allows a subagent mem_save onto a non-master topic_key',
  evaluate(rawPayload({ agent_id: 'a123', tool_name: 'mcp__engram__mem_save', tool_input: { topic_key: 'discovery/x' } })),
  undefined
);
check('evaluate() allows malformed JSON (a malfunction of THIS guard fails open)', evaluate('{not json'), undefined);
check('evaluate() allows a tool it does not cover', evaluate(rawPayload({ agent_id: 'a123', tool_name: 'Edit', tool_input: {} })), undefined);
check(
  'evaluate() with a UTF-8 BOM still parses',
  evaluate(`\uFEFF${rawPayload({ session_id: 'main', tool_name: 'mcp__engram__mem_save', tool_input: { topic_key: 'discovery/x' } })}`),
  undefined
);
check(
  'evaluate() denies via the plugin-mounted mem_update name too, real resolver against the LIVE store path shape',
  typeof evaluate(rawPayload({
    agent_id: 'a999',
    tool_name: 'mcp__plugin_engram_engram__mem_update',
    tool_input: { id: 'not-a-number' }
  }))?.hookSpecificOutput?.permissionDecisionReason,
  'string'
);

// A REAL PreToolUse payload shape, as captured from the live corpus this session (session c45d798b, tool
// a9fcd54b98e5f304a) — reproduced literally so a schema drift in the real harness would show up here.
const REAL_SUBAGENT_PAYLOAD_SHAPE = {
  session_id: 'c45d798b-d78f-4f60-9a32-1f722bbe86e5',
  transcript_path: 'C:\\Users\\adrian.jimenez\\.claude\\projects\\C--Users-adrian-jimenez-Desktop-Projects-b100-am-ui\\c45d798b-d78f-4f60-9a32-1f722bbe86e5\\subagents\\agent-a9fcd54b98e5f304a.jsonl',
  cwd: 'C:\\Users\\adrian.jimenez\\Desktop\\Projects\\b100-am-ui',
  agent_id: 'a9fcd54b98e5f304a',
  agent_type: 'general-purpose',
  hook_event_name: 'PreToolUse',
  tool_name: 'mcp__plugin_engram_engram__mem_save',
  tool_input: { title: 'x', topic_key: 'backlog/1.0.0-master', content: 'y' }
};

check(
  'the real captured subagent payload shape is denied end to end',
  evaluate(rawPayload(REAL_SUBAGENT_PAYLOAD_SHAPE))?.hookSpecificOutput?.permissionDecision,
  'deny'
);

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`backlog-owner-guard selftest: ${failures.length} FAILURE(S) of ${passed + failures.length}`);

  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`backlog-owner-guard selftest: ${passed}/${passed} passed`);
console.log(`(note: defaultDatabasePath() resolves to ${defaultDatabasePath()} on this machine, honouring ENGRAM_DATA_DIR when set — exists: ${existsSync(defaultDatabasePath())})`);
