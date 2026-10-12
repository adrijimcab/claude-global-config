/**
 * Grades a project against the profile: for each gate of the project's stack, the verdict function its `kind`
 * names, over the facts `collect-facts.mjs` gathered. The map from `kind` to function is the only place a new
 * kind of gate has to be added, and a gate whose kind has no function throws rather than being skipped.
 *
 * @es Califica un proyecto contra el perfil: para cada gate del stack del proyecto, la función de veredicto que
 * nombra su `kind`, sobre los hechos que reunió `collect-facts.mjs`. El mapa de `kind` a función es el único
 * sitio donde añadir un tipo de gate, y un gate cuyo `kind` no tiene función lanza en vez de omitirse.
 */

import { ruleSetVerdict, ruleVerdict } from './eslint-verdicts.mjs';
import { gatesOf } from './profile.mjs';
import { circularDependencies, dependencyAudit, deadCode, duplication, hexagonalLayering, lintOnLanding, strictTypescript } from './tool-verdicts.mjs';

const BY_KIND = Object.freeze({
  'landing-tool': lintOnLanding,
  'eslint-rule': ruleVerdict,
  'eslint-rules-set': ruleSetVerdict,
  'strict-ts': strictTypescript,
  'depcruise-circular': circularDependencies,
  'depcruise-layering': hexagonalLayering,
  jscpd: duplication,
  knip: deadCode,
  'npm-audit': dependencyAudit,
});

/** One verdict per gate of the facts' stack. @es Un veredicto por gate del stack de los hechos. */
export function gradeProject(facts) {
  return gatesOf(facts.stack).map((gate) => {
    const verdictOf = BY_KIND[gate.kind];

    if (verdictOf === undefined) throw new Error(`gate ${gate.id} has kind "${gate.kind}" with no verdict function @es el gate ${gate.id} tiene el kind "${gate.kind}" sin función de veredicto`);

    return verdictOf(gate, facts);
  });
}
