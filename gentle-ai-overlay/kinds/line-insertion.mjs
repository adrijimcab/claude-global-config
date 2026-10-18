/**
 * Invariant: one whole line of ours stands directly after one anchor line of a gentle-ai-managed file.
 * The anchor is a sentence upstream emits; apply inserts our line right below it only when the anchor
 * occurs as exactly one whole line and our line is absent, so an upstream that rewords the anchor is
 * reported as broken and never skipped or guessed at. Every other byte of the file, and the line
 * endings (LF or CRLF), stay as they were.
 *
 * SYNC-SAFE, and why: `gentle-ai sync` rewrites the file from its asset, which drops our line; it can
 * only UNDO this customization, never erase anything it owns. The next apply inserts the line again, so
 * no state of this invariant is a reason to refuse a sync.
 *
 * Inside the persona region of CLAUDE.md the persona-region invariant would call our line foreign text;
 * its customization lists the line in `ownedLines`, and this kind is what guards that line.
 *
 * @es Invariante: una línea nuestra entera está justo debajo de una línea ancla de un fichero gestionado
 * por gentle-ai. El ancla es una frase que emite upstream; apply inserta nuestra línea debajo solo cuando
 * el ancla aparece como UNA línea entera y la nuestra falta, así que si upstream reescribe el ancla se
 * informa como broken, nunca se salta ni se adivina. Cualquier otro byte del fichero y los finales de
 * línea (LF o CRLF) quedan como estaban.
 * SEGURO ANTE SYNC: `gentle-ai sync` reescribe el fichero desde su asset y quita nuestra línea; solo puede
 * DESHACER esta personalización, nunca borrar nada suyo. El siguiente apply vuelve a insertarla, así que
 * ningún estado de esta invariante es motivo para rechazar un sync.
 * Dentro de la región persona de CLAUDE.md la invariante de persona vería nuestra línea como texto ajeno;
 * su personalización la lista en `ownedLines`, y este tipo es quien vigila esa línea.
 */
import path from 'node:path';
import { joinLines, lineContent, readTextOrNull, splitLines, withEndingOf, writeTextAtomic } from '../text-file.mjs';

/** Indexes of the lines whose content is exactly `sentence`. @es Índices de las líneas cuyo contenido es exactamente `sentence`. */
const linesEqualTo = (lines, sentence) => lines.flatMap((line, index) => (lineContent(line) === sentence ? [index] : []));

/**
 * Where the line stands: `held` (ours, once, right below the one anchor), `insertable` (one anchor, ours
 * absent), or a refusal naming why neither is true. @es Dónde está la línea: `held`, `insertable` o un
 * rechazo que nombra por qué no es ninguna.
 */
function stateOf(customization, context) {
  const text = readTextOrNull(path.join(context.home, customization.file));
  if (text === null) return { refused: 'file does not exist @es el fichero no existe' };
  const lines = splitLines(text);
  const anchors = linesEqualTo(lines, customization.after);
  const ours = linesEqualTo(lines, customization.line);
  if (anchors.length === 0 && ours.length === 0) {
    return { refused: 'anchor not found: no whole line equals the upstream sentence, so upstream may have reworded it; review it and update `after` @es ancla no encontrada: ninguna línea entera iguala la frase de upstream, quizá la reescribió; revisarla y actualizar `after`' };
  }
  if (anchors.length === 1 && ours.length === 0) return { form: 'insertable', lines, index: anchors[0] };
  if (anchors.length === 1 && ours.length === 1 && ours[0] === anchors[0] + 1) return { form: 'held' };
  return { refused: `the layout is ambiguous (anchor ${anchors.length}x, ours ${ours.length}x as whole lines, ours must be the single line right below the single anchor); fix the file by hand @es la disposición es ambigua (ancla ${anchors.length} veces, la nuestra ${ours.length}; la nuestra debe ser la única línea justo bajo el único ancla); corregir el fichero a mano` };
}

export const anchoredLineInsertion = {
  syncSafe: true,
  remedy: 'Run the overlay apply to put our line back; when upstream reworded the anchor, edit the file by hand and update `after` in customizations.mjs. @es Ejecutar el apply del overlay para devolver nuestra línea; si upstream reescribió el ancla, editar el fichero a mano y actualizar `after` en customizations.mjs.',

  evaluate(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { status: 'broken', detail: state.refused };
    if (state.form === 'held') return { status: 'held', detail: 'our line is in place below its anchor @es nuestra línea está en su sitio bajo su ancla' };
    return { status: 'broken', detail: 'our line is missing below its anchor; apply inserts it @es falta nuestra línea bajo su ancla; apply la inserta' };
  },

  plan(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { outcome: 'refused', detail: state.refused };
    if (state.form === 'held') return { outcome: 'unchanged', detail: 'our line is in place @es nuestra línea está en su sitio' };
    return { outcome: 'would-insert', detail: `our line would go below line ${state.index + 1} @es nuestra línea iría bajo la línea ${state.index + 1}` };
  },

  apply(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { outcome: 'refused', detail: state.refused };
    if (state.form === 'held') return { outcome: 'unchanged', detail: 'our line is in place @es nuestra línea está en su sitio' };
    const lines = [...state.lines];
    lines.splice(state.index + 1, 0, withEndingOf(lines[state.index], customization.line));
    writeTextAtomic(path.join(context.home, customization.file), joinLines(lines));
    return { outcome: 'applied', detail: `our line now stands below line ${state.index + 1} @es nuestra línea está ahora bajo la línea ${state.index + 1}` };
  },
};
