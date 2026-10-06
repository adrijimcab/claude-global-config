/**
 * The grammar of one ledger entry line: how a line is read, and the only two shapes a shortened line may
 * take — `tieredLine` (label, rule, evidence pointer, marker) and `minimalStub` (key, mechanism, marker).
 * Pure text in, text out: nothing here touches a file. Every builder REFUSES what it cannot write
 * faithfully, with a bilingual reason, instead of writing something close.
 *
 * NO REGEX (M5): `indexOf`, `slice` and character checks on literals, so a line that does not match is
 * refused with a reason and never skipped in silence.
 *
 * @es La gramática de una línea de entrada del ledger: cómo se lee y las dos únicas formas que puede tomar
 * una línea acortada. Texto puro: nada aquí toca un fichero. Cada constructor RECHAZA lo que no puede
 * escribir fielmente, con motivo bilingüe, en vez de escribir algo parecido. SIN REGEX (M5).
 */

export const MARK_OPEN = '<!--fc:';
export const MARK_CLOSE = '-->';

/** The label the builder writes before a rule; a parsed line holds it exactly once. @es La etiqueta que escribe el constructor; una línea leída la lleva exactamente una vez. */
export const RULE_LABEL = 'RULE: ';

const HEAD_SEPARATOR = ' — ';
const POINTER_LEAD = ' Evidence: lessons/evidence/';
const POINTER_END = '.md';

/** The evidence file a key's lines are archived in, by name: what a pointer to `key` points at. @es El fichero de evidencia donde se archivan las líneas de una clave, por nombre: a lo que apunta un puntero a `key`. */
export const evidenceNameOf = (key) => `${key}${POINTER_END}`;
const NO_MECHANISM = 'no mechanism';
const DIGITS = '0123456789';

/** A key is lowercase kebab: letters, digits, hyphens. Checked char by char, no regex. @es Clave kebab en minúsculas, comprobada carácter a carácter. */
export function isValidKey(key) {
  if (typeof key !== 'string' || key.length < 4 || key.length > 60) return false;
  if (key.startsWith('-') || key.endsWith('-')) return false;

  const allowed = 'abcdefghijklmnopqrstuvwxyz0123456789-';

  return [...key].every((character) => allowed.includes(character));
}

/** Reads the `<!--fc:key#n-->` marker on a ledger line, or `undefined`. @es Lee el marcador de una línea del ledger. */
export function readMarker(line) {
  const open = line.indexOf(MARK_OPEN);

  if (open === -1) return undefined;

  const close = line.indexOf(MARK_CLOSE, open);

  if (close === -1) return undefined;

  const body = line.slice(open + MARK_OPEN.length, close);
  const hash = body.lastIndexOf('#');

  if (hash === -1) return undefined;

  const count = Number.parseInt(body.slice(hash + 1), 10);

  if (!Number.isInteger(count) || count < 1) return undefined;

  return { key: body.slice(0, hash), count, open, close: close + MARK_CLOSE.length };
}

/** A refusal: `{ ok: false, line: '', problem }`, English first and the `@es` mirror in the same message. @es Una negativa con el motivo en inglés y su espejo `@es`. */
export const refuse = (english, spanish) => ({ ok: false, line: '', problem: `${english} @es ${spanish}` });

/**
 * Joins bilingual sentences, each `english @es spanish`, into ONE message: every English part, a single
 * `@es`, then every Spanish part in the same order, so both languages carry the same information.
 * @es Une oraciones bilingües en UN mensaje: todas las partes en inglés, un único `@es` y todas las partes en español en el mismo orden.
 */
export function joinBilingual(sentences) {
  const halves = sentences.map((sentence) => sentence.split(' @es '));

  return `${halves.map(([english]) => english).join(' ')} @es ${halves.map(([english, spanish = english]) => spanish).join(' ')}`;
}

/** `YYYY-MM-DD`, checked character by character. @es `AAAA-MM-DD`, comprobado carácter a carácter. */
export const isDate = (text) => typeof text === 'string' && text.length === 10 && [...text].every((character, at) => (at === 4 || at === 7 ? character === '-' : DIGITS.includes(character)));

/** The `(×N)` recurrence tally a body starts with, exactly as written, or `undefined`. @es El recuento `(×N)` con que empieza un cuerpo, tal cual, o `undefined`. */
function tallyOf(body) {
  const close = body.indexOf(') ');

  if (!body.startsWith('(×') || close < 3) return undefined;

  return [...body.slice(2, close)].every((character) => DIGITS.includes(character)) ? body.slice(0, close + 1) : undefined;
}

/** What makes `text` unfit for the inside of a one-line entry, or `undefined`. @es Qué hace que `text` no sirva dentro de una entrada de una línea. */
function unsafeIn(name, text) {
  if (typeof text !== 'string' || text.length === 0) return refuse(`${name} must be a non-empty text.`, `${name} debe ser un texto no vacío.`);
  if (text.includes('\n') || text.includes('\r')) return refuse(`${name} must be one line.`, `${name} debe ser de una sola línea.`);
  if (text.includes(MARK_OPEN)) return refuse(`${name} must not contain "${MARK_OPEN}".`, `${name} no puede contener "${MARK_OPEN}".`);

  return undefined;
}

