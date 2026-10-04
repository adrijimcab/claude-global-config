#!/usr/bin/env node
/**
 * `PreToolUse` hook on delegation (`Agent|Task`): refuses to launch a new agent while a STOPPED agent's
 * work sits parked in its worktree — uncommitted, or committed but in no integration branch.
 *
 * THE LESSON (b100, 2026-09-09): three dead agents' worktrees held real finished work, and fresh agents
 * were being launched to redo two of those tasks from scratch. "Is this task still open?" and "is work for
 * it already sitting somewhere?" are different questions; a dispatch needs both, and parked work is
 * invisible from the main checkout by construction.
 *
 * WHAT IT DOES NOT FIRE ON: a LIVE agent's dirty worktree (that is the job), a clean worktree whose
 * commits all reached the integration branch, and a registered worktree whose directory is gone. What is
 * "work" here is deliberately plain — porcelain entries, or commits `git cherry` finds missing from the
 * primary integration branch — unlike the b100 reference, whose predicate also reads that repository's
 * declarations of ignored deliverables. A worktree it cannot measure is REFUSED and named: a failed
 * measurement is never a clean one.
 *
 * FAILS OPEN on a malfunction of its own (config, git answering at all), journaled.
 *
 * @es Hook `PreToolUse` sobre delegación: se niega a lanzar un agente nuevo mientras el trabajo de un agente
 * PARADO sigue aparcado en su worktree. No dispara con un agente vivo, un worktree integrado o un directorio
 * que ya no existe. Un worktree que no se puede medir se RECHAZA y se nombra.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { findConfig } from '../config/load-config.mjs';
import { isAgentWorktree, listWorktrees } from '../lib/agent-worktrees.mjs';
import { gitAsker, porcelainEntries } from '../lib/git.mjs';
import { deny, evaluator, hookMain, runWhenMain } from '../lib/hook-io.mjs';
import { ACTIVE_WINDOW_MS, activeOwner, agentRecords } from '../vendor/agent-liveness/liveness.mjs';

export const DELEGATION_TOOLS = new Set(['Agent', 'Task']);

/**
 * What a worktree holds that no integration branch does.
 * @returns `{ dirty, unintegrated }` counts, or `{ unmeasurable: why }`.
 * @es Lo que guarda un worktree que ninguna rama de integración tiene.
 */
export function workIn(worktree, integrationBranch) {
  const ask = gitAsker(worktree.path);

  try {
    const dirty = porcelainEntries(ask).length;
    const cherry = ask('cherry', integrationBranch, worktree.branch ?? 'HEAD');

    if (cherry.status !== 0) return { unmeasurable: `git cherry ${integrationBranch} failed: ${cherry.stderr.trim()}` };

    return { dirty, unintegrated: cherry.stdout.split('\n').filter((line) => line.startsWith('+')).length };
  } catch (error) {
    return { unmeasurable: error instanceof Error ? error.message : String(error) };
  }
}

const holdsWork = (work) => work.unmeasurable !== undefined || work.dirty > 0 || work.unintegrated > 0;

/**
 * The path a porcelain entry names (the destination of a rename), or `undefined` for a quoted path, which
 * git only emits for names it had to escape and which this check does not decode.
 * @es La ruta que nombra una entrada de porcelain (el destino de un renombrado), o `undefined` para una
 * ruta entre comillas, que git solo emite cuando tuvo que escaparla y que esta comprobación no decodifica.
 */
function entryPath(entry) {
  const named = entry.slice(3);
  const target = named.includes(' -> ') ? named.slice(named.indexOf(' -> ') + 4) : named;

  return target.startsWith('"') ? undefined : target;
}

