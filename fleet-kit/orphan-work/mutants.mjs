#!/usr/bin/env node
/** Mutant campaign of orphaned-work detection. @es Campaña de mutantes de la detección de trabajo huérfano. */

import { runCampaign } from '../testing/campaign.mjs';

const G = 'orphan-work/guard.mjs';

runCampaign('orphan-work/selftest.mjs', [
  ['a live agent\'s worktree is parked', G, '.filter((worktree) => activeOwner(worktree.path, records, now) === undefined)', '.filter((worktree) => true)'],
  ['a vanished worktree folder is measured', G, ' && existsSync(worktree.path))', ')'],
  ['uncommitted work is not work', G, 'work.dirty > 0 || ', ''],
  ['unintegrated commits are not work', G, ' || work.unintegrated > 0', ''],
  ['landed commits count as unintegrated', G, ".filter((line) => line.startsWith('+'))", '.filter((line) => line.length > 0)'],
  ['a failed cherry reads as clean', G, 'if (cherry.status !== 0) return { unmeasurable:', 'if (false) return { unmeasurable:'],
  ['worktrees outside the agent root are judged', G, 'isAgentWorktree(governed, worktree.path) && ', ''],
  ['every tool is treated as a delegation', G, '!DELEGATION_TOOLS.has(payload?.tool_name) || ', ''],
  ['recent work does not count as live', G, '.filter((worktree) => now - lastWorked(worktree) >= ACTIVE_WINDOW_MS)', ''],
  ['any past work counts as live', G, 'now - lastWorked(worktree) >= ACTIVE_WINDOW_MS', 'now - lastWorked(worktree) >= Infinity'],
  ['dirty entries are not timed', G, 'times.push(statSync(path.join(worktree.path, relative)).mtimeMs);', ''],
  ['the HEAD author time is ignored', G, 'if (head.status === 0 && head.stdout.trim().length > 0) times.push(', 'if (false) times.push('],
  ['a rename is timed by its source', G, "named.includes(' -> ') ? named.slice(named.indexOf(' -> ') + 4) : named", 'named'],
  ['the oldest time wins', G, 'Math.max(...times)', 'Math.min(...times)'],
  ['the delegation target is ignored', G, ' || !delegationTouches(payload, governed.repository.mainCheckout)', ''],
  ['a brief with no path is not judged', G, 'named.length === 0 || named.some(', 'named.length !== 0 && named.some('],
  ['a sibling folder counts as this repository', G, 'named.some((named_) => `${named_}/`.startsWith(root))', 'named.some((named_) => named_.startsWith(root.slice(0, -1)))'],
  ['backslash paths are not normalised', G, "paths.push(text.slice(at, end).replaceAll('\\\\', '/').toLowerCase());", 'paths.push(text.slice(at, end).toLowerCase());'],
  ['a path runs past its closing quote', G, "const stops = ' \\t\\r\\n\"\\'`)]>';", "const stops = ' \\t\\r\\n';"],
  ['a drive letter glued to a word starts a path', G, ' && (at === 0 || !/[A-Za-z0-9]/.test(text[at - 1]))', '']
]);
