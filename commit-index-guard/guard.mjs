#!/usr/bin/env node
/**
 * `PostToolUse` guard on Bash AND PowerShell — commit-index-guard, the AFTER half. After a successful
 * `git commit` that named a pathspec (`-- <paths>`, or the paths of `-o`/`--only`), it checks THOSE paths with
 * one bounded `git status` call. A path whose index differs from its worktree, or whose staged content differs
 * from HEAD, was rewritten by a hook after the commit (`lint-staged`: `eslint --fix`, `prettier`): the agent is
 * told, in both languages, which paths and the exact next step. It never discards anything and it never decides
 * about the command: the commit already ran. The stale paths are recorded per repository so the BEFORE half
 * (`pre-commit.mjs`) can refuse a commit that would sweep them in.
 *
 * The harness runs `PostToolUse` only for a command that succeeded (measured with a live probe on 2026-10-25:
 * a `git` call exiting 1 produced no `PostToolUse` payload at all), so a commit that failed is not judged. A
 * line chaining a failed commit before a command that succeeds is the one case it cannot tell apart; the
 * notice says to review, never to discard, so that case costs one read.
 *
 * FAILS OPEN on everything: a git error or a timeout is journaled (`errors.jsonl`) and the command goes on.
 *
 * @es Guardia `PostToolUse` sobre Bash y PowerShell, la mitad de DESPUÉS. Tras un `git commit` exitoso que
 * nombró pathspec, revisa ESAS rutas con una llamada acotada a `git status`. Una ruta cuyo índice difiere del
 * árbol de trabajo, o cuyo contenido en stage difiere de HEAD, la reescribió un hook tras el commit: se avisa,
 * en los dos idiomas, qué rutas y el siguiente paso exacto. Nunca descarta nada ni decide sobre el comando. Las
 * rutas se registran por repositorio para que la mitad de ANTES (`pre-commit.mjs`) rechace un commit que las
 * arrastraría. El harness corre `PostToolUse` solo si el comando salió bien (sonda en vivo, 2026-10-25). FALLA
 * ABIERTO: un error de git o un tiempo agotado se registra en `errors.jsonl` y el comando sigue.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { commitsOf, parsePayload } from './commits.mjs';
import { journalError } from './diary.mjs';
import { indexEntries, repositoryTop, runGit } from './index-state.mjs';
import { noticeText } from './messages.mjs';
import { recordStale } from './stale-store.mjs';

/** The commits that named paths and really committed, grouped by the directory they ran in. @es Los commits que nombraron rutas, agrupados por directorio. */
function namedPathsByDirectory(payload) {
  const byDirectory = new Map();

  for (const commit of commitsOf(payload)) {
    if (commit.dryRun || commit.paths.length === 0) continue;

    if (commit.directory === undefined) {
      journalError({ step: 'directory', reason: `the line's cd could not be followed: ${commit.text} @es no se pudo seguir el cd de la línea: ${commit.text}` });
      continue;
    }

    byDirectory.set(commit.directory, [...(byDirectory.get(commit.directory) ?? []), ...commit.paths]);
  }

  return byDirectory;
}

/** The stale entries of one directory's committed paths, recorded for the next commit; `[]` when none or git did not answer. @es Las rutas desactualizadas de un directorio. */
function staleIn(directory, paths, git) {
  const measured = indexEntries(paths, { cwd: directory, git });

  if (!measured.ok) {
    journalError({ step: 'status', cwd: directory, reason: measured.reason });
    return [];
  }

  if (measured.entries.length === 0) return [];

  const top = repositoryTop(directory, { git });

  if (!top.ok) journalError({ step: 'rev-parse', cwd: directory, reason: top.reason });
  else recordStale(top.toplevel, measured.entries);

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
