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
  ['a mem_update the store says is a master record no longer satisfies a pending announcement', 'decide.mjs', 'if (master) return undefined;', ''],
  ['the store failing to answer stops failing open: a mem_update with an unreadable store blocks the turn', 'decide.mjs', 'if (unresolved.length > 0) {', 'if (false) {'],
  ['the fail-open is no longer reported, so a degraded store leaves no evidence', 'decide.mjs', 'reportDegraded({ errors: unresolved });', ''],
  ['the production resolver is replaced by one that finds nothing, so the real store is never consulted', 'decide.mjs', 'resolveTopicKey = resolveTopicKeyById,', "resolveTopicKey = () => ({ error: 'not-found' }),"],
  ['the shim stops journaling the fail-open, so a degraded store leaves no evidence on disk', 'guard.mjs', "reportDegraded: ({ errors }) => journal({ at: new Date().toISOString(), session: payload?.session_id, kind: 'store-unreadable-fail-open', errors, transcript: payload?.transcript_path })", 'reportDegraded: () => {}'],
  ['a failed query stops counting as a store failure, so it blocks instead of failing open', 'master-update.mjs', "new Set(['store-unreadable', 'query-failed'])", "new Set(['store-unreadable'])"],
  ['an unreadable store stops counting as a store failure, so it blocks instead of failing open', 'master-update.mjs', "new Set(['store-unreadable', 'query-failed'])", "new Set(['query-failed'])"],
  ['not-found stops being an answer: an id the store does not hold fails open instead of blocking', 'master-update.mjs', 'if (STORE_FAILURES.has(resolution.error)) unresolved.push(resolution.error);', 'unresolved.push(resolution.error);'],
  ['an error resolution is no longer recognised, so an unreadable store reads as a plain non-master', 'master-update.mjs', "if ('error' in resolution) {", 'if (false) {'],
  ['the master-shape check on the resolved topic_key is gone: ANY existing observation satisfies the turn', 'master-update.mjs', 'if (isMasterBacklogTopicKey(resolution.topicKey)) return { master: true, unresolved: [] };', 'return { master: true, unresolved: [] };'],
  ['a non-numeric id is asked about the store as if it were an observation id', 'master-update.mjs', 'Number.isInteger(node.input.id)', 'node.input.id !== undefined'],
  ['any tool call with an input id counts as a mem_update, including a READ of the master record', 'master-update.mjs', 'node.name.endsWith(UPDATE_TOOL_SUFFIX)', 'node.name.length > 0'],
  ['the transcript walk stops descending, so a real nested tool_use block is never found', 'master-update.mjs', 'for (const child of Object.values(value)) yield* objectsIn(child);', ''],
  ['an id updated twice is returned twice, so the store is asked about it twice', 'master-update.mjs', 'return [...ids];', 'return [...ids, ...ids];']
];

// The campaign runs from the fleet root because `decide.mjs` imports the shared store resolver from the
// sibling `backlog-owner-guard/` directory: a sandbox holding only this directory could not load it.
// Mutant files are written relative to this directory and prefixed here; `resolve-topic-key.mjs` is
// mutated by `backlog-owner-guard/mutants.mjs`, which owns it.
// @es La campaña corre desde la raíz de la flota porque `decide.mjs` importa el resolutor del almacén del
// directorio hermano `backlog-owner-guard/`. Las rutas de los mutantes son relativas a este directorio y
// se prefijan aquí; `resolve-topic-key.mjs` lo muta `backlog-owner-guard/mutants.mjs`, su dueño.
const THIS_DIRECTORY = 'backlog-guard';
const FLEET_ROOT = path.resolve(HERE, '..');

const survivors = runMutants({
  fleetRoot: FLEET_ROOT,
  paths: [
    ...['decide.mjs', 'guard.mjs', 'markers.mjs', 'master-save.mjs', 'master-update.mjs', 'state.mjs', 'dismiss.mjs', 'selftest.mjs', 'guard.mjs.hook-registration.json'].map((file) => `${THIS_DIRECTORY}/${file}`),
    'backlog-owner-guard/resolve-topic-key.mjs',
    'hook-state', 'bilingual-output'
  ],
  selftest: `${THIS_DIRECTORY}/selftest.mjs`,
  mutants: MUTANTS.map(([label, file, original, replacement]) => [label, `${THIS_DIRECTORY}/${file}`, original, replacement])
});

process.exit(survivors === 0 ? 0 : 1);
