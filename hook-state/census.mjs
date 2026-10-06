/**
 * The rules that keep `locations.mjs` the ONLY place a module resolves a state, journal or registry path,
 * measured on the tree and read-only. A non-test module is any `.mjs` that is neither a selftest nor a mutants
 * campaign; vendored copies (`fleet-kit/vendor/`, hash-pinned to their source) are not this tree's code.
 *
 *   (a) `stateJoinsOutsideTheModule`: no non-test module joins a path segment `'state'` itself. A line that
 *       holds the quoted word `state` AND a `join(` or `resolve(` call is a module resolving its own state
 *       directory, which is the defect: neither `HOOK_STATE_DIR` nor a selftest can redirect it.
 *   (b) `stateVariablesOutsideTheModule`: no non-test module names `HOOK_STATE_DIR` or `HOOK_CLAUDE_HOME` in
 *       code. Reading one is a second resolution; setting one for a child goes through the module's exported
 *       names (`STATE_ROOT_VARIABLE`, `CLAUDE_HOME_VARIABLE`), so a rename cannot leave a caller behind.
 *   (c) `claudeHomeJoinsOutsideTheModule`: no non-test module builds the Claude home from `homedir()` and
 *       `'.claude'` on one line. The state lives under that home, so a module that builds it by hand bypasses
 *       `HOOK_CLAUDE_HOME`. The cases that read something else the harness keeps there (session transcripts,
 *       the owner's rule files) are LISTED, each with its reason.
 *   (d) `selftestsNotIsolating`: every selftest that exercises a module resolving its state through
 *       `locations.mjs` (directly, or through a module of the tree that does) redirects the state before it
 *       runs: it calls `isolateState(`, or sets `process.env.HOOK_STATE_DIR` to a directory of its own. A
 *       selftest exercises a module when it names the module's file: the ones beside it by file name, any
 *       other by its path from the tree's root. The runner gives every selftest a fresh state home already;
 *       this keeps a selftest run by hand, or by a mutants campaign, off the live state too.
 *
 * An excuse whose file no longer does what it excuses is itself a finding, so a list cannot only grow.
 *
 * WHAT IT DOES NOT SEE, stated: a state path assembled without the word (`path.join(dir, name)` with the name
 * held in a constant), a home built over two lines, and a selftest that reaches a module from another
 * directory without naming its file. Each would need the code to be parsed, not scanned by line.
 *
 * NO REGEX (M5): line and substring tests.
 *
 * @es Las reglas que mantienen `locations.mjs` como el ÚNICO sitio donde un módulo resuelve una ruta de estado,
 * journal o registro, medidas sobre el árbol y de solo lectura. Módulo no-test: todo `.mjs` que no es selftest
 * ni campaña de mutantes; las copias vendorizadas no son código de este árbol. (a) Ningún módulo une un
 * segmento `'state'` por su cuenta. (b) Ninguno nombra `HOOK_STATE_DIR` ni `HOOK_CLAUDE_HOME` en código: se usan
 * los nombres que exporta el módulo. (c) Ninguno construye el home de Claude con `homedir()` y `'.claude'` en
 * una línea, salvo los LISTADOS que leen otra cosa del harness (transcripts, reglas). (d) Todo selftest que
 * ejercita un módulo que resuelve por `locations.mjs` (directa o transitivamente) redirige el estado antes de
 * correr (`isolateState(` o `process.env.HOOK_STATE_DIR` propio). Una excusa sin uso es un hallazgo. NO VE una
 * ruta armada sin la palabra, un home construido en dos líneas ni un selftest que alcanza el módulo sin nombrar
 * su fichero. SIN REGEX (M5).
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The module's own path, relative to the tree; it is where the resolution belongs. @es La ruta del propio módulo. */
export const MODULE = 'hook-state/locations.mjs';

/** This census, which names the very text it looks for. @es Este censo, que nombra el texto que busca. */
const CENSUS = 'hook-state/census.mjs';

/** Directories that hold a run's output or someone else's tree, never walked. @es Directorios que no se recorren. */
const UNWALKED = new Set(['node_modules', 'worktrees', 'scratch', 'state', '.git', '.deploy-backups', '.runs', 'state-archive']);

/** Paths, from the tree's root, of vendored copies that belong to their source. @es Copias vendorizadas. */
const VENDORED = ['fleet-kit/vendor/'];

/** The quote characters a path segment may be written in. @es Las comillas con las que se escribe un segmento. */
const QUOTES = ["'", '"', '`'];

/** The variables only the module reads. @es Las variables que solo lee el módulo. */
const VARIABLES = ['HOOK_STATE_DIR', 'HOOK_CLAUDE_HOME'];

