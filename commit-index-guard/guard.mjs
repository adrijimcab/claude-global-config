#!/usr/bin/env node
/**
 * `PostToolUse` guard on Bash AND PowerShell — commit-index-guard, the AFTER half. After a successful
 * `git commit` that named a pathspec (`-- <paths>`, the paths of `-o`/`--only`, or the entries of a
 * `--pathspec-from-file`), it checks THOSE paths with one bounded `git status` call. A path whose index differs
 * from its worktree, or whose staged content differs from HEAD, was rewritten by a hook after the commit
 * (`lint-staged`: `eslint --fix`, `prettier`): the agent is told, in both languages, which paths and the exact
 * next step. It never discards anything and it never decides about the command: the commit already ran.
 *
 * WHAT IT RECORDS. The paths where the index holds a variant that is neither HEAD nor the worktree (`MM`) are
 * ADDED to the record of their repository with the blob id of that stale index entry, so the BEFORE half
 * (`pre-commit.mjs`) can refuse a commit that would sweep them in. Recording merges with what is already there
 * and never replaces it. Finding the repository root costs one more bounded call (`git rev-parse`), made only
 * when something is to be recorded.
 *
 * The harness runs `PostToolUse` only for a command that succeeded (measured with a live probe on 2026-10-25:
 * a `git` call exiting 1 produced no `PostToolUse` payload at all), so a commit that failed is not judged. A
 * line chaining a failed commit before a command that succeeds is the one case it cannot tell apart; the
 * notice says to review, never to discard, so that case costs one read.
 *
 * FAILS OPEN on everything: a git error, a timeout or an unreadable pathspec file is journaled
 * (`errors.jsonl`) and the command goes on.
 *
 * @es Guardia `PostToolUse` sobre Bash y PowerShell, la mitad de DESPUÉS. Tras un `git commit` exitoso que
 * nombró pathspec (`-- <rutas>`, las rutas de `-o`/`--only` o las entradas de un `--pathspec-from-file`), revisa
 * ESAS rutas con una llamada acotada a `git status`. Una ruta cuyo índice difiere del árbol de trabajo, o cuyo
 * contenido en stage difiere de HEAD, la reescribió un hook tras el commit: se avisa, en los dos idiomas, qué
 * rutas y el siguiente paso exacto. Nunca descarta nada ni decide sobre el comando. QUÉ REGISTRA: las rutas
 * donde el índice guarda una variante que no es ni HEAD ni el árbol de trabajo (`MM`) se AÑADEN al registro de
 * su repositorio con el blob de esa entrada vieja del índice, para que la mitad de ANTES (`pre-commit.mjs`)
 * rechace un commit que las arrastraría; registrar se funde con lo que hay y nunca lo reemplaza. Hallar la raíz
 * del repositorio cuesta una llamada acotada más (`git rev-parse`), solo cuando hay algo que registrar. El
 * harness corre `PostToolUse` solo si el comando salió bien (sonda en vivo, 2026-10-25). FALLA ABIERTO: un error
 * de git, un tiempo agotado o un fichero de pathspec ilegible se registra en `errors.jsonl` y el comando sigue.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { commitsOf, parsePayload } from './commits.mjs';
import { journalError } from './diary.mjs';
import { indexDisagreesWithBoth, indexEntries, repositoryTop, runGit } from './index-state.mjs';
import { noticeText } from './messages.mjs';
import { readPathspecFile } from './pathspec-file.mjs';
import { recordStale } from './stale-store.mjs';

/** The paths one commit named: its pathspec, or the entries of its pathspec file (git accepts only one of the two); an unreadable file is journaled. @es Las rutas que nombró un commit. */
function pathsOf(commit) {
  if (commit.pathspecFile === undefined) return commit.paths;

  const fromFile = readPathspecFile({ file: commit.pathspecFile, directory: commit.directory, nul: commit.pathspecNul });

  if (fromFile.ok) return fromFile.paths;

  journalError({ step: 'pathspec-file', reason: fromFile.reason });

  return commit.paths;
}

/** The commits that named paths and really committed, grouped by the directory they ran in. @es Los commits que nombraron rutas, agrupados por directorio. */
function namedPathsByDirectory(payload) {
  const byDirectory = new Map();

  for (const commit of commitsOf(payload)) {
    if (commit.dryRun) continue;

    if (commit.directory === undefined) {
      journalError({ step: 'directory', reason: `the line's cd could not be followed: ${commit.text} @es no se pudo seguir el cd de la línea: ${commit.text}` });
      continue;
    }

    const paths = pathsOf(commit);

    if (paths.length > 0) byDirectory.set(commit.directory, [...(byDirectory.get(commit.directory) ?? []), ...paths]);
  }

  return byDirectory;
}

/** The stale entries of one directory's committed paths; the `MM` ones are recorded for the next commit. `[]` when none or git did not answer. @es Las rutas desactualizadas de un directorio. */
function staleIn(directory, paths, git) {
  const measured = indexEntries(paths, { cwd: directory, git });

  if (!measured.ok) {
    journalError({ step: 'status', cwd: directory, reason: measured.reason });
    return [];
  }

  const sweepHazards = measured.entries.filter(indexDisagreesWithBoth);

  if (sweepHazards.length === 0) return measured.entries;

  const top = repositoryTop(directory, { git });

  if (!top.ok) journalError({ step: 'rev-parse', cwd: directory, reason: top.reason });
  else recordStale(top.toplevel, sweepHazards);

  return measured.entries;
}

/**
 * The hook output for a raw payload, or `undefined` when there is nothing to say. Exported for the dispatcher.
 * @param git Replaces the git port (a test seam). @es Sustituye el puerto de git (punto de prueba).
 * @es La salida de hook para un payload crudo, o `undefined` si no hay nada que decir.
 */
export function evaluate(raw, { git = runGit } = {}) {
  const payload = parsePayload(raw);

  if (payload === undefined) return undefined;

  try {
    const stale = [];

    for (const [directory, paths] of namedPathsByDirectory(payload)) stale.push(...staleIn(directory, paths, git));

    if (stale.length === 0) return undefined;

    return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: noticeText(stale) } };
  } catch (error) {
    journalError({ step: 'evaluate', reason: `${error instanceof Error ? error.message : String(error)}` });

    return undefined;
  }
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));
}

const isEntryPoint = () => {
  try {
    return process.argv[1] !== undefined && realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isEntryPoint()) main();
