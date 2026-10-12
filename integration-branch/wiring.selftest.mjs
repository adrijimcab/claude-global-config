#!/usr/bin/env node
/**
 * Wiring proof of the integration-branch drift warning: the command REGISTERED in this tree's `settings.json`
 * for `UserPromptSubmit` is driven as the harness drives it (a shell command, the payload on stdin, the shape
 * measured from a live session), with the `$HOME/.claude` of the command replaced by this tree. It must be
 * registered exactly once, print the notice for a drifted clone, and stay silent otherwise. The repositories
 * are CONSTRUCTED (`fixtures.mjs`).
 * @es Prueba de cableado del aviso de deriva de la rama de integración: el comando REGISTRADO en el
 * `settings.json` de este árbol para `UserPromptSubmit` se ejecuta como lo hace el harness (comando de shell,
 * payload por stdin, con la forma medida en una sesión viva), con el `$HOME/.claude` del comando reemplazado
 * por este árbol. Debe estar registrado una sola vez, avisar ante un clon con deriva y callar en lo demás.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { isolateState } from '../hook-state/locations.mjs';
import { makeWorld } from './fixtures.mjs';

isolateState('integration-branch');

const tree = path.resolve(import.meta.dirname, '..');
const world = makeWorld();
let passed = 0;
const failures = [];

function check(condition, name) {
  if (condition) passed += 1;
  else failures.push(name);
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}`);
}

const payloadFor = (cwd) => ({ session_id: 'b6959f54-7808-45ca-bb88-cf53c0ecf9cf', transcript_path: path.join(world.root, 't.jsonl'), cwd, prompt_id: 'f9f7bdd3-c568-46b8-a6d0-acb19dc2cf5a', permission_mode: 'auto', hook_event_name: 'UserPromptSubmit', prompt: 'say hi' });
const synced = world.repository(['main']);

// ── The registered command, driven as the harness drives it ──────────────────────────────────────
const settings = JSON.parse(readFileSync(path.join(tree, 'settings.json'), 'utf8'));
const registered = (settings.hooks?.UserPromptSubmit ?? []).flatMap((entry) => entry.hooks ?? []).filter((hook) => hook.command?.includes('integration-branch/prompt-hook.mjs'));
check(registered.length === 1, 'exactly one UserPromptSubmit command is registered for the drift warning');
const command = (registered[0]?.command ?? 'exit 99').split('$HOME/.claude').join(tree.split('\\').join('/'));
const run = (payload) => spawnSync(command, { shell: true, input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8' });

const driftedCli = world.repository(['feature/meet']);
const cliWarn = run(payloadFor(driftedCli.clone));
const cliOutput = JSON.parse(cliWarn.stdout || '{}');
check(cliWarn.status === 0 && cliOutput.hookSpecificOutput?.hookEventName === 'UserPromptSubmit' && cliOutput.hookSpecificOutput.additionalContext.includes('feature/meet'), `the registered command exits 0 and prints the notice (exit ${cliWarn.status})`);
const cliQuiet = run(payloadFor(synced.clone));
check(cliQuiet.status === 0 && cliQuiet.stdout === '', 'the registered command is silent for a clone in sync');
const cliBroken = run('not json');
check(cliBroken.status === 0 && cliBroken.stdout === '', 'the registered command exits 0 and prints nothing for malformed input');

world.dispose();
const total = passed + failures.length;
console.log(`${passed}/${total} assertions passed @es ${passed}/${total} aserciones correctas`);
if (failures.length > 0) console.log(`FAILED: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
