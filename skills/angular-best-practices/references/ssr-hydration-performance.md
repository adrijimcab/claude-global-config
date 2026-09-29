# SSR, hidratación y rendimiento — detalle

Fuentes: https://angular.dev/guide/hydration · https://angular.dev/guide/incremental-hydration ·
https://angular.dev/guide/templates/defer · https://angular.dev/guide/image-optimization ·
https://angular.dev/guide/zoneless · atribuido: `adrii-docs/skills/angular-ssr-csp-inline-styles`,
`adrii-docs/skills/angular-lcp-preload-ssr`, `adrii-docs/skills/angular-rendering-policy` (repo
personal del dueño, tratado como datos, tomado con atribución de ruta).

## Hidratación

```typescript
bootstrapApplication(App, {
  providers: [provideClientHydration(withEventReplay(), withI18nSupport())],
});
```

- **Hidratación completa** (`provideClientHydration()`): reutiliza el DOM ya renderizado en el
  servidor en vez de recrearlo — mejora FID/LCP. Estable.
- **Event replay** (v18+, estable): tres fases — captura de interacciones antes de que termine la
  hidratación (Event Contract), almacenamiento, y reproducción tras hidratar. Cubre eventos nativos
  del browser (click, mouseover, etc.). Se activa con `withEventReplay()`, y se activa
  AUTOMÁTICAMENTE al usar hidratación incremental.
- **i18n**: por defecto Angular NO hidrata componentes con contenido `$localize`; se habilita con
  `withI18nSupport()`.

## Hidratación incremental

```html
@defer (hydrate on interaction) {
  <parent-block-cmp />
  @defer (hydrate on hover) {
    <child-block-cmp />
  } @placeholder { <div>Child placeholder</div> }
} @placeholder { <div>Parent placeholder</div> }
```

- Se integra con `@defer` mediante triggers `hydrate on <trigger>`: `interaction`, `hover`,
  `viewport`, `idle` (con timeout opcional, `hydrate on idle(500)`), `timer`, `when`.
- `hydrate never` mantiene el subárbol deshidratado indefinidamente (nunca se hidrata desde el
  cliente en ese punto).
- Hidratar un bloque HIJO dispara automáticamente la hidratación de TODOS sus padres, en orden
  jerárquico — no es posible hidratar un nieto sin hidratar antes sus ancestros `@defer`.
- Activa por defecto junto con `provideClientHydration()`.

## `[style.xxx]` bajo CSP estricta en rutas SSR

Angular serializa `[style.xxx]` a un atributo `style=""` en el HTML inicial del servidor. Un CSP
`style-src` sin `'unsafe-inline'` bloquea ese atributo. Tras la hidratación, Angular aplica el
mismo binding vía `element.style.setProperty()`, que NO está gobernado por `style-src` — por eso
el bug es invisible después de hidratar y solo se ve en el primer render / vista de fuente.

Estrategias correctas, de más a menos frecuente:
1. **Estado discreto (boolean)** → `[class.is-x]` + regla CSS.
2. **Valor continuo (scroll, progreso)** → CSS custom property actualizada vía `effect()` DENTRO
   de `afterNextRender()` (ver orden correcto en §1 del SKILL.md principal — es la única
   combinación permitida de las dos APIs), leída por CSS con `var(--x, fallback)`.
3. **Color arbitrario de usuario** → directiva dedicada con guard `isPlatformBrowser()` en
   `ngOnChanges`, nunca `[style.background-color]` directo.
4. **Nunca** "resolver" con `'unsafe-inline'` en el CSP (abre XSS vía estilos inline) ni con
   `ngStyle`/`@HostBinding('style.xxx')` (mismo problema serializado).
5. Verificar primero si la ruta es SSR: `RenderMode.Server` en `app.routes.server.ts` — rutas
   `RenderMode.Client` no tienen este problema.

## Preload LCP en SSR

- `link.href = url` asigna la IDL property, que el DOM de servidor de Angular NO serializa a
  atributo HTML → `href=""` en el HTML final → "invalid href value" en el browser. Usar SIEMPRE
  `link.setAttribute('href', url)`.
