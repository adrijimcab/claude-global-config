/**
 * Each Claude Code session gets its own TEMP. A SessionStart hook appends `export TEMP/TMP/TMPDIR` to the file
 * Claude Code names in `CLAUDE_ENV_FILE`, which every Bash command of the session runs first, its subagents' too
 * (measured 2026-11-05 with a live `claude -p` probe: the main session and a subagent both printed the private
 * folder from `os.tmpdir()`). The command itself is never rewritten, so permission rules still match it. A
 * SessionEnd hook removes the folder.
 *
 * WHY. `worker-temp-file-collided-across-sessions` reached 4x: a worker's script wrote a file into the shared TEMP
 * root at run time, which no static guard can see; the shared root is one folder for every live session.
 * REJECTED: rewriting each subagent command through PreToolUse `updatedInput`, measured on the same probe: the
 * permission rules are matched against the rewritten command, so every prefix allow rule stopped matching.
 * LIMITS, stated by the docs (code.claude.com/docs/en/hooks, "Persist environment variables"): PowerShell commands
 * on Windows do not receive a variable whose value holds `/` or `\`, so PowerShell keeps the shared root, and the
 * shared-temp-guard refusal stays as the second layer; the folder is per session, so the workers of one session
 * share it.
 * PATH. The long form of the temp root (`realpathSync.native`): its 8.3 short form carries a tilde
 * (`ADRIAN~1.JIM`), which the harness refuses inside a Bash assignment (measured on the probe).
 *
 * @es Cada sesión de Claude Code recibe su propio TEMP. Un hook SessionStart añade `export TEMP/TMP/TMPDIR` al
 * fichero que nombra `CLAUDE_ENV_FILE`, que cada comando Bash de la sesión ejecuta antes, también los de sus
 * subagentes (medido el 2026-11-05 con una sonda real de `claude -p`). El comando nunca se reescribe, así que las
 * reglas de permiso siguen coincidiendo. Un hook SessionEnd borra la carpeta. POR QUÉ: el incidente de temporales
 * compartidos llegó a 4 veces por una escritura en tiempo de ejecución que ningún guard estático ve. DESCARTADO:
 * reescribir el comando con `updatedInput`, porque las reglas de permiso se evalúan sobre el comando reescrito.
 * LÍMITES: PowerShell en Windows no recibe valores con `/` o `\`, así que el guard del temporal compartido sigue
 * como segunda capa; la carpeta es por sesión. RUTA: la forma larga, porque la corta lleva una tilde que el
 * harness rechaza en una asignación.
 */

import { appendFileSync, existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/** A session id as Claude Code writes it: letters, digits and dashes only. @es Un id de sesión: letras, dígitos y guiones. */
const SESSION_ID = /^[A-Za-z0-9-]+$/;
/** The variables every runtime reads for its temp folder. @es Las variables con que cada runtime busca su temporal. */
const VARIABLES = ['TEMP', 'TMP', 'TMPDIR'];

/** The long form of the OS temp root, `/`-separated. @es La forma larga de la raíz temporal, separada con `/`. */
export function realTempRoot() {
  return realpathSync.native(tmpdir()).split('\\').join('/');
}

/**
 * The private temp folder of a session, or `undefined` when the id or the root cannot be used safely.
 * @es La carpeta temporal privada de una sesión, o `undefined` si el id o la raíz no se pueden usar con seguridad.
 */
export function sessionTempOf(sessionId, root = realTempRoot()) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return undefined;
  if (root.includes('~') || root.includes("'")) return undefined;

  return `${root}/claude/session-tmp/${sessionId}`;
}

/** The lines appended to CLAUDE_ENV_FILE. @es Las líneas que se añaden a CLAUDE_ENV_FILE. */
export function envLinesFor(folder) {
  return VARIABLES.map((name) => `export ${name}='${folder}'\n`).join('');
}

/**
 * SessionStart: makes the folder and appends the assignments. Returns the folder, or `undefined` when nothing was
 * set (no env file, unusable session id).
 * @es SessionStart: crea la carpeta y añade las asignaciones. Devuelve la carpeta, o `undefined` si no hizo nada.
 */
export function startSession({ payload, envFile, root = realTempRoot() }) {
  if (typeof envFile !== 'string' || envFile.length === 0) return undefined;

  const folder = sessionTempOf(payload?.session_id, root);

  if (folder === undefined) return undefined;

  mkdirSync(folder, { recursive: true });
  appendFileSync(envFile, envLinesFor(folder));

  return folder;
}

/**
 * Removes a folder without following a link inside it. MEASURED 2026-11-05 on Node 22.22.3, Windows: `rmSync` with
 * `recursive` removes a junction as a link and leaves its target intact, so no platform branch is needed; the
 * selftest keeps a junction to an outside folder and asserts the outside file survives.
 * @es Borra una carpeta sin seguir un enlace de dentro. MEDIDO el 2026-11-05 en Node 22.22.3, Windows: `rmSync`
 * recursivo quita un junction como enlace y deja intacto su destino; el selftest lo comprueba.
 */
function removeWithoutFollowing(folder) {
  rmSync(folder, { recursive: true, force: true });
}

/**
 * SessionEnd: removes the session's folder. Returns `true` when a folder existed and is gone.
 * @es SessionEnd: borra la carpeta de la sesión. Devuelve `true` si existía y ya no está.
 */
export function endSession({ payload, root = realTempRoot() }) {
  const folder = sessionTempOf(payload?.session_id, root);

  if (folder === undefined || !existsSync(folder)) return false;

  removeWithoutFollowing(folder);

  return !existsSync(folder);
}
