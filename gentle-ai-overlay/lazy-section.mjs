/**
 * A LAZY SECTION of CLAUDE.md: a span of lines that gentle-ai renders inside a managed region, and that is
 * loaded only when it is needed. While it is not needed the span lives in a stash file and CLAUDE.md carries
 * a pointer saying exactly when to read the stash; when it is needed, or when that cannot be told, the span
 * is back in CLAUDE.md, byte for byte. Pure: text in, text out, no I/O.
 *
 * A section is declared, never coded (the list is in customizations.mjs):
 *   `name`      its identity in the sentinel;
 *   `start`     the whole line the span opens with (kept in the pointer, so the heading stays);
 *   `end`       the whole line the span ends before (kept as it is, never moved);
 *   `regions`   the managed-region ids that may enclose it, because gentle-ai renamed the orchestrator region
 *               from `sdd-orchestrator` (v2/v3) to `orchestrator` (v4); exactly ONE region carrying one of
 *               those ids must exist, and it must enclose the span;
 *   `witness`   optionally, a whole line of the body: when the start line is gone but this one is still
 *               rendered, upstream renamed the heading and the section is refused, never taken for absent;
 *   `pointer`   `{ en, es? }`, the text that stands in for the span, `{stash}` being the stash path.
 *
 * The span is the lines from `start` up to, not including, `end`. While moved, the span is replaced in place
 * by its start line, a sentinel comment carrying the SHA-256 of the exact bytes moved out
 * (`<!-- owner-overlay:lazy-NAME v1 sha256=HEX -->`) and the pointer. The sentinel is an HTML comment, which
 * the harness strips from the loaded text, and it never contains a gentle-ai marker. Every byte outside the
 * span is left as it was, and the pointer uses the file's own line ending, so restoring the stash gives back
 * the original file. A sentinel of ANOTHER section inside this span is refused: that text is a pointer, and
 * stashing it would lose the section it points to.
 *
 * @es Una SECCIÓN DIFERIDA de CLAUDE.md: un tramo de líneas que gentle-ai genera dentro de una región
 * gestionada y que solo se carga cuando hace falta. Mientras no hace falta, el tramo vive en un fichero de
 * depósito y CLAUDE.md lleva un puntero que dice exactamente cuándo leerlo; cuando hace falta, o no se puede
 * saber, el tramo vuelve a CLAUDE.md, byte a byte. Puro: texto entra, texto sale, sin E/S. Una sección se
 * DECLARA, no se programa (la lista está en customizations.mjs): `name` (su identidad en el centinela),
 * `start` (la línea entera con que abre el tramo; se conserva en el puntero), `end` (la línea entera ante la
 * que termina; no se mueve), `regions` (los ids de región gestionada que pueden contenerla, porque gentle-ai
 * renombró la región orquestadora de `sdd-orchestrator` (v2/v3) a `orchestrator` (v4); debe existir
 * exactamente UNA región con uno de esos ids y debe contener el tramo), `witness` (opcional: una línea
 * entera del cuerpo; si la de inicio desapareció pero esta sigue, upstream renombró el encabezado y la
 * sección se rechaza, nunca se toma por ausente) y `pointer` (`{ en, es? }`, el texto que ocupa el lugar
 * del tramo; `{stash}` es la ruta del depósito). El tramo son las líneas desde `start` hasta, sin incluir,
 * `end`. Mientras está movido, se reemplaza en su sitio por su línea de inicio, un comentario centinela con
 * el SHA-256 de los bytes exactos que salieron y el puntero. El centinela es un comentario HTML, que el
 * harness quita del texto cargado, y nunca contiene un marcador de gentle-ai. Ningún byte fuera del tramo
 * cambia y el puntero usa el fin de línea del propio fichero, así que restaurar el depósito devuelve el
 * original. El centinela de OTRA sección dentro de este tramo se rechaza: ese texto es un puntero, y
 * guardarlo perdería la sección a la que apunta.
 */
import { createHash } from 'node:crypto';
import { parseManagedRegions } from './managed-regions.mjs';
import { lineContent, splitLines } from './text-file.mjs';

const SENTINEL_STEM = '<!-- owner-overlay:lazy-';
const SENTINEL_SUFFIX = ' -->';

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

const sentinelPrefix = (section) => `${SENTINEL_STEM}${section.name} v1 sha256=`;
const refuse = (english, spanish) => ({ refused: `${english} @es ${spanish}` });

/** Character offset and line index of every line whose content is exactly `needle`. @es Desplazamiento e índice de cada línea cuyo contenido es exactamente `needle`. */
function linesEqualTo(text, needle) {
  const found = [];
  let offset = 0;
  splitLines(text).forEach((line, index) => {
    if (lineContent(line) === needle) found.push({ offset, index });
    offset += line.length + 1;
  });
  return found;
}

