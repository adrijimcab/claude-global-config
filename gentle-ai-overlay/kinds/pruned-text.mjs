/**
 * Invariant: a block of whole lines that `gentle-ai sync` emits stays PRUNED (removed, or replaced by a
 * condensed version) in a gentle-ai-managed file. The owner prunes text that sync keeps re-adding; this
 * kind puts the pruning back after every sync, and reports when sync has put the text back.
 *
 * The entry names three things, all exact whole lines: `before` and `after`, two lines that sync emits
 * and that stay, exactly once each, around the site; and `block`, the lines sync emits between them
 * (`replacement` is the condensed version, absent when the block is simply removed). Whatever stands
 * between `before` and `after` is then one of exactly three things:
 *   - the block   -> broken: sync put it back; apply prunes it again;
 *   - the pruned form (the replacement, or nothing) -> held;
 *   - anything else -> broken and REFUSED: upstream changed what it emits, and a human re-reviews the
 *     pruning. Never a silent no-op (a block that no longer matches would read as "pruned"), never a
 *     fuzzy edit (a range that deleted whatever lies between two anchors would delete text nobody read).
 * The anchors are what make "the block is absent" distinguishable from "the block was reworded".
 *
 * SYNC-SAFE, and why: `gentle-ai sync` rewrites the managed region from its asset, which puts the block
 * back; it can only UNDO this pruning, never erase anything it owns. The next apply prunes again, so no
 * state of this invariant is a reason to refuse a sync. Do not prune inside the persona region: the
 * `persona-region-matches-upstream` kind requires that region to equal upstream, byte for byte.
 *
 * @es Invariante: un bloque de líneas enteras que `gentle-ai sync` emite sigue PODADO (quitado, o
 * reemplazado por una versión condensada) en un fichero gestionado por gentle-ai. El dueño poda texto que
 * sync vuelve a añadir; este tipo devuelve la poda tras cada sync e informa cuando sync devolvió el texto.
 * La entrada nombra tres cosas, todas líneas enteras exactas: `before` y `after`, dos líneas que sync emite
 * y que se quedan, exactamente una vez cada una, alrededor del sitio; y `block`, las líneas que sync emite
 * entre ellas (`replacement` es la versión condensada, ausente cuando el bloque simplemente se quita).
 * Lo que haya entre `before` y `after` es entonces una de exactamente tres cosas: el bloque (broken: sync
 * lo devolvió; apply lo vuelve a podar), la forma podada (el reemplazo, o nada: held), o cualquier otra
 * cosa (broken y RECHAZADO: upstream cambió lo que emite y una persona revisa de nuevo la poda). Nunca un
 * no-op silencioso (un bloque que ya no coincide pasaría por «podado»), nunca una edición difusa (un rango
 * que borrara lo que haya entre dos anclajes borraría texto que nadie leyó). Los anclajes son lo que
 * distingue «el bloque está ausente» de «el bloque fue reescrito».
 * SEGURO ANTE SYNC: `gentle-ai sync` reescribe la región gestionada desde su asset y devuelve el bloque;
 * solo puede DESHACER esta poda, nunca borrar nada suyo. El siguiente apply vuelve a podar, así que ningún
 * estado de esta invariante es motivo para rechazar un sync. No podar dentro de la región persona: el tipo
 * `persona-region-matches-upstream` exige que esa región sea igual a upstream, byte a byte.
 */
import path from 'node:path';
import { joinLines, lineContent, readTextOrNull, splitLines, withEndingOf, writeTextAtomic } from '../text-file.mjs';

const UPSTREAM_CHANGED = 'upstream changed what it emits, re-review this pruning @es upstream cambió lo que emite, revisar de nuevo esta poda';

const sameLines = (left, right) => left.length === right.length && left.every((line, index) => line === right[index]);

/** The configuration mistakes that make an entry unable to decide anything. @es Los errores de configuración que impiden decidir. */
function assertWellFormed(customization) {
  const { id, before, after, block, replacement } = customization;
  const fail = (why) => {
    throw new Error(`customization "${id}" (pruned-text-stays-pruned) is malformed: ${why}`);
  };
  const isAnchor = (value) => typeof value === 'string' && value.trim() !== '' && !value.includes('\n');
  if (!isAnchor(before)) fail('`before` must be one non-blank line');
  if (!isAnchor(after)) fail('`after` must be one non-blank line');
  if (!Array.isArray(block) || !block.some((line) => line.trim() !== '')) fail('`block` must be an array of lines with some text in it');
  if (replacement !== undefined && !Array.isArray(replacement)) fail('`replacement` must be an array of lines');
  if (replacement !== undefined && sameLines(replacement, block)) fail('`replacement` equals `block`, so pruning would change nothing');
}

