/**
 * Corrects the recurrence counter of a ledger line DOWNWARD, losing nothing: the one amendment for a counter that
 * counted one incident more than once (a capture recorded twice, a spool entry folded twice after a crash, which
 * `reconcile` states as its own cost). Raising a counter is not an amendment: it is what a capture does, so a recount
 * that does not lower the counter is refused.
 *
 * WHAT IT DOES, under the ledger lock: finds the ONE line whose `<!--fc:key#n-->` marker names the key (the marker is
 * what holds the counter; a marker-less line that only points at the same evidence has none to correct), builds the
 * same line with only the marker's count changed, archives the WHOLE old line in the evidence store with a note of
 * the old count, the new one and the stated reason, RE-READS that file and proves the old line is a whole line of it
 * (`conservation.mjs`), then writes the ledger once and reads it back (`verified-write.mjs`): any difference restores
 * the old text. A promoted stub is refused: its counter lives on in the promotion record, not here.
 *
 * `dryRun` takes no lock and writes nothing, not even the lock file: it reads the ledgers and reports the line it
 * would write. Running the same recount again changes nothing.
 *
 * @es Corrige HACIA ABAJO el contador de recurrencia de una línea del ledger sin perder nada: la única enmienda para
 * un contador que contó un incidente más de una vez. Subir un contador no es una enmienda, es lo que hace una captura,
 * así que se rechaza un recuento que no lo baja. Bajo el lock halla la ÚNICA línea cuyo marcador nombra la clave,
 * construye la misma línea con solo el número cambiado, archiva la línea vieja ENTERA en la evidencia con una nota
 * del número viejo, el nuevo y el motivo, relee y prueba ese fichero, y escribe el ledger una vez releyéndolo:
 * cualquier diferencia restaura el texto viejo. Un muñón promovido se rechaza. `dryRun` no toma el lock ni escribe
 * nada: lee los ledgers e informa de la línea que escribiría.
 */

import { proveArchived } from './conservation.mjs';
import { appendEvidence, readEvidence } from './evidence.mjs';
import { isValidKey, joinBilingual, MARK_CLOSE, MARK_OPEN, readMarker, refuse } from './ledger-line.mjs';
import { withLock } from './ledger-lock.mjs';
import { oneLineProblems } from './tiered-capture.mjs';
import { writeText, writeVerified } from './verified-write.mjs';

/** What touches the disk, replaceable so a proof can make it lie. @es Lo que toca el disco, sustituible para que una prueba lo haga mentir. */
const REAL_IO = { appendEvidence, readEvidence, writeText };

/** The scope of a promoted stub. @es El alcance de un muñón promovido. */
const PROMOTED_PREFIX = '- [promoted] ';

/** The shortest reason a recount accepts: it is the only record of why the counter changed. @es El motivo más corto que acepta un recuento. */
const MINIMUM_REASON_LENGTH = 25;

/** The bilingual reasons the inputs are refused, empty when they are fine. @es Los motivos bilingües por los que se rechazan las entradas. */
function inputProblems({ key, count, reason }) {
  return [
    ...(isValidKey(key) ? [] : [refuse('--key must be lowercase kebab-case, 4-60 chars.', '--key debe ser kebab-case en minúsculas, de 4 a 60 caracteres.').problem]),
    ...(Number.isInteger(count) && count >= 1 ? [] : [refuse('--count must be a whole number of at least 1: the incidents that really happened.', '--count debe ser un número entero de al menos 1: los incidentes que de verdad ocurrieron.').problem]),
    ...(typeof reason === 'string' && reason.trim().length >= MINIMUM_REASON_LENGTH ? oneLineProblems('--reason', reason) : [refuse(`--reason is required, at least ${String(MINIMUM_REASON_LENGTH)} characters: why the counter was wrong.`, `--reason es obligatorio, de al menos ${String(MINIMUM_REASON_LENGTH)} caracteres: por qué el contador era erróneo.`).problem]),
  ];
}

/** The one line whose marker names `key`: `{ ledger, index, line, marker }`, or a refusal. @es La única línea cuyo marcador nombra `key`, o una negativa. */
function locate({ ledgers, key }) {
  const found = ledgers.flatMap((ledger) => ledger.lines.flatMap((line, index) => {
    const marker = readMarker(line);

    return marker?.key === key ? [{ ledger, index, line, marker }] : [];
  }));

  if (found.length === 1) return { ok: true, ...found[0] };

  return found.length === 0 ? refuse(`no ledger line carries a counter for "${key}".`, `ninguna línea del ledger lleva un contador de "${key}".`) : refuse(`${String(found.length)} ledger lines carry a counter for "${key}": which one is wrong is not this command's guess.`, `${String(found.length)} líneas del ledger llevan un contador de "${key}": cuál está mal no lo adivina este comando.`);
}

/** What a refusal looks like as an outcome: nothing changed. @es Cómo se ve una negativa: nada cambió. */
const refused = (problems) => ({ status: 1, held: false, problems, recounted: undefined });

/** The line `original` becomes, or a refusal. @es La línea en que se convierte `original`, o una negativa. */
function recountedLine({ original, marker, key, count }) {
  if (original.startsWith(PROMOTED_PREFIX)) return refuse(`the lesson "${key}" is promoted: its counter is not amended in the ledger.`, `la lección "${key}" está promovida: su contador no se enmienda en el ledger.`);
  if (count > marker.count) return refuse(`--count ${String(count)} is above the counter (${String(marker.count)}): a recurrence is recorded by a capture, never by a recount.`, `--count ${String(count)} supera el contador (${String(marker.count)}): una recurrencia la registra una captura, nunca un recuento.`);

  return { ok: true, line: `${original.slice(0, marker.open)}${MARK_OPEN}${key}#${String(count)}${MARK_CLOSE}${original.slice(marker.close)}` };
}

