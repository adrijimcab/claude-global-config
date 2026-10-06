/**
 * Re-applying the sync-safe customizations from a hook, and what the hook then says. Every customization
 * whose kind `gentle-ai sync` can only UNDO (never erase) is byte-verified and applied by itself: the lazy
 * sections, the pruned text, the line replacement. A customization that sync can ERASE (a tool grant in an
 * agent file, owner text inside a region) keeps its manual `apply.mjs`: re-applying it needs a person.
 *
 * A restored lazy section means its text is needed while this session may hold only the pointer, so the
 * model is told to read the stash now (the stash is kept after a restore). A move, a pruning and a refusal
 * are told to the user. Nothing is said when nothing changed.
 *
 * @es Reaplicar las personalizaciones seguras ante sync desde un hook, y lo que el hook dice después. Toda
 * personalización cuyo tipo `gentle-ai sync` solo puede DESHACER (nunca borrar) está verificada byte a byte y
 * se aplica sola: las secciones diferidas, el texto podado, el reemplazo de línea. La que sync puede BORRAR
 * (una concesión de herramienta en un fichero de agente, texto del dueño dentro de una región) conserva su
 * `apply.mjs` manual: reaplicarla necesita a una persona. Una sección diferida restaurada significa que su
 * texto hace falta mientras esta sesión quizá solo tiene el puntero, así que se le indica al modelo que lea
 * el depósito ya (el depósito se conserva tras restaurar). Un movimiento, una poda y un rechazo se le
 * informan al usuario. Si nada cambió, no se dice nada.
 */
import { CUSTOMIZATIONS } from './customizations.mjs';
import { KINDS, applyAll, syncSafeOnly } from './invariants.mjs';

const PREFIX = '[gentle-ai overlay]';

/** What one apply outcome tells the user and, for a restored section, the model. @es Qué le dice al usuario un resultado de apply y, si restauró una sección, al modelo. */
function describe(outcome, customization) {
  if (outcome.outcome === 'refused') {
    const remedy = KINDS[customization.kind].remedy;
    return { say: `${PREFIX} ${outcome.id} could not be re-applied (no se pudo reaplicar): ${outcome.detail}${remedy === undefined ? '' : `. ${remedy}`}` };
  }
  if (outcome.change === 'moved') return { say: `${PREFIX} ${outcome.label} moved to ~/${outcome.stash} (${outcome.detail}) @es sección diferida movida al depósito` };
  if (outcome.change === 'restored') {
    return {
      say: `${PREFIX} ${outcome.label} restored into CLAUDE.md (${outcome.detail}) @es sección diferida restaurada en CLAUDE.md`,
      read: `The ${outcome.label} may be needed now: read ~/${outcome.stash} IN FULL now and follow it as part of your instructions. @es Puede hacer falta ya: leer ~/${outcome.stash} COMPLETO ahora y seguirlo como parte de las instrucciones.`,
    };
  }
  return { say: `${PREFIX} re-applied ${outcome.id} (${outcome.detail}) @es reaplicado` };
}

/**
 * Apply every broken sync-safe customization of `customizations` (the real list by default).
 * @es Aplica toda personalización segura ante sync que esté rota en `customizations` (la lista real por omisión).
 * @returns {{ systemMessage?: string, additionalContext?: string }}
 */
export function reapplySyncSafe(context, customizations = CUSTOMIZATIONS) {
  const byId = new Map(customizations.map((customization) => [customization.id, customization]));
  const told = applyAll(syncSafeOnly(customizations), context)
    .filter((outcome) => outcome.outcome !== 'unchanged')
    .map((outcome) => describe(outcome, byId.get(outcome.id)));
  const say = told.map((one) => one.say);
  const read = told.flatMap((one) => (one.read === undefined ? [] : [one.read]));
  return {
    ...(say.length === 0 ? {} : { systemMessage: say.join('\n') }),
    ...(read.length === 0 ? {} : { additionalContext: read.join('\n') }),
  };
}

/** The hook output for `event`, or undefined when there is nothing to say. @es La salida del hook para `event`, o undefined si no hay nada que decir. */
export function hookOutput(event, { systemMessage, additionalContext }) {
  if (systemMessage === undefined && additionalContext === undefined) return undefined;
  return {
    ...(systemMessage === undefined ? {} : { systemMessage }),
    ...(additionalContext === undefined ? {} : { hookSpecificOutput: { hookEventName: event, additionalContext } }),
  };
}
