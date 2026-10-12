#!/usr/bin/env node
/**
 * Mutant campaign of the SubagentStop hook and of the reading of its payload: each mutant reverts ONE decision of
 * `reap-on-subagent-stop.mjs` or `stopped-agent.mjs`, and `reap-on-subagent-stop.selftest.mjs` must go red by
 * assertion. Exit 2 = NOT MEASURED (no shared runner).
 * @es Campaña de mutantes del hook de SubagentStop y de la lectura de su payload: cada mutante revierte UNA
 * decisión y el selftest debe ponerse rojo por aserción. Salida 2 = NO MEDIDO.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = path.resolve(import.meta.dirname, '..', 'mutation-proof', 'run-mutants.mjs');
const H = 'process-reaper/reap-on-subagent-stop.mjs';
const S = 'process-reaper/stopped-agent.mjs';

const MUTANTS = [
  // reap-on-subagent-stop.mjs
  ['another event is reaped too', H, "if (payload?.hook_event_name !== undefined && payload.hook_event_name !== EVENT) return undefined;", ''],
  ['a BOM before the JSON is not read', H, 'JSON.parse(raw.charCodeAt(0) === BOM ? raw.slice(1) : raw)', 'JSON.parse(raw)'],
  ['the hook returns a verdict', H, '  return undefined;\n}\n\nfunction main()', "  return { decision: 'block' };\n}\n\nfunction main()"],
  ['the worktree is not given to the reaper', H, 'reap({ worktree, agentId })', 'reap({ agentId })'],
  ['the agent id is not given to the reaper', H, 'reap({ worktree, agentId })', 'reap({ worktree })'],
  ['the payload keys are not sorted', H, 'Object.keys(payload).sort()', 'Object.keys(payload)'],
  ['a malfunction is not recorded', H, "record(stateDir, { malfunction: error instanceof Error ? error.message : String(error) });", ''],
  ['a malfunction escapes the hook', H, "  } catch (error) {\n    record(stateDir", "  } catch (error) {\n    throw error;\n    record(stateDir"],
  ['the survivors are not counted in the record', H, 'survivors: outcome.survivors.length', 'survivors: 0'],
  ['the refusal is not recorded', H, 'refused: outcome.refused, ', ''],

  // stopped-agent.mjs
  ['the meta file is not read', S, "if (!transcript.endsWith(TRANSCRIPT_SUFFIX)) return '';", "return '';"],
  ['a transcript that is not a .jsonl is cut anyway', S, "if (!transcript.endsWith(TRANSCRIPT_SUFFIX)) return '';", ''],
  ['a non-string worktreePath is accepted', S, "typeof meta?.worktreePath === 'string' ? meta.worktreePath : ''", 'meta?.worktreePath'],
  ['an empty agent id is an id', S, "payload.agent_id !== '' ? payload.agent_id", 'true ? payload.agent_id'],
  ['the brief is not consulted when the meta is empty', S, 'worktreeOf({ worktreePath: recordedWorktree(transcript), transcript }, readBrief)', 'recordedWorktree(transcript) || undefined'],
  ['the worktree is looked up without a transcript', S, 'transcript === undefined ? undefined :', 'false ? undefined :']
];

if (!existsSync(RUNNER)) {
  console.error(`NOT MEASURED — shared runner missing at ${RUNNER}. @es NO MEDIDO — falta el runner compartido en ${RUNNER}.`);
  process.exit(2);
}

const { runMutants } = await import(pathToFileURL(RUNNER).href);

const survivors = runMutants({
  fleetRoot: path.resolve(import.meta.dirname, '..'),
  paths: ['process-reaper', 'process-control', 'worker-status', 'agent-liveness', 'bilingual-output', 'hook-state', 'hook-dispatch', 'failure-capture'],
  selftest: 'process-reaper/reap-on-subagent-stop.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 180_000
});

process.exit(survivors === 0 ? 0 : 1);
