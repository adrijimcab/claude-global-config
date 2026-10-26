#!/usr/bin/env node
/**
 * The decisions of `hook-dispatch/block-journal.mjs` and of its wiring (`dispatch.mjs`, `manifest.mjs`,
 * the payload port), each broken once, that `block-journal.selftest.mjs` must catch. The runner and its rules
 * live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that only crashes the
 * selftest count as a survivor.
 *
 * @es Las decisiones de `block-journal.mjs` y de su cableado (`dispatch.mjs`, `manifest.mjs`, el puerto del payload),
 * rotas una a una, que `block-journal.selftest.mjs` debe detectar. Un mutante que solo hace caer el selftest
 * cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const B = 'hook-dispatch/block-journal.mjs';
const D = 'hook-dispatch/dispatch.mjs';
const M = 'hook-dispatch/manifest.mjs';

const MUTANTS = [
  // --- what blocks ---
  ['an ask blocks', B, "?.permissionDecision === 'deny'", "?.permissionDecision !== undefined"],
  ['an allow blocks', B, "?.permissionDecision === 'deny'", "?.permissionDecision !== 'ask'"],
  ['a deny does not block', B, "?.permissionDecision === 'deny'", "?.permissionDecision === 'never'"],
  ['an approve blocks', B, "output?.decision === 'block'", "output?.decision !== undefined"],
  ['a Stop block does not block', B, "output?.decision === 'block'", "output?.decision === 'never'"],
  ['an output without continue blocks', B, 'output?.continue === false', 'output?.continue !== true'],
  ['continue false does not block', B, 'output?.continue === false', 'output?.continue === 0'],
  ['a deny alone does not block', B, 'if (!denied && !blocked && !stopped)', 'if (!blocked && !stopped)'],
  ['a Stop block alone does not block', B, 'if (!denied && !blocked && !stopped)', 'if (!denied && !stopped)'],
  ['a continue false alone does not block', B, 'if (!denied && !blocked && !stopped)', 'if (!denied && !blocked)'],
  ['an output that does not block blocks', B, 'if (!denied && !blocked && !stopped) return undefined;', ''],
  ['an output with any of the three does not block unless all hold', B, 'if (!denied && !blocked && !stopped)', 'if (!denied || !blocked || !stopped)'],
  ['a hookSpecificOutput that is not an object throws', B, 'output?.hookSpecificOutput?.permissionDecision', 'output.hookSpecificOutput.permissionDecision'],
  ['a null output throws', B, "output?.decision === 'block'", "output.decision === 'block'"],

  // --- the reason ---
  ['the reason of a deny is never read', B, 'denied && output.hookSpecificOutput.permissionDecisionReason', 'false'],
  ['the reason of a block is never read', B, 'blocked && output.reason', 'false'],
  ['the reason of a stop is never read', B, 'stopped && output.stopReason', 'false'],
  ['the reason of an ask is read as a deny reason', B, 'denied && output.hookSpecificOutput.permissionDecisionReason', 'output.hookSpecificOutput?.permissionDecisionReason'],
  ['the reason of an approve is read as a block reason', B, 'blocked && output.reason', 'output.reason'],
  ['the reason of a continue true is read as a stop reason', B, 'stopped && output.stopReason', 'output.stopReason'],
  ['the block reason comes before the deny reason', B, '[denied && output.hookSpecificOutput.permissionDecisionReason, blocked && output.reason, stopped && output.stopReason]', '[blocked && output.reason, denied && output.hookSpecificOutput.permissionDecisionReason, stopped && output.stopReason]'],
  ['the stop reason comes before the block reason', B, '[denied && output.hookSpecificOutput.permissionDecisionReason, blocked && output.reason, stopped && output.stopReason]', '[denied && output.hookSpecificOutput.permissionDecisionReason, stopped && output.stopReason, blocked && output.reason]'],
  ['an empty reason is a reason', B, "typeof text === 'string' && text !== ''", "typeof text === 'string'"],
  ['a reason that is not a string is a reason', B, "typeof text === 'string' && text !== ''", "text !== ''"],
  ['a block without a reason has a reason object', B, 'return { reason };', "return { reason: reason ?? '' };"],

  // --- the limit ---
  ['the limit is 299', B, 'export const REASON_LIMIT = 300;', 'export const REASON_LIMIT = 299;'],
  ['the limit is 301', B, 'export const REASON_LIMIT = 300;', 'export const REASON_LIMIT = 301;'],
  ['a reason of exactly the limit is cut', B, 'text.length <= REASON_LIMIT', 'text.length < REASON_LIMIT'],
  ['a reason over the limit is kept whole', B, 'text.length <= REASON_LIMIT ? text :', 'true ? text :'],
  ['a cut reason is one character too long', B, 'text.slice(0, REASON_LIMIT - 1)', 'text.slice(0, REASON_LIMIT)'],
  ['a cut reason has no ellipsis', B, '}…`', '}`'],
  ['a cut reason is one character too short', B, 'text.slice(0, REASON_LIMIT - 1)', 'text.slice(0, REASON_LIMIT - 2)'],

  // --- the facts of a block ---
  ['a block without a reason is truncated as one', B, 'block.reason === undefined ? undefined : truncate(block.reason)', 'truncate(block.reason)'],
  ['the reason is never truncated', B, 'block.reason === undefined ? undefined : truncate(block.reason)', 'block.reason'],
  ['the reason is never recorded', B, 'block.reason === undefined ? undefined : truncate(block.reason)', 'undefined'],
  ['the event is not recorded', B, '[{ mechanism, event, toolUseId, inputDigest, reason:', '[{ mechanism, toolUseId, inputDigest, reason:'],
  ['the mechanism is not recorded', B, '[{ mechanism, event, toolUseId, inputDigest, reason:', '[{ event, toolUseId, inputDigest, reason:'],
  ['the tool use id is not recorded', B, '[{ mechanism, event, toolUseId, inputDigest, reason:', '[{ mechanism, event, inputDigest, reason:'],
  ['the digest is not recorded', B, '[{ mechanism, event, toolUseId, inputDigest, reason:', '[{ mechanism, event, toolUseId, reason:'],
  ['a tool use id of any type is recorded', B, "typeof payload?.tool_use_id === 'string' ? payload.tool_use_id : null", 'payload?.tool_use_id ?? null'],
  ['the tool use id is always null', B, "typeof payload?.tool_use_id === 'string' ? payload.tool_use_id : null", 'null'],
  ['the digest is of the whole payload even with a tool input', B, 'digestInput(payload?.tool_input ?? raw)', 'digestInput(raw)'],
  ['the digest is of the tool input only', B, 'digestInput(payload?.tool_input ?? raw)', 'digestInput(payload?.tool_input)'],
  ['the digest is of the command text with a tool input', B, 'digestInput(payload?.tool_input ?? raw)', 'digestInput(payload?.tool_input?.command ?? raw)'],
  ['a guard that does not block is a block', B, 'return block === undefined ? [] : [{', 'return block === undefined ? [{ mechanism, event, toolUseId, inputDigest }] : [{'],
  ['only the first blocking guard is recorded', B, 'return results.flatMap(({ mechanism, output }) => {', 'return results.slice(0, 1).flatMap(({ mechanism, output }) => {'],

  // --- recording ---
  ['a block is recorded as a dismissal', B, "kind: 'decision'", "kind: 'dismissal'"],
  ['every block has the same id', B, 'blockId: newBlockId()', "blockId: 'block'"],
  ['the facts of the block are not recorded', B, "blockId: newBlockId(), ...fields }", 'blockId: newBlockId() }'],
  ['a block is recorded in the journal of another mechanism', B, 'append(mechanism,', "append('dispatcher',"],
  ['a failed write is rethrown', B, 'failures.push(`${mechanism}: ${error instanceof Error ? error.message : String(error)}`);', 'throw error;'],
  ['a failed write stops the next one', B, 'String(error)}`);\n    }', 'String(error)}`);\n      break;\n    }'],
  ['a failed write is not reported', B, 'failures.push(`${mechanism}: ${error instanceof Error ? error.message : String(error)}`);', ''],
  ['a failure does not name its mechanism', B, '`${mechanism}: ${error instanceof Error', '`${error instanceof Error'],
  ['a failure that is not an Error loses its text', B, 'error instanceof Error ? error.message : String(error)', 'error.message'],
  ['the real writer is never used', B, 'append = appendRecord', 'append = () => {}'],
  ['the real id generator is never used', B, 'newBlockId = newId', "newBlockId = () => 'fixed'"],

  // --- the payload ---
  ['the block facts are read without the port parser', B, 'const payload = tryParsePayload(raw);\n  const toolUseId', 'const payload = JSON.parse(raw);\n  const toolUseId'],

  // --- the mechanism ---
  ['the mechanism is the file, not its folder', M, 'return path.basename(path.dirname(file));', 'return path.basename(file);'],
  ['the mechanism is the folder of the folder', M, 'return path.basename(path.dirname(file));', 'return path.basename(path.dirname(path.dirname(file)));'],
  ['the guards of a manifest carry no mechanism', M, 'mechanism: mechanismOf(file), ', ''],

  // --- the wiring ---
  ['the dispatcher never records its blocks', D, 'const journalFailures = recordBlocks(blocks);', 'const journalFailures = [];'],
  ['a guard is recorded under its label, not its mechanism', D, 'mechanism: guard.mechanism, output', 'mechanism: guard.name, output'],
  ['a guard is recorded under no mechanism', D, 'mechanism: guard.mechanism, output', 'output'],
  ['the blocks are described for another event', D, 'describeBlocks({ event: manifest.event, raw, results })', "describeBlocks({ event: 'PreToolUse', raw, results })"],
  ['the blocks are described over no results', D, 'describeBlocks({ event: manifest.event, raw, results })', 'describeBlocks({ event: manifest.event, raw, results: [] })'],
  ['a clean dispatch returns no blocks', D, 'if (problems.length === 0) return { output, problems, blocks };', 'if (problems.length === 0) return { output, problems, blocks: [] };'],
  ['a dispatch with problems returns no blocks', D, 'return { output: withNotice, problems, blocks };', 'return { output: withNotice, problems, blocks: [] };'],
  ['a dispatch with problems returns no block key', D, 'return { output: withNotice, problems, blocks };', 'return { output: withNotice, problems };'],
  ['a journal failure is not reported', D, 'if (journalFailures.length > 0) {', 'if (false) {'],
  ['a journal failure is reported even when there is none', D, 'if (journalFailures.length > 0) {', 'if (true) {'],
  ['a journal failure is not written to the dispatch journal', D, 'journal({ manifest: manifestFile, journalFailures });', ''],
  ['a journal failure is not written to stderr', D, "process.stderr.write(`${journalFailures.map((failure) => `[hook-dispatch] no se pudo registrar el bloqueo de ${failure}`).join('\\n')}\\n`);", ''],
  ['a journal failure names no mechanism on stderr', D, 'no se pudo registrar el bloqueo de ${failure}', 'no se pudo registrar el bloqueo'],
  ['the tool name is read without the payload parser', D, 'const payload = tryParsePayload(raw);\n\n  return typeof payload?.tool_name', 'const payload = JSON.parse(raw);\n\n  return typeof payload?.tool_name'],
  ['the dispatcher does not read stdin', D, 'raw = await readStdin();', "raw = '';"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-dispatch', 'hook-state', 'guard-precision', 'bilingual-output', 'hook-io'],
  selftest: 'hook-dispatch/block-journal.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
