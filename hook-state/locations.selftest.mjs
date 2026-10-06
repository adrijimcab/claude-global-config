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
 *
 * AND THE LISTINGS: `stateDirIn` for a home given as a parameter; `stateRoot`; `mechanismsWithState` and
 * `stateDirsUnder` over a constructed tree holding a real state directory, a mechanism without one, a FILE named
 * `state`, a LINK named `state`, a name that is not plain and a plain file; `isolateState` (sets the variable,
 * a fresh directory per call, inherited by a child, removed when the process exits).
 * @es Y LOS LISTADOS: `stateDirIn`, `stateRoot`, `mechanismsWithState` y `stateDirsUnder` sobre un árbol
 * construido (estado real, mecanismo sin estado, FICHERO y ENLACE llamados `state`, nombre no simple, fichero
 * suelto) e `isolateState` (fija la variable, directorio nuevo por llamada, lo hereda un hijo, se borra al salir).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Imported BEFORE any variable is set below: the whole point of H1-d. @es Importado ANTES de fijar variables.
import { CLAUDE_HOME_VARIABLE, STATE_ROOT_VARIABLE, claudeHome, isMechanismName, isolateState, mechanismsWithState, stateDir, stateDirIn, stateDirsUnder, stateRoot as rootOfState } from './locations.mjs';

