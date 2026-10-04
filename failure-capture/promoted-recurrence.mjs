/**
 * What a recurrence of an ALREADY PROMOTED lesson owes — and, just as important, what it does not. A
 * promoted rule is already binding; asking for a second promotion would send the reader to re-do a step
 * that is done. What the recurrence says is that the promoted TEXT failed to prevent this incident
 * (`promotion-to-contract-read-as-prevention`), so the reader READS that text and decides: either the
 * incident is a face the text does not name yet, and the text is EXTENDED in every file that carries the
 * key, or the face is already named, and the report says so.
 *
 * A lesson counts as promoted when its ledger line is the stub `promote` leaves (`[promoted]`), the same
 * reading `status` uses to stop listing it as due.
 *
 * @es Lo que debe una reincidencia de una lección YA PROMOVIDA, y lo que no. Una regla promovida ya es
 * vinculante; pedir una segunda promoción mandaría a rehacer un paso hecho. Lo que dice la reincidencia es
 * que el TEXTO promovido no previno este incidente, así que se LEE ese texto y se decide: o el incidente es
 * una cara que el texto aún no nombra y se EXTIENDE en cada fichero que lleva la clave, o la cara ya está
 * nombrada y el informe lo dice. Una lección cuenta como promovida cuando su línea es el muñón que deja
 * `promote` (`[promoted]`), la misma lectura que usa `status`.
 */

/** The ledger line `promote` leaves for a promoted lesson starts with this. @es La línea que deja `promote` empieza así. */
const PROMOTED_PREFIX = '- [promoted] ';

/** Whether a ledger line is the stub of a promoted lesson. @es Si una línea del ledger es el muñón de una lección promovida. */
export const isPromotedStub = (line) => typeof line === 'string' && line.startsWith(PROMOTED_PREFIX);

/**
 * The instruction for a promoted lesson that recurred: English lines, then their Spanish mirror.
 * @param input `{ key, count, files }` — `files` are the promoted-text files that must carry the key.
 * @es `files` son los ficheros de texto promovido que deben llevar la clave.
 */
export function promotedRecurrenceLines({ key, count, files }) {
  const listed = files.map((file) => `       ${file}`);

  return [
    `ALREADY PROMOTED — "${key}" recurred (${String(count)}x) but its rule is already binding: it needs NO second promotion.`,
    '  1. READ the promoted text in:',
    ...listed,
    '  2. Decide whether this incident is a face that text already names.',
    '  3. If it is not, EXTEND the text with the new face in EVERY file that carries the key.',
    '  4. If it is, say so in your report: the face and the file where the text already names it.',
    `  @es YA PROMOVIDA — "${key}" reincidió (${String(count)}x) pero su regla ya es vinculante: NO necesita una segunda promoción.`,
    '  @es 1. LEE el texto promovido (ficheros de arriba). 2. Decide si este incidente es una cara que el texto ya nombra.',
    '  @es 3. Si no lo es, EXTIENDE el texto con la cara nueva en CADA fichero que lleve la clave.',
    '  @es 4. Si lo es, dilo en tu informe: la cara y el fichero donde el texto ya la nombra.'
  ];
}
