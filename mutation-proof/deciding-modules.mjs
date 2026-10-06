/**
 * WHAT A DECIDING MODULE IS — the one definition the mutation demand rests on.
 *
 * A mutants campaign proves that a selftest goes red when a DECISION is broken, so it is demanded where a
 * decision is the product: a module whose output is an allow/deny/block verdict, a landing or integration
 * verdict, or a gate verdict. A module that only formats, reads, renders or carries data keeps its selftest and
 * may keep a campaign, but nothing demands one. Four rules say which modules decide, in this order, each one
 * STRUCTURAL where the tree can tell and DECLARED only where it cannot:
 *
 *   1. DISPATCHED. A guard listed in a dispatcher manifest (a `.json` under a `hook-dispatch/` folder with a
 *      `guards` list): the dispatcher exists to merge the verdicts of exactly those modules.
 *   2. A HOOK ENTRY THAT EMITS A VERDICT. A file with a `<file>.hook-registration.json` beside it (the
 *      repositories' own way to say "this is wired as a hook") whose source holds a word of the harness's
 *      verdict vocabulary. A hook that formats a file or provisions a worktree carries none; one that blocks a
 *      stop and is wired straight in the settings, not through a manifest, carries one.
 *   3. NAMED FOR IT. A code file whose name has the segment `decide`, `decision`, `verdict` or `verdicts`
 *      (`decide.mjs`, `tree-verdicts.mjs`, `run-verdict.mjs`).
 *   4. DECLARED, in `declared-deciding.mjs`, with the reason: only for what none of the above can see (a
 *      landing verdict that is neither dispatched nor named for it).
 *
 * A selftest or a campaign never decides, whatever lists it. A deciding module the runner cannot parse (it
 * parses JavaScript only) is reported as OUT OF REACH, since no campaign could ever mutate it.
 *
 * Copied byte for byte between `b100-am-ui/.claude/mutation-proof/` (the owner) and `~/.claude/mutation-proof/`;
 * only `declared-deciding.mjs` differs, because it names each repository's own modules.
 *
 * @es QUÉ ES UN MÓDULO QUE DECIDE — la única definición sobre la que descansa la exigencia de mutantes. Una
 * campaña prueba que el selftest se pone en rojo al romper una DECISIÓN, así que se exige donde la decisión es el
 * producto: un veredicto de permitir/denegar/bloquear, de aterrizaje o integración, o de gate. Cuatro reglas, en
 * orden, ESTRUCTURALES donde el árbol lo dice y DECLARADAS solo donde no: 1. DESPACHADO por un manifiesto de
 * dispatcher; 2. ENTRADA DE HOOK que emite veredicto (sidecar `.hook-registration.json` y una palabra del
 * vocabulario del harness en su fuente); 3. NOMBRADO así (segmento `decide`, `decision`, `verdict`, `verdicts`);
 * 4. DECLARADO en `declared-deciding.mjs`, con su motivo. Un selftest o una campaña nunca decide. Un módulo
 * que el corredor no sabe parsear (solo JavaScript) sale como FUERA DE ALCANCE.
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
      if (present.has(guard)) add(guard, `dispatched by ${manifest}`);
      else problems.push(`${manifest} dispatches ${guard}, which the repository does not hold @es despacha ${guard}, que el repositorio no tiene`);
    }
  }

  for (const sidecar of files.filter((file) => file.endsWith(HOOK_SIDECAR_SUFFIX))) {
    const entry = sidecar.slice(0, -HOOK_SIDECAR_SUFFIX.length);

    if (present.has(entry) && VERDICT_VOCABULARY.some((word) => (readText(entry) ?? '').includes(word))) add(entry, 'hook entry that emits a verdict');
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
