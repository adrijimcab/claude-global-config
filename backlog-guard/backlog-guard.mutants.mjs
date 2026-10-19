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
  ['the pending-phrase requirement is gone: every turn is judged', 'decide.mjs', 'const marker = findAnnouncement(message);', 'const marker = "x";'],
  ['a master-backlog save no longer satisfies a pending announcement', 'decide.mjs', 'if (hasMasterBacklogSave(tail) || hasMasterDocumentCommit(tail)) return undefined;', ''],
  ['an unreadable transcript stops failing open and blocks instead', 'decide.mjs', 'if (tail === undefined) return undefined;', ''],
  ['the per-turn offset always reads as zero, so an EARLIER turn\'s save always satisfies a LATER one', 'decide.mjs', "const offset = typeof state?.offset === 'number' ? state.offset : 0;", 'const offset = 0;'],
  ['the save-tool-name requirement is dropped: a bare topic_key anywhere in the tail now counts as a save', 'master-save.mjs', 'if (!tail.includes(SAVE_TOOL_MARKER)) return false;', ''],
  ['the "-master" suffix stops mattering: any backlog/* topic_key satisfies, including a per-item note', 'master-save.mjs', "return typeof value === 'string' && value.startsWith(BACKLOG_NAMESPACE_PREFIX) && value.endsWith(MASTER_SUFFIX) && value.length > BACKLOG_NAMESPACE_PREFIX.length + MASTER_SUFFIX.length;", "return typeof value === 'string' && value.startsWith(BACKLOG_NAMESPACE_PREFIX);"],
  ['the marker list is never consulted: findPendingMarker always reports nothing', 'markers.mjs', "return message.includes('TODO:') ? 'TODO:' : PENDING_MARKERS.find((marker) => announcesAt(haystack, marker));", 'return undefined;'],
  ['the shim stops blocking a decided finding, so the harness lets the turn end', 'guard.mjs', 'if (finding === undefined) return undefined;', 'if (finding !== undefined) return undefined;'],
  ['the shim stops journaling its refusals, so no evidence survives the block', 'guard.mjs', 'journal({ at: new Date().toISOString(), session: finding.sessionId, marker: finding.marker, transcript: finding.transcriptPath });', ''],
  ['the standalone hook stops printing the block, so a decided refusal never reaches the harness', 'guard.mjs', 'if (output !== undefined) console.log(JSON.stringify(output));', ''],
  // --- intent: announcement, not words
  ['quoted and code text stops being removed, so a mention counts as an announcement', 'prose.mjs', "prose += ' ';", 'prose += text.slice(index, closeAt);'],
  ['quote lines stop being removed', 'prose.mjs', "line.trimStart().startsWith('>') ? '' : line", 'line'],
  ['a delimiter with no closer is dropped instead of kept as text', 'prose.mjs', 'prose += text[index];', "prose += '';"],
  ['an observation reference stops counting as a record', 'announcement.mjs', "character === '#' && sentence[index + 1] >= '0'", "character === '#' && false && sentence[index + 1] >= '0'"],
  ['the previous sentence stops being consulted for a record', 'announcement.mjs', 'Math.max(0, index - 1)', 'index'],
  ['the next sentence stops being consulted for a record', 'announcement.mjs', 'index + 2', 'index + 1'],
  ['a recorded cue in the sentence stops counting', 'announcement.mjs', 'RECORDED_CUES.some((cue) => sentence.toLowerCase().includes(cue))', 'false'],
  ['a decided record no longer silences an announcement', 'announcement.mjs', '!pointsAtRecord(sentences, index)', 'true'],
  ['lowercase "todo:" (everything:) counts as the TODO marker', 'markers.mjs', "message.includes('TODO:')", "haystack.includes('todo:')"],
  ['the decision judges words again instead of announcements', 'decide.mjs', 'const marker = findAnnouncement(message);', "const marker = message.includes('backlog') ? 'backlog' : undefined;"],
  // --- phrase forms, not bare verbs (2026-10-18): each marker form and each voiding rule, broken once
  ['«lo sumo» alone is a marker again, so «lo sumo al checkpoint» fires', 'markers.mjs', "'lo sumo a la lista',", "'lo sumo',"],
  ['«lo agrego» alone is a marker again, so a conditional offer fires', 'markers.mjs', "'lo agrego a la lista',", "'lo agrego',"],
  ['«lo sumo a la lista» stops announcing', 'markers.mjs', "'lo sumo a la lista',", "'zz sumo a la lista',"],
  ['«lo agrego a la lista» stops announcing', 'markers.mjs', "'lo agrego a la lista',", "'zz agrego a la lista',"],
  ['the bare «lo anoto» stops announcing', 'markers.mjs', "'lo anoto',", "'zz anoto',"],
  ['the bare «lo apunto» stops announcing', 'markers.mjs', "'lo apunto',", "'zz apunto',"],
  ['«lo dejo pendiente» stops announcing', 'markers.mjs', "'lo dejo pendiente',", "'zz dejo pendiente',"],
  ['«queda pendiente» stops announcing', 'markers.mjs', "'queda pendiente',", "'zz queda pendiente',"],
  ['«quedan pendientes» stops announcing', 'markers.mjs', "'quedan pendientes',", "'zz quedan pendientes',"],
  ['«quedan por» no longer needs an infinitive', 'markers.mjs', "['queda por', 'quedan por']", "['queda por']"],
  ['«queda por» no longer needs an infinitive', 'markers.mjs', "['queda por', 'quedan por']", "['quedan por']"],
  ['no marker needs an infinitive, so «queda por debajo» fires', 'markers.mjs', '(!INFINITIVE_FRAMES.includes(marker) || infinitiveFollows(', '(true || infinitiveFollows('],
  ['an infinitive in -ar stops counting', 'markers.mjs', "['ar', 'er', 'ir']", "['er', 'ir']"],
  ['an infinitive in -er stops counting', 'markers.mjs', "['ar', 'er', 'ir']", "['ar', 'ir']"],
  ['an infinitive in -ir stops counting', 'markers.mjs', "['ar', 'er', 'ir']", "['ar', 'er']"],
  ['nothing before the infinitive is skipped', 'markers.mjs', "while (start < haystack.length && (haystack[start].trim() === '' || WORD_WRAPPERS.includes(haystack[start]))) start += 1;", ''],
  ['only a plain space before the infinitive is skipped', 'markers.mjs', "haystack[start].trim() === '' || WORD_WRAPPERS", "haystack[start] === ' ' || WORD_WRAPPERS"],
  ['markdown wrappers before the infinitive are not skipped', 'markers.mjs', " || WORD_WRAPPERS.includes(haystack[start])))", '))'],
  ['punctuation after the infinitive stays in the word', 'markers.mjs', '!WORD_STOPS.includes(haystack[end])', "haystack[end] !== ' '"],
  ['a carriage return after the infinitive stays in the word', 'markers.mjs', '\\n\\r\\t', '\\n\\t'],
  ['an em dash after the infinitive stays in the word', 'markers.mjs', '()—–/', '()–/'],
  ['a slash after the infinitive stays in the word', 'markers.mjs', '–/"', '–"'],
  ['a straight quote after the infinitive stays in the word', 'markers.mjs', '/"\'', "/'"],
  ['a closing guillemet after the infinitive stays in the word', 'markers.mjs', '«»', '«'],
  ['a closing curly quote after the infinitive stays in the word', 'markers.mjs', '“”', '“'],
  ['markdown wrappers after the infinitive stay in the word', 'markers.mjs', '‘’${WORD_WRAPPERS}`', '‘’`'],
  ['an enclitic infinitive stops counting', 'markers.mjs', 'ENCLITICS.some((pronoun) => word.endsWith(pronoun) && ', 'ENCLITICS.some((pronoun) => false && '],
  ['the bare infinitive stops counting', 'markers.mjs', 'return endsAsInfinitive(word) || ', 'return '],
  ['any ending is read as a pronoun', 'markers.mjs', '(pronoun) => word.endsWith(pronoun) && word.length', '(pronoun) => word.length'],
  ['any stem takes an enclitic, so «perla» fires', 'markers.mjs', '>= MIN_ENCLITIC_STEM', '>= 0'],
  ['a four-character stem takes an enclitic, so «charla» fires', 'markers.mjs', 'const MIN_ENCLITIC_STEM = 5;', 'const MIN_ENCLITIC_STEM = 4;'],
  ['the stem before a pronoun need not be an infinitive', 'markers.mjs', ' && endsAsInfinitive(word.slice(0, -pronoun.length))', ''],
  ['an infinitive with «lo» stops counting', 'markers.mjs', "['lo', 'la', 'los', 'las', 'le', 'les', 'se']", "['la', 'los', 'las', 'le', 'les', 'se']"],
  ['an infinitive with «la» stops counting', 'markers.mjs', "['lo', 'la', 'los', 'las', 'le', 'les', 'se']", "['lo', 'los', 'las', 'le', 'les', 'se']"],
  ['an infinitive with «los» stops counting', 'markers.mjs', "['lo', 'la', 'los', 'las', 'le', 'les', 'se']", "['lo', 'la', 'las', 'le', 'les', 'se']"],
  ['an infinitive with «las» stops counting', 'markers.mjs', "['lo', 'la', 'los', 'las', 'le', 'les', 'se']", "['lo', 'la', 'los', 'le', 'les', 'se']"],
  ['an infinitive with «le» stops counting', 'markers.mjs', "['lo', 'la', 'los', 'las', 'le', 'les', 'se']", "['lo', 'la', 'los', 'las', 'les', 'se']"],
  ['an infinitive with «les» stops counting', 'markers.mjs', "['lo', 'la', 'los', 'las', 'le', 'les', 'se']", "['lo', 'la', 'los', 'las', 'le', 'se']"],
  ['an infinitive with «se» stops counting', 'markers.mjs', "['lo', 'la', 'los', 'las', 'le', 'les', 'se']", "['lo', 'la', 'los', 'las', 'le', 'les']"],
  ['a negator before a marker no longer voids it', 'markers.mjs', 'if (!isNegatedBefore(haystack, at) && (', 'if (true && ('],
  ['a NOT-YET negation voids the marker, so «todavía no lo anoto» stays silent', 'markers.mjs', ' && !endsWithWords(before, NOT_YET_PREFIXES)', ''],
  ['«todavía no» stops counting as NOT-YET', 'markers.mjs', "['todavía no ', 'todavia no ', 'aún no ', 'aun no ', 'still not ']", "['todavia no ', 'aún no ', 'aun no ', 'still not ']"],
  ['«todavia no» stops counting as NOT-YET', 'markers.mjs', "['todavía no ', 'todavia no ', 'aún no ', 'aun no ', 'still not ']", "['todavía no ', 'aún no ', 'aun no ', 'still not ']"],
  ['«aún no» stops counting as NOT-YET', 'markers.mjs', "['todavía no ', 'todavia no ', 'aún no ', 'aun no ', 'still not ']", "['todavía no ', 'todavia no ', 'aun no ', 'still not ']"],
  ['«aun no» stops counting as NOT-YET', 'markers.mjs', "['todavía no ', 'todavia no ', 'aún no ', 'aun no ', 'still not ']", "['todavía no ', 'todavia no ', 'aún no ', 'still not ']"],
  ['«still not» stops counting as NOT-YET', 'markers.mjs', "['todavía no ', 'todavia no ', 'aún no ', 'aun no ', 'still not ']", "['todavía no ', 'todavia no ', 'aún no ', 'aun no ']"],
  ['only the first occurrence of a marker is judged', 'markers.mjs', 'at = haystack.indexOf(marker, at + 1))', 'at = -1)'],
  ['«no» stops voiding a marker', 'markers.mjs', "['no ', 'nada ', 'no hace ', 'no hay ', 'not ', 'no new ']", "['nada ', 'no hace ', 'no hay ', 'not ', 'no new ']"],
  ['«nada» stops voiding a marker', 'markers.mjs', "['no ', 'nada ', 'no hace ', 'no hay ', 'not ', 'no new ']", "['no ', 'no hace ', 'no hay ', 'not ', 'no new ']"],
  ['«no hace» stops voiding a marker', 'markers.mjs', "['no ', 'nada ', 'no hace ', 'no hay ', 'not ', 'no new ']", "['no ', 'nada ', 'no hay ', 'not ', 'no new ']"],
  ['«no hay» stops voiding a marker', 'markers.mjs', "['no ', 'nada ', 'no hace ', 'no hay ', 'not ', 'no new ']", "['no ', 'nada ', 'no hace ', 'not ', 'no new ']"],
  ['«not» stops voiding a marker', 'markers.mjs', "['no ', 'nada ', 'no hace ', 'no hay ', 'not ', 'no new ']", "['no ', 'nada ', 'no hace ', 'no hay ', 'no new ']"],
  ['«no new» stops voiding a marker', 'markers.mjs', "['no ', 'nada ', 'no hace ', 'no hay ', 'not ', 'no new ']", "['no ', 'nada ', 'no hace ', 'no hay ', 'not ']"],
  ['a voiding prefix no longer has to be a whole word', 'markers.mjs', 'previous.toLowerCase() === previous.toUpperCase()', 'true'],
  ['a prefix at the very start of the text is read as inside a word', 'markers.mjs', "?? ' ';", "?? 'a';"],
  ['a voiding prefix is no longer required to END the text before the marker', 'markers.mjs', 'return text.endsWith(prefix) && ', 'return '],
  // --- the versioned master document as a save, and the bilingual refusal
  ['a failed commit starts counting as a save', 'backlog-document-save.mjs', "node.is_error !== true", 'true'],
  ['a commit with no result starts counting as a save', 'backlog-document-save.mjs', 'return [...commits].some((id) => succeeded.has(id));', 'return commits.size > 0;'],
  ['the pathspec requirement is dropped', 'backlog-document-save.mjs', "command.includes(' -- ') || command.includes('--only')", 'true'],
  ['the commit requirement is dropped: reading the document counts', 'backlog-document-save.mjs', "words.includes('commit') && (words.includes('git') || command.includes('backup-repo.mjs'))", 'true'],
  ['the path must end the document no more: any path mentioning it counts', 'backlog-document-save.mjs', 'token.endsWith(DOCUMENT_SUFFIX)', 'token.includes("master-backlog")'],
  ['Windows separators stop being normalised', 'backlog-document-save.mjs', "token.replaceAll('\\\\', '/')", 'token'],
  ['the document commit stops satisfying the guard', 'decide.mjs', 'hasMasterBacklogSave(tail) || hasMasterDocumentCommit(tail)', 'hasMasterBacklogSave(tail)'],
  ['the refusal loses its Spanish half', 'guard.mjs', "`@es BACKLOG-GUARD SALTÓ por la frase: «${marker}».`", "''"],
  ['the refusal stops naming the phrase in Spanish', 'guard.mjs', "nuevo («' + marker + '») y este", "nuevo («frase») y este"],
  ['the refusal stops offering the document commit', 'guard.mjs', "o commiteá el documento versionado", 'o algo distinto'],
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
    ...['decide.mjs', 'guard.mjs', 'markers.mjs', 'backlog-document-save.mjs', 'prose.mjs', 'announcement.mjs', 'master-save.mjs', 'master-update.mjs', 'state.mjs', 'dismiss.mjs', 'selftest.mjs', 'guard.mjs.hook-registration.json'].map((file) => `${THIS_DIRECTORY}/${file}`),
    'backlog-owner-guard/resolve-topic-key.mjs',
    'hook-state', 'bilingual-output'
  ],
  selftest: `${THIS_DIRECTORY}/selftest.mjs`,
  mutants: MUTANTS.map(([label, file, original, replacement]) => [label, `${THIS_DIRECTORY}/${file}`, original, replacement])
});

process.exit(survivors === 0 ? 0 : 1);
