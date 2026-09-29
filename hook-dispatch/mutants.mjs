#!/usr/bin/env node
/**
 * Campaña de mutantes del dispatcher: cada mutante rompe UNA propiedad que el selftest dice cuidar, y
 * el selftest tiene que ponerse rojo. Usa el runner compartido del proyecto b100
 * (`.claude/mutation-proof/run-mutants.mjs`), que exige línea base verde, objetivo exacto y mutante
 * parseable, así que un «N/N» de acá no puede salir de un selftest que ya estaba rojo.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RUNNER = 'C:/Users/adrian.jimenez/Desktop/Projects/b100-am-ui/.claude/mutation-proof/run-mutants.mjs';
const { runMutants } = await import(pathToFileURL(RUNNER).href);

const MUTANTS = [
  ['deny deja de ganar: gana allow', 'hook-dispatch/merge.mjs', "const PRECEDENCE = ['deny', 'ask', 'allow'];", "const PRECEDENCE = ['allow', 'ask', 'deny'];"],
  ['se descarta la razón de la segunda guardia', 'hook-dispatch/merge.mjs', "return present.map((entry) => `[${entry.guard}]\\n${entry.text}`).join(SEPARATOR);", 'return present[0].text;'],
  ['el contexto adicional se pierde', 'hook-dispatch/merge.mjs', "if (typeof specific.additionalContext === 'string') contexts.push({ guard, text: specific.additionalContext });", ''],
  ['las claves desconocidas se tragan en silencio', 'hook-dispatch/merge.mjs', "for (const key of Object.keys(output)) if (!KNOWN_TOP_LEVEL.has(key)) anomalies.push(`${guard}: clave desconocida '${key}'`);", ''],
  ['el block de Stop se pierde', 'hook-dispatch/merge.mjs', "if (output.decision === 'block') blocks.push({ guard, text: output.reason });", ''],
  ['el filtro por herramienta deja de filtrar', 'hook-dispatch/manifest.mjs', 'return alternatives.length === 0 || alternatives.includes(\'*\') || alternatives.includes(toolName);', 'return true;'],
  ['el filtro por herramienta excluye todo', 'hook-dispatch/manifest.mjs', 'if (forEvent.length === 0) return true;', 'if (forEvent.length === 0) return false;'],
  ['un manifiesto vacío pasa por cero guardias limpias', 'hook-dispatch/manifest.mjs', "if (!Array.isArray(parsed.guards) || parsed.guards.length === 0) throw", "if (!Array.isArray(parsed.guards)) throw"],
  ['process.exit de una guardia mata el proceso entero', 'hook-dispatch/run-guard.mjs', '  process.exit = (code) => {\n    throw new GuardExit(code);\n  };', ''],
  ['lo impreso por una guardia se ignora', 'hook-dispatch/run-guard.mjs', 'if (printed.trim().length > 0) return { error:', 'if (false) return { error:'],
  ['una guardia sin evaluate cuenta como silencio limpio', 'hook-dispatch/run-guard.mjs', "if (typeof module?.evaluate !== 'function') return { error: 'no exporta evaluate(raw): no es despachable' };", "if (typeof module?.evaluate !== 'function') return { output: undefined };"],
  ['un fallo de guardia deja de anunciarse', 'hook-dispatch/dispatch.mjs', 'const withNotice = { ...output, systemMessage:', 'const withNotice = { ...output, silenced:'],
  ['el proceso sale con 1 ante problemas', 'hook-dispatch/dispatch.mjs', '  await main();\n  process.exitCode = 0;', '  await main();\n  process.exitCode = 1;'],
  ['la marca de proceso compartido no se pone', 'hook-dispatch/run-guard.mjs', '  globalThis[IN_PROCESS] = true;', ''],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-dispatch'],
  selftest: 'hook-dispatch/selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
