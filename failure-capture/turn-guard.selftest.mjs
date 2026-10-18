#!/usr/bin/env node
/**
 * Selftest de `turn-guard.mjs`, que hasta el 2026-09-29 no tenía ninguno (`guard-that-cannot-go-red`).
 * Corre una COPIA de la guardia en un directorio temporal, así el estado vivo (`state/`) no se toca, y
 * exige el mismo veredicto por los dos caminos: como proceso propio y dentro del dispatcher (`evaluate`).
 * Cada copia vive en su propio home de Claude construido (`<mundo>/failure-capture/`, con el módulo de
 * ubicaciones al lado) y resuelve su estado por `HOOK_CLAUDE_HOME`, así que su `state/` es el de la copia.
 *
 *   bloquea : marcador de corrección sin nada registrado; también con BOM de PowerShell.
 *   deja    : sin marcador, mensaje vacío, `stop_hook_active`, dentro del cooldown, con una captura ya
 *             sellada para la sesión, y payload ilegible (que además queda anotado en guard-errors).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CLAUDE_HOME_VARIABLE, STATE_ROOT_VARIABLE, isolateState } from '../hook-state/locations.mjs';
import { provisionLoop } from './fixture-loop.mjs';
import { cooldownFile, stampFile, writeJson } from './session-state.mjs';

isolateState('turn-guard');

const scratch = mkdtempSync(path.join(os.tmpdir(), 'turn-guard-selftest-'));
let passed = 0;
const failures = [];

const check = (name, condition, detail = '') => {
  if (condition) passed++;
  else failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`);
};

/** Una copia nueva de la guardia, en su propio home de Claude, con su propio `state/`. */
function world(name) {
  const dir = path.join(scratch, name, 'failure-capture');
  provisionLoop(dir, (file) => ['turn-guard.mjs', 'markers.mjs', 'project.mjs', 'project-areas.mjs', 'ledger-line.mjs', 'session-state.mjs'].includes(file));
  return dir;
}

/** El entorno de la copia `dir`: su home de Claude, sin raíz de estado. */
const homeOf = (dir) => ({ [CLAUDE_HOME_VARIABLE]: path.dirname(dir), [STATE_ROOT_VARIABLE]: '' });

const payload = (message, extra = {}) => JSON.stringify({ hook_event_name: 'Stop', session_id: 'sesion-a', stop_hook_active: false, last_assistant_message: message, ...extra });
const MARKED = 'Me equivoqué: el número era falso.';

function standalone(dir, raw) {
  const run = spawnSync(process.execPath, [path.join(dir, 'turn-guard.mjs')], { input: raw, encoding: 'utf8', env: { ...process.env, ...homeOf(dir) } });
  const text = run.stdout.trim();
  return { status: run.status, blocked: text !== '' && JSON.parse(text).decision === 'block' };
}


async function inProcess(dir, raw) {
  const { evaluate } = await import(`${pathToFileURL(path.join(dir, 'turn-guard.mjs')).href}?${Date.now()}-${Math.random()}`);
  const saved = { ...process.env };
  Object.assign(process.env, homeOf(dir));
  try {
    return evaluate(raw)?.decision === 'block';
  } finally {
    for (const key of [CLAUDE_HOME_VARIABLE, STATE_ROOT_VARIABLE]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

try {
  // Cada caso corre por los dos caminos en DOS copias separadas: el estado que deja uno no decide el otro.
  const both = async (name, raw, expected, prepare = () => {}) => {
    const alone = world(`${name}-proceso`);
    const inside = world(`${name}-dispatcher`);
    prepare(alone);
    prepare(inside);
    const byProcess = standalone(alone, raw);
    const byDispatcher = await inProcess(inside, raw);
    check(`${name}: proceso propio ${expected ? 'bloquea' : 'deja pasar'}`, byProcess.blocked === expected && byProcess.status === 0, JSON.stringify(byProcess));
    check(`${name}: dentro del dispatcher, igual`, byDispatcher === expected);
  };

  await both('marcador sin registro', payload(MARKED), true);
  await both('marcador con BOM', `﻿${payload(MARKED)}`, true);
  await both('sin marcador', payload('Listo, corrí los tests y pasaron.'), false);
  await both('mensaje vacío', payload('   '), false);
  // «corrección» como sustantivo no frena el turno (falsos positivos reales del 2026-10-12); la autocorrección sí.
  await both('«corrección y seguridad» deja pasar', payload('El orden de desempate es corrección y seguridad, después los gates, después performance y después simplicidad.'), false);
  await both('«corrección» como arreglo pedido deja pasar', payload('Le pasé a a8a1cf09 la corrección del scratch en el contrato.'), false);
  await both('«corrección mía» bloquea', payload('Corrección mía: le había dicho al agente que sus ficheros estaban en el checkout principal.'), true);
  await both('stop_hook_active', payload(MARKED, { stop_hook_active: true }), false);
  await both('dentro del cooldown', payload(MARKED), false, (dir) => {
    writeJson(cooldownFile(path.join(dir, 'state'), 'sesion-a|orchestrator'), { blockedAt: Date.now(), seenAt: Date.now() });
  });
  await both('captura ya sellada para la sesión', payload(MARKED), false, (dir) => {
    writeJson(stampFile(path.join(dir, 'state'), 'sesion-a'), { session: 'sesion-a', kind: 'capture', at: Date.now() });
  });
  await both('sellada para OTRA sesión no cuenta', payload(MARKED), true, (dir) => {
    writeJson(stampFile(path.join(dir, 'state'), 'otra'), { session: 'otra', kind: 'capture', at: Date.now() });
  });

  const garbage = world('ilegible');
  const result = standalone(garbage, '{ no es json');
  check('payload ilegible: deja pasar, exit 0', !result.blocked && result.status === 0);
  const errors = path.join(garbage, 'state', 'guard-errors.jsonl');
  check('payload ilegible: queda anotado, nunca calla', existsSync(errors) && readFileSync(errors, 'utf8').includes('rawLength'));

  // The suggested capture command must be one the main session may run: cwd-change-guard refuses a bare `cd`, so
  // the hint runs it in a subshell. @es La orden sugerida debe poder correrse en la sesión principal: va en un subshell.
  const hinted = world('orden-sugerida');
  const hintRun = spawnSync(process.execPath, [path.join(hinted, 'turn-guard.mjs')], { input: payload(MARKED), encoding: 'utf8', env: { ...process.env, ...homeOf(hinted) } });
  const hint = JSON.stringify(JSON.parse(hintRun.stdout.trim() || '{}')).split('\\n').join('\n').split('\\"').join('"');
  check('la orden de captura sugerida va en un subshell, nunca con un cd suelto', hint.includes('( cd "') && hint.includes('RULE to not repeat." )') && !/^\s*cd "/m.test(hint), hint.slice(0, 300));

  const loop = world('segunda-vez');
  standalone(loop, payload(MARKED));
  check('el segundo fin de turno de la misma sesión, dentro del cooldown, deja pasar', !standalone(loop, payload(MARKED)).blocked);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
process.exitCode = failures.length === 0 ? 0 : 1;
