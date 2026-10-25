#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash AND PowerShell — commit-index-guard, the BEFORE half. It refuses a `git commit`
 * that would sweep the whole index while paths a hook rewrote after an earlier commit (recorded by `guard.mjs`)
 * still hold the stale variant in it: the index entry is neither HEAD nor the worktree (`MM`).
 *
 * THE DECISION, and why it refuses at all. A notice after the commit is advice; the three measured incidents
 * (Discovery, 2026-10-19 and after, the last in the table-filter worktree) were each an agent that SAW `MM` and
 * committed on. Memory is not enforcement (`memory-used-where-a-hook-must-enforce`), so the next commit is
 * judged. It is judged NARROWLY, by what git does:
 *   - `git commit -- <other paths>`, `-o`/`--only` (with or without paths) and `--pathspec-from-file` commit only
 *     what they name and ignore the rest of the index: the stale variant cannot ride along, so they pass;
 *   - `git commit -a` re-stages every tracked path from the worktree first, which settles the variant: it passes;
 *   - a commit with NO pathspec, or with `--include`, commits the index as it is: it is refused unless it names
 *     every stale path (a named path takes the worktree content, which settles it);
 *   - the recorded paths are MEASURED again before a refusal, and a path is stale only while its index entry is
 *     still the SAME BLOB the guard recorded and both columns still differ. A `git add` of the whole file or of
 *     one hunk (`git add -p`, `git apply --cached`) changes the blob and settles the path at once; a path
 *     moved with `git mv` is followed to its new name: when a recorded path shows as removed from the index, one
 *     more whole-repository `git status` (with `--find-renames`) is read and the stale blob is looked for under
 *     another name, because git's own rename detection compares content and misses a small file.
 * Every settled path leaves the record. A recorded path is also forgotten seven days after it was FIRST seen,
 * whatever else happened (`stale-store.mjs`). It refuses only on a measured `MM`-class disagreement, never on an
 * ordinary staged change, so a deliberate `git add` + `git commit` is never in its way.
 *
 * FAILS OPEN on everything: a git error or a timeout is journaled (`errors.jsonl`) and the commit goes on.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell, la mitad de ANTES. Rechaza un `git commit` que arrastraría
 * todo el índice mientras rutas que un hook reescribió tras un commit anterior (registradas por `guard.mjs`)
 * aún guardan en él la variante vieja: la entrada del índice no es ni HEAD ni el árbol de trabajo (`MM`).
 * POR QUÉ RECHAZA: los tres incidentes medidos fueron un agente que VIO `MM` y siguió; la memoria no es
 * cumplimiento, así que se juzga el siguiente commit, y de forma ESTRECHA según lo que hace git: `-- <otras
 * rutas>`, `-o`/`--only` (con o sin rutas) y `--pathspec-from-file` solo commitean lo que nombran y el resto del
 * índice se ignora (pasan); `-a` vuelve a poner en stage las rutas rastreadas desde el árbol de trabajo (pasa);
 * un commit SIN pathspec, o con `--include`, commitea el índice tal cual y se rechaza salvo que nombre cada ruta
 * desactualizada. Las rutas registradas se MIDEN de nuevo antes de rechazar, y una ruta está desactualizada solo
 * mientras su entrada del índice sea el MISMO BLOB registrado y las dos columnas sigan difiriendo: un `git add`
 * del fichero entero o de un hunk (`git add -p`, `git apply --cached`) cambia el blob y la resuelve al instante;
 * una ruta movida con `git mv` se sigue hasta su nombre nuevo: cuando una ruta registrada aparece quitada del
 * índice se lee un `git status` más del repositorio entero (con `--find-renames`) y se busca el blob viejo bajo
 * otro nombre, porque la detección de renombrados de git compara contenido y no ve un fichero pequeño. Toda ruta resuelta sale del registro, y una ruta registrada se
 * olvida siete días después de verla POR PRIMERA VEZ. Solo rechaza un desacuerdo medido de clase `MM`.
 * FALLA ABIERTO: un error de git o un tiempo agotado se registra y el commit sigue.
 */

import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { commitsOf, parsePayload } from './commits.mjs';
import { journalError, journalRefusal } from './diary.mjs';
import { indexDisagreesWithBoth, indexEntries, repositoryEntries, repositoryTop, runGit } from './index-state.mjs';
import { refusalText } from './messages.mjs';
import { anyRecorded, comparable, recordedStale, retainStale } from './stale-store.mjs';

