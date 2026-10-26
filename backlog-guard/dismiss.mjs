#!/usr/bin/env node
/**
 * Records a dismissal of a pending-judge block, with a stated reason — option B of the instructions that follow
 * every block of that judge (`../pending-judge/appendix.mjs`, which prints this command with the session and the
 * marker that fired). A dismissal recorded after the turn's block ends the question for that turn
 * (`../pending-judge/prefilter.mjs` reads it back through `dismissals.mjs`).
 *
 * NEVER A SILENT ESCAPE, same discipline as `failure-capture/capture.mjs dismiss`: a wrong block is expected
 * and tolerated, but tolerating it costs a WRITTEN reason, because the dismissal log is the only evidence of
 * where the judge or its broad prefilter (`markers.mjs`) is wrong.
 *
 * @es Registra el descarte de un bloqueo del juez de pendientes, con un motivo: la opción B de las instrucciones
 * que siguen a cada bloqueo de ese juez (`../pending-judge/appendix.mjs`, que imprime este comando con la sesión
 * y el marcador que saltó). Un descarte registrado después del bloqueo del turno cierra la pregunta de ese turno
 * (lo relee `../pending-judge/prefilter.mjs`). NUNCA un escape silencioso: un bloqueo equivocado se tolera, pero
 * cuesta un motivo ESCRITO, porque el registro de descartes es la única evidencia de dónde se equivocan el juez o
 * su prefiltro amplio.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dismissalsFile } from './dismissals.mjs';
import { stateDirectory } from './state.mjs';

/** The shortest reason accepted, the same floor `failure-capture`/`handback` dismiss commands apply. @es El motivo más corto aceptado. */
export const MINIMUM_REASON_LENGTH = 25;

/** Parses `--flag value` pairs into a plain object, no regex. @es Convierte pares `--flag valor` en un objeto, sin regex. */
export function parseArgs(argv) {
  const out = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith('--')) continue;

    const name = token.slice(2);
    const next = argv[i + 1];

    if (next === undefined || next.startsWith('--')) {
      out[name] = true;
      continue;
    }

    out[name] = next;
    i += 1;
  }

  return out;
}

/**
 * Records `args`' dismissal, or refuses with problems. Returns `{ ok, problems? }` — pure aside from
 * the append, so a selftest can drive it without a live CLI invocation.
 * @es Registra el descarte de `args`, o rechaza con problemas.
 */
export function commandDismiss(args, { append = appendFileSync, mkdir = mkdirSync } = {}) {
  const { reason, marker, session } = args;
  const problems = [];

  if (typeof reason !== 'string' || reason.trim().length < MINIMUM_REASON_LENGTH) {
    problems.push(`--reason must say WHY this is not real pending work (${String(MINIMUM_REASON_LENGTH)}+ chars) @es --reason debe decir POR QUÉ esto no es trabajo pendiente real (${String(MINIMUM_REASON_LENGTH)}+ caracteres)`);
  }
  if (typeof reason === 'string' && (reason.includes('\n') || reason.includes('\r'))) {
    problems.push('--reason must be one line: it is written verbatim into a one-line JSONL entry @es --reason debe ser una sola línea: se escribe tal cual en una entrada JSONL de una línea');
  }

  if (problems.length > 0) return { ok: false, problems };

  try {
    mkdir(stateDirectory(), { recursive: true });
    append(
      dismissalsFile(),
      `${JSON.stringify({ at: new Date().toISOString(), session: session ?? 'unknown', marker: marker ?? 'unknown', reason })}\n`,
      'utf8'
    );
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);

    return { ok: false, problems: [`could not write the dismissal log: ${cause} @es no se pudo escribir el registro de descartes: ${cause}`] };
  }

  return { ok: true };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { ok, problems } = commandDismiss(args);

  if (!ok) {
    console.error('backlog-guard dismiss REFUSED: @es backlog-guard dismiss RECHAZADO:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log('DISMISSED and recorded. The turn may end. @es DESCARTADO y registrado. El turno puede terminar.');
  process.exit(0);
}

// Solo como proceso principal. Si otro módulo la importa (un selftest), main() no corre.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
