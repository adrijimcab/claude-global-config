/**
 * Where a listed tool NAME occurs in a text. Matching is case-insensitive and on WHOLE words: the character
 * before and after a hit must not be a letter or a digit, so `.claude/`, `Claude` and `gentle-ai` match and
 * `claudette` or `copilots` do not. A plain scan, no regular expression.
 *
 * @es Dónde aparece un NOMBRE de herramienta de la lista en un texto. Sin distinguir mayúsculas y por
 * palabra COMPLETA: el carácter anterior y posterior no puede ser letra ni dígito, de modo que `.claude/`,
 * `Claude` y `gentle-ai` coinciden y `claudette` o `copilots` no. Escaneo simple, sin expresión regular.
 */

/** Whether `character` is a letter or a digit in any script. @es Si `character` es letra o dígito. */
function isWordCharacter(character) {
  if (character === undefined) return false;

  return (character >= '0' && character <= '9') || character.toLowerCase() !== character.toUpperCase();
}

/**
 * The FIRST whole-word hit of each listed name: `[{ name, index }]`, `index` into `text`.
 * @es El PRIMER acierto por palabra completa de cada nombre: `[{ name, index }]`.
 */
export function findNames(text, names) {
  const lowered = text.toLowerCase();
  const hits = [];

  for (const name of names) {
    let from = 0;

    for (let at = lowered.indexOf(name, from); at !== -1; at = lowered.indexOf(name, from)) {
      if (!isWordCharacter(lowered[at - 1]) && !isWordCharacter(lowered[at + name.length])) {
        hits.push({ name, index: at });
        break;
      }

      from = at + 1;
    }
  }

  return hits;
}
