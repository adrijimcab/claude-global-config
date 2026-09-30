#!/usr/bin/env node
/** Mutant campaign of the config loader and validator. @es Campaña de mutantes del cargador y validador de config. */

import { runCampaign } from '../testing/campaign.mjs';

const V = 'config/validate.mjs';
const L = 'config/load-config.mjs';

runCampaign('config/selftest.mjs', [
  ['unknown keys are accepted, so a misspelt section silently disables a guard', V, '.filter((key) => !allowed.includes(key))', '.filter((key) => false && !allowed.includes(key))'],
  ['a disabled section needs no reason', V, "  if (typeof section.reason !== 'string' || section.reason.trim().length < MINIMUM_REASON_LENGTH) {", '  if (false) {'],
  ['a landing guard without a unit suite is accepted', V, 'if (isObject(config.landingGuard) && !isDisabled(config.landingGuard) && isDisabled(config.unitSuite)) {', 'if (false) {'],
  ['a source root may match a sibling folder by prefix', V, "!project.sourceRoot.endsWith('/')", 'false'],
  ['a parent segment is accepted', V, "if (value.split('/').includes('..')) return", 'if (false) return'],
  ['the walk never goes up from the mapped folder', L, '    candidateDir = path.dirname(candidateDir);', '    return undefined;'],
  ['a linked worktree is not mapped to its main checkout', L, 'let candidateDir = path.join(repository.mainCheckout, repository.relative);', 'let candidateDir = path.join(repository.top, repository.relative);'],
  ['an invalid config reads as valid', L, 'if (problems.length > 0) throw', 'if (false) throw']
]);
