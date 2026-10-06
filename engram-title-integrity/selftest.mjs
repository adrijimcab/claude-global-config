#!/usr/bin/env node
/**
 * Proof that the title guard DISCRIMINATES — not merely that it fires.
 *
 * The promoted lesson `guard-that-cannot-go-red` has now cost this project three times, and its
 * third face is the one this file is shaped around: testing that a mechanism FIRES is not testing
 * that it DECIDES CORRECTLY, and the states your first real cases happen to contain are not the
 * states that exist. So every case below is an explicit point in the state space the decision ranges
 * over, and the suite asserts BOTH verdicts — a guard only ever seen denying is as unproven as one
 * only ever seen allowing.
 *
 * THE NEAR MISS IS A STATE, and it is the one usage produces. Somebody satisfying this control sends
 * a title; the interesting failures are the ones where a title is PRESENT and still useless — `''`,
 * `'   '`, a tab, a lone non-breaking space pasted out of a document. Those get their own cases and
 * their own refusal wording, because the brief-provenance guard shipped with 14 green cases and then
 * refused its author's first real brief over a form nobody had tested.
 *
 * TWO LAYERS, deliberately. The `inspectSave` cases prove the DECISION. The end-to-end cases run the
 * guard as the harness runs it — a real child process, JSON on stdin, JSON on stdout — because a
 * decision function can be perfect while the process around it never denies anything, and that
 * failure looks exactly like a clean fleet. The fail-open cases are only meaningful at this layer.
 *
 * NON-VACUOUS: exits 3 if the case list resolves empty, so "ran nothing, reported success" is not a
 * reachable outcome.
 *
 * M5: no regex. Exit codes: 0 all pass · 1 a case failed · 3 VACUOUS.
 *
 * @es Prueba de que el guard DISCRIMINA, no de que dispara. La lección `guard-that-cannot-go-red` ya
 * costó tres veces: probar que un mecanismo DISPARA no es probar que DECIDE BIEN, y los estados que
 * traen tus primeros casos reales no son los estados que existen. EL CASI-ACIERTO ES UN ESTADO y es
 * el que produce el uso real. Dos capas: la decisión (`inspectSave`) y el proceso completo por
 * stdin/stdout, porque una función perfecta puede vivir dentro de un proceso que nunca deniega, y eso
 * se ve igual que una flota limpia.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectSave } from './guard.mjs';
import { isBlankTitle } from './blank-title.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('engram-title-integrity');

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const TOOL = 'mcp__engram__mem_save';
const PLUGIN_TOOL = 'mcp__plugin_engram_engram__mem_save';

const NBSP = String.fromCodePoint(0x00a0);
const BOM = String.fromCodePoint(0xfeff);
const LINE_SEP = String.fromCodePoint(0x2028);

let failures = 0;
let ran = 0;

const check = (label, actual, expected) => {
  ran += 1;
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${expected}, got ${actual})`}`);
};

// ---------------------------------------------------------------------------------------------
// LAYER 1 — the decision. "deny" means inspectSave returned a refusal; "allow" means undefined.
// ---------------------------------------------------------------------------------------------
console.log('--- layer 1: the decision (inspectSave) ---');

const verdict = (toolName, toolInput) => (inspectSave(toolName, toolInput) === undefined ? 'allow' : 'deny');
const kindOf = (toolInput) => inspectSave(TOOL, toolInput)?.kind;

// The guard must ALLOW a real save. Listed first because a guard that denies everything also has
// zero untitled observations, and would look identical in the store.
check('a real title is allowed', verdict(TOOL, { title: 'Backfill closed the intake, not just history', content: 'x' }), 'allow');
check('a title with surrounding spaces but real text is allowed', verdict(TOOL, { title: '  real title  ', content: 'x' }), 'allow');
check('a one-character title is allowed', verdict(TOOL, { title: 'x', content: 'x' }), 'allow');
check('an astral-character title is allowed', verdict(TOOL, { title: String.fromCodePoint(0x1f600), content: 'x' }), 'allow');

// The obvious denial.
check('an absent title is denied', verdict(TOOL, { content: 'x' }), 'deny');
check('a null title is denied', verdict(TOOL, { title: null, content: 'x' }), 'deny');

// THE NEAR MISSES — present, passes NOT NULL, passes `required`, still useless.
check('an empty-string title is denied', verdict(TOOL, { title: '', content: 'x' }), 'deny');
check('a single-space title is denied', verdict(TOOL, { title: ' ', content: 'x' }), 'deny');
check('a multi-space title is denied', verdict(TOOL, { title: '     ', content: 'x' }), 'deny');
check('a tab-only title is denied', verdict(TOOL, { title: '\t', content: 'x' }), 'deny');
check('a newline-only title is denied', verdict(TOOL, { title: '\n', content: 'x' }), 'deny');
check('a non-breaking-space title is denied', verdict(TOOL, { title: NBSP, content: 'x' }), 'deny');
check('a BOM-only title is denied', verdict(TOOL, { title: BOM, content: 'x' }), 'deny');
check('a line-separator-only title is denied', verdict(TOOL, { title: LINE_SEP, content: 'x' }), 'deny');
check('a mixed-invisible title is denied', verdict(TOOL, { title: ` \t${NBSP}\n`, content: 'x' }), 'deny');

// Non-string.
check('a numeric title is denied', verdict(TOOL, { title: 42, content: 'x' }), 'deny');
check('an object title is denied', verdict(TOOL, { title: {}, content: 'x' }), 'deny');

// The refusal must NAME the state, or the caller cannot tell "you sent nothing" from "you sent
// spaces" — the difference that makes the fix obvious.
check('absent is diagnosed as absent', kindOf({ content: 'x' }), 'absent');
check('empty is diagnosed as empty', kindOf({ title: '', content: 'x' }), 'empty');
check('whitespace is diagnosed as whitespace', kindOf({ title: '   ', content: 'x' }), 'whitespace');
check('NBSP is diagnosed as whitespace', kindOf({ title: NBSP, content: 'x' }), 'whitespace');
check('non-string is diagnosed as non-string', kindOf({ title: 7, content: 'x' }), 'non-string');

// Tool scoping. BOTH engram mounts must be covered; anything else is none of this guard's business.
check('the plugin-mounted save tool is covered', verdict(PLUGIN_TOOL, { title: '', content: 'x' }), 'deny');
check('mem_update is not covered', verdict('mcp__engram__mem_update', { title: '' }), 'allow');
check('an unrelated tool is not covered', verdict('Bash', { title: '' }), 'allow');
check('an absent tool name is not covered', verdict(undefined, { title: '' }), 'allow');

// Payload shapes the guard does not understand must ALLOW, never throw.
check('a null tool_input allows', verdict(TOOL, null), 'allow');
check('an absent tool_input allows', verdict(TOOL, undefined), 'allow');
check('a string tool_input allows', verdict(TOOL, 'not an object'), 'allow');

// The shared predicate, directly. It is the one definition both callers depend on.
check('isBlankTitle("") is true', isBlankTitle(''), true);
check('isBlankTitle(" ") is true', isBlankTitle(' '), true);
check('isBlankTitle(NBSP) is true', isBlankTitle(NBSP), true);
check('isBlankTitle("a") is false', isBlankTitle('a'), false);
check('isBlankTitle(" a ") is false', isBlankTitle(' a '), false);

// ---------------------------------------------------------------------------------------------
// LAYER 2 — the process, exactly as the harness invokes it.
// ---------------------------------------------------------------------------------------------
console.log('');
console.log('--- layer 2: the process (stdin -> stdout) ---');

const run = (stdin) => {
  const result = spawnSync(process.execPath, [GUARD], { input: stdin, encoding: 'utf8' });
  if (result.status !== 0) return { decision: `EXIT_${result.status}`, stdout: result.stdout };
  const text = result.stdout.trim();
  if (text.length === 0) return { decision: 'allow', stdout: '' };
  try {
    const parsed = JSON.parse(text);
    return { decision: parsed?.hookSpecificOutput?.permissionDecision ?? 'allow', stdout: text };
  } catch {
    return { decision: 'UNPARSEABLE', stdout: text };
  }
};

const payload = (toolName, toolInput) => JSON.stringify({ tool_name: toolName, tool_input: toolInput, session_id: 'selftest' });

check('e2e: a real title allows', run(payload(TOOL, { title: 'A real claim-carrying title', content: 'x' })).decision, 'allow');
check('e2e: an empty title denies', run(payload(TOOL, { title: '', content: 'x' })).decision, 'deny');
check('e2e: a whitespace title denies', run(payload(TOOL, { title: '   ', content: 'x' })).decision, 'deny');
check('e2e: an absent title denies', run(payload(TOOL, { content: 'x' })).decision, 'deny');
check('e2e: the plugin mount denies', run(payload(PLUGIN_TOOL, { title: '', content: 'x' })).decision, 'deny');
check('e2e: an unrelated tool allows', run(payload('Bash', { title: '' })).decision, 'allow');

// The guard must always exit 0 — the decision travels in the JSON, never in the exit code.
check('e2e: a denial still exits 0', spawnSync(process.execPath, [GUARD], { input: payload(TOOL, { title: '' }), encoding: 'utf8' }).status, 0);

// FAIL-OPEN. Each of these is a malfunction of the guard's own input handling, and each must ALLOW.
// This is the property that makes the guard safe to install on a support system: memory must never
// be blocked by the thing that checks memory.
check('e2e fail-open: malformed JSON allows', run('{ not json').decision, 'allow');
check('e2e fail-open: empty stdin allows', run('').decision, 'allow');
check('e2e fail-open: a bare JSON string allows', run('"a string"').decision, 'allow');
check('e2e fail-open: a JSON null allows', run('null').decision, 'allow');
check('e2e fail-open: an empty object allows', run('{}').decision, 'allow');
check('e2e fail-open: truncated JSON allows', run('{"tool_name":"mcp__engram__mem_sa').decision, 'allow');

// A BOM-prefixed payload is the PowerShell case, and it must still be DECIDED, not skipped — the
// sibling hook that swallowed this exact throw silently stopped guarding.
check('e2e: a BOM-prefixed payload is still decided', run(BOM + payload(TOOL, { title: '' })).decision, 'deny');
check('e2e: a BOM-prefixed valid payload allows', run(BOM + payload(TOOL, { title: 'fine' })).decision, 'allow');

// The refusal text must actually carry the diagnosis and the suggestion, or the guard gets routed
// around for being unhelpful even while deciding correctly.
const denial = run(payload(TOOL, { title: '   ', content: 'TASK #98 CLOSED — the i18n gate flip was a step function\nmore text' }));
check('e2e: the refusal names the near miss', denial.stdout.includes('NEAR MISS'), true);
check('e2e: the refusal offers the first content line', denial.stdout.includes('TASK #98 CLOSED'), true);

// The EMPTY case needs its own assertion, not coverage-by-proximity from the whitespace one. This
// case exists because `mutants.mjs` found its absence: a mutation that removed "NEAR MISS"
// from the empty-title refusal SURVIVED a 52/52 green suite. Both near-miss states are worded
// separately in the guard, so both have to be asserted separately here.
// @es El caso VACÍO necesita su propia aserción. Existe porque `mutants.mjs` detectó su
// ausencia: una mutación que quitaba «NEAR MISS» del rechazo por título vacío SOBREVIVIÓ a una suite
// en verde 52/52. Ambos estados se redactan por separado en el guard, así que se afirman por separado.
const emptyDenial = run(payload(TOOL, { title: '', content: 'x' }));
check('e2e: the empty-title refusal names the near miss', emptyDenial.stdout.includes('NEAR MISS'), true);

const absentDenial = run(payload(TOOL, { content: 'no title here' }));
check('e2e: an absent title is NOT called a near miss', absentDenial.stdout.includes('NEAR MISS'), false);

// ---------------------------------------------------------------------------------------------
console.log('');
if (ran === 0) {
  console.error('VACUOUS: the suite ran zero cases. Refusing to report success on an empty set.');
  process.exit(3);
}
console.log(`${ran - failures}/${ran} passed`);
if (failures > 0) process.exit(1);
