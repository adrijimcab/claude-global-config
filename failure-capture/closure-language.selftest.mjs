#!/usr/bin/env node
/**
 * Proof that a `--no-mechanism` reason is accepted only in the house bilingual form ("English. @es
 * Español."), so the report of a closed promotion never prints an English reason as if it were Spanish.
 * `readClosure` refuses a reason missing either half, with a bilingual refusal that names the form; a
 * reason in the form is kept VERBATIM (it is never translated or reflowed); and the CLI, driven in a
 * CONSTRUCTED world, refuses an English-only reason without touching the ledger and prints a closed
 * promotion with the reason once, as written, under a bilingual label.
 *
 * @es Prueba de que un motivo de `--no-mechanism` se acepta solo en la forma bilingüe de la casa
 * ("English. @es Español."), así el informe de una promoción cerrada nunca imprime un motivo en inglés como
 * si fuera español. `readClosure` rechaza un motivo al que le falta una mitad, con una negativa bilingüe que
 * nombra la forma; un motivo en la forma se conserva LITERAL (nunca se traduce ni se reformatea); y el CLI,
 * manejado en un mundo CONSTRUIDO, rechaza un motivo solo en inglés sin tocar el ledger e imprime una
 * promoción cerrada con el motivo una vez, tal cual, bajo una etiqueta bilingüe.
 */

import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isolateState } from '../hook-state/locations.mjs';
import { makeCaptureWorld, monolingualRuns } from './capture-world.mjs';
import { readClosure } from './closure.mjs';

isolateState('failure-capture');

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-closure-language-')));
// Removed on every exit, a throw included. @es Se elimina en toda salida, también ante una excepción.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 500)}`));

const ENGLISH = 'a claim written in prose cannot be detected by any hook; measured 0 of 6 recall.';
const SPANISH = 'una afirmación escrita en prosa no la detecta ningún hook; recuerdo medido 0 de 6.';
const BILINGUAL = `${ENGLISH} @es ${SPANISH}`;
const refusal = (reason) => readClosure({ 'no-mechanism': reason });
const problemsOf = (reason) => (refusal(reason).kind === 'refused' ? refusal(reason).problems.join('\n') : '');

// --- the reader ----------------------------------------------------------------------------------------
check('a reason in the house form is accepted and kept verbatim', refusal(BILINGUAL).kind === 'no-mechanism' && refusal(BILINGUAL).reason === BILINGUAL, JSON.stringify(refusal(BILINGUAL)));

for (const [name, reason] of [
  ['an English-only reason', ENGLISH],
  ['a reason whose English half is empty', `@es ${SPANISH} ${SPANISH}`],
  ['a reason whose Spanish half is empty', `${ENGLISH} ${ENGLISH} @es`],
  ['a reason with the marker inside a word', `${ENGLISH} the word cases${SPANISH}`.replace('cases', 'x@esy')]
]) {
  check(`${name} is refused`, refusal(reason).kind === 'refused', JSON.stringify(refusal(reason)));
  check(`...with a refusal that names the @es form`, problemsOf(reason).includes('@es'), problemsOf(reason));
  check(`...and every problem is bilingual`, problemsOf(reason).split('\n').every((problem) => problem.includes(' @es ') || problem.length === 0), problemsOf(reason));
}

// --- the command ---------------------------------------------------------------------------------------
const KEY = 'promote-lesson-key';
const worldFor = (name) => makeCaptureWorld({
  scratch,
  name,
  files: {
    'home/.claude/lessons-ledger.md': `# Lessons Ledger — global\n\n---\n- [global] 2026-09-14 — it recurred -> RULE: do the thing <!--fc:${KEY}#2-->\n`,
    'home/.claude/rules/promoted-rules.md': `# Contract\n- (\`${KEY}\`) face one.\n`
  }
});

{
  const world = worldFor('english-only');
  const before = readFileSync(world.ledger, 'utf8');
  const { status, out } = world.run(['promote', '--key', KEY, '--no-mechanism', ENGLISH]);

  check('the CLI refuses an English-only reason (exit 1)', status === 1, `exit ${String(status)}: ${out}`);
  check('...leaving the ledger byte-identical', readFileSync(world.ledger, 'utf8') === before);
  check('...and nothing it printed is English only', monolingualRuns(out).length === 0, monolingualRuns(out).join(' | '));
}

{
  const world = worldFor('bilingual');
  const { status, out } = world.run(['promote', '--key', KEY, '--no-mechanism', BILINGUAL]);

  check('the CLI closes a promotion with a bilingual reason (exit 0)', status === 0, `exit ${String(status)}: ${out}`);
  check('...printing the reason once, as written', out.split(BILINGUAL).length - 1 === 1, out);
  check('...with no English sentence repeated in the Spanish half', out.split(ENGLISH).length - 1 === 1, out);
  check('...and nothing it printed is English only', monolingualRuns(out).length === 0, monolingualRuns(out).join(' | '));
}

console.log(`closure-language selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
