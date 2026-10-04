#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/locations.mjs`: where a mechanism keeps its state. Every case runs
 * on a temp root and a constructed home, never the real one; the environment is restored at the end.
 *
 * THE STATE SPACE: `HOOK_STATE_DIR` unset / set / empty / set AFTER the module was imported (H1-d) / changed
 * between two calls, `HOOK_CLAUDE_HOME` unset / set / empty / changed between two calls, the home default
 * from a constructed home directory, a mechanism name that is a path rather than a name.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `locations.mjs`: dónde guarda su estado un mecanismo. Cada caso corre en
 * una raíz temporal y un home construido, nunca el real; el entorno se restaura al final. Espacio de
 * estados: `HOOK_STATE_DIR` sin fijar / fijada / vacía / fijada DESPUÉS de importar el módulo / cambiada
 * entre dos llamadas, ídem `HOOK_CLAUDE_HOME`, el home por defecto desde un directorio construido, y un
 * nombre de mecanismo que es una ruta.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Imported BEFORE any variable is set below: the whole point of H1-d. @es Importado ANTES de fijar variables.
import { claudeHome, stateDir } from './locations.mjs';

const KEYS = ['HOOK_STATE_DIR', 'HOOK_CLAUDE_HOME', 'HOME', 'USERPROFILE'];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function thrown(action) {
  try {
    action();
  } catch (error) {
    return error.message;
  }

  return undefined;
}

function setEnv(values) {
  for (const key of KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}

const scratch = mkdtempSync(path.join(tmpdir(), 'locations-selftest-'));
const fakeHome = path.join(scratch, 'home');
const stateRoot = path.join(scratch, 'state-root');
const claudeRoot = path.join(scratch, 'claude-root');

try {
  // The module is already imported and the variables are still as the caller left them: the first calls
  // below happen BEFORE the variables are set, so a value cached on first use or at import is exposed.
  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome });
  check('home default: no override gives <homedir>/.claude', claudeHome(), path.join(fakeHome, '.claude'));
  check('state default: no override gives <claudeHome>/<mechanism>/state', stateDir('guard-a'), path.join(fakeHome, '.claude', 'guard-a', 'state'));

  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: stateRoot, HOOK_CLAUDE_HOME: claudeRoot });
  check('H1-d: HOOK_STATE_DIR set after import is honored', stateDir('guard-a'), path.join(stateRoot, 'guard-a'));
  check('H1-d: HOOK_CLAUDE_HOME set after import is honored', claudeHome(), claudeRoot);
  check('two mechanisms get two directories under the same root', [stateDir('guard-a'), stateDir('guard-b')], [path.join(stateRoot, 'guard-a'), path.join(stateRoot, 'guard-b')]);

  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_CLAUDE_HOME: claudeRoot });
  check('without HOOK_STATE_DIR the state follows HOOK_CLAUDE_HOME', stateDir('guard-a'), path.join(claudeRoot, 'guard-a', 'state'));

  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: stateRoot, HOOK_CLAUDE_HOME: claudeRoot });
  check('HOOK_STATE_DIR wins over HOOK_CLAUDE_HOME for state', stateDir('guard-a'), path.join(stateRoot, 'guard-a'));

  const other = path.join(scratch, 'other-root');
  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: other });
  check('a change between two calls is seen by the second call', stateDir('guard-a'), path.join(other, 'guard-a'));

  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: '', HOOK_CLAUDE_HOME: '' });
  check('an empty HOOK_CLAUDE_HOME is unset', claudeHome(), path.join(fakeHome, '.claude'));
  check('an empty HOOK_STATE_DIR is unset', stateDir('guard-a'), path.join(fakeHome, '.claude', 'guard-a', 'state'));

  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: path.relative(process.cwd(), stateRoot) });
  check('a relative HOOK_STATE_DIR resolves to an absolute path', path.isAbsolute(stateDir('guard-a')), true);
  check('a relative HOOK_STATE_DIR resolves against the working directory', stateDir('guard-a'), path.join(path.resolve(stateRoot), 'guard-a'));

  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_CLAUDE_HOME: path.relative(process.cwd(), claudeRoot) });
  check('a relative HOOK_CLAUDE_HOME resolves against the working directory', claudeHome(), path.resolve(claudeRoot));

  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: stateRoot });
  for (const bad of ['', '..', '../x', 'a/b', 'a\\b', '.hidden', 'a.b', 'C:\\x', undefined, 3]) {
    check(`a mechanism name that is not a plain name is refused: ${JSON.stringify(bad)}`, /@es /.test(thrown(() => stateDir(bad)) ?? ''), true);
  }
} catch (error) {
  failures.push(`unexpected throw — ${error.message}`);
} finally {
  setEnv(saved);
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