/** The plan inside (or, for a dry run, without) the lock: the found line and its replacement, or a refusal. @es El plan: la línea hallada y su reemplazo, o una negativa. */
function plan({ ledgers, key, count }) {
  const where = locate({ ledgers, key });

  if (!where.ok) return where;

  const built = recountedLine({ original: where.line, marker: where.marker, key, count });

  return built.ok ? { ...where, built: built.line } : built;
}

/** The outcome fields every run reports. @es Los campos que informa toda corrida. */
const report = ({ ledger, marker }, key, count, changed) => ({ scope: ledger.scope, file: ledger.file, key, from: marker.count, to: count, changed });

/** Recounts inside the lock. @es Recuenta dentro del lock. */
function recountLocked({ ledgers, key, count, reason, date, io }) {
  const planned = plan({ ledgers, key, count });

  if (!planned.ok) return refused([planned.problem]);

  const { ledger, index, line: original, built } = planned;

  if (built === original) return { status: 0, held: false, problems: [], recounted: report(planned, key, count, false) };

  const archived = io.appendEvidence({ ledgerFile: ledger.file, key, line: original, date, kind: 'recounted', note: `Recounted ${date} from ${String(planned.marker.count)} to ${String(count)}: ${reason.trim()}` });
  const proof = archived.ok ? proveArchived({ original, evidence: io.readEvidence(ledger.file, key) }) : { ok: false, deficits: [archived.problem] };

  if (!proof.ok) return refused([joinBilingual(['the old line could not be proved safe in the evidence store: the ledger line is unchanged. @es no se pudo probar que la línea vieja esté a salvo en la evidencia: la línea del ledger no cambió.', ...proof.deficits])]);

  const text = ledger.lines.join('\n');
  const next = ledger.lines.map((one, at) => (at === index ? built : one)).join('\n');

  if (!writeVerified({ io, file: ledger.file, text, next })) return refused(['RESTORED — the ledger read back differently from what was planned, so the old text was put back. @es RESTAURADO: el ledger releído difiere de lo planificado, así que se volvió a poner el texto viejo.']);

  return { status: 0, held: false, problems: [], recounted: report(planned, key, count, true) };
}

/**
 * @param input `{ load, key, count, reason, date, lockFile, dryRun, deps }` — `load()` returns the ledgers (`{ scope,
 *   file, lines }`) and is called under the lock (or, for a dry run, without one); `deps` replaces the disk.
 * @returns `{ status, held, problems, recounted, line? }`: status 0 done, already so, or planned (a dry run, with the
 *   `line` it would write), 1 refused or restored, 2 the lock is held (nothing changed).
 * @es `load()` se llama bajo el lock (o sin él en un simulacro); `status` 0 hecho, ya estaba o planificado (simulacro,
 *   con la `line` que escribiría), 1 rechazado o restaurado, 2 lock ocupado.
 */
export function runRecount({ load, key, count, reason, date, lockFile, dryRun = false, deps }) {
  const problems = inputProblems({ key, count, reason });

  if (problems.length > 0) return refused(problems);

  if (dryRun) {
    const planned = plan({ ledgers: load(), key, count });

    return planned.ok ? { status: 0, held: false, problems: [], dryRun: true, line: planned.built, recounted: report(planned, key, count, planned.built !== planned.line) } : refused([planned.problem]);
  }

  const io = { ...REAL_IO, ...deps };
  const locked = withLock(lockFile, () => recountLocked({ ledgers: load(), key, count, reason, date, io }));

  return locked.held ? locked.value : { status: 2, held: true, problems: [], recounted: undefined };
}

/** The report, one bilingual line each. @es El informe, una línea bilingüe cada una. */
export function describeRecount(outcome) {
  if (outcome.held) return ['recount REFUSED — the ledger is locked by another writer; nothing was changed. @es recount RECHAZADO: el ledger está bloqueado por otro escritor; no se cambió nada.'];

  if (outcome.recounted === undefined) return ['recount REFUSED — the ledger was not changed. @es recount RECHAZADO: no se cambió el ledger.', ...outcome.problems.map((problem) => `  ${problem}`)];

  const { scope, file, key, from, to, changed } = outcome.recounted;

  if (outcome.dryRun) return [`recount (dry run, nothing written): ${scope} ledger ${file}, lesson "${key}" ${String(from)} -> ${String(to)}; the line would be: @es recount (simulacro, nada escrito): ledger ${scope} ${file}, lección "${key}" ${String(from)} -> ${String(to)}; la línea sería:`, `  ${outcome.line}`];

  return [changed
    ? `${scope} ledger ${file}: lesson "${key}" recounted ${String(from)} -> ${String(to)}; the old line is archived whole in the evidence store with the reason. @es ledger ${scope}: lección "${key}" recontada ${String(from)} -> ${String(to)}; la línea vieja queda archivada entera en la evidencia con el motivo.`
    : `${scope} ledger ${file}: lesson "${key}" already counts ${String(to)}; nothing was changed. @es ledger ${scope}: la lección "${key}" ya cuenta ${String(to)}; no se cambió nada.`];
}
