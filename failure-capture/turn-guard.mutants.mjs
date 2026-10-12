#!/usr/bin/env node
/**
 * Campaña de mutantes de `turn-guard.mjs` contra `turn-guard.selftest.mjs`: cada mutante rompe UNA
 * propiedad que el selftest dice cuidar, y el selftest tiene que ponerse rojo.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const F = 'failure-capture/turn-guard.mjs';
const MUTANTS = [
  ['stop_hook_active deja de acotar: puede bloquear dos veces', F, 'if (payload.stop_hook_active === true) return undefined;', ''],
  ['la orden sugerida vuelve a un cd suelto que la sesión principal no puede correr', F, '`     ( cd "${cwd}" && node', '`     cd "${cwd}" && node'],
  ['el cooldown desaparece', F, 'if (now - Number(previous.blockedAt) < COOLDOWN_MS) {', 'if (false) {'],
  ['una captura sellada deja de liberar el turno', F, "if (stamped !== undefined && stamped.session === sessionId && Number(stamped.at) > Number(previous.seenAt)) {", 'if (false) {'],
  ['una captura de OTRA sesión libera el turno', F, 'stamped.session === sessionId && ', ''],
  ['el marcador nunca se busca', F, 'if (marker === undefined) return undefined;', 'return undefined;'],
  ['el BOM ya no se quita', F, 'raw.charCodeAt(0) === 0xfe_ff ? raw.slice(1) : raw', 'raw'],
  ['un payload ilegible pasa sin anotarse', F, '    recordError(error, raw);', ''],
  ['el proceso propio no imprime el bloqueo', F, 'if (output !== undefined) process.stdout.write(JSON.stringify(output));', ''],
  ['la guardia no corre como proceso principal', F, 'if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();', ''],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'failure-capture/turn-guard.selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
