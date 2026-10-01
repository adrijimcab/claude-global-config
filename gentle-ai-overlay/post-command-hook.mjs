#!/usr/bin/env node
/**
 * PostToolUse hook (Bash|PowerShell), run by the hook dispatcher: after a command that can change
 * where the review execution contract belongs (a real `gentle-ai sync`, `gentle-ai review mode
 * enable|disable`), re-place the contract at once instead of waiting for the next session start.
 * Every other command costs one parse and nothing else.
 *
 * Dispatchable: exports `evaluate(raw)`, which returns the hook output or undefined and prints
 * nothing; its own `main()` runs only when this file is the process entry point. A malfunction THROWS
 * inside the dispatcher, which reports it by name; run directly, it becomes a systemMessage. It always
 * exits 0: the command already ran, and this hook never decides about it.
 *
 * @es Hook PostToolUse (Bash|PowerShell), que corre el dispatcher de hooks: tras un comando que puede
 * cambiar dónde debe estar el contrato de ejecución de revisiones (un `gentle-ai sync` real,
 * `gentle-ai review mode enable|disable`), recoloca el contrato enseguida en vez de esperar al próximo
 * inicio de sesión. Cualquier otro comando cuesta un análisis y nada más. Despachable: exporta
 * `evaluate(raw)`, que devuelve la salida del hook o undefined sin imprimir nada; su `main()` corre solo
 * cuando este fichero es el punto de entrada. Una falla LANZA dentro del dispatcher, que la informa con
 * su nombre; ejecutado solo, se vuelve un systemMessage. Siempre sale con 0: el comando ya corrió y este
 * hook nunca decide sobre él.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BYTE_ORDER_MARK = 0xfe_ff;

export async function evaluate(raw) {
  const { lazyReviewTrigger } = await import('./lazy-review-triggers.mjs');
  const payload = JSON.parse(raw.charCodeAt(0) === BYTE_ORDER_MARK ? raw.slice(1) : raw);
  if (lazyReviewTrigger(payload?.tool_input?.command, payload?.tool_name) === null) return undefined;
  const { contextFromEnvironment } = await import('./context.mjs');
  const { hookOutput, reconcileLazyReview } = await import('./lazy-review-hook-output.mjs');
  return hookOutput('PostToolUse', reconcileLazyReview(contextFromEnvironment()));
}

async function main() {
  try {
    const output = await evaluate(readFileSync(0, 'utf8'));
    if (output !== undefined) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ systemMessage: `[gentle-ai overlay] the post-command hook failed (${message}); the review contract was NOT re-placed. @es el hook posterior al comando falló; el contrato de revisiones NO se recolocó.` })}\n`);
  }
  process.exitCode = 0;
}

const isEntryPoint = () => {
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (process.argv[1] !== undefined && isEntryPoint()) await main();
