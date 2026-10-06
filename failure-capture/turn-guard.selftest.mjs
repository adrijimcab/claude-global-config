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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CLAUDE_HOME_VARIABLE, STATE_ROOT_VARIABLE, isolateState } from '../hook-state/locations.mjs';
import { provisionLoop } from './fixture-loop.mjs';

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
  provisionLoop(dir, (file) => ['turn-guard.mjs', 'markers.mjs', 'project.mjs'].includes(file));
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
  await both('stop_hook_active', payload(MARKED, { stop_hook_active: true }), false);
  await both('dentro del cooldown', payload(MARKED), false, (dir) => {
    mkdirSync(path.join(dir, 'state'), { recursive: true });
    writeFileSync(path.join(dir, 'state', 'guard-state.json'), JSON.stringify({ 'sesion-a|orchestrator': { blockedAt: Date.now(), seenAt: Date.now() } }));
  });
  await both('captura ya sellada para la sesión', payload(MARKED), false, (dir) => {
    mkdirSync(path.join(dir, 'state'), { recursive: true });
    writeFileSync(path.join(dir, 'state', 'last-capture.json'), JSON.stringify({ session: 'sesion-a', kind: 'capture', at: Date.now() }));
  });
  await both('sellada para OTRA sesión no cuenta', payload(MARKED), true, (dir) => {
    mkdirSync(path.join(dir, 'state'), { recursive: true });
    writeFileSync(path.join(dir, 'state', 'last-capture.json'), JSON.stringify({ session: 'otra', kind: 'capture', at: Date.now() }));
  });

  const garbage = world('ilegible');
  const result = standalone(garbage, '{ no es json');
  check('payload ilegible: deja pasar, exit 0', !result.blocked && result.status === 0);
  const errors = path.join(garbage, 'state', 'guard-errors.jsonl');
  check('payload ilegible: queda anotado, nunca calla', existsSync(errors) && readFileSync(errors, 'utf8').includes('rawLength'));

  const loop = world('segunda-vez');
  standalone(loop, payload(MARKED));
  check('el segundo fin de turno de la misma sesión, dentro del cooldown, deja pasar', !standalone(loop, payload(MARKED)).blocked);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
process.exitCode = failures.length === 0 ? 0 : 1;
