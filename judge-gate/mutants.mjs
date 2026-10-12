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
  ['a non-boolean ok is read as a block', VERDICT, "if (verdict.ok !== false) return", "if (false) return"],
  ['a reason without the marker blocks', VERDICT, ' || !verdict.reason.trim().startsWith(marker)', ''],
  ['a missing reason blocks', VERDICT, "typeof verdict.reason !== 'string' || ", ''],
  ['the reason is not trimmed', VERDICT, "reason: verdict.reason.trim() }", "reason: verdict.reason }"],
  ['an array is read as a verdict', VERDICT, ' && !Array.isArray(parsed)', ''],
  ['prose around the object is not tolerated', VERDICT, 'const match = /\\{[\\s\\S]*\\}/.exec(text);', 'const match = /^\\{[\\s\\S]*\\}$/.exec(text);'],
  ['an unparsable answer throws', VERDICT, '  } catch {\n    return undefined;\n  }', '  } catch (error) {\n    throw error;\n  }'],
  ['an answer that is not text is read', VERDICT, "typeof answer === 'string' ? answer : ''", 'answer'],

  // --- THE GATE'S CODE DECISIONS.
  ['a nested run asks the model', GATE, "if (nested) return free('pass-nested');", ''],
  ['unreadable input passes silently as a pass', GATE, "return free('malfunction', { why: 'the hook input is not a JSON object", "return free('pass', { why: 'the hook input is not a JSON object"],
  ['a continued stop asks the model', GATE, "if (payload.stop_hook_active === true) return free('pass-continued');", ''],
  ['a stop with no message asks the model', GATE, "if (typeof payload.last_assistant_message !== 'string' || payload.last_assistant_message.trim() === '') return free('pass-no-message');", ''],
  ['a blank message asks the model', GATE, 'payload.last_assistant_message.trim() === \'\'', 'false'],
  ['a failed model call blocks', GATE, "return free('malfunction', { why: error.message });", "return free('block', { reason: error.message });"],
  ['the model sees the rubric without the input', GATE, 'judge.prompt.replace(\'$ARGUMENTS\', () => JSON.stringify(payload))', 'judge.prompt'],
  ['a malfunction loses its cost', GATE, "return { outcome: 'malfunction', costUsd, durationMs, why: verdict.why };", "return { outcome: 'malfunction', costUsd: 0, durationMs: 0, why: verdict.why };"],
  ['a block loses its cost', GATE, "return { outcome: 'block', costUsd, durationMs, reason: verdict.reason };", "return { outcome: 'block', costUsd: 0, durationMs, reason: verdict.reason };"],
  ['a malfunction blocks', GATE, "if (verdict.kind === 'malfunction') return { outcome: 'malfunction'", "if (verdict.kind === 'malfunction') return { outcome: 'block'"],
  ['a BOM breaks the input', GATE, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['an array input is accepted', GATE, ' && !Array.isArray(parsed)', ''],

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
  ['the log forgets the why', LOG, ', ...(why === undefined ? {} : { why }) }', ' }'],
  ['the log is not appended', LOG, 'appendFileSync(outcomesPath()', 'writeFileSync(outcomesPath()'],
  ['the mechanism is not this folder', LOG, "MECHANISM = 'judge-gate'", "MECHANISM = 'judge-gateX'"],
  ['the hook timeout leaves no room', JUDGES, 'const HEADROOM_SECONDS = 5;', 'const HEADROOM_SECONDS = 0;'],
  ['the command differs from the wiring', JUDGES, 'run.mjs" ${name}', 'run.mjs" ${name}x'],
  ['the voice judge uses the premise marker', JUDGES, "voice: judge('voice', 'voice-judge', VOICE_MARKER", "voice: judge('voice', 'voice-judge', PREMISE_MARKER"],
  ['nesting is read from another value', NESTING, "env[NESTED_VARIABLE] === '1'", "env[NESTED_VARIABLE] === '2'"],

  // --- THE CLI.
  ['a block prints nothing', RUN, "outcome.outcome === 'block' ? JSON.stringify", "false ? JSON.stringify"],
  ['a pass prints a block', RUN, "JSON.stringify({ decision: 'block', reason: outcome.reason }) : ''", "JSON.stringify({ decision: 'block', reason: outcome.reason }) : '{}'"],
  ['the block is not a decision', RUN, "decision: 'block'", "decision: 'approve'"],
  ['an unknown judge is looked up as a judge', RUN, 'if (judge === undefined) {', 'if (false) {'],
  ['the nesting is ignored', RUN, 'nested: isNested(), ', 'nested: false, '],
  ['the outcome is not recorded', RUN, '    recordOutcome(judgeName, sessionOf(raw), outcome);\n', ''],
  ['the session is not recorded', RUN, "return typeof id === 'string' ? id : '';", "return '';"],
  ['the model gets no timeout', RUN, '{ timeoutMs: judge.askTimeoutMs }', '{ timeoutMs: undefined }'],
  ['the process exits non-zero', RUN, '  process.exit(0);\n}', '  process.exit(1);\n}'],
  ['importing the CLI runs it', RUN, 'path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))', 'true'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['judge-gate', 'voice-judge', 'premise-judge', 'hook-state', 'hook-dispatch', 'bilingual-output', 'settings.json'],
  selftest: 'judge-gate/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
