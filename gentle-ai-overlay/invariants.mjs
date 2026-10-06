/**
 * Evaluating and re-applying customizations: the registry of invariant kinds and the two loops over
 * a customization list. A kind with an `apply` is reapplicable; a kind without one is report-only and
 * carries a `remedy` telling a human what to do instead.
 */
import { agentToolForbidden, agentToolRequired } from './kinds/agent-tool.mjs';
import { lazyReviewContract } from './kinds/lazy-review-contract.mjs';
import { anchoredLineReplacement } from './kinds/line-replacement.mjs';
import { ownerSectionsOutsideManagedRegions } from './kinds/owner-sections.mjs';
import { personaRegionMatchesUpstream } from './kinds/persona-region.mjs';
import { prunedTextStaysPruned } from './kinds/pruned-text.mjs';
import { telemetryDisabled } from './kinds/telemetry.mjs';

export const KINDS = {
  'agent-tool-required': agentToolRequired,
  'agent-tool-forbidden': agentToolForbidden,
  'owner-sections-outside-managed-regions': ownerSectionsOutsideManagedRegions,
  'persona-region-matches-upstream': personaRegionMatchesUpstream,
  'telemetry-disabled': telemetryDisabled,
  'lazy-review-contract': lazyReviewContract,
  'anchored-line-replacement': anchoredLineReplacement,
  'pruned-text-stays-pruned': prunedTextStaysPruned,
};

const kindOf = (customization) => {
  const kind = KINDS[customization.kind];
  if (kind === undefined) throw new Error(`customization "${customization.id}" has unknown kind "${customization.kind}"`);
  return kind;
};

/**
 * `syncSafe` is true for a kind that `gentle-ai sync` can only undo, never erase: the sync guard does
 * not refuse a sync for it. @es `syncSafe` es verdadero para un tipo que `gentle-ai sync` solo puede
 * deshacer, nunca borrar: el guard de sync no rechaza un sync por él.
 * @returns {{ id, file?, status: 'held'|'broken'|'unverifiable', detail, reapplicable: boolean, syncSafe: boolean, remedy? }[]}
 */
export const evaluateAll = (customizations, context) =>
  customizations.map((customization) => {
    const kind = kindOf(customization);
    return { id: customization.id, file: customization.file, reapplicable: typeof kind.apply === 'function', syncSafe: kind.syncSafe === true, remedy: kind.remedy, ...kind.evaluate(customization, context) };
  });

function brokenAndReapplicable(customizations, context) {
  const broken = new Set(evaluateAll(customizations, context).filter((result) => result.status === 'broken').map((result) => result.id));
  return customizations.filter((customization) => broken.has(customization.id) && typeof kindOf(customization).apply === 'function');
}

/** Apply every broken, reapplicable customization. @returns {{ id, outcome, detail }[]} */
export const applyAll = (customizations, context) =>
  brokenAndReapplicable(customizations, context).map((customization) => ({ id: customization.id, ...kindOf(customization).apply(customization, context) }));

/**
 * What `applyAll` would do, writing nothing: the kind's own `plan` when it has one.
 * @es Lo que haría `applyAll`, sin escribir nada: el `plan` propio del tipo cuando lo tiene.
 * @returns {{ id, outcome, detail }[]}
 */
export const planAll = (customizations, context) =>
  brokenAndReapplicable(customizations, context).map((customization) => {
    const kind = kindOf(customization);
    const planned = typeof kind.plan === 'function' ? kind.plan(customization, context) : { outcome: 'would-try', detail: 'apply would try it; this kind has no dry plan @es apply lo intentaría; este tipo no tiene plan en seco' };
    return { id: customization.id, ...planned };
  });
