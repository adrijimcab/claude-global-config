#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash AND PowerShell — ONE question, asked three ways: will the exit code this
 * command returns be the OPERATION's verdict? It is the mechanism of `measurement-failure-is-not-a-zero`,
 * whose whole shape is a measurement that did not happen wearing the clothes of one that did. Each way
 * has its own decision module, each pinned by its own measurement:
 *
 *   `status-echo.mjs`     the command ENDS by printing `$?` / `$LASTEXITCODE`, so the caller reads the
 *                         print's success (five gate readings lost on 2026-09-09).
 *   `pipeline-status.mjs` it reads `$?` about a PIPELINE, where bash already replaced it with the last
 *                         member's status (`… | head -5; echo exit=$?` printed 0 over an unmeasured run).
 *   `harness-kill.mjs`    it runs a hook-triggering git operation on a clock shorter than the hooks, so
 *                         the code that comes back describes the KILL (a finished cherry-pick reported
 *                         `exit=128` on 2026-09-07).
 *
 * A command may not END by printing its exit status (`$?`, `$LASTEXITCODE`), because that destroys the
 * exit code it was written to preserve. The per-shell decision, with PowerShell's measured semantics,
 * lives in `status-echo.mjs`; this file is the shim.
 * PowerShell was added 2026-09-14: the guard read Bash only while the harness also offers a PowerShell
 * tool, so the exact shape it forbids ran unguarded there.
 *
 * It is also the mechanism of `blamed-the-tool-for-a-defect-i-built-into-the-command`: the incident below
 * was that lesson (a surprising result read as a defect of the TOOL, when the command's own shape caused
 * it), and the shape is what this guard refuses. The lesson's second half, never writing an unreproduced
 * tool defect into a brief, is a free-prose claim no hook can judge true; it stays a written rule.
 * @es También es el mecanismo de `blamed-the-tool-for-a-defect-i-built-into-the-command`: el incidente de
 * abajo fue esa lección y su forma es lo que este guard rechaza. Su segunda mitad (no escribir en un brief
 * un defecto de herramienta sin reproducir) es una afirmación en prosa que ningún hook puede juzgar.
 *
 * WHAT HAPPENED, measured 2026-09-09. I told the owner FIVE times that the harness task notifier lies
 * about exit codes. It never did. Every one of those commands had the shape
 * `cmd >> log 2>&1; echo "EXIT=$?" >> log`, and the shell's exit status of a `;`-separated list is the
 * status of its LAST command — the echo. Zero, by construction, every time. Reproduced on a minimal
 * input:
 *
 *   false; echo "EXIT=$?"                    -> 0     the shape I kept writing
 *   false; code=$?; echo "$code"; exit $code -> 1     correct
 *   false                                    -> 1     correct
 *
 * WHY IT IS WORSE THAN A WRONG NUMBER. I wrote the false conclusion into delegation briefs, and a
 * worker echoed it back as "the harness status field, which has misreported exit codes on this
 * machine before" — my unverified claim returning with someone else's authority. And each repetition
 * made the belief MORE credible rather than less, because I was counting occurrences of a phenomenon
 * I was causing.
 *
 * WHAT IT CHECKS. Not a heuristic: a shell fact. The exit status of a list is the status of the last
 * command in it, so if the last statement is an `echo`/`printf` that reads `$?`, the caller's verdict
 * is that echo's. The guard refuses exactly that shape and names the two correct ones.
 *
 * FAILS OPEN on every malfunction of its own.
 *
 * @es Guard de `PreToolUse` sobre Bash: un comando no puede TERMINAR haciendo `echo` de `$?`, porque
 * eso destruye el código de salida que pretendía conservar. La salida de una lista separada por `;`
 * es la del ÚLTIMO comando — el echo. Cero, por construcción. No es heurística, es un hecho de la
 * shell. Se lo achaqué cinco veces al notificador del harness, que nunca mintió, y lo escribí en
 * briefs, de donde un worker me lo devolvió como establecido.
 */

