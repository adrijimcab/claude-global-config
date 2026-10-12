#!/usr/bin/env node
/**
 * Discrimination proof of the fixture provisioner (`fixture-loop.mjs`), which seven selftests depend on:
 * it copies every loop module and the shared `bilingual-output` modules (never their selftests or
 * campaigns) into a sandbox, honours the filter it is given, lets a sandboxed `capture.mjs` resolve its
 * shared imports, and reports a shared module the copied code needs but the sandbox lacks, by name.
 *
 * @es Prueba de discriminación del aprovisionador de fixtures, del que dependen siete selftests: copia cada
 * módulo del lazo y los módulos compartidos de `bilingual-output` (nunca sus selftests ni campañas) a un
 * sandbox, respeta el filtro que recibe, deja que un `capture.mjs` en sandbox resuelva sus imports
 * compartidos, e informa por su nombre de un módulo compartido que el código copiado necesita y el sandbox no tiene.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { provisionLoop, worldEnv } from './fixture-loop.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('failure-capture');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.join(HERE, '..', 'bilingual-output');
const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'fixture-loop-')));

let passed = 0;
const failures = [];
const equal = (name, actual, expected) => (JSON.stringify(actual) === JSON.stringify(expected) ? (passed += 1) : failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));
const attempt = (fn) => { try { fn(); return 'ok'; } catch (error) { return error instanceof Error ? error.message : String(error); } };
const mjsOf = (dir) => readdirSync(dir).filter((file) => file.endsWith('.mjs')).sort();
const loopAt = (name) => path.join(scratch, name, '.claude', 'failure-capture');
const missingFor = (names) => `shared module(s) the loop imports are missing from the sandbox: ${names}. @es faltan en el sandbox módulos compartidos que importa el lazo: ${names}.`;

try {
  const everything = loopAt('everything');

  equal('the real tree provisions without complaint', attempt(() => provisionLoop(everything)), 'ok');
  equal('every loop module is copied, selftests and campaigns included', mjsOf(everything), mjsOf(HERE));
  equal('the shared modules are copied beside the loop, without their selftests or campaigns', mjsOf(path.join(everything, '..', 'bilingual-output')), ['message.mjs', 'speaker.mjs']);

  const engineDirectory = path.join(everything, '..', 'agent-contract-parity');
  const engine = existsSync(engineDirectory) ? mjsOf(engineDirectory) : [];

  equal('the parity engine modules the promotion imports are copied beside the loop', ['anchors-file.mjs', 'contract-presence.mjs', 'parity.mjs', 'refusal-text.mjs'].every((name) => engine.includes(name)), true);
  equal('...without the engine selftest or its mutant campaign', engine.some((name) => name.includes('selftest') || name.includes('mutants')), false);

  const filtered = loopAt('filtered');

  equal('a filtered provisioning is accepted too', attempt(() => provisionLoop(filtered, (file) => file === 'capture.mjs')), 'ok');
  equal('the filter decides which loop modules are copied', mjsOf(filtered), ['capture.mjs']);
  equal('the shared modules are copied whatever the filter keeps', mjsOf(path.join(filtered, '..', 'bilingual-output')), ['message.mjs', 'speaker.mjs']);

  const home = path.join(scratch, 'everything');
  const run = spawnSync(process.execPath, [path.join(everything, 'capture.mjs'), 'keys'], { cwd: home, encoding: 'utf8', env: worldEnv(home), timeout: 120_000 });

  equal('a sandboxed capture.mjs resolves its shared imports', `${run.stderr}${run.stdout}`.includes('ERR_MODULE_NOT_FOUND'), false);
  equal('...and prints through the speaker', run.stdout.includes(' @es '), true);

  const sparseShared = path.join(scratch, 'sparse-shared');

  mkdirSync(sparseShared, { recursive: true });
  writeFileSync(path.join(sparseShared, 'message.mjs'), 'export {};\n', 'utf8');
  equal('a shared module the real loop imports but the source lacks is reported by name', attempt(() => provisionLoop(loopAt('sparse'), () => true, { loop: HERE, shared: sparseShared })), missingFor('speaker.mjs'));

  const ghostLoop = path.join(scratch, 'ghost-loop');
  const emptyShared = path.join(scratch, 'empty-shared');

  mkdirSync(ghostLoop, { recursive: true });
  mkdirSync(emptyShared, { recursive: true });
  writeFileSync(path.join(ghostLoop, 'x.mjs'), "import { a } from '../bilingual-output/ghost.mjs';\nimport { b } from '../bilingual-output/another.mjs';\nexport { a, b };\n", 'utf8');
  equal('every missing shared module is named, sorted', attempt(() => provisionLoop(loopAt('ghost'), () => true, { loop: ghostLoop, shared: emptyShared })), missingFor('another.mjs, ghost.mjs'));

  writeFileSync(path.join(ghostLoop, 'x.mjs'), "import { a } from './y.mjs';\nconst note = \"from '../bilingual-output/ghost.mjs'\";\nexport { a, note };\n", 'utf8');
  equal('a string that merely mentions a shared import is not an import', attempt(() => provisionLoop(loopAt('plain'), () => true, { loop: ghostLoop, shared: emptyShared })), 'ok');
  equal('the real shared directory holds the two modules', mjsOf(SHARED).includes('speaker.mjs') && mjsOf(SHARED).includes('message.mjs'), true);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`fixture-loop selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
