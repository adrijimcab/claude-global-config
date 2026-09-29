# A11Y VISUAL CHECKLIST (WCAG 2.2 AA)

> Checklist de accesibilidad visual basada en WCAG 2.2 nivel AA. Complementa
> [UI-STATES-CHECKLIST.md — estado 7 (Focus)](./UI-STATES-CHECKLIST.md).
>
> Importado el 2026-09-29 desde el repo personal `adrii-docs` del dueño (revisión aprobada,
> engram `audit/adrii-docs-import-review`, proyecto `b100-am-ui`). Los ejemplos ya usaban
> sintaxis Angular (`*ngIf`, `@if`, `[attr.aria-invalid]`) y no citaban Tailwind ni React, así
> que se copió sin adaptar más allá de quitar el enlace a `COSMETIC-AUDIT-PROTOCOL.md` (el
> pipeline de auditoría por regex de ese repo, que NO se importó por contradecir el mandato M5
> de b100-am-ui — cero regex para parsear estructura). Nada de este directorio se carga
> automáticamente: es material de referencia para revisiones manuales de UI/theming/stories.

---

## Por qué esto NO es opcional

La accesibilidad no es "un nice-to-have". Es:

1. **Un derecho humano** — 15% de la población mundial tiene alguna discapacidad. Sacarlos del producto es una decisión, no un accidente.
2. **Una obligación legal** — European Accessibility Act (entra en vigor 28 junio 2025), ADA Title III en US, Ley 26.653 en Argentina. Demandas por inaccesibilidad web son cada vez más frecuentes.
3. **SEO** — Google usa señales de a11y en ranking. Una web accesible rankea mejor.
4. **UX para todos** — focus rings bien hechos también ayudan a usuarios sin discapacidad. Touch targets grandes también ayudan en mobile apurado.

Ya te lo estoy diciendo: **si un producto no es accesible, no está terminado**. Punto. Cada ítem de esta checklist es un requerimiento WCAG real — no son opiniones mías.

---

## Estándar de referencia

- **WCAG 2.2** (publicada oct 2023) — última versión estable.
- **Nivel AA** — mínimo legalmente exigible en EU/US/AR.
- **Nivel AAA** — aspiracional, recomendable para apps médicas/gubernamentales.

Cada ítem de esta checklist cita el **Success Criterion (SC)** relevante.

---

## Cómo testear

Para cada ítem de la checklist:

1. **Test manual**: lo que hacés con tus ojos y el teclado.
2. **Test automatizado**: qué herramienta te da la detección a escala.
3. **Red flag**: ejemplo de código/diseño roto.
4. **Fix**: ejemplo de código correcto.

### Herramientas requeridas

| Herramienta | Uso |
|-------------|-----|
| **axe DevTools** (browser ext.) | Scan automático — detecta ~30% de issues de a11y |
| **Lighthouse** (Chrome DevTools tab Accessibility) | Score + checklist |
| **Pa11y CLI** | Integración en CI — `npx pa11y https://staging.example.com` |
| **Chrome DevTools → Rendering → "Emulate vision deficiencies"** | Simulación de daltonismo, visión borrosa |
| **VoiceOver** (macOS, `Cmd+F5`) / **NVDA** (Windows) | Screen reader real |
| **Contrast Ratio** (WebAIM) | Cálculo de contraste manual |
| **Color Oracle** (app de escritorio) | Filtros de daltonismo fullscreen |

**Advertencia**: las herramientas automáticas detectan solo ~30% de issues. El otro 70% requiere test manual con teclado + screen reader. Un proyecto con axe 0 errors NO significa accesible.

---

## 1. Contraste de color — WCAG 1.4.3 (AA), 1.4.11 (AA)

**Requerimiento**:
- **Texto normal** (< 18pt regular o < 14pt bold): contraste mínimo **4.5:1** contra el background.
- **Texto grande** (≥ 18pt regular o ≥ 14pt bold): contraste mínimo **3:1**.
- **Componentes UI** (bordes de inputs, íconos informativos, focus rings): contraste mínimo **3:1** contra el color adyacente.

