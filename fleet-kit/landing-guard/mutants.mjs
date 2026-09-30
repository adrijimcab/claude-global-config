#!/usr/bin/env node
/** Mutant campaign of the landing guard. @es Campaña de mutantes de la guarda de aterrizaje. */

import { runCampaign } from '../testing/campaign.mjs';

const B = 'landing-guard/branch-moves.mjs';
const M = 'landing-guard/move-resolution.mjs';
const D = 'landing-guard/decision.mjs';
const I = 'lib/invocation-directory.mjs';

runCampaign('landing-guard/selftest.mjs', [
  ['every branch is an integration branch', M, '.filter((branch) => integrationBranches.includes(branch))', '.filter((branch) => true)'],
  ['a rewind to an ancestor needs a verdict', M, '  if (from !== undefined && isAncestor(ask, to, from)) return NONE;\n', ''],
  ['a --no-ff merge of a graded commit passes', M, "if (target.kind === 'merge' && target.noFf) return unknowable", 'if (false) return unknowable'],
  ['a non-fast-forward merge is graded by the branch tree', M, "if (target.kind === 'merge' && from !== undefined && !isAncestor(ask, from, to)) return unknowable", 'if (false) return unknowable'],
  ['content produced by the command passes', M, "if (target.kind === 'produced') return unknowable(branch, target.why);", "if (target.kind === 'produced') return NONE;"],
  ['a pull of the own upstream is refused', M, 'target.sources.every((source) => source === branch) ? NONE', 'false ? NONE'],
  ['the verdict is never consulted', D, 'return verdict.green ? undefined : { ...outcome, why: verdict.why };', 'return { ...outcome, why: verdict.why };'],
  ['advise and enforce are swapped', D, "governed.config.landingGuard.mode === 'enforce')", "governed.config.landingGuard.mode === 'advise')"],
  ['a disabled guard still speaks', D, 'if (governed === undefined || isDisabled(governed.config.landingGuard)) return [];', 'if (governed === undefined) return [];'],
  ['merge --abort is a move', B, "  if (hasAny(flags, ['--abort', '--quit', '--squash'])) return [];\n", ''],
  ['a dry-run push is a move', B, "  if (hasAny(flags, ['--dry-run', '-n', '--delete', '-d'])) return [];\n", ''],
  ['a reset of paths from a revision is a move', B, 'if (dashDash || (!withMode && positionals.length !== 1) || (withMode && positionals.length > 1)) return [];', 'if (false) return [];'],
  ['branch -f is not a move', B, "if (hasAny(flags, ['-f', '--force']) && positionals.length > 0) return", 'if (false) return'],
  ['update-ref of a branch is not a move', B, 'if (ref !== undefined && ref.startsWith(HEADS) && value !== undefined) return', 'if (false) return'],
  ['a push refspec moves its source, not its destination', B, 'ref: remote(remoteName, destination)', 'ref: remote(remoteName, source)'],
  ['-C is not followed', I, "if (invocation.gitOptions[index] === '-C' && directory !== undefined) directory =", 'if (false) directory =']
]);
