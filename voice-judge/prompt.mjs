/**
 * The voice judge: the LIVE rubric of the second native `prompt` Stop hook wired in `~/.claude/settings.json`, the
 * one source `../judge-gate/judges.mjs` runs and `../premise-judge/journal-guard.mjs` reads the marker of.
 *
 * WHY. Owner order 2026-10-11: «Lo de GENTLEMAN, para ti y para todas las sesiones... siempre lo impongo y nunca
 * pasa». An output style is guidance, not a guarantee (code.claude.com/docs/en/output-styles: "For something that
 * has to happen every time ... use a hook"), and the brevity rules compete with the voice. So a model judges the
 * one thing a pattern cannot: whether a reply to the owner reads as a dry log. The premise judge stays
 * single-purpose and excludes tone, which is why this is a separate hook (design: engram #1410).
 *
 * LIVE AND CANDIDATE. Each rubric lives in `rubrics/`: `v7.mjs` is live, `v8f.mjs` is the candidate. Promotion
 * means re-exporting the candidate here instead of v7, and it is allowed only when `measure.mjs --rates --record`
 * has written `ship-bar.json` with the ship bar MET for the candidate's exact text (its sha256); the selftest refuses
 * any other live text. The bar is computed on owner labels only, so a rubric never goes live on two of them.
 *
 * CONTRACT. Same as `../premise-judge/prompt.mjs`: `type: "prompt"`, the hook input replaces `$ARGUMENTS`,
 * `{"ok": true}` or `{"ok": false, "reason": "..."}`, `ok: false` on Stop feeds the reason back and the turn
 * continues, and `stop_hook_active` is passed by rule 1 of the rubric. This judge NEVER sets `impossible`.
 * Its blocks start with `MARKER`, which the journal guard journals under the `voice-judge` mechanism so
 * `guard-precision/` measures it like any other guard. Every rubric spells the marker in words.
 *
 * CHANGELOG.
 * - 2026-10-25: the rubrics move to `rubrics/`; v7 stays live and v8f becomes the candidate, promoted only by a MET
 *   ship-bar record. Commit `eb3926d` ("adopt the rubric text that fails reply A and passes reply B") also carries a
 *   change its message does not name: `measure.mjs` `citesRule4` reads only the English half of a bilingual reason.
 * - 2026-10-25: the candidate text is chosen by an A/B on the real model (history in `rubrics/v8f.mjs`).
 * - 2026-10-19: rubric v8, after two Judgment Day rounds and the owner's calibration of replies A and B.
 * - 2026-10-11: rubric v7, live since then.
 *
 * @es El juez de voz: la rúbrica VIVA del segundo hook `prompt` de Stop en `~/.claude/settings.json`, la única
 * fuente que corre la compuerta y de la que la guardia de journal lee la marca. POR QUÉ: orden del dueño
 * 2026-10-11; un estilo de salida es una guía, no una garantía. VIVA Y CANDIDATA: cada rúbrica vive en
 * `rubrics/`; `v7.mjs` está viva y `v8f.mjs` es la candidata. Promoverla es reexportar la candidata aquí en vez de
 * la v7, y solo se permite cuando `measure.mjs --rates --record` escribió `ship-bar.json` con la barra ALCANZADA
 * para el texto exacto de la candidata (su sha256); el selftest rechaza cualquier otro texto vivo. La barra se
 * calcula solo con etiquetas del dueño. NUNCA fija `impossible`. REGISTRO DE CAMBIOS: el 2026-10-25 las rúbricas
 * pasan a `rubrics/`, la v7 sigue viva y la v8f queda candidata; el commit `eb3926d` además lleva un cambio que su
 * mensaje no nombra: `citesRule4` de `measure.mjs` lee solo la mitad inglesa de un motivo bilingüe.
 */

export { MARKER } from './marker.mjs';
export { PROMPT, PROMPT_SIGNATURE } from './rubrics/v7.mjs';

/** The timeout of the hook, in seconds: the documented default, written down so the selftest pins it. @es El timeout del hook, en segundos. */
export const TIMEOUT_SECONDS = 30;