**Test manual**:
1. DevTools → Color Picker → apuntar al texto.
2. Leer el "contrast ratio" que muestra.
3. Verificar que cumple 4.5:1 (o 3:1 para large/UI).

**Test automatizado**:
```bash
# Lighthouse audit
npx lighthouse https://staging.example.com --only-categories=accessibility

# Pa11y con WCAG 2.2 AA
npx pa11y --standard WCAG2AA https://staging.example.com
```

**Red flags**:

```css
/* ❌ MAL — contraste 2.5:1 */
.caption { color: #a0a0a0; background: #ffffff; /* fail */ }

/* ❌ MAL — usar opacity en texto (reduce contraste real) */
.muted { opacity: 0.4; } /* contraste efectivo destruido */

/* ❌ MAL — dark mode con contraste AA en light, AAA-inverted en dark que se ve lavado */
:root          { --text: #1a1a1a; --bg: #fff; } /* 19:1 — OK */
[data-theme="dark"] { --text: #606060; --bg: #000; } /* 4.3:1 — fail para normal */
```

**Fix**:

```css
/* ✅ BIEN — contraste 4.9:1 en ambos modos */
:root               { --color-text-main: #111827; --color-bg: #ffffff; }
[data-theme="dark"] { --color-text-main: #f9fafb; --color-bg: #111827; }

/* ✅ BIEN — muted con contraste 4.5:1 real */
.muted { color: var(--color-text-muted); /* #6B7280 sobre #fff = 4.54:1 */ }
```

---

## 2. Focus visible — WCAG 2.4.7 (AA), 2.4.13 (AAA)

**Requerimiento**: cualquier elemento que recibe foco de teclado DEBE mostrar indicación visual. Mínimo 2px de outline con contraste ≥ 3:1.

**WCAG 2.2 incorpora SC 2.4.11 (AA)**: el focus indicator no debe ser ocultado por otros elementos (overlays, sticky headers).

**Test manual**:
1. Desconectá el mouse.
2. Tab por toda la página.
3. ¿Podés ver SIEMPRE dónde está el foco? Si no → fail.

**Test automatizado**: difícil de detectar automáticamente — axe puede detectar `outline: none` sin reemplazo, pero no garantiza que el reemplazo sea visible. **Test manual es obligatorio**.

**Red flags**:

```css
/* ❌ MAL — el asesino de la accesibilidad */
* { outline: 0; }
*:focus { outline: none; }

/* ❌ MAL — focus ring con contraste <3:1 */
*:focus { outline: 2px solid #e5e5e5; } /* sobre bg blanco, contraste 1.2:1 */

/* ❌ MAL — focus con box-shadow del mismo color que el borde */
.input:focus { box-shadow: 0 0 0 2px #000; border: 2px solid #000; /* invisible overlap */ }
```

**Fix**:

```css
/* ✅ BIEN — focus-visible tokenizado */
*:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
*:focus:not(:focus-visible) { outline: none; }
```

