/**
 * The voice judge: the LIVE rubric (v8g) the Stop command hook `judge-gate/run.mjs voice` asks a model, the
 * one source `../judge-gate/judges.mjs` runs and `../premise-judge/journal-guard.mjs` reads the marker of.
 *
 * WHY. Owner order 2026-10-11: «Lo de GENTLEMAN, para ti y para todas las sesiones... siempre lo impongo y nunca
 * pasa». An output style is guidance, not a guarantee (code.claude.com/docs/en/output-styles: "For something that
 * has to happen every time ... use a hook"), and the brevity rules compete with the voice. So a model judges the
 * one thing a pattern cannot: whether a reply to the owner reads as a dry log. The premise judge stays
 * single-purpose and excludes tone, which is why this is a separate hook (design: engram #1410).
 *
 * LIVE AND NAMED RUBRICS. Each rubric lives in `rubrics/`: `v8g.mjs` is live; `v7.mjs` and `v8f.mjs` stay as named
 * rubrics `measure.mjs` can still measure. Re-exporting a rubric other than v7 here is allowed only when its exact
 * text (its sha256) has either a MET ship bar in `ship-bar.json`, written by `measure.mjs --rates --record`, or an
 * owner promotion in `promotion.json`, written by hand from his words; the selftest refuses any other live text.
 * v8g is live by the owner's promotion of 2026-10-26 («Deja el que mas cosas tenga y el que mejor hecho este de la
 * voz, no te preocupes por lo que yo piense de las respuestas. dejalo metido»), with its ship bar not met: on his 12
 * labels it agrees with him on 61 of 72 judgments, v7 on 22.
 *
 * CONTRACT. Same as `../premise-judge/prompt.mjs`: the hook input replaces `$ARGUMENTS`, `{"ok": true}` or
 * `{"ok": false, "reason": "..."}`, a block on Stop feeds the reason back and the turn continues, and the gate, not
 * the rubric, decides `stop_hook_active` and an answer that is no verdict (`../judge-gate/gate.mjs`); rule 1 only
 * tells the model it may see a rewrite. The candidate v8h (`rubrics/v8h.mjs`) is measured, never live, until a MET
 * ship bar or the owner promotes it (`DECISION.md`). This judge NEVER sets `impossible`.
 * Its blocks start with `MARKER`, which the journal guard journals under the `voice-judge` mechanism so
 * `guard-precision/` measures it like any other guard. Every rubric spells the marker in words.
 *
 * CHANGELOG.
 * - 2026-10-26: the owner promotes v8g with its ship bar not met, recorded in `promotion.json`; v8g goes live.
 * - 2026-10-26: candidate v8g, v8f with the register the owner hears as Argentine, from his labels of 2026-10-25.
 * - 2026-10-25: the rubrics move to `rubrics/`; v7 stays live and v8f becomes the candidate, promoted only by a MET
 *   ship-bar record. Commit `eb3926d` ("adopt the rubric text that fails reply A and passes reply B") also carries a
 *   change its message does not name: `measure.mjs` `citesRule4` reads only the English half of a bilingual reason.
 * - 2026-10-25: the candidate text is chosen by an A/B on the real model (history in `rubrics/v8f.mjs`).
 * - 2026-10-19: rubric v8, after two Judgment Day rounds and the owner's calibration of replies A and B.
 * - 2026-10-11: rubric v7, live since then.
 *
 * @es El juez de voz: la rúbrica VIVA que el hook de comando de Stop `judge-gate/run.mjs voice` le pregunta a un
 * modelo, la única fuente que corre la compuerta y de la que la guardia de journal lee la marca. POR QUÉ: orden
 * del dueño 2026-10-11; un estilo de salida es una guía, no una garantía. VIVA Y CON NOMBRE: cada rúbrica vive en `rubrics/`;
 * `v8g.mjs` está viva y `v7.mjs` y `v8f.mjs` siguen como rúbricas con nombre que `measure.mjs` puede medir. Una
 * rúbrica distinta de la v7 solo puede estar viva si su texto exacto (su sha256) tiene la barra ALCANZADA en
 * `ship-bar.json` o una promoción del dueño en `promotion.json`, escrita a mano desde sus palabras; el selftest
 * rechaza cualquier otro texto vivo. La v8g está viva por la promoción del dueño del 2026-10-26, con la barra sin
 * alcanzar. NUNCA fija `impossible`. REGISTRO DE CAMBIOS: el 2026-10-26 el dueño promueve la v8g; el 2026-10-25 las rúbricas
 * pasan a `rubrics/`, la v7 sigue viva y la v8f queda candidata; el commit `eb3926d` además lleva un cambio que su
 * mensaje no nombra: `citesRule4` de `measure.mjs` lee solo la mitad inglesa de un motivo bilingüe.
 */

export { MARKER } from './marker.mjs';
export { PROMPT, PROMPT_SIGNATURE } from './rubrics/v8g.mjs';

/** The timeout of the hook, in seconds: the documented default, written down so the selftest pins it. @es El timeout del hook, en segundos. */
export const TIMEOUT_SECONDS = 30;
