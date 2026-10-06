/**
 * Invariant: a section of CLAUDE.md is loaded only while it is needed (see lazy-section.mjs for what a
 * section is and how it is declared). While it is not needed its span lives in a stash file and CLAUDE.md
 * carries a pointer that says exactly when to read the stash; when it is needed, or cannot be told, the span
 * is in CLAUDE.md. `apply` moves or restores it; `plan` reports what apply would do and writes nothing.
 *
 * WHEN A SECTION IS NEEDED is the entry's `loadedWhile`. Absent, the section is ALWAYS lazy: it is read on a
 * situation (a blocking prompt, a delegated writer returning), which its pointer names, and nothing about the
 * machine decides it, so the CLI is never asked. `reviews-may-run`, the review contract: needed while the
 * global receipt-driven development mode is `on`, read through `gentle-ai review mode status --json`
 * (review-mode.mjs); an unreadable mode keeps the span loaded and reports `unverifiable`.
 *
 * SYNC-SAFE, and why: `gentle-ai sync` can only UNDO this customization, never erase anything it owns. Sync
 * rewrites the whole managed region from its own assets, which puts the canonical span back, and the next
 * apply moves it out again. So no state of this invariant is a reason to refuse a sync, and the sync guard
 * does not block on it. The moved span is byte-identical to upstream's: the sentinel carries its SHA-256, and
 * `check` refuses a stash that does not hash to it.
 *
 * @es Invariante: una sección de CLAUDE.md se carga solo mientras hace falta (ver lazy-section.mjs: qué es
 * una sección y cómo se declara). Mientras no hace falta, su tramo vive en un fichero de depósito y CLAUDE.md
 * lleva un puntero que dice exactamente cuándo leerlo; cuando hace falta, o no se puede saber, el tramo está
 * en CLAUDE.md. `apply` lo mueve o lo restaura; `plan` informa qué haría apply sin escribir. CUÁNDO HACE
 * FALTA lo dice `loadedWhile` de la entrada. Ausente, la sección es SIEMPRE diferida: se lee ante una
 * situación (un prompt bloqueante, un escritor delegado que vuelve), que su puntero nombra, y nada de la
 * máquina lo decide, así que nunca se consulta el CLI. `reviews-may-run`, el contrato de revisiones: hace
 * falta mientras el modo global del desarrollo guiado por recibos es `on`, leído con
 * `gentle-ai review mode status --json`; un modo ilegible mantiene el tramo cargado e informa `unverifiable`.
 * SEGURO ANTE SYNC, y por qué: `gentle-ai sync` solo puede DESHACER esta personalización, nunca borrar nada
 * suyo. Sync reescribe toda la región gestionada desde sus assets, lo que devuelve el tramo canónico, y el
 * siguiente apply vuelve a sacarlo. Ningún estado de esta invariante es motivo para rechazar un sync, y el
 * guard de sync no se bloquea por ella. El tramo movido es idéntico a upstream byte a byte: el centinela
 * lleva su SHA-256 y `check` rechaza un depósito que no coincida.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { reconcileSection } from '../lazy-section.mjs';
import { readReviewMode } from '../review-mode.mjs';
import { readTextOrNull, writeTextAtomic } from '../text-file.mjs';

const REVIEWS_MAY_RUN = 'reviews-may-run';

/** What each outcome means for `label`, in both languages. @es Qué significa cada resultado para `label`, en ambos idiomas. */
const detailsOf = (label) => ({
  absent: `no ${label} span in CLAUDE.md; nothing to move @es no hay tramo de ${label} en CLAUDE.md; nada que mover`,
  lazy: `span is in the stash and CLAUDE.md holds the pointer @es el tramo está en el depósito y CLAUDE.md lleva el puntero`,
  loaded: `span is loaded in CLAUDE.md, it may be needed @es el tramo está cargado en CLAUDE.md, puede hacer falta`,
  moved: `span is loaded while it is not needed; apply moves it to the stash @es el tramo está cargado sin hacer falta; apply lo mueve al depósito`,
  restored: `span is in the stash while it may be needed or the mode is unreadable; apply restores it @es el tramo está en el depósito con posible necesidad o modo ilegible; apply lo restaura`,
  repointed: `the pointer is not the declared one; apply rewrites it, the stash stays @es el puntero no es el declarado; apply lo reescribe, el depósito no cambia`,
});

const needsMode = (customization) => customization.loadedWhile === REVIEWS_MAY_RUN;

/** Everything apply would do, computed without writing. @es Todo lo que haría apply, calculado sin escribir. */
function planFor(customization, context) {
  const claudePath = path.join(context.home, customization.file);
  const stashPath = path.join(context.home, customization.stash);
  const text = readTextOrNull(claudePath);
  if (text === null) return { refused: 'CLAUDE.md does not exist @es CLAUDE.md no existe' };
  const mode = needsMode(customization) ? readReviewMode(context) : {};
  const keepLoaded = needsMode(customization) && (mode.unreadable !== undefined || mode.reviewsMayRun);
  const result = reconcileSection(text, customization, { keepLoaded, stash: readTextOrNull(stashPath), stashLabel: `~/${customization.stash}` });
  return { ...result, before: text, mode, claudePath, stashPath };
}

/** An unchanged span is described by its form; a pending change by its outcome. @es Un tramo sin cambios se describe por su forma; un cambio pendiente, por su resultado. */
const PLANNED = { moved: 'would-move', restored: 'would-restore', repointed: 'would-repoint', unchanged: 'unchanged' };
function detailFor(customization, plan) {
  const details = detailsOf(customization.label);
  if (plan.outcome !== 'unchanged') return details[plan.outcome];
  return { absent: details.absent, moved: details.lazy, present: details.loaded }[plan.form];
}

export const lazySection = {
  syncSafe: true,
  remedy: 'Run `gentle-ai sync` to regenerate the span, then the overlay apply. @es Ejecutar `gentle-ai sync` para regenerar el tramo, y luego el apply del overlay.',

  evaluate(customization, context) {
    const plan = planFor(customization, context);
    if (plan.refused !== undefined) return { status: 'broken', detail: plan.refused };
    if (plan.outcome !== 'unchanged') return { status: 'broken', detail: detailFor(customization, plan) };
    if (plan.mode.unreadable !== undefined) return { status: 'unverifiable', detail: `review mode unreadable, ${customization.label} kept loaded: ${plan.mode.unreadable} @es modo de revisiones ilegible, se mantiene cargado` };
    return { status: 'held', detail: detailFor(customization, plan) };
  },

  plan(customization, context) {
    const plan = planFor(customization, context);
    if (plan.refused !== undefined) return { outcome: 'refused', detail: plan.refused };
    return { outcome: PLANNED[plan.outcome], detail: `CLAUDE.md ${plan.before.length} -> ${plan.text.length} chars @es caracteres` };
  },

  apply(customization, context) {
    const plan = planFor(customization, context);
    if (plan.refused !== undefined) return { outcome: 'refused', detail: plan.refused };
    if (plan.outcome === 'unchanged') return { outcome: 'unchanged', detail: detailFor(customization, plan) };
    if (plan.outcome === 'moved') {
      mkdirSync(path.dirname(plan.stashPath), { recursive: true });
      writeTextAtomic(plan.stashPath, plan.stash);
    }
    writeTextAtomic(plan.claudePath, plan.text);
    return { outcome: 'applied', change: plan.outcome, label: customization.label, stash: customization.stash, detail: `${plan.outcome}: CLAUDE.md ${plan.before.length} -> ${plan.text.length} chars @es caracteres` };
  },
};
