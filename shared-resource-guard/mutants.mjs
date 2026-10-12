#!/usr/bin/env node
/**
 * The decisions of shared-resource-guard (who is refused, what is refused, what the refusal says), each
 * broken once, that `selftest.mjs` must catch. The runner and its rules (green baseline first, exactly-once
 * targets, parse-checked mutants) live in `../mutation-proof/run-mutants.mjs`. The recognisers and the schema
 * have their own campaigns beside this one (`actions.mutants.mjs`, `declaration.mutants.mjs`).
 *
 * @es Las decisiones de shared-resource-guard (a quién se rechaza, qué se rechaza, qué dice el rechazo),
 * rotas una a una, que `selftest.mjs` debe cazar. Los reconocedores y el esquema tienen sus propias campañas.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const GUARD = 'shared-resource-guard/guard.mjs';
const DECIDE = 'shared-resource-guard/decide.mjs';
const REFUSAL = 'shared-resource-guard/refusal.mjs';

const MUTANTS = [
  ['the orchestrator is treated as a worker, so it is refused too', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', ''],
  ['every caller is allowed, so a worker may control a shared resource', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', 'return undefined;'],
  ['PowerShell is not a shell this guard reads', GUARD, 'if (dialect === undefined || typeof command !== \'string\') return undefined;', 'if (dialect !== \'bash\' || typeof command !== \'string\') return undefined;'],
  ['a refusal is never produced', GUARD, 'if (refusal === undefined) return undefined;', 'return undefined;'],
  ['an internal failure refuses the command instead of failing open', GUARD, 'return undefined; // fail open: a malfunction of the decision must never block a command', 'throw new Error(\'boom\');'],
  ['an unusable declaration lets the worker through', DECIDE, 'if (declaration.status === \'invalid\') return { reason: invalidDeclarationText(declaration.file, declaration.problems) };', 'if (declaration.status === \'invalid\') return undefined;'],
  ['a control action is found but never refused', DECIDE, 'return action === undefined ? undefined : {', 'return true ? undefined : {'],
  ['the project is looked up from the payload cwd only, never the main checkout of a worktree', DECIDE, 'projectRootFor(payload, SHARED_RESOURCES_FILE, env)', 'projectRootFor({ cwd: payload.cwd }, SHARED_RESOURCES_FILE, {})'],
  ['the refusal wording ignores the kind of action', REFUSAL, 'MESSAGES[action.kind]', 'MESSAGES.start'],
  ['a stop is worded as a start', REFUSAL, 'stop: actionRefusal(\'stop\', \'detener\'),', 'stop: actionRefusal(\'start\', \'detener\'),'],
  ['the refusal stops telling the worker to ask the orchestrator', REFUSAL, 'ask the orchestrator: say what you need and why in your report or a message,', 'ask someone: say what you need and why in your report or a message,'],
  ['the English half loses the incident', REFUSAL, '\'FRT_URL, then stopped PROD and its guard, and three other writers lost the backend they were using.\'', '\'FRT_URL.\''],
  ['the resource description is not shown', REFUSAL, '\'RESOURCE. {description}\',\n      \'\',\n      \'WHY. A shared', '\'RESOURCE.\',\n      \'\',\n      \'WHY. A shared'],
  ['the offending command is not named', REFUSAL, '\'COMMAND. {command}\',', '\'COMMAND.\','],
  ['the Spanish half loses its accent mark', REFUSAL, 'RECHAZÓ este comando: un worker delegado', 'RECHAZO este comando: un worker delegado'],
  ['the invalid-declaration refusal drops the problems', REFUSAL, '\'PROBLEMS.\',\n      \'{problems}\',', '\'PROBLEMS.\',\n      \'(see the file)\','],
  ['the file is not named in the invalid-declaration refusal', REFUSAL, 'return render(MESSAGES.invalid, { file, problems:', 'return render(MESSAGES.invalid, { file: \'(the declaration)\', problems:']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-payloads'],
  selftest: 'shared-resource-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