/**
 * When `worktree` was last worked on, in milliseconds: the newest of its dirty entries' modification
 * times and its HEAD commit's author time, or `0` when neither can be read.
 *
 * WHY THIS EXISTS (2026-10-04): an agent record is not the only proof that somebody is working in a
 * worktree. A session's workers can write a worktree by absolute path while their transcripts are rooted
 * elsewhere, so `activeOwner` finds no owner. MEASURED: `di_1700002_discovery_fe`'s `migration-study`
 * worktree had files written one minute earlier and a commit from the same minute, and this guard refused
 * every delegation of another session as "a stopped agent's work". The author time is used, not the
 * committer time, so a replayed or cherry-picked branch keeps its original age and errs toward "parked",
 * the safe side.
 * @es Cuándo se trabajó por última vez en `worktree`, en milisegundos: lo más reciente entre la
 * modificación de sus entradas sucias y la fecha de autor de su commit HEAD, o `0` si no se puede leer
 * ninguna. POR QUÉ (2026-10-04): un registro de agente no es la única prueba de que alguien trabaja en un
 * worktree; los workers de una sesión pueden escribirlo por ruta absoluta con sus transcripts en otro
 * sitio. MEDIDO: el worktree `migration-study` tenía archivos escritos un minuto antes y un commit de ese
 * mismo minuto, y este guard rechazaba toda delegación de otra sesión como «trabajo de un agente parado».
 * Se usa la fecha de autor, no la del committer, para que una rama reaplicada conserve su antigüedad y se
 * equivoque hacia «aparcado», el lado seguro.
 */
export function lastWorkedMs(worktree) {
  const ask = gitAsker(worktree.path);
  const times = [];

  try {
    for (const entry of porcelainEntries(ask)) {
      const relative = entryPath(entry);

      if (relative === undefined) continue;

      try {
        times.push(statSync(path.join(worktree.path, relative)).mtimeMs);
      } catch {
        // A deleted entry has no modification time to offer. @es Una entrada borrada no tiene fecha de modificación que aportar.
      }
    }

    const head = ask('log', '-1', '--format=%at');

    if (head.status === 0 && head.stdout.trim().length > 0) times.push(Number(head.stdout.trim()) * 1000);
  } catch {
    return 0;
  }

  return times.length === 0 ? 0 : Math.max(...times);
}

/**
 * The parked worktrees visible from `payload`'s repository, as `[{ worktree, work }]`.
 * @es Los worktrees aparcados visibles desde el repositorio del payload.
 */
export function parkedWork(payload, { records = agentRecords(), now = Date.now(), lastWorked = lastWorkedMs } = {}) {
  if (!DELEGATION_TOOLS.has(payload?.tool_name) || typeof payload?.cwd !== 'string') return [];

  const governed = findConfig(payload.cwd);

  if (governed === undefined) return [];

  const integrationBranch = governed.config.integrationBranches[0];

  return listWorktrees(gitAsker(governed.repository.mainCheckout))
    .filter((worktree) => isAgentWorktree(governed, worktree.path) && existsSync(worktree.path))
    .filter((worktree) => activeOwner(worktree.path, records, now) === undefined)
    .filter((worktree) => now - lastWorked(worktree) >= ACTIVE_WINDOW_MS)
    .map((worktree) => ({ worktree, work: workIn(worktree, integrationBranch) }))
    .filter(({ work }) => holdsWork(work));
}

function describe({ worktree, work }) {
  const what = work.unmeasurable === undefined ? `${work.dirty} uncommitted entr${work.dirty === 1 ? 'y' : 'ies'}, ${work.unintegrated} commit(s) in no integration branch` : `UNMEASURABLE — ${work.unmeasurable}`;

  return `  - ${worktree.path} (${worktree.branch ?? 'detached'}): ${what}`;
}

function reason(parked) {
  return [
    'ORPHANED WORK (fleet-kit): a stopped agent\'s work is parked in its worktree, and a new agent is about to launch.',
    '',
    ...parked.map(describe),
    '',
    'A fresh agent may be about to redo exactly this. Triage first — the refusal clears itself once each is done:',
    '  - RESUME the stopped agent by its raw agentId (SendMessage), which keeps its transcript and worktree;',
    '  - or land the work, or salvage it into a live branch;',
    '  - or discard it deliberately (remove the worktree) after reading what it holds.'
  ].join('\n');
}

export const evaluate = evaluator('orphan-work', (payload) => {
  const parked = parkedWork(payload);

  return parked.length === 0 ? undefined : deny(reason(parked));
});

runWhenMain(import.meta.url, hookMain(evaluate));
