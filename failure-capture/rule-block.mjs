/**
 * Moving the text of a promoted rule from one rules file to another, and the PROOF that it arrived whole. A
 * promoted rule is a BLOCK: the line that opens with its key in bold code (`- **\`key\`** …`) and the lines that
 * follow it up to the first blank line (`rules/promoted-rules.md` keeps one block per key, a blank line between).
 * Pure: text in, text out, no I/O; the caller writes and re-reads.
 *
 * Moving a block changes WHERE a rule is loaded from (a path-scoped file instead of the always-loaded one) and
 * never WHAT it says: the block lands byte for byte, and the file it leaves loses that block and one blank line
 * and nothing else. A key whose opening line is not exactly one line of the source, or that the destination
 * already holds, is refused whole.
 *
 * @es Mover el texto de una regla promovida de un fichero de reglas a otro, y la PRUEBA de que llegó entero.
 * Una regla promovida es un BLOQUE: la línea que abre con su clave en código en negrita (`- **\`clave\`** …`) y
 * las líneas que la siguen hasta la primera línea en blanco (`rules/promoted-rules.md` guarda un bloque por
 * clave, con una línea en blanco entre ellos). Pura: entra texto, sale texto, sin E/S. Mover un bloque cambia
 * DESDE DÓNDE se carga una regla (un fichero con alcance de ruta en vez del siempre cargado) y nunca QUÉ dice:
 * el bloque llega byte a byte, y el fichero que lo deja pierde ese bloque y una línea en blanco y nada más.
 * Una clave cuya línea de apertura no es exactamente una línea del origen, o que el destino ya tiene, se
 * rechaza entera.
 */

const opens = (key) => `- **\`${key}\`**`;

/** A line without its carriage return. @es Una línea sin su retorno de carro. */
const content = (line) => (line.endsWith('\r') ? line.slice(0, -1) : line);

/** The line ending the text uses. @es El fin de línea que usa el texto. */
const endingOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

/**
 * Where the block of `key` is in `text`: the line index it opens at and the index one past its last line, or why there is none.
 * @es Dónde está el bloque de `key` en `text`: el índice de la línea con que abre y el siguiente a su última línea, o por qué no hay ninguno.
 * @returns `{ start, end, lines }` or `{ count }` (how many opening lines there were: 0 or more than 1).
 */
export function findBlock(text, key) {
  const lines = text.split('\n');
  const starts = lines.flatMap((line, index) => (content(line).startsWith(opens(key)) ? [index] : []));

  if (starts.length !== 1) return { count: starts.length };

  const [start] = starts;
  let end = start + 1;

  while (end < lines.length && content(lines[end]) !== '') end += 1;

  return { start, end, lines: lines.slice(start, end) };
}

/** `lines` with runs of blank lines collapsed and the blanks at both ends dropped, so two texts that differ only in where a block's blank line went compare equal. @es `lines` con las rachas de líneas en blanco colapsadas y las de los extremos quitadas. */
function normalized(lines) {
  const kept = [];

  for (const line of lines.map(content)) if (line !== '' || (kept.length > 0 && kept.at(-1) !== '')) kept.push(line);

  while (kept.length > 0 && kept.at(-1) === '') kept.pop();

  return kept;
}

/**
 * What moving the block of `key` from `from` to `to` would do.
 * @param input `{ from, to, key, header }` — texts; `to` is `undefined` when the destination does not exist (it then starts from `header`).
 * @returns `{ ok: true, block, key, header, from, to }` (the two new texts) or `{ ok: false, problems }` (bilingual); `ok: true` with `block` empty when the destination already holds the block and the source does not.
 * @es `to` es `undefined` si el destino no existe (entonces parte de `header`).
 */
