/**
 * What a `SubagentStop` payload says about the agent that stopped: its id and the worktree it worked in. The
 * harness hands the hook `agent_id` and `agent_transcript_path` (`.../subagents/agent-<id>.jsonl`); the
 * worktree is the `worktreePath` of the `agent-<id>.meta.json` beside that transcript (an isolated worker), else
 * the first absolute path on the `TENANCY:` line of its brief (`worker-status/locate.mjs`, the one reading of
 * both). A payload that names neither yields nothing to reap.
 * @es Lo que dice un payload de `SubagentStop` sobre el agente que paró: su id y el worktree en que trabajó. El
 * harness entrega `agent_id` y `agent_transcript_path` (`.../subagents/agent-<id>.jsonl`); el worktree es el
 * `worktreePath` del `agent-<id>.meta.json` junto a ese transcript (un worker aislado), o si no la primera ruta
 * absoluta de la línea `TENANCY:` de su brief (`worker-status/locate.mjs`, la única lectura de ambos). Un payload
 * que no nombra ninguno no da nada que segar.
 */

import { readFileSync } from 'node:fs';

import { briefOf } from '../agent-liveness/liveness.mjs';
import { worktreeOf } from '../worker-status/locate.mjs';

const TRANSCRIPT_SUFFIX = '.jsonl';
const META_SUFFIX = '.meta.json';

/** The `worktreePath` the harness recorded beside a transcript, or `''`. @es El `worktreePath` junto a un transcript, o `''`. */
function recordedWorktree(transcript) {
  if (!transcript.endsWith(TRANSCRIPT_SUFFIX)) return '';

  try {
    const meta = JSON.parse(readFileSync(`${transcript.slice(0, -TRANSCRIPT_SUFFIX.length)}${META_SUFFIX}`, 'utf8'));

    return typeof meta?.worktreePath === 'string' ? meta.worktreePath : '';
  } catch {
    return '';
  }
}

/**
 * @param {object} payload the parsed `SubagentStop` payload
 * @returns {{ agentId?: string, worktree?: string }}
 * @es Devuelve el id y el worktree del agente que paró, los que el payload deje saber.
 */
export function stoppedAgentOf(payload, readBrief = briefOf) {
  const agentId = typeof payload?.agent_id === 'string' && payload.agent_id !== '' ? payload.agent_id : undefined;
  const transcript = typeof payload?.agent_transcript_path === 'string' && payload.agent_transcript_path !== '' ? payload.agent_transcript_path : undefined;
  const worktree = transcript === undefined ? undefined : worktreeOf({ worktreePath: recordedWorktree(transcript), transcript }, readBrief);

  return { ...(agentId === undefined ? {} : { agentId }), ...(worktree === undefined ? {} : { worktree }) };
}
