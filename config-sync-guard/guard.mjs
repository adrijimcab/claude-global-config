#!/usr/bin/env node
/**
 * `Stop` hook — config-sync-guard. A turn may not end while either declared backup repo
 * (`repos.mjs`) has unpushed commits or uncommitted work not attributable to a currently-live agent.
 *
 * Owner directive, verbatim: «Todas las modificaciones de agents, claude reglas hooks gates, a parte de
 * implementarlas, se dejan subidas al repo directamente … crear otra regla para ello»
 * (`~/.claude/rules/00-owner-mandates.md`, "Config de agentes versionada y subida en el momento"). The
 * rule this hook enforces applies to the AUTHOR of this hook too — see its own commit history.
 *
 * THE DECISION lives in `decide.mjs`, pure and dependency-injected (`selftest.mjs` exercises the whole
 * state space without a live fleet or a real git repo). This file is the thin shim: stdin -> `decide()`
 * -> stdout, plus a journal so a real refusal is auditable evidence.
 *
 * BOUNDED the same way every sibling Stop guard in this fleet is bounded: `stop_hook_active` limits it
 * to once per turn; any malfunction of its own exits 0 and lets the turn end; a DISMISS path
 * (`dismiss.mjs`) records a stated reason for a false positive — SCOPED to a fingerprint of the exact
 * state dismissed (`fingerprint.mjs`), so it excuses only THAT state and re-blocks the instant anything
 * changes (see `decide.mjs`'s own docblock for the gap this closed).
 *
 * @es Hook `Stop` — config-sync-guard. Un turno no puede terminar mientras algún repo de respaldo
 * declarado tenga commits sin subir o cambios sin commitear no atribuibles a un agente vivo. La
 * decisión vive en `decide.mjs`, pura e inyectable. Este fichero es el conducto fino. Acotado igual que
 * toda guardia `Stop` hermana de esta flota. Un descarte queda ACOTADO a la huella del estado exacto
 * que se descartó, y vuelve a bloquear en cuanto algo cambia.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { pathspecCommitCommand } from './commit-advice.mjs';
import { decide } from './decide.mjs';
import { isLandingRepo, landAdvice, landAheadAdvice } from './land-advice.mjs';
import { recordUnexplained } from './pending-ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('config-sync-guard');
const refusalsFile = () => path.join(stateDirectory(), 'refusals.jsonl');
const DISMISS_CLI = path.join(HERE, 'dismiss.mjs');

/** Appends one line, or gives up silently: a journal that cannot be written costs evidence, never a decision. @es Añade una línea o desiste en silencio. */
function journal(record) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(refusalsFile(), `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    /* a journal is evidence, never a precondition */
  }
}

/** `absolutePath` relative to `repo`'s worktree with forward slashes: how git names it. @es La ruta relativa al worktree con `/`, como la nombra git. */
const relativeTo = (repo, absolutePath) => path.relative(repo.worktree, absolutePath).replaceAll('\\', '/');

/** One repo's finding, formatted for the block message. @es El hallazgo de un repo, formateado para el mensaje de bloqueo. */
function repoFindingText({ repo, unownedAhead, unownedCommits, ownPaths, workerOutput }) {
  const lines = [`  ${repo.name} (${repo.worktree}):`];

  if (unownedAhead > 0) {
    lines.push(`    - ${String(unownedAhead)} commit(s) ahead of its remote, none owned by a live agent of another session:`);
    for (const commit of unownedCommits) lines.push(`        ${commit.hash} ${commit.subject}${commit.writers.length > 0 ? `  (paths also written by live agent(s): ${commit.writers.join(', ')})` : ''}`);
    lines.push(isLandingRepo(repo) ? `      ${landAheadAdvice(repo)}` : `      PUSH only commits you authored and verified: ${repo.pushCommand} — never another actor's.`);
  }

  if (ownPaths.length > 0) {
    lines.push(`    - ${String(ownPaths.length)} uncommitted path(s) this session made (written by it, or changed during one of its shell calls):`);
    for (const absolutePath of ownPaths.slice(0, 20)) lines.push(`        ${absolutePath}`);
    if (ownPaths.length > 20) lines.push(`        … and ${String(ownPaths.length - 20)} more`);
    for (const output of workerOutput) lines.push(`      ${relativeTo(repo, output.path)} is the output of your finished worker ${output.workers.join(', ')}: review it, then commit it with a pathspec or discard it deliberately.`);
    const ownRelativePaths = ownPaths.map((absolutePath) => relativeTo(repo, absolutePath));

    lines.push(isLandingRepo(repo) ? `      ${landAdvice(repo, ownRelativePaths)}` : `      COMMIT: ${pathspecCommitCommand(repo.gitPrefix, ownRelativePaths)}`);
  }

  return lines.join('\n');
}