/**
 * The modules that join a `state` segment on purpose, each with why it is not a module resolving its own.
 * @es Los módulos que unen un segmento `state` a propósito, con el motivo.
 */
export const STATE_EXCUSES = new Map([]);

/**
 * The modules that build `<homedir>/.claude` on purpose, each with what they read there that is not state.
 * @es Los módulos que construyen `<homedir>/.claude` a propósito, con lo que leen allí que no es estado.
 */
export const HOME_EXCUSES = new Map([
  ['agent-liveness/liveness.mjs', "the harness's session transcripts (`~/.claude/projects`), not hook state"],
  ['brief-feasibility/preflight.mjs', "the harness's session transcripts and the dispatcher manifests, not hook state"],
  ['brief-tenancy/guard.mjs', "imports the provenance carriers' module from the install, not hook state"],
  ['config-sync-guard/attribution.mjs', "the harness's session transcripts (`~/.claude/projects`), not hook state"],
  ['config-sync-guard/repos.mjs', 'names the `~/.claude` repository whose sync it guards, not hook state'],
  ['failure-capture/capture.mjs', "the owner's promoted-rules file, a tracked document, not hook state"],
  ['failure-capture/ledgers.mjs', "the owner's lessons ledger, a tracked document, not hook state"],
  ['gentle-ai-sync-guard/overlay-check.mjs', "the installed overlay's check script, not hook state"],
  ['hook-dispatch/latency.mjs', "the harness's session transcripts (`~/.claude/projects`), not hook state"]
]);

/** Whether `file` is a selftest. @es Si `file` es un selftest. */
export const isSelftest = (file) => path.posix.basename(file) === 'selftest.mjs' || file.endsWith('.selftest.mjs');

/** Whether `file` is a mutants campaign. @es Si `file` es una campaña de mutantes. */
const isCampaign = (file) => path.posix.basename(file) === 'mutants.mjs' || file.endsWith('.mutants.mjs');

/** Whether `file` is code of this tree that runs outside a test. @es Si `file` es código de este árbol fuera de un test. */
const isProduction = (file) => !isSelftest(file) && !isCampaign(file) && !VENDORED.some((prefix) => file.startsWith(prefix));

/** Every `.mjs` file under `root`, relative and POSIX, sorted. @es Cada fichero `.mjs` bajo `root`. */
export function moduleFiles(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!UNWALKED.has(entry.name)) walk(absolute);
      } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
        found.push(path.relative(root, absolute).split(path.sep).join('/'));
      }
    }
  };

  walk(root);

  return found.sort();
}

/** Whether a line is a comment, which describes a path rather than building one. @es Si una línea es un comentario. */
const isComment = (line) => ['//', '*', '/*'].some((opener) => line.trimStart().startsWith(opener));

/** Whether a line joins the quoted word `state`. @es Si una línea une la palabra `state` entrecomillada. */
const joinsState = (line) => QUOTES.some((quote) => line.includes(`${quote}state${quote}`)) && (line.includes('join(') || line.includes('resolve('));

/** Whether a line names one of the module's variables. @es Si una línea nombra una variable del módulo. */
const namesVariable = (line) => VARIABLES.some((variable) => line.includes(variable));

/** Whether a line builds the Claude home from the user's home. @es Si una línea construye el home de Claude. */
const buildsClaudeHome = (line) => line.includes('homedir()') && QUOTES.some((quote) => line.includes(`${quote}.claude${quote}`));

/**
 * The code lines of the non-test modules, outside the module, that `matches`, not excused: `{ file, line }`
 * (1-based), plus `{ file, line: 0, unused: true }` for an excuse whose file no longer matches.
 * @es Las líneas de código de los módulos no-test, fuera del módulo, que cumplen `matches`, sin excusa.
 */
function linesOutsideTheModule(root, matches, excuses) {
  const findings = [];
  const matching = new Set();

  for (const file of moduleFiles(root).filter(isProduction)) {
    if (file === MODULE || file === CENSUS) continue;

    readFileSync(path.join(root, file), 'utf8')
      .split('\n')
      .forEach((text, index) => {
        if (isComment(text) || !matches(text)) return;

        matching.add(file);

        if (!excuses.has(file)) findings.push({ file, line: index + 1 });
      });
  }

  for (const file of excuses.keys()) {
    if (!matching.has(file)) findings.push({ file, line: 0, unused: true });
  }

  return findings;
}

/** The callers that name a mechanism to the module. @es Las llamadas que nombran un mecanismo al módulo. */
const CALLS = ["stateDir('", "stateDirOf('"];

