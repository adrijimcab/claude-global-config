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
  // «corrección» como sustantivo (exactitud, o arreglo pedido): 30 descartes reales de `dismissals.jsonl`
  // (24 con «corrección» y 6 con «correccion»); estas son frases literales de esos turnos.
  ['«corrección y seguridad», primer criterio del desempate (descarte 2026-10-12T13:36)', 'El orden de desempate es corrección y seguridad, después los gates, después performance y después simplicidad.'],
  ['«corrección y seguridad» al confirmar dónde vive el estándar (descarte 2026-10-12T16:30)', 'Tiene justo lo que listás: corrección y seguridad, quality gates, performance, KISS y YAGNI, SOLID y clean code.'],
  ['«corrección y seguridad» entre paréntesis (descarte 2026-10-11)', 'El archivo reúne el desempate (corrección y seguridad, después gates, rendimiento y simplicidad), KISS, YAGNI.'],
  ['«corrección» como el arreglo de un worker (descarte 2026-10-01)', 'ad10741c ya había retomado solo su corrección del mutante #4.'],
  ['«corrección» como el arreglo de texto del contrato (descarte 2026-10-01)', 'Le pasé a a8a1cf09 la corrección del scratch en el contrato, junto con la de los gates.'],
  ['«corrección de raíz» (descarte 2026-10-11)', 'Va a hacer también la corrección de raíz: cada gate declara qué rutas lee.'],
  ['«pendiente de corrección:» como etiqueta de estado (descarte 2026-10-04)', '**Pendiente de corrección:** con tu decisión de incluir el `.claude` de b100, el agente está pasando sus ítems.'],
  ['«tu corrección:» repetida a un worker (descarte 2026-09-22)', 'Le repetí tu corrección: cada servidor con su propio comando, preparando lo suyo antes de levantar.'],
  ['«correcciones» pedidas a un worker (descarte 2026-09-30)', 'El módulo compartido de mensajes bilingües: aplicando las tres correcciones que le pedí.'],
  ['«correccion» sin tilde, como arreglo', 'Refiere a la correccion que le pedi al worker sobre el label de la tabla.'],
];
for (const [name, sentence] of NOW_PASS) check(`pasa: ${name}`, findMarker(sentence), undefined);

// --- Capturas reales: siguen disparando (el marcador que las detecta sigue en la lista) ------------
const STILL_TRIP = [
  ['una corrección verdadera', 'me equivoqué: X era falso, lo medí de nuevo y el conteo real es 12.', 'me equivoqué'],
  ['«rancio», único detector de una captura (2026-09-03)', 'API sin documentar **243 → 3** (el 392 estaba rancio; 33 símbolos producían 91 marcadores).', 'rancio'],
  ['«nunca corrió», único detector de una captura (2026-09-28)', 'el agente visual nunca corrió ese gate, porque yo lo había postergado mientras el puerto estaba ocupado.', 'nunca corrió'],
  ['la captura de «stale» sigue detectada por «no midió» (2026-09-21)', '**5. `check:a11y` — no midió nada.** Port 6006 is already in use — a stale server is running.', 'no midió'],
  ['«refuta»', 'El agente refuta la premisa de mi brief con la lectura del archivo.', 'refuta'],
  // Autocorrecciones reales del orquestador (transcripts: los turnos que acabaron en una captura):
  ['«corrección mía»', 'Corrección mía: le había dicho al agente que sus ficheros estaban en el `.claude/` del checkout principal.', 'corrección mía'],
  ['«de mi parte», en plural', 'Dos correcciones de mi parte al hacer el censo de worktrees: los tres locks nombran el mismo pid.', 'correcciones de mi parte'],
  ['«corrección a» un dato propio', 'Y una corrección a un dato que yo llevo repitiendo todo el día: M8 no son cuatro actualizaciones.', 'corrección a '],
  ['«corrección a» algo dicho', 'Y una corrección a algo que te dije dos veces. El agente de #114 midió la premisa.', 'corrección a '],
  ['«corrección a» la premisa del dueño', 'Primero, una corrección a tu premisa que cambia el conteo: no hay ningún commit el 31/08.', 'corrección a '],
  ['«correcciones a» lo que me contó el dueño', 'Correcciones a lo que me contaste (lo comprobé contra los repos): la versión con la lib como dependencia no existe.', 'correcciones a '],
  ['«corrección de mi parte», en singular', 'Una corrección de mi parte: el diseño del marco seguía mostrando como abiertas dos preguntas que la PD-41 ya resolvió.', 'corrección de mi parte'],
  ['«corrección al» conteo', 'Corrección al conteo, y tenés razón a medias los dos: reanudé 5.', 'corrección al '],
  ['«correcciones al» backlog', 'Correcciones al backlog que salen de medir: la mutación está peor contada de lo que te dije.', 'correcciones al '],
  ['«te debo una corrección»', 'Te debo una corrección. El retrabajo que te planteé era más chico de lo que dije.', 'te debo una corrección'],
  ['«la corrección:» como encabezado', 'Primero la corrección: la delegación de a11y llevaba parada desde que arreglé el guard.', 'la corrección:'],
  ['«te dije mal»', 'Corrijo algo que te dije mal: no es una sola causa. Conté los mensajes de axe de la suite ya terminada.', 'te dije mal'],
  ['«correccion a» sin tilde', 'Una correccion a mi brief: el script no publica en npm.', 'correccion a '],
];
for (const [name, sentence, marker] of STILL_TRIP) check(`dispara: ${name}`, findMarker(sentence), marker);

// --- La poda no deja los literales en la lista -------------------------------------------------
for (const removed of ['no lo verifiqué', 'no lo verifique', 'sin verificar', 'never ran', 'stale', 'corrección', 'correccion', 'corrección:']) {
  check(`podado: «${removed}» ya no está`, CORRECTION_MARKERS.includes(removed), false);
}

// --- Cada marcador de «corrección» con tilde tiene su gemelo sin tilde (el mensaje puede llegar aplanado) -----
for (const marker of CORRECTION_MARKERS.filter((m) => m.includes('corrección'))) {
  const flat = marker.split('corrección').join('correccion').split('mía').join('mia');
  check(`gemelo sin tilde de «${marker}»`, CORRECTION_MARKERS.includes(flat), true);
}

// --- Entradas degeneradas ----------------------------------------------------------------------
check('mensaje vacío', findMarker(''), undefined);
check('mensaje que no es texto', findMarker(undefined), undefined);

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
process.exitCode = failures.length === 0 ? 0 : 1;
