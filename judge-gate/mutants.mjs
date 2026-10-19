#!/usr/bin/env node
/**
 * The decisions of the judge gate, each broken once, that `selftest.mjs` must catch: what counts as a verdict,
 * the order of the gate's code decisions, the model call's line, the log, and what the CLI prints. The runner
 * lives in `../mutation-proof/run-mutants.mjs` and mutates a COPY. Every kill is an assertion kill
 * (`crashKills: 'fail'`).
 *
 * @es Las decisiones de la compuerta de los jueces, rotas una a una, que su selftest debe cazar: qué cuenta como
 * veredicto, el orden de las decisiones en código de la compuerta, la línea del modelo, el registro y lo que
 * imprime la CLI.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const VERDICT = 'judge-gate/verdict.mjs';
const GATE = 'judge-gate/gate.mjs';
const MODEL = 'judge-gate/model.mjs';
const LOG = 'judge-gate/outcome-log.mjs';
const RUN = 'judge-gate/run.mjs';
const JUDGES = 'judge-gate/judges.mjs';
const NESTING = 'judge-gate/nesting.mjs';

const MUTANTS = [
  // --- WHAT A VERDICT IS.
  ['an ok true is not a pass', VERDICT, 'if (verdict.ok === true) return { kind: \'pass\' };', 'if (verdict.ok === true) return { kind: \'malfunction\', why: \'x\' };'],
  ['a non-boolean ok is read as a block', VERDICT, 'if (verdict.ok !== false) return', 'if (false) return'],
  ['a reason without the marker blocks', VERDICT, 'if (!reason.startsWith(marker)) {', 'if (false) {'],
  ['the reason is not trimmed', VERDICT, "verdict.reason.trim() : ''", "verdict.reason : ''"],
  ['prose around the object is not tolerated', VERDICT, 'const match = /\\{[\\s\\S]*\\}/.exec(text);', 'const match = /^\\{[\\s\\S]*\\}$/.exec(text);'],
  ['an unparsable answer throws', VERDICT, '  } catch {\n    return undefined;\n  }', '  } catch (error) {\n    throw error;\n  }'],

  // --- THE GATE'S CODE DECISIONS.
  ['a nested run asks the model', GATE, "if (nested) return free('pass-nested');", ''],
  ['unreadable input passes silently as a pass', GATE, "return free('malfunction', { why: 'the hook input is not a JSON object", "return free('pass', { why: 'the hook input is not a JSON object"],
  ['the block cap is ignored', GATE, 'if (blocksThisTurn() >= MAX_BLOCKS_PER_TURN) return', 'if (false) return'],
  ['the block cap is off by one', GATE, 'blocksThisTurn() >= MAX_BLOCKS_PER_TURN', 'blocksThisTurn() > MAX_BLOCKS_PER_TURN'],
  ['the block cap is raised', GATE, 'MAX_BLOCKS_PER_TURN = 2;', 'MAX_BLOCKS_PER_TURN = 3;'],
  ['the cap passes with the old outcome', GATE, "free('pass-continued-capped', mark)", "free('pass-continued', mark)"],
  ['a failed count read is not failed open', GATE, "if (blocksThisTurn() >= MAX_BLOCKS_PER_TURN) return free('pass-continued-capped', mark);\n    } catch (error) {\n      return free('malfunction', { ...mark, why: error.message });", "if (blocksThisTurn() >= MAX_BLOCKS_PER_TURN) return free('pass-continued-capped', mark);\n    } catch (error) {\n      throw error;"],
  ['a first stop reads the turn count', GATE, 'if (mark.continued === true) {', 'if (true) {'],
  ['a continued stop is not marked', GATE, 'payload.stop_hook_active === true ? { continued: true } : {}', '{}'],
  ['a continued stop is never judged', GATE, 'if (mark.continued === true) {', "if (mark.continued === true) {\n    return free('pass-continued-capped', mark);\n  }\n  if (false) {"],
  ['a stop with no message asks the model', GATE, "if (typeof payload.last_assistant_message !== 'string' || payload.last_assistant_message.trim() === '') return free('pass-no-message', mark);", ''],
  ['a blank message asks the model', GATE, 'payload.last_assistant_message.trim() === \'\'', 'false'],
  ['a failed model call blocks', GATE, "  } catch (error) {\n    return free('malfunction', { ...mark, why: error.message });", "  } catch (error) {\n    return free('block', { reason: error.message });"],
  ['the model sees the rubric without the input', GATE, 'judge.prompt.replace(\'$ARGUMENTS\', () => JSON.stringify(payload))', 'judge.prompt'],
  ['a malfunction loses its cost', GATE, "return { outcome: 'malfunction', costUsd, durationMs, why: verdict.why, ...mark };", "return { outcome: 'malfunction', costUsd: 0, durationMs: 0, why: verdict.why, ...mark };"],
  ['a block loses its cost', GATE, "return { outcome: 'block', costUsd, durationMs, reason: judge.appendix", "return { outcome: 'block', costUsd: 0, durationMs, reason: judge.appendix"],
  ['a block loses its latency', GATE, "return { outcome: 'block', costUsd, durationMs, reason: judge.appendix", "return { outcome: 'block', costUsd, durationMs: 0, reason: judge.appendix"],
  ['a malfunction blocks', GATE, "if (verdict.kind === 'malfunction') return { outcome: 'malfunction'", "if (verdict.kind === 'malfunction') return { outcome: 'block'"],
  ['a BOM breaks the input', GATE, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['an array input is accepted', GATE, ' && !Array.isArray(parsed)', ''],
  ['a message the prefilter rejects still asks the model', GATE, "if (!judge.prefilter(payload)) return free('pass-prefilter', mark);", ''],
  ['a message the prefilter accepts passes', GATE, "if (!judge.prefilter(payload)) return free('pass-prefilter', mark);", "if (judge.prefilter(payload)) return free('pass-prefilter', mark);"],
  ['a rejection is not named pass-prefilter', GATE, "return free('pass-prefilter', mark);", "return free('pass', mark);"],
  ['a rejected continued stop loses its mark', GATE, "return free('pass-prefilter', mark);", "return free('pass-prefilter');"],
  ['a prefilter that throws passes as a pass', GATE, "return free('pass-prefilter', mark);\n    } catch (error) {\n      return free('malfunction',", "return free('pass-prefilter', mark);\n    } catch (error) {\n      return free('pass',"],
  ['the prefilter runs for every judge, throwing on one without', GATE, 'if (judge.prefilter !== undefined) {', 'if (true) {'],
  ['the appendix is dropped from the block', GATE, 'judge.appendix === undefined ? verdict.reason : `${verdict.reason}\\n\\n${judge.appendix(payload)}`', 'verdict.reason'],
  ['the appendix replaces the judge reason', GATE, '`${verdict.reason}\\n\\n${judge.appendix(payload)}`', '`${judge.appendix(payload)}`'],
  ['the appendix is added to a judge that has none', GATE, 'judge.appendix === undefined ? verdict.reason', 'false ? verdict.reason'],
  ['an appendix that throws blocks', GATE, "return { outcome: 'malfunction', costUsd, durationMs, why: error.message, ...mark };", "return { outcome: 'block', costUsd, durationMs, reason: 'x', ...mark };"],

  // --- THE MODEL CALL.
  ['the default system prompt is kept', MODEL, "'--system-prompt', SYSTEM_PROMPT, ", ''],
  ['tools stay on', MODEL, "'--tools', '', ", ''],
  ['setting sources stay on', MODEL, "'--setting-sources', '', ", ''],
  ['the envelope is not JSON', MODEL, "'--output-format', 'json'", "'--output-format', 'text'"],
  ['skills stay on', MODEL, "'--disable-slash-commands', ", ''],
  ['MCP servers stay on', MODEL, "'--strict-mcp-config', ", ''],
  ['the session is persisted', MODEL, "'--no-session-persistence', ", ''],
  ['the child is not marked nested', MODEL, '[NESTED_VARIABLE]: \'1\'', '[NESTED_VARIABLE]: \'0\''],
  ['the child has no timeout', MODEL, 'cwd, timeout: timeoutMs, env', 'cwd, env'],
  ['the prompt is not sent on stdin', MODEL, 'input: prompt, ', ''],
  ['a non-zero exit is an answer', MODEL, 'run.error !== undefined || run.status !== 0', 'run.error !== undefined'],
  ['an error envelope is an answer', MODEL, 'envelope.is_error === true || ', ''],
  ['a missing result is an answer', MODEL, " || typeof envelope.result !== 'string'", ''],
  ['the cost is always zero', MODEL, 'Number.isFinite(envelope.total_cost_usd) ? envelope.total_cost_usd : 0', '0'],
  ['the latency is zero', MODEL, 'const durationMs = Date.now() - started;', 'const durationMs = 0;'],

  // --- THE LOG AND THE REGISTRY.
  ['the log forgets the judge', LOG, 'ts: new Date().toISOString(), judge, session', 'ts: new Date().toISOString(), session'],
  ['the log forgets the cost', LOG, 'outcome, costUsd, durationMs, ...(reason', 'outcome, durationMs, ...(reason'],
  ['the log forgets the reason', LOG, '...(reason === undefined ? {} : { reason }), ', ''],
  ['the log forgets the why', LOG, ', ...(why === undefined ? {} : { why })', ''],
  ['the log is overwritten, not appended', LOG, "import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';", "import { writeFileSync as appendFileSync, mkdirSync, readFileSync } from 'node:fs';"],
  ['the turn boundary is ignored', LOG, 'records.findLastIndex((record) => !wasContinued(record))', '-1'],
  ['a continued stop opens a turn', LOG, 'records.findLastIndex((record) => !wasContinued(record))', 'records.length - 1'],
  ['a legacy continued line opens a turn', LOG, " || (typeof record.outcome === 'string' && record.outcome.startsWith('pass-continued'))", ''],
  ['the first block of the turn is not counted', LOG, 'records.slice(Math.max(turnStart, 0))', 'records.slice(Math.max(turnStart, 0) + 1)'],
  ['another judge is counted', LOG, 'record.judge === judge && record.session === session', 'record.session === session'],
  ['another session is counted', LOG, 'record.judge === judge && record.session === session', 'record.judge === judge'],
  ['only blocks are not counted', LOG, "record.outcome === 'block');", 'true);'],
  ['the last block time is the oldest block of the turn', LOG, 'blockRecordsOfTurn(judge, session).at(-1)', 'blockRecordsOfTurn(judge, session).at(0)'],
  ['the last block time is not read from the record', LOG, 'Date.parse(last.ts)', '0'],
  ['a turn with no block has a last block time', LOG, 'last === undefined ? undefined : Date.parse(last.ts)', 'Date.parse(last?.ts)'],
  ['a torn line throws', LOG, '    } catch {\n      // A blank', '    } catch (error) {\n      throw error;\n      // A blank'],
  ['a missing log is an error', LOG, "if (error.code === 'ENOENT') return [];", ''],
  ['no session is counted as a session', LOG, "if (typeof session !== 'string' || session === '') throw", 'if (false) throw'],
  ['the log forgets the continued mark', LOG, '...(continued === true ? { continued: true } : {})', ''],
  ['the mechanism is not this folder', LOG, "MECHANISM = 'judge-gate'", "MECHANISM = 'judge-gateX'"],
  ['the hook timeout leaves no room', JUDGES, 'const HEADROOM_SECONDS = 5;', 'const HEADROOM_SECONDS = 0;'],
  ['the command differs from the wiring', JUDGES, 'run.mjs" ${name}', 'run.mjs" ${name}x'],
  ['the pending judge loses its prefilter and appendix', JUDGES, '{ prefilter: pendingPrefilter, appendix: pendingAppendix }', '{}'],
  ['the pending judge loses its prefilter', JUDGES, '{ prefilter: pendingPrefilter, appendix: pendingAppendix }', '{ appendix: pendingAppendix }'],
  ['the pending judge loses its appendix', JUDGES, '{ prefilter: pendingPrefilter, appendix: pendingAppendix }', '{ prefilter: pendingPrefilter }'],
  ['the voice judge uses the premise marker', JUDGES, "voice: judge('voice', 'voice-judge', VOICE_MARKER", "voice: judge('voice', 'voice-judge', PREMISE_MARKER"],
  ['nesting is read from another value', NESTING, "env[NESTED_VARIABLE] === '1'", "env[NESTED_VARIABLE] === '2'"],

  // --- THE CLI.
  ['a block prints nothing', RUN, "outcome.outcome === 'block' ? JSON.stringify", "false ? JSON.stringify"],
  ['a pass prints a block', RUN, "JSON.stringify({ decision: 'block', reason: outcome.reason }) : ''", "JSON.stringify({ decision: 'block', reason: outcome.reason }) : '{}'"],
  ['the block is not a decision', RUN, "decision: 'block'", "decision: 'approve'"],
  ['an unknown judge is looked up as a judge', RUN, 'if (judge === undefined) {', 'if (false) {'],
  ['the nesting is ignored', RUN, 'nested: isNested(), ', 'nested: false, '],
  ['the outcome is not recorded', RUN, '    recordOutcome(judgeName, sessionOf(raw), outcome);\n', ''],
  ['the turn count is read for another judge', RUN, 'blocksThisTurn(judgeName, sessionOf(raw))', "blocksThisTurn('voice', sessionOf(raw))"],
  ['the turn count is read for another session', RUN, 'blocksThisTurn(judgeName, sessionOf(raw))', "blocksThisTurn(judgeName, 'run-1')"],
  ['the session is not recorded', RUN, "return typeof id === 'string' ? id : '';", "return '';"],
  ['the model gets no timeout', RUN, '{ timeoutMs: judge.askTimeoutMs }', '{ timeoutMs: undefined }'],
  ['the process exits non-zero', RUN, '  process.exit(0);\n}', '  process.exit(1);\n}'],
  ['importing the CLI runs it', RUN, 'path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))', 'true'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['judge-gate', 'voice-judge', 'premise-judge', 'pending-judge', 'backlog-guard', 'backlog-owner-guard', 'hook-state', 'hook-dispatch', 'bilingual-output', 'settings.json'],
  selftest: 'judge-gate/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