/** Whether a commit takes the index as it is: no pathspec, or `--include`; `--all`, `--only`, a pathspec file and `--dry-run` never do. @es Si un commit toma el índice tal cual. */
const sweepsTheIndex = (commit) => !commit.dryRun && !commit.all && !commit.only && commit.pathspecFile === undefined && (commit.paths.length === 0 || commit.include);

/**
 * `candidate` with its DIRECTORY resolved through the file system, so a Windows 8.3 short name, a junction or a
 * drive-letter case spells the same as the long path git prints; a path whose directory is gone keeps its spelling.
 * @es `candidate` con su DIRECTORIO resuelto por el sistema de ficheros, para que un nombre corto 8.3 o un junction se escriban igual que la ruta larga de git.
 */
function canonical(candidate) {
  try {
    return path.join(realpathSync.native(path.dirname(candidate)), path.basename(candidate));
  } catch {
    return candidate;
  }
}

/** Whether `named` (relative to `directory`) covers the repository path `entryPath` (relative to `toplevel`). @es Si `named` cubre la ruta del repositorio `entryPath`. */
function covers({ directory, named, toplevel, entryPath }) {
  const given = comparable(canonical(path.resolve(directory, named)));
  const entry = comparable(path.resolve(toplevel, entryPath));

  return entry === given || entry.startsWith(`${given}/`);
}

/** Whether a live entry is the recorded stale variant: the same index blob, and both columns still differ. @es Si una entrada viva es la variante vieja registrada. */
const isRecordedVariant = (live, recorded) => live.blob === recorded.blob && indexDisagreesWithBoth(live);

/** The recorded paths that were moved with their stale blob, under their new names. @es Las rutas registradas que se movieron, con su nombre nuevo. */
function followedMoves(moved, toplevel, git) {
  const everything = repositoryEntries({ cwd: toplevel, git });

  if (!everything.ok) {
    journalError({ step: 'status', cwd: toplevel, reason: everything.reason });
    return [];
  }

  return moved.flatMap((recorded) => {
    const target = everything.entries.find((entry) => isRecordedVariant(entry, recorded));

    return target === undefined ? [] : [{ ...recorded, path: target.path, code: target.code }];
  });
}

/** The recorded paths of `toplevel` that are STILL stale, measured now; the record is cut to them. @es Las rutas registradas que SIGUEN desactualizadas, medidas ahora. */
function stillStale(toplevel, git) {
  const recorded = recordedStale(toplevel);

  if (recorded.length === 0) return [];

  const measured = indexEntries(recorded.map((entry) => entry.path), { cwd: toplevel, git });

  if (!measured.ok) {
    journalError({ step: 'status', cwd: toplevel, reason: measured.reason });
    return [];
  }

  const live = new Map(measured.entries.map((entry) => [entry.path, entry]));
  const still = [];
  const moved = [];

  for (const entry of recorded) {
    const now = live.get(entry.path);

    if (now === undefined) continue;
    if (isRecordedVariant(now, entry)) still.push({ ...entry, code: now.code });
    else if (now.code[0] === 'D') moved.push(entry);
  }

  if (moved.length > 0) still.push(...followedMoves(moved, toplevel, git));

  retainStale(toplevel, still);

  return still;
}

/** The stale entries one sweeping commit would carry in, or `[]`. @es Las rutas desactualizadas que arrastraría un commit. */
function carriedIn(commit, git) {
  if (commit.directory === undefined) return [];

  const top = repositoryTop(commit.directory, { git });

  if (!top.ok) {
    journalError({ step: 'rev-parse', cwd: commit.directory, reason: top.reason });
    return [];
  }

  return stillStale(top.toplevel, git).filter((entry) => !commit.paths.some((named) => covers({ directory: commit.directory, named, toplevel: top.toplevel, entryPath: entry.path })));
}

/**
 * The hook output for a raw payload, or `undefined` to allow. Exported for the dispatcher. Fails open.
 * @param git Replaces the git port (a test seam). @es Sustituye el puerto de git (punto de prueba).
 * @es La salida de hook para un payload crudo, o `undefined` para permitir. Falla abierto.
 */
export function evaluate(raw, { git = runGit } = {}) {
  const payload = parsePayload(raw);

  if (payload === undefined) return undefined;

  try {
    if (!anyRecorded()) return undefined;

    for (const commit of commitsOf(payload).filter(sweepsTheIndex)) {
      const carried = carriedIn(commit, git);

      if (carried.length === 0) continue;

      journalRefusal({ session: payload.session_id, tool: payload.tool_name, paths: carried.map((entry) => entry.path) });

      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: refusalText(carried) } };
    }
  } catch (error) {
    journalError({ step: 'evaluate', reason: `${error instanceof Error ? error.message : String(error)}` });
  }

  return undefined;
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
