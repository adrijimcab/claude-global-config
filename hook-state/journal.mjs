/**
 * The v2 journal of a hook mechanism and its fires counter. A journal line is one of four kinds
 * (`decision`, `dismissal`, `false-positive-report`, `true-positive-report`), each correlated by `blockId`,
 * `toolUseId` and `inputDigest` and carrying a time-sortable id, and optionally the hook `event` it happened
 * in. An outcome may say it came from the random sample of `label.mjs` (`sampled`, with its `seed`). The last three are the outcomes of a block: a human judged it wrong (`dismissal`,
 * `false-positive-report`) or right (`true-positive-report`). The fires counter (`fires.json`) counts how
 * often a mechanism ran, WITHOUT adding a journal line: an allow is counted, never journaled.
 *
 * @es El journal v2 de un mecanismo de hooks y su contador de disparos. Una línea es de uno de cuatro tipos
 * (`decision`, `dismissal`, `false-positive-report`, `true-positive-report`), correlacionada por `blockId`,
 * `toolUseId` e `inputDigest`, con un id ordenable por tiempo y, opcionalmente, el `event` de hook en que
 * ocurrió. Un desenlace puede decir que salió de la muestra aleatoria de `label.mjs` (`sampled`, con su `seed`). Los tres últimos son desenlaces de un bloqueo: una persona lo juzgó erróneo (`dismissal`,
 * `false-positive-report`) o acertado (`true-positive-report`). El contador (`fires.json`) cuenta cuántas
 * veces corrió un mecanismo SIN añadir línea al journal: un permiso se cuenta, nunca se registra.
 */

import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { pauseFor, withLock } from './file-lock.mjs';
import { stateDir } from './locations.mjs';
import { bilingual } from './message-table.mjs';

/** The record kinds a journal accepts. @es Los tipos de registro que acepta un journal. */
export const KINDS = new Set(['decision', 'dismissal', 'false-positive-report', 'true-positive-report']);

const ID_MS_WIDTH = 12;
const ID_SEQ_WIDTH = 4;
const ID_SEQ_LIMIT = 16 ** ID_SEQ_WIDTH;

const hex = (value, width) => value.toString(16).padStart(width, '0');

/**
 * An id generator: fixed-width hex milliseconds, then a sequence, then random bytes, so ids sort as strings
 * in time order. A clock that stands still or goes back keeps the last millisecond and counts up.
 * @es Un generador de ids: milisegundos en hex de ancho fijo, una secuencia y bytes aleatorios, así que los
 * ids se ordenan como texto en orden temporal. Un reloj detenido o que retrocede conserva el último
 * milisegundo y sigue contando.
 */
export function createIdGenerator() {
  let lastMs = 0;
  let sequence = 0;

  return (now = Date.now()) => {
    if (now > lastMs) {
      lastMs = now;
      sequence = 0;
    } else {
      sequence += 1;
    }

    if (sequence >= ID_SEQ_LIMIT) {
      lastMs += 1;
      sequence = 0;
    }

    return `${hex(lastMs, ID_MS_WIDTH)}${hex(sequence, ID_SEQ_WIDTH)}${randomBytes(4).toString('hex')}`;
  };
}

/** The id generator of this process. @es El generador de ids de este proceso. */
export const newId = createIdGenerator();

/** The sha256 hex digest of a tool input (a string, or the JSON of anything else). @es El sha256 hex de una entrada. */
export function digestInput(input) {
  return createHash('sha256').update(typeof input === 'string' ? input : JSON.stringify(input)).digest('hex');
}

const badField = (field, expected) => new Error(bilingual('bad-field', { field, expected }));

/** Refuses a record that is not of a known kind or lacks a correlation field. @es Rechaza un registro de tipo ajeno o sin campo de correlación. */
function assertRecord({ kind, blockId, toolUseId = null, inputDigest, reason, event, sampled, seed }) {
  if (typeof kind !== 'string' || !KINDS.has(kind)) throw new Error(bilingual('unknown-kind', { kind: String(kind), allowed: [...KINDS].join(', ') }));
  if (typeof blockId !== 'string' || blockId === '') throw badField('blockId', 'non-empty string');
  if (typeof inputDigest !== 'string' || inputDigest === '') throw badField('inputDigest', 'non-empty string');
  if (toolUseId !== null && typeof toolUseId !== 'string') throw badField('toolUseId', 'string or null');
  if (reason !== undefined && typeof reason !== 'string') throw badField('reason', 'string');
  if (event !== undefined && typeof event !== 'string') throw badField('event', 'string');
  if (sampled !== undefined && typeof sampled !== 'boolean') throw badField('sampled', 'boolean');
  if (seed !== undefined && typeof seed !== 'string') throw badField('seed', 'string');
}

/** The path of the journal of `mechanism`. @es La ruta del journal de `mechanism`. */
export const journalPath = (mechanism) => path.join(stateDir(mechanism), 'journal.jsonl');

/** The path of the fires counter of `mechanism`. @es La ruta del contador de disparos de `mechanism`. */
export const firesPath = (mechanism) => path.join(stateDir(mechanism), 'fires.json');