/** The hook output that blocks the turn. @es La salida de hook que bloquea el turno. */
function blockOutput(dirtyRepos, sessionId) {
  const context = [
    'CONFIG-SYNC-GUARD TRIPPED: a declared backup repo is out of sync.',
    '',
    'Owner directive: every modification of agents/rules/hooks/gates is committed AND pushed the SAME',
    "turn it is made, for BOTH backup repos. This turn ends with at least one repo not matching that —",
    'measured just now, not assumed:',
    '',
    ...dirtyRepos.map(repoFindingText),
    '',
    'Only what THIS session made is listed: paths it wrote, that changed during one of its shell calls, or',
    'that its finished workers wrote (path-ownership.mjs). Other sessions\' work never blocks you. A path attributed here by timing may',
    'still be a coincidence — verify it before committing. Do exactly ONE of these, then stop again:',
    '',
    '  A) COMMIT (commit repo) OR LAND (landing repo) WHAT IS YOURS (default) — the exact route is listed above per',
    '     repo: a commit repo gets a commit-and-push command that names the listed paths explicitly and never',
    '     sweeps the shared index; a landing repo gets a land.mjs route and never a direct commit.',
    '',
    '  B) DISMISS IT, with a reason that gets written down (not a silent escape). The dismissal is',
    '     scoped to the EXACT state measured right now (ahead count + a content hash of the whole',
    '     worktree) — any later change (a new path, an edited byte, a different ahead count) produces',
    '     a different fingerprint and re-blocks automatically:',
    '',
    `       node "${DISMISS_CLI}" --session ${sessionId} --repo "<repo name>" \\`,
    '         --reason "why this repo\'s state is not real drift here"',
    '',
    'This guard fires at most once per turn. It will not fire again after this pass.'
  ].join('\n');

  return {
    decision: 'block',
    reason: `config-sync-guard: ${String(dirtyRepos.length)} backup repo(s) out of sync (unpushed commits and/or uncommitted paths this session made).`,
    hookSpecificOutput: { hookEventName: 'Stop', additionalContext: context }
  };
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el turno puede terminar. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso. Un fallo propio deja pasar.
 *
 * `decideDeps` is an OPTIONAL second parameter, forwarded verbatim to `decide()` — absent in every real
 * invocation (`main()` below calls `evaluate(raw)` with one argument, so production always gets
 * `decide()`'s own real defaults). It exists so `selftest.mjs` can drive this exact function — the real
 * wiring: JSON parsing, `decide()`, the block/note formatting, and the journal write — with FAKE repos,
 * instead of only being able to prove the wiring against the two real owner repos. `ledgerIo` is the same
 * kind of seam for the pending ledger (`pending-ledger.mjs`): a selftest points it at a throwaway file.
 * @es `decideDeps` es un segundo parámetro OPCIONAL, reenviado tal cual a `decide()` — ausente en toda
 * invocación real. Existe para que `selftest.mjs` accione esta MISMA función con repos FALSOS. `ledgerIo`
 * es el mismo tipo de costura para el registro de pendientes: un selftest lo apunta a un fichero desechable.
 */
export function evaluate(raw, decideDeps, ledgerIo) {
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined; // a malformed payload never blocks a turn
  }

  let verdict;

  try {
    verdict = decide(payload, decideDeps);
  } catch {
    return undefined; // fail open: a malfunction here must never silence a turn ending
  }

  if (verdict === undefined) return undefined;

  const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : 'unknown';

  if (verdict.kind === 'note') {
    recordUnexplained(verdict.unexplained, sessionId, ledgerIo);

    return { systemMessage: verdict.notes.join('\n') };
  }

  journal({ at: new Date().toISOString(), session: sessionId, repos: verdict.dirtyRepos.map((entry) => entry.repo.name) });

  return blockOutput(verdict.dirtyRepos, sessionId);
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));

  process.exit(0);
}

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
