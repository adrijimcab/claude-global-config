/**
 * WHAT A DECIDING MODULE IS — the one definition the mutation demand rests on.
 *
 * A mutants campaign proves that a selftest goes red when a DECISION is broken, so it is demanded where a
 * decision is the product: a module whose output is an allow/deny/block verdict, a landing or integration
 * verdict, or a gate verdict. A module that only formats, reads, renders or carries data keeps its selftest and
 * may keep a campaign, but nothing demands one. Three rules say which modules decide, in this order, each one
 * STRUCTURAL where the tree can tell and DECLARED only where it cannot:
 *
 *   1. A HOOK ENTRY THAT EMITS A VERDICT. A hook entry is a guard listed in a dispatcher manifest (a `.json`
 *      under a `hook-dispatch/` folder with a `guards` list: the dispatcher exists to merge verdicts) or a file
 *      with a `<file>.hook-registration.json` beside it (the repositories' own way to say "this is wired as a
 *      hook"). It DECIDES when its source holds a word of the harness's verdict vocabulary, OR when it CALLS a
 *      VERDICT HELPER: a function it imports by name, through a relative static import, from a module of the
 *      repository whose own exported declaration of that name holds a verdict word (`deny()` of a shared
 *      hook-io module builds the `permissionDecision` the entry never spells). A hook that records (the task
 *      ledger, which says of itself that it never blocks), formats a file or provisions a worktree carries
 *      none and is not demanded a campaign; a guard that blocks a stop and is wired straight in the settings,
 *      not through a manifest, carries one. The helper is followed ONE import deep, and a declaration ends at
 *      the next statement that starts at column 0, so the rule reads formatted code: a helper re-exported
 *      through a second module, or written on one minified line with its neighbours, is not seen.
 *   2. NAMED FOR IT. A code file whose name has the segment `decide`, `decision`, `verdict` or `verdicts`
 *      (`decide.mjs`, `tree-verdicts.mjs`, `run-verdict.mjs`).
 *   3. DECLARED, in `declared-deciding.mjs`, with the reason: only for what none of the above can see (a
 *      landing verdict that is neither a hook nor named for it).
 *
 * A selftest or a campaign never decides, whatever lists it. A deciding module the runner cannot parse (it
 * parses JavaScript only) is reported as OUT OF REACH, since no campaign could ever mutate it.
 *
 * Copied byte for byte between `b100-am-ui/.claude/mutation-proof/` (the owner) and `~/.claude/mutation-proof/`;
 * only `declared-deciding.mjs` differs, because it names each repository's own modules.
 *
 * @es QUÉ ES UN MÓDULO QUE DECIDE — la única definición sobre la que descansa la exigencia de mutantes. Una
 * campaña prueba que el selftest se pone en rojo al romper una DECISIÓN, así que se exige donde la decisión es el
 * producto: un veredicto de permitir/denegar/bloquear, de aterrizaje o integración, o de gate. Tres reglas, en
 * orden, ESTRUCTURALES donde el árbol lo dice y DECLARADAS solo donde no: 1. ENTRADA DE HOOK que emite veredicto
 * (listada en un manifiesto de dispatcher o con sidecar `.hook-registration.json`, y una palabra del vocabulario
 * del harness en su fuente, o una llamada a un HELPER DE VEREDICTO: una función importada por nombre de un módulo
 * del repositorio cuya declaración exportada lleva esa palabra, como `deny()` de hook-io; se sigue UN import; un
 * hook que solo registra, formatea o provisiona no la lleva); 2. NOMBRADO así
 * (segmento `decide`, `decision`, `verdict`, `verdicts`); 3. DECLARADO en `declared-deciding.mjs`, con su
 * motivo. Un selftest o una campaña nunca decide. Un módulo que el corredor no sabe parsear (solo JavaScript)
 * sale como FUERA DE ALCANCE.
 */

import path from 'node:path';

import { isCampaignFile } from './campaign-plan.mjs';

/** The folder name that holds dispatcher manifests, at any depth. @es El nombre de carpeta de los manifiestos de dispatcher. */
const MANIFEST_FOLDER = 'hook-dispatch';

/** The suffix of the sidecar that says a file is wired as a hook. @es El sufijo del sidecar que dice que un fichero es un hook. */
const HOOK_SIDECAR_SUFFIX = '.hook-registration.json';

/**
 * The words a hook source holds when it emits a verdict to the harness: a `PreToolUse` decision, a `Stop` or
 * `SubagentStop` block, or the exit code that blocks. Literal text, never a pattern: a pattern that stops
 * matching reads as "nothing decides" and says nothing.
 * @es Las palabras que lleva la fuente de un hook que emite veredicto: decisión de `PreToolUse`, bloqueo de `Stop`, o la salida que bloquea.
 */
