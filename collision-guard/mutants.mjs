#!/usr/bin/env node
/**
 * The decisions of the collision guard, each broken once, that `selftest.mjs` must catch. The runner
 * and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * Both directions again: a mutant that lets an unread side be dropped, and a mutant that refuses a
 * resolution which loses nothing — the second is what gets a guard on `git checkout` switched off.
 *
 * @es Las decisiones del guard, rotas una a una, en las dos direcciones: la que deja tirar un lado sin
 * leer y la que rechaza una resolución que no pierde nada, que es la que hace que alguien lo apague.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // --- what would be lost
  ['a dropped side ABSENT counts as a loss, so a modify/delete resolution is refused', 'collision-guard/conflict.mjs', 'if (blobs[dropped] === undefined) continue;', ''],
  ['an add/add conflict, which has no merge base, stops counting as unique content', 'collision-guard/conflict.mjs', 'if (blobs[STAGE.BASE] === undefined) {', 'if (false) {'],
  ['identity with the base stops making a take lossless: every conflict is refused', 'collision-guard/conflict.mjs', 'if (blobs[dropped] !== blobs[STAGE.BASE]) lossy.push', 'if (true) lossy.push'],
  ['the sides are swapped, so the guard measures the side being KEPT', 'collision-guard/conflict.mjs', "const dropped = side === 'ours' ? STAGE.THEIRS : STAGE.OURS;", "const dropped = side === 'ours' ? STAGE.OURS : STAGE.THEIRS;"],
  ['only unmerged entries are asked for — dropping that reads every listed file as conflicted', 'collision-guard/conflict.mjs', "run(directory, ['ls-files', '--unmerged', '--', ...paths])", "run(directory, ['ls-files', '--', ...paths])"],

  // --- what the command asks for
  ['a checkout with no side flag is treated as a side-take', 'collision-guard/side-taking.mjs', 'if (side === undefined) continue;', ''],
  ['`restore` stops counting, so the same resolution by another name passes', 'collision-guard/side-taking.mjs', "const SIDE_TAKING = new Set(['checkout', 'restore']);", "const SIDE_TAKING = new Set(['checkout']);"],
  ['command position is ignored, so a MENTION of the command is refused', 'collision-guard/side-taking.mjs', 'const at = commandWordIndex(words);', "const at = words.findIndex((word) => executableName(word) === 'git');"],
  ['the line\'s own `cd` is not followed: the payload cwd decides for every command', 'collision-guard/side-taking.mjs', 'const commands = withWorkingDirectories(simpleCommands(command, dialect), cwd, dialect, platform);', 'const commands = simpleCommands(command, dialect).map((command_) => ({ command: command_, directory: cwd }));'],
  ['an invocation naming no path at all is judged, over an empty path list', 'collision-guard/side-taking.mjs', 'if (paths.length === 0) continue;', ''],

  // --- the shim
  ['the shim never asks whether anything would be lost', 'collision-guard/guard.mjs', 'const lossy = lossyResolutions(take);', 'const lossy = [];'],
  ['a failed git read reports a loss instead of nothing, so every unmeasurable take is refused', 'collision-guard/conflict.mjs', 'if (stages === undefined) return [];', "if (stages === undefined) return [{ path: '?', reason: 'unmeasured', dropped: '3' }];"],
  ['the shim stops emitting the refusal', 'collision-guard/guard.mjs', '  console.log(', '  String('],

  // --- the data face, owned by the shared parser
  ['heredoc bodies are scanned as commands', 'shell-command/shell-command.mjs', "if (operator === '\\n') this.skipHeredocBodies();", '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['collision-guard', 'cherry-pick-guard', 'shell-command', 'mutation-proof'],
  selftest: 'collision-guard/selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