const indexesOf = (contents, line) => contents.flatMap((content, index) => (content === line ? [index] : []));

/** Why an anchor cannot place the site, or the one index where it stands. @es Por qué un anclaje no ubica el sitio, o el único índice donde está. */
function anchorAt(contents, label, line) {
  const at = indexesOf(contents, line);
  if (at.length === 1) return { index: at[0] };
  const why = at.length === 0 ? `anchor not found: no whole line equals the \`${label}\` anchor` : `anchor ambiguous: the \`${label}\` anchor is ${at.length} whole lines (${at.map((index) => index + 1).join(', ')})`;
  return { refused: `${why}; ${UPSTREAM_CHANGED}` };
}

/**
 * Where the site stands: `held` (pruned), `prunable` (the block is there), or a refusal naming why neither is
 * true. @es Dónde está el sitio: `held` (podado), `prunable` (el bloque está) o un rechazo que nombra por
 * qué no es ninguna.
 */
function stateOf(customization, context) {
  assertWellFormed(customization);
  const text = readTextOrNull(path.join(context.home, customization.file));
  if (text === null) return { refused: 'file does not exist @es el fichero no existe' };
  const lines = splitLines(text);
  const contents = lines.map(lineContent);
  const before = anchorAt(contents, 'before', customization.before);
  const after = anchorAt(contents, 'after', customization.after);
  if (before.refused !== undefined) return { refused: before.refused };
  if (after.refused !== undefined) return { refused: after.refused };
  if (after.index <= before.index) return { refused: `anchors out of order: \`after\` (line ${after.index + 1}) does not follow \`before\` (line ${before.index + 1}); ${UPSTREAM_CHANGED}` };
  const between = contents.slice(before.index + 1, after.index);
  if (sameLines(between, customization.block)) return { form: 'prunable', lines, before: before.index, after: after.index };
  if (sameLines(between, customization.replacement ?? [])) return { form: 'held' };
  return { refused: `the ${between.length} line(s) between the anchors (lines ${before.index + 2}-${after.index}) are neither the block, nor its pruned form; ${UPSTREAM_CHANGED}` };
}

const condensing = (customization) => customization.replacement !== undefined;

const HELD_DETAIL = 'the block stays pruned @es el bloque sigue podado';

export const prunedTextStaysPruned = {
  syncSafe: true,
  remedy: 'Run the overlay apply to prune the block again; when upstream changed it, review the new text and update `block`, `before` and `after` in customizations.mjs. @es Ejecutar el apply del overlay para podar de nuevo el bloque; si upstream lo cambió, revisar el texto nuevo y actualizar `block`, `before` y `after` en customizations.mjs.',

  evaluate(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { status: 'broken', detail: state.refused };
    if (state.form === 'held') return { status: 'held', detail: HELD_DETAIL };
    return { status: 'broken', detail: 'sync put the pruned block back; apply prunes it again @es sync devolvió el bloque podado; apply lo poda de nuevo' };
  },

  plan(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { outcome: 'refused', detail: state.refused };
    if (state.form === 'held') return { outcome: 'unchanged', detail: HELD_DETAIL };
    const count = state.after - state.before - 1;
    return condensing(customization)
      ? { outcome: 'would-condense', detail: `${count} line(s) would be condensed @es ${count} línea(s) se condensarían` }
      : { outcome: 'would-prune', detail: `${count} line(s) would be removed @es se quitarían ${count} línea(s)` };
  },

  apply(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { outcome: 'refused', detail: state.refused };
    if (state.form === 'held') return { outcome: 'unchanged', detail: HELD_DETAIL };
    const kept = (customization.replacement ?? []).map((line) => withEndingOf(state.lines[state.before], line));
    const lines = [...state.lines.slice(0, state.before + 1), ...kept, ...state.lines.slice(state.after)];
    writeTextAtomic(path.join(context.home, customization.file), joinLines(lines));
    const removed = state.after - state.before - 1;
    return { outcome: 'applied', detail: `${removed} line(s) ${condensing(customization) ? `condensed to ${kept.length}` : 'removed'} @es ${removed} línea(s) ${condensing(customization) ? `condensadas a ${kept.length}` : 'quitadas'}` };
  },
};
