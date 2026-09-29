#!/usr/bin/env node
/**
 * Selftest de `claim-guard.mjs`, que hasta el 2026-09-28 no tenía ninguno: una guardia que nunca se vio
 * ponerse roja no está probada (`guard-that-cannot-go-red`). Recorre el espacio de su decisión, en los dos
 * sentidos, y por los dos caminos por los que corre: como proceso propio (así estuvo registrada) y en el
 * proceso del dispatcher (`evaluate(raw)`), exigiendo el MISMO veredicto en ambos.
 *
 *   bloquea : frase absoluta/negativa sin evidencia (español e inglés), con BOM de PowerShell.
 *   deja    : ya bloqueó en este turno, mensaje vacío, sin frase de riesgo, con evidencia de cada tipo,
 *             payload ilegible.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'claim-guard.mjs');

const { evaluate } = await import('./claim-guard.mjs');

let passed = 0;
const failures = [];

const payload = (message, extra = {}) => JSON.stringify({ hook_event_name: 'Stop', last_assistant_message: message, stop_hook_active: false, ...extra });
const standalone = (raw) => {
  const run = spawnSync(process.execPath, [GUARD], { input: raw, encoding: 'utf8' });
  const text = run.stdout.trim();
  return { status: run.status, output: text === '' ? undefined : JSON.parse(text) };
};

function expectVerdict(name, raw, shouldBlock) {
  const inProcess = evaluate(raw);
  const alone = standalone(raw);
  const blocked = inProcess?.decision === 'block';

  if (blocked === shouldBlock) passed++;
  else failures.push(`${name}: esperaba ${shouldBlock ? 'bloqueo' : 'paso'} y el evaluate dio ${JSON.stringify(inProcess)?.slice(0, 120)}`);

  if (alone.status === 0 && JSON.stringify(alone.output) === JSON.stringify(inProcess)) passed++;
  else failures.push(`${name}: el proceso propio y evaluate discrepan (exit ${alone.status})`);
}

expectVerdict('negación en español sin evidencia', payload('Eso no existe en el repo, lo revisé de memoria.'), true);
expectVerdict('absoluto en inglés sin evidencia', payload('There is no guard for that case.'), true);
expectVerdict('«nada lo habría cazado» sin evidencia', payload('Nada lo habría cazado antes.'), true);
expectVerdict('con BOM de PowerShell también bloquea', `﻿${payload('Nunca pasa eso.')}`, true);

expectVerdict('ya bloqueó en este turno', payload('Eso no existe.', { stop_hook_active: true }), false);
expectVerdict('mensaje vacío', payload('   '), false);
expectVerdict('sin frase de riesgo', payload('Listo, cambié el archivo y corrí los tests.'), false);
expectVerdict('con ruta de archivo como evidencia', payload('No existe otro registro: lo busqué en src/app/main.ts.'), false);
expectVerdict('con comando mostrado', payload('No hay otro caso: `rg -n guard src` no devolvió nada.'), false);
expectVerdict('con código de salida', payload('Nunca falla: exit code 0 en las tres corridas.'), false);
expectVerdict('con fuente citada', payload('No existe esa opción: https://code.claude.com/docs/en/hooks'), false);
expectVerdict('payload ilegible', '{ no es json', false);

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
process.exitCode = failures.length === 0 ? 0 : 1;
