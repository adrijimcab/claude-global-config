/**
 * Splits a memory record's text into the ITEMS whose survival `loss.mjs` checks, and normalises them.
 *
 * THE COMPARISON UNIT, decided on purpose (`backlog-rewritten-from-summary-lost-detail`). A record is a
 * sequence of LOGICAL items: a bullet, a numbered entry, a heading, a table row, or a paragraph. Lines
 * that are not structural starts (no bullet, no heading, no number, no `|`) are CONTINUATIONS and are
 * joined to the item above, and every item is normalised (marker removed, lowercased, whitespace
 * collapsed). Why this unit and not the others:
 *   - raw LINES would flag a reflowed paragraph as deleted (same words, different wrapping);
 *   - whole-text hashing could not say WHICH detail vanished, and would flag any reorder;
 *   - words alone lose the boundary between "an item was kept" and "its words appear somewhere".
 * Logical items are reflow-invariant (a wrapped paragraph is one item), order-invariant (presence is
 * checked against the whole new text, not by position) and nameable (the refusal quotes the lost item).
 *
 * No regular expression anywhere (owner mandate M5): every split is a plain string operation.
 *
 * @es Parte el texto de un registro en los ITEMS cuya supervivencia comprueba `loss.mjs`, y los
 * normaliza. Unidad de comparación elegida a propósito: item lógico (viñeta, entrada numerada, título,
 * fila de tabla o párrafo); las líneas que no empiezan estructura son CONTINUACIONES del item anterior.
 * Es invariante al reflujo y al orden, y permite nombrar el item perdido. Sin expresiones regulares (M5).
 */

/** Minimum meaningful tokens for an item to count as content worth protecting. @es Mínimo de tokens con significado para que un item cuente como contenido a proteger. */
export const MIN_MEANINGFUL_TOKENS = 2;

const BULLET_MARKERS = ['- ', '* ', '+ '];
const DIGITS = '0123456789';

/** Replaces every Unicode whitespace character by a single space and trims. @es Colapsa todo espacio en blanco a un solo espacio. */
export function collapseWhitespace(text) {
  return [...text]
    .map((character) => (character.trim() === '' ? ' ' : character))
    .join('')
    .split(' ')
    .filter((part) => part !== '')
    .join(' ');
}

/** True when `character` is a letter or a digit in any alphabet. @es Verdadero si el carácter es letra o dígito de cualquier alfabeto. */
export function isWordCharacter(character) {
  return character.toLowerCase() !== character.toUpperCase() || DIGITS.includes(character);
}

/** True for `12.` / `12)` followed by a space, the start of a numbered entry. @es Inicio de entrada numerada. */
function startsNumbered(line) {
  const digits = [...line].findIndex((character) => !DIGITS.includes(character));

  if (digits <= 0) return false;

  return '.)'.includes(line[digits]) && line[digits + 1] === ' ';
}

/** True when a trimmed line opens a NEW logical item. @es Verdadero si la línea abre un item lógico NUEVO. */
function startsItem(line) {
  return BULLET_MARKERS.some((marker) => line.startsWith(marker)) || line.startsWith('#') || line.startsWith('|') || startsNumbered(line);
}

/** Removes the structural marker (bullet, heading hashes, number) from the start of an item. @es Quita el marcador estructural inicial. */
function withoutMarker(line) {
  const bullet = BULLET_MARKERS.find((marker) => line.startsWith(marker));

  if (bullet !== undefined) return line.slice(bullet.length);

  if (line.startsWith('#')) return [...line].slice([...line].findIndex((character) => character !== '#')).join('');

  if (startsNumbered(line)) return line.slice(line.indexOf(' ') + 1);

  return line;
}

/** Lowercased, marker-free, whitespace-collapsed form of one raw item. @es Forma normalizada de un item crudo. */
export function normalizeItem(raw) {
  return collapseWhitespace(withoutMarker(raw.trim())).toLowerCase();
}

/** The normalised word-like tokens of a normalised item. @es Los tokens con significado de un item normalizado. */
export function meaningfulTokens(normalized) {
  return normalized.split(' ').filter((token) => [...token].some(isWordCharacter));
}

/**
 * The normalised logical items of `text`, in order, empty ones removed. Blank lines end an item, and a
 * structural start ends the previous one.
 * @es Los items lógicos normalizados de `text`, en orden, sin los vacíos.
 */
export function extractItems(text) {
  const items = [];
  let open = [];

  const flush = () => {
    if (open.length > 0) items.push(normalizeItem(open.join(' ')));
    open = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (line === '') {
      flush();
    } else if (startsItem(line)) {
      flush();
      open = [line];
    } else {
      open.push(line);
    }
  }

  flush();

  return items.filter((item) => item !== '');
}