export const VERDICT_VOCABULARY = Object.freeze(['permissionDecision', "decision: 'block'", 'decision: "block"', 'exitCode = 2', 'process.exit(2)']);

/**
 * A static import of named bindings from a relative path: `import { a, b as c } from './x.mjs'`, on one line or
 * several. A bare specifier (`node:fs`, a package) is another repository's code and is never followed.
 * @es Un import estático de nombres desde una ruta relativa, en una línea o en varias; un especificador desnudo no se sigue.
 */
const NAMED_RELATIVE_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/gm;

/** The first line of an exported declaration, and the name it declares. @es La primera línea de una declaración exportada y el nombre que declara. */
const EXPORTED_DECLARATION = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/;

/** A line that starts at column 0: the next top-level statement, or the bracket that closes this one. @es Una línea en la columna 0: la siguiente sentencia de primer nivel, o el cierre de esta. */
const NEXT_STATEMENT = /^\S/;

const holdsVerdict = (text) => VERDICT_VOCABULARY.some((word) => text.includes(word));

/**
 * The names a module exports whose OWN declaration holds a verdict word: from the `export` line to the line
 * before the next top-level statement. A verdict word in a neighbouring declaration or in a comment above the
 * next one does not make every export a helper.
 * @param {string} source
 * @returns {Set<string>}
 * @es Los nombres exportados cuya PROPIA declaración lleva una palabra de veredicto, desde su `export` hasta la
 * siguiente sentencia de primer nivel.
 */
export function verdictHelpersOf(source) {
  const lines = source.split('\n');
  const helpers = new Set();

  for (const [at, line] of lines.entries()) {
    const declared = line.match(EXPORTED_DECLARATION);

    if (declared === null) continue;

    let end = at + 1;

    while (end < lines.length && !NEXT_STATEMENT.test(lines[end])) end += 1;

    if (holdsVerdict(lines.slice(at, end).join('\n'))) helpers.add(declared[1]);
  }

  return helpers;
}

/**
 * The verdict helpers a hook entry CALLS, as `name() of module` reasons: each name it imports from a module of
 * the repository that exports it as a helper, called under the local name it was bound to.
 * @es Los helpers de veredicto que una entrada de hook LLAMA: cada nombre importado de un módulo del repositorio
 * que lo exporta como helper, llamado con el nombre local con el que se ligó.
 */
function helperCallsOf(entry, source, present, readText) {
  const calls = [];

  for (const [, bindings, specifier] of source.matchAll(NAMED_RELATIVE_IMPORT)) {
    const helperModule = path.posix.normalize(path.posix.join(path.posix.dirname(entry), specifier));

    if (!present.has(helperModule)) continue;

    const helpers = verdictHelpersOf(readText(helperModule) ?? '');

    for (const binding of bindings.split(',')) {
      const [imported, local = imported] = binding.trim().split(/\s+as\s+/);

      if (helpers.has(imported) && new RegExp(`(?<![\\w$.])${local.replaceAll('$', '\\$')}\\s*\\(`).test(source)) calls.push(`${imported}() of ${helperModule}`);
    }
  }

  return calls;
}

/** The segments of a file name that say it decides. @es Los segmentos del nombre de un fichero que dicen que decide. */
const DECIDING_SEGMENTS = Object.freeze(['decide', 'decision', 'verdict', 'verdicts']);

/** The extensions of the files the mutants runner can parse, hence mutate. @es Las extensiones que el corredor sabe parsear. */
const MUTABLE_EXTENSIONS = new Set(['.mjs', '.cjs', '.js']);

/** Every extension of source code, mutable or not. @es Cada extensión de código fuente. */
const CODE_EXTENSIONS = new Set([...MUTABLE_EXTENSIONS, '.ts', '.mts', '.cts', '.tsx']);

/** True for the selftest and the campaign of a mechanism: they test decisions, they do not make them. @es Verdadero para el selftest y la campaña. */
function isTestingFile(file) {
  const name = path.posix.basename(file);

  return isCampaignFile(file) || name === 'selftest.mjs' || name.endsWith('.selftest.mjs') || name.endsWith('-selftest.mjs');
}

/** The segments of a file name, split on `-` and `.` (the extension is one more segment, and never a deciding word). @es Los segmentos del nombre, separados por `-` y `.`. */
function segmentsOf(file) {
  return path.posix
    .basename(file)
    .split('-')
    .flatMap((part) => part.split('.'));
}

