/**
 * Re-placing the review execution contract from a hook, and what the hook then says. Only this one
 * customization is applied automatically: it is byte-verified and sync-safe, while every other
 * customization keeps its manual `apply.mjs`.
 *
 * A restore means the contract is needed while this session may hold only the pointer, so the model is
 * told to read the stash now (the stash is kept after a restore). A move or a refusal is told to the
 * user. Nothing is said when nothing changed.
 *
 * @es Recolocar el contrato de ejecución de revisiones desde un hook, y lo que el hook dice después.
 * Solo esta personalización se aplica sola: está verificada byte a byte y es segura ante sync; las
 * demás conservan su `apply.mjs` manual. Una restauración significa que el contrato hace falta mientras
 * esta sesión quizá solo tiene el puntero, así que se le indica al modelo que lea el depósito ya (el
 * depósito se conserva tras restaurar). Un movimiento o un rechazo se le informa al usuario. Si nada
 * cambió, no se dice nada.
 */
import { CUSTOMIZATIONS } from './customizations.mjs';
import { KINDS } from './invariants.mjs';

const ENTRY = CUSTOMIZATIONS.find((customization) => customization.kind === 'lazy-review-contract');
const PREFIX = '[gentle-ai overlay]';

/** @returns {{ systemMessage?: string, additionalContext?: string }} */
export function reconcileLazyReview(context) {
  const result = KINDS[ENTRY.kind].apply(ENTRY, context);
  if (result.outcome === 'refused') {
    return { systemMessage: `${PREFIX} the review contract could not be re-placed (no se pudo recolocar el contrato de revisiones): ${result.detail}. ${KINDS[ENTRY.kind].remedy}` };
  }
  if (result.change === 'moved') return { systemMessage: `${PREFIX} review contract moved to ~/${ENTRY.stash} (${result.detail}) @es contrato de revisiones movido al depósito` };
  if (result.change !== 'restored') return {};
  const read = `Receipt-driven development may run: read ~/${ENTRY.stash} IN FULL now and follow it as part of your instructions. @es El desarrollo guiado por recibos puede correr: leer ~/${ENTRY.stash} COMPLETO ahora y seguirlo como parte de las instrucciones.`;
  return { systemMessage: `${PREFIX} review contract restored into CLAUDE.md (${result.detail}) @es contrato de revisiones restaurado en CLAUDE.md`, additionalContext: read };
}

/** The hook output for `event`, or undefined when there is nothing to say. @es La salida del hook para `event`, o undefined si no hay nada que decir. */
export function hookOutput(event, { systemMessage, additionalContext }) {
  if (systemMessage === undefined && additionalContext === undefined) return undefined;
  return {
    ...(systemMessage === undefined ? {} : { systemMessage }),
    ...(additionalContext === undefined ? {} : { hookSpecificOutput: { hookEventName: event, additionalContext } }),
  };
}
