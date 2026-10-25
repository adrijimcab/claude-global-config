#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-io/hook-io.mjs`: the hook protocol port (payload in, decision out, main-only
 * entry). Every case runs on state CONSTRUCTED here: payload strings, a stream, a real directory junction and
 * child processes that import the port through it.
 *
 * THE STATE SPACE: a payload with and without a UTF-8 BOM, empty and invalid JSON on both parse forms (the
 * throwing form must carry both languages), a stream read whole, the main-process test through a plain path and
 * through a junction (Node resolves the main module's real path, `argv[1]` keeps the junction), the exact JSON of
 * each shaper, the evaluator (decision, malfunction recorded and allowed, async decision) and the standalone
 * `hookMain` (decision printed, nothing printed, unreadable stdin).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `hook-io/hook-io.mjs`, el puerto del protocolo de hooks. Cada caso corre sobre
 * estado CONSTRUIDO aquí: payloads, un stream, una junction real y procesos hijos que importan el puerto a través
 * de ella. Espacio de estados: payload con y sin BOM, JSON vacío o inválido en las dos formas de parseo (la que
 * lanza lleva los dos idiomas), lectura completa de un stream, «soy el principal» por ruta normal y por junction,
 * el JSON exacto de cada constructor de salida, el evaluador y `hookMain`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { advise, blockStop, deny, evaluator, hookMain, parseFailureMessage, parsePayload, readStdin, runWhenMain, tryParsePayload } from './hook-io.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const portUrl = pathToFileURL(path.join(here, 'hook-io.mjs')).href;
const scratch = mkdtempSync(path.join(tmpdir(), 'hook-io-selftest-'));
const BOM = '﻿';
const errorOf = (action) => {
  try {
    action();
  } catch (error) {
    return error;
  }

  return undefined;
};

/**
 * Ends the run: removes only what this file created (a junction is unlinked, never followed) and reports.
 * @es Termina la corrida: borra solo lo creado aquí (la junction se desvincula, nunca se sigue) e informa.
 */
function finish() {
  rmSync(scratch, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(`hook-io selftest FAILED (${failures.length}/${passed + failures.length}):\n${failures.join('\n')}`);
    process.exit(1);
  }

  console.log(`hook-io selftest: ${passed} checks passed`);
}

async function main() {
  // --- parsing ---
  check('parse: plain JSON', parsePayload('{"a":1}'), { a: 1 });
  check('parse: a leading BOM is stripped', parsePayload(`${BOM}{"a":1}`), { a: 1 });
  check('parse: only the FIRST character is a BOM candidate', errorOf(() => parsePayload(`{"a":1}${BOM}`)) instanceof Error, true);
  check('tryParse: plain JSON', tryParsePayload('{"a":1}'), { a: 1 });
  check('tryParse: a leading BOM is stripped', tryParsePayload(`${BOM}{"a":1}`), { a: 1 });
  check('tryParse: invalid JSON is undefined', tryParsePayload('{nope'), undefined);
  check('tryParse: empty text is undefined', tryParsePayload(''), undefined);
  check('tryParse: a literal JSON null is kept (not confused with a failure)', tryParsePayload('null'), null);

  const invalid = errorOf(() => parsePayload('{nope'));
  const empty = errorOf(() => parsePayload(''));

  check('parse: invalid JSON throws an Error', invalid instanceof Error, true);
  check('parse: the message carries both languages', [invalid.message.includes(' @es '), /invalid|Invalid/.test(invalid.message.split(' @es ')[0]), /inválid/.test(invalid.message.split(' @es ')[1])], [true, true, true]);
  check('parse: empty text throws the same bilingual error', empty.message.includes(' @es '), true);
  check('parse: the parser cause is kept', invalid.cause instanceof SyntaxError, true);
  check('failure message: a wrapped parse error reports the parser message, not the wrapper', parseFailureMessage(invalid), invalid.cause.message);
  check('failure message: an error without a cause reports its own message', parseFailureMessage(new Error('boom')), 'boom');
  check('failure message: a thrown non-error is its text', parseFailureMessage('plain'), 'plain');

  // --- stdin ---
  const stream = new PassThrough();
  const bytes = Buffer.from('{"x":"ñ"}');
  const reading = readStdin(stream);

  // The two bytes of "ñ" arrive in different chunks, each chunk in its own turn of the event loop.
  for (const part of [bytes.subarray(0, 7), bytes.subarray(7, 8), bytes.subarray(8)]) {
    stream.write(part);
    await new Promise((resolve) => setImmediate(resolve));
  }

  stream.end();
  check('readStdin: a stream is read whole across chunks and decoded as UTF-8', await reading, '{"x":"ñ"}');

  // --- shapers ---
  check('deny: the exact PreToolUse literal', JSON.stringify(deny('no')), '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"no"}}');
  check('advise: the exact PreToolUse literal', JSON.stringify(advise('ctx')), '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"ctx"}}');
  check('blockStop: the exact Stop literal', JSON.stringify(blockStop('why')), '{"decision":"block","reason":"why"}');
  check('blockStop: the optional context rides in the Stop hookSpecificOutput', JSON.stringify(blockStop('why', 'ctx')), '{"decision":"block","reason":"why","hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"ctx"}}');

  // --- evaluator ---
  const recorded = [];
  const record = (guard, entry) => recorded.push({ guard, ...entry });
  const decided = await evaluator('g', (payload) => deny(payload.why), record)('{"why":"r"}');
  const asyncDecided = await evaluator('g', async () => advise('later'), record)('{}');
  const allowed = await evaluator('g', () => undefined, record)('{}');
  const recordedBeforeFailures = recorded.length;
  const broken = await evaluator('g', () => { throw new Error('boom'); }, record)('{}');
  const rejected = await evaluator('g', async () => { throw new Error('later'); }, record)('{}');
  const unparsable = await evaluator('g', () => deny('x'), record)('{nope');

  check('evaluator: the decision over the parsed payload is returned', decided, deny('r'));
  check('evaluator: an async decision is awaited', asyncDecided, advise('later'));
  check('evaluator: no decision stays undefined and records nothing', [allowed, recordedBeforeFailures], [undefined, 0]);
  check('evaluator: a throwing decision is allowed', broken, undefined);
  check('evaluator: an unparsable payload is allowed', unparsable, undefined);
  check('evaluator: an async decision that rejects is allowed too', rejected, undefined);
  check('evaluator: each malfunction is recorded with guard, error and raw', recorded.map((entry) => [entry.guard, entry.error.includes('boom') || entry.error.includes('later') || entry.error.includes('JSON'), entry.raw]), [['g', true, '{}'], ['g', true, '{}'], ['g', true, '{nope']]);

  const silent = spawnSync(process.execPath, ['--input-type=module', '-e', `import { evaluator } from ${JSON.stringify(portUrl)}; console.log(await evaluator('lone-guard', () => { throw new Error('x'); })('{}'));`], { encoding: 'utf8' });
  const [english, spanish] = silent.stderr.split(' @es ');

  check('evaluator: without a recorder the malfunction is still said on stderr, in both languages', [silent.status, silent.stdout.trim(), english.includes('lone-guard: malfunction, allowed.'), spanish.includes('lone-guard: avería, se deja pasar.')], [0, 'undefined', true, true]);

  const unreadable = await (async () => {
    const out = [];
    const original = process.stdout.write;

    process.stdout.write = (text) => out.push(text);
    try {
      await hookMain(() => deny('never'), () => { throw new Error('EAGAIN'); })();
      await hookMain(() => advise('read'), () => '{}')();
    } finally {
      process.stdout.write = original;
    }

    return out;
  })();

  check('hookMain: an unreadable stdin ends silently, a readable one is answered', unreadable, [`${JSON.stringify(advise('read'))}\n`]);

  // --- runWhenMain and hookMain through a plain path and a junction ---
  const real = path.join(scratch, 'real');
  const junction = path.join(scratch, 'link');

  mkdirSync(real);
  writeFileSync(path.join(real, 'entry.mjs'), [
    `import { runWhenMain, hookMain, deny } from ${JSON.stringify(portUrl)};`,
    `const run = process.argv[2] === 'hook' ? hookMain((raw) => (raw.includes('deny') ? deny('stdin') : undefined)) : () => console.log('MAIN');`,
    'runWhenMain(import.meta.url, run);',
    ''
  ].join('\n'));
  writeFileSync(path.join(real, 'importer.mjs'), `import './entry.mjs';\nconsole.log('IMPORTED');\n`);
  symlinkSync(real, junction, 'junction');

  const launch = (file, extra = [], input = '') => spawnSync(process.execPath, [file, ...extra], { encoding: 'utf8', input });
  const direct = launch(path.join(real, 'entry.mjs'));
  const throughJunction = launch(path.join(junction, 'entry.mjs'));
  const imported = launch(path.join(real, 'importer.mjs'));
  const hooked = launch(path.join(junction, 'entry.mjs'), ['hook'], '{"deny":true}');
  const hookedSilent = launch(path.join(junction, 'entry.mjs'), ['hook'], '{}');

  check('runWhenMain: runs main when launched by its real path', [direct.status, direct.stdout.trim()], [0, 'MAIN']);
  check('runWhenMain: runs main when launched through a junction', [throughJunction.status, throughJunction.stdout.trim()], [0, 'MAIN']);
  check('runWhenMain: does not run main when imported', [imported.status, imported.stdout.trim()], [0, 'IMPORTED']);
  check('hookMain: prints the decision as one JSON line', [hooked.status, hooked.stdout], [0, `${JSON.stringify(deny('stdin'))}\n`]);
  check('hookMain: prints nothing for no decision', [hookedSilent.status, hookedSilent.stdout], [0, '']);

  const missingMain = (() => { let ran = false; runWhenMain(pathToFileURL(path.join(scratch, 'not-main.mjs')).href, () => { ran = true; }); return ran; })();

  check('runWhenMain: a module that is not the entry point never runs main in-process', missingMain, false);

  unlinkSync(junction);
  check('cleanup: unlinking the junction left its target intact', [existsSync(junction), existsSync(path.join(real, 'entry.mjs')), readFileSync(path.join(real, 'importer.mjs'), 'utf8').length > 0], [false, true, true]);
}

main().then(finish, (error) => {
  failures.push(`selftest crashed — ${error instanceof Error ? error.stack : String(error)}`);
  finish();
});