/** The guards a manifest lists that live in this repository, as paths relative to the repository root. @es Las guardias de un manifiesto que viven en este repositorio. */
function guardsOf(manifest, parsed) {
  return parsed.guards
    .filter((guard) => typeof guard === 'string' && !guard.startsWith('~/'))
    .map((guard) => path.posix.normalize(path.posix.join(path.posix.dirname(manifest), guard)))
    .filter((guard) => !guard.startsWith('../'));
}

/**
 * @param {{ files: string[], readText: (file: string) => string | undefined, declared: { file: string, why: string }[] }} options
 *   `files` is every file of the repository, with `/` separators; `readText` its text, or `undefined` when unreadable
 * @returns {{ modules: Map<string, string[]>, outOfReach: Map<string, string[]>, problems: string[] }} each deciding
 *   module with the reasons it decides; the deciding files no campaign could mutate; and what could not be read
 * @es Los módulos que deciden con sus motivos, los que ninguna campaña podría mutar, y lo que no se pudo leer.
 */
export function decidingModules({ files, readText, declared }) {
  const present = new Set(files);
  const candidates = new Map();
  const problems = [];

  const add = (file, reason) => {
    if (isTestingFile(file)) return;

    candidates.set(file, [...(candidates.get(file) ?? []), reason]);
  };

  // The hook entries: every guard a manifest lists, and every file a sidecar declares as wired, each with the
  // manifests that dispatch it.
  // @es Las entradas de hook: cada guardia que lista un manifiesto y cada fichero que un sidecar declara cableado.
  const entries = new Map();

  for (const manifest of files.filter((file) => file.endsWith('.json') && file.split('/').includes(MANIFEST_FOLDER))) {
    let parsed;

    try {
      parsed = JSON.parse(readText(manifest) ?? '');
    } catch (error) {
      problems.push(`${manifest} does not parse, so the guards it dispatches are unknown: ${error instanceof Error ? error.message : String(error)} @es no parsea, así que se ignoran las guardias que despacha`);
      continue;
    }

    if (!Array.isArray(parsed?.guards)) continue;

    for (const guard of guardsOf(manifest, parsed)) {
      if (present.has(guard)) entries.set(guard, [...(entries.get(guard) ?? []), manifest]);
      else problems.push(`${manifest} dispatches ${guard}, which the repository does not hold @es despacha ${guard}, que el repositorio no tiene`);
    }
  }

  for (const sidecar of files.filter((file) => file.endsWith(HOOK_SIDECAR_SUFFIX))) {
    const entry = sidecar.slice(0, -HOOK_SIDECAR_SUFFIX.length);

    if (present.has(entry)) entries.set(entry, entries.get(entry) ?? []);
  }

  for (const [entry, manifests] of entries) {
    const source = readText(entry) ?? '';

    if (holdsVerdict(source)) add(entry, 'hook entry that emits a verdict');
    else {
      const calls = helperCallsOf(entry, source, present, readText);

      if (calls.length === 0) continue;

      add(entry, `hook entry that emits a verdict through ${calls.join(', ')}`);
    }

    for (const manifest of manifests) add(entry, `dispatched by ${manifest}`);
  }

  for (const file of files.filter((candidate) => CODE_EXTENSIONS.has(path.posix.extname(candidate)))) {
    const segment = segmentsOf(file).find((part) => DECIDING_SEGMENTS.includes(part));

    if (segment !== undefined) add(file, `named ${segment}`);
  }

  for (const declaration of declared) {
    const file = declaration?.file;

    if (typeof file !== 'string' || file.length === 0) problems.push('a declared deciding module names no file @es un módulo declarado no nombra fichero');
    else if (typeof declaration.why !== 'string' || declaration.why.trim().length === 0) problems.push(`${file} is declared deciding with no reason: the owner must be able to read why it is demanded @es declarado sin motivo`);
    else if (!present.has(file)) problems.push(`${file} is declared deciding but the repository does not hold it @es declarado pero el repositorio no lo tiene`);
    else if (isTestingFile(file)) problems.push(`${file} is declared deciding but it is a selftest or a campaign @es declarado pero es un selftest o una campaña`);
    else add(file, `declared: ${declaration.why}`);
  }

  const modules = new Map();
  const outOfReach = new Map();

  for (const [file, reasons] of candidates) (MUTABLE_EXTENSIONS.has(path.posix.extname(file)) ? modules : outOfReach).set(file, reasons);

  return { modules, outOfReach, problems };
}
