---
name: angular-best-practices
description: >
  Current Angular (v19-v22) architecture and API best practices: standalone components, feature
  folders, container/presentational, route-level DI, signals (signal/computed/linkedSignal/resource),
  zoneless change detection, @if/@for/@switch control flow, typed reactive forms and Signal Forms
  status, SSR/hydration/incremental hydration, @defer, NgOptimizedImage, security (sanitization,
  bypassSecurityTrust, CSP, Trusted Types), CDK accessibility, and harness-based testing. Trigger:
  writing, reviewing or refactoring Angular components, directives, services, pipes, templates,
  routes, app.config.ts, or SSR/server.ts files.
paths: "**/*.component.ts,**/*.directive.ts,**/*.service.ts,**/*.pipe.ts,**/*.html,**/app.config.ts,**/*.routes.ts,**/*.routes.server.ts,**/server.ts"
license: MIT
metadata:
  author: b100-am-ui-research
  version: "1.0"
  angular_range: "19-22"
  origin: "research/frontend-skills/angular-ts, drafted 2026-09-29"
---

# Angular — arquitectura y APIs actuales (v19 → v22)

Fuentes primarias: angular.dev (guide, best-practices, api, roadmap), Angular Components
(material.angular.dev / angular/components), TypeScript handbook. Cada regla cita su URL. Cuando el
dato viene de una versión concreta de Angular medida en `angular.dev/reference/releases` o
`angular.dev/roadmap` (fetched 2026-09-29), se marca `[verificado]`; cuando viene de conocimiento
general del modelo sin fetch directo en esta sesión, se marca `[no verificado en esta sesión]`.

**Estado real de versión (verificado):** `angular.dev/reference/releases` — v20.0.0 released
2025-05-28, v21.0.0 released 2025-11-19 (ya en LTS, soporte activo terminó 2026-06-03), v22.0.0
released 2026-06-03 (activo). v19 ya NO tiene soporte. Si tu proyecto está fijado en Angular 19.x
(como el peerDependency de `@base100/b100-am-ui`, `>=19.2.14 <20.0.0`), la migración pendiente real
son **tres** mayores (20, 21, 22), no una.

## 1. Arquitectura

- **Standalone es el default desde v19** — no se escribe `standalone: true` (ya no aporta
  información; angular.dev/style-guide lo pide explícitamente. Ver `no-standalone-decorator`
  migration). NgModule sigue soportado pero es el camino legacy.
- **Organización por feature, no por tipo de fichero.** angular.dev/style-guide: agrupar
  `movie-reel/show-times/film-calendar/` en vez de carpetas `components/`, `directives/`,
  `services/` transversales. "Un concepto por fichero." — https://angular.dev/style-guide
- **Container/presentational**: mismo principio que React — un componente "smart" (inyecta
  servicios, orquesta estado) compone componentes "dumb" (`input()`/`output()` puros, `OnPush`).
  angular.dev no lo nombra así, pero lo prescribe indirectamente: "Componentes y directivas deben
  centrarse en la presentación, refactoriza la lógica compleja a otro sitio" —
  https://angular.dev/style-guide
- **`inject()` sobre inyección por constructor.** angular.dev/style-guide: mejor inferencia de
  tipos, más legible con muchas dependencias. Regla ejecutable:
  `@angular-eslint/prefer-inject`.
- **DI a nivel de ruta**: `app.config.ts` lleva SOLO providers verdaderamente globales (los que
  necesita el shell — header/footer/interceptors/startup); todo lo feature-specific va en
  `providers: []` de la ruta con `loadComponent`. Ver
  `angular-route-level-di/SKILL.md` (atribuido: `adrii-docs/skills/angular-route-level-di`,
  incidente real de bundle inflado por 10+ providers globales). La ruta raíz `''` es SIEMPRE
  `loadComponent`, nunca `component` eager.
- **Inyecta el contrato (`InjectionToken`), no la clase concreta**, cuando el consumer puede
  necesitar swap/mock (repository/port/adapter). Ver `angular-inject-via-token/SKILL.md`
  (atribuido: `adrii-docs/skills/angular-inject-via-token`, incidente NG0201 real). Excepción:
  Angular built-ins (`HttpClient`, `Router`) y servicios `providedIn: 'root'` genuinamente únicos.
