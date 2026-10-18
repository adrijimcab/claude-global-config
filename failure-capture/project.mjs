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
 *   { "scope": "<label>", "workerContracts": ["<relative>", …], "loadedSetCeiling": <characters>,
 *     "areas": { "<name>": { "about": "<text>", "paths": ["<glob>", …] } } }
 * `loadedSetCeiling` is a stricter ceiling on the loaded instruction set for this project (@es un techo más estricto para este proyecto).
 * `areas` are the project's own path-scoped lesson areas (`project-areas.mjs`); `capture.mjs route --key K --to <area>`
 * moves a lesson of the project ledger into `.claude/rules/lessons-<area>.md` of the SAME project
 * (@es las áreas de lecciones con alcance de ruta propias del proyecto; `route` mueve ahí una lección del ledger del MISMO proyecto).
 * Without it: the scope is the project folder's name, the worker contract is `.claude/CLAUDE.md` (the file
 * every subagent of the project loads). Contract parity is not configured here: a project declares it in
 * `.claude/agent-contract/anchors.json`, read by the shared engine (`../agent-contract-parity/`).
 *
 * @es A qué PROYECTO pertenece un directorio para el bucle de captura: dónde viven sus lecciones y qué
 * ficheros son su contrato de worker. Un proyecto es el directorio más cercano, subiendo, que tiene
 * `.claude/CLAUDE.md`; un worktree enlazado se mapea antes a su checkout PRINCIPAL. Config opcional en
 * `<proyecto>/.claude/failure-capture.json`; sin ella, el alcance es el nombre de la carpeta, el contrato
 * de worker es `.claude/CLAUDE.md`. La paridad de contrato no se configura aquí: el proyecto la declara en
 * `.claude/agent-contract/anchors.json`, que lee el motor compartido (`../agent-contract-parity/`).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { realpathOf, sameFolder } from '../agent-contract-parity/real-path.mjs';
import { userHomes } from '../agent-contract-parity/user-home.mjs';
import { areaProblems } from './project-areas.mjs';

export const PROJECT_MARKER = path.join('.claude', 'CLAUDE.md');
export const CONFIG_FILE = path.join('.claude', 'failure-capture.json');
export const LEDGER_FILE = path.join('.claude', 'lessons-ledger.md');
export const GLOBAL_SCOPE = 'global';

const CONFIG_KEYS = ['scope', 'workerContracts', 'loadedSetCeiling', 'areas'];

/**
 * The path-scoped ledger of a project's area: `<project>/.claude/rules/lessons-<area>.md`, the place Claude Code
 * loads only when a file matching the area's globs is read.
 * @es El ledger con alcance de ruta de un área de proyecto, que Claude Code carga solo al leer un fichero que coincide con los globs del área.
 */
export const projectAreaFile = (root, area) => path.join(root, '.claude', 'rules', `lessons-${area}.md`);

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

/**
 * The project root holding `.claude/CLAUDE.md` at or above `directory`, or `undefined`. The walk stops at
 * the user's HOME: `~/.claude/CLAUDE.md` is the user-level instructions file, not a project, and every
 * folder under the home would otherwise belong to it. `homes` names the folders that count as a home
 * (default: the process's own and the account's, see `userHomes`), so a caller can state which home it means.
 * @es La raíz del proyecto, o `undefined`. El recorrido se detiene en el HOME: `~/.claude/CLAUDE.md` son
 * las instrucciones de usuario, no un proyecto. `homes` nombra las carpetas que cuentan como home (por
 * omisión, las del proceso y la cuenta), para que quien llama diga qué home entiende.
 */
export function projectRootOf(directory, homes = userHomes()) {
  let candidate = mainCheckoutPath(directory);

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
    ...(config.loadedSetCeiling === undefined || (Number.isInteger(config.loadedSetCeiling) && config.loadedSetCeiling > 0) ? [] : ['"loadedSetCeiling" must be a positive integer (characters). @es "loadedSetCeiling" debe ser un entero positivo (caracteres)']),
    ...areaProblems(config.areas)
  ];

  if (problems.length > 0) throw new Error(`${file} is invalid: ${problems.join('; ')}`);

  return config;
}

/**
 * The areas declared by the project whose ledger is `ledgerFile` (`<root>/.claude/lessons-ledger.md`), read from
 * its config; `undefined` when that config is invalid, so the caller leaves the work for the project itself.
 * @es Las áreas que declara el proyecto cuyo ledger es `ledgerFile`, leídas de su config; `undefined` si esa config es inválida, para que quien llama deje el trabajo al proyecto mismo.
 */
export function areasOfLedger(ledgerFile) {
  try {
    return readProjectConfig(path.dirname(path.dirname(ledgerFile))).areas ?? {};
  } catch {
    return undefined;
  }
}

/**
 * The project context of `directory`: `{ root, scope, ledgerFile, workerContracts, loadedSetCeiling }`, or
 * `undefined` when no project holds it (global lessons only). `homes` is forwarded to `projectRootOf`.
 * @es El contexto de proyecto de `directory`, o `undefined` si ningún proyecto lo contiene. `homes` se
 * pasa a `projectRootOf`.
 */
export function projectOf(directory, { homes } = {}) {
  const root = projectRootOf(directory, homes);

  if (root === undefined) return undefined;

  const config = readProjectConfig(root);

  return {
    root,
    scope: config.scope ?? path.basename(root),
    ledgerFile: path.join(root, LEDGER_FILE),
    workerContracts: (config.workerContracts ?? ['.claude/CLAUDE.md']).map((relative) => path.join(root, ...relative.split('/'))),
    loadedSetCeiling: config.loadedSetCeiling,
    areas: config.areas ?? {}
  };
}