/** The path of the record of runs of `mechanism` that could not be counted. @es La ruta del registro de corridas no contadas. */
export const uncountedPath = (mechanism) => path.join(stateDir(mechanism), 'fires-uncounted.jsonl');

/** The path of the lock failures a hook of `mechanism` recorded instead of printing. @es La ruta de los fallos de lock que un hook registró en vez de imprimirlos. */
export const lockFaultsPath = (mechanism) => path.join(stateDir(mechanism), 'lock-faults.jsonl');

/**
 * The wait budget of the counter, which runs on every Stop: about 200 ms in all, in pauses of 15 ms. The pause is
 * 15 ms, not shorter, because a shorter sleep is not shorter on Windows: MEASURED 2026-10-19, forty pauses of 5 ms
 * took 613 ms there (the timer ticks about every 15.6 ms).
 * @es El presupuesto de espera del contador, que corre en cada Stop: unos 200 ms en total, en pausas de 15 ms. La
 * pausa es de 15 ms porque una más corta no lo es en Windows: MEDIDO el 2026-10-19, cuarenta pausas de 5 ms tardaron 613 ms.
 */
const FIRES_BUDGET_MS = 200;
const FIRES_PAUSE_MS = 15;
const FIRES_ATTEMPTS = 13;

/**
 * The lock options of one wait budget: a deadline `totalMs` from now, and a wait that sleeps at most 15 ms and
 * never past the deadline, then not at all; and `spent()`, true from the deadline on, which stops a take at its
 * next pause instead of letting it make the rest of its attempts back to back. One budget passed to several
 * `incrementFires` calls bounds them TOGETHER, so a Stop that counts several mechanisms waits about 200 ms in all,
 * not 200 ms each; every counter keeps its own file and its own lock. `now` and `sleep` are test seams.
 * @es Las opciones de lock de un presupuesto de espera: un plazo `totalMs` desde ahora y una espera que duerme como
 * mucho 15 ms y nunca más allá del plazo, y luego nada; y `spent()`, verdadero desde el plazo, que para una toma en
 * su siguiente pausa en vez de dejarle hacer el resto de sus intentos seguidos. Un presupuesto compartido por varias llamadas a
 * `incrementFires` las acota JUNTAS: un Stop que cuenta varios mecanismos espera unos 200 ms en total, no 200 cada
 * uno; cada contador conserva su fichero y su lock.
 */
export function firesBudget({ totalMs = FIRES_BUDGET_MS, now = Date.now, sleep = (ms) => pauseFor(ms)() } = {}) {
  const deadline = now() + totalMs;

  return {
    attempts: FIRES_ATTEMPTS,
    wait: () => {
      const left = deadline - now();

      if (left > 0) sleep(Math.min(FIRES_PAUSE_MS, left));
    },
    spent: () => deadline - now() <= 0
  };
}

/**
 * Appends one v2 record to the journal of `mechanism` and returns it.
 * @es Añade un registro v2 al journal de `mechanism` y lo devuelve.
 */
export function appendRecord(mechanism, fields, { now = Date.now() } = {}) {
  assertRecord(fields);

  const { kind, blockId, toolUseId = null, inputDigest, reason, event, sampled, seed } = fields;
  const record = { v: 2, id: newId(now), kind, ts: new Date(now).toISOString(), blockId, toolUseId, inputDigest, ...(event === undefined ? {} : { event }), ...(sampled === undefined ? {} : { sampled }), ...(seed === undefined ? {} : { seed }), ...(reason === undefined ? {} : { reason }) };

  mkdirSync(stateDir(mechanism), { recursive: true });
  appendFileSync(journalPath(mechanism), `${JSON.stringify(record)}\n`);

  return record;
}

/** The counter stored in `file`, 0 when there is none; a corrupt one throws and is not touched. @es El contador guardado, 0 si no hay; uno corrupto lanza y no se toca. */
function readCount(file, readFile) {
  let text;

  try {
    text = readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return 0;

    throw error;
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(bilingual('fires-corrupt', { file }));
  }

  if (!Number.isSafeInteger(parsed?.count) || parsed.count < 0) throw new Error(bilingual('fires-corrupt', { file }));

  return parsed.count;
}

