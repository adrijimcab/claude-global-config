# Tabla de reglas comprobables → herramienta que las aplica

Verificado leyendo el repo (no listado de memoria): `node_modules/@base100/eslint-plugin/rules/**`
(23 ficheros de regla, plugin `1.0.0`), `consumer-lint/app-rules.cjs`, `consumer-lint/eslint.cjs`,
`package.json` `exports["./eslint"]` → `./consumer-lint/eslint.cjs`, `tsconfig.json`
`compilerOptions`. Reglas oficiales de `angular-eslint` y `@typescript-eslint`: verificadas contra
`README.md` de `angular-eslint/eslint-plugin` y `eslint-plugin-template` en GitHub (fetched
2026-09-29), no citadas de memoria.

## Reglas propias de `@base100/eslint-plugin` (23 reglas)

| Regla (`b100/…`) | Qué impide/exige | ¿Shippeada a consumidores vía `@base100/b100-am-ui/eslint`? |
|---|---|---|
| `require-onpush` | Componente sin `ChangeDetectionStrategy.OnPush` | Sí |
| `wrap-devmode-guards` | `injectDevWarnGuard`/`injectA11yAssert` sin guard `ngDevMode` literal | Sí |
| `no-allow-signal-writes` | `allowSignalWrites: true` en `effect()` | Sí |
| `no-ngclass-ngstyle` | `NgClass`/`NgStyle` en vez de `[class]`/`[style]` | Sí |
| `no-double-cast` | `as unknown as T` | Sí |
| `no-bare-dom-globals` | `document`/`window` sueltos (rompe SSR) | Sí |
| `no-input-output-decorator` | `@Input`/`@Output` en vez de `input()`/`output()` | Sí |
| `prefer-inject` | Inyección por constructor en vez de `inject()` | Sí |
| `require-readonly-signals` | Propiedad-signal de estado no `readonly` | Sí |
| `prefer-control-flow` | `*ngIf`/`*ngFor`/`*ngSwitch` en vez de `@if`/`@for`/`@switch` | Sí |
| `no-global-document-listener` | `@HostListener('document:...')` | Sí |
| `no-untyped-signals` | Signal cuyo tipo se ensancha en silencio | Sí |
| `no-dead-ngmodule-import` | NgModule importado sin uso real en plantilla | Sí |
| `rtl-arrow-key-directionality` | Flechas de teclado sin resolución lógica RTL | Sí |
| `no-query-selector-in-tests` | `.querySelector`/DOM manipulation en specs | Sí |
| `require-bilingual-jsdoc` | API publicada sin JSDoc EN+ES | No — política de idioma de la app es suya |
| `require-standalone-directive` | Declarar `standalone: true` explícito | No — angular.dev pide NO escribirlo (default desde v19) |
| `import-group-order` | Orden de imports de la casa | No — convención interna del autor de la librería |
| `no-uppercase-todo` | `TODO` en mayúsculas | No — proceso interno de marcado, no contrato Angular |
| `token-scope-boundary` | Fuga de identidad DI entre entry points ng-packagr | No — una app tiene un único grafo de bundle |
| `no-rxjs-stream-in-view` | Stream RxJS vive en la vista, no en el contenedor | No — decisión de arquitectura de la app |
| `require-import-group-labels` | Comentario de etiqueta por grupo de import | No (herramienta interna) |
| `story-bilingual-name` | Nombre de story sin bilingüe | No (Storybook, no shippeado) |
| `sync-devmode-components` | Componentes devmode desincronizados | No (interno) |

Partición verificada en `consumer-lint/app-rules.cjs`: `APP_RULES` (15 reglas adoptadas) +
`LIBRARY_AUTHORING_RULES` (6 reglas explícitamente excluidas con motivo) — el propio repo tiene un
test (`testing/app-rules.spec.ts`, no leído en esta sesión) que prueba que ambos conjuntos
particionan EXACTAMENTE el preset instalado, así que toda regla nueva del plugin fuerza una
decisión explícita aquí, nunca queda huérfana.

## Reglas oficiales `angular-eslint` (paquete `eslint-plugin`, fetched del README real)

| Regla oficial | Qué exige/impide | Equivalente/solapa con regla `b100/…` |
|---|---|---|
| `@angular-eslint/prefer-on-push-component-change-detection` | Componente sin `OnPush` | `require-onpush` |
| `@angular-eslint/prefer-inject` | Constructor DI en vez de `inject()` | `prefer-inject` |
| `@angular-eslint/prefer-signals` | Decoradores legacy en vez de signals | `no-input-output-decorator` (parcial) |
| `@angular-eslint/prefer-signal-model` | `@Input`+`@Output` two-way en vez de `model()` | — |
| `@angular-eslint/prefer-standalone` | Componente/directiva/pipe no standalone | — (n/a: standalone es default) |
| `@angular-eslint/no-input-rename` | Alias de `@Input`/`input()` | — |
| `@angular-eslint/no-output-rename` / `no-output-native` / `no-output-on-prefix` | Malas prácticas de nombrado de outputs | — |
| `@angular-eslint/prefer-output-readonly` | Output no `readonly` | — |
| `@angular-eslint/contextual-lifecycle` | Lifecycle method mal ubicado | — |
| `@angular-eslint/use-lifecycle-interface` | Falta implementar `OnInit`/`OnDestroy` etc. | — |
| `@angular-eslint/no-lifecycle-call` | Llamada explícita a un lifecycle method | — |
| `@angular-eslint/use-injectable-provided-in` | `@Injectable()` sin `providedIn` (no tree-shakable) | — |
| `@angular-eslint/component-max-inline-declarations` | Plantilla/estilos inline excesivos | — |
| `@angular-eslint/no-async-lifecycle-method` | Lifecycle method `async` | — |
| `@angular-eslint/no-uncalled-signals` | Lógica sobre el signal en vez de su valor (`if (mySignal)` sin `()`) | — |

