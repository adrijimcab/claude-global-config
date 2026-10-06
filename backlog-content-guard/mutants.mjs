#!/usr/bin/env node
/**
 * The decisions of `backlog-content-guard`, each broken once, that `selftest.mjs` must catch. The runner
 * and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * Both directions: mutants that let a loss through (the defect this guard exists to close) and mutants
 * that refuse a write that loses nothing (reorder, reflow, addition, a properly closed item), the second
 * kind being what gets a guard switched off within the hour.
 *
 * @es Las decisiones de la guardia, rotas una a una. Ambas direcciones: las que dejan pasar una pérdida y
 * las que rechazan una escritura que no pierde nada (lo que hace que alguien apague la guardia).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const D = 'backlog-content-guard/decide.mjs';
const L = 'backlog-content-guard/loss.mjs';
const I = 'backlog-content-guard/items.mjs';
const R = 'backlog-content-guard/current-revision.mjs';
const G = 'backlog-content-guard/guard.mjs';
const A = 'backlog-content-guard/archive.mjs';
const R2 = 'backlog-content-guard/reason.mjs';

const MUTANTS = [
  // --- loss.mjs: preserved / retired ---
  ['nothing is ever reported as dropped', L, '.filter((item) => !nextHaystack.includes(item))', '.filter((item) => false)'],
  ['everything counts as dropped, even what the new content still holds', L, '.filter((item) => !nextHaystack.includes(item))', '.filter((item) => true)'],
  ['a closure line excuses nothing', L, '.filter((item) => !closureLines.some((line) => line.includes(anchorOf(item))));', '.filter((item) => true);'],
  ['ANY closure line excuses every dropped item (the anchor is ignored)', L, '.filter((item) => !closureLines.some((line) => line.includes(anchorOf(item))));', '.filter((item) => closureLines.length === 0);'],
  ['an anchor that is not in the closure line still excuses', L, '!closureLines.some((line) => line.includes(anchorOf(item)))', '!closureLines.some((line) => line.length > 0)'],
  ['the anchor shrinks to one word', L, 'export const ANCHOR_TOKENS = 6;', 'export const ANCHOR_TOKENS = 1;'],
  ['a closure word matches inside a longer word', L, 'return normalizedItem.split(\' \').some((token) => CLOSURE_WORDS.has(stripEdgePunctuation(token)));', 'return [...CLOSURE_WORDS].some((word) => normalizedItem.includes(word));'],
  ['the Spanish closure word is not recognised', L, "'cerrado', ", ''],
  ['the superseded closure word is not recognised', L, "'superseded', ", ''],
  ['surrounding punctuation is not stripped from a closure token', L, 'CLOSURE_WORDS.has(stripEdgePunctuation(token))', 'CLOSURE_WORDS.has(token)'],
  ['trivial one-word items are protected as content', I, 'export const MIN_MEANINGFUL_TOKENS = 2;', 'export const MIN_MEANINGFUL_TOKENS = 0;'],
  ['real content needs three words to be protected', I, 'export const MIN_MEANINGFUL_TOKENS = 2;', 'export const MIN_MEANINGFUL_TOKENS = 3;'],

  // --- items.mjs: the comparison unit ---
  ['continuation lines are separate items, so a reflow reads as a deletion', I, '      open.push(line);', '      flush();\n      open = [line];'],
  ['a bullet no longer starts an item', I, "const BULLET_MARKERS = ['- ', '* ', '+ '];", "const BULLET_MARKERS = [];"],
  ['a heading no longer starts an item', I, "line.startsWith('#') || line.startsWith('|')", "line.startsWith('|')"],
  ['a numbered entry no longer starts an item', I, '|| startsNumbered(line);', ';'],
  ['items are compared case-sensitively', I, 'return collapseWhitespace(withoutMarker(raw.trim())).toLowerCase();', 'return collapseWhitespace(withoutMarker(raw.trim()));'],
  ['whitespace is not collapsed, so reflow and CRLF read as edits', I, '.map((character) => (character.trim() === \'\' ? \' \' : character))', '.map((character) => character)'],
  ['the bullet marker is kept, so re-marking a bullet reads as an edit', I, 'if (bullet !== undefined) return line.slice(bullet.length);', 'if (bullet !== undefined) return line;'],
  ['blank lines do not end an item', I, "if (line === '') {\n      flush();\n    } else if", "if (line === '') {\n      open.push('');\n    } else if"],

  // --- decide.mjs: the state space ---
  ['mem_save is never judged', D, 'if (SAVE_TOOLS.has(toolName)) return decideSave(payload, toolName, toolInput, readers);', 'if (false) return decideSave(payload, toolName, toolInput, readers);'],
  ['mem_update is never judged', D, 'if (UPDATE_TOOLS.has(toolName)) return decideUpdate(toolName, toolInput, readers);', 'if (false) return decideUpdate(toolName, toolInput, readers);'],
  ['the plain-mount mem_update name is dropped', D, "export const UPDATE_TOOLS = new Set(['mcp__engram__mem_update', 'mcp__plugin_engram_engram__mem_update']);", "export const UPDATE_TOOLS = new Set(['mcp__plugin_engram_engram__mem_update']);"],
  ['the plain-mount mem_save name is dropped', D, "export const SAVE_TOOLS = new Set(['mcp__engram__mem_save', 'mcp__plugin_engram_engram__mem_save']);", "export const SAVE_TOOLS = new Set(['mcp__plugin_engram_engram__mem_save']);"],
  ['a save without a topic_key is judged against nothing and refused', D, 'if (!isText(topicKey) || typeof content !== \'string\') return undefined;', 'if (typeof content !== \'string\') return undefined;'],
  ['a first save (no row) is refused', D, 'if (target.absent) return undefined;', 'if (target.absent) return { ...base, kind: \'content-loss\', dropped: [\'x\'] };'],
  ['the default scope is ignored, so the personal row is judged for a project save', D, 'const scope = isText(toolInput.scope) ? toolInput.scope : DEFAULT_SCOPE;', 'const scope = isText(toolInput.scope) ? toolInput.scope : undefined;'],
  ['an unreadable store fails OPEN for the master backlog', D, "if ('error' in read) return isMaster ? { ...base, kind: 'unverifiable-master', detail: read.error } : undefined;", "if ('error' in read) return undefined;"],
  ['an unreadable store fails CLOSED for an ordinary record', D, "if ('error' in read) return isMaster ? { ...base, kind: 'unverifiable-master', detail: read.error } : undefined;", "if ('error' in read) return { ...base, kind: 'unverifiable-master', detail: read.error };"],
  ['an ambiguous master target fails OPEN', D, "if (target.ambiguous) return isMaster ? { ...base, kind: 'ambiguous-master', detail: `${read.rows.length} rows` } : undefined;", 'if (target.ambiguous) return undefined;'],
  ['an ambiguous ordinary target fails CLOSED', D, "if (target.ambiguous) return isMaster ? { ...base, kind: 'ambiguous-master', detail: `${read.rows.length} rows` } : undefined;", "if (target.ambiguous) return { ...base, kind: 'ambiguous-master', detail: `${read.rows.length} rows` };"],
  ['several rows are never narrowed by the named project or directory', D, 'return narrowed.length === 1 ? { row: narrowed[0] } : { ambiguous: true };', 'return { ambiguous: true };'],
  ['the working directory hint is ignored', D, 'const hint = isText(toolInput.project) ? toolInput.project : directoryName(payload?.cwd);', 'const hint = toolInput.project;'],
  ['an update without content is judged as an empty write', D, "if (typeof content !== 'string') return undefined;\n\n  const read = readers.byId(id);", "const read = readers.byId(id);"],
  ['an unreadable id is refused', D, "if ('error' in read || read.rows.length === 0) return undefined;", "if ('error' in read || read.rows.length === 0) return { toolName, id, kind: 'content-loss', dropped: ['x'] };"],
  ['a loss is never turned into a refusal', D, "return unarchived.length === 0 ? undefined : { ...base, kind: 'content-loss', dropped: unarchived };", 'return undefined;'],
  ['a loss with no archive is excused by the early return', D, 'if (dropped.length === 0) return undefined;\n\n  const { problems', 'return undefined;\n\n  const { problems'],

  // --- archive.mjs + decide.mjs: archive acceptance ---
  ['a cited archive is never consulted', D, 'const { problems, haystack } = resolveArchives(next, { topicKey: base.topicKey, project: row.project }, readers);', "const { problems, haystack } = { problems: [], haystack: '' };"],
  ['every cited archive excuses every dropped item', D, 'const unarchived = dropped.filter((item) => !haystack.includes(item));', 'const unarchived = [];'],
  ['an item absent from the archive is excused', D, 'const unarchived = dropped.filter((item) => !haystack.includes(item));', 'const unarchived = haystack === \'\' ? dropped : [];'],
  ['an unusable citation is ignored instead of refused', D, "if (problems.length > 0) return { ...base, kind: 'archive-invalid', dropped, problems };", ''],
  ['the archive is looked up for the wrong topic_key (project key ignored)', A, 'const prefix = `${target.topicKey}${ARCHIVE_SUFFIX}`.toLowerCase();', "const prefix = '';"],
  ['an archive of another topic_key is accepted', A, "if (typeof row.topic_key !== 'string' || !row.topic_key.toLowerCase().startsWith(prefix))", "if (typeof row.topic_key !== 'string')"],
  ['the archive topic_key match becomes case-sensitive', A, 'row.topic_key.toLowerCase().startsWith(prefix)', 'row.topic_key.startsWith(prefix)'],
  ['an archive of another project is accepted', A, 'if (row.project !== target.project)', 'if (false)'],
  ['an unreadable archive is treated as empty, not refused', A, "if ('error' in read) {\n      problems.push(`#${id} cannot be read (${read.error})`);", "if ('error' in read) {\n      texts.push('');"],
  ['an absent or deleted archive is accepted', A, 'else if (read.rows.length === 0) {\n      problems.push(`#${id} does not exist or is deleted`);', 'else if (read.rows.length === 0) {\n      texts.push(\'\');'],
  ['the ARCHIVED label may appear anywhere in a line', A, 'if (!line.toLowerCase().startsWith(ARCHIVED_LABEL)) continue;', 'if (!line.toLowerCase().includes(ARCHIVED_LABEL)) continue;'],
  ['the ARCHIVED label is case-sensitive', A, 'if (!line.toLowerCase().startsWith(ARCHIVED_LABEL)) continue;', 'if (!line.startsWith(ARCHIVED_LABEL)) continue;'],
  ['a non-numeric id is accepted as a citation', A, "[...digits].every((character) => DIGITS.includes(character))", 'true'],
  ['only the first cited id is read', A, 'for (const id of citedArchiveIds(nextText)) {', 'for (const id of citedArchiveIds(nextText).slice(0, 1)) {'],
  ['archive items are compared without normalisation', A, 'texts.push(extractItems(read.rows[0].content).join(\' \'))', 'texts.push(read.rows[0].content)'],
  ['an archive refusal is reported as a plain loss (wrong text)', R2, "refusal.kind === 'archive-invalid' ? archiveText(refusal)", 'false ? archiveText(refusal)'],

  // --- current-revision.mjs: the store reads ---
  ['soft-deleted rows are treated as live', R, 'WHERE id = ? AND deleted_at IS NULL', 'WHERE id = ?'],
  ['soft-deleted rows are treated as live targets of a save', R, "const clauses = ['lower(topic_key) = lower(?)', 'deleted_at IS NULL'];", "const clauses = ['lower(topic_key) = lower(?)'];"],
  ['the topic_key match becomes case-sensitive', R, "'lower(topic_key) = lower(?)'", "'topic_key = ?'"],
  ['the project filter is ignored', R, "clauses.push('project = ?');", "clauses.push('1 = 1');\n      values.pop();\n      values.push(1);"],
  ['a missing store is reported as an empty result', R, "if (!existsSync(databasePath)) return { error: 'store-unreadable' };", "if (!existsSync(databasePath)) return { rows: [] };"],

  // --- guard.mjs: the shim ---
  ['the allow/refuse branch is inverted', G, 'if (refusal === undefined) return undefined;', 'if (refusal !== undefined) return undefined;'],
  ['the hook decision is flipped from deny to allow', G, "permissionDecision: 'deny',", "permissionDecision: 'allow',"],
  ['the store override is ignored', G, 'byTopicKey: (topicKey, filters) => readRevisionsByTopicKey(topicKey, filters, options)', 'byTopicKey: (topicKey, filters) => readRevisionsByTopicKey(topicKey, filters, {})']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['backlog-content-guard', 'backlog-owner-guard', 'backlog-guard', 'hook-caller', 'hook-state', 'bilingual-output'],
  selftest: 'backlog-content-guard/selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
