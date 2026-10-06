/**
 * Moving ledger lines from the loaded home ledger to where they belong (`ledger-routes.mjs`), and the PROOF that
 * nothing was lost. Pure: lines in, lines out, no I/O; the caller writes and re-reads.
 *
 * A move changes WHERE a line lives and never WHAT it says: every moved line is byte for byte the line it was,
 * its `<!--fc:KEY#N-->` marker included, so the recurrence counter and the key survive. The one thing a move of a
 * lesson into an area may change is the scope tag at the start of the line (`[global]` becomes `[<area>]`), and
 * the proof is told which lines were so renamed, so it cannot be satisfied by any other change. What a plan
 * refuses is refused whole, never half-done: a stub without a readable marker, a lesson that is not where it can
 * be moved from, and a key that the destination already holds (writing it again would make one lesson two lines,
 * and `capture` folds a recurrence into only one).
 *
 * The proof (`provesRoute`) compares the ledgers as they were with the ledgers as they were RE-READ from disk:
 * the entry lines of both together are exactly the same multiset, the lines the source keeps are the ones it
 * had, in the same order, and its other text (header, separators) is untouched.
 *
 * @es Mover líneas del ledger cargado del home a donde les corresponde, y la PRUEBA de que no se perdió nada.
 * Pura: entran líneas, salen líneas, sin E/S. Un movimiento cambia DÓNDE vive una línea y nunca QUÉ dice:
 * cada línea movida es, byte a byte, la que era, con su marcador `<!--fc:CLAVE#N-->`, así que el contador y
 * la clave sobreviven. Lo único que un movimiento de una lección a un área puede cambiar es la etiqueta de
 * alcance al inicio de la línea (`[global]` pasa a `[<área>]`), y a la prueba se le dice qué líneas se
 * renombraron así, para que ningún otro cambio la satisfaga. Lo que el plan rechaza se rechaza entero: un
 * muñón sin marcador legible, una lección que no está donde se puede mover, y una clave que el destino ya
 * tiene. La prueba compara los ledgers como eran con los ledgers RELEÍDOS de disco.
 */

import { evidenceKeyOf, parseEntry, readMarker, splitRule } from './ledger-line.mjs';
import { areaScopes, isAreaScope } from './ledger-routes.mjs';
import { isPromotedStub } from './promoted-recurrence.mjs';
import { GLOBAL_SCOPE } from './project.mjs';

const ENTRY_PREFIX = '- [';
const SEPARATOR = '---';

const isEntry = (line) => line.startsWith(ENTRY_PREFIX);

/** The lines without the blank ones at the end. @es Las líneas sin las vacías del final. */
function withoutTrailingBlanks(lines) {
  const kept = [...lines];

  while (kept.length > 0 && kept.at(-1) === '') kept.pop();

  return kept;
}

/**
 * `destination` (or `header`, when the file does not exist) followed by `added`: a blank line after the header's
 * separator, and a final newline.
 * @es `destination` (o `header` si el fichero no existe) seguido de `added`: una línea en blanco tras el separador del encabezado y un salto de línea final.
 */
function appendedTo(destination, header, added) {
  const base = withoutTrailingBlanks(destination ?? header.split('\n'));

  return [...base, ...(base.at(-1) === SEPARATOR ? [''] : []), ...added, ''];
}

/**
 * What moving every promoted stub of `source` into `destination` would do.
 * @param input `{ source, destination, header }` — line arrays; `destination` is `undefined` when the file does not exist (then it starts from `header`).
 * @returns `{ ok: true, moved: [{ key, line }], source, destination, renamed }` or `{ ok: false, problems }` (bilingual); `moved` is empty when there is nothing to move.
 * @es `destination` es `undefined` si el fichero no existe (entonces parte de `header`).
 */
