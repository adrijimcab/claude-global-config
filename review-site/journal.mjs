/**
 * The record of what the review stop hook decided: one JSON line per hook run, so a skipped or an unexpectedly run
 * review is something a person can read afterwards. Evidence, never a precondition: a failure to write is swallowed.
 *
 * @es El registro de lo que decidió el hook de parada de revisión: una línea JSON por corrida, para poder leer
 * después qué revisión se saltó o corrió sin esperarse. Es evidencia, nunca una precondición: un fallo al escribir se traga.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from '../hook-state/locations.mjs';

/** `skipped` for a hook not run, `ran` for one run on a linked worktree, `fail-open` for one run because the decision failed. @es El nombre de la decisión. */
function decisionName(run, reason) {
  if (!run) return 'skipped';

  return reason === 'linked-worktree' ? 'ran' : 'fail-open';
}

/** Appends one decision to the journal. @es Añade una decisión al registro. */
export function recordDecision({ run, reason, cwd, event, session, detail }, now = new Date()) {
  try {
    const directory = stateDir('review-site');

    mkdirSync(directory, { recursive: true });
    appendFileSync(path.join(directory, 'journal.jsonl'), `${JSON.stringify({ at: now.toISOString(), decision: decisionName(run, reason), reason, event, session, cwd, detail })}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition @es evidencia, nunca una precondición */
  }
}
