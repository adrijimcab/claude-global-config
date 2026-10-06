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
  ['backslash paths are not normalised', G, "const slashed = raw.replaceAll(BACKSLASH, '/');", 'const slashed = raw;'],
  ['a path runs past its closing quote', G, "const PATH_STOPS = ' \\t\\r\\n\"\\'`)]>';", "const PATH_STOPS = ' \\t\\r\\n';"],
  ['a drive letter glued to a word starts a path', G, "return isLetter(before) || isDigit(before) ? undefined : 'drive';", "return 'drive';"],
  ['the punctuation of the sentence stays in the path', G, 'while (named > at + 1 && SENTENCE_PUNCTUATION.includes(text[named - 1])) named -= 1;', ''],
  ['a POSIX path is never read', G, "if (platform !== 'win32') return 'posix';", "if (false) return 'posix';"],
  ['a POSIX path is read on Windows too', G, "if (platform !== 'win32') return 'posix';", "return 'posix';"],
  ['a lone Git Bash switch is read as a drive path', G, "isLetter(text[at + 1]) && text[at + 2] === '/' && isPathCharacter(text[at + 3])", 'isLetter(text[at + 1]) && isPathCharacter(text[at + 3])'],
  ['a path glued to a word is read', G, 'if (before !== undefined && !BEFORE_A_PATH.includes(before)) return undefined;\n', ''],
  ['a UNC path is never read', G, "if (here === BACKSLASH) return text[at + 1] === BACKSLASH && isPathCharacter(text[at + 2]) ? 'unc' : undefined;", 'if (here === BACKSLASH) return undefined;'],
  ['a UNC path is not told from a drive-less POSIX one', G, "const unc = slashed.startsWith('//') && (platform === 'win32' || raw.startsWith(`${BACKSLASH}${BACKSLASH}`));", 'const unc = false;'],
  ['a POSIX path is case-folded', G, "return platform === 'win32' || unc || drive ? key.toLowerCase() : key;", 'return key.toLowerCase();'],
  ['a Windows path is not case-folded', G, "return platform === 'win32' || unc || drive ? key.toLowerCase() : key;", 'return key;'],
  ['doubled separators are kept', G, '.split(\'/\').filter((part) => part.length > 0);', ".split('/');"],
  ['Git Bash spelling is not translated', G, '(unc ? slashed : nativeSpelling(slashed, platform))', 'slashed'],
  ['a sibling folder counts as this repository', G, 'candidate === root || candidate.startsWith(`${root}/`)', 'candidate.startsWith(root)'],
  ['the brief is read on the wrong platform', G, 'const named = absolutePathsIn(brief, platform);', 'const named = absolutePathsIn(brief);'],
  ['the root is read on the wrong platform', G, 'const root = canonicalPath(repositoryRoot, platform);', 'const root = canonicalPath(repositoryRoot);']
]);