/** The key inside `marker` when it is a string, else `undefined`. @es La clave del marcador si es un texto. */
const keyOfMarker = (marker) => (typeof marker === 'string' ? readMarker(marker)?.key : undefined);

/** Whether `marker` is exactly one whole, valid marker (or absent, when not `required`). @es Si `marker` es exactamente un marcador entero y válido. */
function markerProblem(marker, required) {
  if (marker === undefined) return required ? refuse('a marker is required.', 'se exige un marcador.') : undefined;

  const found = typeof marker === 'string' ? readMarker(marker) : undefined;

  return found !== undefined && found.open === 0 && found.close === marker.length && isValidKey(found.key) ? undefined : refuse('the marker must be exactly one valid marker, unaltered.', 'el marcador debe ser exactamente un marcador válido, sin alterar.');
}

/**
 * Reads an entry line `- [scope] date — body [marker]`. The marker, when present, must end the line after a
 * space; it is returned verbatim, so a caller can carry it over without rebuilding it.
 * @returns `{ ok: true, scope, date, body, marker }` (marker `undefined` when the line has none) or a refusal.
 * @es Lee una línea de entrada. El marcador, si existe, cierra la línea tras un espacio y se devuelve literal.
 */
export function parseEntry(line) {
  if (typeof line !== 'string' || !line.startsWith('- [')) return refuse('not an entry line.', 'no es una línea de entrada.');

  const scopeEnd = line.indexOf('] ');
  const headEnd = line.indexOf(HEAD_SEPARATOR, scopeEnd);

  if (scopeEnd === -1 || headEnd === -1) return refuse('the entry has no "[scope] date — " head.', 'la entrada no tiene cabecera "[alcance] fecha — ".');

  const date = line.slice(scopeEnd + 2, headEnd);
  const bodyStart = headEnd + HEAD_SEPARATOR.length;
  const found = readMarker(line);

  if (!isDate(date)) return refuse('the date is not YYYY-MM-DD.', 'la fecha no es AAAA-MM-DD.');
  if (found === undefined) return { ok: true, scope: line.slice(3, scopeEnd), date, body: line.slice(bodyStart), marker: undefined };
  if (found.close !== line.length || found.open <= bodyStart || line[found.open - 1] !== ' ') return refuse('the marker must end the line, after a space.', 'el marcador debe cerrar la línea, tras un espacio.');

  return { ok: true, scope: line.slice(3, scopeEnd), date, body: line.slice(bodyStart, found.open - 1), marker: line.slice(found.open, found.close) };
}

/**
 * Splits an entry body at its single `RULE: ` label: the tally it may start with, the narrative before the
 * label and the rule tail after it. No label, or more than one, is refused — never guessed.
 * @es Parte un cuerpo por su única etiqueta `RULE: `: recuento, narrativa y cola de la regla. Ninguna o varias se rechazan.
 */
export function splitRule(body) {
  const tally = tallyOf(body);
  const text = tally === undefined ? body : body.slice(tally.length + 1);
  const at = text.indexOf(RULE_LABEL);

  if (at === -1) return refuse(`the body has no "${RULE_LABEL}" label.`, `el cuerpo no tiene la etiqueta "${RULE_LABEL}".`);
  if (text.indexOf(RULE_LABEL, at + 1) !== -1) return refuse(`the body has more than one "${RULE_LABEL}" label.`, `el cuerpo tiene más de una etiqueta "${RULE_LABEL}".`);

  return { ok: true, tally, narrative: text.slice(0, at), rule: text.slice(at + RULE_LABEL.length) };
}

/**
 * The evidence pointer `tieredLine` writes, read at `from` in `text` (the pointer proper, without the space
 * that leads it): `{ key, end }` with `end` the index just past it, or `undefined` when `text` holds no
 * pointer there or its key is not a valid one. The only reader of the pointer's shape, so whoever must tell
 * a tool-written pointer from invented text asks here and cannot drift from the builder.
 * @es El puntero a la evidencia que escribe `tieredLine`, leído en `from` dentro de `text` (el puntero en sí,
 * sin el espacio que lo precede): `{ key, end }`, o `undefined` si no hay puntero ahí o su clave no es válida.
 * El único lector de la forma del puntero: quien deba distinguir un puntero de la herramienta de un texto
 * inventado pregunta aquí y no puede divergir del constructor.
 */
export function pointerAt(text, from) {
  const lead = POINTER_LEAD.trimStart();

  if (!text.startsWith(lead, from)) return undefined;

  const keyStart = from + lead.length;
  const keyEnd = text.indexOf(POINTER_END, keyStart);
  const key = keyEnd === -1 ? '' : text.slice(keyStart, keyEnd);

  return isValidKey(key) ? { key, end: keyEnd + POINTER_END.length } : undefined;
}

