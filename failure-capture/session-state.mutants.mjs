#!/usr/bin/env node
/**
 * The decisions that keep one session's state its own — the file name of a session id, the per-session stamp and
 * cooldown paths, and the read that falls back when a session has no file yet — each broken once, that
 * `session-state.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones que mantienen el estado de una sesión como propio —el nombre de fichero de un id de sesión,
 * las rutas de sello y cooldown por sesión y la lectura que cae al valor por omisión cuando una sesión aún no
 * tiene fichero— rotas una a una; las debe cazar `session-state.selftest.mjs`. El runner y sus reglas viven en
 * `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const STATE = 'failure-capture/session-state.mjs';

const MUTANTS = [
  ['an id is used as the file name as it is, so a separator reaches the path', STATE, "encodeURIComponent(String(id)).split('.').join('%2E')", 'String(id)'],
  ['dots are not spelled out, so ".." names the parent directory', STATE, ".split('.').join('%2E')", ''],
  ['an id too long for a name is used as it is', STATE, 'spelled.length <= LONGEST_NAME ? spelled : createHash', 'true ? spelled : createHash'],
  ['every long id hashes to the same name', STATE, ".update(String(id))", ".update('')"],
  ['every session shares one stamp file', STATE, '`${fileNameOf(session)}.json`', "'stamp.json'"],
  ['every session shares one cooldown file', STATE, '`${fileNameOf(scopeKey)}.json`', "'cooldown.json'"],
  ['a session with no file yet is an error instead of the fallback', STATE, '  } catch {\n    return fallback;', '  } catch (error) {\n    throw error;'],
  ['a written file is left under its temporary name', STATE, 'renameSync(temporary, file);', 'void temporary;'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state', 'config-sync-guard'],
  selftest: 'failure-capture/session-state.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
