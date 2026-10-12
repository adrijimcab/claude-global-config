/**
 * The clean-code gate profile, as data: the ONE list of gates every project adopts, per stack, each with its tool,
 * its exact configuration, its threshold and WHY that threshold. `check.mjs` grades a project against this list;
 * `README.md` renders it for people. A threshold changes here and nowhere else.
 *
 * Provenance of a threshold, stated per gate in `why`: MEASURED (a value a tree enforces today, with its file and
 * line), DEFAULT (the tool's own default) or DERIVED (computed from a measured value, offenders never measured).
 * A DERIVED threshold is a design decision until the adoption step "measure offenders" has counted its offenders.
 *
 * @es El perfil de gates de código limpio, como datos: la ÚNICA lista de gates que todo proyecto adopta, por stack,
 * cada uno con su herramienta, su configuración exacta, su umbral y el PORQUÉ de ese umbral. `check.mjs` evalúa un
 * proyecto contra esta lista; `README.md` la muestra a las personas. Un umbral cambia aquí y en ningún otro sitio.
 * Procedencia de un umbral, dicha en `why`: MEDIDO (un valor que un árbol aplica hoy, con fichero y línea),
 * DEFAULT (el de la herramienta) o DERIVADO (calculado de uno medido, sin haber medido sus infractores). Un umbral
 * DERIVADO es una decisión de diseño hasta que el paso de adopción "medir infractores" cuente sus infractores.
 */

/** Every stack the profile knows. @es Todos los stacks que el perfil conoce. */
export const STACKS = Object.freeze(['angular', 'node']);

const BOTH = Object.freeze(['angular', 'node']);
const ANGULAR = Object.freeze(['angular']);

/** The security rules that must be at `error`, from the kit's menu entry 2. @es Reglas de seguridad en `error`, de la entrada 2 del menú. */
export const SECURITY_RULES = Object.freeze([
  'security/detect-buffer-noassert',
  'security/detect-child-process',
  'security/detect-disable-mustache-escape',
  'security/detect-eval-with-expression',
  'security/detect-new-buffer',
  'security/detect-no-csrf-before-method-override',
  'security/detect-non-literal-require',
  'security/detect-possible-timing-attacks',
  'security/detect-pseudoRandomBytes',
  'security/detect-unsafe-regex',
]);

/** The audit level the profile blocks on, and the levels that are at least as strict. @es Nivel de auditoría que bloquea y los igual de estrictos. */
export const AUDIT_LEVEL = 'high';
export const AUDIT_LEVELS_AT_LEAST_HIGH = Object.freeze(['low', 'moderate', 'high']);

/** jscpd settings the profile pins. @es Ajustes de jscpd que fija el perfil. */
export const JSCPD = Object.freeze({ minTokens: 70, threshold: 0 });

/** The architecture probes: a forbidden dependency a layering config must declare, per stack. @es Sondas de arquitectura. */
export const LAYERING_PROBES = Object.freeze({
  angular: Object.freeze([
    Object.freeze({ id: 'core-not-from-pages', from: 'src/app/core/a.ts', to: 'src/app/pages/b.ts' }),
    Object.freeze({ id: 'core-not-from-adapters', from: 'src/app/core/a.ts', to: 'src/app/adapters/b.ts' }),
    Object.freeze({ id: 'domain-framework-free', from: 'src/app/domain/a.ts', to: '@angular/core' }),
  ]),
  node: Object.freeze([
    Object.freeze({ id: 'core-not-from-adapters', from: 'src/core/a.mjs', to: 'src/adapters/b.mjs' }),
    Object.freeze({ id: 'domain-not-from-adapters', from: 'src/domain/a.mjs', to: 'src/adapters/b.mjs' }),
  ]),
});

const eslintRule = (id, rule, sample, max, defaultMax, config, en, es, stacks = BOTH) =>
  Object.freeze({ id, stacks, kind: 'eslint-rule', tool: 'eslint', rule, sample, max, defaultMax, config, threshold: max, why: { en, es } });

/**
 * The gates. `kind` picks the decision `verdicts.mjs` makes; the other fields are that decision's inputs.
 * @es Los gates. `kind` elige la decisión que toma `verdicts.mjs`; el resto son sus entradas.
 */
