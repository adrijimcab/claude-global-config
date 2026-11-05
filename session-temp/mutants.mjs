#!/usr/bin/env node
/**
 * The decisions of session-temp, each broken once, that `selftest.mjs` must catch. A survivor is a missing
 * assertion, never a mutant to soften.
 * @es Las decisiones de session-temp, rotas una a una, que `selftest.mjs` debe cazar. Un superviviente es una
 * aserción que falta, nunca un mutante que ablandar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const M = 'session-temp/session-temp.mjs';
const S = 'session-temp/start.mjs';
const E = 'session-temp/end.mjs';

const MUTANTS = [
  // Which session ids and roots are safe. @es Qué ids de sesión y raíces son seguros.
  ['a session id may hold any character', M, "const SESSION_ID = /^[A-Za-z0-9-]+$/;", 'const SESSION_ID = /^.+$/;'],
  ['a non-string session id is accepted', M, "if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return undefined;", 'if (!SESSION_ID.test(sessionId)) return undefined;'],
  ['a root with a tilde is accepted', M, "if (root.includes('~') || root.includes(\"'\")) return undefined;", "if (root.includes(\"'\")) return undefined;"],
  ['the folder is not under the session-tmp tree', M, 'return `${root}/claude/session-tmp/${sessionId}`;', 'return `${root}/claude/${sessionId}`;'],
  ['the root keeps its short 8.3 form', M, 'return realpathSync.native(tmpdir()).split', 'return tmpdir().split'],
  // What the env file receives. @es Qué recibe el fichero de entorno.
  ['TMPDIR is not set', M, "const VARIABLES = ['TEMP', 'TMP', 'TMPDIR'];", "const VARIABLES = ['TEMP', 'TMP'];"],
  ['the value is not quoted', M, "`export ${name}='${folder}'\\n`", '`export ${name}=${folder}\\n`'],
  // SessionStart. @es SessionStart.
  ['a missing env file is not checked', M, "if (typeof envFile !== 'string' || envFile.length === 0) return undefined;", ''],
  ['a refused session id still writes', M, '  const folder = sessionTempOf(payload?.session_id, root);\n\n  if (folder === undefined) return undefined;\n\n  mkdirSync', '  const folder = sessionTempOf(payload?.session_id, root) ?? `${root}/claude/session-tmp/x`;\n\n  mkdirSync'],
  ['the folder is not made', M, '  mkdirSync(folder, { recursive: true });\n  appendFileSync', '  appendFileSync'],
  ['the env file is overwritten instead of appended to', M, 'appendFileSync(envFile, envLinesFor(folder));', "appendFileSync(envFile, envLinesFor(folder), { flag: 'w' });"],
  ['start reports nothing', M, '  appendFileSync(envFile, envLinesFor(folder));\n\n  return folder;', '  appendFileSync(envFile, envLinesFor(folder));\n\n  return undefined;'],
  // SessionEnd. @es SessionEnd.
  ['the Windows removal follows links', M, "spawnSync('cmd', ['/d', '/c', 'rmdir', '/S', '/Q', folder.split('/').join('\\\\')], { windowsHide: true });\n    return;", 'rmSync(folder, { recursive: true, force: true });\n    return;'],
  ['the folder is never removed', M, '  removeWithoutFollowing(folder);\n\n  return', '  return'],
  ['end of a missing folder reports a removal', M, 'if (folder === undefined || !existsSync(folder)) return false;', 'if (folder === undefined) return false;'],
  // The entry points. @es Los puntos de entrada.
  ['start reads no env file', S, 'envFile: process.env.CLAUDE_ENV_FILE', 'envFile: undefined'],
  ['start ignores the payload', S, 'payload: tryParsePayload(raw)', 'payload: {}'],
  ['end ignores the payload', E, 'endSession({ payload: tryParsePayload(raw) });', 'endSession({ payload: {} });'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['session-temp', 'hook-io'],
  selftest: 'session-temp/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
