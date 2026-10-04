#!/usr/bin/env node
/**
 * Discrimination proof of what `capture` says when a lesson that is ALREADY PROMOTED recurs
 * (`promotion-to-contract-read-as-prevention`): it must not demand a second promotion, because the rule is
 * already binding; it must tell the reader to READ the promoted text and either EXTEND it with the new
 * face in every file that carries the key, or say the face is already named.
 *
 * STATES EXERCISED: a promoted stub recurring as the orchestrator (global rules file) and as a worker in a
 * project with two contract files (both named); a lesson that is NOT promoted recurring (it still gets
 * the promotion instruction); and the near miss, a stub of ANOTHER key beside the recurring one.
 *
 * @es Prueba de discriminación de lo que dice `capture` cuando reincide una lección YA PROMOVIDA: no debe
 * exigir una segunda promoción, porque la regla ya es vinculante; debe mandar LEER el texto promovido y
 * EXTENDERLO con la cara nueva en cada fichero que lleve la clave, o decir que la cara ya está nombrada.
 * Estados: un muñón promovido que reincide como orquestador y como worker con dos ficheros de contrato; una
 * lección NO promovida que reincide; y el casi-acierto, un muñón de OTRA clave junto a la que reincide.
 */

import { mkdtempSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { lessonFor, makeCaptureWorld } from './capture-world.mjs';
import { minimalStub } from './ledger-line.mjs';

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-recurrence-')));
const KEY = 'promoted-lesson-key';
const LEDGER_HEAD = '# Lessons Ledger — global\n\n---\n';
const stubOf = (key, count) => `${minimalStub({ date: '2026-09-30', mechanism: '.claude/guard/guard.mjs', marker: `<!--fc:${key}#${String(count)}-->` }).line}\n`;
const plainOf = (key, count) => `- [global] 2026-09-30 — it happened -> RULE: do the thing <!--fc:${key}#${String(count)}-->\n`;

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 700)}`));

const recur = (world, { actor = 'orchestrator', scope = 'global' } = {}) => world.run(['capture', '--key', KEY, '--actor', actor, '--scope', scope, '--lesson', lessonFor(KEY)]);

{
  const world = makeCaptureWorld({ scratch, name: 'orchestrator-stub', files: { 'home/.claude/lessons-ledger.md': `${LEDGER_HEAD}${stubOf(KEY, 2)}${stubOf('another-promoted-key', 5)}`, 'home/.claude/rules/promoted-rules.md': `# Contract\n\n- **\`${KEY}\`** — the rule.\n` } });
  const { status, out } = recur(world);
  const rules = path.join(world.home, '.claude', 'rules', 'promoted-rules.md');

  check('stub recurrence: exits 0', status === 0, out);
  check('stub recurrence: says the rule is ALREADY PROMOTED', out.includes('ALREADY PROMOTED'), out);
  check('stub recurrence: never asks for a second promotion', !out.includes('PROMOTION REQUIRED') && !out.includes('promote --key'), out);
  check('stub recurrence: names the promoted text to READ', out.includes(rules), out);
  check('stub recurrence: offers the two exits (extend with the new face, or say it is already named)', out.includes('EXTEND') && out.includes('say so in your report'), out);
  check('stub recurrence: every English instruction has its Spanish mirror', ['@es YA PROMOVIDA', '@es 1. LEE', '@es 3. Si no lo es, EXTIENDE', '@es 4. Si lo es, dilo'].every((half) => out.includes(half)), out);
}

{
  const config = { scope: 'demo', workerContracts: ['.claude/AGENT-LEDGER.md', '.agents/AGENTS.md'] };
  const world = makeCaptureWorld({ scratch, name: 'worker-stub', config, files: { 'repo/.claude/lessons-ledger.md': `# Lessons Ledger — demo\n\n---\n${stubOf(KEY, 2)}`, 'repo/.claude/AGENT-LEDGER.md': `- ${KEY}\n`, 'repo/.agents/AGENTS.md': `- ${KEY}\n`, 'home/.claude/lessons-ledger.md': LEDGER_HEAD } });
  const { out } = recur(world, { actor: 'worker:coder', scope: 'demo' });

  check('worker stub recurrence: ALREADY PROMOTED, no second promotion', out.includes('ALREADY PROMOTED') && !out.includes('PROMOTION REQUIRED'), out);
  check('worker stub recurrence: names BOTH contract files and says every file', out.includes('AGENT-LEDGER.md') && out.includes('AGENTS.md') && out.includes('EVERY file'), out);
}

{
  const world = makeCaptureWorld({ scratch, name: 'plain-line', files: { 'home/.claude/lessons-ledger.md': `${LEDGER_HEAD}${plainOf(KEY, 1)}` } });
  const { out } = recur(world);

  check('NEAR MISS: a recurring lesson that is NOT promoted still gets the promotion instruction', out.includes('PROMOTION REQUIRED') && !out.includes('ALREADY PROMOTED'), out);
}

console.log(`promoted-recurrence selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
