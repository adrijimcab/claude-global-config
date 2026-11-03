#!/usr/bin/env node
/**
 * Proves the shared assertion collector `suite()` reports a failed check THE MOMENT it fails, before the selftest
 * goes on working, and still prints the tally last and sets the exit code. The mutation runner stops a mutant's
 * selftest at its first failed check, so a failure printed only at `finish` would save nothing.
 * Each case runs a CONSTRUCTED script in a child process, so the exit code it sets is observed, not assumed.
 *
 * @es Prueba que el colector compartido `suite()` informa un check fallido EN EL MOMENTO en que falla, antes de que el
 * selftest siga trabajando, y que igual imprime el recuento al final y fija el código de salida. Cada caso corre un
 * script CONSTRUIDO en un proceso hijo, así el código de salida se observa en vez de suponerse.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIXTURES = new URL('./fixtures.mjs', import.meta.url).href;
const results = [];
const expect = (label, holds) => results.push({ label, holds });

function runScript(body) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fleet-kit-suite-'));
  const file = path.join(dir, 'case.mjs');

  try {
    writeFileSync(file, `import { suite } from ${JSON.stringify(FIXTURES)};\nconst { check, finish } = suite();\n${body}\n`);
    const run = spawnSync(process.execPath, [file], { encoding: 'utf8' });

    return { status: run.status, lines: (run.stdout ?? '').split('\n').filter((line) => line.length > 0) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const failing = runScript("check('one', 1, 2);\nconsole.log('AFTER THE FAILED CHECK');\ncheck('two', 3, 3);\nfinish('case');");

expect('a failed check is printed before the selftest goes on', failing.lines[0] === 'FAIL one: expected 2, got 1' && failing.lines[1] === 'AFTER THE FAILED CHECK');
expect('the tally is printed last and counts every check', failing.lines.at(-1) === 'case: 1/2 passed');
expect('a failed check is printed exactly once', failing.lines.filter((line) => line.startsWith('FAIL ')).length === 1);
expect('a failed check sets exit code 1', failing.status === 1);

const passing = runScript("check('one', 1, 1);\ncheck('two', 'a', 'a');\nfinish('case');");

expect('a passing suite prints no FAIL line', !passing.lines.some((line) => line.startsWith('FAIL')));
expect('a passing suite prints its tally and exits 0', passing.lines.at(-1) === 'case: 2/2 passed' && passing.status === 0);

for (const { label, holds } of results) console.log(`${holds ? 'ok  ' : 'FAIL'} ${label}`);
const failed = results.filter(({ holds }) => !holds).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
