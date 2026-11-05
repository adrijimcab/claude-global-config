#!/usr/bin/env node
/**
 * Selftest of session-temp: each session gets its own TEMP through CLAUDE_ENV_FILE, written as plain assignments
 * on a long path (no 8.3 tilde), and its folder is removed at the end without following a link.
 * @es Selftest de session-temp: cada sesión recibe su propio TEMP por CLAUDE_ENV_FILE, escrito como asignaciones
 * simples sobre una ruta larga (sin la tilde 8.3), y su carpeta se borra al final sin seguir un enlace.
 */

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { endSession, envLinesFor, realTempRoot, sessionTempOf, startSession } from './session-temp.mjs';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${label}${detail === '' ? '' : `: ${detail}`}`);
  }
}

/** A call whose throw becomes a value, so a broken decision fails a check instead of crashing the proof. @es Una llamada cuyo throw se vuelve un valor. */
const safely = (call) => {
  try {
    return call();
  } catch (error) {
    return `threw: ${error.message}`;
  }
};

const scratch = mkdtempSync(path.join(tmpdir(), 'session-temp-selftest-'));
// The long form, as the hook uses: the short form of the temp root carries a tilde the module refuses.
// @es La forma larga, como la usa el hook: la forma corta de la raíz temporal lleva una tilde que el módulo rechaza.
const root = path.join(realpathSync.native(scratch), 'root').split('\\').join('/');
mkdirSync(root, { recursive: true });
const SESSION = '5f411d3c-9331-4b00-8d07-466c793d523f';

try {
  // Where a session's temp lives. @es Dónde vive el temporal de una sesión.
  const folder = sessionTempOf(SESSION, root);
  check('the folder sits under <root>/claude/session-tmp/<session id>', folder === `${root}/claude/session-tmp/${SESSION}`, folder);
  check('a session id with a path separator is refused', sessionTempOf('../x', root) === undefined);
  check('a session id with a quote is refused', sessionTempOf("a'b", root) === undefined);
  check('an empty session id is refused', sessionTempOf('', root) === undefined);
  check('a non-string session id is refused', sessionTempOf(5, root) === undefined);
  check('a folder spelled with a tilde is refused (the harness refuses it in an assignment)', sessionTempOf(SESSION, 'C:/Users/ADRIAN~1.JIM/Temp') === undefined);

  // What the env file receives. @es Qué recibe el fichero de entorno.
  const lines = envLinesFor('C:/x/y');
  check('the three variables are exported, single-quoted, one per line', lines === "export TEMP='C:/x/y'\nexport TMP='C:/x/y'\nexport TMPDIR='C:/x/y'\n", JSON.stringify(lines));

  // SessionStart. @es SessionStart.
  const envFile = path.join(scratch, 'env.sh');
  writeFileSync(envFile, '# written by another hook\n');
  const started = safely(() => startSession({ payload: { session_id: SESSION }, envFile, root }));
  check('start creates the folder', existsSync(folder));
  check('start appends the assignments after what other hooks wrote', readFileSync(envFile, 'utf8') === `# written by another hook\n${envLinesFor(folder)}`, readFileSync(envFile, 'utf8'));
  check('start returns the folder it set', started === folder);

  const noEnvFile = safely(() => startSession({ payload: { session_id: 'b1b1b1b1-0000-0000-0000-000000000000' }, envFile: undefined, root }));
  check('without CLAUDE_ENV_FILE nothing is set and no folder is made', noEnvFile === undefined && !existsSync(`${root}/claude/session-tmp/b1b1b1b1-0000-0000-0000-000000000000`));

  const badId = startSession({ payload: { session_id: '../escape' }, envFile, root });
  check('a refused session id writes nothing', badId === undefined && readFileSync(envFile, 'utf8') === `# written by another hook\n${envLinesFor(folder)}`);
  check('a payload with no session id writes nothing', startSession({ payload: {}, envFile, root }) === undefined);

  // SessionEnd. @es SessionEnd.
  const outside = path.join(scratch, 'outside');
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'keep.txt'), 'x');
  mkdirSync(folder, { recursive: true }); // the end cases need the folder even when a broken start did not make it
  writeFileSync(path.join(folder, 'left.txt'), 'x');
  const linked = path.join(folder, 'link');
  let linkMade = true;
  try {
    // A junction on Windows, a directory symlink elsewhere. @es Un junction en Windows, un symlink de directorio fuera.
    symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    linkMade = false;
  }

  const ended = endSession({ payload: { session_id: SESSION }, root });
  check('end removes the session folder', ended === true && !existsSync(folder));
  check('end never follows a link out of the folder', !linkMade || existsSync(path.join(outside, 'keep.txt')), `link made: ${linkMade}`);
  check('end of a session with no folder is a no-op', endSession({ payload: { session_id: SESSION }, root }) === false);
  check('end with a refused session id removes nothing', endSession({ payload: { session_id: '..' }, root }) === false && existsSync(outside));

  // The real entry points, as the harness runs them: payload on stdin, CLAUDE_ENV_FILE in the environment.
  // @es Los puntos de entrada reales, como los corre el harness: payload por stdin, CLAUDE_ENV_FILE en el entorno.
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const probeId = `selftest-${process.pid}-${Date.now()}`;
  const realFolder = sessionTempOf(probeId);
  const hookEnv = path.join(scratch, 'hook-env.sh');
  const runHook = (file, payload, env) => spawnSync(process.execPath, [path.join(HERE, file)], { input: payload, encoding: 'utf8', env: { ...process.env, ...env } });

  const start = runHook('start.mjs', JSON.stringify({ hook_event_name: 'SessionStart', session_id: probeId }), { CLAUDE_ENV_FILE: hookEnv });
  check('start.mjs exits 0 and prints nothing', start.status === 0 && start.stdout === '', `${start.status} ${start.stdout}${start.stderr}`);
  check('start.mjs writes the assignments of the long-path folder', existsSync(hookEnv) && readFileSync(hookEnv, 'utf8') === envLinesFor(realFolder) && !realFolder.includes('~'), existsSync(hookEnv) ? readFileSync(hookEnv, 'utf8') : 'no env file');
  check('start.mjs makes the folder', existsSync(realFolder));

  const garbage = runHook('start.mjs', 'not json', { CLAUDE_ENV_FILE: path.join(scratch, 'garbage-env.sh') });
  check('start.mjs on a malformed payload exits 0 and writes nothing', garbage.status === 0 && garbage.stdout === '' && !existsSync(path.join(scratch, 'garbage-env.sh')), `${garbage.status} ${garbage.stderr}`);

  const end = runHook('end.mjs', JSON.stringify({ hook_event_name: 'SessionEnd', session_id: probeId }), {});
  check('end.mjs exits 0, prints nothing and removes the folder', end.status === 0 && end.stdout === '' && !existsSync(realFolder), `${end.status} ${end.stderr}`);
} finally {
  // A link left by a failed end is unlinked first, so the recursive cleanup can never follow it.
  // @es Un enlace que dejó un end fallido se quita primero, para que la limpieza recursiva nunca lo siga.
  const leftLink = path.join(sessionTempOf(SESSION, root) ?? scratch, 'link');
  try {
    if (lstatSync(leftLink).isSymbolicLink()) unlinkSync(leftLink);
  } catch {
    // absent: nothing to unlink. @es ausente: nada que quitar.
  }
  rmSync(scratch, { recursive: true, force: true });

  // The entry-point cases leave <tmp>/claude/session-tmp empty; rmdir removes a folder only when it is empty, so it
  // can never touch a live <tmp>/claude of the harness. @es Los casos de entrada dejan <tmp>/claude/session-tmp
  // vacío; rmdir solo borra una carpeta vacía, así nunca toca un <tmp>/claude vivo del harness.
  for (const folder of [`${realTempRoot()}/claude/session-tmp`, `${realTempRoot()}/claude`]) {
    try {
      rmdirSync(folder);
    } catch {
      // not empty or absent: left as it is. @es no vacía o ausente: queda como está.
    }
  }
}

console.log(`session-temp selftest: ${passed}/${passed + failed} assertions passed @es aserciones superadas`);
process.exit(failed === 0 ? 0 : 1);
