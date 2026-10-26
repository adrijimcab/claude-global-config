#!/usr/bin/env node
/**
 * SessionStart hook: injects ONE line of context naming what the project is (framework and version, TypeScript,
 * test runners, ESLint, builder, change detection, package manager) and where the version-correct rules, docs
 * and gates are, so every session works from the project's REAL version instead of the newest one the model
 * remembers. Silent outside a JS/TS project. File reads only, no process spawned.
 *
 * The directory comes from the payload's `cwd`, then `CLAUDE_PROJECT_DIR`, then the process directory. It
 * ALWAYS exits 0, including on its own malfunction: it is advisory and must never block a session start. Its
 * siblings are imported inside the `try`, so even a missing or broken module lands in the catch, and the
 * malfunction is reported in one line, because a profile that could not be measured must not look like "not a
 * JS/TS project". Registered in `~/.claude/settings.json` (`session-start.mjs.hook-registration.json`).
 *
 * @es Hook SessionStart: inyecta UNA línea de contexto con qué es el proyecto y dónde están las reglas, la
 * documentación y los gates de su versión, para que cada sesión trabaje con la versión REAL del proyecto y no
 * con la más nueva que recuerde el modelo. Callado fuera de un proyecto JS/TS. Solo lecturas de ficheros. El
 * directorio sale del `cwd` del payload, luego de `CLAUDE_PROJECT_DIR`, luego del proceso. SIEMPRE sale con 0,
 * también ante su propia avería: los módulos hermanos se importan dentro del `try`, y la avería se informa en
 * una línea, porque un perfil que no se pudo medir no debe parecer «no es un proyecto JS/TS».
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

import { context, hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';

/** The directory a session starts in: payload `cwd`, then `CLAUDE_PROJECT_DIR`, then `fallback`. @es El directorio de inicio de la sesión. */
export function sessionDirectory(payload, env, fallback) {
  if (typeof payload?.cwd === 'string' && payload.cwd !== '') return payload.cwd;

  return typeof env.CLAUDE_PROJECT_DIR === 'string' && env.CLAUDE_PROJECT_DIR !== '' ? env.CLAUDE_PROJECT_DIR : fallback;
}

/**
 * The hook output for a raw payload: the SessionStart JSON, or `undefined` when there is nothing to say.
 * @es La salida del hook para un payload crudo, o `undefined` si no hay nada que decir.
 */
export async function sessionStartOutput(raw, { env = process.env, cwd = process.cwd(), home = homedir(), today } = {}) {
  let line;

  try {
    const { readProfile } = await import('./profile.mjs');
    const { profileLine } = await import('./summary-line.mjs');
    const profile = readProfile(sessionDirectory(tryParsePayload(raw), env, cwd), { home });

    if (profile === undefined) return undefined;

    line = profileLine(profile, { home, today });
  } catch (error) {
    line = `Project profile could not be measured (${error instanceof Error ? error.message : String(error)}); versions are UNVERIFIED: run node ~/.claude/project-profile/profile.mjs. @es No se pudo medir el perfil del proyecto; las versiones están SIN VERIFICAR: ejecutar node ~/.claude/project-profile/profile.mjs.`;
  }

  return context('SessionStart', line);
}

/**
 * Stdin as text. Unlike the other hooks, an unreadable stdin is an EMPTY payload, not silence: the profile is
 * still measured from `CLAUDE_PROJECT_DIR` or the process directory, because a session that starts without a
 * readable payload must not lose its version line. This is deliberate, so it is passed to `hookMain` as its seam.
 * @es Stdin como texto. A diferencia de los otros hooks, un stdin ilegible es un payload VACÍO, no silencio: el
 * perfil se mide igual desde `CLAUDE_PROJECT_DIR` o el directorio del proceso, porque una sesión que arranca sin
 * un payload legible no debe perder su línea de versiones. Es deliberado, por eso se pasa a `hookMain` como costura.
 */
function readInput() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

runWhenMain(import.meta.url, hookMain(sessionStartOutput, readInput));