import { hookMain, deny, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { commitHooksOf, hooksFolderOf } from './commit-hooks.mjs';
import { HARNESS_DEFAULT_TIMEOUT_MS, MINIMUM_TIMEOUT_MS, mayBeKilledMidHook } from './harness-kill.mjs';
import { readsPipelineStatus } from './pipeline-status.mjs';
import { endsByPrintingStatus } from './status-echo.mjs';

const BASH_REASON = [
  'EXIT-CODE GUARD REFUSED this command: it ENDS by echoing `$?`, which destroys the exit code.',
  '',
  'The shell reports the status of the LAST command in a `;`-separated list. If that last command is',
  'the echo, the caller sees the ECHO\'s status — zero — no matter what ran before it. Measured:',
  '',
  '  false; echo "EXIT=$?"                     -> 0    <- this shape',
  '  false; code=$?; echo "$code"; exit $code  -> 1',
  '  false                                     -> 1',
  '',
  'This is not caution. On 2026-09-09 it made five gate results unreadable and produced a false',
  'conclusion — "the harness notifier lies about exit codes" — that was written into delegation',
  'briefs and echoed back by a worker as established fact. The notifier was reporting faithfully.',
  '',
  'USE INSTEAD, whichever fits:',
  '',
  '  cmd >> "$log" 2>&1; code=$?; echo "EXIT=$code" >> "$log"; exit $code',
  '        the exit code is recorded AND re-raised, so the log and the caller agree',
  '',
  '  cmd >> "$log" 2>&1',
  '        nothing after it, so the caller sees the real status; read the log for detail',
  '',
  'The first is right when you need the code inside the log — for a background task whose notification',
  'you will read later. The second is right when the caller reads the status directly.'
].join('\n');

const POWERSHELL_REASON = [
  'EXIT-CODE GUARD REFUSED this PowerShell command: it ENDS by printing $LASTEXITCODE or $?, which destroys the exit code.',
  '',
  'PowerShell reports the success of the LAST statement. If that statement prints the status, the',
  'caller sees the PRINT succeed — exit 0 — no matter what ran before it. Measured on PowerShell 5.1:',
  '',
  '  cmd /c exit 7; Write-Output "EXIT=$LASTEXITCODE"                          -> 0    <- this shape',
  '  cmd /c exit 7; "EXIT=$LASTEXITCODE"                                       -> 0    (a bare string prints too)',
  '  cmd /c exit 7; $code = $LASTEXITCODE; Write-Output "EXIT=$code"; exit $code  -> 7',
  '  cmd /c exit 7                                                             -> 1',
  '',
  'USE INSTEAD, whichever fits:',
  '',
  '  cmd *> log.txt; $code = $LASTEXITCODE; Add-Content log.txt "EXIT=$code"; exit $code',
  '        a native program: the code is recorded AND re-raised',
  '',
  '  Some-Cmdlet; $ok = $?; Add-Content log.txt "OK=$ok"; if (-not $ok) { exit 1 }',
  '        a cmdlet sets $? (not $LASTEXITCODE): record it, then fail if it failed',
  '',
  '  cmd *> log.txt',
  '        nothing after it, so the caller sees the real status; read the log for detail'
].join('\n');

/** The refusal each shell's users can act on. @es La negativa accionable de cada shell. */
const REASONS = Object.freeze({ Bash: BASH_REASON, PowerShell: POWERSHELL_REASON });

/** The refusal for a `$?` read about a pipeline bash has already discarded. @es La negativa por leer `$?` tras un pipeline. */
function pipelineReason({ pipeline, statement }) {
  return [
    'EXIT-CODE GUARD REFUSED this command: it reads `$?` about a PIPELINE, where bash has already',
    'replaced that status with the LAST member\'s.',
    '',
    `  the pipeline : ${pipeline}`,
    `  the reader   : ${statement}`,
    '',
    'Measured on this machine (bash 5):',
    '',
    '  false | head -1; c=$?                      -> c=0    <- this shape: head succeeded',
    '  set -o pipefail; false | head -1; c=$?     -> c=1',
    '  false | head -1; ${PIPESTATUS[0]}          -> 1',
    '',
    'This is the `measurement-failure-is-not-a-zero` lesson: a probe whose output is indistinguishable',
    'from a passing one is not a probe. `npm view <pkg> version 2>&1 | head -5; echo exit=$?` printed',
    '`exit=0` over a command that had never been measured at all.',
    '',
    'USE INSTEAD, whichever fits:',
    '',
    '  set -o pipefail; cmd | head -5; code=$?',
    '        `$?` becomes the first failing member\'s status, which is the measurement you wanted',
    '',
    '  cmd | head -5; code=${PIPESTATUS[0]}',
    '        reads the member you actually care about, leaving the pipeline as it is',
    '',
    '  cmd > out.txt 2>&1; code=$?; head -5 out.txt',
    '        run it bare and read the file afterwards — no pipe between the command and its status'
  ].join('\n');
}

/** The refusal for a hook-running git operation on a clock shorter than the hooks. @es La negativa por reloj más corto que los hooks. */
function harnessKillReason({ operation, timeout }, hooks, hooksFolder) {
  const declared = typeof timeout === 'number' ? `${String(timeout)} ms` : `no timeout at all, so the harness default of ${String(HARNESS_DEFAULT_TIMEOUT_MS)} ms applies`;
  const measured = hooks === undefined ? 'could not be measured from this call, so they are assumed to run' : `measured just now in ${hooksFolder}: ${hooks.join(', ')}`;

  return [
    `EXIT-CODE GUARD REFUSED this command: \`${operation}\` runs this repository's git hooks, and it was`,
    `given ${declared}.`,
    '',
    `THE HOOKS, ${measured}.`,
    '',
    'WHY THIS IS NOT CAUTION. On 2026-09-07 a `git cherry-pick --continue` was killed by that default',
    'mid-hook, after `pre-commit` had already rewritten two tracked documents. The retry printed',
    '`exit=128` and `fatal: cherry-pick failed` over an integration that had SUCCEEDED — both commits',
    'present, tree clean, no sequencer. A killed process reports the KILL, never the operation. A hook',
    'that lints, formats or typechecks the staged set routinely outlives two minutes.',
    '',
    'USE INSTEAD, whichever fits:',
    '',
    `  the same command with timeout: ${String(MINIMUM_TIMEOUT_MS)} or more (600000 is the tool's maximum)`,
    '  the same command with run_in_background: true, which that clock does not bound',
    '',
    'And whatever you run: establish the verdict from durable state — `git log`, `git status`, the',
    'sequencer directory — never from the code a command the harness may have killed returned.'
  ].join('\n');
}

/** The refusal this payload earns, or `undefined`. @es La negativa que merece este payload, o `undefined`. */
function refusalFor(payload) {
  const tool = payload?.tool_name;
  const input = payload?.tool_input;

  if (endsByPrintingStatus(tool, input?.command)) return REASONS[tool];

  const pipeline = readsPipelineStatus(tool, input?.command);

  if (pipeline !== undefined) return pipelineReason(pipeline);

  const killable = mayBeKilledMidHook(tool, input, payload?.cwd);

  if (killable === undefined) return undefined;

  // The premise is that hooks run. Measured where the git command itself runs; a repository that runs no
  // commit hook has nothing a clock could kill mid-write, so the refusal would state something false there.
  const hooks = commitHooksOf(killable.directory);

  if (hooks !== undefined && hooks.length === 0) return undefined;

  return harnessKillReason(killable, hooks, hooks === undefined ? undefined : hooksFolderOf(killable.directory));
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el comando puede correr. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra dentro de su propio proceso. Falla abierta.
 */
export function evaluate(raw) {
  const payload = tryParsePayload(raw);

  if (payload === undefined) return undefined;

  let reason;

  try {
    reason = refusalFor(payload);
  } catch {
    return undefined; // fail open: a malfunction of the decision must never block a command
  }

  if (reason === undefined) return undefined;

  return deny(reason);
}

// Only as the main process: imported by the dispatcher or a selftest, main() must not read the importer's stdin.
// @es Solo como proceso principal: si la importa el dispatcher o un selftest, main() no debe leer el stdin del importador.
runWhenMain(import.meta.url, hookMain(evaluate));
