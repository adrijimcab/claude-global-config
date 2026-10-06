/**
 * Owns the question "does this gate configuration hide a failure?". A gate config may not carry an ignore or
 * exclusion entry, an allowlist, a rule turned `off` or downgraded to `warn`, a disable directive, or a
 * coverage threshold, or mutation break score (`break`, Stryker's failing score), under the kit floor: each
 * lets the failure the gate exists to catch survive.
 *
 * Decision: the scan is textual because the configs span JS, JSON and YAML. Comment lines (`//`, `#`, `*`,
 * `/*`) are skipped for the key rules, so a comment may say "nothing ignored", but the disable-directive
 * rule reads the RAW text, because a directive lives in a comment. `THRESHOLD_FLOOR` is the kit's minimum
 * for any numeric coverage-style key; raising it is allowed, lowering it is caught by the campaign.
 *
 * @es Responde a "¿esta config de gate oculta un fallo?". No puede llevar entradas ignore/exclude, listas
 * de permitidos, reglas en `off` o degradadas a `warn`, directivas de desactivación, umbrales de
 * cobertura ni puntuación de mutación (`break`) bajo el mínimo del kit. El escaneo es textual (JS, JSON y YAML); las líneas de comentario se
 * omiten salvo para las directivas, que viven en comentarios. `THRESHOLD_FLOOR` es el mínimo del kit.
 */

/** Minimum for any coverage-style threshold. @es Mínimo de cualquier umbral de cobertura. */
export const THRESHOLD_FLOOR = 80;

/** Key rules, read over non-comment lines. @es Reglas de clave, sobre líneas que no son comentario. */
const CODE_RULES = [
  ['ignore', /ignore|allow-?list|exclude/i],
  ['off', /(["'])(?:off|warn)\1|[:=]\s*(?:off|warn)\s*$/i],
];

/** Disable directives, read over the raw text. @es Directivas de desactivación, sobre el texto crudo. */
const DIRECTIVE = /eslint-disable|stylelint-disable|@ts-ignore|@ts-nocheck|istanbul ignore|c8 ignore|v8 ignore/;

const THRESHOLD = /\b(?:(?:statements|branches|functions|lines|thresholds?|minCoverage)\w*|break)["']?\s*[:=]\s*(\d+(?:\.\d+)?)/gi;

const COMMENT_START = /^\s*(?:\/\/|#|\*|\/\*)/;

/**
 * Every violation of the config text, each `{ rule, line }` with a 1-based line.
 * @es Cada violación del texto de la config, con su línea (desde 1).
 */
export function configViolations(text) {
  const violations = [];

  text.split('\n').forEach((content, index) => {
    const line = index + 1;
    const isComment = COMMENT_START.test(content);

    if (DIRECTIVE.test(content)) violations.push({ rule: 'directive', line });
    if (isComment) return;

    for (const [rule, pattern] of CODE_RULES) if (pattern.test(content)) violations.push({ rule, line });
    for (const [, value] of content.matchAll(THRESHOLD)) if (Number(value) < THRESHOLD_FLOOR) violations.push({ rule: 'threshold', line });
  });

  return violations;
}
