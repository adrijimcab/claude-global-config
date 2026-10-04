#!/usr/bin/env node
/**
 * Discrimination proof that `capture.mjs promote` says every sentence — the instructions a recurring lesson
 * owes, each refusal, the growth refusal and the report of a closed promotion — in the house bilingual form.
 * For every state the CLI is driven in a constructed world and its output must CONTAIN the message rendered
 * from the table (`promote-messages.mjs`) with that state's data, and no run of it may be English only (the
 * closure problems of `closure.mjs` and the stub refusals of `promotion.mjs` reach the output through the
 * same check). The table itself must carry no problem (`messageProblems`).
 *
 * @es Prueba de discriminación de que `capture.mjs promote` dice cada frase —las instrucciones que debe una
 * lección recurrente, cada negativa, la negativa por crecimiento y el informe de una promoción cerrada— en la
 * forma bilingüe de la casa. Para cada estado se maneja el CLI en un mundo construido y su salida debe
 * CONTENER el mensaje renderizado desde la tabla con los datos de ese estado, y ningún tramo puede ser solo
 * inglés (los problemas de cierre de `closure.mjs` y las negativas de `promotion.mjs` pasan por el mismo chequeo).
 */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { contractFileId, readClosure, verifyMechanism } from './closure.mjs';
import { makeCaptureWorld, monolingualRuns } from './capture-world.mjs';
import { messageProblems, render } from '../bilingual-output/message.mjs';
import { PROMOTE_MESSAGES } from './promote-messages.mjs';

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-promote-messages-')));
const KEY = 'promote-lesson-key';
const REASON = 'a claim written in prose cannot be detected by any hook; measured 0 of 6 recall';
const GLOBAL_HEAD = '# Lessons Ledger — global\n\n---\n';
const PROJECT_HEAD = '# Lessons Ledger — demo\n\n---\n';
const line = (scope, count) => `- [${scope}] 2026-09-14 — it recurred -> RULE: do the thing <!--fc:${KEY}#${String(count)}-->\n`;
const mention = `- (\`${KEY}\`) face one.\n`;
const GATE_GREEN = `process.exit(0); // '${KEY}'\n`;
const GATE_RED = `process.exit(1); // '${KEY}'\n`;

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 600)}`));

/** The output must contain the table's message for `id`, filled with `params`. @es La salida debe contener el mensaje `id` de la tabla. */
const says = (name, out, id, params = {}) => check(`${name}: says ${id} in both languages`, out.includes(render(PROMOTE_MESSAGES[id], params)), out);
const bilingual = (name, out) => check(`${name}: nothing it printed is English only`, monolingualRuns(out).length === 0, monolingualRuns(out).join(' | '));
const promote = (world, ...flags) => world.run(['promote', '--key', KEY, ...flags]);

check('the message table has no problem (every message keeps both halves and the same data)', messageProblems(PROMOTE_MESSAGES).length === 0, messageProblems(PROMOTE_MESSAGES).join('; '));

const global = (name, { rules = '# Contract\n', ledger = `${GLOBAL_HEAD}${line('global', 2)}`, incidents, extra = {} } = {}) => makeCaptureWorld({
  scratch,
  name,
  files: { 'home/.claude/lessons-ledger.md': ledger, 'home/.claude/rules/promoted-rules.md': rules, ...(incidents === undefined ? {} : { 'home/.claude/failure-capture/state/incidents.jsonl': incidents }), ...extra }
});
const project = (name, { config = { scope: 'demo' }, files = {} } = {}) => makeCaptureWorld({ scratch, name, config, files: { 'repo/.claude/lessons-ledger.md': `${PROJECT_HEAD}${line('demo', 2)}`, 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, ...files } });

{
  const world = global('key-invalid');
  const { status, out } = world.run(['promote', '--key', 'Not A Key', '--no-mechanism', REASON]);

  check('an invalid key exits 1', status === 1, out);
  says('an invalid key', out, 'promote.keyInvalid');
  bilingual('an invalid key', out);
}

{
  const world = global('not-a-lesson');
  const { out } = world.run(['promote', '--key', 'some-other-key', '--no-mechanism', REASON]);

  says('a key that is no lesson', out, 'promote.notALesson', { key: 'some-other-key' });
  bilingual('a key that is no lesson', out);
}

{
  const { out } = promote(global('no-closure'));

  says('no closure given', out, 'promote.noClosure');
  bilingual('no closure given', out);
}

{
  const { out } = promote(global('mechanism-missing', { rules: mention }), '--mechanism', '.claude/no-such-guard/guard.mjs');

  says('a mechanism that does not exist', out, 'promote.mechanismFailed');
  bilingual('a mechanism that does not exist', out);
}

// The problems of `closure.mjs` are lines of a list under a bilingual header, so a run-level check cannot see
// one that lost its Spanish half: each problem is asked for directly, and each must carry its own `@es`.
// @es Los problemas de `closure.mjs` son líneas de una lista bajo un encabezado bilingüe, así que un chequeo
// por tramos no vería uno que perdió su mitad española: se piden directamente y cada uno debe llevar su `@es`.
{
  const everyProblemIsBilingual = (name, problems) => check(`${name}: every problem line carries its Spanish half`, problems.length > 0 && problems.every((problem) => problem.includes(' @es ')), problems.join(' | '));
  const guardIn = (name, { selftest, source = `// closes ${KEY}\n` }) => {
    const directory = path.join(scratch, 'guards', name);

    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'guard.mjs'), source, 'utf8');
    if (selftest !== undefined) writeFileSync(path.join(directory, 'selftest.mjs'), selftest, 'utf8');

    return path.join(directory, 'guard.mjs');
  };
  const verify = (mechanismPath) => verifyMechanism({ mechanismPath, key: KEY, repoRoot: scratch, home: scratch }).problem;

  everyProblemIsBilingual('no closure', readClosure({}).problems);
  everyProblemIsBilingual('both flags', readClosure({ mechanism: 'a/guard.mjs', 'no-mechanism': REASON }).problems);
  everyProblemIsBilingual('a bare --mechanism', readClosure({ mechanism: true }).problems);
  everyProblemIsBilingual('a reason too thin', readClosure({ 'no-mechanism': 'none' }).problems);
  everyProblemIsBilingual('a reason on two lines', readClosure({ 'no-mechanism': `${REASON}\nsecond line` }).problems);
  everyProblemIsBilingual('a mechanism that does not exist', [verify(path.join(scratch, 'guards', 'absent', 'guard.mjs'))]);
  everyProblemIsBilingual('a mechanism with no selftest', [verify(guardIn('untested', {}))]);
  everyProblemIsBilingual('a mechanism whose selftest is red', [verify(guardIn('red', { selftest: 'process.exit(1);\n' }))]);
  everyProblemIsBilingual('a mechanism that never names the lesson', [verify(guardIn('unrelated', { selftest: 'process.exit(0);\n', source: '// some other lesson\n' }))]);
}