export function planStubRoute({ source, destination, header }) {
  const held = new Set((destination ?? []).map((line) => readMarker(line)?.key).filter((key) => key !== undefined));
  const moved = [];
  const problems = [];

  for (const line of source) {
    if (!isPromotedStub(line)) continue;

    const key = readMarker(line)?.key;

    if (key === undefined) problems.push(`a promoted stub has no readable marker, so it cannot be moved: ${line.slice(0, 80)} @es un muñón promovido no tiene marcador legible, así que no se puede mover: ${line.slice(0, 80)}`);
    else if (held.has(key) || moved.some((one) => one.key === key)) problems.push(`"${key}" is already in the destination, so moving it would make one lesson two lines. @es "${key}" ya está en el destino, así que moverla haría de una lección dos líneas.`);
    else moved.push({ key, line });
  }

  if (problems.length > 0) return { ok: false, problems };
  if (moved.length === 0) return { ok: true, moved, source, destination: destination ?? header.split('\n'), renamed: new Map() };

  return { ok: true, moved, source: source.filter((line) => !isPromotedStub(line)), destination: appendedTo(destination, header, moved.map((one) => one.line)), renamed: new Map() };
}

/**
 * The key a ledger line carries: its marker's, or, for a line written before markers existed, the key of its
 * evidence pointer. @es La clave que lleva una línea del ledger: la de su marcador o, en una línea anterior a los marcadores, la de su puntero de evidencia.
 */
function keyOfLine(line) {
  const marked = readMarker(line)?.key;

  if (marked !== undefined) return marked;

  const entry = parseEntry(line);
  const split = entry.ok ? splitRule(entry.body) : undefined;

  return split?.ok ? evidenceKeyOf(split.rule) : undefined;
}

/**
 * Where the lesson `key` is: the ledger and the index of its line, or `undefined`.
 * @param ledgers `readLedgers` objects.
 * @es Dónde está la lección `key`: el ledger y el índice de su línea, o `undefined`.
 */
export function locateLesson(ledgers, key) {
  for (const ledger of ledgers) {
    const index = (ledger.lines ?? []).findIndex((line) => isEntry(line) && keyOfLine(line) === key);

    if (index !== -1) return { ledger, index, line: ledger.lines[index] };
  }

  return undefined;
}

/**
 * What moving the global lesson `found` into the area `area` would do.
 * @param input `{ found, area, key, destination, header }` — `found` from `locateLesson` (or `undefined`); `destination` the area ledger's lines, `undefined` when its file does not exist.
 * @returns `{ ok: true, moved: [{ key, line }], source, destination, renamed }` (`moved` empty when the lesson is already in the area) or `{ ok: false, problems }`.
 * @es `found` sale de `locateLesson` (o es `undefined`); `destination` son las líneas del ledger del área, `undefined` si su fichero no existe.
 */
export function planLessonRoute({ found, area, key, destination, header }) {
  const refuse = (english, spanish) => ({ ok: false, problems: [`${english} @es ${spanish}`] });
  const prefix = `${ENTRY_PREFIX}${GLOBAL_SCOPE}] `;

  if (!isAreaScope(area)) return refuse(`"${String(area)}" is not an area (the areas are ${areaScopes().join(', ')}).`, `"${String(area)}" no es un área (las áreas son ${areaScopes().join(', ')}).`);
  if (found === undefined) return refuse(`no ledger holds the lesson "${key}".`, `ningún ledger tiene la lección "${key}".`);
  if (found.ledger.scope === area) return { ok: true, moved: [], source: found.ledger.lines, destination: destination ?? header.split('\n'), renamed: new Map() };
  if (found.ledger.scope !== GLOBAL_SCOPE || !found.line.startsWith(prefix)) return refuse(`"${key}" is a lesson of scope "${found.ledger.scope}"; only a [global] lesson line moves to an area.`, `"${key}" es una lección del alcance "${found.ledger.scope}"; solo una línea de lección [global] se mueve a un área.`);
  if ((destination ?? []).some((line) => isEntry(line) && keyOfLine(line) === key)) return refuse(`"${key}" is already in the destination, so moving it would make one lesson two lines.`, `"${key}" ya está en el destino, así que moverla haría de una lección dos líneas.`);

  const line = `${ENTRY_PREFIX}${area}] ${found.line.slice(prefix.length)}`;

  return { ok: true, moved: [{ key, line }], source: found.ledger.lines.filter((_, index) => index !== found.index), destination: appendedTo(destination, header, [line]), renamed: new Map([[found.line, line]]) };
}

