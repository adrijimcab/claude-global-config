/**
 * The parts every verdict is made of: an evidence entry (a message id with its parameters, rendered bilingual
 * by `check.mjs`), the verdict states, and the one rule that turns "what the project configures" and "what its
 * landing path runs" into a state. ENFORCED needs both: the profile's configuration is met AND a command of the
 * tool runs from a root that enforces. CONFIGURED-ONLY is a trace of the gate without both. ABSENT is no trace.
 * UNMEASURED is a gate the checker could not read (the reason is its evidence), never a guess.
 *
 * @es Las partes de que está hecho todo veredicto: una entrada de evidencia (un id de mensaje con sus
 * parámetros, renderizada bilingüe por `check.mjs`), los estados, y la regla que convierte "lo que el proyecto
 * configura" y "lo que corre su camino de aterrizaje" en un estado. APLICADO exige ambos: se cumple la
 * configuración del perfil Y un comando de la herramienta corre desde una raíz que aplica. SOLO-CONFIGURADO es
 * un rastro del gate sin ambos. AUSENTE es ningún rastro. NO-MEDIDO es un gate que el checker no pudo leer (la
 * razón es su evidencia), nunca una suposición.
 */

import { halvesOf } from '../../bilingual-output/message.mjs';

import { describeRecords } from './landing-reach.mjs';

export const ENFORCED = 'enforced';
export const CONFIGURED_ONLY = 'configured-only';
export const ABSENT = 'absent';
export const UNMEASURED = 'unmeasured';

/** An evidence entry. @es Una entrada de evidencia. */
export function ev(id, params = {}) {
  return { id, params };
}

/**
 * The `{ reasonEn, reasonEs }` parameters of a tool's or an error's reason, which may already be bilingual, so the
 * printed line keeps exactly one `@es`.
 * @es Los parámetros `{ reasonEn, reasonEs }` del motivo de una herramienta o un error, que puede venir ya bilingüe,
 * para que la línea impresa conserve exactamente un `@es`.
 */
export function reasonParams(reason) {
  const { en, es } = halvesOf(reason);

  return { reasonEn: en, reasonEs: es };
}

/** The evidence lines that say how the landing path relates to a tool. @es Las líneas que dicen cómo se relaciona el camino con una herramienta. */
export function landingEvidence(found, tool, landing, projectRoot) {
  if (found.enforcing.length > 0) return describeRecords(found.enforcing, projectRoot).map((record) => ev('reached', { record }));
  if (found.other.length > 0) return describeRecords(found.other, projectRoot).map((record) => ev('reached-not-enforcing', { record }));

  return [ev('not-reached', { tool, roots: [...new Set(landing.roots.map((root) => root.kind))].join(', ') || '(none)' })];
}

/**
 * The state of a gate. `meets` is whether the profile's configuration is fully met, `present` whether the gate
 * leaves any trace, `found` the landing reach of its tool.
 * @es El estado de un gate. `meets`: la configuración del perfil se cumple entera; `present`: el gate deja algún rastro; `found`: el alcance de su herramienta.
 */
export function settle({ gate, meets, present, found, evidence }) {
  let verdict = ABSENT;

  if (meets && found.enforcing.length > 0) verdict = ENFORCED;
  else if (present || meets) verdict = CONFIGURED_ONLY;

  return { id: gate.id, verdict, evidence, landingGuard: found.landingGuard };
}

/** A gate the checker could not read. @es Un gate que el checker no pudo leer. */
export function unmeasured(gate, evidence) {
  return { id: gate.id, verdict: UNMEASURED, evidence, landingGuard: false };
}
