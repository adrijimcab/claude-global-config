/**
 * What a capture does when the always-loaded instruction set is over its ceiling: `adviseOnBudget` measures,
 * and only when the verdict is over it prints the advisory and runs the condense it is given, printing what
 * that did. Every step is injected, so nothing here reads a file or knows the ledger. A failure of any step is
 * printed and swallowed: the budget never changes the exit status of a capture (spec R4.4).
 *
 * @es Lo que hace una captura cuando el conjunto de instrucciones siempre cargado supera su techo:
 * `adviseOnBudget` mide y solo si el veredicto es «sobre el techo» imprime el aviso y ejecuta el condense que
 * recibe, imprimiendo lo que hizo. Cada paso se inyecta, así que aquí no se lee ningún fichero ni se conoce el
 * ledger. El fallo de cualquier paso se imprime y se traga: el presupuesto nunca cambia el estado de salida
 * de una captura (spec R4.4).
 */

import { renderAdvisory } from './budget-report.mjs';

/**
 * `measure()` answers the `budgetVerdict`, `condense()` the lines describing what it did, `print(line)` shows a line.
 * @es `measure()` responde el `budgetVerdict`, `condense()` las líneas de lo que hizo, `print(línea)` muestra una línea.
 */
export function adviseOnBudget({ measure, condense, print }) {
  try {
    const verdict = measure();

    if (verdict.status === 'within') return;

    for (const line of renderAdvisory(verdict)) print(line);
    for (const line of condense()) print(line);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    print(`budget advisory FAILED (the capture itself is unaffected): ${reason}. @es el aviso de presupuesto FALLÓ (la captura no se ve afectada): ${reason}.`);
  }
}
