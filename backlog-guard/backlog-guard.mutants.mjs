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
  ['an id updated twice is returned twice, so the store is asked about it twice', 'master-update.mjs', 'return [...ids];', 'return [...ids, ...ids];'],
  ['the mem_update tool-name requirement is dropped: a bare known id anywhere in the tail now counts', 'master-save.mjs', 'if (!tail.includes(UPDATE_TOOL_MARKER)) return false;', ''],
  ['hasMasterBacklogUpdate stops checking membership, so ANY id satisfies once mem_update appears', 'master-save.mjs', 'for (const id of idsInTail) if (known.has(id)) return true;', 'return true;'],
  ['observedMasterIdPairings stops filtering by master shape, so ANY topic_key teaches an id as master', 'master-save.mjs', 'if (!isMasterBacklogTopicKey(topicKey)) continue;', ''],
  // --- the mem_get_observation metadata-footer source (found missing in live use the day after the
  //     mem_update fix shipped: a READ's result footer teaches an id/topic_key pairing too)
  ['the metadata-footer source is never consulted, so a mem_get_observation result teaches nothing', 'master-save.mjs', 'return [...pairings, ...observedFromResultMetadata(text)];', 'return pairings;'],
  ['a Topic: line with no master shape is no longer filtered out, so ANY topic teaches a pairing', 'master-save.mjs', 'if (isMasterBacklogTopicKey(topicKey)) pairings.push({ id, topicKey });', 'pairings.push({ id, topicKey });'],
  ['a result with no Topic: line at all stops being skipped, reading past the window instead', 'master-save.mjs', 'if (topicAt === -1) continue;', ''],
  // --- the second live defect, found the day after the first fix shipped: a real transcript's own
  //     bytes escape the "result" marker and its internal newlines at DIFFERENT depths.
  ['the escaped "result" marker form is dropped, so a real (single-escaped) mem_get_observation result teaches nothing', 'master-save.mjs', "const RESULT_ID_MARKERS = ['\"result\":\"#', '\\\\\"result\\\\\":\\\\\"#'];", "const RESULT_ID_MARKERS = ['\"result\":\"#'];"],
  ['the doubly-escaped newline form is dropped, so a real metadata footer\'s topic value keeps a trailing backslash and fails the -master check', 'master-save.mjs', "const doubleEscaped = text.indexOf('\\\\\\\\n', from);", 'const doubleEscaped = -1;'],
  // --- the third live defect (2026-10-02): the footer search is bounded by the transcript RECORD, not
  //     by a fixed character window (a 27 KB master backlog has its footer ~20000 characters in).
  ['the fixed 8000-character window is back, so a large master record teaches nothing', 'master-save.mjs', 'const window = text.slice(idEnd, recordEndAfter(text, idEnd));', 'const window = text.slice(idEnd, idEnd + 8000);'],
  ['the record bound is gone, so the NEXT record\'s Topic footer pairs with this record\'s id', 'master-save.mjs', 'const window = text.slice(idEnd, recordEndAfter(text, idEnd));', 'const window = text.slice(idEnd);'],
  ['a record with no newline after it loses its end, so the last topic value is cut', 'master-save.mjs', 'return newlineAt === -1 ? text.length : newlineAt;', 'return newlineAt;']
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
    ...['decide.mjs', 'guard.mjs', 'markers.mjs', 'master-save.mjs', 'master-update.mjs', 'state.mjs', 'dismiss.mjs', 'selftest.mjs', 'guard.mjs.hook-registration.json', 'fixtures'].map((file) => `${THIS_DIRECTORY}/${file}`),
    'backlog-owner-guard/resolve-topic-key.mjs'
  ],
  selftest: `${THIS_DIRECTORY}/selftest.mjs`,
  mutants: MUTANTS.map(([label, file, original, replacement]) => [label, `${THIS_DIRECTORY}/${file}`, original, replacement])
});

process.exit(survivors === 0 ? 0 : 1);
