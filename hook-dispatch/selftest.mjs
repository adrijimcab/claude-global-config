#!/usr/bin/env node
/**
 * Selftest del dispatcher. Recorre el espacio de estados de sus tres decisiones, con guardias
 * CONSTRUIDAS por el test en un directorio temporal (nunca guardias vivas, que cambian solas):
 *
 *   1. fusión (`merge.mjs`): nada, un deny, dos deny, deny contra ask/allow/contexto, block de Stop,
 *      systemMessage, continue:false, claves desconocidas;
 *   2. filtro por herramienta (`manifest.mjs`): sidecar con y sin el tool, sin sidecar, `*`, otro evento;
 *   3. aislamiento (`run-guard.mjs` + `dispatch.mjs`): import roto, sin `evaluate`, `evaluate` que
 *      lanza, `process.exit`, escritura en stdout, `evaluate` async, y que el deny de una guardia
 *      sobrevive a la rotura de otra;
 *   4. el proceso real: stdin → stdout, siempre exit 0, manifiesto roto dicho en voz alta.
 *
 * Cada caso que debe decir «no» está acá también, para que un dispatcher que no puede fallar no pase.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dispatch } from './dispatch.mjs';
import { appliesTo } from './manifest.mjs';
import { mergeOutputs } from './merge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const failures = [];

/**
 * COMPLETION SENTINEL. A guard that calls `process.exit` inside the dispatcher's process would end THIS
 * process half way, with no summary and an exit code nobody chose. A run that exits before printing its
 * summary is reported as a failed check here, so the cause is named instead of read off a bare exit code.
 * @es CENTINELA DE FINALIZACIÓN. Una guardia que llama a `process.exit` dentro del proceso del dispatcher
 * terminaría ESTE proceso a medias, sin resumen. Una salida antes del resumen se informa como check fallido.
 */
let summarised = false;
process.on('exit', () => {
  if (summarised) return;

  writeSync(1, 'FAIL the selftest exited before printing its summary @es FALLO el selftest salió antes de imprimir su resumen\n');
  process.exitCode = 1;
});

