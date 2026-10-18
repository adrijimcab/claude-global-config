/**
 * The words of a dependency-claim refusal: bilingual, naming each package and the two ways out.
 * @es Las palabras del rechazo de una afirmación sobre dependencias: bilingüe, nombra cada paquete y
 * las dos salidas.
 */

export function dependencyReason(refusal) {
  const packages = [...new Set(refusal.claims.flatMap((claim) => claim.packages))].join(', ');

  return [
    `BRIEF-PROVENANCE REFUSED this ${refusal.surface} (${refusal.toolName}): a MEASURED line makes a claim about an installed dependency (${packages}) and cites no source.`,
    '',
    ...refusal.claims.map((claim) => `  UNSOURCED — ${claim.line}`),
    '',
    'A claim about how a dependency behaves at runtime is read in its INSTALLED source before it goes into a',
    'brief as measured. Do one of two things:',
    '  1. Read the installed source and cite it on the same line, as path:line or a path under node_modules/,',
    '     e.g. "node_modules/playwright/lib/runner/sigIntWatcher.js:12".',
    '  2. Move the claim to a HYPOTHESIS: line, so the worker tests it rather than inherits it.',
    'A teardown or lifecycle proof also runs against the real tool, never only against a stand-in modelled on the claim.',
    '',
    '@es Una afirmación sobre cómo se comporta una dependencia en ejecución se lee en su código INSTALADO antes de',
    '@es entrar en un brief como medida. Haz una de dos: (1) lee el código instalado y cítalo en la misma línea,',
    '@es como ruta:línea o una ruta bajo node_modules/, p. ej. "node_modules/playwright/lib/runner/sigIntWatcher.js:12";',
    '@es (2) mueve la afirmación a una línea HYPOTHESIS:, para que el worker la pruebe en vez de heredarla.',
    '@es Una prueba de cierre o de ciclo de vida corre también contra la herramienta real, nunca solo contra un',
    '@es doble modelado sobre la afirmación.'
  ].join('\n');
}