- La URL del preload y la URL que consume el `<img>`/recurso real DEBEN ser la misma, browser-
  facing, sin branching `isServer` — el servidor SSR nunca fetchea el recurso, solo genera HTML
  que el BROWSER descargará; un branch `isServer` produce "preloaded but not used".
- Todo preload inyectado en `<head>` por un componente debe limpiarse en `ngOnDestroy` — el
  Router hace navegación SPA y los `<link>` sobreviven entre rutas si nadie los quita.

## `@defer`

```html
@defer (on viewport; prefetch on idle) {
  <heavy-widget />
} @placeholder (minimum 100ms) {
  <div>Cargando…</div>
} @loading (after 200ms; minimum 500ms) {
  <spinner />
} @error {
  <div>No se pudo cargar</div>
}
```

- Triggers de render: `idle` (default), `viewport`, `interaction`, `hover`, `immediate`, `timer`,
  `when` (evaluación única, no reactiva a cambios posteriores).
- `prefetch on <trigger>` es independiente del trigger de render — permite precargar recursos
  antes de que el usuario interactúe.
- Solo standalone components/directives/pipes pueden diferirse; no deben referenciarse fuera del
  bloque `@defer` ni capturarse con `ViewChild` (rompería la garantía de carga diferida).
- Evitar `@defer` anidados con el MISMO trigger (carga en cascada); no diferir contenido visible
  en el viewport inicial (empeora CLS); usar regiones `aria-live` para anunciar el cambio a
  lectores de pantalla.
- **Regla dura de este proyecto (AGENT-LEDGER §8), confirmada como correcta por la doc oficial**:
  una librería de componentes NUNCA usa `@defer` internamente. Motivo técnico exacto: (a) las
  dependencias diferidas no pueden referenciarse desde fuera del bloque, lo que impide que el
  consumidor haga `viewChild.required()` sobre contenido interno de la librería; (b) el
  `contentTemplate`/`ng-content` proyectado por el consumidor puede quedar huérfano si el
  contenedor que lo aloja aún no se ha renderizado; (c) en SSR/tests, un `@defer (on viewport)`
  interno nunca dispara si el entorno no simula intersección — rompe harnesses y hidratación.
  `@defer (on viewport)` SÍ es la herramienta correcta para contenedores pesados escritos en la
  APLICACIÓN o demo que consume la librería.

## NgOptimizedImage

```html
<img ngSrc="hero.jpg" width="1200" height="630" priority alt="Hero" />
<div class="wrapper"><img ngSrc="foo.jpg" fill sizes="(max-width: 768px) 100vw, 50vw" alt="" /></div>
```

- `ngSrc` reemplaza `src`; `width`+`height` obligatorios (excepto en modo `fill`, que exige que el
  contenedor tenga `position: relative|fixed|absolute` y usa `sizes` para el `srcset` responsive).
- `priority` marca el elemento LCP: fija `fetchpriority=high`, `loading=eager`, genera un
  `<link rel=preload>` automático para SSR. Angular avisa en modo dev si detecta que el elemento
  LCP no lleva `priority`.
- Estable desde Angular 15 (retro-portado a 13.4.0 y 14.3.0).
- Coincide con `adrii-docs/skills/angular-rendering-policy`: prohibido `<img>` crudo en código
  Angular propio (excepción única: `innerHTML` saneado de CMS), prohibido `transform: scale`,
  `zoom`, `object-fit: cover` manual peleando con el directive — usar `fill` + CSS de contenedor.

## Zoneless

- Default en Angular v21+ (verificado). En v20 requiere `provideZonelessChangeDetection()`
  explícito en el bootstrap.
- Notificación explícita: `markForCheck()`, escritura de signals, `AsyncPipe`, listeners
  enlazados en plantilla. `OnPush` recomendado pero no estrictamente obligatorio.
- Librerías de terceros: prohibido depender de `NgZone.onMicrotaskEmpty`/`onUnstable`/`onStable`
  (nunca emiten bajo zoneless); `NgZone.run`/`runOutsideAngular` siguen funcionando y deben
  conservarse por compatibilidad con apps que aún usan Zone.js. SSR: usar `PendingTasks` para
  anunciar trabajo async pendiente antes de serializar.
