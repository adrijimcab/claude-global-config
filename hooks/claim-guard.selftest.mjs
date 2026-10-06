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
 *
 * Y la premisa atribuida: un caso que bloquea por cada patrón (inglés y español), «verificado» que no es
 * recibo, cada recibo que sí lo es, y los negativos de precisión: la frase entre comillas o en código en
 * línea (palabras de otro, no premisa propia), «como pediste» y «per your instructions».
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

// ATTRIBUTED PREMISES: one blocking case per pattern, each matched by that pattern alone, so a pattern that
// stops matching turns its case green. @es PREMISAS ATRIBUIDAS: un caso que bloquea por patrón, casado solo por él.
const PREMISES = [
  ['premisa: «your rules require»', 'Your global rules require reading the full gate output, so I kept it.'],
  ['premisa: «per your mandates»', 'Per your mandates, the worker must stay read-only.'],
  ['premisa: «the owner wants»', 'The owner wants a single writer, so I serialized the edits.'],
  ['premisa: «you said that»', 'You said that the hook runs on Windows only.'],
  ['premisa: «the docs say»', 'The docs say prompt hooks default to a thirty second timeout.'],
  ['premisa: «according to the documentation»', 'According to the documentation, prompt hooks are cheap.'],
  ['premisa: «the worker\'s report says»', "The worker's report says the selftests are green."],
  ['premisa: «the subagent reported»', 'The subagent reported a clean tree, so I merged it.'],
  ['premisa: «according to the agent»', 'According to the agent, the cache is warm.'],
  ['premisa: «tu mandato exige»', 'Tu mandato exige leer toda la salida del gate.'],
  ['premisa: «según tus reglas»', 'Según tus reglas, el worker queda en solo lectura.'],
  ['premisa: «el dueño quiere»', 'El dueño quiere un único escritor, así que serialicé las ediciones.'],
  ['premisa: «el dueño pidió» (verbo con tilde final)', 'El dueño pidió un solo escritor.'],
  ['premisa: «me dijiste que»', 'Me dijiste que el hook corre solo en Windows.'],
  ['premisa: «la documentación dice»', 'La documentación dice que el timeout por defecto es de treinta segundos.'],
  ['premisa: «según la documentación»', 'Según la documentación, los hooks de prompt son baratos.'],
  ['premisa: «el informe del agente dice»', 'El informe del agente dice que los selftests están en verde.'],
  ['premisa: «el subagente reportó»', 'El subagente reportó un árbol limpio, así que lo integré.'],
  ['premisa: «según el worker»', 'Según el worker, la caché está caliente.'],
];

for (const [name, message] of PREMISES) expectVerdict(`${name} sin evidencia bloquea`, payload(message), true);

expectVerdict('premisa: «verificado» no es recibo', payload('Tu mandato exige leer toda la salida, verificado.'), true);
expectVerdict('premisa: una cita corta no es recibo', payload('Dijiste «léelo todo», y tu mandato exige leer toda la salida.'), true);

expectVerdict('premisa con ruta del fichero de reglas', payload('Tu mandato exige leer toda la salida (rules/00-owner-mandates.md).'), false);
expectVerdict('premisa con fichero:línea', payload('Your rules require it, see mandates:67.'), false);
expectVerdict('premisa con comando mostrado', payload('Your rules require it: `rg -n require rules` lists it.'), false);
expectVerdict('premisa con código de salida', payload('The subagent reported a clean tree, exit code 0.'), false);
expectVerdict('premisa con URL', payload('The docs say thirty seconds: https://code.claude.com/docs/en/hooks'), false);
expectVerdict('premisa con bloque de salida', payload('Tus reglas exigen esto:\n```\nsalida del comando\n```'), false);
expectVerdict('premisa con cita larga', payload('Tu mandato exige juzgar: «Las premisas se juzgan antes de actuar».'), false);
expectVerdict('premisa con cita en bloque', payload('Tu mandato exige esto:\n> se juzga antes de actuar'), false);
expectVerdict('premisa repetida entre comillas no es propia', payload('Tu frase fue «tu mandato dice», y la tomé como pregunta.'), false);
expectVerdict('premisa en código en línea no es propia', payload('El literal `your rules require` aparece en el fixture.'), false);
expectVerdict('«como pediste» no es una premisa', payload('Hecho, como pediste.'), false);
expectVerdict('«per your instructions» no es una premisa', payload('Per your instructions, I created the branch.'), false);
expectVerdict('premisa tras un bloqueo en este turno', payload('Tu mandato exige leer todo.', { stop_hook_active: true }), false);

// The block's CONTENT, not only its existence. @es El CONTENIDO del bloqueo, no solo que exista.
const blocked = evaluate(payload('Eso no existe en el repo.'));
const check = (ok, label) => (ok ? passed++ : failures.push(label));

check(blocked?.reason?.includes('"no existe"') === true, 'la razón nombra la frase que disparó');
check(blocked?.hookSpecificOutput?.hookEventName === 'Stop', 'el contexto adicional se declara del evento Stop');
check(blocked?.hookSpecificOutput?.additionalContext?.includes('CLAIM GUARD TRIPPED on the phrase: "no existe"') === true, 'el contexto adicional repite la frase que disparó');
check(blocked?.hookSpecificOutput?.additionalContext?.includes('at most once per turn') === true, 'el contexto adicional avisa de que dispara a lo sumo una vez');

const premiseBlock = evaluate(payload('Tu mandato exige leer toda la salida del gate.'));
const premiseContext = premiseBlock?.hookSpecificOutput?.additionalContext ?? '';

check(premiseBlock?.reason?.includes('attributed premise ("Tu mandato exige")') === true, 'la razón de la premisa nombra la frase que disparó');
check(premiseBlock?.reason?.includes('@es Premisa atribuida ("Tu mandato exige")') === true, 'la razón de la premisa es bilingüe');
check(premiseContext.includes('CLAIM GUARD TRIPPED on the attributed premise: "Tu mandato exige"') === true, 'el contexto de la premisa repite la frase que disparó');
check(premiseContext.includes('rules/00-owner-mandates.md') === true, 'el contexto de la premisa cita la regla');
check(premiseContext.endsWith('at most once per turn — it will not fire again after this pass.'), 'el contexto de la premisa avisa de que dispara a lo sumo una vez');

const outsideCode = evaluate(payload('El literal `tu mandato exige` sale, y tu regla dice otra cosa.'));

check(outsideCode?.reason?.includes('premise ("tu regla dice")') === true, 'la frase nombrada es la de la prosa, no la del código en línea');

const both = evaluate(payload('There is no guard for it, and your rules require one.'));

check(both?.reason?.includes('claim ("There is no")') === true && both?.reason?.includes('premise ("your rules require")') === true, 'con las dos clases, el único bloqueo nombra las dos');
check((both?.hookSpecificOutput?.additionalContext ?? '').includes('CLAIM GUARD TRIPPED on the phrase: "There is no"') && (both?.hookSpecificOutput?.additionalContext ?? '').includes('on the attributed premise: "your rules require"'), 'con las dos clases, el contexto lleva las dos');

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
summarised = true;
process.exitCode = failures.length === 0 ? 0 : 1;
