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
 *   - `git commit -- <other paths>`, `--pathspec-from-file` and `-o`/`--only` (with or without paths) commit only
 *     what they name and ignore the rest of the index: the stale variant cannot ride along, so they pass;
 *   - `git commit -a` re-stages every tracked path from the worktree first, which settles the variant: it passes;
 *   - a commit with NO pathspec, with `--include` (also with `--pathspec-from-file`: git then commits the whole
 *     index too), or whose pathspec file names no path, commits the index as it is: it is refused unless it names
 *     every stale path (a named path takes the worktree content, which settles it). The entries of a pathspec
 *     file are read before the command runs; a file that cannot be read is journaled and the commit passes;
 *   - the recorded paths are MEASURED again before a refusal, and a path is stale only while its index entry is
 *     still the SAME BLOB the guard recorded and both columns still differ. A `git add` of the whole file or of
 *     one hunk (`git add -p`, `git apply --cached`) changes the blob and settles the path at once; a path
 *     moved with `git mv` is followed to its new name: when a recorded path shows as removed from the index, one
 *     more whole-repository `git status` (with `--find-renames`) is read and the stale blob is looked for under
 *     another name, because git's own rename detection compares content and misses a small file. It is followed
 *     only when EXACTLY ONE other path holds that blob and is not itself a stale path already; with none, or with
 *     several, the record keeps the entry under its old name and the path is no reason to refuse. When that
 *     whole-repository read fails, the record is left exactly as it was.
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
 * rutas>`, `--pathspec-from-file` y `-o`/`--only` (con o sin rutas) solo commitean lo que nombran y el resto del
 * índice se ignora (pasan); `-a` vuelve a poner en stage las rutas rastreadas desde el árbol de trabajo (pasa);
 * un commit SIN pathspec, con `--include` (también con `--pathspec-from-file`: git commitea entonces todo el
 * índice), o cuyo fichero de pathspec no nombra ruta alguna, commitea el índice tal cual y se rechaza salvo que
 * nombre cada ruta desactualizada. Las entradas de un fichero de pathspec se leen antes de que corra el comando;
 * uno ilegible se registra y el commit pasa. Las rutas registradas se MIDEN de nuevo antes de rechazar, y una ruta está desactualizada solo
 * mientras su entrada del índice sea el MISMO BLOB registrado y las dos columnas sigan difiriendo: un `git add`
 * del fichero entero o de un hunk (`git add -p`, `git apply --cached`) cambia el blob y la resuelve al instante;
 * una ruta movida con `git mv` se sigue hasta su nombre nuevo: cuando una ruta registrada aparece quitada del
 * índice se lee un `git status` más del repositorio entero (con `--find-renames`) y se busca el blob viejo bajo
 * otro nombre, porque la detección de renombrados de git compara contenido y no ve un fichero pequeño. Se sigue
 * solo si EXACTAMENTE UNA otra ruta guarda ese blob y no es ya una ruta desactualizada; con ninguna, o con
 * varias, el registro conserva la entrada con su nombre viejo y esa ruta no es motivo de negativa. Si esa lectura
 * del repositorio entero falla, el registro queda exactamente como estaba. Toda ruta resuelta sale del registro, y una ruta registrada se
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
import { readPathspecFile } from './pathspec-file.mjs';
import { anyRecorded, comparable, recordedStale, retainStale } from './stale-store.mjs';

/**
 * Whether a commit takes the index as it is: it names no path (an empty pathspec file included), or it has
 * `--include`; `--all`, `--only` and `--dry-run` never do. `commit.paths` already holds the entries of a pathspec file.
 * @es Si un commit toma el índice tal cual: no nombra ninguna ruta (un fichero de pathspec vacío incluido) o lleva `--include`; `--all`, `--only` y `--dry-run` nunca. `commit.paths` ya trae las entradas del fichero de pathspec.
 */
const sweepsTheIndex = (commit) => !commit.dryRun && !commit.all && !commit.only && (commit.paths.length === 0 || commit.include);

/**
 * The paths a commit names: its pathspec, or the entries of its pathspec file (which exists before the command
 * runs). `undefined` when the file cannot be read: the commit cannot be judged, the reason is journaled.
 * @es Las rutas que nombra un commit: su pathspec o las entradas de su fichero de pathspec. `undefined` si no se puede leer.
 */
function namedPathsOf(commit) {
  if (commit.pathspecFile === undefined) return commit.paths;

  const fromFile = readPathspecFile({ file: commit.pathspecFile, directory: commit.directory, nul: commit.pathspecNul });

  if (fromFile.ok) return fromFile.paths;

  journalError({ step: 'pathspec-file', reason: fromFile.reason });

  return undefined;
}

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

/**
 * Where the recorded paths that went missing from the index now are: a move resolves only when EXACTLY ONE other
 * path holds the stale blob and is not already one of the `retained` stale paths. With none, or with several
 * (identical content cannot tell which one is the moved file), the recorded entry is `unresolved`: it stays in
 * the record under its old name and is not a reason to refuse. `undefined` when the whole-repository read fails.
 * @es Dónde están ahora las rutas registradas que faltan en el índice: un movimiento se resuelve solo si EXACTAMENTE UNA otra ruta guarda el blob viejo y no es ya una de las `retained`. Con ninguna, o con varias, la entrada queda `unresolved` en el registro con su nombre viejo y no es motivo de negativa. `undefined` si falla la lectura del repositorio entero.
 */
function followedMoves(moved, retained, toplevel, git) {
  const everything = repositoryEntries({ cwd: toplevel, git });

  if (!everything.ok) {
    journalError({ step: 'status', cwd: toplevel, reason: everything.reason });
    return undefined;
  }

  const taken = new Set(retained.map((entry) => entry.path));
  const followed = [];
  const unresolved = [];

  for (const recorded of moved) {
    const candidates = everything.entries.filter((entry) => !taken.has(entry.path) && isRecordedVariant(entry, recorded));

    if (candidates.length === 1) followed.push({ ...recorded, path: candidates[0].path, code: candidates[0].code });
    else unresolved.push(recorded);
  }

  return { followed, unresolved };
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

  let unresolved = [];

  if (moved.length > 0) {
    const moves = followedMoves(moved, still, toplevel, git);

    if (moves === undefined) return still;

    still.push(...moves.followed);
    unresolved = moves.unresolved;
  }

  retainStale(toplevel, [...still, ...unresolved]);

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

    const judged = commitsOf(payload).flatMap((commit) => {
      const paths = namedPathsOf(commit);

      return paths === undefined ? [] : [{ ...commit, paths }];
    });

    for (const commit of judged.filter(sweepsTheIndex)) {
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
