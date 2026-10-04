/**
 * Invariant: one whole line of a gentle-ai-managed file reads as OUR sentence instead of the upstream
 * one. The upstream sentence is the anchor: apply swaps it for ours only when it occurs as exactly one
 * whole line, so an upstream that rewords the sentence is reported as broken and never skipped or
 * guessed at. Every other byte of the file, and the line's own ending (LF or CRLF), stays as it was.
 *
 * SYNC-SAFE, and why: `gentle-ai sync` rewrites the file from its asset, which puts the upstream
 * sentence back; it can only UNDO this customization, never erase anything it owns. The next apply
 * swaps the line again, so no state of this invariant is a reason to refuse a sync.
 *
 * @es Invariante: una línea entera de un fichero gestionado por gentle-ai dice NUESTRA frase en vez de
 * la de upstream. La frase de upstream es el ancla: apply la cambia por la nuestra solo cuando aparece
 * como UNA línea entera, así que si upstream la reescribe se informa como broken, nunca se salta ni se
 * adivina. Cualquier otro byte del fichero, y el final de la propia línea (LF o CRLF), queda como estaba.
 * SEGURO ANTE SYNC: `gentle-ai sync` reescribe el fichero desde su asset y devuelve la frase de upstream;
 * solo puede DESHACER esta personalización, nunca borrar nada suyo. El siguiente apply vuelve a cambiar
 * la línea, así que ningún estado de esta invariante es motivo para rechazar un sync.
 */
import path from 'node:path';
import { joinLines, lineContent, readTextOrNull, splitLines, withEndingOf, writeTextAtomic } from '../text-file.mjs';

/** Indexes of the lines whose content is exactly `sentence`. @es Índices de las líneas cuyo contenido es exactamente `sentence`. */
const linesEqualTo = (lines, sentence) => lines.flatMap((line, index) => (lineContent(line) === sentence ? [index] : []));

/**
 * Where the sentence stands: `held` (ours, once, upstream gone), `replaceable` (upstream, once, ours
 * absent), or a refusal naming why neither is true. @es Dónde está la frase: `held`, `replaceable` o un
 * rechazo que nombra por qué no es ninguna.
 */
function stateOf(customization, context) {
  const text = readTextOrNull(path.join(context.home, customization.file));
  if (text === null) return { refused: 'file does not exist @es el fichero no existe' };
  const lines = splitLines(text);
  const upstream = linesEqualTo(lines, customization.upstream);
  const replaced = linesEqualTo(lines, customization.replacement);
  if (upstream.length === 0 && replaced.length === 1) return { form: 'held' };
  if (upstream.length === 1 && replaced.length === 0) return { form: 'replaceable', lines, index: upstream[0] };
  if (upstream.length === 0 && replaced.length === 0) {
    return { refused: 'anchor not found: no whole line equals the upstream sentence, so upstream may have reworded it; review it and update `upstream` @es ancla no encontrada: ninguna línea entera iguala la frase de upstream, quizá la reescribió; revisarla y actualizar `upstream`' };
  }
  return { refused: `the sentence is ambiguous (upstream ${upstream.length}x, ours ${replaced.length}x as whole lines); fix the file by hand @es la frase es ambigua (upstream ${upstream.length} veces, la nuestra ${replaced.length}); corregir el fichero a mano` };
}

export const anchoredLineReplacement = {
  syncSafe: true,
  remedy: 'Run the overlay apply to put our sentence back; when upstream reworded it, edit the file by hand and update `upstream` in customizations.mjs. @es Ejecutar el apply del overlay para devolver nuestra frase; si upstream la reescribió, editar el fichero a mano y actualizar `upstream` en customizations.mjs.',

  evaluate(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { status: 'broken', detail: state.refused };
    if (state.form === 'held') return { status: 'held', detail: 'our sentence is in place @es nuestra frase está en su sitio' };
    return { status: 'broken', detail: 'the upstream sentence is in place; apply swaps it for ours @es la frase de upstream está en su sitio; apply la cambia por la nuestra' };
  },

  plan(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { outcome: 'refused', detail: state.refused };
    if (state.form === 'held') return { outcome: 'unchanged', detail: 'our sentence is in place @es nuestra frase está en su sitio' };
    return { outcome: 'would-replace', detail: `line ${state.index + 1} would carry our sentence @es la línea ${state.index + 1} llevaría nuestra frase` };
  },

  apply(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { outcome: 'refused', detail: state.refused };
    if (state.form === 'held') return { outcome: 'unchanged', detail: 'our sentence is in place @es nuestra frase está en su sitio' };
    const lines = [...state.lines];
    lines[state.index] = withEndingOf(lines[state.index], customization.replacement);
    writeTextAtomic(path.join(context.home, customization.file), joinLines(lines));
    return { outcome: 'applied', detail: `line ${state.index + 1} now carries our sentence @es la línea ${state.index + 1} ahora lleva nuestra frase` };
  },
};