/** How many times each line occurs. @es Cuántas veces aparece cada línea. */
function tally(lines) {
  const counts = new Map();

  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);

  return counts;
}

/** The lines whose count differs between two tallies, named. @es Las líneas cuyo recuento difiere, nombradas. */
function difference(from, to) {
  return [...from].filter(([line, count]) => (to.get(line) ?? 0) < count).map(([line]) => line.slice(0, 90));
}

/**
 * The proof that a route lost and invented nothing.
 * @param input `{ before, after, renamed }` — each side `{ source, destination }` as line arrays; `after` is what was RE-READ from disk;
 *   `renamed` maps a line of `before` to the line it became (the scope tag of a lesson moved to an area), empty by default.
 * @returns `{ ok: true }` or `{ ok: false, deficits }`, each deficit a bilingual sentence naming what is wrong.
 * @es `after` es lo que se RELEYÓ de disco; `renamed` mapea una línea de `before` a la que pasó a ser.
 */
export function provesRoute({ before, after, renamed = new Map() }) {
  const entries = (side) => [...side.source, ...(side.destination ?? [])].filter(isEntry);
  const expected = entries(before).map((line) => renamed.get(line) ?? line);
  const lost = difference(tally(expected), tally(entries(after)));
  const invented = difference(tally(entries(after)), tally(expected));
  const sourceEntriesBefore = before.source.filter((line) => isEntry(line) && after.source.includes(line));
  const sourceEntriesAfter = after.source.filter(isEntry);
  const deficits = [
    ...lost.map((line) => `a line was lost: ${line} @es se perdió una línea: ${line}`),
    ...invented.map((line) => `a line appeared that was not there: ${line} @es apareció una línea que no estaba: ${line}`),
    ...(sourceEntriesBefore.join('\n') === sourceEntriesAfter.join('\n') ? [] : ['the lines the source kept changed or changed order. @es las líneas que conservó el origen cambiaron o cambiaron de orden.']),
    ...(before.source.filter((line) => !isEntry(line)).join('\n') === after.source.filter((line) => !isEntry(line)).join('\n') ? [] : ['the text of the source that is not a lesson changed. @es cambió el texto del origen que no es una lección.']),
    ...((before.destination ?? []).filter((line) => !isEntry(line) && line !== '').every((line) => (after.destination ?? []).includes(line)) ? [] : ['the text of the destination that is not a lesson was lost. @es se perdió el texto del destino que no es una lección.']),
  ];

  return deficits.length === 0 ? { ok: true } : { ok: false, deficits };
}

/**
 * Writes a planned route, RE-READS both files and proves it, restoring what was there when the proof fails.
 * The writes are the caller's (`io`), so a proof can make them lie: the proof is taken on what `readBack` gives,
 * never on what was planned, so it cannot be satisfied by the write it checks.
 * @param input `{ before, plan, io }` — `before` the `{ source, destination }` lines as they were; `plan` from a `plan…Route`;
 *   `io` `{ writeSource(lines), writeDestination(lines | undefined), readBack() }` (`undefined` removes the destination file).
 * @returns the proof: `{ ok: true }` or `{ ok: false, deficits }`; on `ok: false` both files were restored.
 * @es Escribe una ruta planeada, RELEE ambos ficheros y la prueba, restaurando lo que había si la prueba falla.
 * Las escrituras son del llamante (`io`), para que una prueba pueda hacerlas mentir: la prueba se toma sobre lo
 * que da `readBack`, nunca sobre lo planeado.
 */