export function planBlockRoute({ from, to, key, header }) {
  const refuse = (english, spanish) => ({ ok: false, problems: [`${english} @es ${spanish}`] });
  const source = findBlock(from, key);
  const held = to === undefined ? { count: 0 } : findBlock(to, key);

  if (source.count === 0 && held.start !== undefined) return { ok: true, block: [], key, header, from, to };
  if (source.count !== undefined) return refuse(`the rule of "${key}" is not exactly one block of the source (${source.count} opening lines).`, `la regla de "${key}" no es exactamente un bloque del origen (${source.count} líneas de apertura).`);
  if (held.count !== 0) return refuse(`"${key}" is already in the destination.`, `"${key}" ya está en el destino.`);

  const ending = endingOf(from);
  const rest = from.split('\n');
  const after = rest.slice(source.end);
  const kept = [...rest.slice(0, source.start), ...(content(after[0] ?? '') === '' ? after.slice(1) : after)];
  const base = (to ?? header).split('\n');
  const body = [...base.slice(0, base.at(-1) === '' ? -1 : undefined)];
  const joined = [...body, ...(body.length > 0 && content(body.at(-1)) !== '' ? [''] : []), ...source.lines, ''];

  return { ok: true, block: source.lines, key, header, from: kept.join('\n'), to: joined.map((line) => (ending === '\r\n' && !line.endsWith('\r') && line !== '' ? `${line}\r` : line)).join('\n') };
}

/**
 * The proof that a block moved whole and nothing else did.
 * @param input `{ before, after, block, key, header }` — each side `{ from, to }` as texts, `to` `undefined` when absent; `after` is what was
 *   RE-READ from disk; `block` the lines that moved; `header` what a destination that did not exist starts from.
 * @returns `{ ok: true }` or `{ ok: false, deficits }`, each a bilingual sentence.
 * @es `after` es lo que se RELEYÓ de disco; `block` son las líneas que se movieron; `header` es de lo que parte un destino que no existía.
 */
export function provesBlockRoute({ before, after, block, key, header }) {
  const removed = (text) => {
    const found = findBlock(text, key);
    const lines = text.split('\n');

    return found.start === undefined ? lines : [...lines.slice(0, found.start), ...lines.slice(found.end)];
  };
  const flat = (lines) => normalized(lines).join('\n');
  const landed = findBlock(after.to ?? '', key);
  const deficits = [
    ...(landed.lines !== undefined && landed.lines.join('\n') === block.join('\n') ? [] : ['the block is not in the destination as it was. @es el bloque no está en el destino tal cual era.']),
    ...(flat(removed(after.to ?? '')) === flat((before.to ?? header).split('\n')) ? [] : ['the destination holds something else besides the block, or lost something it had. @es el destino tiene algo más que el bloque, o perdió algo que tenía.']),
    ...(findBlock(after.from, key).count === 0 ? [] : ['the block is still in the source. @es el bloque sigue en el origen.']),
    ...(flat(after.from.split('\n')) === flat(removed(before.from)) ? [] : ['the source changed by more than the block. @es el origen cambió más que el bloque.']),
  ];

  return deficits.length === 0 ? { ok: true } : { ok: false, deficits };
}

/**
 * Writes a planned block route, RE-READS both files and proves it, restoring what was there when the proof fails.
 * The plan is proved BEFORE any write, as a lesson route is: a plan that would alter, drop or duplicate the block
 * never reaches the disk. The writes are the caller's (`io`), so a proof can make them lie; the proof after the write
 * is taken on what `readBack` gives.
 * @param input `{ before, plan, io }` — `before` the `{ from, to }` texts as they were (`to` `undefined` when the file did not exist); `plan` from `planBlockRoute`; `io` `{ writeFrom(text), writeTo(text | undefined), readBack() }`.
 * @returns the proof; on `ok: false` both files were restored, or, when `written` is `false`, never touched.
 * @es Escribe una ruta de bloque planeada, RELEE ambos ficheros y la prueba, restaurando lo que había si falla. El
 * plan se prueba ANTES de escribir: un plan que alteraría, perdería o duplicaría el bloque nunca llega al disco.
 */
export function commitBlockRoute({ before, plan, io }) {
  const planned = provesBlockRoute({ before, after: { from: plan.from, to: plan.to }, block: plan.block, key: plan.key, header: plan.header });

  if (!planned.ok) return { ...planned, written: false };

  io.writeTo(plan.to);
  io.writeFrom(plan.from);

  const proof = provesBlockRoute({ before, after: io.readBack(), block: plan.block, key: plan.key, header: plan.header });

  if (!proof.ok) {
    io.writeFrom(before.from);
    io.writeTo(before.to);
  }

  return proof;
}
