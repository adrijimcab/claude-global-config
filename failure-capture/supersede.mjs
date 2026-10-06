/**
 * Replaces the rule a ledger line states with the current one, losing nothing. A lesson whose rule a later
 * directive changed cannot be left saying the old thing in a file that loads every session, and it cannot be
 * edited by hand either: this command is the only way to amend a ledger line. Under the ledger lock it finds
 * the line by its key (the marker's, or the one its evidence pointer names), builds the amended line with the
 * line grammar (`tieredLine`: the same scope, date, tally and marker, the current rule, the directive that
 * superseded the old one, the pointer), archives the WHOLE old line to the evidence store with a note of what
 * replaced it, RE-READS that file from disk and proves the old line is a whole line of it
 * (`conservation.mjs`) before the ledger may change, then writes the ledger once and reads it back
 * (`verified-write.mjs`): any difference restores the old text. Whatever it cannot do faithfully leaves the
 * ledger byte-identical. Running it again with the same rule and directive changes nothing. A promoted lesson
 * is refused: its rule lives in the contract file, and that is where it is amended.
 *
 * @es Sustituye la regla que enuncia una línea del ledger por la vigente sin perder nada. Una lección cuya
 * regla cambió una directiva posterior no puede seguir diciendo lo viejo en un fichero que se carga cada
 * sesión, ni puede editarse a mano: este comando es la única manera de enmendar una línea del ledger. Bajo el
 * lock del ledger halla la línea por su clave (la del marcador o la que nombra su puntero a la evidencia),
 * construye la línea enmendada con la gramática de línea (`tieredLine`: mismo alcance, fecha, recuento y
 * marcador, la regla vigente, la directiva que sustituyó a la vieja, el puntero), archiva la línea vieja
 * ENTERA en el almacén de evidencia con una nota de qué la reemplazó, RELEE ese fichero de disco y prueba que
 * la línea vieja es una línea entera de él antes de que el ledger pueda cambiar, y escribe el ledger una vez y
 * lo relee: cualquier diferencia restaura el texto viejo. Lo que no pueda hacer con fidelidad deja el ledger
 * idéntico byte a byte. Repetirlo con la misma regla y directiva no cambia nada. Una lección promovida se
 * rechaza: su regla vive en el fichero de contrato y allí se enmienda.
 */

import { proveArchived } from './conservation.mjs';
import { appendEvidence, readEvidence } from './evidence.mjs';
import { isValidKey, joinBilingual, lineKeyOf, parseEntry, refuse, splitRule, tieredLine } from './ledger-line.mjs';
import { withLock } from './ledger-lock.mjs';
import { captureTextProblems, oneLineProblems } from './tiered-capture.mjs';
import { writeText, writeVerified } from './verified-write.mjs';

/** What touches the disk, replaceable so a proof can make it lie. @es Lo que toca el disco, sustituible para que una prueba lo haga mentir. */
const REAL_IO = { appendEvidence, readEvidence, writeText };

/** The scope of a promoted stub: its rule is in the contract file, not in the ledger. @es El alcance de un muñón promovido: su regla está en el fichero de contrato, no en el ledger. */
const PROMOTED_SCOPE = 'promoted';

/** The bilingual reasons the inputs are refused, empty when they are fine. @es Los motivos bilingües por los que se rechazan las entradas; vacío si están bien. */
function inputProblems({ key, rule, by }) {
  return [
    ...(isValidKey(key) ? [] : [refuse('--key must be lowercase kebab-case, 4-60 chars.', '--key debe ser kebab-case en minúsculas, de 4 a 60 caracteres.').problem]),
    ...(typeof rule === 'string' ? captureTextProblems({ rule }) : [refuse('--rule is required: the current rule, one sentence.', '--rule es obligatoria: la regla vigente, en una frase.').problem]),
    ...(typeof by === 'string' && by.trim().length > 0 ? oneLineProblems('--by', by) : [refuse('--by is required: where the directive that supersedes the old rule is written.', '--by es obligatorio: dónde está escrita la directiva que sustituye a la regla vieja.').problem]),
  ];
}

/** The rule text of the amended line: the current rule, then what superseded the old one. @es El texto de regla de la línea enmendada: la regla vigente y qué sustituyó a la vieja. */
function amendedRule({ rule, by, date }) {
  const directive = by.trim();

  return `${rule.trim()} Superseded ${date} by ${directive}${directive.endsWith('.') ? '' : '.'}`;
}

/** The one ledger line that carries `key`: `{ ledger, index, line }`, or a refusal naming why there is not exactly one. @es La única línea del ledger que lleva `key`, o una negativa que dice por qué no hay exactamente una. */
function locate({ ledgers, key }) {
  const found = ledgers.flatMap((ledger) => ledger.lines.flatMap((line, index) => (lineKeyOf(line) === key ? [{ ledger, index, line }] : [])));

  if (found.length === 1) return { ok: true, ...found[0] };

  return found.length === 0 ? refuse(`no ledger line carries the key "${key}".`, `ninguna línea del ledger lleva la clave "${key}".`) : refuse(`${String(found.length)} ledger lines carry the key "${key}": amending one of them would leave the others stating the old rule.`, `${String(found.length)} líneas del ledger llevan la clave "${key}": enmendar una dejaría a las demás enunciando la regla vieja.`);
}

/**
 * The line `original` becomes: `{ ok: true, line }`, or a refusal when it is a promoted stub, cannot be read or
 * cannot be written faithfully. The scope, date, tally and marker are the original's own.
 * @es La línea en que se convierte `original`, o una negativa si es un muñón promovido, no se puede leer o no se puede escribir con fidelidad. Alcance, fecha, recuento y marcador son los del original.
 */
