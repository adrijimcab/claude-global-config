#!/usr/bin/env node
/**
 * Mutant campaign of the loop's per-project routing against `project.selftest.mjs`: each mutant breaks one
 * decision that made the loop global, and the selftest must go red.
 * @es Campaña de mutantes del ruteo por proyecto: cada mutante rompe una decisión y el selftest debe ponerse rojo.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const P = 'failure-capture/project.mjs';
const C = 'failure-capture/capture.mjs';
const L = 'failure-capture/loop-context.mjs';

const MUTANTS = [
  ['the user home counts as a project, so every folder under it belongs to ~/.claude/CLAUDE.md', P, '    if (homes.some((home) => sameFolder(candidate, home))) return undefined;\n', ''],
  ['a linked worktree is not mapped to its main checkout', P, 'return path.join(realpathOf(path.dirname(common)), path.relative(realpathOf(top), realpathOf(directory)));', 'return realpathOf(directory);'],
  ['the configured scope is ignored', P, 'scope: config.scope ?? path.basename(root),', 'scope: path.basename(root),'],
  ['an unknown config key is accepted', P, '...unknown.map((key) => `unknown key "${key}"`),', ''],
  ['a project without config has no worker contract', P, "(config.workerContracts ?? ['.claude/CLAUDE.md'])", '(config.workerContracts ?? [])'],
  ['a spooled entry\'s own project is ignored, so another project cannot fold it', C, 'const project = entry.project ?? (PROJECT', 'const project = (PROJECT'],
  ['any scope is accepted', C, 'if (!SCOPES.includes(scope))', 'if (false)'],
  ['init adds the import every time', C, '  if (!imported) {', '  if (true) {'],
  ['init rewrites an existing ledger', C, '  if (created) writeFileSync(PROJECT.ledgerFile,', '  writeFileSync(PROJECT.ledgerFile,'],
  ['a declared parity is never checked on promote', C, 'if (parity.refusal !== undefined) {', 'if (false) {'],
  ['only the first contract file has to carry the token', C, 'for (const file of WORKER_CONTRACTS) if (!readFileOr(file,', 'for (const file of WORKER_CONTRACTS.slice(0, 1)) if (!readFileOr(file,'],
  ['the project ceiling key is unknown to the config', P, "'workerContracts', 'loadedSetCeiling', 'areas'];", "'workerContracts', 'areas'];"],
  ['the retired parityGate key is accepted again', P, "const CONFIG_KEYS = ['scope', 'workerContracts', 'loadedSetCeiling', 'areas'];", "const CONFIG_KEYS = ['scope', 'workerContracts', 'parityGate', 'loadedSetCeiling', 'areas'];"],
  ['a fractional project ceiling is accepted', P, 'Number.isInteger(config.loadedSetCeiling) && config.loadedSetCeiling > 0', 'typeof config.loadedSetCeiling === \'number\' && config.loadedSetCeiling > 0'],
  ['a zero or negative project ceiling is accepted', P, 'Number.isInteger(config.loadedSetCeiling) && config.loadedSetCeiling > 0', 'Number.isInteger(config.loadedSetCeiling)'],
  ['a zero project ceiling is accepted', P, 'Number.isInteger(config.loadedSetCeiling) && config.loadedSetCeiling > 0', 'Number.isInteger(config.loadedSetCeiling) && config.loadedSetCeiling >= 0'],
  ['a text project ceiling is accepted', P, 'Number.isInteger(config.loadedSetCeiling) && config.loadedSetCeiling > 0', '(config.loadedSetCeiling > 0)'],
  ['the project ceiling is not surfaced', P, '    loadedSetCeiling: config.loadedSetCeiling,\n', ''],
  ['an injected home is ignored, so only the process home stops the walk', P, 'const root = projectRootOf(directory, homes);', 'const root = projectRootOf(directory);'],
  ['no home stops the walk by default', P, 'export function projectRootOf(directory, homes = userHomes()) {', 'export function projectRootOf(directory, homes = []) {'],
  ['no command binds the project, so every project command runs without one', C, 'if (!PROJECT_COMMANDS.has(command)) return dispatch(command, args);', 'if (true) return dispatch(command, args);'],
  ['dismiss reads the project, so an invalid config stops it', C, "'supersede', 'recount', 'status', 'route']);", "'supersede', 'recount', 'status', 'route', 'dismiss']);"],
  ['status does not bind the project', C, "'supersede', 'recount', 'status', 'route']);", "'supersede', 'recount', 'route']);"],
  ['an invalid project config exits 1 like any other refusal', C, "speaker.complain('project.configUnreadable', { command, defect });\n\n    return 2;", "speaker.complain('project.configUnreadable', { command, defect });\n\n    return 1;"],
  ['the invalid-config refusal loses its Spanish half', C, "speaker.complain('project.configUnreadable', { command, defect });", 'console.error(`${command} REFUSED — the project configuration cannot be read: ${defect}. Nothing was changed.`);'],
  ['the init refusal outside a project loses its Spanish half', C, "speaker.complain('init.noProject');", "console.error('init REFUSED — no project holds this directory.');"],
  ['the loop context ignores the project scope', L, 'scopes: [GLOBAL_SCOPE, ...areaScopes(), ...(project === undefined ? [] : [project.scope, ...projectAreas])]', 'scopes: [GLOBAL_SCOPE, ...areaScopes()]'],
  ['the loop context drops the project ledger', L, 'ledgers: ledgerFiles({ project, home }),', 'ledgers: ledgerFiles({ project: undefined, home }),'],
  ['the loop context drops the worker contract', L, 'workerContracts: project?.workerContracts ?? [],', 'workerContracts: [],']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'],
  selftest: 'failure-capture/project.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
