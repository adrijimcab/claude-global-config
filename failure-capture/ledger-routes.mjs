/**
 * The ledger ROUTER: which scopes the home keeps its lessons under, where each scope's file is, and which of
 * those files the Claude Code harness loads. A lesson is written once, under its scope, in one line; WHERE that
 * line lives decides what it costs: a line in the home ledger is loaded in every session of every project.
 *
 *   `global`    the home ledger, loaded in every session (`rules/20-lessons.md` imports it);
 *   `promoted`  the stubs `promote` leaves, in a file NOTHING imports and that is not under `rules/`, so the
 *               harness never loads it: a stub only says that a rule exists, and the rule text is in a rules
 *               file the harness already loads;
 *   an AREA     (`guards`, `repo-tooling`, `run-artifacts`) a lesson about one area of work, in a rules file whose
 *               `paths:` frontmatter makes the harness load it ONLY when a file matching those paths is read
 *               (Claude Code's native path-scoped rules). The rule text of a promoted area lesson goes in a
 *               second path-scoped file of the same area, so a lesson and its rule travel together;
 *   a project   its own ledger, loaded only in that project (`ledgers.mjs`).
 *
 * `promoted` and the areas are scopes of the GLOBAL family: a lesson in them is a global lesson, so a recurrence
 * of it is still promoted into global rules files, never into a project's contract (`promotion-target.mjs`).
 *
 * @es El ENRUTADOR de ledgers: bajo qué alcances guarda el home sus lecciones, dónde está el fichero de cada
 * alcance y cuáles de esos ficheros carga el harness de Claude Code. Una lección se escribe una vez, bajo su
 * alcance, en una línea; DÓNDE vive esa línea decide lo que cuesta: una línea del ledger del home se carga en
 * toda sesión de todo proyecto. `global`: el ledger del home, cargado siempre. `promoted`: los muñones que deja
 * `promote`, en un fichero que NADA importa y que no está bajo `rules/`, así que el harness nunca lo carga: un
 * muñón solo dice que existe una regla, cuyo texto está en un fichero de reglas que el harness ya carga. Un
 * ÁREA (`guards`, `repo-tooling`, `run-artifacts`): una lección sobre un área de trabajo, en un fichero de
 * reglas cuyo frontmatter `paths:` hace que el harness lo cargue SOLO cuando se lee un fichero que coincide
 * (reglas con alcance de ruta nativas de Claude Code); el texto de la regla de una lección de área promovida va
 * en un segundo fichero del mismo área, así la lección y su regla viajan juntas. Un proyecto: su propio ledger,
 * cargado solo en ese proyecto. `promoted` y las áreas son alcances de la familia GLOBAL: una lección ahí es
 * una lección global, así que su reincidencia se promueve a ficheros globales de reglas.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

import { GLOBAL_SCOPE } from './project.mjs';

/** The scope of the stubs `promote` leaves for global lessons. @es El alcance de los muñones que `promote` deja de lecciones globales. */
export const PROMOTED_SCOPE = 'promoted';

/**
 * The areas of work whose lessons are loaded only when files of that area are in play. `paths` are the globs the
 * harness matches against the files it reads. An area is added here, and a lesson is moved into it with
 * `capture.mjs route --key <key> --to <area>`; a new capture names it with `--scope <area>`.
 * @es Las áreas de trabajo cuyas lecciones se cargan solo cuando hay ficheros de esa área en juego. `paths` son
 * los globs que el harness compara con los ficheros que lee. Un área se añade aquí y una lección se mueve a ella
 * con `capture.mjs route --key <clave> --to <área>`; una captura nueva la nombra con `--scope <área>`.
 */
export const AREAS = Object.freeze({
  guards: Object.freeze({
    about: 'writing or changing a guard, gate, check or classifier, and the tests and mutation campaigns that prove it',
    paths: ['**/*.selftest.mjs', '**/selftest.mjs', '**/*.mutants.mjs', '**/mutants.mjs', '**/guard.mjs', '**/*-guard/**', '**/*.spec.*', '**/*.test.*'],
  }),
  'repo-tooling': Object.freeze({
    about: 'the repository manifest, lint configuration and git hooks',
    paths: ['**/package.json', '**/package-lock.json', '**/eslint.config.*', '**/.eslintrc*', '**/eslint-suppressions.json', '**/.husky/**', '**/lefthook.yml', '**/.pre-commit-config.yaml'],
  }),
  'run-artifacts': Object.freeze({
    about: 'reading the results of a run: verdicts, logs, coverage and test reports',
    paths: ['**/verdict.json', '**/gate-run/**', '**/coverage/**', '**/test-results/**', '**/*.log', '**/junit*.xml'],
  }),
});

/** Whether `scope` names an area. @es Si `scope` nombra un área. */
export const isAreaScope = (scope) => typeof scope === 'string' && Object.hasOwn(AREAS, scope);

/** The areas, in the order of the registry. @es Las áreas, en el orden del registro. */
export const areaScopes = () => Object.keys(AREAS);

/**
 * The unloaded file of the promoted stubs. It sits in `~/.claude/` beside the ledger (not under `rules/`, which the
 * harness loads, and not in `lessons/`, whose `evidence/` is the evidence store of the ledger beside it).
 * @es El fichero NO cargado de los muñones promovidos. Está en `~/.claude/` junto al ledger (no bajo `rules/`, que el harness carga).
 */
export const stubsLedgerFile = (home) => path.join(home, '.claude', 'lessons-promoted.md');

