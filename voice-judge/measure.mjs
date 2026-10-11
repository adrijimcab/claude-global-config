#!/usr/bin/env node
/**
 * Measures the voice judge against a real model: every fixture of `fixtures/` goes through the rubric of
 * `prompt.mjs` N times and the pass/fail matrix is printed. The judge is a model call, so the selftest can only
 * pin its text; this script is the measurement of what the text DOES. It is a tool, not a gate: it calls a model
 * (cost, latency, nondeterminism), so no selftest runs it. Usage: `node voice-judge/measure.mjs [--runs N]
 * [--model haiku] [--only id,id]`. Exit 1 when a fixture with an expectation (`pass` or `fail`) did not get it
 * in every run.
 *
 * @es Mide el juez de voz contra un modelo real: cada fixture de `fixtures/` pasa N veces por la rúbrica de
 * `prompt.mjs` y se imprime la matriz pasa/falla. El juez es una llamada a un modelo, así que el selftest solo
 * fija su texto; este script mide qué HACE ese texto. Es una herramienta, no un gate: ningún selftest la corre.
 * Sale con 1 si un fixture con expectativa (`pass` o `fail`) no la cumplió en todas las corridas.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROMPT } from './prompt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The rubric with the hook input a Stop payload would carry. @es La rúbrica con la entrada que llevaría un payload de Stop. */
export const promptFor = (message) => PROMPT.replace('$ARGUMENTS', () => JSON.stringify({ hook_event_name: 'Stop', session_id: 'measure', stop_hook_active: false, last_assistant_message: message }));

/** The verdict in the model's answer: `true` pass, `false` block, `null` unreadable. @es El veredicto de la respuesta del modelo. */
export function verdictOf(answer) {
  const match = /\{[\s\S]*\}/.exec(answer);

  try {
    const parsed = JSON.parse(match?.[0] ?? '');

    return typeof parsed.ok === 'boolean' ? parsed.ok : null;
  } catch {
    return null;
  }
}

/**
 * The claude executable: `CLAUDE_BIN`, else on Windows the exe next to a `claude.cmd` on PATH (a .cmd cannot be
 * spawned without a shell, and a shell eats the quotes of the arguments), else `claude`.
 * @es El ejecutable de claude: `CLAUDE_BIN`, si no en Windows el exe junto a un `claude.cmd` del PATH, si no `claude`.
 */
function claudeBinary() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;

  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const exe = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');

    if (existsSync(exe)) return exe;
  }

  return 'claude';
}

function judge(message, model, cwd) {
  const settings = path.join(cwd, 'no-hooks.json');

  writeFileSync(settings, '{"disableAllHooks":true}');

  const run = spawnSync(claudeBinary(), ['-p', '--model', model, '--settings', settings, '--tools', '', '--no-session-persistence'], { input: promptFor(message), encoding: 'utf8', cwd, timeout: 120000 });

  return verdictOf(run.stdout ?? '');
}

function main(argv) {
  const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const runs = Number(option('--runs', '3'));
  const model = option('--model', 'haiku');
  const only = option('--only', '')?.split(',').filter(Boolean);
  const cwd = mkdtempSync(path.join(tmpdir(), 'voice-measure-'));
  const fixtures = readdirSync(path.join(HERE, 'fixtures')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(path.join(HERE, 'fixtures', name), 'utf8'))).filter((fixture) => only.length === 0 || only.includes(fixture.id));
  let wrong = 0;

  for (const fixture of fixtures) {
    const verdicts = Array.from({ length: runs }, () => judge(fixture.message, model, cwd));
    const wanted = fixture.expect === 'pass' ? true : fixture.expect === 'fail' ? false : undefined;
    const met = wanted === undefined ? 'n/a' : verdicts.every((verdict) => verdict === wanted) ? 'OK' : 'MISS';

    if (met === 'MISS') wrong += 1;
    console.log(`${met.padEnd(4)} ${fixture.id.padEnd(28)} expect=${fixture.expect.padEnd(10)} ${verdicts.map((verdict) => (verdict === null ? '?' : verdict ? 'pass' : 'FAIL')).join(' ')}`);
  }

  rmSync(cwd, { recursive: true, force: true });

  return wrong === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exit(main(process.argv.slice(2)));
