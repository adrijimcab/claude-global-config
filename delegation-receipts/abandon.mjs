#!/usr/bin/env node
/**
 * The recorded abandonment of a delegation that will not be re-issued — the guard's only exit, and it
 * writes itself down.
 *
 * WHY AN EXIT EXISTS AT ALL. Sometimes a refusal is RIGHT and the work genuinely should not happen: the
 * orphan-work guard refuses a delegation into a worktree that still holds someone's unlanded work, and
 * the correct answer is sometimes to leave it alone. A guard with no way to say that would force a
 * pointless re-issue, and a control that blocks legitimate work is switched off within the day.
 *
 * WHY IT IS NOT SILENT. An escape nobody can count is indistinguishable from the defect. This one is a
 * line in a file, carrying the session, the moment and the stated reason — the same shape the
 * failure-capture loop uses for a dismissal, and for the same reason: the record is the only evidence
 * that could ever justify changing the rule.
 *
 * WHY IT IS STAMPED. An abandonment answers a refusal that has already happened. Its timestamp is what
 * stops an old record from covering a new refusal — order is part of the check (`unlaunched.mjs`).
 *
 * Usage:
 *   node abandon.mjs --session <id> --reason "why this delegation is not being re-issued"
 *   node abandon.mjs list --session <id>
 *
 * @es El abandono REGISTRADO de una delegación que no se reintentará: la única salida del guard, y deja
 * constancia. Existe porque a veces el rechazo es CORRECTO (p. ej. trabajo sin aterrizar en un
 * worktree) y un guard sin salida bloquea trabajo legítimo, que es como se acaba desactivando. No es
 * silenciosa: una línea con sesión, momento y motivo. Va fechada para que un registro viejo no tape un
 * rechazo nuevo: el ORDEN forma parte de la comprobación.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stateDir as stateDirOf } from '../hook-state/locations.mjs';

/**
 * Where abandonments are kept, resolved at each call through the one state-location module. Also taken as a
 * parameter so a self-test can drive a scratch store rather than the fleet's own.
 * @es Dónde se guardan, resuelto en cada llamada por el único módulo de ubicaciones; parametrizado además
 * para que el auto-test use un almacén de pruebas.
 */
export const defaultStateDir = () => stateDirOf('delegation-receipts');

export const recordPath = (stateDir = defaultStateDir()) => path.join(stateDir, 'abandoned.jsonl');

/**
 * The abandonments recorded for one session. Unreadable store, unparseable line: none — this feeds a
 * guard that must fail open, so it never throws.
 * @es Los abandonos de una sesión. Nunca lanza: alimenta un guard que debe fallar abriendo.
 */
export function abandonmentsFor(sessionId, stateDir = defaultStateDir()) {
  let raw;

  try {
    raw = readFileSync(recordPath(stateDir), 'utf8');
  } catch {
    return [];
  }

  const records = [];

  for (const line of raw.split('\n')) {
    if (line.length === 0) continue;

    try {
      const record = JSON.parse(line);

      if (record?.session === sessionId) records.push(record);
    } catch {
      continue;
    }
  }

  return records;
}

/** Writes one abandonment. Throws on a store it cannot write, because a silent failure here would read exactly like a recorded escape. @es Escribe un abandono; falla ruidosamente, porque un fallo silencioso parecería un abandono registrado. */
export function recordAbandonment({ session, reason, at = new Date().toISOString() }, stateDir = defaultStateDir()) {
  mkdirSync(stateDir, { recursive: true });
  appendFileSync(recordPath(stateDir), `${JSON.stringify({ at, session, reason })}\n`, 'utf8');

  return { at, session, reason };
}

/** The value after `--name`, or `undefined`. @es El valor tras `--name`. */
function option(argv, name) {
  const at = argv.indexOf(`--${name}`);

  return at === -1 ? undefined : argv[at + 1];
}

function main(argv) {
  const session = option(argv, 'session');

  if (session === undefined) {
    console.error('abandon: --session <id> is required (the guard prints the exact command with it filled in).');
    process.exit(2);
  }

  if (argv.includes('list')) {
    for (const record of abandonmentsFor(session)) console.log(`${record.at}  ${record.reason}`);
    return;
  }

  const reason = option(argv, 'reason');

  // A reason long enough to say something. The failure-capture dismissal takes the same stance: an
  // escape whose reason is "n/a" is a silent escape wearing a word.
  // @es Un motivo que diga algo: un abandono con motivo «n/a» es una salida silenciosa disfrazada.
  if (reason === undefined || reason.trim().length < 25) {
    console.error('abandon: --reason "<why this delegation is not being re-issued>" is required, and must say something (25+ characters).');
    process.exit(2);
  }

  const record = recordAbandonment({ session, reason: reason.trim() });

  console.log(`Recorded: this turn deliberately abandons one refused delegation.\n  at     : ${record.at}\n  session: ${record.session}\n  reason : ${record.reason}`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