export function commitRoute({ before, plan, io }) {
  io.writeDestination(plan.destination);
  io.writeSource(plan.source);

  const proof = provesRoute({ before, after: io.readBack(), renamed: plan.renamed });

  if (!proof.ok) {
    io.writeSource(before.source);
    io.writeDestination(before.destination);
  }

  return proof;
}

/**
 * What the command says and exits with once the commit is proved or not. A route that was not proved is never
 * reported as done: the files were restored, and the exit says so.
 * @param input `{ proof, count }` — the proof of `commitRoute`, and how many lines were moved.
 * @returns `{ status: 0, say: [id, params] }` when proved, `{ status: 1, complain: id, deficits }` when not.
 * @es Lo que dice el comando y con qué sale una vez probado o no el commit. Una ruta no probada nunca se informa como hecha.
 */
export function routeOutcome({ proof, count }) {
  if (proof.ok) return { status: 0, say: ['route.done', { count }] };

  return { status: 1, complain: 'route.proofFailed', deficits: proof.deficits };
}

/**
 * What bringing the header of a ledger up to the declared one would do. A ledger's header is everything before its
 * first entry line: tool-owned text (`HEADER` in `ledgers.mjs`, or the area's), never a lesson. The entries and
 * whatever stands between them are untouched; the header becomes the declared one, a blank line after it.
 * @param input `{ lines, header }` — the ledger's lines and the declared header text.
 * @returns `{ ok: true, changed, lines }`; `changed` is false when the header already is the declared one.
 * @es Lo que haría poner el encabezado de un ledger al día con el declarado. El encabezado de un ledger es todo lo
 * que hay antes de su primera línea de entrada: texto de la herramienta, nunca una lección. Las entradas y lo que
 * haya entre ellas no se tocan; el encabezado pasa a ser el declarado, con una línea en blanco detrás.
 */
export function planHeaderRoute({ lines, header }) {
  const first = lines.findIndex(isEntry);
  const next = first === -1 ? header.split('\n') : [...withoutTrailingBlanks(header.split('\n')), '', ...lines.slice(first)];

  return { ok: true, changed: next.join('\n') !== lines.join('\n'), lines: next };
}

/**
 * The proof that a header was changed and no lesson was.
 * @param input `{ before, after, header }` — the ledger's lines as they were and as RE-READ from disk; `header` the declared text.
 * @returns `{ ok: true }` or `{ ok: false, deficits }` (bilingual).
 * @es `after` es lo que se RELEYÓ de disco.
 */
export function provesHeaderRoute({ before, after, header }) {
  const declared = withoutTrailingBlanks(header.split('\n'));
  const deficits = [
    ...(before.filter(isEntry).join('\n') === after.filter(isEntry).join('\n') ? [] : ['the lessons of the ledger changed, were lost or changed order. @es las lecciones del ledger cambiaron, se perdieron o cambiaron de orden.']),
    ...(after.slice(0, declared.length).join('\n') === declared.join('\n') ? [] : ['the ledger does not begin with the declared header. @es el ledger no empieza con el encabezado declarado.']),
    ...(before.slice(Math.max(before.findIndex(isEntry), 0)).filter((line) => !isEntry(line)).join('\n') === after.slice(Math.max(after.findIndex(isEntry), 0)).filter((line) => !isEntry(line)).join('\n') ? [] : ['the text between the lessons changed. @es cambió el texto entre las lecciones.']),
  ];

  return deficits.length === 0 ? { ok: true } : { ok: false, deficits };
}

/**
 * Writes a ledger with its declared header, RE-READS it and proves it, restoring the ledger as it was when the proof fails.
 * @param input `{ before, plan, header, io }` — `io` is `{ write(lines), readBack() }`.
 * @returns the proof.
 * @es Escribe un ledger con su encabezado declarado, lo RELEE y lo prueba, restaurando el ledger si la prueba falla.
 */
export function commitHeaderRoute({ before, plan, header, io }) {
  io.write(plan.lines);

  const proof = provesHeaderRoute({ before, after: io.readBack(), header });

  if (!proof.ok) io.write(before);

  return proof;
}
