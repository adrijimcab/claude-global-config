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

import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The directory a session starts in: payload `cwd`, then `CLAUDE_PROJECT_DIR`, then `fallback`. @es El directorio de inicio de la sesión. */
export function sessionDirectory(payload, env, fallback) {
  if (typeof payload?.cwd === 'string' && payload.cwd !== '') return payload.cwd;

  return typeof env.CLAUDE_PROJECT_DIR === 'string' && env.CLAUDE_PROJECT_DIR !== '' ? env.CLAUDE_PROJECT_DIR : fallback;
}

/** The parsed payload, or `undefined` when it is not JSON (a UTF-8 BOM is tolerated). @es El payload parseado, o `undefined`. */
export function payloadOf(raw) {
  try {
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }
}

/**
 * The hook output for a raw payload: the SessionStart JSON, or `undefined` when there is nothing to say.
 * @es La salida del hook para un payload crudo, o `undefined` si no hay nada que decir.
 */
export async function sessionStartOutput(raw, { env = process.env, cwd = process.cwd(), home = homedir(), today } = {}) {
  let context;

  try {
    const { readProfile } = await import('./profile.mjs');
    const { profileLine } = await import('./summary-line.mjs');
    const profile = readProfile(sessionDirectory(payloadOf(raw), env, cwd), { home });

    if (profile === undefined) return undefined;

    context = profileLine(profile, { home, today });
  } catch (error) {
    context = `Project profile could not be measured (${error instanceof Error ? error.message : String(error)}); versions are UNVERIFIED: run node ~/.claude/project-profile/profile.mjs. @es No se pudo medir el perfil del proyecto; las versiones están SIN VERIFICAR: ejecutar node ~/.claude/project-profile/profile.mjs.`;
  }

  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } };
}

/** Whether this module is the process entry point, through symlinks too. @es Si este módulo es el punto de entrada del proceso, también a través de enlaces. */
function isMain() {
  if (process.argv[1] === undefined) return false;

  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
  }
}

if (isMain()) {
  let raw = '';

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    raw = '';
  }

  const output = await sessionStartOutput(raw);

  if (output !== undefined) process.stdout.write(`${JSON.stringify(output)}\n`);

  process.exitCode = 0;
}
