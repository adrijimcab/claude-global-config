/**
 * The evidence journals of this mechanism: `errors.jsonl` (a git error or timeout that let a command go) and
 * `refusals.jsonl` (a commit refused). Both are append-only evidence, never a precondition: a journal that
 * cannot be written is given up silently, because losing a line must never change a decision.
 *
 * @es Los diarios de evidencia de este mecanismo: `errors.jsonl` (un error o tiempo agotado de git que dejó
 * pasar un comando) y `refusals.jsonl` (un commit rechazado). Solo de añadir, evidencia y nunca precondición:
 * un diario que no se puede escribir se abandona sin ruido, porque perder una línea jamás cambia una decisión.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from '../hook-state/locations.mjs';

/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado, resuelto en cada llamada. */
export const stateDirectory = () => stateDir('commit-index-guard');

/** Appends one line to the journal `name`, or gives up. @es Añade una línea al diario `name`, o desiste. */
function append(name, entry) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(path.join(stateDirectory(), name), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition */
  }
}

/** Records why a git call did not answer and the command was let go. @es Registra por qué git no respondió y el comando pasó. */
export const journalError = (entry) => append('errors.jsonl', entry);

/** Records a refused commit. @es Registra un commit rechazado. */
export const journalRefusal = (entry) => append('refusals.jsonl', entry);
