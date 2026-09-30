#!/usr/bin/env node
/**
 * Selftest de `markers.mjs`. Las frases son REALES: salen de los mensajes que dispararon el guard y
 * de lo que siguió a cada disparo, leído de los transcripts el 2026-09-29.
 *   - Las que acabaron en descarte, por un marcador podado, ahora tienen que pasar.
 *   - Las que acabaron en una lección capturada tienen que seguir disparando.
 */

import { CORRECTION_MARKERS, findMarker } from './markers.mjs';

let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  if (actual === expected) passed++;
  else failures.push(`${name} — esperado ${String(expected)}, obtenido ${String(actual)}`);
};

// --- Descartadas por un marcador podado: ya no disparan -----------------------------------------
const NOW_PASS = [
  ['«no lo verifiqué» como marca honesta (descarte 2026-09-29T01:06)', 'Lo integrado hoy es ng-add, lint y CI, que no tocan componentes. Por eso **no espero** que se muevan baselines, pero no lo verifiqué.'],
  ['«no lo verifiqué» atribuyendo un hallazgo ajeno (descarte 2026-09-28T10:40)', '**Una cosa que apareció y hay que tener en cuenta** (lo encontró el agente, yo no lo verifiqué): con TS 6 hay otros errores.'],
  ['«sin verificar» etiquetando una causa probable (descarte 2026-09-14)', '**Causa probable, sin verificar:** tú corriste los tests desde PowerShell, y ahí `sh` no está en el PATH.'],
  ['«never ran» sobre un hook que rechazó el comando (descarte 2026-09-28)', 'The command never ran. A `PreToolUse` hook (the exit-code guard) blocked it before it executed.'],
  ['«stale» como subcadena de «instale» (descarte 2026-09-13)', 'La principal es que la versión mínima de Angular se instale con el CLI fijado a la misma versión que el core.'],
  ['«stale» citando lo que vio el dueño (descarte 2026-09-28)', '**1. «Stopping stale waiter shells».** Es el agente de coverage limpiando procesos suyos que quedaron colgados.'],
];
for (const [name, sentence] of NOW_PASS) check(`pasa: ${name}`, findMarker(sentence), undefined);

// --- Capturas reales: siguen disparando (el marcador que las detecta sigue en la lista) ------------
const STILL_TRIP = [
  ['una corrección verdadera', 'me equivoqué: X era falso, lo medí de nuevo y el conteo real es 12.', 'me equivoqué'],
  ['«rancio», único detector de una captura (2026-09-03)', 'API sin documentar **243 → 3** (el 392 estaba rancio; 33 símbolos producían 91 marcadores).', 'rancio'],
  ['«nunca corrió», único detector de una captura (2026-09-28)', 'el agente visual nunca corrió ese gate, porque yo lo había postergado mientras el puerto estaba ocupado.', 'nunca corrió'],
  ['la captura de «stale» sigue detectada por «no midió» (2026-09-21)', '**5. `check:a11y` — no midió nada.** Port 6006 is already in use — a stale server is running.', 'no midió'],
  ['«refuta»', 'El agente refuta la premisa de mi brief con la lectura del archivo.', 'refuta'],
  ['«corrección»', 'Corrección: el gate que cité no es el que corre en CI.', 'corrección'],
];
for (const [name, sentence, marker] of STILL_TRIP) check(`dispara: ${name}`, findMarker(sentence), marker);

// --- La poda no deja los literales en la lista -------------------------------------------------
for (const removed of ['no lo verifiqué', 'no lo verifique', 'sin verificar', 'never ran', 'stale']) {
  check(`podado: «${removed}» ya no está`, CORRECTION_MARKERS.includes(removed), false);
}

// --- Entradas degeneradas ----------------------------------------------------------------------
check('mensaje vacío', findMarker(''), undefined);
check('mensaje que no es texto', findMarker(undefined), undefined);

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
process.exitCode = failures.length === 0 ? 0 : 1;