function amendedLine({ original, key, rule, by, date }) {
  const entry = parseEntry(original);

  if (!entry.ok) return entry;
  if (entry.scope === PROMOTED_SCOPE) return refuse(`the lesson "${key}" is promoted: its rule lives in the contract file, so amend it there.`, `la lección "${key}" está promovida: su regla vive en el fichero de contrato, así que se enmienda allí.`);

  const split = splitRule(entry.body);

  if (!split.ok) return split;

  return tieredLine({ scope: entry.scope, date: entry.date, tally: split.tally, rule: amendedRule({ rule, by, date }), key, marker: entry.marker });
}

/** What a refusal looks like as an outcome: nothing changed. @es Cómo se ve una negativa como resultado: nada cambió. */
const refused = (problems) => ({ status: 1, held: false, problems, amended: undefined });

/** Archives the old line, re-reads the evidence from disk and proves it holds the line whole. @es Archiva la línea vieja, relee la evidencia de disco y prueba que la tiene entera. */
function archiveOld({ io, file, key, original, built, by, date }) {
  const archived = io.appendEvidence({ ledgerFile: file, key, line: original, date, kind: 'superseded', note: `Superseded ${date} by ${by.trim()}; replaced by: ${built}` });

  if (!archived.ok) return { ok: false, deficits: [archived.problem] };

  return proveArchived({ original, evidence: io.readEvidence(file, key) });
}

/** Supersedes the line inside the lock: `{ status, held: false, problems, amended }`. @es Sustituye la línea dentro del lock. */
function supersedeLocked({ ledgers, key, rule, by, date, io }) {
  const where = locate({ ledgers, key });

  if (!where.ok) return refused([where.problem]);

  const { ledger, index, line: original } = where;
  const built = amendedLine({ original, key, rule, by, date });

  if (!built.ok) return refused([built.problem]);

  const base = { scope: ledger.scope, file: ledger.file, key, before: original.length };

  if (built.line === original) return { status: 0, held: false, problems: [], amended: { ...base, after: original.length, changed: false } };

  const proof = archiveOld({ io, file: ledger.file, key, original, built: built.line, by, date });

  if (!proof.ok) return refused([joinBilingual(['the old line could not be proved safe in the evidence store: the ledger line is unchanged. @es no se pudo probar que la línea vieja esté a salvo en la evidencia: la línea del ledger no cambió.', ...proof.deficits])]);

  const text = ledger.lines.join('\n');
  const next = ledger.lines.map((one, at) => (at === index ? built.line : one)).join('\n');

  if (!writeVerified({ io, file: ledger.file, text, next })) return refused(['RESTORED — the ledger read back differently from what was planned, so the old text was put back. @es RESTAURADO: el ledger releído difiere de lo planificado, así que se volvió a poner el texto viejo.']);

  return { status: 0, held: false, problems: [], amended: { ...base, after: built.line.length, changed: true } };
}

/**
 * @param input `{ load, key, rule, by, date, lockFile, deps }` — `load()` returns the ledgers that exist (`{ scope,
 *   file, lines }`) and is called under the lock, so a line another writer added is never lost; `rule` is the current
 *   rule, `by` where the directive that supersedes the old one is written, `deps` replaces the disk.
 * @returns `{ status, held, problems, amended }`: status 0 done (or already so), 1 refused or restored, 2 the
 *   lock is held (nothing was changed); `amended` is `{ scope, file, key, before, after, changed }` on status 0.
 * @es `load()` devuelve los ledgers y se llama bajo el lock, así una línea que otro escritor añadió nunca se pierde; `rule` es la regla vigente, `by` dónde está escrita la directiva que sustituye a la vieja, `deps` sustituye el disco. `status` 0 hecho (o ya estaba), 1 rechazado o restaurado, 2 lock ocupado (nada cambió).
 */
export function runSupersede({ load, key, rule, by, date, lockFile, deps }) {
  const problems = inputProblems({ key, rule, by });

  if (problems.length > 0) return refused(problems);

  const io = { ...REAL_IO, ...deps };
  const locked = withLock(lockFile, () => supersedeLocked({ ledgers: load(), key, rule, by, date, io }));

  return locked.held ? locked.value : { status: 2, held: true, problems: [], amended: undefined };
}

/** The report, one bilingual line each: what changed or why nothing did. @es El informe, una línea bilingüe cada uno: qué cambió o por qué nada cambió. */
export function describeSupersede(outcome) {
  if (outcome.held) return ['supersede REFUSED — the ledger is locked by another writer; nothing was changed. @es supersede RECHAZADO: el ledger está bloqueado por otro escritor; no se cambió nada.'];

  if (outcome.amended !== undefined) {
    const { scope, file, key, before, after, changed } = outcome.amended;

    return [changed
      ? `${scope} ledger ${file}: lesson "${key}" superseded; the old line is archived whole in the evidence store. ${String(before)} -> ${String(after)} characters. @es ledger ${scope}: lección "${key}" sustituida; la línea vieja queda archivada entera en el almacén de evidencia. ${String(before)} -> ${String(after)} caracteres.`
      : `${scope} ledger ${file}: lesson "${key}" already states this rule and this directive; nothing was changed. @es ledger ${scope}: la lección "${key}" ya enuncia esta regla y esta directiva; no se cambió nada.`];
  }

  return ['supersede REFUSED — the ledger was not changed. @es supersede RECHAZADO: no se cambió el ledger.', ...outcome.problems.map((problem) => `  ${problem}`)];
}
