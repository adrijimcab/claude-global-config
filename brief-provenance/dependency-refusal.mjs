/**
 * The words of a dependency-claim refusal: bilingual, naming each package, the judge's reason, and the two ways out.
 * @es Las palabras del rechazo de una afirmación sobre dependencias: bilingüe, nombra cada paquete, el motivo del
 * juez y las dos salidas.
 */

export function dependencyReason(refusal) {
  const packages = [...new Set(refusal.claims.flatMap((claim) => claim.packages))].join(', ');

  return [
    `BRIEF-PROVENANCE REFUSED this ${refusal.surface} (${refusal.toolName}): a MEASURED claim asserts how an installed dependency behaves (${packages}) and cites no source.`,
    '',
    `  JUDGE — ${refusal.reason}`,
    ...refusal.claims.map((claim) => `  READ — ${claim.unit.split('\n').join(' / ')}`),
    '',
    'A claim about how a dependency behaves at runtime is read in its INSTALLED source before it goes into a',
    'brief as measured. Do one of two things:',
    '  1. Read the installed source and cite it in the claim as dir/file:line (or dir/file:line:col),',
    '     e.g. "node_modules/playwright/lib/runner/sigIntWatcher.js:12".',
    '  2. Move the claim to a HYPOTHESIS: line, so the worker tests it rather than inherits it.',
    'A run receipt or a version read is not such a claim; an exit code beside a behaviour claim does not measure it.',
    'A teardown or lifecycle proof also runs against the real tool, never only against a stand-in modelled on the claim.',
    '',
    '@es Una afirmación sobre cómo se comporta una dependencia en ejecución se lee en su código INSTALADO antes de',
    '@es entrar en un brief como medida. Haz una de dos: (1) lee el código instalado y cítalo en la afirmación',
    '@es como directorio/fichero:línea (o :col), p. ej. "node_modules/playwright/lib/runner/sigIntWatcher.js:12";',
    '@es (2) mueve la afirmación a una línea HYPOTHESIS:, para que el worker la pruebe en vez de heredarla.',
    '@es Un recibo de ejecución o una versión leída no es una afirmación así; un código de salida junto a una',
    '@es afirmación de comportamiento no la mide.',
    '@es Una prueba de cierre o de ciclo de vida corre también contra la herramienta real, nunca solo contra un',
    '@es doble modelado sobre la afirmación.'
  ].join('\n');
}