function check(name, condition, detail = '') {
  if (condition) passed++;
  else failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`);
}

const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

// ── 1. fusión ────────────────────────────────────────────────────────────────────────────────
{
  const none = mergeOutputs('PreToolUse', [{ guard: 'a', output: undefined }, { guard: 'b', output: undefined }]);
  check('fusión: todas calladas → sin salida', none.output === undefined && none.anomalies.length === 0);

  const one = mergeOutputs('PreToolUse', [{ guard: 'a', output: undefined }, { guard: 'b', output: deny('R-b') }]);
  check('fusión: un deny pasa literal, sin rótulo', one.output?.hookSpecificOutput?.permissionDecision === 'deny' && one.output.hookSpecificOutput.permissionDecisionReason === 'R-b');

  const two = mergeOutputs('PreToolUse', [{ guard: 'a', output: deny('R-a') }, { guard: 'b', output: deny('R-b') }]);
  const reason = two.output?.hookSpecificOutput?.permissionDecisionReason ?? '';
  check('fusión: dos deny conservan ambas razones, en orden y rotuladas', reason.includes('[a]\nR-a') && reason.includes('[b]\nR-b') && reason.indexOf('R-a') < reason.indexOf('R-b'));

  const ask = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'Q' } };
  const allow = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  const mixed = mergeOutputs('PreToolUse', [{ guard: 'x', output: allow }, { guard: 'y', output: ask }, { guard: 'z', output: deny('D') }]);
  check('fusión: deny gana sobre ask y allow', mixed.output?.hookSpecificOutput?.permissionDecision === 'deny' && mixed.output.hookSpecificOutput.permissionDecisionReason === 'D');

  const askOnly = mergeOutputs('PreToolUse', [{ guard: 'x', output: allow }, { guard: 'y', output: ask }]);
  check('fusión: ask gana sobre allow', askOnly.output?.hookSpecificOutput?.permissionDecision === 'ask');

  const context = { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'aviso' } };
  const withContext = mergeOutputs('PreToolUse', [{ guard: 'c', output: context }, { guard: 'd', output: deny('D') }]);
  check('fusión: el contexto de una guardia sobrevive al deny de otra', withContext.output?.hookSpecificOutput?.additionalContext === 'aviso' && withContext.output.hookSpecificOutput.permissionDecision === 'deny');

  const contextOnly = mergeOutputs('PreToolUse', [{ guard: 'c', output: context }]);
  check('fusión: solo contexto → sin decisión inventada', contextOnly.output?.hookSpecificOutput?.permissionDecision === undefined && contextOnly.output?.hookSpecificOutput?.additionalContext === 'aviso');

  const stop = mergeOutputs('Stop', [{ guard: 's1', output: { decision: 'block', reason: 'B1' } }, { guard: 's2', output: { decision: 'block', reason: 'B2' } }]);
  check('fusión Stop: dos block conservan ambas razones', stop.output?.decision === 'block' && stop.output.reason.includes('B1') && stop.output.reason.includes('B2'));

  const message = mergeOutputs('PreToolUse', [{ guard: 'm', output: { systemMessage: 'ojo' } }]);
  check('fusión: systemMessage pasa', message.output?.systemMessage === 'ojo');

  const halt = mergeOutputs('Stop', [{ guard: 'h', output: { continue: false, stopReason: 'basta' } }]);
  check('fusión: continue:false pasa con su motivo', halt.output?.continue === false && halt.output.stopReason === 'basta');

  const odd = mergeOutputs('PreToolUse', [{ guard: 'o', output: { rara: 1 } }, { guard: 'p', output: 'texto' }]);
  check('fusión: claves desconocidas y no-objetos se reportan, no se tragan', odd.anomalies.length === 2);
}

// ── 2. filtro por herramienta ───────────────────────────────────────────────────────────────
{
  const bashOnly = [{ event: 'PreToolUse', matcher: 'Bash' }];
  check('filtro: sidecar Bash corre en Bash', appliesTo(bashOnly, 'PreToolUse', 'Bash'));
  check('filtro: sidecar Bash NO corre en PowerShell', !appliesTo(bashOnly, 'PreToolUse', 'PowerShell'));
  check('filtro: alternativas con |', appliesTo([{ event: 'PreToolUse', matcher: 'Bash|PowerShell' }], 'PreToolUse', 'PowerShell'));
  check('filtro: sin sidecar corre siempre', appliesTo(undefined, 'PreToolUse', 'PowerShell'));
  check('filtro: matcher * corre siempre', appliesTo([{ event: 'PreToolUse', matcher: '*' }], 'PreToolUse', 'Anything'));
  check('filtro: registros de otro evento no restringen', appliesTo([{ event: 'Stop' }], 'PreToolUse', 'Bash'));
}

// ── 3 y 4. aislamiento y proceso real, con guardias construidas ─────────────────────────────
const root = mkdtempSync(path.join(os.tmpdir(), 'hook-dispatch-selftest-'));
// El dispatcher registra los bloqueos en el journal de cada guardia: los procesos que lanza este selftest
// escriben en un estado temporal, nunca en el home vivo.
const savedStateDir = process.env.HOOK_STATE_DIR;
process.env.HOOK_STATE_DIR = path.join(root, 'state');

try {
  const guard = (name, body, registrations) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    if (registrations !== undefined) writeFileSync(`${file}.hook-registration.json`, JSON.stringify({ registrations, why: 'fixture' }));
  };
  const manifest = (name, guards, event = 'PreToolUse') => {
    const file = path.join(root, name);
    writeFileSync(file, JSON.stringify({ event, guards }));
    return file;
  };
  const payload = (tool, command = 'x') => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command } });
  const denyGuard = (reason) => `export function evaluate(raw) { const p = JSON.parse(raw); return p.tool_input.command === 'bad' ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: '${reason}' } } : undefined; }\n`;

  guard('deny-a.mjs', denyGuard('A'), [{ event: 'PreToolUse', matcher: 'Bash|PowerShell' }]);
  guard('deny-bash-only.mjs', denyGuard('BASH'), [{ event: 'PreToolUse', matcher: 'Bash' }]);
  guard('async.mjs', `export async function evaluate(raw) { await new Promise((r) => setTimeout(r, 5)); return JSON.parse(raw).tool_input.command === 'bad' ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'ASYNC' } } : undefined; }\n`);
  guard('throws.mjs', `export function evaluate() { throw new Error('boom'); }\n`);
  guard('no-evaluate.mjs', `export const nothing = 1;\n`);
  guard('broken-import.mjs', `import './does-not-exist.mjs';\nexport function evaluate() {}\n`);
  guard('exits.mjs', `export function evaluate() { process.exit(3); }\n`);
  guard('prints.mjs', `export function evaluate() { console.log('ruido'); }\n`);

  const allGood = manifest('good.json', ['deny-a.mjs', 'deny-bash-only.mjs', 'async.mjs']);

  const clean = await dispatch(allGood, payload('Bash', 'ok'));
  check('dispatch: comando limpio → sin salida ni problemas', clean.output === undefined && clean.problems.length === 0, JSON.stringify(clean));

  const bashBad = await dispatch(allGood, payload('Bash', 'bad'));
  const bashReason = bashBad.output?.hookSpecificOutput?.permissionDecisionReason ?? '';
  check('dispatch: Bash malo → deny de las tres, incluida la async', bashReason.includes('A') && bashReason.includes('BASH') && bashReason.includes('ASYNC'), bashReason);

  const psBad = await dispatch(allGood, payload('PowerShell', 'bad'));
  const psReason = psBad.output?.hookSpecificOutput?.permissionDecisionReason ?? '';
  check('dispatch: PowerShell malo → la guardia solo-Bash NO corre', psReason.includes('A') && !psReason.includes('BASH'), psReason);

  for (const broken of ['throws.mjs', 'no-evaluate.mjs', 'broken-import.mjs', 'exits.mjs', 'prints.mjs']) {
    const file = manifest(`with-${broken}.json`, [broken, 'deny-a.mjs']);
    const result = await dispatch(file, payload('Bash', 'bad'));
    check(`aislamiento ${broken}: el deny de la otra guardia sobrevive`, result.output?.hookSpecificOutput?.permissionDecision === 'deny', JSON.stringify(result.output));
    check(`aislamiento ${broken}: la rotura se nombra en systemMessage`, (result.output?.systemMessage ?? '').includes(broken), result.output?.systemMessage);
    check(`aislamiento ${broken}: cuenta como problema`, result.problems.length === 1);
  }

  const brokenAlone = await dispatch(manifest('throws-alone.json', ['throws.mjs']), payload('Bash', 'ok'));
  check('aislamiento: una guardia rota sola NO produce un permiso limpio silencioso', brokenAlone.output?.systemMessage !== undefined && brokenAlone.output.hookSpecificOutput === undefined);

  // Proceso real.
  const run = (manifestFile, input) => spawnSync(process.execPath, [path.join(HERE, 'dispatch.mjs'), manifestFile], { input, encoding: 'utf8' });

  const cliDeny = run(allGood, payload('Bash', 'bad'));
  let parsed;
  try {
    parsed = JSON.parse(cliDeny.stdout);
  } catch {
    parsed = undefined;
  }
  check('proceso: deny por stdout como JSON', parsed?.hookSpecificOutput?.permissionDecision === 'deny', cliDeny.stdout);
  check('proceso: exit 0 con deny', cliDeny.status === 0);

  const cliClean = run(allGood, payload('Bash', 'ok'));
  check('proceso: limpio → stdout vacío, exit 0', cliClean.stdout.trim() === '' && cliClean.status === 0, cliClean.stdout);

  const cliBroken = run(manifest('with-throws-cli.json', ['throws.mjs', 'deny-a.mjs']), payload('Bash', 'bad'));
  check('proceso: guardia rota → exit 0 igual (si no, el harness tiraría el deny de la otra)', cliBroken.status === 0);
  check('proceso: guardia rota → stderr la nombra', cliBroken.stderr.includes('throws.mjs'));

  const cliMissing = run(path.join(root, 'no-such-manifest.json'), payload('Bash', 'bad'));
  check('proceso: manifiesto inexistente → dicho en voz alta, exit 0', cliMissing.status === 0 && cliMissing.stdout.includes('NINGUNA de sus guardias decidió'), cliMissing.stdout);

  const cliEmpty = run(manifest('empty.json', []), payload('Bash', 'bad'));
  check('proceso: manifiesto vacío → no es «cero guardias limpias»', cliEmpty.stdout.includes('NINGUNA de sus guardias decidió'), cliEmpty.stdout);
} finally {
  if (savedStateDir === undefined) delete process.env.HOOK_STATE_DIR;
  else process.env.HOOK_STATE_DIR = savedStateDir;
  rmSync(root, { recursive: true, force: true });
}

const total = passed + failures.length;

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${total} passed`);
summarised = true;
process.exitCode = failures.length === 0 ? 0 : 1;
