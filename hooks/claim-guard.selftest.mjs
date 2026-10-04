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

/**
 * COMPLETION SENTINEL. If importing the guard ever ran its `main()` (the main-module check broken), that
 * would read this process's empty stdin and call `process.exit(0)` half way through: the selftest would end
 * green having checked nothing. So a run that exits without printing its summary is forced RED here.
 * @es CENTINELA DE FINALIZACIÓN. Si importar la guardia ejecutara su `main()`, este proceso saldría con 0 a
 * mitad de camino sin comprobar nada; una salida sin imprimir el resumen se fuerza a ROJO aquí.
 */
let summarised = false;
process.on('exit', () => {
  if (summarised) return;

  console.error('FAIL the selftest exited before printing its summary @es FALLO el selftest salió antes de imprimir su resumen');
  process.exitCode = 1;
});

const { evaluate } = await import('./claim-guard.mjs');

// Importing must have NO side effect: were `main()` running, it would end this process at the next tick of
// its stdin, which the sentinel above turns RED. @es Importar no debe tener efectos: si corriera `main()`,
// terminaría este proceso con el stdin, y el centinela lo pone en ROJO.
await new Promise((resolve) => setTimeout(resolve, 100));

let passed = 0;
const failures = [];

const payload = (message, extra = {}) => JSON.stringify({ hook_event_name: 'Stop', last_assistant_message: message, stop_hook_active: false, ...extra });
const standalone = (raw) => {
  const run = spawnSync(process.execPath, [GUARD], { input: raw, encoding: 'utf8' });
  const text = run.stdout.trim();
  return { status: run.status, output: text === '' ? undefined : JSON.parse(text) };
};

/**
 * A throw inside the guard is a verdict about the guard, reported as a failed check — never an uncaught
 * crash that would hide which decision broke. @es Un throw de la guardia es un veredicto, no un crash.
 */
function evaluated(name, raw) {
  try {
    return evaluate(raw);
  } catch (error) {
    failures.push(`${name}: evaluate lanzó ${error.name}: ${error.message}`);

    return undefined;
  }
}

function expectVerdict(name, raw, shouldBlock) {
  const inProcess = evaluated(name, raw);
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

expectVerdict('«ningún» sin evidencia', payload('Ninguno de los casos lo cubre.'), true);
expectVerdict('«we do not have» sin evidencia', payload("We don't have a guard for it."), true);
expectVerdict('«nothing would» sin evidencia', payload('Nothing would have caught that.'), true);
expectVerdict('«always» sin evidencia', payload('It always works.'), true);
expectVerdict('«does not exist» sin evidencia', payload('That option does not exist.'), true);
expectVerdict('«imposible» sin evidencia', payload('Eso es imposible.'), true);

expectVerdict('ya bloqueó en este turno', payload('Eso no existe.', { stop_hook_active: true }), false);
expectVerdict('mensaje vacío', payload('   '), false);
expectVerdict('sin frase de riesgo', payload('Listo, cambié el archivo y corrí los tests.'), false);
expectVerdict('con ruta de archivo como evidencia', payload('No existe otro registro: lo busqué en src/app/main.ts.'), false);
expectVerdict('con comando mostrado', payload('No hay otro caso: `rg -n guard src` no devolvió nada.'), false);
expectVerdict('con código de salida', payload('Nunca falla: exit code 0 en las tres corridas.'), false);
expectVerdict('con fuente citada', payload('No existe esa opción: https://code.claude.com/docs/en/hooks'), false);
expectVerdict('payload ilegible', '{ no es json', false);
expectVerdict('payload JSON null', 'null', false);
expectVerdict('mensaje que no es texto se ignora', JSON.stringify({ last_assistant_message: ['There is no guard for that case.'] }), false);
expectVerdict('con ruta:línea como evidencia', payload('No existe otro caso, ver línea:42.'), false);
expectVerdict('con palabra de verificación', payload('No existe otro caso, verificado.'), false);
expectVerdict('con bloque de salida pegado', payload('No existe otro caso:\n```\nsin coincidencias\n```'), false);

// The block's CONTENT, not only its existence. @es El CONTENIDO del bloqueo, no solo que exista.
const blocked = evaluate(payload('Eso no existe en el repo.'));
const check = (ok, label) => (ok ? passed++ : failures.push(label));

check(blocked?.reason?.includes('"no existe"') === true, 'la razón nombra la frase que disparó');
check(blocked?.hookSpecificOutput?.hookEventName === 'Stop', 'el contexto adicional se declara del evento Stop');
check(blocked?.hookSpecificOutput?.additionalContext?.includes('CLAIM GUARD TRIPPED on the phrase: "no existe"') === true, 'el contexto adicional repite la frase que disparó');
check(blocked?.hookSpecificOutput?.additionalContext?.includes('at most once per turn') === true, 'el contexto adicional avisa de que dispara a lo sumo una vez');

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
summarised = true;
process.exitCode = failures.length === 0 ? 0 : 1;
