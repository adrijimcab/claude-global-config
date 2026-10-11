#!/usr/bin/env node
/**
 * Wiring proof: the command REGISTERED in this tree's `settings.json` for `UserPromptSubmit` is driven as the
 * harness drives it (a shell command, the payload on stdin, the shape measured from a live session) and must
 * stay silent on the baseline, silent when nothing changed, warn when a hook group is registered afterwards, and
 * warn only once. The `$HOME/.claude` of the command is replaced by this tree; the Claude home and the state are
 * temporary.
 * @es Prueba de cableado: el comando REGISTRADO en el `settings.json` de este árbol para `UserPromptSubmit` se
 * ejecuta como lo hace el harness (comando de shell, payload por stdin, con la forma medida en una sesión viva) y
 * debe callar en la línea base, callar si nada cambió, avisar si después se registra un grupo de hooks y avisar
 * solo una vez. El `$HOME/.claude` del comando se reemplaza por este árbol; el home de Claude y el estado son temporales.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tree = path.resolve(import.meta.dirname, '..');
const results = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const settings = JSON.parse(readFileSync(path.join(tree, 'settings.json'), 'utf8'));
const registered = (settings.hooks?.UserPromptSubmit ?? []).flatMap((entry) => entry.hooks ?? []).filter((hook) => hook.command?.includes('stale-session-guard/prompt-hook.mjs'));

check('exactly one UserPromptSubmit command is registered for the warning', registered.length, 1);

const command = (registered[0]?.command ?? 'exit 99').split('$HOME/.claude').join(tree.split('\\').join('/'));
const home = mkdtempSync(path.join(os.tmpdir(), 'wiring-home-'));
const state = mkdtempSync(path.join(os.tmpdir(), 'wiring-state-'));

try {
  const run = (payload) => spawnSync(command, { shell: true, input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, HOOK_CLAUDE_HOME: home, HOOK_STATE_DIR: state } });
  const dispatch = (manifest) => ({ matcher: '', hooks: [{ type: 'command', command: `node "$HOME/.claude/hook-dispatch/dispatch.mjs" "$HOME/.claude/hook-dispatch/manifests/${manifest}.json"` }] });
  const transcript = path.join(home, 't.jsonl');
  const payload = { session_id: 'b6959f54-7808-45ca-bb88-cf53c0ecf9cf', transcript_path: transcript, cwd: home, prompt_id: 'f9f7bdd3-c568-46b8-a6d0-acb19dc2cf5a', permission_mode: 'auto', hook_event_name: 'UserPromptSubmit', prompt: 'say hi' };

  mkdirSync(path.join(home, 'hook-dispatch', 'manifests'), { recursive: true });
  writeFileSync(path.join(home, 'hook-dispatch', 'manifests', 'pretooluse-language.json'), JSON.stringify({ event: 'PreToolUse', guards: ['../../owner-language-guard/pretool.mjs'] }), 'utf8');
  writeFileSync(transcript, `${JSON.stringify({ type: 'attachment', timestamp: '2026-10-11T19:12:49.734Z', attachment: { hookName: 'SessionStart:startup', hookEvent: 'SessionStart' } })}\n`, 'utf8');
  writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ hooks: { Stop: [dispatch('stop')] } }), 'utf8');

  const first = run(payload);

  check('baseline prompt exits 0 and prints nothing', [first.status, first.stdout], [0, '']);
  const second = run(payload);

  check('unchanged prompt exits 0 and prints nothing', [second.status, second.stdout], [0, '']);

  writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ hooks: { Stop: [dispatch('stop')], PreToolUse: [dispatch('pretooluse-language')] } }), 'utf8');
  const stale = run(payload);
  const output = JSON.parse(stale.stdout || '{}');

  check('after a group is registered the command exits 0', stale.status, 0);
  check('and prints a UserPromptSubmit additionalContext', output.hookSpecificOutput?.hookEventName, 'UserPromptSubmit');
  check('naming the group and its guard', [output.hookSpecificOutput?.additionalContext?.includes('pretooluse-language'), output.hookSpecificOutput?.additionalContext?.includes('owner-language-guard/pretool.mjs')], [true, true]);
  const again = run(payload);

  check('the same change is not warned twice', [again.status, again.stdout], [0, '']);
} finally {
  rmSync(home, { recursive: true, force: true });
  rmSync(state, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failed}/${results.length} cases green`);
process.exit(failed === 0 ? 0 : 1);
