/**
 * How many FACES a promoted text names for a lesson key. A promoted rule prevents only the faces its text
 * names (`promotion-to-contract-read-as-prevention`), so the growth check must measure faces, never how
 * often the key string occurs: repeating the key inside a paragraph adds an occurrence and no face.
 *
 * WHAT A FACE IS, decided from the real files (`~/.claude/rules/promoted-rules.md`, `b100-am-ui`'s
 * `AGENT-LEDGER.md`, the `Promoted lessons` section of a project's `CLAUDE.md`): the text is Markdown whose
 * unit is the list item. A rule is an item that names the key; each of its sub-bullets is one of its
 * faces, named or not (`rules/promoted-rules.md` states a face as a sub-bullet that rarely repeats the key);
 * a project contract states a face as one more item that names the key. So a face is
 *   - a list item (bullet or ordered) whose own text names the key, or
 *   - a list item whose NEAREST enclosing item names the key (the details nested a level deeper under a
 *     face are part of that face, not faces of their own), or
 *   - a plain paragraph (blank-line separated, outside any list) that names the key.
 * Each is counted once however many times it repeats the key. "Names" is a whole-token match, so a key
 * that is a prefix of another key does not count for the longer one.
 *
 * @es Cuántas CARAS nombra un texto promovido para una clave. Una regla promovida solo previene las caras
 * que su texto nombra, así que el chequeo de crecimiento mide caras, nunca cuántas veces aparece la cadena
 * de la clave. QUÉ ES UNA CARA, decidido sobre los ficheros reales: el texto es Markdown cuya unidad es el
 * elemento de lista. Una regla es un elemento que nombra la clave; cada sub-punto suyo es una de sus caras,
 * la repita o no; un contrato de proyecto enuncia una cara como un elemento más que nombra la clave. Una
 * cara es un elemento de lista cuyo texto nombra la clave, o cuyo elemento contenedor MÁS CERCANO la
 * nombra (los detalles anidados un nivel más abajo son parte de esa cara), o un párrafo suelto que la
 * nombra. Cada una cuenta una vez por mucho que repita la clave; «nombrar» es coincidencia de token
 * completo, así que una clave prefijo de otra no cuenta para la más larga.
 */

/** The characters a lesson key is made of. @es Los caracteres de que se compone una clave. */
const KEY_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789-';

/** Whether `text` names `key` as a whole token, not as part of a longer key. @es Si `text` nombra `key` como token completo. */
function namesKey(text, key) {
  for (let at = text.indexOf(key); at !== -1; at = text.indexOf(key, at + 1)) {
    const before = text[at - 1];
    const after = text[at + key.length];

    if (!KEY_CHARACTERS.includes(before ?? ' ') && !KEY_CHARACTERS.includes(after ?? ' ')) return true;
  }

  return false;
}

/** Whether the line starts a list item: a bullet, or digits then a dot. @es Si la línea abre un elemento de lista. */
function isItemStart(body) {
  if (body.startsWith('- ') || body.startsWith('* ') || body.startsWith('+ ')) return true;

  const digits = [...body].findIndex((character) => !'0123456789'.includes(character));

  return digits > 0 && body.startsWith('. ', digits);
}

/**
 * The units of a Markdown text: each list item (with its continuation lines) and each plain paragraph.
 * @returns `[{ indent, item, text }]`; `indent` is the item's leading spaces, 0 for a paragraph.
 * @es Las unidades de un texto Markdown: cada elemento de lista (con sus líneas de continuación) y cada párrafo suelto.
 */
function unitsOf(text) {
  const units = [];
  let afterBlank = true;

  for (const line of text.split('\n')) {
    const body = line.trimStart();
    const indent = line.length - body.length;
    const current = units.at(-1);

    if (body.length === 0) {
      afterBlank = true;
      continue;
    }

    if (isItemStart(body)) units.push({ indent, item: true, text: line });
    else if (current !== undefined && (!afterBlank || (current.item && indent > current.indent))) current.text += `\n${line}`;
    else units.push({ indent: 0, item: false, text: line });

    afterBlank = false;
  }

  return units;
}

/**
 * The faces `text` names for `key`, by the definition in this file's header.
 * @es Las caras que `text` nombra para `key`, por la definición de la cabecera de este fichero.
 */
export function countFaces(text, key) {
  let faces = 0;
  let enclosing = [];

  for (const unit of unitsOf(text)) {
    const names = namesKey(unit.text, key);

    if (!unit.item) {
      enclosing = [];
      if (names) faces += 1;
      continue;
    }

    while (enclosing.length > 0 && enclosing.at(-1).indent >= unit.indent) enclosing.pop();

    if (names || enclosing.at(-1)?.names === true) faces += 1;

    enclosing.push({ indent: unit.indent, names });
  }

  return faces;
}