/** The path-scoped file holding an area's lessons. @es El fichero con alcance de ruta que guarda las lecciones de un área. */
export const areaLedgerFile = (home, area) => path.join(home, '.claude', 'rules', `lessons-${area}.md`);

/** The path-scoped file holding the rule text of an area's promoted lessons. @es El fichero con alcance de ruta que guarda el texto de regla de las lecciones promovidas de un área. */
export const areaRulesFile = (home, area) => path.join(home, '.claude', 'rules', `promoted-${area}.md`);

/**
 * The rules files the harness does NOT load, that `~/.claude/rules/promoted-rules.md` names with the situation in which
 * to read them: `~/.claude/lessons/on-demand/*.md`, sorted by name; none when the directory cannot be read. They
 * hold the text of promoted rules that apply to an ACTION (delegating, landing, recording) rather than to a path, so
 * no `paths:` frontmatter can scope them; the rule text of a promoted key lives in one of them or in a rules file.
 * @es Los ficheros de reglas que el harness NO carga y que `~/.claude/rules/promoted-rules.md` nombra con la situación
 * en que leerlos: `~/.claude/lessons/on-demand/*.md`, por nombre; ninguno si no se puede leer el directorio. Guardan el
 * texto de reglas promovidas que valen para una ACCIÓN (delegar, aterrizar, registrar) y no para una ruta, así que
 * ningún frontmatter `paths:` puede acotarlos; el texto de la regla de una clave promovida vive en uno de ellos o en
 * un fichero de reglas.
 */
export function onDemandRulesFiles(home) {
  const directory = path.join(home, '.claude', 'lessons', 'on-demand');

  try {
    return readdirSync(directory)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => path.join(directory, name));
  } catch {
    return [];
  }
}

/**
 * A glob as a YAML double-quoted scalar: a backslash and a double quote escaped. A declared glob holds neither
 * (`project-areas.mjs` refuses them); the escape is the second line of defence, so no glob can end the scalar or
 * start an escape.
 * @es Un glob como escalar YAML entre comillas dobles: barra invertida y comilla doble escapadas. Un glob declarado no
 * lleva ninguna (`project-areas.mjs` las rechaza); el escape es la segunda línea de defensa, para que ningún glob
 * cierre el escalar ni inicie un escape.
 */
const quotedGlob = (glob) => `"${glob.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** The frontmatter the harness reads to scope a rule to paths. @es El frontmatter que lee el harness para dar a una regla alcance de ruta. */
const frontmatterOf = (paths) => ['---', 'paths:', ...paths.map((glob) => `  - ${quotedGlob(glob)}`), '---'].join('\n');

/** The header of a new stubs file; it says it is never loaded and where the rule text is. @es El encabezado de un fichero de muñones nuevo. */
export const STUBS_HEADER = `# Promoted lesson stubs — NOT loaded\n\nOne line per promoted lesson (a repeat folds into its line and bumps the counter). The harness does NOT load this file:\nnothing imports it and it is not under rules/. The rule text itself is in \`~/.claude/rules/promoted-rules.md\` (or, for an\narea, in its \`promoted-<area>.md\`), which it loads. Machine state: the trailing \`<!--fc:KEY#N-->\` marker belongs to\n\`~/.claude/failure-capture/\`; this file is written only by \`capture.mjs\`, never by hand.\n\n---\n`;

/**
 * The header of a new area ledger: the frontmatter that scopes it, then what it is. `definition` is the area's
 * `{ about, paths }`: the home's registry entry by default, or the one a PROJECT declares (`project-areas.mjs`).
 * @es El encabezado de un ledger de área nuevo. `definition` es el `{ about, paths }` del área: el del registro del home por omisión, o el que declara un PROYECTO.
 */
export const areaLedgerHeader = (area, definition = AREAS[area]) =>
  `${frontmatterOf(definition.paths)}\n# Lessons Ledger — ${area} (path-scoped)\n\nLessons about ${definition.about}. The harness loads this file ONLY when a file matching the \`paths:\` above is read.\nOne line per RULE (a repeat folds into its line and bumps the counter). Machine state: the trailing \`<!--fc:KEY#N-->\`\nmarker belongs to \`~/.claude/failure-capture/\`; this file is written only by \`capture.mjs\`, never by hand.\n\n---\n`;

/** The header of a new area rules file. @es El encabezado de un fichero de reglas de área nuevo. */
export const areaRulesHeader = (area) =>
  `${frontmatterOf(AREAS[area].paths)}\n# Promoted rules — ${area} (path-scoped)\n\nBinding rules about ${AREAS[area].about}, promoted from the lessons of that area. The harness loads this file ONLY when a\nfile matching the \`paths:\` above is read.\n`;

/**
 * Whether a lesson of `scope` belongs to the GLOBAL family: its promotion lands in global rules files, never in
 * a project's contract. @es Si una lección de `scope` es de la familia GLOBAL: su promoción aterriza en ficheros globales de reglas.
 */
export const isGlobalFamily = (scope) => scope === GLOBAL_SCOPE || scope === PROMOTED_SCOPE || isAreaScope(scope);

/**
 * The scope a promotion's stub is written under: the global family's stubs all go to `promoted`; a project's
 * stub stays in its own ledger, which only that project loads and which is the only place its resumed workers
 * read it. @es El alcance bajo el que se escribe el muñón de una promoción.
 */
export const stubScopeOf = (scope) => (isGlobalFamily(scope) ? PROMOTED_SCOPE : scope);

/** Whether a project may not take `scope` as its own: it would shadow a scope of the home. @es Si un proyecto no puede tomar `scope` como suyo: taparía un alcance del home.  */
export const isReservedScope = (scope) => isGlobalFamily(scope);
