#!/usr/bin/env node
/**
 * Proof that `verifyMechanism` (`closure.mjs`) does not mistake a chatty selftest for one that did not finish
 * (K4 of the failure-capture audit): a selftest that prints more than the default 1 MiB buffer of
 * `execFileSync` used to be killed by the buffer and reported as "did not finish", a message that means a
 * killed run, not an overflow. Now a selftest may print up to the generous limit and still pass, and one that
 * prints past the limit is reported as an OVERFLOW naming the limit, never as a run that did not finish.
 * Everything runs on throw-away mechanisms in a temporary directory.
 *
 * @es Prueba de que `verifyMechanism` no confunde un selftest locuaz con uno que no terminó (K4 de la
 * auditoría de failure-capture): un selftest que imprime más del 1 MiB por defecto de `execFileSync` moría por
 * el buffer y se informaba como «no terminó», mensaje que significa una ejecución abortada, no un desborde.
 * Ahora un selftest puede imprimir hasta el límite generoso y aun así pasar, y uno que lo supera se informa
 * como DESBORDE con el límite, nunca como una ejecución que no terminó. Todo corre sobre mecanismos
 * desechables en un directorio temporal.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isolateState } from '../hook-state/locations.mjs';
import { verifyMechanism } from './closure.mjs';

isolateState('failure-capture');

const scratch = mkdtempSync(path.join(os.tmpdir(), 'closure-output-selftest-'));
// Removed on every exit, a throw included. @es Se elimina en toda salida, también ante una excepción.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 400)}`));

const KEY = 'chatty-selftest-key';
const MEBIBYTE = 1024 * 1024;

/** A mechanism whose selftest prints `bytes` bytes to stdout and exits `code`. @es Un mecanismo cuyo selftest imprime `bytes` bytes y sale con `code`. */
function mechanism(name, bytes, code = 0) {
  const directory = path.join(scratch, name);

  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'guard.mjs'), `// closes ${KEY}\n`, 'utf8');
  writeFileSync(path.join(directory, 'selftest.mjs'), `process.stdout.write('x'.repeat(${String(bytes)}) + '\\n'); process.exitCode = ${String(code)};\n`, 'utf8');

  return path.join(directory, 'guard.mjs');
}

const verify = (mechanismPath, extra = {}) => verifyMechanism({ mechanismPath, key: KEY, repoRoot: scratch, home: scratch, ...extra });

{
  const result = verify(mechanism('three-mebibytes', 3 * MEBIBYTE));

  check('a selftest printing three MiB, past the old 1 MiB default, is run to its end and passes', result.ok === true, JSON.stringify(result));
}

{
  const result = verify(mechanism('overflowing', 3 * MEBIBYTE), { maxBuffer: MEBIBYTE });

  check('a selftest printing past the limit is refused', result.ok === false, JSON.stringify(result));
  const [english = '', spanish = ''] = String(result.problem).split(' @es ');

  check('...as an overflow that names the limit, not as a run that did not finish', english.includes('overflow') && english.includes(String(MEBIBYTE)) && !english.includes('did not finish'), result.problem);
  check('...with a Spanish half that names the overflow and the limit', spanish.includes('desborde') && spanish.includes(String(MEBIBYTE)), result.problem);
}

{
  const result = verify(mechanism('chatty-and-red', 3 * MEBIBYTE, 1));

  check('a chatty selftest that exits 1 is reported by its exit code, not by its size', result.ok === false && result.problem?.includes('exited 1') === true, JSON.stringify(result));
}

{
  const result = verify(mechanism('quiet', 10), { maxBuffer: MEBIBYTE });

  check('NEAR MISS: a selftest well under the limit passes', result.ok === true, JSON.stringify(result));
}

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture closure output selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
