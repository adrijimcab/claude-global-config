/**
 * Invariant: the review execution contract is loaded from CLAUDE.md only while gentle-ai reviews may
 * run. While the global review mode is not `on`, the span lives in a stash file and CLAUDE.md carries
 * a pointer (see review-contract-section.mjs); when the mode is `on`, or cannot be read, the span is
 * in CLAUDE.md. `apply` moves or restores it; `plan` reports what apply would do and writes nothing.
 *
 * SYNC-SAFE, and why: `gentle-ai sync` can only UNDO this customization, never erase anything it
 * owns. Sync rewrites the whole sdd-orchestrator region from its own assets, which puts the canonical
 * span back, and the next apply moves it out again. So no state of this invariant is a reason to
 * refuse a sync, and the sync guard does not block on it.
 *
 * @es Invariante: el contrato de ejecución de revisiones se carga desde CLAUDE.md solo mientras las
 * revisiones de gentle-ai pueden correr. Mientras el modo global no es `on`, el tramo vive en un
 * fichero de depósito y CLAUDE.md lleva un puntero; cuando el modo es `on`, o no se puede leer, el
 * tramo está en CLAUDE.md. `apply` lo mueve o lo restaura; `plan` informa qué haría apply sin escribir.
 * SEGURO ANTE SYNC, y por qué: `gentle-ai sync` solo puede DESHACER esta personalización, nunca borrar
 * nada suyo. Sync reescribe toda la región sdd-orchestrator desde sus propios assets, lo que devuelve
 * el tramo canónico, y el siguiente apply vuelve a sacarlo. Ningún estado de esta invariante es motivo
 * para rechazar un sync, y el guard de sync no se bloquea por ella.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { reconcileSection } from '../review-contract-section.mjs';
import { readReviewMode } from '../review-mode.mjs';
import { readTextOrNull, writeTextAtomic } from '../text-file.mjs';

const DETAIL = {
  absent: 'no review contract span in CLAUDE.md; nothing to move @es no hay tramo del contrato de revisiones en CLAUDE.md; nada que mover',
  lazy: 'span is in the stash and CLAUDE.md holds the pointer, reviews are off @es el tramo está en el depósito y CLAUDE.md lleva el puntero, revisiones apagadas',
  loaded: 'span is loaded in CLAUDE.md, reviews may run @es el tramo está cargado en CLAUDE.md, las revisiones pueden correr',
  moved: 'span is loaded while reviews are off; apply moves it to the stash @es el tramo está cargado con las revisiones apagadas; apply lo mueve al depósito',
  restored: 'span is in the stash while reviews may run or the mode is unreadable; apply restores it @es el tramo está en el depósito con revisiones posibles o modo ilegible; apply lo restaura',
};

/** Everything apply would do, computed without writing. @es Todo lo que haría apply, calculado sin escribir. */
function planFor(customization, context) {
  const claudePath = path.join(context.home, customization.file);
  const stashPath = path.join(context.home, customization.stash);
  const text = readTextOrNull(claudePath);
  if (text === null) return { refused: 'CLAUDE.md does not exist @es CLAUDE.md no existe' };
  const mode = readReviewMode(context);
  const keepLoaded = mode.unreadable !== undefined || mode.reviewsMayRun;
  const result = reconcileSection(text, { keepLoaded, stash: readTextOrNull(stashPath), stashLabel: `~/${customization.stash}` });
  return { ...result, before: text, mode, claudePath, stashPath };
}

/** An unchanged span is described by its form; a pending change by its outcome. @es Un tramo sin cambios se describe por su forma; un cambio pendiente, por su resultado. */
const UNCHANGED_DETAIL = { absent: DETAIL.absent, moved: DETAIL.lazy, present: DETAIL.loaded };
const PLANNED = { moved: 'would-move', restored: 'would-restore', unchanged: 'unchanged' };
const detailFor = (plan) => (plan.outcome === 'unchanged' ? UNCHANGED_DETAIL[plan.form] : DETAIL[plan.outcome]);

export const lazyReviewContract = {
  syncSafe: true,
  remedy: 'Run `gentle-ai sync` to regenerate the review contract span, then the overlay apply. @es Ejecutar `gentle-ai sync` para regenerar el tramo del contrato de revisiones, y luego el apply del overlay.',

  evaluate(customization, context) {
    const plan = planFor(customization, context);
    if (plan.refused !== undefined) return { status: 'broken', detail: plan.refused };
    if (plan.outcome !== 'unchanged') return { status: 'broken', detail: detailFor(plan) };
    if (plan.mode.unreadable !== undefined) return { status: 'unverifiable', detail: `review mode unreadable, contract kept loaded: ${plan.mode.unreadable} @es modo de revisiones ilegible, el contrato se mantiene cargado` };
    return { status: 'held', detail: detailFor(plan) };
  },

  plan(customization, context) {
    const plan = planFor(customization, context);
    if (plan.refused !== undefined) return { outcome: 'refused', detail: plan.refused };
    return { outcome: PLANNED[plan.outcome], detail: `CLAUDE.md ${plan.before.length} -> ${plan.text.length} chars @es caracteres` };
  },

  apply(customization, context) {
    const plan = planFor(customization, context);
    if (plan.refused !== undefined) return { outcome: 'refused', detail: plan.refused };
    if (plan.outcome === 'unchanged') return { outcome: 'unchanged', detail: detailFor(plan) };
    if (plan.outcome === 'moved') {
      mkdirSync(path.dirname(plan.stashPath), { recursive: true });
      writeTextAtomic(plan.stashPath, plan.stash);
    }
    writeTextAtomic(plan.claudePath, plan.text);
    return { outcome: 'applied', change: plan.outcome, detail: `${plan.outcome}: CLAUDE.md ${plan.before.length} -> ${plan.text.length} chars @es caracteres` };
  },
};