- **`effect()` SIEMPRE en injection context** (constructor, factory, o
  `runInInjectionContext`). NUNCA dentro de `afterNextRender()`, `ngOnInit()`, callbacks de
  observers o `setTimeout` — produce NG0203 silencioso. Ver
  `angular-effect-injection-context/SKILL.md` (atribuido:
  `adrii-docs/skills/angular-effect-injection-context`, incidente real en producción).

## 2. Signals y reactividad

Ver `references/signals-and-reactivity.md` para el detalle completo por versión.

Resumen ejecutable:
- `signal()`, `computed()` (memoizado, lazy) y `effect()` son el núcleo estable.
  https://angular.dev/guide/signals
- `linkedSignal()` — signal escribible cuya computación lo resetea cuando cambian sus
  dependencias. `[verificado]` API estable, https://angular.dev/api/core/linkedSignal
- `resource()` / `httpResource()` — operaciones de lectura async proyectadas a signals; cancelan
  la carga en curso vía `AbortSignal` cuando el `request` cambia o el resource se destruye (por
  eso NO sirven para mutaciones). `[verificado]` listados como "developer stable" en
  https://angular.dev/roadmap (fetched 2026-09-29) y https://angular.dev/api/core/resource.
- **`allowSignalWrites: true` en `effect()` — PROHIBIDO.** Coincide exactamente con el mandato
  M-ledger de este proyecto (AGENT-LEDGER §8: "NEVER `allowSignalWrites: true` inside `effect()`
  — derive with `computed()`/`linkedSignal()` or mutate state signals directly"). Regla ejecutable
  propia del proyecto: `b100/no-allow-signal-writes` (ver tabla de gates).
- `input()`/`model()`/`output()` sustituyen a `@Input`/`@Output`. `output()` se introdujo en v17.3
  y es "production ready" desde v19 `[verificado]` —
  https://angular.dev/reference/migrations/outputs. Regla ejecutable:
  `@angular-eslint/prefer-signals`, `@angular-eslint/prefer-signal-model`,
  `@angular-eslint/no-input-rename`, `@angular-eslint/prefer-output-readonly`.
- Un signal reasignado (no `readonly`) deja de ser el signal al que se suscribió la plantilla —
  siempre declarar signals de estado como `readonly` en la clase. Regla ejecutable propia:
  `b100/require-readonly-signals`.

## 3. Templates y control flow

- `@if`/`@for`/`@switch` son el control flow **nativo del compilador** (no directivas
  estructurales) desde Angular 17; `*ngIf`/`*ngFor`/`*ngSwitch` siguen funcionando pero
  angular.dev los presenta como el camino legacy y el propio linter migra automáticamente.
  https://angular.dev/guide/templates/control-flow
- `@for` **exige** una expresión `track` (no opcional): identidad estable para minimizar
  reconciliación DOM. Variables de contexto: `$index`, `$first`, `$last`, `$even`, `$odd`,
  `$count`. Bloque `@empty` para el caso vacío.
- `@switch` soporta exhaustividad: `@default { never }` para forzar que el compilador marque
  ramas no cubiertas.
- `[class]`/`[style]` nativos en vez de `NgClass`/`NgStyle` — angular.dev/style-guide lo dice
  explícitamente. Regla ejecutable: `@angular-eslint/template/prefer-class-binding` /
  `prefer-style-binding`; regla propia `b100/no-ngclass-ngstyle`.
- **Nunca inline `[style.xxx]` en rutas SSR con CSP estricto** (`style-src` sin `unsafe-inline`):
  Angular serializa `[style.xxx]` a `style=""` en el HTML del server, que el CSP bloquea; después
  de la hidratación funciona vía JS porque `element.style.setProperty()` no está gobernado por
  `style-src`. Alternativas: clases CSS para estados discretos, CSS custom properties actualizadas
  vía `effect()` DENTRO de `afterNextRender()` (nunca al revés — ver §1) para valores continuos, o
  una directiva dedicada para colores arbitrarios de usuario. Ver
  `angular-ssr-csp-inline-styles/SKILL.md` (atribuido:
  `adrii-docs/skills/angular-ssr-csp-inline-styles`, incidente real de producción).

## 4. Change detection y zoneless

- **Zoneless es el default en Angular v21+** `[verificado]` (https://angular.dev/guide/zoneless,
  fetched 2026-09-29). Angular v20 requería `provideZonelessChangeDetection()` explícito.
- Funciona por notificación explícita: `ChangeDetectorRef.markForCheck()`, escritura de signals,
  `AsyncPipe`, listeners de eventos enlazados en plantilla. `OnPush` es "recomendado" para
  zoneless pero no estrictamente obligatorio — un componente `Default` funciona si notifica
  cambios por las APIs correctas.
- Una librería/directiva de terceros bajo zoneless NO puede usar
  `NgZone.onMicrotaskEmpty`/`onUnstable`/`onStable` (nunca emiten); sí puede seguir usando
  `NgZone.run`/`runOutsideAngular`. En SSR, usar `PendingTasks` para señalar trabajo async
  pendiente antes de serializar.
- Coincide con el mandato de este proyecto: todo componente publicado es `OnPush`, verificado por
  `b100/require-onpush` (que en consumo se re-expone como
  `@angular-eslint/prefer-on-push-component-change-detection`).
- **`@HostListener('document:...')` bajo zoneless NO causa fugas globales de CD** — sin
  zone-patching no hay ese riesgo; no inventar ese problema donde no aplica (nota explícita del
  propio AGENT-LEDGER §8). Sí sigue siendo mejor práctica de limpieza usar `Renderer2.listen`
  dentro de un `effect()` atado a un signal `isOpen()`, por gestión de ciclo de vida, no por CD.

## 5. Formularios

- **Reactive Forms tipados es el estándar actual y estable**: `FormControl<T>` infiere tipo del
  valor inicial; `nonNullable` evita null en reset; `FormGroup` tipado por claves conocidas;
  `FormRecord<T>` para grupos dinámicos de claves no conocidas; `FormArray<T>` homogéneo (usar
  `UntypedFormArray` solo para arrays heterogéneos reales). https://angular.dev/guide/forms/typed-forms
- **Signal Forms**: listado en https://angular.dev/roadmap (fetched 2026-09-29) bajo
  "Production-ready" features junto a Resource API, httpResource, zoneless, Linked Signal,
  incremental hydration, Event replay, route-level render mode. **Contradicción de premisa a
  reportar**: no hay Signal Forms en Angular 19 (el peerDependency de esta librería) — es una API
  que llegó en versiones posteriores. Antes de recomendarla en código de producción sobre 19.2,
  confirmar en qué versión exacta salió de "experimental" — angular.dev no publica esa fecha en
  las páginas fetcheadas aquí. Tratar como `[no verificado con precisión]` hasta confirmar la
  versión exacta de estabilización.
- `Validators.required`/`Validators.email` pasados como referencia (sin ejecutar) a
  `FormBuilder.group()` es el uso OFICIAL de la API — un ESLint `strict-type-checked` sin override
  marca esto como `@typescript-eslint/unbound-method` en falso. Ver
  `eslint-strict-angular-forms/SKILL.md` (atribuido:
  `adrii-docs/skills/eslint-strict-angular-forms`) para los dos overrides quirúrgicos necesarios
  (components/directives/pipes: `unbound-method` off; specs: set de `no-unsafe-*` off) — nunca
  apagar `strict-type-checked` global.

## 6. SSR, hidratación e hidratación incremental

Ver `references/ssr-hydration-performance.md` para el detalle.

- `provideClientHydration()` habilita hidratación completa (reutiliza el DOM del servidor).
  https://angular.dev/guide/hydration
- **Event replay** (v18+, `[verificado]` estable): captura interacciones del usuario antes de
  terminar la hidratación y las reproduce después, vía `withEventReplay()`.
- **Hidratación incremental**: integrada con `@defer` mediante triggers `hydrate on <trigger>`
  (interaction, hover, viewport, idle, timer, when) y `hydrate never` (mantiene el subárbol
  deshidratado indefinidamente). Hidratar un bloque hijo dispara automáticamente la hidratación de
  todos sus padres, en orden jerárquico. https://angular.dev/guide/incremental-hydration. Está
  activa por defecto junto con `provideClientHydration()` y activa event replay automáticamente.
- i18n: Angular salta la hidratación de componentes con `$localize`/i18n por defecto; se habilita
  con `withI18nSupport()`.
- **En SSR, nunca asignar la IDL property** (`link.href = url`) para `<link>` inyectados por
  código — Angular no serializa asignaciones de propiedad a atributos HTML en el DOM de servidor;
  usar siempre `setAttribute('href', url)`. Las URLs de preload deben ser browser-facing SIEMPRE
  (sin branching `isServer`), y todo preload inyectado en `<head>` debe limpiarse en
  `ngOnDestroy` (el router hace navegación SPA; los `<link>` sobreviven entre rutas). Ver
  `angular-lcp-preload-ssr/SKILL.md` (atribuido: `adrii-docs/skills/angular-lcp-preload-ssr`,
  incidente real de warnings de producción).

## 7. Rendimiento

- **`@defer` es una herramienta de APLICACIÓN, no de librería.** Solo componentes/directivas/pipes
  standalone pueden diferirse, y no deben referenciarse fuera del bloque ni en `ViewChild`.
  Triggers: `idle` (default), `viewport`, `interaction`, `hover`, `immediate`, `timer`, `when`
  (evaluación única); `prefetch on <trigger>` separado del trigger de render. Sub-bloques
  `@placeholder`(con `minimum`), `@loading` (con `after`/`minimum`), `@error`.
  https://angular.dev/guide/templates/defer
  **Coincide con el mandato de este proyecto (AGENT-LEDGER §8): una librería NUNCA `@defer` su
  propio contenido interno — la decisión de diferir pertenece al consumidor, que envuelve
  `<b100-x>` en su propio `@defer`.** Motivo técnico, no solo de convención: un `@defer` interno
  rompe lecturas `viewChild.required` en `ngAfterViewInit`, el `contentTemplate` del consumidor, y
  SSR/harnesses si el contenido nunca entra en viewport. `@defer (on viewport)` para contenedores
  pesados SÍ es correcto dentro de una app/demo.
- **`NgOptimizedImage`**: `ngSrc` en vez de `src`; `width`/`height` obligatorios (o `fill` con
  contenedor `position: relative/fixed/absolute` + `sizes`); `priority` para el elemento LCP
  (fija `fetchpriority=high`, `loading=eager`, genera preload SSR automático — Angular avisa en
  dev si el LCP no lo lleva). Estable desde Angular 15 (retro-portado a 13.4.0/14.3.0).
  https://angular.dev/guide/image-optimization. Coincide con
  `angular-rendering-policy/SKILL.md` (atribuido: `adrii-docs/skills/angular-rendering-policy`):
  cero `<img>` crudo, cero zoom/scale/`object-fit` manual peleando con el directive.
- `@for` con `track` correcto es en sí una optimización de rendimiento (evita recrear DOM);
  gate: `@angular-eslint/template/use-track-by-function` para el legado `*ngFor`.
- Presupuestos de bundle: `angular.json` → `budgets` (`initial`, `anyComponentStyle`) con
  `maximumWarning`/`maximumError`; es la puerta que un CI real debe fallar si el bundle crece.

## 8. Seguridad

- **Sanitización automática por defecto**: Angular trata todo valor como no confiable y sanea
  según el contexto (HTML, Style, URL, Resource URL) en cada binding/interpolación.
  https://angular.dev/best-practices/security
- `DomSanitizer.bypassSecurityTrust{Html,Script,Style,Url,ResourceUrl}` — **introduce una
  vulnerabilidad si el valor confiado puede ser malicioso**; solo tras revisión de seguridad y
  construyendo el valor lo más cerca posible del dato de entrada.
- **Trusted Types**: Angular soporta la plataforma Trusted Types (políticas `angular`,
  `angular#unsafe-bypass`, `angular#unsafe-jit`, `angular#bundler`) para prevenir XSS basado en
  DOM.
- **CSP estricta recomendada**: `default-src 'self'` + `style-src`/`script-src` con nonce
  aleatorio por request; para hosting estático sin nonce por request, Angular CLI ofrece
  `security.autoCsp` (hashea scripts inline automáticamente).
- `HttpClient` lee el token XSRF de cookie e inyecta el header automáticamente en mutaciones;
  configurable con `withXsrfConfiguration()` o desactivable con `withNoXsrfProtection()` (rara vez
  correcto desactivarlo).

## 9. Accesibilidad con el CDK

- `FocusTrap`/`cdkTrapFocus` — atrapa el foco por Tab dentro de un contenedor (diálogos, menús).
- `LiveAnnouncer` — anuncia mensajes a lectores de pantalla vía una región `aria-live`.
- `FocusMonitor`/`cdkMonitorElementFocus` — detecta el origen del foco (mouse/teclado/programático)
  para estilos de foco visible correctos.
- `FocusKeyManager`/`ListKeyManager`/`ActiveDescendantKeyManager` — navegación por teclado entre
  opciones (listas, menús, comboboxes) implementando `FocusableOption`.
- Mixin Sass `high-contrast` (`cdk/a11y`) — estilos condicionados a `forced-colors`, para Windows
  High Contrast Mode.
- Referencia: https://github.com/angular/components (paquete `cdk/a11y`).

## 10. Testing

- **Harnesses de componente**: un harness custom COMPONE harnesses oficiales de Material vía
  `this.locatorFor(MatXHarness)`/`locatorForAll` — nunca queries a clases nativas de Material
  (`.mat-mdc-...`). `TestbedHarnessEnvironment.loader(fixture)` para elementos dentro del fixture,
  `.documentRootLoader(fixture)` para elementos fuera de él (diálogos en `document.body`),
  `.harnessForFixture(fixture, HarnessType)` cuando el propio componente bootstrapeado necesita
  harness. Fuente: `github.com/angular/components` `src/cdk/testing/test-harnesses.md`.
- Gate ejecutable: `b100/no-query-selector-in-tests` (cero `.querySelector`/DOM manipulation en
  specs; usar `TestbedHarnessEnvironment` + Harnesses).
- TestBed bajo zoneless no requiere zone.js; usar `provideZonelessChangeDetection()` en el
  testing module cuando la app es zoneless (evita falsos negativos de detección de cambios en
  tests que asumían zone.js).
- Vitest: dado que este proyecto ya usa Vitest con `strictTypeChecked`, los matchers (`vi.fn()`,
  `expect().toBe()`) están tipados de forma que ESLint estricto los marca en falso como
  `no-unsafe-*`/`non-nullable-type-assertion-style`/`no-non-null-assertion` — ver §5 (mismo
  skill de overrides de `eslint-strict-angular-forms`, aplica igual a specs de servicios).

## 11. Gate table (reglas comprobables → herramienta)

Ver `references/gate-table.md` para la tabla completa con las 23 reglas del plugin propio
`@base100/eslint-plugin`, cuáles de ellas se shippean a consumidores vía
`@base100/b100-am-ui/eslint` (verificado leyendo `consumer-lint/app-rules.cjs` y
`consumer-lint/eslint.cjs` de este repo), y las reglas oficiales de `angular-eslint`/
`@typescript-eslint` equivalentes.

## 12. Contradicciones o brechas frente a AGENT-LEDGER §8

Ninguna regla de este skill contradice el §8 de `.claude/AGENT-LEDGER.md`. Coincidencias
verificadas explícitamente: `@if`/`@for` únicos (§8 y §3 aquí), `no allowSignalWrites` (§8 y §2
aquí), Harnesses componen Material (§8 y §10 aquí), `[class]`/`[style]` nativos (§8 y §3 aquí),
`@defer` fuera de componentes de librería (§8 y §7 aquí — aquí además se documenta el motivo
técnico exacto: dependencias no pueden referenciarse fuera del bloque, lo que rompe
`viewChild.required`/`contentTemplate`/SSR). La única brecha es de **versión**: §8 y el resto del
proyecto asumen Angular 19; angular.dev ya documenta v22 como actual (§0 de este fichero) y
Signal Forms como "production-ready" en el roadmap — una API que no existe en el 19.2 que este
repo fija como peer. Repórtese al dueño antes de recomendar Signal Forms en código de producción
de este repo.