{
  const world = global('global-not-landed');
  const rules = path.join(world.home, '.claude', 'rules', 'promoted-rules.md');
  const { out } = promote(world, '--no-mechanism', REASON);

  says('a global rule that has not landed', out, 'promote.notLanded');
  says('a global rule that has not landed (the token)', out, 'promote.missing.token', { key: KEY, file: rules });
  says('a global rule that has not landed (the instructions)', out, 'instructions.global', { file: rules, key: KEY });
  says('a global rule that has not landed (how to close)', out, 'instructions.close', { number: 2 });
  says('a global rule that has not landed (the way to close it)', out, 'instructions.close.note');
  says('a global rule that has not landed (the tail)', out, 'instructions.global.tail');
  check('a global rule that has not landed: the commands to copy are printed as they are', out.includes(`promote --key ${KEY} --mechanism <guard path>`) && out.includes(`promote --key ${KEY} --no-mechanism "<reason>"`), out);
  bilingual('a global rule that has not landed', out);
}

{
  const world = project('project-not-landed');
  const instructions = path.join(world.repo, '.claude', 'CLAUDE.md');
  const { out } = promote(world, '--no-mechanism', REASON);

  says('a project rule that has not landed', out, 'instructions.contract', { scope: 'demo', count: 1 });
  says('a project rule that has not landed (the token)', out, 'promote.missing.token', { key: KEY, file: instructions });
  says('a project rule that has not landed (its step)', out, 'instructions.contract.step', { number: 1, file: instructions, key: KEY });
  says('a project rule that has not landed (how to close)', out, 'instructions.close', { number: 2 });
  says('a project rule that has not landed (the tail)', out, 'instructions.contract.tail');
  check('a project rule with ONE contract file does not warn about several', !out.includes(render(PROMOTE_MESSAGES['instructions.contract.many'])), out);
  bilingual('a project rule that has not landed', out);
}

{
  const config = { scope: 'demo', workerContracts: ['.claude/AGENT-LEDGER.md', '.agents/AGENTS.md'], parityGate: '.claude/parity.mjs' };
  const world = project('project-gate-not-landed', { config, files: { 'repo/.claude/AGENT-LEDGER.md': mention, 'repo/.agents/AGENTS.md': mention, 'repo/.claude/parity.mjs': 'process.exit(0);\n' } });
  const gate = path.join(world.repo, '.claude', 'parity.mjs');
  const { out } = promote(world, '--no-mechanism', REASON);

  says('a rule missing from the parity anchors', out, 'promote.missing.anchor', { key: KEY, gate });
  says('a rule missing from the parity anchors (the headline)', out, 'instructions.contract.gate', { scope: 'demo', count: 2 });
  says('a rule missing from the parity anchors (the many-files warning)', out, 'instructions.contract.many');
  says('a rule missing from the parity anchors (the first contract step)', out, 'instructions.contract.step', { number: 1, file: path.join(world.repo, '.claude', 'AGENT-LEDGER.md'), key: KEY });
  says('a rule missing from the parity anchors (the second contract step)', out, 'instructions.contract.step', { number: 2, file: path.join(world.repo, '.agents', 'AGENTS.md'), key: KEY });
  says('a rule missing from the parity anchors (its step)', out, 'instructions.contract.parity', { number: 3, key: KEY, gate });
  says('a rule missing from the parity anchors (how to close)', out, 'instructions.close', { number: 4 });
  says('a rule missing from the parity anchors (the tail)', out, 'instructions.contract.tail.gate');
  bilingual('a rule missing from the parity anchors', out);
}

