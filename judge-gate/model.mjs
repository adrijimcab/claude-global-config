/**
 * The one model call of the gate: a headless `claude -p` run that answers a judge's prompt, cheaply. Measured
 * 2026-10-12 on haiku: with the default system prompt the run creates 63451 cache tokens ($0.0127, 5.3 s); with a
 * small `--system-prompt`, no setting sources, no skills and no MCP it creates 611 ($0.00013, 2.6 s). The
 * child is marked as nested through `NESTED_VARIABLE`, and runs with no setting sources, so the hooks that
 * called the gate cannot call it again from inside this run.
 *
 * @es La única llamada al modelo de la compuerta: una corrida headless de `claude -p` que contesta el prompt de
 * un juez, barata. Medido el 2026-10-12 con haiku: con el system prompt por defecto la corrida crea 63451 tokens
 * de caché ($0.0127, 5.3 s); con un `--system-prompt` pequeño, sin fuentes de ajustes, skills ni MCP crea 611
 * ($0.00013, 2.6 s). El hijo va marcado como anidado y sin fuentes de ajustes, así que los hooks que llamaron a
 * la compuerta no pueden llamarla de nuevo desde dentro de esta corrida.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { NESTED_VARIABLE } from './nesting.mjs';

/** The model the judges run on. @es El modelo con que corren los jueces. */
export const MODEL = 'haiku';

/** The system prompt of the run: it only fixes the output form. @es El system prompt de la corrida. */
const SYSTEM_PROMPT = 'You are a strict reviewer. You answer with one JSON object and nothing else.';

/**
 * The claude executable: `CLAUDE_BIN`, else on Windows the exe next to a `claude.cmd` on PATH (a .cmd cannot be
 * spawned without a shell, and a shell eats the quotes of the arguments), else `claude`.
 * @es El ejecutable de claude: `CLAUDE_BIN`, si no en Windows el exe junto a un `claude.cmd` del PATH, si no `claude`.
 */
export function claudeBinary() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;

  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const exe = path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');

    if (existsSync(exe)) return exe;
  }

  return 'claude';
}

/** The command-line arguments of the run for `model`. @es Los argumentos de la corrida para `model`. */
export const modelArguments = (model) => ['-p', '--model', model, '--tools', '', '--setting-sources', '', '--system-prompt', SYSTEM_PROMPT, '--disable-slash-commands', '--strict-mcp-config', '--no-session-persistence', '--output-format', 'json'];

/**
 * Asks the model `prompt`; resolves `{ answer, costUsd, durationMs }` (the latency is wall time around the run,
 * start-up included, which is what a turn waits for) and throws a bilingual error on any failure.
 * @es Pregunta `prompt` al modelo; devuelve `{ answer, costUsd, durationMs }` (la latencia es el tiempo de pared
 * de la corrida, arranque incluido) y lanza un error bilingüe ante cualquier fallo.
 */
export async function askModel(prompt, { spawn = spawnSync, timeoutMs, model = MODEL }) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'judge-gate-'));
  const started = Date.now();
  let run;

  try {
    run = spawn(claudeBinary(), modelArguments(model), { input: prompt, encoding: 'utf8', cwd, timeout: timeoutMs, env: { ...process.env, [NESTED_VARIABLE]: '1' } });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }

  const durationMs = Date.now() - started;

  if (run.error !== undefined || run.status !== 0) {
    throw new Error(`The model run failed (status ${run.status}, ${run.error?.message ?? 'no error object'}). @es La corrida del modelo falló (estado ${run.status}, ${run.error?.message ?? 'sin objeto de error'}).`);
  }

  let envelope;

  try {
    envelope = JSON.parse(run.stdout ?? '');
  } catch {
    throw new Error('The model run did not print a JSON envelope. @es La corrida del modelo no imprimió un sobre JSON.');
  }

  if (envelope.is_error === true || typeof envelope.result !== 'string') {
    throw new Error('The model run returned an error envelope or no result. @es La corrida del modelo devolvió un sobre de error o ningún resultado.');
  }

  return { answer: envelope.result, costUsd: Number.isFinite(envelope.total_cost_usd) ? envelope.total_cost_usd : 0, durationMs };
}
