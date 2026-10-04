#!/usr/bin/env node
/**
 * The decisions of `identify-caller.mjs`, each broken once, that `selftest.mjs` must catch. The runner
 * lives in `../mutation-proof/run-mutants.mjs`.
 * @es Las decisiones de `identify-caller.mjs`, rotas una a una, que `selftest.mjs` debe detectar.
 */

import path from 'node:path';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FILE = 'hook-caller/identify-caller.mjs';

const MUTANTS = [
  ['requiring BOTH signals loses a subagent identified by only one', FILE, 'return hasAgentId || hasSubagentTranscript;', 'return hasAgentId && hasSubagentTranscript;'],
  ['the agent_id signal is ignored', FILE, "const hasAgentId = typeof agentId === 'string' && agentId.length > 0;", 'const hasAgentId = false;'],
  ['an empty agent_id counts as a subagent', FILE, "typeof agentId === 'string' && agentId.length > 0", "typeof agentId === 'string'"],
  ['the transcript signal is ignored', FILE, "const hasSubagentTranscript = typeof transcriptPath === 'string' && isUnderSubagentDirectory(transcriptPath);", 'const hasSubagentTranscript = false;'],
  ['the transcript signal becomes a substring match', FILE, "return transcriptPath.split('\\\\').join('/').split('/').includes(SUBAGENT_TRANSCRIPT_DIRECTORY);", 'return transcriptPath.includes(SUBAGENT_TRANSCRIPT_DIRECTORY);'],
  ['backslash separators are no longer split', FILE, "transcriptPath.split('\\\\').join('/')", 'transcriptPath'],
  ['a non-object payload is treated as a subagent', FILE, "if (payload === null || typeof payload !== 'object') return false;", "if (payload === null || typeof payload !== 'object') return true;"]
];

const survivors = runMutants({
  fleetRoot: path.join(import.meta.dirname, '..'),
  paths: ['hook-caller', 'hook-payloads'],
  selftest: 'hook-caller/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
