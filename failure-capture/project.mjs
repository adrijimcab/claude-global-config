/**
 * Which PROJECT a directory belongs to, for the failure-capture loop: where that project's lessons live,
 * and which files are its worker contract.
 *
 * WHY THIS EXISTS. The loop lived inside b100-am-ui and derived everything from its own location: the
 * project ledger was `<b100>/.claude/lessons-ledger.md`, the only project scope was the literal
 * `b100-am-ui`, and a worker lesson promoted into b100's two contract files. Moved to `~/.claude/` so every
 * project gets it, those facts must come from the project a command runs in, never from where the code
 * sits.
 *
 * WHAT A PROJECT IS. The nearest directory, walking up from the one asked about, that holds
 * `.claude/CLAUDE.md` — the file Claude Code loads as the project's instructions, which is also where the
 * ledger is imported from. A linked worktree is mapped to its MAIN checkout first (git's common dir),
 * because `.claude/` is excluded from git and exists only there. No project found means global-only.
 *
 * PER-PROJECT CONFIG, optional: `<project>/.claude/failure-capture.json`
 *   { "scope": "<label>", "workerContracts": ["<relative>", …], "parityGate": "<relative>" }
 * Without it: the scope is the project folder's name, the worker contract is `.claude/CLAUDE.md` (the file
 * every subagent of the project loads), and there is no parity gate.
 *
 * @es A qué PROYECTO pertenece un directorio para el bucle de captura: dónde viven sus lecciones y qué
 * ficheros son su contrato de worker. Un proyecto es el directorio más cercano, subiendo, que tiene
 * `.claude/CLAUDE.md`; un worktree enlazado se mapea antes a su checkout PRINCIPAL. Config opcional en
 * `<proyecto>/.claude/failure-capture.json`; sin ella, el alcance es el nombre de la carpeta, el contrato
 * de worker es `.claude/CLAUDE.md` y no hay gate de paridad.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';

export const PROJECT_MARKER = path.join('.claude', 'CLAUDE.md');
export const CONFIG_FILE = path.join('.claude', 'failure-capture.json');
export const LEDGER_FILE = path.join('.claude', 'lessons-ledger.md');
export const GLOBAL_SCOPE = 'global';

const CONFIG_KEYS = ['scope', 'workerContracts', 'parityGate'];

const realpathOf = (directory) => {
  try {
    return realpathSync.native(directory);
  } catch {
    return path.resolve(directory);
  }
};

function git(directory, ...args) {
  const answer = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8', windowsHide: true });

  return answer.error === undefined && answer.status === 0 ? answer.stdout.trim() : undefined;
}

/**
 * `directory` mapped onto the main checkout when it sits in a linked worktree; itself otherwise.
 * @es `directory` mapeado al checkout principal si está en un worktree enlazado; si no, él mismo.
 */
export function mainCheckoutPath(directory) {
  const top = git(directory, 'rev-parse', '--show-toplevel');
  const common = git(directory, 'rev-parse', '--path-format=absolute', '--git-common-dir');

  if (top === undefined || common === undefined) return realpathOf(directory);

  return path.join(realpathOf(path.dirname(common)), path.relative(realpathOf(top), realpathOf(directory)));
}

/** Whether two paths name the same folder (Windows compares case-insensitively). @es Si dos rutas nombran la misma carpeta. */
const sameFolder = (left, right) => path.relative(realpathOf(left), realpathOf(right)) === '';

/**
 * Every folder whose `.claude/CLAUDE.md` is USER-level instructions, never a project: the process's home
 * (`HOME`/`USERPROFILE`, which a fixture overrides) AND the account's own profile, which the OS reports
 * whatever the environment says.
 *
 * MEASURED 2026-09-30: with only the first, a process whose HOME pointed at a fixture and whose cwd sat
 * outside it walked up to the REAL home, took `~/.claude/CLAUDE.md` for a project, and `init` appended an
 * `@lessons-ledger.md` section to the owner's global instructions — twice, the second time after a revert.
 * @es Toda carpeta cuyo `.claude/CLAUDE.md` son instrucciones de USUARIO, nunca un proyecto: el home del
 * proceso (que un fixture sobrescribe) Y el perfil real de la cuenta, que el SO informa diga lo que diga el
 * entorno. Medido el 2026-09-30: con solo el primero, `init` añadió una sección al CLAUDE.md global real.
 */
function userHomes() {
  const homes = [homedir()];

  try {
    homes.push(userInfo().homedir);
  } catch {
    // an account the OS cannot describe has no second home to stop at
  }

  return homes;
}

/**
 * The project root holding `.claude/CLAUDE.md` at or above `directory`, or `undefined`. The walk stops at
 * the user's HOME: `~/.claude/CLAUDE.md` is the user-level instructions file, not a project, and every
 * folder under the home would otherwise belong to it.
 * @es La raíz del proyecto, o `undefined`. El recorrido se detiene en el HOME: `~/.claude/CLAUDE.md` son
 * las instrucciones de usuario, no un proyecto.
 */
export function projectRootOf(directory) {
  let candidate = mainCheckoutPath(directory);
  const homes = userHomes();

  for (;;) {
    if (homes.some((home) => sameFolder(candidate, home))) return undefined;
    if (existsSync(path.join(candidate, PROJECT_MARKER))) return candidate;

    const parent = path.dirname(candidate);

    if (parent === candidate) return undefined;
    candidate = parent;
  }
}

/** Reads and validates the optional per-project config; a broken one THROWS, it never reads as absent. @es Lee y valida la config opcional; una rota LANZA. */
export function readProjectConfig(root) {
  const file = path.join(root, CONFIG_FILE);

  if (!existsSync(file)) return {};

  const config = JSON.parse(readFileSync(file, 'utf8'));
  const unknown = Object.keys(config).filter((key) => !CONFIG_KEYS.includes(key));
  const problems = [
    ...unknown.map((key) => `unknown key "${key}"`),
    ...(config.scope === undefined || (typeof config.scope === 'string' && config.scope.length > 0 && config.scope !== GLOBAL_SCOPE) ? [] : ['"scope" must be a non-empty string other than "global"']),
    ...(config.workerContracts === undefined || (Array.isArray(config.workerContracts) && config.workerContracts.length > 0 && config.workerContracts.every((entry) => typeof entry === 'string')) ? [] : ['"workerContracts" must be a non-empty list of relative paths']),
    ...(config.parityGate === undefined || typeof config.parityGate === 'string' ? [] : ['"parityGate" must be a relative path'])
  ];

  if (problems.length > 0) throw new Error(`${file} is invalid: ${problems.join('; ')}`);

  return config;
}

/**
 * The project context of `directory`: `{ root, scope, ledgerFile, workerContracts, parityGate }`, or
 * `undefined` when no project holds it (global lessons only).
 * @es El contexto de proyecto de `directory`, o `undefined` si ningún proyecto lo contiene.
 */
export function projectOf(directory) {
  const root = projectRootOf(directory);

  if (root === undefined) return undefined;

  const config = readProjectConfig(root);

  return {
    root,
    scope: config.scope ?? path.basename(root),
    ledgerFile: path.join(root, LEDGER_FILE),
    workerContracts: (config.workerContracts ?? ['.claude/CLAUDE.md']).map((relative) => path.join(root, ...relative.split('/'))),
    parityGate: config.parityGate === undefined ? undefined : path.join(root, ...config.parityGate.split('/'))
  };
}