Ver detalles completos en [UI-STATES-CHECKLIST.md#7-focus](./UI-STATES-CHECKLIST.md#7-focus).

---

## 3. Touch targets — WCAG 2.5.5 (AAA), 2.5.8 (AA)

**Requerimiento** (WCAG 2.2, SC 2.5.8 AA, nuevo en 2.2):
- Touch targets: mínimo **24×24 CSS pixels** (level AA).
- Nivel AAA: **44×44 CSS pixels**.

**Excepciones**:
- Links inline dentro de un párrafo.
- Elementos que tienen alternativa con target adecuado.

**Test manual**:
1. DevTools → elemento → ver dimensiones.
2. Medir button/link + padding/margin que forman el hit area.

**Test automatizado**:
```bash
npx pa11y --runner htmlcs --runner axe https://example.com
```

**Red flags**:

```html
<!-- ❌ MAL — ícono de 16×16 sin padding -->
<button style="width:16px;height:16px;"><icon name="close" /></button>

<!-- ❌ MAL — dos links pegados sin gap → tap target overlap -->
<a href="/a">Login</a><a href="/b">Signup</a>
```

**Fix**:

```html
<!-- ✅ BIEN — ícono con padding para llegar a 44×44 -->
<button class="icon-btn" aria-label="Cerrar">
  <icon name="close" aria-hidden="true" />
</button>
<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    padding: var(--space-2);
  }
</style>
```

---

## 4. Min font size

**Requerimiento** (no hay WCAG SC estricto, pero consenso de UX research):
- **Mínimo 14px** para body text.
- **16px recomendado** como base (`html { font-size: 16px; }` es el default — no lo bajes).
- **NUNCA menor a 12px**.

**Test manual**: inspector → ver `font-size` computed en todos los textos visibles.

**Red flags**:

```css
/* ❌ MAL — caption ilegible en mobile */
.caption { font-size: 10px; }

/* ❌ MAL — reset global que afecta todo */
html { font-size: 12px; }
```

**Fix**:

```css
/* ✅ BIEN */
html { font-size: 16px; } /* no tocar */
.body    { font-size: var(--text-body); /* 16px */ }
.caption { font-size: var(--text-caption); /* 12px mínimo */ }
```

---

## 5. Text resize — WCAG 1.4.4 (AA)

**Requerimiento**: el texto debe poder agrandarse hasta **200%** sin pérdida de funcionalidad ni scroll horizontal en mobile.

**Test manual**:
1. Chrome: `Cmd/Ctrl +` cuatro veces para llegar a 200%.
2. Verificar: ¿todo sigue legible? ¿hay scroll horizontal en mobile?
3. Alternativa: DevTools device emulator → User Agent zoom.

**Red flags**:

```css
/* ❌ MAL — usar px fijos que no escalan */
body { font-size: 16px; /* no escala con zoom en algunos browsers */ }

/* ❌ MAL — containers con width fijo en px */
.container { max-width: 1200px; /* overflow en zoom 200% en mobile */ }
```

**Fix**:

```css
/* ✅ BIEN — rem escala con zoom del usuario */
body { font-size: 1rem; }
.container { max-width: 75rem; /* 1200px equivalente, pero escala */ }

/* Reflow para evitar scroll horizontal */
.container { max-width: 100%; padding: 0 var(--space-4); }
```

---

## 6. ARIA labels

**Requerimiento** (WCAG 1.1.1, 4.1.2):
- Botones icon-only (sin texto visible) DEBEN tener `aria-label`.
- Íconos decorativos DEBEN tener `aria-hidden="true"`.
- Custom widgets sin equivalente nativo deben tener `role` + `aria-*` apropiados.

**Test manual**:
1. Activar VoiceOver / NVDA.
2. Tab por cada elemento interactivo.
3. ¿El screen reader dice el propósito? Si dice solo "button" o "image" → falta label.

**Test automatizado**:
```bash
npx axe https://example.com
```

**Red flags**:

```html
<!-- ❌ MAL — botón icon-only sin label → SR lee "button" -->
<button><icon name="trash" /></button>

<!-- ❌ MAL — alt="" en imagen de contenido -->
<img src="/product.jpg" alt="" />

<!-- ❌ MAL — alt redundante -->
<img src="/icon.svg" alt="image of arrow icon" />
```

**Fix**:

```html
<!-- ✅ BIEN — aria-label en icon button -->
<button aria-label="Eliminar producto" (click)="delete()">
  <icon name="trash" aria-hidden="true" />
</button>

<!-- ✅ BIEN — alt descriptivo en imagen de contenido -->
<img src="/product.jpg" alt="Silla ergonómica Serta negro, vista frontal" />

<!-- ✅ BIEN — alt="" (vacío intencional) en imagen decorativa -->
<img src="/hero-bg.jpg" alt="" role="presentation" />

<!-- ✅ BIEN — ícono decorativo ignorado por SR -->
<button>
  <icon name="check" aria-hidden="true" />
  Guardar
</button>
```

---

## 7. Alt text

**Requerimiento** (WCAG 1.1.1, SC Level A):
- Imágenes informativas: `alt` descriptivo del contenido/función.
- Imágenes decorativas: `alt=""` (vacío intencional).
- Imágenes funcionales (íconos de botones): `alt` describe la ACCIÓN, no la imagen.
- Imágenes complejas (charts, diagramas): `alt` corto + descripción larga en texto adyacente.

**Red flags**:

```html
<!-- ❌ MAL -->
<img src="/ceo.jpg" alt="image" />
<img src="/ceo.jpg" alt="ceo.jpg" />
<img src="/chart.png" alt="chart" />

<!-- ❌ MAL — alt en imagen decorativa que hace que SR anuncie ruido -->
<img src="/decorative-line.svg" alt="línea decorativa" />
```

**Fix**:

```html
<!-- ✅ BIEN — descriptivo -->
<img src="/ceo.jpg" alt="María García, CEO de Acme Corp, sonriendo frente a una oficina moderna" />

<!-- ✅ BIEN — alt vacío en decorativa -->
<img src="/decorative-line.svg" alt="" role="presentation" />

<!-- ✅ BIEN — chart con alt + long description -->
<img src="/sales-q4.png" alt="Gráfico de ventas Q4 2025" aria-describedby="chart-desc" />
<p id="chart-desc" class="sr-only">
  Las ventas aumentaron 23% en Q4 2025 respecto a Q3, con el pico en diciembre (1.2M USD).
</p>
```

---

## 8. Form labels — WCAG 1.3.1, 3.3.2 (AA)

**Requerimiento**:
- TODO `<input>`, `<select>`, `<textarea>` DEBE tener un `<label>` asociado visible.
- `<label for="id">` con `<input id="id">` o nesting (`<label>...<input>...</label>`).
- **Placeholder NO cuenta como label** — desaparece cuando el usuario escribe.

**Red flags**:

```html
<!-- ❌ MAL — solo placeholder -->
<input type="email" placeholder="Email" />

<!-- ❌ MAL — label sin asociación -->
<label>Email</label><input type="email" />

<!-- ❌ MAL — aria-label que no matchea el placeholder visible (confusión) -->
<input aria-label="Your email" placeholder="Email address" />
```

**Fix**:

```html
<!-- ✅ BIEN — label visible + for/id -->
<label for="email">Email</label>
<input id="email" type="email" placeholder="tu@ejemplo.com" autocomplete="email" />

<!-- ✅ BIEN — label con nesting -->
<label>
  Email
  <input type="email" autocomplete="email" />
</label>

<!-- ✅ BIEN — label oculto visualmente pero accesible a SR (ej: search bar) -->
<label for="search" class="sr-only">Buscar productos</label>
<input id="search" type="search" placeholder="Buscar..." />

<style>
  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }
</style>
```

---

## 9. Error messages — WCAG 3.3.1, 3.3.3 (A/AA)

**Requerimiento**:
- Los errores de formulario deben ser identificados en texto (no solo color rojo).
- Conectados al input via `aria-describedby`.
- Anunciados por screen reader via `aria-live="polite"` (no urgente) o `aria-live="assertive"` (urgente, ej: submit falló).

**Test manual**:
1. Submit un form con errores.
2. Con VoiceOver activo, verificar que los errores se anuncian.
3. Tab al input con error — debe anunciarse como "invalid".

**Red flags**:

```html
<!-- ❌ MAL — solo color rojo, no accesible a daltonicos -->
<input class="input input--error" />

<!-- ❌ MAL — error visible pero no conectado al input -->
<input id="email" />
<span class="error">Email inválido</span>
<!-- El SR no asocia el error con el input -->

<!-- ❌ MAL — error sin aria-live, SR no lo anuncia -->
<span *ngIf="error" class="error">Campo obligatorio</span>
```

**Fix**:

```html
<!-- ✅ BIEN — error asociado + live region + aria-invalid -->
<label for="email">Email</label>
<input
  id="email"
  type="email"
  formControlName="email"
  [attr.aria-invalid]="emailCtrl.invalid && emailCtrl.touched"
  aria-describedby="email-error email-hint"
  autocomplete="email"
/>
<p id="email-hint" class="hint">Usaremos tu email solo para el pedido.</p>
@if (emailCtrl.invalid && emailCtrl.touched) {
  <p id="email-error" class="field-error" role="alert" aria-live="assertive">
    <icon name="alert-circle" aria-hidden="true" />
    @if (emailCtrl.hasError('required')) { El email es obligatorio. }
    @if (emailCtrl.hasError('email')) { El formato del email no es válido. }
  </p>
}
```

---

## 10. Keyboard navigation — WCAG 2.1.1, 2.1.2, 2.4.1 (A)

**Requerimiento**:
- TODO lo clickeable con mouse debe ser operable con teclado.
- **Tab order lógico** (generalmente: top-to-bottom, left-to-right).
- **Sin focus traps** (foco queda atrapado dentro de un elemento sin poder salir).
- **ESC** cierra modales.
- **Skip links** al principio de la página para saltar al main content.

**Test manual**:
1. Desconectar mouse.
2. Tab desde el principio — verificar orden.
3. Entrar a un modal — ESC debe cerrarlo.
4. Dropdowns — flechas arriba/abajo deben navegar.

**Red flags**:

```html
<!-- ❌ MAL — div con onclick no focuseable por teclado -->
<div onclick="doSomething()">Click me</div>

<!-- ❌ MAL — tabindex positivo → rompe el orden natural -->
<input tabindex="5" />

<!-- ❌ MAL — modal sin trap+release de foco -->
<div class="modal">
  <!-- foco se escapa a elementos detrás del modal -->
</div>
```

**Fix**:

```html
<!-- ✅ BIEN — button nativo, focuseable por default -->
<button type="button" (click)="doSomething()">Click me</button>

<!-- ✅ BIEN — skip link -->
<a href="#main" class="skip-link">Saltar al contenido principal</a>
<!-- ... -->
<main id="main">...</main>

<style>
  .skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    background: var(--color-primary);
    color: var(--color-white);
    padding: var(--space-2) var(--space-3);
    z-index: var(--z-max);
  }
  .skip-link:focus { top: 0; }
</style>
```

```typescript
// ✅ BIEN — modal con focus trap + ESC handler
@Component({
  host: {
    '(document:keydown.escape)': 'close()',
    'role': 'dialog',
    'aria-modal': 'true',
    '[attr.aria-labelledby]': 'titleId',
  },
})
export class ModalComponent implements AfterViewInit {
  @ViewChild('firstFocusable') firstFocusable!: ElementRef;
  private previouslyFocused?: HTMLElement;

  ngAfterViewInit() {
    this.previouslyFocused = document.activeElement as HTMLElement;
    this.firstFocusable.nativeElement.focus();
    // Implementar focus trap con focus-trap library o custom handler
  }

  close() {
    this.previouslyFocused?.focus(); // restaurar foco al trigger
    this.onClose.emit();
  }
}
```

---

## 11. Motion — WCAG 2.3.3 (AAA), 2.2.2 (A)

**Requerimiento**:
- Respetar `prefers-reduced-motion: reduce` — animaciones reducidas o apagadas.
- Nada de auto-play de video/audio.
- Parpadeo < 3 flashes/s (WCAG 2.3.1 — evita seizures).
- Contenido que se mueve automáticamente (carrusel) debe tener control de pausa.

**Test manual**:
1. macOS: System Settings → Accessibility → Display → Reduce Motion.
2. Recargar la página.
3. Verificar: ¿las animaciones se redujeron? ¿hay transiciones bruscas?

**Red flags**:

```css
/* ❌ MAL — animación que no respeta preferencias */
.hero { animation: float 3s infinite; }

/* ❌ MAL — carrusel autoplay sin pause */
<carousel autoplay [interval]="3000">...</carousel>

/* ❌ MAL — parallax intenso que marea */
.bg { transform: translateY(calc(var(--scroll) * 0.5)); }
```

**Fix**:

```css
/* ✅ BIEN — respeto de preferencias */
.hero {
  animation: float 3s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .hero { animation: none; transform: none; }
}
```

```html
<!-- ✅ BIEN — carrusel con control de pausa -->
<carousel [autoplay]="!reducedMotion()" [pauseOnHover]="true">
  <button aria-label="Pausar carrusel" (click)="togglePause()">
    <icon [name]="paused() ? 'play' : 'pause'" />
  </button>
  <!-- ... slides ... -->
</carousel>
```

```typescript
// Detección programática
const reducedMotion = signal(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
```

---

## 12. Headings hierarchy — WCAG 1.3.1, 2.4.6 (AA)

**Requerimiento**:
- **Un solo `<h1>` por página**.
- Sin saltos en la jerarquía (h2 → h4 es fail, debe ser h2 → h3 → h4).
- Los headings estructuran el contenido — no son decorativos.
- Todo heading tiene texto (no `<h2></h2>` vacío).

**Test manual**:
1. DevTools console: `Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => h.tagName + ' - ' + h.textContent)`.
2. Verificar: empieza con H1, sin saltos.

**Test automatizado**: axe, Lighthouse, Wave.

**Red flags**:

```html
<!-- ❌ MAL — dos h1 -->
<h1>Bienvenido</h1>
...
<h1>Sobre nosotros</h1>

<!-- ❌ MAL — salto h1 → h3 -->
<h1>Productos</h1>
<h3>Silla ergonómica</h3>

<!-- ❌ MAL — h2 usado por su tamaño, no por jerarquía -->
<h2 style="font-size: 14px">Caption pequeña</h2>

<!-- ❌ MAL — heading vacío -->
<h2></h2>
```

**Fix**:

```html
<!-- ✅ BIEN — UN h1, jerarquía continua -->
<h1>Productos</h1>
  <section>
    <h2>Oficina</h2>
      <article>
        <h3>Silla ergonómica Serta</h3>
        <h4>Especificaciones</h4>
      </article>
  </section>
  <section>
    <h2>Hogar</h2>
  </section>

<!-- ✅ BIEN — separar estructura de presentación -->
<h2 class="caption-style">Título de sección</h2>
<!-- .caption-style hace que se vea chica, pero SIGUE siendo h2 semánticamente -->
```

---

## Entregable de esta checklist

Al completar la auditoría a11y, documentar en el reporte cosmético (Dimensión 4) una tabla:

| # | Ítem | WCAG SC | Estado | Severidad | # de violaciones |
|---|------|---------|--------|-----------|------------------|
| 1 | Contraste color | 1.4.3 AA | ❌ | Alta | 12 |
| 2 | Focus visible | 2.4.7 AA | ❌ | Alta | global (fix único) |
| 3 | Touch targets | 2.5.8 AA | ⚠️ | Media-Alta | 8 botones <24px |
| 4 | Min font size | — | ✅ | — | 0 |
| 5 | Text resize 200% | 1.4.4 AA | ⚠️ | Media | scroll horizontal en /checkout |
| 6 | ARIA labels | 4.1.2 A | ❌ | Alta | 14 icon-only buttons |
| 7 | Alt text | 1.1.1 A | ❌ | Alta | 23 imgs sin alt descriptivo |
| 8 | Form labels | 3.3.2 AA | ✅ | — | 0 |
| 9 | Error messages | 3.3.1 A | ⚠️ | Media-Alta | no anunciados por SR |
| 10 | Keyboard nav | 2.1.1 A | ❌ | Alta | modal sin focus trap |
| 11 | Motion (prefers-reduced) | 2.3.3 AAA | ❌ | Media | 5 animations |
| 12 | Headings hierarchy | 1.3.1 A | ⚠️ | Media | 2 saltos h1→h3 |

Cada ❌/⚠️ se expande como finding individual en la Dimensión 4 del reporte cosmético.

**Cadencia recomendada**:
- Auditoría completa: al **primer release** y después **trimestral**.
- Auditoría ligera (axe + Lighthouse): en **cada PR** que toque UI (automatizado via CI).

Y te lo digo ya: la accesibilidad no se agrega al final, se diseña desde el principio. Si la dejás para "el próximo sprint", nunca llega — ponete las pilas, hacelo bien desde el día 1.