/**
 * Counts one more run of `mechanism` and returns the new total; the journal is not touched. The
 * read-modify-write runs under an exclusive lock (`<counter>.lock`) so two processes never lose an increment,
 * and the new value goes through a temp name unique to this process (the call is synchronous and the lock
 * serialises processes, so one process never has two writes in flight), then a rename, so a reader never sees
 * a half-written counter and no fixed temp name can collide.
 *
 * It NEVER throws: it runs on every Stop, and a counter is evidence, never a reason to abort its caller. When
 * the run cannot be counted (the lock stays held past its short budget, the counter is corrupt or unreadable, the
 * write fails, the lock faults) the call returns `null` and appends one record to `fires-uncounted.jsonl` beside
 * the counter, with the reason, so the gap in the count is visible. An increment that landed is never recorded
 * as not counted: a lock that cannot be released after it is reported, not counted twice. The wait budget is about
 * 200 ms in all (`firesBudget`), and a caller counting several mechanisms passes one shared budget as
 * `options.lock`. Only when even that record cannot be written (the state directory itself is unusable) is the gap
 * lost, and nothing else could record it.
 * @es Cuenta una corrida más de `mechanism` y devuelve el total; el journal no se toca. La lectura-
 * modificación-escritura corre bajo un lock exclusivo (`<contador>.lock`) para que dos procesos no pierdan un
 * incremento, y el valor nuevo pasa por un nombre temporal único por proceso y luego un renombrado, de modo
 * que ningún lector ve un contador a medias y ningún nombre fijo puede chocar. NUNCA lanza: corre en cada Stop, y
 * un contador es evidencia, nunca motivo para abortar a quien lo llama. Si la corrida no se puede contar (el lock
 * sigue ocupado tras su presupuesto corto, el contador está corrupto o ilegible, la escritura falla, el lock
 * falla) devuelve `null` y añade un registro a `fires-uncounted.jsonl` junto al contador, con el motivo, para que
 * el hueco se vea. Un incremento que llegó nunca se registra como no contado: un lock que no se puede soltar después
 * se informa, no se cuenta dos veces. El presupuesto de espera es de unos 200 ms en total (`firesBudget`), y quien
 * cuenta varios mecanismos pasa un presupuesto compartido como `options.lock`. Solo si ni ese registro
 * se puede escribir (el propio directorio de estado no sirve) se pierde el hueco, y nada más podría registrarlo.
 * @param options.lock Options of the lock, over this call's own `firesBudget()`: a shared budget, or a test seam. @es Opciones del lock sobre el presupuesto propio de la llamada: un presupuesto compartido, o un punto de prueba.
 * @param options.readFile Replaces `fs.readFileSync` (a test seam: a read failure other than absence cannot be told from a write failure on a real directory). @es Sustituye a `fs.readFileSync` (punto de prueba: un fallo de lectura que no es ausencia no se distingue de un fallo de escritura sobre un directorio real).
 * @returns The new total, or `null` when this run was not counted. @es El total nuevo, o `null` si esta corrida no se contó.
 */
export function incrementFires(mechanism, { readFile = readFileSync, lock } = {}) {
  const file = firesPath(mechanism);

  try {
    mkdirSync(stateDir(mechanism), { recursive: true });

    const outcome = withLock(`${file}.lock`, () => {
      const count = readCount(file, readFile) + 1;
      const temp = `${file}.${process.pid}.tmp`;

      try {
        writeFileSync(temp, `${JSON.stringify({ count })}\n`);
        renameSync(temp, file);
      } catch (error) {
        rmSync(temp, { force: true });

        throw error;
      }

      return count;
    }, { ...firesBudget(), ...lock });

    if (!outcome.held) throw new Error(bilingual(outcome.spent === true ? 'fires-budget-spent' : 'fires-busy', { file }));

    return outcome.value;
  } catch (error) {
    recordUncounted(mechanism, error);

    return null;
  }
}

/**
 * A `report` for the lock options of a hook that must not print: each lock failure it is told (a break that
 * could not be journaled, a breaker or a lock that could not be released) becomes one line of
 * `lock-faults.jsonl` in the state directory of `mechanism`, bilingual as the lock wrote it. Only when that
 * directory cannot take the line does it go to stderr, because then it would otherwise be lost.
 * @es Un `report` para las opciones de lock de un hook que no debe imprimir: cada fallo del lock que recibe es una
 * línea de `lock-faults.jsonl` en el directorio de estado de `mechanism`, bilingüe como lo escribió el lock. Solo
 * si ese directorio no admite la línea va a stderr, porque si no se perdería.
 */
export function lockFaultsOf(mechanism) {
  return (line) => {
    try {
      mkdirSync(stateDir(mechanism), { recursive: true });
      appendFileSync(lockFaultsPath(mechanism), `${JSON.stringify({ at: new Date().toISOString(), mechanism, message: line })}\n`);
    } catch {
      process.stderr.write(`${line}\n`);
    }
  };
}

/**
 * Appends why a run of `mechanism` was not counted. A state directory that cannot take even this line has
 * nowhere to record it, and the caller must still not fail, so that one failure is let go here.
 * @es Añade por qué no se contó una corrida. Un directorio de estado que no admite ni esta línea no tiene dónde
 * registrarla, y quien llama no debe fallar igual, así que ese único fallo se suelta aquí.
 */
function recordUncounted(mechanism, error) {
  const record = { at: new Date().toISOString(), mechanism, counted: false, reason: error instanceof Error ? error.message : String(error), code: error?.cause?.code ?? error?.code, message: bilingual('fires-uncounted', { mechanism }) };

  try {
    appendFileSync(uncountedPath(mechanism), `${JSON.stringify(record)}\n`);
  } catch {
    // Nowhere left to record it: see the comment above. @es No queda dónde registrarlo: ver el comentario de arriba.
  }
}
