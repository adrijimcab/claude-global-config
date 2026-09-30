/**
 * The ledger line a NEW capture is written as, and what a capture's texts may carry. With a `--rule` the
 * line is TIERED: the full line is archived first, RE-READ from disk and proved conserved
 * (`conservation.mjs`) before the short line is accepted. Whenever any step fails, the FULL line is written
 * instead, so shortening can cost a few tokens but never a lesson.
 *
 * @es La línea del ledger con que se escribe una captura NUEVA, y qué pueden llevar sus textos. Con
 * `--rule` la línea es CON NIVELES: primero se archiva la línea completa, se RELEE de disco y se prueba su
 * conservación antes de aceptar la corta. Si falla cualquier paso se escribe la línea COMPLETA: acortar
 * puede costar unos tokens, nunca una lección.
 */

import { proveConservation } from './conservation.mjs';
import { appendEvidence, readEvidence } from './evidence.mjs';
import { joinBilingual, MARK_OPEN, RULE_LABEL, tieredLine } from './ledger-line.mjs';

/** The shortest `--rule` accepted: a sentence, not a word. @es La `--rule` más corta aceptada: una frase, no una palabra. */
export const MINIMUM_RULE_LENGTH = 20;

/** What makes `text` unfit for a one-line ledger entry, as bilingual reasons. @es Qué hace que `text` no sirva para una entrada de una línea. */
function oneLineProblems(name, text) {
  return [
    ...(text.includes('\n') || text.includes('\r') ? [`${name} must be one line. @es ${name} debe ser de una sola línea.`] : []),
    ...(text.includes(MARK_OPEN) ? [`${name} must not contain "${MARK_OPEN}". @es ${name} no puede contener "${MARK_OPEN}".`] : []),
  ];
}

/**
 * The reasons a capture's `--lesson` and optional `--rule` are refused, bilingual; empty when both are fine.
 * @es Los motivos, bilingües, por los que se rechazan `--lesson` y `--rule`; vacío si están bien.
 */
export function captureTextProblems({ lesson, rule }) {
  const problems = typeof lesson === 'string' ? oneLineProblems('--lesson', lesson) : [];

  if (rule === undefined) return problems;
  if (typeof rule !== 'string') return [...problems, '--rule needs a sentence. @es --rule necesita una frase.'];

  return [
    ...problems,
    ...(rule.trim().length < MINIMUM_RULE_LENGTH ? [`--rule must be a sentence of at least ${String(MINIMUM_RULE_LENGTH)} characters. @es --rule debe ser una frase de al menos ${String(MINIMUM_RULE_LENGTH)} caracteres.`] : []),
    ...oneLineProblems('--rule', rule),
    ...(rule.includes('RULE:') ? ['--rule must not contain "RULE:": the ledger writes the label. @es --rule no puede contener "RULE:": el ledger escribe la etiqueta.'] : []),
  ];
}

/**
 * @param input `{ ledgerFile, scope, date, key, lesson, rule, marker }` — `rule` is `undefined` for the legacy form.
 * @returns `{ line, tiered }`, plus `problem` (bilingual) when a `--rule` fell back to the full line.
 * @es `rule` es `undefined` en la forma heredada. Devuelve `{ line, tiered }` y `problem` si `--rule` cayó a la línea completa.
 */
export function newLessonLine({ ledgerFile, scope, date, key, lesson, rule, marker }) {
  if (rule === undefined) return { line: `- [${scope}] ${date} — ${lesson} ${marker}`, tiered: false };

  const full = `- [${scope}] ${date} — ${lesson} ${RULE_LABEL}${rule} ${marker}`;
  const built = tieredLine({ scope, date, rule, key, marker });
  const archived = built.ok ? appendEvidence({ ledgerFile, key, line: full, date, kind: 'captured' }) : built;
  const proof = archived.ok ? proveConservation({ original: full, shortened: built.line, evidence: readEvidence(ledgerFile, key) }) : undefined;

  if (proof?.ok) return { line: built.line, tiered: true };

  const reasons = proof === undefined ? [archived.problem] : proof.deficits;

  return { line: full, tiered: false, problem: joinBilingual(['the lesson was recorded as a full line, not shortened. @es la lección se registró como línea completa, sin acortar.', ...reasons]) };
}