## Reglas oficiales `angular-eslint` (paquete `eslint-plugin-template`)

| Regla oficial | Qué exige/impide | Equivalente/solapa con regla `b100/…` |
|---|---|---|
| `@angular-eslint/template/prefer-control-flow` | `*ngIf`/`*ngFor`/`*ngSwitch` en vez de `@if`/`@for`/`@switch` (recommended) | `prefer-control-flow` |
| `@angular-eslint/template/prefer-class-binding` | `ngClass` en vez de `[class]` | `no-ngclass-ngstyle` |
| `@angular-eslint/template/prefer-style-binding` | `ngStyle` en vez de `[style]` | `no-ngclass-ngstyle` |
| `@angular-eslint/template/use-track-by-function` | `*ngFor` sin `trackBy` (legado; `@for` exige `track` a nivel de compilador) | — |
| `@angular-eslint/template/prefer-ngsrc` | `<img src>` en vez de `ngSrc` | equivalente a la política de `angular-rendering-policy` (owner skill) |
| `@angular-eslint/template/no-any` | `$any()` en plantillas (anula el sistema de tipos) | — |
| `@angular-eslint/template/eqeqeq` | `==`/`!=` en plantillas (recommended, fixable) | — |
| `@angular-eslint/template/banana-in-box` | Sintaxis two-way incorrecta (`([x])` en vez de `[(x)]`) (recommended) | — |
| `@angular-eslint/template/click-events-have-key-events` | Click sin evento de teclado equivalente (a11y) | — |
| `@angular-eslint/template/mouse-events-have-key-events` | mouseover/mouseout sin focus/blur (a11y) | — |
| `@angular-eslint/template/alt-text` | Elemento sin alt/aria-label (a11y) | — |
| `@angular-eslint/template/role-has-required-aria` | Rol ARIA sin propiedades requeridas (a11y) | — |
| `@angular-eslint/template/valid-aria` | Atributos/valores ARIA inválidos (a11y) | — |
| `@angular-eslint/template/table-scope` | `scope` fuera de `<th>` (a11y) | — |
| `@angular-eslint/template/no-autofocus` | Atributo `autofocus` (a11y, fixable) | — |
| `@angular-eslint/template/no-interpolation-in-attributes` | Interpolación en vez de property-binding | — |

## Reglas `@typescript-eslint` / flags de `tsconfig.json` relevantes

Verificado leyendo `tsconfig.json` de este repo (`compilerOptions`, no listado de memoria):

| Flag / regla | Qué impide/exige | ¿Activo en este repo (`tsconfig.json`)? |
|---|---|---|
| `strict` | Paraguas de todas las de abajo | Sí |
| `strictNullChecks` | `null`/`undefined` explícitos en el tipo | Sí |
| `noUncheckedIndexedAccess` | Acceso a índice de array/objeto sin `undefined` en el tipo | Sí |
| `exactOptionalPropertyTypes` | `{x?: string}` no acepta `x: undefined` explícito | Sí |
| `noPropertyAccessFromIndexSignature` | Forzar `obj['key']` en vez de `obj.key` sobre index signatures | Sí |
| `noImplicitOverride` | `override` explícito al sobreescribir un miembro | Sí |
| `noImplicitReturns` | Toda ruta de una función debe retornar (o ninguna) | Sí |
| `noFallthroughCasesInSwitch` | `case` sin `break`/`return` | Sí |
| `useUnknownInCatchVariables` | `catch (e)` tipado `unknown`, no `any` | Sí |
| `noUnusedLocals` / `noUnusedParameters` | Variables/parámetros sin usar | Sí |
| `verbatimModuleSyntax` | Imports/exports de tipo explícitos (`import type`) | Sí |
| `@typescript-eslint/no-unsafe-*` (strict-type-checked) | Operaciones sobre `any` implícito | Vía `typescript-eslint` peer `^8.0.0`, no leído el preset exacto en esta sesión |
| `@typescript-eslint/unbound-method` | Método pasado sin bind (false-positive con `Validators.required`) | Requiere override quirúrgico — ver `eslint-strict-angular-forms` (owner skill) |
| `no-restricted-syntax` (regex ban, M5) | Prohíbe parsing con regex en el dominio de este proyecto | Mandato propio del repo (AGENT-LEDGER M5), NO es una regla de `@base100/eslint-plugin` ni se shippea a consumidores — vive en `eslint.config.ts` de este repo únicamente |

## Lighthouse / axe (gates de calidad, no de ESLint)

| Check | Qué mide | Dónde vive en este repo |
|---|---|---|
| axe-core (`check:a11y`) | Violaciones WCAG en Storybook renderizado | Gate propio del repo (`npm run check:a11y`), no forma parte del paquete publicado |
| Lighthouse (performance budgets) | LCP/CLS/TBT sobre la demo real | `playwright/visual-stories.ts` + configuración propia, no shippeada |
| `check:bundle-size` | Tamaño de bundle por entry point | Gate propio, deriva de `angular.json`/build; no shippeado como regla ESLint |

Estos tres NO son reglas ESLint — son gates de build/CI. Se listan porque el encargo pide "el
axe/Lighthouse check" junto a la regla ESLint equivalente cuando exista una combinación (p. ej.
`@angular-eslint/template/alt-text` detecta en código fuente lo que axe confirma en runtime
renderizado — son complementarias, no sustitutas una de la otra).