/**
 * The mechanisms the non-test modules name in a literal `stateDir('<mechanism>')` (or its `stateDirOf` alias),
 * outside comments and the module itself, unique and sorted: the state directories this tree writes.
 * @es Los mecanismos que los módulos no-test nombran en un `stateDir('<mecanismo>')` literal, únicos y ordenados.
 */
export function literalMechanisms(root) {
  const found = new Set();

  for (const file of moduleFiles(root).filter(isProduction)) {
    if (file === MODULE || file === CENSUS) continue;

    for (const line of readFileSync(path.join(root, file), 'utf8').split('\n')) {
      if (isComment(line)) continue;

      for (const call of CALLS) {
        let at = line.indexOf(call);

        while (at >= 0) {
          const start = at + call.length;
          const end = line.indexOf("'", start);

          if (end > start) found.add(line.slice(start, end));
          at = line.indexOf(call, start);
        }
      }
    }
  }

  return [...found].sort();
}

/** Rule (a). @es Regla (a). */
export const stateJoinsOutsideTheModule = (root, excuses = STATE_EXCUSES) => linesOutsideTheModule(root, joinsState, excuses);

/** Rule (b). @es Regla (b). */
export const stateVariablesOutsideTheModule = (root) => linesOutsideTheModule(root, namesVariable, new Map());

/** Rule (c). @es Regla (c). */
export const claudeHomeJoinsOutsideTheModule = (root, excuses = HOME_EXCUSES) => linesOutsideTheModule(root, buildsClaudeHome, excuses);

/**
 * The relative modules `source` (the text of `file`) imports, as paths from the tree's root: a line that is an
 * import, or the `from` of one, and names a specifier starting with `./` or `../`.
 * @es Los módulos relativos que importa `source`, como rutas desde la raíz del árbol.
 */
export function importsOf(file, source) {
  const found = [];

  for (const line of source.split('\n')) {
    if (!(line.trimStart().startsWith('import') || line.includes('} from '))) continue;

    for (const quote of ["'", '"']) {
      const fromAt = line.indexOf(`from ${quote}`);
      const bareAt = line.trimStart().startsWith(`import ${quote}`) ? line.indexOf(`import ${quote}`) + 'import '.length : -1;
      const start = fromAt >= 0 ? fromAt + 'from '.length : bareAt;

      if (start < 0) continue;

      const end = line.indexOf(quote, start + 1);
      const specifier = line.slice(start + 1, end);

      if (end > start && (specifier.startsWith('./') || specifier.startsWith('../'))) found.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    }
  }

  return found;
}

/**
 * The non-test modules that resolve their state through the module, directly or through another module of the
 * tree that does, sorted.
 * @es Los módulos no-test que resuelven su estado por el módulo, directa o transitivamente, ordenados.
 */
export function modulesOnTheModule(root, files = moduleFiles(root), text = (file) => readFileSync(path.join(root, file), 'utf8')) {
  const imports = new Map(files.map((file) => [file, importsOf(file, text(file))]));
  const on = new Set();
  let grew = true;

  while (grew) {
    grew = false;

    for (const [file, imported] of imports) {
      if (on.has(file) || !isProduction(file) || file === MODULE) continue;

      if (imported.some((target) => target === MODULE || on.has(target))) {
        on.add(file);
        grew = true;
      }
    }
  }

  return [...on].sort();
}

/** Whether a selftest's text redirects the state before it runs. @es Si el texto de un selftest redirige el estado. */
const redirectsState = (source) => source.includes('isolateState(') || source.includes('process.env.HOOK_STATE_DIR = ');

/**
 * Rule (d): the selftests that exercise a module resolving its state through `locations.mjs` and do not
 * redirect the state: `{ file, exercises }`.
 * @es Regla (d): los selftests que ejercitan un módulo que resuelve por `locations.mjs` y no redirigen el estado.
 */
export function selftestsNotIsolating(root) {
  const files = moduleFiles(root);
  const text = new Map(files.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]));
  const held = new Map();

  for (const module of modulesOnTheModule(root, files, (file) => text.get(file))) {
    const directory = path.posix.dirname(module);

    for (const file of files.filter(isSelftest)) {
      const source = text.get(file);
      const beside = path.posix.dirname(file) === directory && source.includes(path.posix.basename(module));
      const naming = source.includes(module);

      if (beside || naming) held.set(file, [...(held.get(file) ?? []), module]);
    }
  }

  return [...held]
    .filter(([file]) => !redirectsState(text.get(file)))
    .map(([file, exercises]) => ({ file, exercises }))
    .sort((a, b) => (a.file < b.file ? -1 : 1));
}
