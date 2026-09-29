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
