/**
 * Evaluating and re-applying customizations: the registry of invariant kinds and the two loops over
 * a customization list. A kind with an `apply` is reapplicable; a kind without one is report-only and
 * carries a `remedy` telling a human what to do instead.
 */
import { agentToolForbidden, agentToolRequired } from './kinds/agent-tool.mjs';
import { ownerSectionsOutsideManagedRegions } from './kinds/owner-sections.mjs';
import { personaRegionMatchesUpstream } from './kinds/persona-region.mjs';
import { telemetryDisabled } from './kinds/telemetry.mjs';

export const KINDS = {
  'agent-tool-required': agentToolRequired,
  'agent-tool-forbidden': agentToolForbidden,
  'owner-sections-outside-managed-regions': ownerSectionsOutsideManagedRegions,
  'persona-region-matches-upstream': personaRegionMatchesUpstream,
  'telemetry-disabled': telemetryDisabled,
};

const kindOf = (customization) => {
  const kind = KINDS[customization.kind];
  if (kind === undefined) throw new Error(`customization "${customization.id}" has unknown kind "${customization.kind}"`);
  return kind;
};

/** @returns {{ id, file?, status: 'held'|'broken'|'unverifiable', detail, reapplicable: boolean, remedy? }[]} */
export const evaluateAll = (customizations, context) =>
  customizations.map((customization) => {
    const kind = kindOf(customization);
    return { id: customization.id, file: customization.file, reapplicable: typeof kind.apply === 'function', remedy: kind.remedy, ...kind.evaluate(customization, context) };
  });

/** Apply every broken, reapplicable customization. @returns {{ id, outcome, detail }[]} */
export function applyAll(customizations, context) {
  const broken = new Set(evaluateAll(customizations, context).filter((result) => result.status === 'broken').map((result) => result.id));
  return customizations
    .filter((customization) => broken.has(customization.id) && typeof kindOf(customization).apply === 'function')
    .map((customization) => ({ id: customization.id, ...kindOf(customization).apply(customization, context) }));
}
