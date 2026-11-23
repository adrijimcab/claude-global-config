/**
 * Adds a later MEASUREMENT to the evidence of one lesson without counting a recurrence: the command for "same
 * incident, better measured" (a cause weakened by a new run, a recurrence that turned out to be none). `capture` would
 * bump the counter and ask for a promotion; this never touches the ledger.
 *
 * WHAT IT DOES, under the ledger lock: finds the ONE line whose `<!--fc:key#n-->` marker names the key (a promoted stub
 * included, since the note does not amend its counter), then appends to `lessons/evidence/<key>.md` the line itself
 * (only if that file does not already hold it whole) and one dated note, `Measured <date>: <text>`, and RE-READS the
 * file to prove the note is a whole line of it. Running the same note again adds nothing.
 *
 * @es Agrega una MEDICIÓN posterior a la evidencia de una lección sin contar una recurrencia: el comando para «mismo
 * incidente, mejor medido» (una causa debilitada por una corrida nueva, una recurrencia que resultó no serlo).
 * `capture` subiría el contador y pediría promoción; esto nunca toca el ledger. Bajo el lock halla la ÚNICA línea
 * cuyo marcador nombra la clave (un muñón promovido incluido, porque la nota no enmienda su contador), agrega a la
 * evidencia la línea (solo si el fichero no la tiene ya entera) y una nota fechada, y RELEE el fichero para probar que
 * la nota es una línea entera de él. Repetir la misma nota no agrega nada.
 */

import { holdsWholeLine } from './conservation.mjs';
import { appendEvidence, readEvidence } from './evidence.mjs';
import { isValidKey, readMarker, refuse } from './ledger-line.mjs';
import { withLock } from './ledger-lock.mjs';
import { oneLineProblems } from './tiered-capture.mjs';

/** What touches the disk, replaceable so a proof can make it lie. @es Lo que toca el disco, sustituible. */
const REAL_IO = { appendEvidence, readEvidence };

/** The shortest note accepted: it is the record of what was measured. @es La nota más corta que se acepta. */
const MINIMUM_TEXT_LENGTH = 25;

/** The bilingual reasons the inputs are refused. @es Los motivos bilingües por los que se rechazan las entradas. */
function inputProblems({ key, text }) {
  return [
    ...(isValidKey(key) ? [] : [refuse('--key must be lowercase kebab-case, 4-60 chars.', '--key debe ser kebab-case en minúsculas, de 4 a 60 caracteres.').problem]),
    ...(typeof text === 'string' && text.trim().length >= MINIMUM_TEXT_LENGTH ? oneLineProblems('--text', text) : [refuse(`--text is required, at least ${String(MINIMUM_TEXT_LENGTH)} characters: what was measured, with its receipt.`, `--text es obligatorio, de al menos ${String(MINIMUM_TEXT_LENGTH)} caracteres: qué se midió, con su comprobante.`).problem]),
  ];
}

/** The one line whose marker names `key`, or a refusal. @es La única línea cuyo marcador nombra `key`, o una negativa. */
function locate({ ledgers, key }) {
  const found = ledgers.flatMap((ledger) => ledger.lines.filter((line) => readMarker(line)?.key === key).map((line) => ({ ledger, line })));

  if (found.length === 1) return { ok: true, ...found[0] };

  return found.length === 0 ? refuse(`no ledger line carries a counter for "${key}".`, `ninguna línea del ledger lleva un contador de "${key}".`) : refuse(`${String(found.length)} ledger lines carry a counter for "${key}".`, `${String(found.length)} líneas del ledger llevan un contador de "${key}".`);
}

/** A refusal as an outcome: nothing changed. @es Una negativa: nada cambió. */
const refused = (problems) => ({ status: 1, held: false, problems, noted: undefined });

/** Notes inside the lock. @es Anota dentro del lock. */
function noteLocked({ ledgers, key, text, date, io }) {
  const where = locate({ ledgers, key });

  if (!where.ok) return refused([where.problem]);

  const note = `Measured ${date}: ${text.trim()}`;
  const written = io.appendEvidence({ ledgerFile: where.ledger.file, key, line: where.line, date, kind: 'measured', note });
  const evidence = written.ok ? io.readEvidence(where.ledger.file, key) : undefined;

  // A failed append leaves `evidence` undefined, so this one test covers it too. @es Un append fallido deja `evidence` sin definir: este test lo cubre.
  if (evidence === undefined || !holdsWholeLine(evidence, note)) {
    return refused([`the note could not be proved in the evidence store${written.ok ? '' : ` (${written.problem})`}. @es no se pudo probar la nota en la evidencia.`]);
  }

  return { status: 0, held: false, problems: [], noted: { scope: where.ledger.scope, file: written.file, key, appended: written.appended } };
}

/**
 * @param input `{ load, key, text, date, lockFile, deps }` — `load()` returns the ledgers (`{ scope, file, lines }`)
 *   and is called under the lock; `deps` replaces the disk.
 * @returns `{ status, held, problems, noted }`: 0 noted (or already noted), 1 refused, 2 the lock is held.
 */
export function runEvidenceNote({ load, key, text, date, lockFile, deps }) {
  const problems = inputProblems({ key, text });

  if (problems.length > 0) return refused(problems);

  const io = { ...REAL_IO, ...deps };
  const locked = withLock(lockFile, () => noteLocked({ ledgers: load(), key, text, date, io }));

  return locked.held ? locked.value : { status: 2, held: true, problems: [], noted: undefined };
}

/** The report, one bilingual line each. @es El informe, una línea bilingüe cada una. */
export function describeEvidenceNote(outcome) {
  if (outcome.held) return ['note REFUSED — the ledger is locked by another writer; nothing was changed. @es note RECHAZADO: el ledger está bloqueado por otro escritor; no se cambió nada.'];
  if (outcome.noted === undefined) return ['note REFUSED — the evidence was not changed. @es note RECHAZADO: no se cambió la evidencia.', ...outcome.problems.map((problem) => `  ${problem}`)];

  const { key, file, appended } = outcome.noted;

  return [appended
    ? `lesson "${key}": the measurement is appended to ${file}; the counter is unchanged. @es lección "${key}": la medición se agregó a ${file}; el contador no cambió.`
    : `lesson "${key}": ${file} already holds this note; nothing was changed. @es lección "${key}": ${file} ya tiene esta nota; no se cambió nada.`];
}