const MODULE_URL = new URL('./locations.mjs', import.meta.url).href;

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

  // --- the names of the variables, which the selftest runner and the census rely on ---
  check('the state root variable is HOOK_STATE_DIR', STATE_ROOT_VARIABLE, 'HOOK_STATE_DIR');
  check('the Claude home variable is HOOK_CLAUDE_HOME', CLAUDE_HOME_VARIABLE, 'HOOK_CLAUDE_HOME');

  // --- a home given as a parameter ---
  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: stateRoot, HOOK_CLAUDE_HOME: claudeRoot });
  check('stateDirIn ignores both variables: <home>/<mechanism>/state', stateDirIn(path.join(scratch, 'given'), 'guard-a'), path.join(scratch, 'given', 'guard-a', 'state'));
  check('stateDirIn makes a relative home absolute', stateDirIn(path.relative(process.cwd(), path.join(scratch, 'given')), 'guard-a'), path.join(scratch, 'given', 'guard-a', 'state'));
  check('stateDirIn refuses a mechanism name that is a path', /@es /.test(thrown(() => stateDirIn(scratch, '../x')) ?? ''), true);
  check('a plain name is a mechanism name', [isMechanismName('guard-a'), isMechanismName('a_b9')], [true, true]);
  check('a path, a dotted name and a non-string are not', [isMechanismName('../x'), isMechanismName('.git'), isMechanismName('a.b'), isMechanismName(''), isMechanismName(7)], [false, false, false, false, false]);

  // --- the root every state hangs from ---
  check('stateRoot is HOOK_STATE_DIR when it is set', rootOfState(), stateRoot);
  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_CLAUDE_HOME: claudeRoot });
  check('stateRoot is the Claude home when HOOK_STATE_DIR is unset', rootOfState(), claudeRoot);
  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: '', HOOK_CLAUDE_HOME: claudeRoot });
  check('stateRoot treats an empty HOOK_STATE_DIR as unset', rootOfState(), claudeRoot);
  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: path.relative(process.cwd(), stateRoot) });
  check('stateRoot makes a relative HOOK_STATE_DIR absolute', rootOfState(), path.resolve(stateRoot));

  // --- the listings, over a constructed home ---
  const home = path.join(scratch, 'listed-home');
  mkdirSync(path.join(home, 'guard-b', 'state'), { recursive: true });
  mkdirSync(path.join(home, 'guard-a', 'state', 'nested'), { recursive: true });
  mkdirSync(path.join(home, 'no-state'), { recursive: true });
  mkdirSync(path.join(home, 'file-state'), { recursive: true });
  writeFileSync(path.join(home, 'file-state', 'state'), 'a file, not a directory');
  mkdirSync(path.join(home, '.hidden', 'state'), { recursive: true });
  mkdirSync(path.join(home, 'linked'), { recursive: true });
  mkdirSync(path.join(scratch, 'elsewhere'), { recursive: true });
  symlinkSync(path.join(scratch, 'elsewhere'), path.join(home, 'linked', 'state'), 'junction');
  writeFileSync(path.join(home, 'loose-file'), 'x');
  const listed = stateDirsUnder(home);
  check('stateDirsUnder lists only real state directories of plain names, sorted', listed, [{ mechanism: 'guard-a', directory: path.join(home, 'guard-a', 'state') }, { mechanism: 'guard-b', directory: path.join(home, 'guard-b', 'state') }]);
  const reversed = (directory, options) => readdirSync(directory, options).reverse();
  check('stateDirsUnder sorts whatever order the directory is read in', [stateDirsUnder(home, reversed).map((entry) => entry.mechanism), stateDirsUnder(home, (directory, options) => readdirSync(directory, options).sort((a, b) => (a.name < b.name ? -1 : 1))).map((entry) => entry.mechanism)], [['guard-a', 'guard-b'], ['guard-a', 'guard-b']]);
  writeFileSync(path.join(scratch, 'a-file-home'), 'not a directory');
  check('a home that exists but is not a directory throws, never reads as empty', thrown(() => stateDirsUnder(path.join(scratch, 'a-file-home'))) !== undefined, true);
  symlinkSync(home, path.join(scratch, 'linked-home'), 'junction');
  check('a home that is itself a link is listed through it', stateDirsUnder(path.join(scratch, 'linked-home')).map((entry) => entry.mechanism), ['guard-a', 'guard-b']);
  check('stateDirsUnder of an absent home is empty', stateDirsUnder(path.join(scratch, 'absent')), []);

  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_CLAUDE_HOME: home });
  check('mechanismsWithState reads the Claude home when HOOK_STATE_DIR is unset', mechanismsWithState(), ['guard-a', 'guard-b']);
  const root = path.join(scratch, 'listed-root');
  mkdirSync(path.join(root, 'guard-c'), { recursive: true });
  mkdirSync(path.join(root, 'guard-d'), { recursive: true });
  mkdirSync(path.join(root, '.skip'), { recursive: true });
  writeFileSync(path.join(root, 'guard-e'), 'a file is no state directory');
  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: root, HOOK_CLAUDE_HOME: home });
  check('mechanismsWithState reads <HOOK_STATE_DIR>/<mechanism> when it is set', mechanismsWithState(), ['guard-c', 'guard-d']);
  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome, HOOK_STATE_DIR: path.join(scratch, 'absent-root') });
  check('mechanismsWithState of an absent root is empty', mechanismsWithState(), []);

  // --- isolateState: a fresh directory, set for this process and its children, removed at exit ---
  setEnv({ HOME: fakeHome, USERPROFILE: fakeHome });
  const first = isolateState('probe');
  check('isolateState sets HOOK_STATE_DIR to the directory it returns', process.env.HOOK_STATE_DIR, first);
  check('isolateState creates the directory, under the temp directory', [existsSync(first), path.dirname(first) === path.resolve(tmpdir()), path.basename(first).startsWith('hook-state-probe-')], [true, true, true]);
  check('stateDir follows the isolated root', stateDir('guard-a'), path.join(first, 'guard-a'));
  const second = isolateState('probe');
  check('a second isolateState gives another directory', second !== first && existsSync(second), true);
  check('isolateState refuses a label that is not a plain name', /@es /.test(thrown(() => isolateState('../x')) ?? ''), true);
  const probe = path.join(scratch, 'probe.mjs');
  writeFileSync(probe, `import { isolateState } from ${JSON.stringify(MODULE_URL)};\nconst root = isolateState('child');\nconsole.log(JSON.stringify({ root, env: process.env.HOOK_STATE_DIR }));\n`);
  const child = spawnSync(process.execPath, [probe], { encoding: 'utf8', env: { ...process.env } });
  const reported = (() => { try { return JSON.parse(child.stdout); } catch { return undefined; } })();
  check('a process that isolates its state sees its own directory', reported !== undefined && reported.root === reported.env, true);
  check('the isolated directory is removed when that process exits', reported !== undefined && !existsSync(reported.root), true);
  const inherit = spawnSync(process.execPath, ['-e', 'console.log(process.env.HOOK_STATE_DIR)'], { encoding: 'utf8' });
  check('a child spawned after isolateState inherits the directory', inherit.stdout.trim(), second);
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