/** The key a rule tail points its evidence to, or `undefined` when it carries no valid pointer. @es La clave a la que apunta la evidencia de una cola de regla. */
export function evidenceKeyOf(rule) {
  const at = rule.lastIndexOf(POINTER_LEAD);
  const pointer = at === -1 ? undefined : pointerAt(rule, at + 1);

  return pointer?.end === rule.length ? pointer.key : undefined;
}

/**
 * Reads a minimal stub back: `{ date, key, mechanism, marker }`, `mechanism` being `undefined` for the
 * no-mechanism form; `undefined` for any other line.
 * @es Lee un muñón mínimo: `{ date, key, mechanism, marker }`; `undefined` para cualquier otra línea.
 */
export function parseStub(line) {
  const entry = parseEntry(line);

  if (!entry.ok || entry.scope !== 'promoted' || entry.marker === undefined) return undefined;

  const key = readMarker(entry.marker).key;
  const lead = `${key}: mechanism `;

  if (entry.body === `${key}: ${NO_MECHANISM}`) return { date: entry.date, key, mechanism: undefined, marker: entry.marker };

  return entry.body.startsWith(lead) && entry.body.length > lead.length ? { date: entry.date, key, mechanism: entry.body.slice(lead.length), marker: entry.marker } : undefined;
}

/** Whether a line is already in a shortened shape (tiered or stub), so a second condense leaves it alone. @es Si la línea ya está acortada, para que un segundo condense no la toque. */
export function isTiered(line) {
  if (parseStub(line) !== undefined) return true;

  const entry = parseEntry(line);
  const split = entry.ok ? splitRule(entry.body) : entry;

  return split.ok && evidenceKeyOf(split.rule) !== undefined;
}

/**
 * Builds the tiered line `- [scope] date — [(×N) ]RULE: rule Evidence: lessons/evidence/key.md[ marker]`.
 * The label and the pointer are the builder's own fixed text; `tally` and `marker` are carried VERBATIM and
 * a line without a marker gets none. `rule` is refused when it holds a newline, a marker opener or a
 * `RULE:` (which would make the line read back with two labels).
 * @returns `{ ok: true, line }` or a refusal.
 * @es Construye la línea con niveles. Etiqueta y puntero son texto fijo del constructor; `tally` y `marker` van LITERALES y una línea sin marcador no recibe ninguno.
 */
export function tieredLine({ scope, date, tally, rule, key, marker }) {
  const refusal = [
    unsafeIn('scope', scope) ?? (scope.includes(']') ? refuse('scope must not contain "]".', 'el alcance no puede contener "]".') : undefined),
    isDate(date) ? undefined : refuse('date must be YYYY-MM-DD.', 'la fecha debe ser AAAA-MM-DD.'),
    unsafeIn('rule', rule) ?? (rule.includes('RULE:') ? refuse('rule must not contain "RULE:": the builder writes the label.', 'la regla no puede contener "RULE:": el constructor escribe la etiqueta.') : undefined),
    isValidKey(key) ? undefined : refuse('key must be lowercase kebab-case, 4-60 chars.', 'la clave debe ser kebab-case en minúsculas, 4-60 caracteres.'),
    tally === undefined || tallyOf(`${String(tally)} `) === tally ? undefined : refuse('tally must be "(×N)".', 'el recuento debe ser "(×N)".'),
    markerProblem(marker, false),
    marker !== undefined && keyOfMarker(marker) !== key ? refuse('the evidence key must be the key of the marker.', 'la clave de la evidencia debe ser la del marcador.') : undefined,
  ].find((problem) => problem !== undefined);

  if (refusal !== undefined) return refusal;

  return { ok: true, line: `- [${scope}] ${date}${HEAD_SEPARATOR}${tally === undefined ? '' : `${tally} `}${RULE_LABEL}${rule}${POINTER_LEAD}${key}${POINTER_END}${marker === undefined ? '' : ` ${marker}`}` };
}

/**
 * Builds the minimal stub of a promoted lesson: `- [promoted] date — key: mechanism path marker`, or
 * `key: no mechanism`. The key is the marker's own, so the two cannot disagree.
 * @returns `{ ok: true, line }` or a refusal.
 * @es Construye el muñón mínimo de una lección promovida. La clave es la del marcador, así que no pueden discrepar.
 */
export function minimalStub({ date, mechanism, marker }) {
  const refusal = [isDate(date) ? undefined : refuse('date must be YYYY-MM-DD.', 'la fecha debe ser AAAA-MM-DD.'), mechanism === undefined ? undefined : unsafeIn('mechanism', mechanism), markerProblem(marker, true)].find((problem) => problem !== undefined);

  if (refusal !== undefined) return refusal;

  return { ok: true, line: `- [promoted] ${date}${HEAD_SEPARATOR}${keyOfMarker(marker)}: ${mechanism === undefined ? NO_MECHANISM : `mechanism ${mechanism}`} ${marker}` };
}
