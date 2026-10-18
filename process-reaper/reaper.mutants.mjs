#!/usr/bin/env node
/**
 * Mutant campaign of the process reaper: each mutant reverts ONE decision of `reaper.mjs`, `ownership.mjs`,
 * `process-tree.mjs` or `linked-worktree.mjs`, and `reaper.selftest.mjs` must go red by assertion. The widening
 * mutants matter most (a blank marker, a missing boundary, a missing ancestor guard): each of those would make
 * the reaper kill what is not its own. Exit 2 = NOT MEASURED (no shared runner).
 * @es Campaña de mutantes del segador de procesos: cada mutante revierte UNA decisión y `reaper.selftest.mjs`
 * debe ponerse rojo por aserción. Los que ensanchan el criterio son los más importantes (marcador en blanco,
 * límite ausente, guarda de ancestros ausente): cada uno haría matar lo que no es del agente. Salida 2 = NO MEDIDO.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = path.resolve(import.meta.dirname, '..', 'mutation-proof', 'run-mutants.mjs');
const R = 'process-reaper/reaper.mjs';
const O = 'process-reaper/ownership.mjs';
const P = 'process-reaper/path-spellings.mjs';
const T = 'process-reaper/process-tree.mjs';
const L = 'process-reaper/linked-worktree.mjs';

const MUTANTS = [
  // reaper.mjs
  ['an ancestor of the reaper that names the agent is killed', R, 'const matched = named.filter((entry) => !own.has(entry.pid));', 'const matched = named;'],
  ['nothing to match is not refused', R, "if (markers.length === 0) return { ...empty, refused: 'no-markers'", "if (false) return { ...empty, refused: 'no-markers'"],
  ['a main checkout is reaped', R, '!isReapableWorktree(withHomeExpanded(worktree.trim(), home))', 'false'],
  ['every matched process is killed, not only the roots', R, 'const roots = rootsOf(rows, matched);', 'const roots = matched;'],
  ['a reused pid counts as a survivor', R, 'candidate.commandLine === entry.commandLine', 'true'],
  ['the second listing is skipped, so nothing survives', R, 'const after = list();', 'const after = [];'],
  ['the unnamed children of a killed root are not tracked', R, 'for (const root of roots) for (const below of descendantsOf(rows, root.pid)) tracked.set(below.pid, below);', ''],
  ['the processes left alone are not reported', R, '...left.sort(byPid).map((entry) => speaker.line(\'protected\', shown(entry)))', ''],
  ['the summary counts trees as processes', R, 'count: killed.length, trees: roots.length', 'count: roots.length, trees: roots.length'],
  ['the summary counts processes as trees', R, 'count: killed.length, trees: roots.length', 'count: killed.length, trees: killed.length'],
  ['an empty reap does not say so', R, 'tracked.size === 0 ? [speaker.line(\'none\')]', 'false ? [speaker.line(\'none\')]'],
  ['the real killer does nothing', R, 'const killWithSharedKiller = (pid) => killTree(pid);', 'const killWithSharedKiller = (pid) => pid;'],
  ['a survivor is not reported', R, '...survivors.map((entry) => speaker.line(\'survivor\', shown(entry))),', ''],
  ['survivors are also reported killed', R, 'const killed = [...tracked.values()].filter((entry) => !stillAlive(entry)).sort(byPid);', 'const killed = [...tracked.values()].sort(byPid);'],

  // ownership.mjs
  ['a blank path is a marker', O, ".filter((text) => text !== '')", '.filter(() => true)'],
  ['an id too short is an identity', O, 'id.length < MINIMUM_ID_LENGTH ||', 'id.length < 1 ||'],
  ['a seven-character id is an identity', O, 'id.length < MINIMUM_ID_LENGTH ||', 'id.length < MINIMUM_ID_LENGTH - 1 ||'],
  ['an eight-character id is not an identity', O, 'id.length < MINIMUM_ID_LENGTH ||', 'id.length <= MINIMUM_ID_LENGTH ||'],
  ['an id with odd characters is an identity', O, ' || !/^[a-z0-9]+$/.test(id)', ''],
  ['the agent- prefix is kept', O, 'lowered.startsWith(AGENT_PREFIX) ? lowered.slice(AGENT_PREFIX.length) : lowered', 'lowered'],
  ['the left boundary is not checked', O, "(before === '' || !marker.continues(before)) &&", 'true &&'],
  ['the right boundary is not checked', O, "&& (after === '' || !marker.continues(after))", '&& true'],
  ['only the first occurrence of a name is tried', O, 'at = line.indexOf(marker.text, at + 1)', 'at = -1'],
  ['the command line is compared as written', O, 'const line = canonicalText(commandLine, home);', 'const line = commandLine.toLowerCase();'],
  ['a command line must name every marker', O, 'return markers.some((marker) => occursIn(marker, line));', 'return markers.every((marker) => occursIn(marker, line));'],
  ['a path name continues only with letters', O, 'const PATH_NAME_CHARACTER = /[a-z0-9_.-]/;', 'const PATH_NAME_CHARACTER = /[a-z]/;'],

  // reaper.mjs, home
  ['a tilde worktree is judged by its literal text', R, 'isReapableWorktree(withHomeExpanded(worktree.trim(), home))', 'isReapableWorktree(worktree)'],
  ['the command lines are read without the home', R, 'namesAny(markers, entry.commandLine, home)', 'namesAny(markers, entry.commandLine)'],
  ['the worktree is read without the home', R, 'markersOf({ worktree, agentId, scratch }, home)', 'markersOf({ worktree, agentId, scratch })'],

  // path-spellings.mjs
  ['the comparison is case sensitive', P, 'text.split(\'\\\\\').join(\'/\').toLowerCase()', 'text.split(\'\\\\\').join(\'/\')'],
  ['backslash paths are not folded to slashes', P, 'text.split(\'\\\\\').join(\'/\')', 'text'],
  ['a trailing slash stays in the marker', P, ".replace(/\\/+$/, '')", ''],
  ['a tilde is not expanded', P, '(_match, lead) => `${lead}${home}`)', '(match) => match)'],
  ['a tilde followed by a name is expanded', P, '~(?=[\\\\/]|$|[\\s"\'])', '~(?=)'],
  ['${HOME} is not expanded', P, '    .replace(/\\$\\{HOME\\}/gi, () => home)\n', ''],
  ['$HOME is not expanded', P, '    .replace(/\\$HOME(?![A-Za-z0-9_])/gi, () => home)\n', ''],
  ['$HOME is expanded inside a longer name', P, '\\$HOME(?![A-Za-z0-9_])', '\\$HOME'],
  ['%USERPROFILE% is not expanded', P, '    .replace(/%USERPROFILE%/gi, () => home);', '    ;'],
  ['a Git Bash drive path is not read', P, '(_match, lead, drive) => `${lead}${drive}:/`', '(match) => match'],
  ['8.3 short names are not resolved', P, '      return folded(realpathSync.native(match));', '      return match;'],
  ['the command line keeps its 8.3 short names', P, 'return withLongNames(withDriveLetter(folded(withHomeExpanded(text, home))));', 'return withDriveLetter(folded(withHomeExpanded(text, home)));'],
  ['the worktree is not resolved through its links', P, 'real = withoutTrailingSlashes(folded(realpathSync.native(withHomeExpanded(path.trim(), home))));', 'real = written;'],

  // process-tree.mjs
  ['the lineage walk stops at the first step', T, 'step <= rows.length', 'step <= 0'],
  ['every member is a root', T, 'if (above.length === 0) cover(member);', 'cover(member);'],
  ['no member is a root in the first pass', T, 'if (above.length === 0) cover(member);', ''],
  ['a cycle leaves nothing to kill', T, 'if (!covered.has(member.pid)) cover(member);', '{}'],
  ['any ancestor makes a member a non-root', T, 'filter((pid) => pid !== member.pid && pids.has(pid))', 'filter((pid) => pid !== member.pid)'],
  ['descendants are only the direct children', T, 'queue.push(entry.pid);', ''],

  // linked-worktree.mjs
  ['a removed worktree is refused', L, 'if (!existsSync(worktree)) return true;', 'if (!existsSync(worktree)) return false;'],
  ['a main checkout passes as a linked worktree', L, 'return isLinkedWorktree(worktree);', 'return !isLinkedWorktree(worktree);'],
  ['a directory git cannot classify is reaped', L, '  } catch {\n    return false;', '  } catch {\n    return true;'],
];

if (!existsSync(RUNNER)) {
  console.error(`NOT MEASURED — shared runner missing at ${RUNNER}. @es NO MEDIDO — falta el runner compartido en ${RUNNER}.`);
  process.exit(2);
}

const { runMutants } = await import(pathToFileURL(RUNNER).href);

const survivors = runMutants({
  fleetRoot: path.resolve(import.meta.dirname, '..'),
  paths: ['process-reaper', 'process-control', 'worker-status', 'bilingual-output', 'hook-state'],
  selftest: 'process-reaper/reaper.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 180_000
});

process.exit(survivors === 0 ? 0 : 1);
