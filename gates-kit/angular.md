# Angular Gates

Angular-specific additions on top of `tier1-tier3-menu.md`. Every entry here is a real compiler/linter
invocation, never a regex over `.ts`/`.html` source.

@es Añadidos específicos de Angular sobre `tier1-tier3-menu.md`. Cada entrada es una invocación real
de compilador/linter, nunca un regex sobre fuente `.ts`/`.html`.

## 1. `@angular-eslint` — including template a11y

Base rule sets (`@angular-eslint/eslint-plugin`, `@angular-eslint/eslint-plugin-template`) plus the
template accessibility bundle, which is the gap `tier1-tier3-menu.md` #3 flags for Angular projects
that only run axe/harnesses:

```js
import angular from 'angular-eslint';

export default [
  ...angular.configs.tsRecommended,
  {
    files: ['**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility, // a11y rules for templates
    ],
  },
];
```

**Catches**: `alt-text`, `elements-content`, `label-has-associated-control`, `no-autofocus`,
`role-has-required-aria`, `table-scope`, `valid-aria`, `mouse-events-have-key-events`,
`click-events-have-key-events` — the template-level classes an axe pass over rendered output would
also catch, but at LINT time, before a story or a browser is needed. This does not replace `axe`
(#10): axe also catches computed-contrast and runtime ARIA-state issues no static template scan can
see; the two are complementary, not either/or.

**Rollout note**: enabling `templateAccessibility` on an existing template-heavy app WILL surface
findings. Per the no-hidden-failures rule, this lands with zero offenders (fix the templates) or stays
registered-not-enabled until it can.

@es Reglas base más el paquete de a11y de plantillas (ver el bloque de arriba). **Detecta**: los
mismos tipos de problema de plantilla que un pase de axe sobre la salida renderizada, pero en tiempo de
LINT, antes de necesitar una story o un navegador — no reemplaza a axe (#10), que además detecta
contraste computado y estados ARIA en runtime que un escaneo estático de plantilla no ve; son
complementarios. Activar `templateAccessibility` en una app con muchas plantillas existentes VA a
sacar hallazgos — por la regla de no esconder fallos, entra con cero infractores (arreglar las
plantillas) o queda registrada sin activar hasta poder.

## 2. `strictTemplates` (and full `strict` mode)

```jsonc
// tsconfig.json
{
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true
  }
}
```

**Catches**: type errors INSIDE templates — binding a wrong-typed value to an `@Input`, an undefined
property access in an `@if`/`@for` expression, a mismatched event-handler signature. Without it, a
template type error is invisible to `tsc` and only a `ng build` failure (or, worse, a runtime error)
surfaces it. Rollout follows the same zero-offenders discipline as any other new gate — it is common
for `strictTemplates: true` to surface real, pre-existing template bugs on a first run.

@es **Detecta**: errores de tipo DENTRO de las plantillas. Sin esto, un error de tipo en plantilla es
invisible para `tsc` y solo lo saca un fallo de `ng build` (o, peor, un error en runtime). El
despliegue sigue la misma disciplina de cero infractores — es común que `strictTemplates: true` saque
bugs reales y preexistentes de plantilla en la primera corrida.

## 3. Signals / OnPush / control-flow discipline

No single official lint rule covers all of this yet; where a project's ESLint version ships
`@angular-eslint/prefer-on-push-component-change-detection` and
`@angular-eslint/prefer-signals` (check the installed plugin version — these are recent additions),
enable both:

```js
{
  rules: {
    '@angular-eslint/prefer-on-push-component-change-detection': 'error',
    '@angular-eslint/prefer-signals': 'warn',
  },
}
```

Beyond lint, the pattern discipline itself (verify against the project's OWN measured Angular/zoneless
posture before assuming either):
- Control flow is `@if`/`@for`/`@switch` — the legacy `*ngIf`/`*ngFor`/`*ngSwitch` structural
  directives are a deprecation target, not a style choice, once a project has moved past Angular's
  transition window.
- Never `allowSignalWrites: true` inside `effect()` — derive with `computed()`/`linkedSignal()` or
  mutate state signals directly.
- **Zoned vs. zoneless changes what else applies** (`~/.claude/skills/angular-best-practices` has the
  full reference): under zone.js, a global `@HostListener('document:...')` still runs inside the zone
  and can be an unnecessary global-change-detection trigger worth budgeting; under
  `provideExperimentalZonelessChangeDetection()`, that specific concern does not apply. **Measure the
  project's own `zone.js` dependency and `bootstrapApplication` providers before asserting either** —
  do not carry an assumption from one Angular project into another; two real discovery-repo Angular
  codebases already differ on this (one zoned, one zoneless).

@es Sin una única regla de lint oficial que cubra todo esto aún; donde la versión de ESLint instalada
lo tenga, activar `@angular-eslint/prefer-on-push-component-change-detection` y
`@angular-eslint/prefer-signals` (ver bloque arriba). Más allá del lint, la disciplina de patrón
(verificar contra la postura Angular/zoneless MEDIDA del propio proyecto antes de asumir cualquiera):
control de flujo `@if`/`@for`/`@switch`; nunca `allowSignalWrites: true` dentro de `effect()`; y
**zonificado vs. zoneless cambia qué más aplica** — medir la dependencia `zone.js` y los providers de
`bootstrapApplication` del proyecto ANTES de afirmar cualquiera de los dos, nunca arrastrar una
suposición de un proyecto Angular a otro.

## 4. Testing: harnesses over `querySelector`

- Integration specs use `TestbedHarnessEnvironment` + Component Harnesses (official Material ones via
  `HarnessLoader.getHarness(MatXHarness)`, or a project's own harnesses composing them) — never
  `.querySelector`/raw DOM manipulation reaching into a component's internals.
- Enforce with a lint rule banning `querySelector`/`querySelectorAll`/`nativeElement.query` in
  `*.spec.ts` (a project can adapt `b100-am-ui`'s `no-query-selector-in-tests` ESLint rule, or an
  equivalent `no-restricted-syntax` AST selector — never a text-regex ban, per the no-regex mandate).
- A spec that needs a capability no harness exposes ADDS that harness method (if the behavior is
  publicly reachable) or deletes the dead branch with evidence it is unreachable — it never reaches a
  `protected`/`private` member, and never leaves a "no harness reads this" comment beside such an
  access. `b100-am-ui`'s ledger (`missing-harness-capability-left-as-protected-access`) documents two
  real ways this was tried anyway (a comment excusing the gap; a type-cast intersection that reaches
  the member without tripping the visibility check) — both are the same defect, not a third option.

@es Los specs de integración usan `TestbedHarnessEnvironment` + Component Harnesses — nunca
`.querySelector`/manipulación de DOM cruda. Forzar con una regla de lint que prohíba
`querySelector`/`querySelectorAll`/`nativeElement.query` en `*.spec.ts` (AST, nunca regex de texto). Un
spec que necesita una capacidad que ningún harness expone AÑADE ese método de harness (si el
comportamiento es públicamente alcanzable) o borra la rama muerta con evidencia de que es
inalcanzable — nunca llega a un miembro `protected`/`private`, y nunca deja un comentario de excusa al
lado de ese acceso.

## 5. Bundle budgets (`angular.json`)

```jsonc
{
  "budgets": [
    { "type": "initial", "maximumWarning": "500kb", "maximumError": "1mb" },
    { "type": "anyComponentStyle", "maximumWarning": "4kb", "maximumError": "8kb" }
  ]
}
```
See `tier1-tier3-menu.md` #12 for what this catches and its cost.

@es Ver `tier1-tier3-menu.md` #12 para qué detecta y su costo.
