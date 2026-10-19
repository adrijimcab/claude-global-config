#!/usr/bin/env node
/**
 * The decisions of the backlog prefilter, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules — a green unmutated baseline, an exactly-once target, a parse check — live in
 * `../mutation-proof/run-mutants.mjs` (the b100-am-ui project's own mutation harness, reused here since
 * it is a plain, dependency-free ESM module with no project-specific coupling).
 *
 * Both directions are represented: a mutant that makes the prefilter BLIND (a real unsatisfied announcement no
 * longer reaches the judge) and one that makes it LOUD (a clean or already-satisfied turn costs a model call). The
 * lexical intent logic of the earlier rounds (negations, infinitive frames, enclitics, record cues) is gone, so
 * its mutants are gone with it; the judge's own decisions are broken in `../judge-gate/mutants.mjs` and
 * `../pending-judge/mutants.mjs`.
 *
 * @es Las decisiones del prefiltro de backlog, rotas una a una. Ambas direcciones: el mutante que lo deja CIEGO
 * (un anuncio real ya no llega al juez) y el que lo vuelve RUIDOSO (un turno limpio cuesta una llamada). La
 * lógica léxica de intención de las rondas anteriores ya no existe, y sus mutantes con ella.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  // --- the window of the turn
  ['a continued stop stands aside again instead of being judged from the first stop\'s offset', 'decide.mjs', 'const continued = payload?.stop_hook_active === true;', 'const continued = payload?.stop_hook_active === true;\n  if (continued) return undefined;'],
  ['a continued stop moves the offset, so the rewrite\'s own save is lost to the next read', 'decide.mjs', 'if (!continued) writeState(', 'if (true) writeState('],
  ['the first stop stops moving the offset', 'decide.mjs', 'if (!continued) writeState(', 'if (false) writeState('],
  ['the pending-phrase requirement is gone: every turn reaches the judge', 'decide.mjs', 'const marker = findCandidate(message);', 'const marker = "x";'],
  ['a master-backlog save no longer satisfies a pending announcement', 'decide.mjs', 'if (hasMasterBacklogSave(tail) || hasMasterDocumentCommit(tail)) return undefined;', ''],
  ['an unreadable transcript stops failing open and reaches the judge instead', 'decide.mjs', 'if (tail === undefined) return undefined;', ''],
  ['the per-turn offset always reads as zero, so an EARLIER turn\'s save always satisfies a LATER one', 'decide.mjs', "const offset = typeof state?.offset === 'number' ? state.offset : 0;", 'const offset = 0;'],
  ['the save-tool-name requirement is dropped: a bare topic_key anywhere in the tail now counts as a save', 'master-save.mjs', 'if (!tail.includes(SAVE_TOOL_MARKER)) return false;', ''],
  ['the "-master" suffix stops mattering: any backlog/* topic_key satisfies, including a per-item note', 'master-save.mjs', "return typeof value === 'string' && value.startsWith(BACKLOG_NAMESPACE_PREFIX) && value.endsWith(MASTER_SUFFIX) && value.length > BACKLOG_NAMESPACE_PREFIX.length + MASTER_SUFFIX.length;", "return typeof value === 'string' && value.startsWith(BACKLOG_NAMESPACE_PREFIX);"],

  // --- the prefilter: broad, author's words only
  ['the marker list is never consulted: the finder always reports nothing', 'markers.mjs', 'return PENDING_MARKERS.find((marker) => haystack.includes(marker));', 'return undefined;'],
  ['the message is not lowercased, so a capitalised marker is missed', 'markers.mjs', 'const haystack = text.toLowerCase();', 'const haystack = text;'],
  ['lowercase "todo:" (everything:) counts as the TODO marker', 'markers.mjs', "text.includes('TODO:')", "text.toLowerCase().includes('todo:')"],
  ['the TODO: shape stops being recognised', 'markers.mjs', "if (text.includes('TODO:')) return 'TODO:';", ''],
  ['the bare «backlog» stops being a marker', 'markers.mjs', "  'backlog',\n", ''],
  ['the bare «pendiente» stops being a marker', 'markers.mjs', "  'pendiente',\n", ''],
  ['«later on» stops being a marker', 'markers.mjs', "  'later on',\n", ''],
  ['«aun no» stops being a marker', 'markers.mjs', "  'aun no',\n", ''],
  ['«queda por» stops being a marker', 'markers.mjs', "  'queda por',\n", ''],
  ['the finder stops removing quoted and code text', 'announcement.mjs', 'findPendingMarker(proseOutsideQuotes(message))', 'findPendingMarker(message)'],
  ['quoted and code text stops being removed, so a mention counts as an announcement', 'prose.mjs', "prose += ' ';", 'prose += text.slice(index, closeAt);'],
  ['quote lines stop being removed', 'prose.mjs', "line.trimStart().startsWith('>') ? '' : line", 'line'],
  ['a delimiter with no closer is dropped instead of kept as text', 'prose.mjs', 'prose += text[index];', "prose += '';"],

  // --- the versioned master document as a save
  ['a failed commit starts counting as a save', 'backlog-document-save.mjs', "node.is_error !== true", 'true'],
  ['a commit with no result starts counting as a save', 'backlog-document-save.mjs', 'return [...commits].some((id) => succeeded.has(id));', 'return commits.size > 0;'],
  ['the pathspec requirement is dropped', 'backlog-document-save.mjs', "command.includes(' -- ') || command.includes('--only')", 'true'],
  ['the commit requirement is dropped: reading the document counts', 'backlog-document-save.mjs', "words.includes('commit') && (words.includes('git') || command.includes('backup-repo.mjs'))", 'true'],
  ['the path must end the document no more: any path mentioning it counts', 'backlog-document-save.mjs', 'token.endsWith(DOCUMENT_SUFFIX)', 'token.includes("master-backlog")'],
  ['Windows separators stop being normalised', 'backlog-document-save.mjs', "token.replaceAll('\\\\', '/')", 'token'],
  ['the document commit stops satisfying the prefilter', 'decide.mjs', 'hasMasterBacklogSave(tail) || hasMasterDocumentCommit(tail)', 'hasMasterBacklogSave(tail)'],

  // --- the dismissal log, read back
  ['a dismissal of any session ends the question', 'dismissals.mjs', 'record?.session === session && ', ''],
  ['a dismissal at the very moment of the block counts', 'dismissals.mjs', 'Date.parse(record.at) > sinceMs', 'Date.parse(record.at) >= sinceMs'],
  ['an earlier dismissal counts', 'dismissals.mjs', 'Date.parse(record.at) > sinceMs', 'true'],
  ['a missing log throws instead of meaning no dismissal', 'dismissals.mjs', "if (error.code === 'ENOENT') return false;", ''],
  ['a torn line counts as a dismissal', 'dismissals.mjs', '    } catch {\n      return false;', '    } catch {\n      return true;'],

  // --- the mem_update face (found in live use: mem_update carries no topic_key of its own)
  ['a mem_update the store says is a master record no longer satisfies a pending announcement', 'decide.mjs', 'if (master) return undefined;', ''],
  ['the store failing to answer stops failing open: a mem_update with an unreadable store reaches the judge', 'decide.mjs', 'if (unresolved.length > 0) {', 'if (false) {'],
  ['the fail-open is no longer reported, so a degraded store leaves no evidence', 'decide.mjs', 'reportDegraded({ errors: unresolved });', ''],
  ['the production resolver is replaced by one that finds nothing, so the real store is never consulted', 'decide.mjs', 'resolveTopicKey = resolveTopicKeyById,', "resolveTopicKey = () => ({ error: 'not-found' }),"],
  ['a failed query stops counting as a store failure, so it reaches the judge instead of failing open', 'master-update.mjs', "new Set(['store-unreadable', 'query-failed'])", "new Set(['store-unreadable'])"],
  ['an unreadable store stops counting as a store failure, so it reaches the judge instead of failing open', 'master-update.mjs', "new Set(['store-unreadable', 'query-failed'])", "new Set(['query-failed'])"],
  ['not-found stops being an answer: an id the store does not hold fails open instead of reaching the judge', 'master-update.mjs', 'if (STORE_FAILURES.has(resolution.error)) unresolved.push(resolution.error);', 'unresolved.push(resolution.error);'],
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
    ...['decide.mjs', 'markers.mjs', 'backlog-document-save.mjs', 'prose.mjs', 'announcement.mjs', 'master-save.mjs', 'master-update.mjs', 'state.mjs', 'dismiss.mjs', 'dismissals.mjs', 'replay.mjs', 'selftest.mjs'].map((file) => `${THIS_DIRECTORY}/${file}`),
    `${THIS_DIRECTORY}/fixtures`,
    'backlog-owner-guard/resolve-topic-key.mjs',
    'hook-state', 'bilingual-output'
  ],
  selftest: `${THIS_DIRECTORY}/selftest.mjs`,
  mutants: MUTANTS.map(([label, file, original, replacement]) => [label, `${THIS_DIRECTORY}/${file}`, original, replacement])
});

process.exit(survivors === 0 ? 0 : 1);
