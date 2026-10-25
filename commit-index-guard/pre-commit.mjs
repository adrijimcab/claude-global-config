#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash AND PowerShell — commit-index-guard, the BEFORE half. It refuses a `git commit`
 * that would sweep the whole index while paths a hook rewrote after an earlier commit (recorded by `guard.mjs`)
 * are still stale in it: the index holds a variant that is neither HEAD nor the worktree (`MM`).
 *
 * THE DECISION, and why it refuses at all. A notice after the commit is advice; the three measured incidents
 * (Discovery, 2026-10-19 and after, the last in the table-filter worktree) were each an agent that SAW `MM` and
 * committed on. Memory is not enforcement (`memory-used-where-a-hook-must-enforce`), so the next commit is
 * judged. It is judged NARROWLY, by what git does:
 *   - `git commit -- <other paths>` and `-o` commit only those paths and ignore the rest of the index: the stale
 *     variant cannot ride along, so it passes;
 *   - `git commit -a` re-stages every tracked path from the worktree first, which settles the variant: it passes;
 *   - a commit with NO pathspec, or with `--include`, commits the index as it is: it is refused unless it names
 *     every stale path (a named path takes the worktree content, which settles it);
 *   - the recorded paths are MEASURED again before a refusal, so a `git add` that settled them lifts it at once
 *     and an old record is never trusted over the live index.
 * It refuses only on a measured `MM`-class disagreement (staged AND worktree both differ), not on an ordinary
 * staged change, so a deliberate `git add` + `git commit` is never in its way.
 *
 * FAILS OPEN on everything: a git error or a timeout is journaled (`errors.jsonl`) and the commit goes on.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell, la mitad de ANTES. Rechaza un `git commit` que arrastraría
 * todo el índice mientras rutas que un hook reescribió tras un commit anterior (registradas por `guard.mjs`)
 * siguen desactualizadas en él (`MM`). POR QUÉ RECHAZA: los tres incidentes medidos fueron un agente que VIO
 * `MM` y siguió; la memoria no es cumplimiento, así que se juzga el siguiente commit, y de forma ESTRECHA según
 * lo que hace git: `-- <otras rutas>` y `-o` solo commitean esas rutas y el resto del índice se ignora (pasa);
 * `-a` vuelve a poner en stage las rutas rastreadas desde el árbol de trabajo (pasa); un commit SIN pathspec,
 * o con `--include`, commitea el índice tal cual y se rechaza salvo que nombre cada ruta desactualizada. Las
 * rutas registradas se MIDEN de nuevo antes de rechazar, y solo rechaza un desacuerdo medido de clase `MM`.
 * FALLA ABIERTO: un error de git o un tiempo agotado se registra y el commit sigue.
 */

import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { commitsOf, parsePayload } from './commits.mjs';
import { journalError, journalRefusal } from './diary.mjs';
import { indexDisagreesWithBoth, indexEntries, repositoryTop, runGit } from './index-state.mjs';
import { refusalText } from './messages.mjs';
import { anyRecorded, clearStale, comparable, recordStale, recordedStale } from './stale-store.mjs';

/** Whether a commit takes the index as it is: no pathspec, or `--include`; `--all` and `--dry-run` never do. @es Si un commit toma el índice tal cual. */
const sweepsTheIndex = (commit) => !commit.dryRun && !commit.all && (commit.paths.length === 0 || commit.include);

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

/** The recorded paths of `toplevel` that are STILL stale, measured now; settled records are forgotten. @es Las rutas registradas que SIGUEN desactualizadas, medidas ahora. */
function stillStale(toplevel, git) {
  const recorded = recordedStale(toplevel);

  if (recorded.length === 0) return [];

  const measured = indexEntries(recorded.map((entry) => entry.path), { cwd: toplevel, git });

  if (!measured.ok) {
    journalError({ step: 'status', cwd: toplevel, reason: measured.reason });
    return [];
  }

  const still = measured.entries.filter(indexDisagreesWithBoth);

  if (still.length === 0) clearStale(toplevel);
  else recordStale(toplevel, still);

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