export const GATES = Object.freeze([
  Object.freeze({
    id: 'lint-on-landing', stacks: BOTH, kind: 'landing-tool', tool: 'eslint', config: { command: 'eslint . (or ng lint)' }, threshold: 'in the landing chain',
    why: {
      en: 'A rule nobody runs is not a gate. MEASURED: Discovery-FE lints in build:ci but its landing suite (test:all) excludes lint, so the landing guard cannot see a lint error.',
      es: 'Una regla que nadie corre no es un gate. MEDIDO: Discovery-FE lintea en build:ci pero su suite de aterrizaje (test:all) excluye el lint, así que el guard de aterrizaje no ve un error de lint.',
    },
  }),
  eslintRule('complexity', 'complexity', 'script', 13, 20, { complexity: ['error', { max: 13 }] },
    'MEASURED: b100-am-ui eslint.config.ts:359 enforces 13 at zero offenders; ESLint default is 20, McCabe\'s original limit 10.',
    'MEDIDO: b100-am-ui eslint.config.ts:359 aplica 13 con cero infractores; el default de ESLint es 20, el límite original de McCabe 10.'),
  eslintRule('max-depth', 'max-depth', 'script', 4, 4, { 'max-depth': ['error', { max: 4 }] },
    'MEASURED: b100-am-ui eslint.config.ts:360 enforces 4, also the ESLint default; deeper nesting hides the control flow.',
    'MEDIDO: b100-am-ui eslint.config.ts:360 aplica 4, que además es el default de ESLint; más anidación esconde el flujo.'),
  eslintRule('max-params', 'max-params', 'script', 5, 3, { 'max-params': ['error', { max: 5 }] },
    'MEASURED: b100-am-ui eslint.config.ts:361 enforces 5; ESLint default is 3. Past 5 a parameter object is the clean shape.',
    'MEDIDO: b100-am-ui eslint.config.ts:361 aplica 5; el default de ESLint es 3. Pasado 5, lo limpio es un objeto de parámetros.'),
  eslintRule('max-lines-per-function', 'max-lines-per-function', 'script', 100, 50, { 'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }] },
    'MEASURED: b100-am-ui eslint.config.ts:362 enforces 100 without blank lines and comments; ESLint default is 50.',
    'MEDIDO: b100-am-ui eslint.config.ts:362 aplica 100 sin líneas en blanco ni comentarios; el default de ESLint es 50.'),
  eslintRule('max-lines', 'max-lines', 'script', 400, 300, { 'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }] },
    'MEASURED: b100-am-ui eslint.config.ts:694 enforces 400 without blank lines and comments: a file past it does more than one thing.',
    'MEDIDO: b100-am-ui eslint.config.ts:694 aplica 400 sin líneas en blanco ni comentarios: un fichero más largo hace más de una cosa.'),
  eslintRule('max-statements', 'max-statements', 'script', 30, 10, { 'max-statements': ['error', { max: 30 }] },
    'DERIVED: no tree enforces it today. A 100-line function at roughly three lines per statement holds about 33, rounded down to 30. Offenders unmeasured: count them before enabling.',
    'DERIVADO: ningún árbol lo aplica hoy. Una función de 100 líneas a unas tres líneas por sentencia guarda unas 33, redondeado a 30. Infractores sin medir: contarlos antes de activarlo.'),
  eslintRule('cognitive-complexity', 'sonarjs/cognitive-complexity', 'script', 15, 15, { 'sonarjs/cognitive-complexity': ['error', 15] },
    'DEFAULT: the sonarjs rule default is 15, and b100-am-ui enables the sonarjs recommended preset (eslint.config.ts:125). Cognitive complexity penalises nesting that cyclomatic complexity ignores.',
    'DEFAULT: el default de la regla de sonarjs es 15 y b100-am-ui activa el preset recommended de sonarjs (eslint.config.ts:125). La complejidad cognitiva penaliza el anidamiento que la ciclomática ignora.'),
  eslintRule('template-complexity', '@angular-eslint/template/cyclomatic-complexity', 'template', 10, 5, { '@angular-eslint/template/cyclomatic-complexity': ['error', { maxComplexity: 10 }] },
    'MEASURED: b100-am-ui eslint.config.ts:1347 enforces 10 in templates; the rule default is 5. Logic past 10 branches belongs in a computed signal.',
    'MEDIDO: b100-am-ui eslint.config.ts:1347 aplica 10 en plantillas; el default de la regla es 5. La lógica de más de 10 ramas va en un signal computed.',
    ANGULAR),
  Object.freeze({
    id: 'security-lint', stacks: BOTH, kind: 'eslint-rules-set', tool: 'eslint-plugin-security', rules: SECURITY_RULES, sample: 'script', config: Object.fromEntries(SECURITY_RULES.map((rule) => [rule, 'error'])), threshold: 'error',
    why: {
      en: 'The ten rules the kit menu (tier1-tier3-menu.md, entry 2) sets to error. The three it sets to warn (non-literal fs filename, non-literal RegExp, object injection) are not graded: a warning that does not fail is a hidden failure, so they enter only when a project has zero offenders for them.',
      es: 'Las diez reglas que el menú del kit (tier1-tier3-menu.md, entrada 2) pone en error. Las tres que pone en warn (nombre de fichero no literal, RegExp no literal, inyección de objeto) no se califican: un aviso que no falla es un fallo escondido, así que entran solo cuando un proyecto tiene cero infractores.',
    },
  }),
  Object.freeze({
    id: 'strict-typescript', stacks: ANGULAR, kind: 'strict-ts', tool: 'tsc', config: { compilerOptions: { strict: true } }, threshold: 'strict: true',
    why: {
      en: 'Strict mode is the floor under every type-based rule; the kit gate angular/ts-strict-type-checked holds the typed-lint layer on top. A type error must be reachable by the landing chain (tsc, ng build or ng test).',
      es: 'El modo estricto es el suelo de toda regla basada en tipos; el gate del kit angular/ts-strict-type-checked pone encima la capa de lint con tipos. Un error de tipos debe ser alcanzable por la cadena de aterrizaje (tsc, ng build o ng test).',
    },
  }),
  Object.freeze({
    id: 'circular-dependencies', stacks: BOTH, kind: 'depcruise-circular', tool: 'dependency-cruiser', kitGate: 'angular/dependency-cruiser-circular', config: { forbidden: [{ name: 'no-circular', severity: 'error', from: {}, to: { circular: true } }] }, threshold: 'zero cycles',
    why: {
      en: 'A cycle makes load order and change impact unpredictable. The kit gate angular/dependency-cruiser-circular is the config; b100-am-ui reaches the same rule with madge (check:acyclic), an equivalent the checker names but does not credit.',
      es: 'Un ciclo hace impredecibles el orden de carga y el impacto de un cambio. El gate del kit angular/dependency-cruiser-circular es la config; b100-am-ui llega a la misma regla con madge (check:acyclic), un equivalente que el checker nombra pero no acredita.',
    },
  }),
  Object.freeze({
    id: 'hexagonal-layering', stacks: BOTH, kind: 'depcruise-layering', tool: 'dependency-cruiser', kitGate: 'angular/dependency-cruiser-layering', probes: LAYERING_PROBES, config: { rules: ['core-not-from-pages', 'core-not-from-adapters', 'domain-framework-free'] }, threshold: 'zero violations',
    why: {
      en: 'Domain and core never import adapters, pages or framework infrastructure; dependencies point inward. The kit gate angular/dependency-cruiser-layering carries the three Angular rules (verified green on pass/ and red on fail/). The checker tests the project config by evaluating its own regexes against probe paths, not by reading rule names.',
      es: 'El dominio y el core nunca importan adaptadores, páginas ni infraestructura de framework; las dependencias apuntan hacia adentro. El gate del kit angular/dependency-cruiser-layering lleva las tres reglas de Angular (verificado en verde con pass/ y en rojo con fail/). El checker prueba la config del proyecto evaluando sus propias regex contra rutas de sonda, no leyendo nombres de regla.',
    },
  }),
  Object.freeze({
    id: 'duplication', stacks: BOTH, kind: 'jscpd', tool: 'jscpd', config: { minTokens: JSCPD.minTokens, threshold: JSCPD.threshold, path: ['src'], format: ['typescript', 'javascript'] }, threshold: `minTokens ${JSCPD.minTokens}, threshold ${JSCPD.threshold}`,
    why: {
      en: 'DERIVED: jscpd default is 50 tokens, which flags import lists and decorator metadata; 70 is about an 8-line statement clone, a copied function body. Threshold 0 = any clone fails. Scope is production code: specs favour readable repetition over DRY, so they are measured by coverage, not by this gate. Offenders unmeasured: count them before enabling.',
      es: 'DERIVADO: el default de jscpd es 50 tokens, que marca listas de imports y metadatos de decoradores; 70 es un clon de unas 8 líneas de sentencias, un cuerpo de función copiado. Umbral 0 = cualquier clon falla. El alcance es el código de producción: los specs prefieren la repetición legible al DRY, así que los mide la cobertura. Infractores sin medir: contarlos antes de activarlo.',
    },
  }),
  Object.freeze({
    id: 'dead-code', stacks: BOTH, kind: 'knip', tool: 'knip', config: { $schema: 'https://unpkg.com/knip@5/schema.json', entry: ['src/main.ts'], project: ['src/**/*.ts'] }, threshold: 'zero issues, zero ignore entries',
    why: {
      en: 'MEASURED: b100-am-ui runs knip inside ci:lint (package.json:45). Unused files, exports and dependencies are dead weight; the config declares entries and the project, never an ignore list (a knip ignore entry is the registry the kit forbids).',
      es: 'MEDIDO: b100-am-ui corre knip dentro de ci:lint (package.json:45). Ficheros, exports y dependencias sin uso son peso muerto; la config declara entradas y proyecto, nunca una lista de ignorados (una entrada ignore de knip es el registro que el kit prohíbe).',
    },
  }),
  Object.freeze({
    id: 'dependency-audit', stacks: BOTH, kind: 'npm-audit', tool: 'npm audit', config: { command: `npm audit --audit-level=${AUDIT_LEVEL}` }, threshold: `audit-level ${AUDIT_LEVEL}, blocking`,
    why: {
      en: 'The kit menu row 4 and gitlab-ci-quality.md use --audit-level=high. MEASURED: b100-am-ui .gitlab-ci.yml has a job `audit` with allow_failure: true; a job that cannot fail the pipeline is not enforcement, and the checker does not count it.',
      es: 'La fila 4 del menú del kit y gitlab-ci-quality.md usan --audit-level=high. MEDIDO: el .gitlab-ci.yml de b100-am-ui tiene un job `audit` con allow_failure: true; un job que no puede fallar el pipeline no es aplicación, y el checker no lo cuenta.',
    },
  }),
]);

/** The gates of one stack. @es Los gates de un stack. */
export function gatesOf(stack) {
  return GATES.filter((gate) => gate.stacks.includes(stack));
}
