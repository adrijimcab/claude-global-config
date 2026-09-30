#!/usr/bin/env node
/**
 * The decisions of backlog-guard, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules — a green unmutated baseline, an exactly-once target, a parse check — live in
 * `../mutation-proof/run-mutants.mjs` (the b100-am-ui project's own mutation harness, reused here since
 * it is a plain, dependency-free ESM module with no project-specific coupling).
 *
 * Both directions are represented: a mutant that makes the guard BLIND (it stops blocking a real
 * unsatisfied pending announcement) and one that makes it LOUD (it blocks a clean turn, an already-
 * satisfied one, or a retry). The second kind is what gets a guard switched off.
 *
 * @es Las decisiones de backlog-guard, rotas una a una. Ambas direcciones representadas: el mutante que
 * lo deja CIEGO y el que lo vuelve RUIDOSO — el segundo es el que hace que alguien lo desactive.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  ['the loop bound is gone: a retry is judged again instead of passing through', 'decide.mjs', 'if (payload?.stop_hook_active === true) return undefined;', ''],
  ['the pending-phrase requirement is gone: every turn is judged', 'decide.mjs', 'const marker = findPendingMarker(message);', 'const marker = "x";'],
  ['a master-backlog save no longer satisfies a pending announcement', 'decide.mjs', 'if (hasMasterBacklogSave(tail)) return undefined;', ''],
  ['an unreadable transcript stops failing open and blocks instead', 'decide.mjs', 'if (tail === undefined) return undefined;', ''],
  ['the per-turn offset always reads as zero, so an EARLIER turn\'s save always satisfies a LATER one', 'decide.mjs', "const offset = typeof state?.offset === 'number' ? state.offset : 0;", 'const offset = 0;'],
  ['the save-tool-name requirement is dropped: a bare topic_key anywhere in the tail now counts as a save', 'master-save.mjs', 'if (!tail.includes(SAVE_TOOL_MARKER)) return false;', ''],
  ['the "-master" suffix stops mattering: any backlog/* topic_key satisfies, including a per-item note', 'master-save.mjs', "return typeof value === 'string' && value.startsWith(BACKLOG_NAMESPACE_PREFIX) && value.endsWith(MASTER_SUFFIX) && value.length > BACKLOG_NAMESPACE_PREFIX.length + MASTER_SUFFIX.length;", "return typeof value === 'string' && value.startsWith(BACKLOG_NAMESPACE_PREFIX);"],
  ['the marker list is never consulted: findPendingMarker always reports nothing', 'markers.mjs', 'return PENDING_MARKERS.find((marker) => haystack.includes(marker));', 'return undefined;'],
  ['the shim stops blocking a decided finding, so the harness lets the turn end', 'guard.mjs', 'if (finding === undefined) return undefined;', 'if (finding !== undefined) return undefined;'],
  ['the shim stops journaling its refusals, so no evidence survives the block', 'guard.mjs', 'journal({ at: new Date().toISOString(), session: finding.sessionId, marker: finding.marker, transcript: finding.transcriptPath });', ''],
  ['the standalone hook stops printing the block, so a decided refusal never reaches the harness', 'guard.mjs', 'if (output !== undefined) console.log(JSON.stringify(output));', ''],
  // --- the mem_update face (found in live use: mem_update carries no topic_key of its own)
  ['a mem_update of a known master id no longer satisfies a pending announcement', 'decide.mjs', 'if (hasMasterBacklogUpdate(tail, knownIds)) return undefined;', ''],
  ['this turn stops learning new id/topic_key pairings, so a same-turn mem_save+mem_update pair no longer satisfies', 'decide.mjs', 'const pairingsSeenNow = observedMasterIdPairings(tail);', 'const pairingsSeenNow = [];'],
  ['durably-known ids from earlier turns are never consulted, only what THIS turn just learned', 'decide.mjs', 'const knownIds = readKnownIds();', 'const knownIds = new Set();'],
  ['the mem_update tool-name requirement is dropped: a bare known id anywhere in the tail now counts', 'master-save.mjs', 'if (!tail.includes(UPDATE_TOOL_MARKER)) return false;', ''],
  ['hasMasterBacklogUpdate stops checking membership, so ANY id satisfies once mem_update appears', 'master-save.mjs', 'for (const id of idsInTail) if (known.has(id)) return true;', 'return true;'],
  ['observedMasterIdPairings stops filtering by master shape, so ANY topic_key teaches an id as master', 'master-save.mjs', 'if (!isMasterBacklogTopicKey(topicKey)) continue;', ''],
  ['learned id/topic_key pairings are no longer merged into the durable known-ids record', 'state.mjs', 'for (const { id } of pairings) known.add(id);', '']
];

const survivors = runMutants({
  fleetRoot: HERE,
  paths: ['decide.mjs', 'guard.mjs', 'markers.mjs', 'master-save.mjs', 'state.mjs', 'dismiss.mjs', 'selftest.mjs', 'guard.mjs.hook-registration.json'],
  selftest: 'selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
