#!/usr/bin/env node
/**
 * Hook `Stop` — guard de idioma del dueño. Envoltorio fino: stdin → `evaluate()` → stdout.
 *
 * Por qué existe: el 2026-09-28 el orquestador le respondió al dueño EN INGLÉS al menos tres veces,
 * con la regla vinculante ya escrita (memory/feedback-all-replies-in-spanish-gentleman.md, engram
 * #923). El disparador fue siempre el mismo: llegaba una notificación o un reporte de subagente en
 * inglés y la respuesta seguía el idioma de la entrada en vez de la regla. Una regla que hay que
 * «recordar» ya falló; esto la vuelve un mecanismo. Orden del dueño bajo la regla de parar la línea.
 *
 * Contrato con el harness: salida 0 + `{"decision":"block","reason":…}` bloquea el fin del turno y el
 * `reason` le llega al modelo; cualquier otra salida lo deja terminar. Dispara como mucho UNA vez por
 * turno: con `stop_hook_active` en true deja pasar.
 *
 * FALLA ABIERTO: cualquier error propio sale con 0 y deja una línea en `state/guard.log`. Un guard
 * capaz de trabar una sesión es un riesgo mayor que el que cierra.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { evaluate as judgeTurn } from './evaluate.mjs';

const STATE_DIR = path.join(import.meta.dirname, 'state');

function appendState(file, line) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(path.join(STATE_DIR, file), `${line}\n`, 'utf8');
  } catch {
    // Registrar es una ayuda, nunca una precondición: si falla, el guard igual decide.
  }
}

const log = (message) => appendState('guard.log', `${new Date().toISOString()} ${message}`);

/**
 * La salida de hook para un payload crudo, o `undefined` si el turno puede terminar. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso. Falla abierto y lo registra.
 */
export function evaluate(raw) {
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch (error) {
    log(`payload ilegible, se deja pasar: ${error?.message ?? error}`);
    return undefined;
  }

  try {
    const { verdict, problems } = judgeTurn(payload);

    for (const problem of problems) log(`sesión ${payload?.session_id ?? '?'}: ${problem}`);

    if (!verdict.block) return undefined;

    appendState(
      'refusals.jsonl',
      JSON.stringify({ at: new Date().toISOString(), session: payload.session_id, findings: verdict.findings })
    );

    return { decision: 'block', reason: verdict.reason };
  } catch (error) {
    log(`fallo interno, se deja pasar: ${error?.stack ?? error}`);
    return undefined;
  }
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch (error) {
    log(`stdin ilegible, se deja pasar: ${error?.message ?? error}`);
    return;
  }

  const output = evaluate(raw);

  if (output !== undefined) process.stdout.write(JSON.stringify(output));
}

// Dentro del dispatcher, stdin ya lo leyó él: leerlo acá consumiría su entrada.
if (globalThis[Symbol.for('hook-dispatch.in-process')] !== true) {
  main();
  process.exitCode = 0;
}
