#!/usr/bin/env node
/**
 * Replays the incident payload shape through the REAL dispatcher and the REAL engram store, end to end:
 * a `mem_save` on the existing `topic_key` `backlog/1.0.0-bilingual-gate-hardening` whose content is the
 * short update that replaced the detailed record (observation #1092). Expected verdict: DENY, naming the
 * dropped lines. Exits 0 only on DENY. Reads the live store: if that record no longer exists, it exits 2
 * (nothing measured) rather than reporting an allow as if it were a verdict.
 *
 * @es Reproduce el payload del incidente por el dispatcher REAL y el almacén REAL de engram. Esperado:
 * DENY. Sale 0 solo con DENY; si el registro ya no existe sale 2 (nada medido).
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readRevisionsByTopicKey } from './current-revision.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEY = 'backlog/1.0.0-bilingual-gate-hardening';
const manifest = path.join(HERE, '..', 'hook-dispatch', 'manifests', 'pretooluse-delegation.json');
const dispatcher = path.join(HERE, '..', 'hook-dispatch', 'dispatch.mjs');

const present = readRevisionsByTopicKey(KEY, { project: 'b100-am-ui', scope: 'project' });

if ('error' in present || present.rows.length !== 1) {
  console.error(`replay: the incident record is not readable as exactly one live row (${JSON.stringify(present).slice(0, 200)}): nothing measured.`);
  process.exit(2);
}

const payload = {
  session_id: 'replay',
  cwd: 'C:\\Users\\adrian.jimenez\\Desktop\\Projects\\b100-am-ui',
  hook_event_name: 'PreToolUse',
  tool_name: 'mcp__plugin_engram_engram__mem_save',
  tool_input: { title: 'Backlog update', type: 'decision', project: 'b100-am-ui', topic_key: KEY, content: 'Update 2026-10-01: the gate hardening items were worked on and landed.' }
};

const run = spawnSync(process.execPath, ['--no-warnings', dispatcher, manifest], { input: JSON.stringify(payload), encoding: 'utf8' });
const output = run.stdout.trim() === '' ? undefined : JSON.parse(run.stdout);
const decision = output?.hookSpecificOutput?.permissionDecision;

console.log(`replay verdict: ${decision ?? 'allow'} (dispatcher exit ${run.status})`);
console.log(output?.hookSpecificOutput?.permissionDecisionReason?.split('\n').slice(0, 6).join('\n') ?? '(no reason)');
process.exit(decision === 'deny' ? 0 : 1);
