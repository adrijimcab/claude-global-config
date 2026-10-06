/**
 * Running the gentle-ai CLI to ask it about ITS OWN persisted settings.
 *
 * The environment opt-outs gentle-ai honours (internal/telemetry/killswitch.go: DO_NOT_TRACK,
 * GENTLE_AI_TELEMETRY=0, CI, GITHUB_ACTIONS) take precedence over the persisted state and would mask
 * it: a shell that happens to export DO_NOT_TRACK would report "disabled" while the persisted opt-out
 * is gone. They are removed from the child's environment so the answer is about the state that
 * `gentle-ai sync` could change, never about the caller's shell.
 */
import { spawnSync } from 'node:child_process';

const MASKING_VARIABLES = ['DO_NOT_TRACK', 'GENTLE_AI_TELEMETRY', 'CI', 'GITHUB_ACTIONS'];
const TIMEOUT_MS = 10_000;

function unmaskedEnvironment() {
  const environment = { ...process.env };
  MASKING_VARIABLES.forEach((name) => delete environment[name]);
  return environment;
}

/**
 * @param {{ gentleAi: string[] }} context  the command and any leading arguments that invoke gentle-ai
 * @returns {{ ok: true, stdout: string } | { ok: false, reason: string }}
 */
export function runGentleAi({ gentleAi }, args) {
  const [command, ...leading] = gentleAi;
  const result = spawnSync(command, [...leading, ...args], { encoding: 'utf8', env: unmaskedEnvironment(), timeout: TIMEOUT_MS, windowsHide: true });
  const shown = `gentle-ai ${args.join(' ')}`;
  if (result.error) return { ok: false, reason: `${shown} could not run (${result.error.message})` };
  if (result.status !== 0) return { ok: false, reason: `${shown} exited ${result.status}: ${result.stderr.trim().slice(0, 200)}` };
  return { ok: true, stdout: result.stdout };
}

/**
 * Run the real `gentle-ai sync` with `args` exactly as given: an argument vector, never a shell line, so
 * nothing in an argument is interpreted. The caller's environment is kept whole (unlike the queries above,
 * which unmask it): a sync is run as the owner would run it. No timeout: a sync may legitimately take long.
 * @es Corre el `gentle-ai sync` real con `args` tal cual: un vector de argumentos, nunca una línea de shell,
 * así que nada en un argumento se interpreta. El entorno de quien llama se conserva entero (a diferencia de
 * las consultas de arriba, que lo desenmascaran): el sync corre como lo correría el dueño. Sin plazo: un
 * sync puede tardar legítimamente.
 * @param {{ gentleAi: string[] }} context
 * @param {string[]} args  the arguments AFTER `sync`
 * @param {'inherit' | 'pipe'} stdio
 * @returns {{ started: true, status: number, note?: string } | { started: false, reason: string }}
 */
export function syncGentleAi({ gentleAi }, args, stdio = 'inherit') {
  const [command, ...leading] = gentleAi;
  const result = spawnSync(command, [...leading, 'sync', ...args], { stdio, windowsHide: true });
  if (result.error) return { started: false, reason: result.error.message };
  if (result.status === null) return { started: true, status: 1, note: `killed by ${result.signal}` };
  return { started: true, status: result.status };
}