{
  const config = { scope: 'demo', workerContracts: ['.claude/AGENT-LEDGER.md'], parityGate: '.claude/parity.mjs' };
  const world = project('parity-red', { config, files: { 'repo/.claude/AGENT-LEDGER.md': mention, 'repo/.claude/parity.mjs': GATE_RED } });
  const { out } = promote(world, '--no-mechanism', REASON);

  says('a red parity gate', out, 'promote.parityRed');
  bilingual('a red parity gate', out);
}

{
  const name = 'stale-growth';
  const rules = path.join(scratch, name, 'home', '.claude', 'rules', 'promoted-rules.md');
  const incident = (at) => `${JSON.stringify({ key: KEY, actor: 'orchestrator', lesson: 'x', date: at.slice(0, 10), at })}\n`;
  const closed = `${JSON.stringify({ kind: 'promotion', key: KEY, target: 'claude-md', scope: 'global', faces: { [contractFileId(rules)]: 1 }, date: '2026-09-02', at: '2026-09-02T10:00:00.000Z' })}\n`;
  const world = global(name, { rules: mention, incidents: `${incident('2026-09-01T10:00:00.000Z')}${closed}${incident('2026-09-03T10:00:00.000Z')}` });
  const { out } = promote(world, '--no-mechanism', REASON);

  says('a lesson that came back over unchanged text', out, 'promote.alreadyPromoted');
  says('a lesson that came back over unchanged text (the file)', out, 'growth.file', { key: KEY, date: '2026-09-02', file: rules, now: 1, then: 1 });
  says('a lesson that came back over unchanged text (the advice)', out, 'growth.advice');
  bilingual('a lesson that came back over unchanged text', out);
}

{
  const world = global('locked', { rules: mention, extra: { 'home/.claude/failure-capture/state/ledger.lock': '' } });
  const lock = path.join(world.home, '.claude', 'failure-capture', 'state', 'ledger.lock');

  const { out } = promote(world, '--no-mechanism', REASON);

  says('a ledger locked by another writer', out, 'promote.locked');
  check('a ledger locked by another writer: the holder\'s lock is untouched', existsSync(lock), lock);
  bilingual('a ledger locked by another writer', out);
}

{
  const world = global('closed-reason', { rules: mention });
  const rules = path.join(world.home, '.claude', 'rules', 'promoted-rules.md');
  const { status, out } = promote(world, '--no-mechanism', REASON);

  check('a promotion closed by a reason exits 0', status === 0, out);
  says('a promotion closed by a reason', out, 'promote.done', { key: KEY });
  says('a promotion closed by a reason (where it landed)', out, 'promote.landed.global', { files: rules });
  says('a promotion closed by a reason (what was verified)', out, 'promote.proof.token');
  says('a promotion closed by a reason (how it closed)', out, 'promote.closed.reason', { reason: REASON });
  says('a promotion closed by a reason (the stub)', out, 'promote.stub');
  bilingual('a promotion closed by a reason', out);
}

{
  const guard = `.claude/guard-${KEY}/guard.mjs`;
  const world = global('closed-mechanism', { rules: mention, extra: { [`repo/.claude/guard-${KEY}/guard.mjs`]: `// closes ${KEY}\n`, [`repo/.claude/guard-${KEY}/selftest.mjs`]: 'process.exit(0);\n' } });
  const { status, out } = promote(world, '--mechanism', guard);

  check('a promotion closed by a mechanism exits 0', status === 0, out);
  says('a promotion closed by a mechanism', out, 'promote.closed.mechanism', { path: guard });
  bilingual('a promotion closed by a mechanism', out);
}

{
  const config = { scope: 'demo', workerContracts: ['.claude/AGENT-LEDGER.md', '.agents/AGENTS.md'], parityGate: '.claude/parity.mjs' };
  const world = project('closed-gate', { config, files: { 'repo/.claude/AGENT-LEDGER.md': mention, 'repo/.agents/AGENTS.md': mention, 'repo/.claude/parity.mjs': GATE_GREEN } });
  const files = ['.claude/AGENT-LEDGER.md', '.agents/AGENTS.md'].map((file) => path.join(world.repo, ...file.split('/'))).join(', ');
  const { status, out } = promote(world, '--no-mechanism', REASON);

  check('a project promotion with a green parity gate exits 0', status === 0, out);
  says('a project promotion with a gate (where it landed)', out, 'promote.landed.contract', { count: 2, files });
  says('a project promotion with a gate (what was verified)', out, 'promote.proof.contractsGate', { count: 2 });
  bilingual('a project promotion with a gate', out);
}

{
  const world = project('closed-no-gate', { files: { 'repo/.claude/CLAUDE.md': mention } });
  const { out } = promote(world, '--no-mechanism', REASON);

  says('a project promotion with no gate (what was verified)', out, 'promote.proof.contracts', { count: 1 });
}

console.log(`promote-messages selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
