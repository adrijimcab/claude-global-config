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
 *
 * hook-io: the port (`../hook-io/hook-io.mjs`) is imported DYNAMICALLY inside `evaluate`, and `main()` stays
 * hand-rolled, on purpose: the selftest "CLI: sibling modules missing" requires this guard to survive a missing
 * sibling and report it, and a static import of the port would crash it at load. Its parse-failure message
 * keeps the parser's own text (the `cause` of the port's error) for the same reason: the port may be the
 * module that is missing.
 * @es hook-io: el puerto se importa de forma DINÁMICA dentro de `evaluate` y `main()` sigue a mano, a propósito:
 * el selftest "CLI: sibling modules missing" exige que esta guardia sobreviva a un hermano que falta y lo informe,
 * y un import estático del puerto la tumbaría al cargar. El mensaje de fallo de parseo conserva el texto del propio
 * parser (la `cause` del error del puerto) por lo mismo: el módulo que falta podría ser el puerto.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // The port is loaded here too, so that a missing sibling is a reported malfunction and never a crash at load.
  // @es El puerto se carga aquí también: un hermano que falta es una falla informada, nunca un fallo al cargar.
  const { deny, parsePayload } = await import('../hook-io/hook-io.mjs');
  const payload = parsePayload(raw);
  const checkScript = overlayCheckArgument(process.argv.slice(2));
  const verdict = decide(
    { command: payload?.tool_input?.command, toolName: payload?.tool_name },
    { checkDrift: () => runOverlayCheck(checkScript) },
  );
  if (verdict.decision === 'deny') return deny(verdict.reason);
  return undefined;
}

// The standalone process stays hand-rolled on purpose: it must report even when the port itself is missing
// (selftest "sibling modules missing"), and the port can only be loaded lazily inside `evaluate`.
// @es El proceso independiente sigue a mano a propósito: debe informar aun si falta el propio puerto, que solo
// puede cargarse de forma perezosa dentro de `evaluate`.
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
      // A payload that is not JSON reports the parser's own message (the `cause` of the port's error).
      // @es Un payload que no es JSON informa el mensaje del propio parser (la `cause` del error del puerto).
      const original = error?.cause ?? error;
      write({ systemMessage: `[gentle-ai-sync-guard] malfunctioned (${original?.message ?? original}); the command was allowed UNCHECKED. @es falló; el comando se dejó pasar SIN COMPROBAR.` });
    }
    process.exitCode = 0;
  });
}

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre:
// leería el stdin del importador y lo cortaría con process.exit(0) a mitad de camino.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