const notExactlyOne = (needle, count) => refuse(`"${needle}" is not exactly one whole line (${count})`, `"${needle}" no es exactamente una línea completa (${count})`);

/**
 * Where the span is and which form it has.
 * @es Dónde está el tramo y qué forma tiene.
 * @returns {{ form: 'absent' } | { form: 'present'|'moved', start: number, end: number, sha?: string } | { refused: string }}
 */
export function inspectSection(text, section) {
  const starts = linesEqualTo(text, section.start);
  const ends = linesEqualTo(text, section.end);
  const witnessed = section.witness !== undefined && linesEqualTo(text, section.witness).length > 0;
  if (starts.length === 0 && !witnessed) return { form: 'absent' };
  if (starts.length !== 1) return notExactlyOne(section.start, starts.length);
  if (ends.length !== 1) return notExactlyOne(section.end, ends.length);
  const owners = parseManagedRegions(text).regions.filter((region) => section.regions.includes(region.id));
  const named = section.regions.join(' or ');
  if (owners.length !== 1) return refuse(`the region (${named}) is not present exactly once (${owners.length})`, `la región (${named}) no está exactamente una vez (${owners.length})`);
  const [start, end, owner] = [starts[0], ends[0], owners[0]];
  if (!(owner.open < start.index && start.index < end.index && end.index <= owner.close)) {
    return refuse(`the span is not ordered inside the ${owner.id} region`, `el tramo no está ordenado dentro de la región ${owner.id}`);
  }
  const span = splitLines(text.slice(start.offset, end.offset)).map(lineContent);
  if (span.some((line) => line.startsWith(SENTINEL_STEM) && !line.startsWith(sentinelPrefix(section)))) {
    return refuse('the span holds the sentinel of another section', 'el tramo contiene el centinela de otra sección');
  }
  const sentinel = span.find((line) => line.startsWith(sentinelPrefix(section)) && line.endsWith(SENTINEL_SUFFIX));
  if (sentinel === undefined) return { form: 'present', start: start.offset, end: end.offset };
  return { form: 'moved', start: start.offset, end: end.offset, sha: sentinel.slice(sentinelPrefix(section).length, -SENTINEL_SUFFIX.length) };
}

const endingOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

/**
 * The text that stands in for the span: start line, sentinel, and the pointer with its exact triggers.
 * @es El texto que ocupa el lugar del tramo: línea de inicio, centinela y el puntero con sus disparadores exactos.
 */
export function pointerFor(text, section, movedSha, stashLabel) {
  const { en, es } = section.pointer;
  return [
    section.start,
    '',
    `${sentinelPrefix(section)}${movedSha}${SENTINEL_SUFFIX}`,
    en.replaceAll('{stash}', stashLabel),
    ...(es === undefined ? [] : [`@es ${es.replaceAll('{stash}', stashLabel)}`]),
    '',
    '',
  ].join(endingOf(text));
}

/**
 * What CLAUDE.md and the stash must become. `keepLoaded` is true when the section may be needed or the mode
 * that decides it could not be read: the span is then restored, never guessed. A moved span whose stash does
 * not hash to its sentinel is refused, and `gentle-ai sync` regenerates the canonical text.
 * @es En qué deben convertirse CLAUDE.md y el depósito. `keepLoaded` es verdadero cuando la sección puede
 * hacer falta o no se pudo leer el modo que lo decide: el tramo se restaura, nunca se adivina. Un tramo
 * movido cuyo depósito no coincide con su centinela se rechaza, y `gentle-ai sync` regenera el texto canónico.
 * `form` is the span's form BEFORE reconciling. @es `form` es la forma del tramo ANTES de reconciliar.
 * @returns {{ outcome: 'moved'|'restored'|'unchanged', form: 'absent'|'present'|'moved', text: string, stash: string|null } | { refused: string }}
 */
export function reconcileSection(text, section, { keepLoaded, stash, stashLabel }) {
  const found = inspectSection(text, section);
  if (found.refused !== undefined) return found;
  const { form, start, end } = found;
  if (form === 'absent') return { outcome: 'unchanged', form, text, stash };
  if (form === 'present') {
    if (keepLoaded) return { outcome: 'unchanged', form, text, stash };
    const moved = text.slice(start, end);
    return { outcome: 'moved', form, text: text.slice(0, start) + pointerFor(text, section, sha256(moved), stashLabel) + text.slice(end), stash: moved };
  }
  if (stash === null || sha256(stash) !== found.sha) {
    return refuse('the stash is missing or does not match the sentinel; run `gentle-ai sync`', 'el depósito falta o no coincide con el centinela; ejecutar `gentle-ai sync`');
  }
  if (!keepLoaded) return { outcome: 'unchanged', form, text, stash };
  return { outcome: 'restored', form, text: text.slice(0, start) + stash + text.slice(end), stash };
}
