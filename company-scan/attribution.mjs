/**
 * Where a commit MESSAGE carries an attribution: a trailer or a provenance line that records who or what
 * wrote the change (`Co-Authored-By`, `Generated with`, `cherry picked from`) or the robot emoji. The
 * message is cut into TERMS (a maximal run of ASCII letters, digits, `-` and `_`, edge joiners trimmed), each
 * term into lowercase PARTS (letter runs and digit runs); a phrase matches when consecutive WHOLE terms spell
 * its parts with only whitespace between them. So `Co-Authored-By` and `Co authored by` match, and
 * `regenerated with` (a different term) or `harness-generated) with` (a clause break between) do not. A plain
 * scan, no regular expression. Ported from `b100-am-ui`'s commit-message attribution gate.
 *
 * @es Dónde un MENSAJE de commit lleva una atribución: un trailer o una línea de procedencia que registra
 * quién o qué escribió el cambio (`Co-Authored-By`, `Generated with`, `cherry picked from`) o el emoji de
 * robot. El mensaje se corta en TÉRMINOS (tramo máximo de letras ASCII, dígitos, `-` y `_`, sin unidores en
 * los extremos) y cada término en PARTES en minúsculas; una frase coincide cuando términos ENTEROS
 * consecutivos deletrean sus partes con solo espacios entre ellos. Así `Co-Authored-By` y `Co authored by`
 * coinciden, y `regenerated with` (otro término) o `harness-generated) with` (corte de cláusula) no. Escaneo
 * simple, sin expresión regular. Portado del gate de atribución de `b100-am-ui`.
 */

/** The attribution phrases, as lowercase parts. @es Las frases de atribución, como partes en minúsculas. */
export const ATTRIBUTION_PHRASES = [
  ['co', 'authored', 'by'],
  ['generated', 'with'],
  ['cherry', 'picked', 'from'],
  ['cherrypicked', 'from']
];

/** The robot emoji (U+1F916) that marks a generated message. @es El emoji de robot (U+1F916) que marca un mensaje generado. */
export const ROBOT_FACE = '\u{1F916}';

const isLetter = (char) => (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
const isDigit = (char) => char >= '0' && char <= '9';
const isJoiner = (char) => char === '-' || char === '_';
const isTermCharacter = (char) => isLetter(char) || isDigit(char) || isJoiner(char);

/** The maximal runs of `text` whose characters share the class `classOf` gives, dropping classless ones. @es Los tramos máximos de `text` con la misma clase, sin los de clase vacía. */
function runsBy(text, classOf) {
  const runs = [];
  let run = '';
  let runClass;

  for (const char of text) {
    const charClass = classOf(char);

    if (charClass !== runClass && run !== '') {
      runs.push(run);
      run = '';
    }

    runClass = charClass;
    if (charClass !== undefined) run += char;
  }

  if (run !== '') runs.push(run);

  return runs;
}

/** `true` for a letter, `false` for a digit, `undefined` for a boundary. @es `true` letra, `false` dígito, `undefined` frontera. */
const partClass = (char) => (isLetter(char) ? true : isDigit(char) ? false : undefined);

/** `text` without its `-`/`_` edges. @es `text` sin los `-`/`_` de los extremos. */
function trimJoiners(text) {
  let start = 0;
  let end = text.length;

  while (start < end && isJoiner(text[start])) start += 1;
  while (end > start && isJoiner(text[end - 1])) end -= 1;

  return text.slice(start, end);
}

/** Cuts `text` into alternating runs of term characters and of everything else, losing nothing. @es Corta `text` en tramos alternos de caracteres de término y de todo lo demás, sin perder nada. */
function alternatingRuns(text) {
  const runs = [];

  for (const char of text) {
    const last = runs.length - 1;

    if (last >= 0 && isTermCharacter(runs[last][0]) === isTermCharacter(char)) runs[last] += char;
    else runs.push(char);
  }

  return runs;
}

/** The terms of `message`: `{ text, parts, gapBefore, line }`. @es Los términos de `message`. */
function termsOf(message) {
  const terms = [];
  let line = 1;
  let gap = '';

  for (const run of alternatingRuns(message)) {
    const text = isTermCharacter(run[0]) ? trimJoiners(run) : '';

    if (text === '') {
      gap += run;
      line += run.split('\n').length - 1;
      continue;
    }

    const leading = run.slice(0, run.indexOf(text));

    terms.push({ text, parts: runsBy(text, partClass).map((part) => part.toLowerCase()), gapBefore: gap + leading, line });
    gap = run.slice(leading.length + text.length);
  }

  return terms;
}

/** Whether the whole terms `run` spell `phrase` with only whitespace between them. @es Si los términos `run` deletrean `phrase` con solo espacios entre ellos. */
function spells(run, phrase) {
  const parts = run.flatMap((term) => term.parts);

  return run.slice(1).every((term) => term.gapBefore.trim() === '') && parts.length === phrase.length && parts.every((part, index) => part === phrase[index]);
}

/**
 * @returns `[{ name, line }]` for each attribution phrase and each robot emoji in `message`, `name` being the
 *   phrase (`co authored by`) or the emoji.
 * @es `[{ name, line }]` por cada frase de atribución y cada emoji de robot de `message`.
 */
export function attributionHits(message) {
  const terms = termsOf(message);
  const hits = message.split('\n').flatMap((text, index) => (text.includes(ROBOT_FACE) ? [{ name: ROBOT_FACE, line: index + 1 }] : []));

  terms.forEach((term, start) => {
    for (const phrase of ATTRIBUTION_PHRASES) {
      const covered = Array.from({ length: phrase.length }, (_, count) => terms.slice(start, start + count + 1)).find((run) => spells(run, phrase));

      if (covered !== undefined) hits.push({ name: phrase.join(' '), line: term.line });
    }
  });

  return hits;
}
