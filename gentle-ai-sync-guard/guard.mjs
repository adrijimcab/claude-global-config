#!/usr/bin/env node
/**
 * Hook `PreToolUse` (Bash|PowerShell): envoltorio fino de `decide()` para el harness.
 *
 * Lee el payload por stdin, decide y, si rechaza, imprime el `permissionDecision: deny` con el motivo.
 * SIEMPRE sale con 0. Ante una falla propia (stdin ilegible, JSON roto, un módulo que falta) deja
 * pasar el comando —un guard que se traba bloquearía todos los shells de la máquina— pero lo dice en
 * voz alta con un `systemMessage`, porque un guard que falla en silencio es igual a no tenerlo.
 * Los módulos se importan dentro del try para que incluso la falta de un archivo hermano caiga ahí.
 *
 *   node guard.mjs [--overlay-check <check.mjs>]     (el flag solo lo usa el selftest)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BYTE_ORDER_MARK = 0xfe_ff;

const write = (object) => process.stdout.write(`${JSON.stringify(object)}\n`);

function overlayCheckArgument(argv) {
  const at = argv.indexOf('--overlay-check');
  return at < 0 ? undefined : argv[at + 1];
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el comando corre. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra dentro de su propio proceso. Una falla propia LANZA:
 * ejecutado solo, `main` la convierte en `systemMessage`; dentro del dispatcher, él la reporta con el
 * nombre de esta guardia. En ningún caso pasa callada por un permiso limpio.
 */
export async function evaluate(raw) {
  const { decide } = await import('./decide.mjs');
  const { runOverlayCheck } = await import('./overlay-check.mjs');
  // PowerShell 5.1 antepone un BOM al canalizar texto a un proceso nativo, y JSON.parse lo rechaza.
  const payload = JSON.parse(raw.charCodeAt(0) === BYTE_ORDER_MARK ? raw.slice(1) : raw);
  const checkScript = overlayCheckArgument(process.argv.slice(2));
  const verdict = decide(
    { command: payload?.tool_input?.command, toolName: payload?.tool_name },
    { checkDrift: () => runOverlayCheck(checkScript) },
  );
  if (verdict.decision === 'deny') {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: verdict.reason } };
  }
  return undefined;
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('error', () => (process.exitCode = 0));
  process.stdin.on('end', async () => {
    try {
      const output = await evaluate(raw);
      if (output !== undefined) write(output);
    } catch (error) {
      write({ systemMessage: `[gentle-ai-sync-guard] malfunctioned (${error?.message ?? error}); the command was allowed UNCHECKED. @es falló; el comando se dejó pasar SIN COMPROBAR.` });
    }
    process.exitCode = 0;
  });
}

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre:
// leería el stdin del importador y lo cortaría con process.exit(0) a mitad de camino.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
