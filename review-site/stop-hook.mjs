#!/usr/bin/env node
/**
 * The review stop hook of this machine: runs gentle-ai's `review stop-hook --agent claude-code` UNCHANGED (same
 * stdin, same output, same exit code) only where a review can happen, a linked worktree; in a repository's main
 * checkout it prints nothing and exits 0. Registered for SessionStart and Stop in place of gentle-ai's own entry
 * (`gentle-ai-overlay` keeps the replacement across `gentle-ai sync`). The decision is in `decide.mjs`; this file is
 * the thin shim: stdin -> decision -> a journal line -> gentle-ai or silence.
 *
 * It FAILS OPEN: whatever it cannot decide, gentle-ai's hook runs as if this shim were not there. When gentle-ai
 * itself cannot start, the hook exits 127 (a shell's "command not found") with a bilingual message on stderr.
 *
 * Proofs inject the stand-in for gentle-ai through `REVIEW_SITE_GENTLE_AI_LAUNCH`, a JSON array holding the command
 * and its leading arguments; no real session sets it.
 *
 * @es El hook de parada de revisión de esta máquina: corre `review stop-hook --agent claude-code` de gentle-ai SIN
 * CAMBIOS (mismo stdin, misma salida, mismo código) solo donde una revisión puede ocurrir, un worktree enlazado; en
 * el checkout principal de un repositorio no imprime nada y sale con 0. Se registra en SessionStart y Stop en lugar
 * de la entrada propia de gentle-ai (`gentle-ai-overlay` conserva el reemplazo tras `gentle-ai sync`). La decisión
 * vive en `decide.mjs`; esto es el conducto fino. FALLA ABIERTO: lo que no pueda decidir, lo corre el hook de
 * gentle-ai como si este conducto no existiera. Si gentle-ai no puede arrancar, sale con 127 y un mensaje bilingüe.
 */

import { spawnSync } from 'node:child_process';

import { readStdinBytes, runWhenMain } from '../hook-io/hook-io.mjs';

/** The arguments gentle-ai's own hook is registered with. @es Los argumentos con que gentle-ai registra su hook. */
const GENTLE_AI_HOOK = ['review', 'stop-hook', '--agent', 'claude-code'];

/** The shell's exit code for a command that cannot be found. @es El código de salida del shell para un comando inexistente. */
const COMMAND_NOT_FOUND = 127;

/** The command and leading arguments that run gentle-ai: the proof's stand-in when injected, else `gentle-ai`. @es El comando que corre gentle-ai. */
function gentleAiLaunch(environment) {
  const injected = environment.REVIEW_SITE_GENTLE_AI_LAUNCH;

  return injected === undefined ? ['gentle-ai'] : JSON.parse(injected);
}

/** The stdin bytes of the hook, empty when they cannot be read. @es Los bytes de stdin del hook, vacíos si no se pueden leer. */
async function readInput() {
  try {
    return await readStdinBytes();
  } catch {
    return Buffer.alloc(0);
  }
}

/**
 * The exit code to leave with for a finished `spawnSync` of gentle-ai: its own, 127 when it could not start, and 1 for
 * a process a signal ended (it has no status). Pure, so every state is provable on every platform: Windows never
 * reports a signal. @es El código con que salir tras un `spawnSync` de gentle-ai: el suyo, 127 si no pudo arrancar, y
 * 1 si lo terminó una señal (no tiene status). Pura, para probar cada estado en toda plataforma: Windows nunca informa
 * una señal.
 */
export function exitCodeFor(result) {
  if (result.error) return COMMAND_NOT_FOUND;

  return result.status ?? 1;
}

/**
 * Runs gentle-ai's hook with `input` on its stdin and its output on ours; returns the exit code to leave with.
 * @es Corre el hook de gentle-ai con `input` en su stdin y su salida en la nuestra; devuelve el código con que salir.
 */
function runGentleAi(input, environment) {
  const [command, ...leading] = gentleAiLaunch(environment);
  const result = spawnSync(command, [...leading, ...GENTLE_AI_HOOK], { input, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });

  if (result.error) process.stderr.write(`review-site: gentle-ai could not run (${result.error.message}). @es review-site: gentle-ai no pudo ejecutarse (${result.error.message}).\n`);

  return exitCodeFor(result);
}

/**
 * The decision for `input`. It never throws: a decision module that cannot load or decide yields the fail-open
 * decision, so the original hook still runs. The modules are imported here, not at the top, for that reason: a broken
 * sibling file must land in this catch. @es La decisión para `input`. Nunca lanza: un módulo de decisión que no carga
 * o no decide da la decisión de fallar abierto, y el hook original corre igual. Los módulos se importan aquí y no
 * arriba por eso: un fichero hermano roto debe caer en este catch.
 */
async function decisionFor(input) {
  try {
    const { decide } = await import('./decide.mjs');

    return decide(input);
  } catch (error) {
    return { run: true, reason: 'fail-open', detail: error instanceof Error ? error.message.split('\n')[0] : String(error) };
  }
}

/** Journals the decision; the journal is evidence, so a journal that cannot load or write costs nothing. @es Registra la decisión; el registro es evidencia, así que uno que no carga o no escribe no cuesta nada. */
async function journal(decision) {
  try {
    const { recordDecision } = await import('./journal.mjs');

    recordDecision(decision);
  } catch {
    /* evidence, never a precondition @es evidencia, nunca una precondición */
  }
}

async function main() {
  const input = await readInput();
  const decision = await decisionFor(input);

  await journal(decision);

  process.exitCode = decision.run ? runGentleAi(input, process.env) : 0;
}

runWhenMain(import.meta.url, main);
