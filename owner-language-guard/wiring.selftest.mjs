#!/usr/bin/env node
/**
 * Proof that the PreToolUse language check runs before EVERY tool call of the main session, over the REAL
 * `settings.json` and manifests of this tree plus the real dispatcher on a constructed transcript.
 *
 * Why: the check was first wired only into the shell, authoring and delegation manifests; the English line
 * «Now adapt the wrapper and write the allowlist.» written before a `Read` call was not refused. Every tool
 * must be covered by EXACTLY ONE registration that carries the guard (zero leaves a hole, two judge twice).
 *
 * @es Prueba de que el chequeo de idioma en PreToolUse corre antes de TODA llamada de herramienta de la
 * sesión principal, sobre el `settings.json` y los manifiestos REALES de este árbol y el dispatcher real
 * sobre un transcript construido. Cada herramienta debe quedar cubierta por EXACTAMENTE un registro.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { alternativesOf } from '../hook-dispatch/manifest.mjs';
import { isolateState } from '../hook-state/locations.mjs';

isolateState('owner-language-guard');

const ROOT = path.resolve(import.meta.dirname, '..');
const GUARD = 'owner-language-guard/pretool.mjs';
const results = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const settings = JSON.parse(readFileSync(path.join(ROOT, 'settings.json'), 'utf8'));
const groups = settings.hooks.PreToolUse;

/** Whether a settings matcher selects `tool`: empty, `*` or a listed alternative. @es Si el matcher selecciona la herramienta. */
const covers = (matcher, tool) => {
  const alternatives = alternativesOf(matcher);

  return alternatives.length === 0 || alternatives.includes('*') || alternatives.includes(tool);
};

/** The manifest files a command line names. @es Los manifiestos que nombra una línea de comando. */
const manifestsOf = (command) => command.split('"').filter((part) => part.endsWith('.json')).map((part) => path.join(ROOT, 'hook-dispatch', 'manifests', path.basename(part)));

/** How many PreToolUse registrations that cover `tool` carry the language guard. @es Cuántos registros que cubren la herramienta llevan el guard. */
function registrationsCarryingGuard(tool) {
  let count = 0;

  for (const group of groups.filter((candidate) => covers(candidate.matcher, tool))) {
    for (const hook of group.hooks.filter((entry) => typeof entry.command === 'string')) {
      for (const manifest of manifestsOf(hook.command)) {
        // A manifest that cannot be read carries no guard: a hole to report, not a crash. @es Un manifiesto ilegible no lleva guard.
        let guards = [];

        try {
          guards = JSON.parse(readFileSync(manifest, 'utf8')).guards;
        } catch {
          guards = [];
        }

        count += guards.filter((guard) => guard.endsWith(GUARD)).length;
      }
    }
  }

  return count;
}

const TOOLS = ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'TodoWrite', 'Skill', 'ToolSearch', 'mcp__plugin_engram_engram__mem_search', 'mcp__brand_new__tool', 'Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Agent', 'Task', 'SendMessage', 'TaskCreate', 'mcp__plugin_engram_engram__mem_save'];

for (const tool of TOOLS) check(`${tool} is covered by exactly one registration carrying the guard`, registrationsCarryingGuard(tool), 1);

// ── the real dispatcher on a Read call preceded by English ──
const scratch = mkdtempSync(path.join(os.tmpdir(), 'lang-wiring-'));
const MANIFEST = path.join(ROOT, 'hook-dispatch', 'manifests', 'pretooluse-language.json');
const ENGLISH = 'Now adapt the wrapper and write the allowlist for the new guard.';
const SPANISH = 'Listo, ahora adapto el envoltorio y escribo la lista de permitidos del guard nuevo.';
const line = (value) => JSON.stringify(value);
const transcript = (text, name) => {
  const file = path.join(scratch, name);

  writeFileSync(file, `${[line({ type: 'user', message: { content: 'Dale' } }), line({ type: 'assistant', message: { content: [{ type: 'text', text }, { type: 'tool_use', id: 't', name: 'Read', input: { file_path: 'x' } }] } })].join('\n')}\n`, 'utf8');

  return file;
};
const dispatch = (tool, file, extra = {}) => {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'hook-dispatch', 'dispatch.mjs'), MANIFEST], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { file_path: 'x' }, transcript_path: file, ...extra }), encoding: 'utf8' });

  return { status: run.status, output: run.stdout.trim() === '' ? undefined : JSON.parse(run.stdout) };
};

try {
  const refused = dispatch('Read', transcript(ENGLISH, 'en.jsonl'));

  check('dispatcher: English before a Read call is denied', refused.output?.hookSpecificOutput?.permissionDecision, 'deny');
  check('dispatcher: the dispatcher exits 0', refused.status, 0);
  check('dispatcher: English before a Grep call is denied too', dispatch('Grep', transcript(ENGLISH, 'en2.jsonl')).output?.hookSpecificOutput?.permissionDecision, 'deny');
  check('dispatcher: Spanish before a Read call passes', dispatch('Read', transcript(SPANISH, 'es.jsonl')).output, undefined);
  check('dispatcher: a subagent Read call is never judged', dispatch('Read', transcript(ENGLISH, 'en3.jsonl'), { agent_id: 'abc123' }).output, undefined);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failed}/${results.length} cases green`);
process.exit(failed === 0 ? 0 : 1);
