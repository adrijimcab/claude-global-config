# UI STATES CHECKLIST

> Checklist para auditar los 8 estados de UI que TODO componente interactivo debe contemplar.
>
> Importado el 2026-09-29 desde el repo personal `adrii-docs` del dueño (revisión aprobada,
> engram `audit/adrii-docs-import-review`, proyecto `b100-am-ui`). Los ejemplos ya usaban
> sintaxis y signals de Angular (`@if`, `@for`, `signal()`) y no citaban Tailwind ni React, así
> que se copió sin adaptar más allá de quitar el enlace a `COSMETIC-AUDIT-PROTOCOL.md` (el
> pipeline de auditoría por regex de ese repo, que NO se importó por contradecir el mandato M5
> de b100-am-ui — cero regex para parsear estructura). Nada de este directorio se carga
> automáticamente: es material de referencia para revisiones manuales de UI/theming/stories.

---

## Por qué esto importa

Un producto no se rompe cuando todo sale bien — se rompe cuando algo sale mal. El usuario clickea, espera 3 segundos viendo una pantalla blanca, se va. La conversión se pierde no por el código que falla, sino por el **código que no maneja el "mientras tanto"**.

Los 8 estados son: **loading, empty, error, success, disabled, hover, focus, active**. Cada componente que fetch-ea data, que tiene forms, que reacciona a clicks DEBE pensar los 8. No negociable, loco — esto es lo que separa producto profesional de prototipo.

Esta checklist te da, por cada estado:

1. Qué lo define visualmente.
2. Dónde DEBE aparecer (qué tipo de componente lo necesita).
3. Red flags comunes.
4. Implicancias de accesibilidad.
5. Ejemplo de patrón correcto vs patrón roto.

Al final: **matriz ruta × estado** para que el auditor tilde ✅/❌/N/A mientras recorre el producto.

---

## 1. Loading

**Qué lo define visualmente**: retroalimentación inmediata de que el sistema está trabajando. Preferí **skeleton** (placeholder con shape del contenido final) sobre **spinner** (círculo genérico). El skeleton previene CLS (Cumulative Layout Shift) porque reserva el espacio exacto.

**Timing**:
- Mostrar loading state **después de 100ms** — si la data llega antes, mostrar direct el contenido. Loading prematuros causan "flash of loading" que se percibe peor que no mostrar nada.
- Transición a contenido: **fade-in 200-300ms** para suavizar.

**Dónde DEBE aparecer**:
- Rutas con data fetching (listados, detalles).
- Tablas con paginación.
- Dashboards con múltiples widgets.
- Imágenes con `loading="lazy"` (skeleton durante carga).
- Submit de formularios (botón con spinner + disabled).
- Infinite scroll (loader al final de la lista).

**Red flags**:

```html
<!-- ❌ MAL — spinner solo, no reserva layout -->
<div class="center"><span class="spinner" /></div>
<!-- Consecuencia: cuando llega la data, el contenido salta (CLS alto) -->

<!-- ❌ MAL — sin ningún feedback, pantalla blanca -->
<div *ngIf="!data">{{/* nothing */}}</div>
<!-- Usuario ve: pantalla en blanco 2 segundos → "la app se rompió" -->

<!-- ❌ MAL — loading siempre visible 500ms aunque la data llegue en 50ms -->
<div *ngIf="loading">Loading...</div>
```

**A11y notes**:
- `aria-busy="true"` en el container mientras carga.
- `aria-live="polite"` no es necesario para loading (demasiado noisy).
- Skeleton: agregar `role="status"` + `aria-label="Cargando contenido"`.

**Patrón correcto**:

```html
<!-- ✅ BIEN — skeleton con layout reservado -->
<div class="product-list" [attr.aria-busy]="loading()">
  @if (loading()) {
    @for (i of [1,2,3,4]; track i) {
      <div class="product-card-skeleton" role="status" aria-label="Cargando producto">
        <div class="skeleton-image"></div>
        <div class="skeleton-title"></div>
        <div class="skeleton-price"></div>
      </div>
    }
  } @else {
    @for (product of products(); track product.id) {
      <app-product-card [product]="product" />
    }
  }
</div>
```

```scss
.product-card-skeleton {
  height: 320px; /* MISMO alto que product-card real */
  background: var(--color-surface);
  border-radius: var(--radius-md);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1.0; }
}

@media (prefers-reduced-motion: reduce) {
  .product-card-skeleton { animation: none; opacity: 0.8; }
}
```

---

## 2. Empty

**Qué lo define visualmente**: mensaje claro de que NO hay data + CTA para generar data. Ilustración opcional pero recomendada. **NUNCA** "No data" a secas — eso es frustrante y no resuelve nada.

**Componentes típicos**:
- Listado recién creado ("No tenés productos todavía — agregá el primero").
- Búsqueda sin resultados ("Sin resultados para 'X'. Probá con otras keywords").
- Inbox / notificaciones vacío ("Todo al día — no hay notificaciones nuevas").
- Carrito vacío ("Tu carrito está vacío — volvé al catálogo").

**Dónde DEBE aparecer**:
- Cualquier ruta que liste N items que pueda ser 0.
- Filtros que puedan retornar 0 resultados (diferenciar "vacío inicial" vs "vacío por filtros").
- Tablas vacías.
- Tabs que puedan no tener contenido.

**Red flags**:

```html
<!-- ❌ MAL — mensaje críptico -->
<div *ngIf="products.length === 0">No data</div>

<!-- ❌ MAL — confunde empty con loading -->
<div *ngIf="products.length === 0">Cargando...</div>

<!-- ❌ MAL — sin CTA, el usuario no sabe qué hacer -->
<p>Tu carrito está vacío.</p>
```

**A11y notes**:
- `role="status"` para que el screen reader anuncie el estado.
- La ilustración decorativa debe tener `aria-hidden="true"`.
- El CTA debe ser un `<button>` o `<a>` nativo, no un `<div onclick>`.

**Patrón correcto**:

```html
<!-- ✅ BIEN — empty state completo -->
@if (products().length === 0 && !loading()) {
  <div class="empty-state" role="status">
    <img src="/illustrations/empty-cart.svg" alt="" aria-hidden="true" class="empty-state__image" />
    <h2 class="empty-state__title">Tu carrito está vacío</h2>
    <p class="empty-state__body">
      Todavía no agregaste productos. Explorá el catálogo y encontrá algo que te guste.
    </p>
    <a routerLink="/products" class="btn btn--primary">Explorar catálogo</a>
  </div>
}
```

**Diferenciación empty inicial vs empty por filtros**:

```typescript
// ✅ BIEN — dos empty states distintos
if (hasActiveFilters() && results.length === 0) {
  // "Sin resultados para los filtros actuales. [Limpiar filtros]"
} else if (results.length === 0) {
  // "No hay productos todavía. [Crear primero]"
}
```

---

## 3. Error

**Qué lo define visualmente**: mensaje user-friendly con **causa + acción**. Sin jerga técnica. Botón para reintentar cuando aplique.

**Componentes típicos**:
- Fallo de fetch (network, 500, timeout).
- Validación de formulario (errores inline).
- Permiso denegado (403).
- Recurso no encontrado (404).
- Action fallida (submit de compra falló).

**Dónde DEBE aparecer**:
- TODA ruta con data fetching — el error es un estado igual de válido que el success.
- Submit de forms.
- Upload de archivos.
- Integraciones con servicios externos (pagos, auth).

**Red flags**:

```html
<!-- ❌ MAL — mensaje técnico -->
<div>Error: Request failed with status code 500 (NetworkError: fetch at api/products)</div>

<!-- ❌ MAL — "algo salió mal" sin acción -->
<div>Algo salió mal. Intentá más tarde.</div>

<!-- ❌ MAL — silencioso, usuario no sabe que falló -->
<!-- El fetch falla y la pantalla queda en loading forever -->
```

**A11y notes**:
- `role="alert"` para errores críticos (interrumpen el flujo).
- `aria-live="assertive"` para errores inline de formulario.
- El botón de retry debe ser el PRIMER elemento focuseable tras el mensaje.
- Nunca usar solo color rojo — agregar ícono + texto ("!" ícono + "Error: ...").

**Patrón correcto**:

```html
<!-- ✅ BIEN — error con causa + acción -->
@if (error()) {
  <div class="error-state" role="alert">
    <icon name="alert-triangle" aria-hidden="true" />
    <h2 class="error-state__title">No pudimos cargar los productos</h2>
    <p class="error-state__body">
      Revisá tu conexión a internet. Si el problema persiste, contactanos.
    </p>
    <div class="error-state__actions">
      <button (click)="retry()" class="btn btn--primary">Reintentar</button>
      <a routerLink="/contact" class="btn btn--ghost">Contactar soporte</a>
    </div>
  </div>
}
```

**Error inline en formulario**:

```html
<!-- ✅ BIEN — aria-describedby conecta input al error -->
<label for="email">Email</label>
<input
  id="email"
  formControlName="email"
  [attr.aria-invalid]="emailControl.invalid && emailControl.touched"
  aria-describedby="email-error"
  autocomplete="email"
/>
@if (emailControl.invalid && emailControl.touched) {
  <p id="email-error" class="field-error" role="alert" aria-live="assertive">
    @if (emailControl.hasError('required')) { El email es obligatorio. }
    @if (emailControl.hasError('email')) { El formato del email no es válido. }
  </p>
}
```

---

## 4. Success

**Qué lo define visualmente**: confirmación visible pero **no bloqueante**. Preferir toast sobre alert. Auto-dismiss 4-6s excepto si requiere acción del usuario (ej: "Tu pago se procesó — descargá factura").

**Componentes típicos**:
- Form enviado correctamente.
- Item guardado en wishlist.
- Config actualizada.
- Archivo subido.
- Pago procesado.

**Dónde DEBE aparecer**:
- Después de cada submit exitoso.
- Acciones irreversibles (delete confirmado).
- Uploads completados.

**Red flags**:

```html
<!-- ❌ MAL — alert() bloquea todo -->
<script>alert('Guardado');</script>

<!-- ❌ MAL — toast tapa el CTA siguiente -->
<!-- Toast "Compra exitosa" posicionado encima del botón "Descargar factura" -->

<!-- ❌ MAL — success sin auto-dismiss, queda en pantalla forever -->
<div class="toast-success">Guardado</div>

<!-- ❌ MAL — solo el color verde (no accesible a daltonicos) -->
<span style="color: green">✓</span>
```

**A11y notes**:
- `aria-live="polite"` para que el screen reader lo anuncie sin interrumpir.
- `role="status"` para anuncios no urgentes.
- Si el toast tiene un botón (undo, ver detalles), debe ser focuseable.
- Ícono + texto, no solo color.

**Patrón correcto**:

```html
<!-- ✅ BIEN — toast con aria-live + auto-dismiss + acción opcional -->
<div class="toast toast--success" role="status" aria-live="polite">
  <icon name="check-circle" aria-hidden="true" />
  <div class="toast__content">
    <p class="toast__title">Producto guardado</p>
    <p class="toast__body">Se agregó a tu wishlist.</p>
  </div>
  <button class="toast__action" (click)="undo()">Deshacer</button>
  <button class="toast__close" aria-label="Cerrar notificación" (click)="dismiss()">×</button>
</div>
```

```typescript
// ✅ BIEN — auto-dismiss 5s, pausar al hover
showToast(message: string) {
  const toastId = crypto.randomUUID();
  this.toasts.update(list => [...list, { id: toastId, message }]);

  // No auto-dismiss si tiene acción explícita (undo)
  const timeoutId = setTimeout(() => this.dismiss(toastId), 5000);

  // Pausar al hover
  toastEl.addEventListener('mouseenter', () => clearTimeout(timeoutId));
  toastEl.addEventListener('mouseleave', () => setTimeout(() => this.dismiss(toastId), 2000));
}
```

---

## 5. Disabled

**Qué lo define visualmente**: el componente se ve claramente "no interactuable". Opacidad reducida (0.5-0.6), cursor `not-allowed`, sin hover/focus efectivos.

**SIEMPRE explicar POR QUÉ está disabled** — via tooltip, hint text, o mensaje contextual. "Este botón está gris" es frustrante si no sabés por qué.

**Componentes típicos**:
- Submit button hasta que el form sea válido.
- "Agregar al carrito" si no hay stock.
- Features premium bloqueadas en plan free.
- Fechas pasadas en date picker.

**Dónde DEBE aparecer**:
- Cualquier acción con prerequisitos (form válido, rol correcto, stock disponible).

**Red flags**:

```html
<!-- ❌ MAL — disabled sin razón visible -->
<button disabled>Pagar</button>

<!-- ❌ MAL — ocultar en vez de deshabilitar (usuario no sabe que esa acción existe) -->
<button *ngIf="canPay">Pagar</button>

<!-- ❌ MAL — el "disabled" solo es visual, sigue clickeable -->
<button class="disabled" (click)="pay()">Pagar</button>
<!-- El style pone opacity: 0.5 pero el (click) sigue activo -->
```

**A11y notes**:
- `disabled` nativo en `<button>` remueve del tab order (no focuseable).
- Alternativa accesible: `aria-disabled="true"` + handler que previene la acción (focuseable pero announced como disabled por screen reader).
- Usar `aria-describedby` para el tooltip explicativo.

**Patrón correcto**:

```html
<!-- ✅ BIEN — disabled + explicación visible -->
<button
  type="submit"
  [disabled]="form.invalid"
  [attr.aria-describedby]="form.invalid ? 'submit-reason' : null"
  class="btn btn--primary"
>
  Pagar
</button>

@if (form.invalid) {
  <p id="submit-reason" class="hint">
    Completá todos los campos obligatorios para continuar.
  </p>
}
```

```html
<!-- ✅ BIEN — feature bloqueada con CTA de upgrade -->
<button
  type="button"
  aria-disabled="true"
  (click)="showUpgradeModal()"
  class="btn btn--premium"
  aria-describedby="premium-hint"
>
  <icon name="lock" aria-hidden="true" />
  Exportar a PDF
</button>
<span id="premium-hint" class="sr-only">
  Esta función requiere plan Pro. Click para upgrade.
</span>
```

---

## 6. Hover

**Qué lo define visualmente**: cambio sutil que confirma "esto es interactuable". Timing `< 100ms` — si dura más, se siente lento.

**Regla crítica**: **el hover NUNCA es el único feedback** — en touch devices (50%+ del tráfico web) el hover no existe. Todo lo que esté detrás de un hover tiene que estar accesible por otra vía (tap, focus, etc.).

**Componentes típicos**:
- Links (subrayado, color change).
- Botones (shade shift, shadow lift).
- Cards (elevation, border highlight).
- Menu items (background change).

**Red flags**:

```css
/* ❌ MAL — hover muy lento, se siente laggy */
.btn:hover { transition: all 500ms; }

/* ❌ MAL — solo hover, sin focus-visible → inaccesible por teclado */
.btn:hover { background: blue; }
.btn { /* sin :focus-visible */ }

/* ❌ MAL — info crítica oculta detrás de hover */
.product-price { display: none; }
.product-card:hover .product-price { display: block; }
/* Consecuencia: en mobile, el precio nunca se ve */
```

**A11y notes**:
- El hover no tiene requerimiento WCAG estricto, pero el **equivalente teclado es focus-visible** — ambos deben existir.
- Si el hover muestra información adicional, debe ser `:hover, :focus-visible` (ambos selectors).

**Patrón correcto**:

```css
/* ✅ BIEN — hover rápido con focus-visible mirror */
.btn {
  transition: background-color var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out);
}
.btn:hover,
.btn:focus-visible {
  background-color: var(--color-primary-hover);
  transform: translateY(-1px);
}

/* Touch devices: desactivar hover transform (evita "sticky hover") */
@media (hover: none) {
  .btn:hover { transform: none; }
}
```

---

## 7. Focus

**Qué lo define visualmente**: **outline visible SIEMPRE** cuando el usuario navega con teclado. Este es el estado MÁS crítico de los 8 — es obligatorio por WCAG 2.4.7 y saltárselo es un bug de accesibilidad legal.

**Regla inmutable**: **NUNCA `outline: none` sin un reemplazo claro**.

**Componentes típicos**:
- TODO elemento interactuable: buttons, links, inputs, selects, custom widgets.

**Red flags**:

```css
/* ❌ MAL — MALDITA LÍNEA que mata la accesibilidad */
* { outline: none; }
button:focus { outline: 0; }

/* ❌ MAL — focus ring invisible (mismo color que el bg) */
.btn:focus { outline: 1px solid #fff; } /* en un bg blanco */
```

**A11y notes**:
- `outline: 2px solid` mínimo (1px no es suficiente para contraste).
- `outline-offset: 2px` para que el ring no se pegue al elemento.
- Contraste del ring ≥ 3:1 contra el background.
- Usar `:focus-visible` (no `:focus`) para NO mostrar ring en clicks de mouse — solo en tab.

**Patrón correcto**:

```css
/* ✅ BIEN — focus ring tokenizado + :focus-visible */
:root {
  --color-focus-ring: #4D90FE;
  --ring-width: 2px;
  --ring-offset: 2px;
}
[data-theme="dark"] {
  --color-focus-ring: #8AB4F8; /* contraste ajustado para dark */
}

*:focus-visible {
  outline: var(--ring-width) solid var(--color-focus-ring);
  outline-offset: var(--ring-offset);
  border-radius: var(--radius-sm);
}

/* Evitar ring en clicks mouse */
*:focus:not(:focus-visible) {
  outline: none;
}
```

---

## 8. Active

**Qué lo define visualmente**: feedback instantáneo (<50ms) del "estoy siendo clickeado". Típicamente: shade más oscuro, `transform: scale(0.98)`, shadow reducida.

**Componentes típicos**:
- Buttons (press feedback).
- Cards clickeables.
- Tabs (selected state).

**Red flags**:

```css
/* ❌ MAL — sin active state, se siente "muerto" al click */
.btn:hover { background: blue; }
/* No hay :active → el usuario no ve confirmación del click */

/* ❌ MAL — active con timing largo, se ve laggy */
.btn:active { transition: 500ms; transform: scale(0.9); }
```

**Patrón correcto**:

```css
/* ✅ BIEN */
.btn {
  transition: transform var(--duration-fast) var(--ease-out),
              background-color var(--duration-fast) var(--ease-out);
}
.btn:active {
  transform: scale(0.98);
  background-color: var(--color-primary-dark);
}
```

---

## Matriz ruta × estado — template del auditor

Mientras recorrés el producto, completá esta matriz por ruta. `✅` = implementado correctamente. `❌` = falta o está roto. `N/A` = no aplica a esa ruta.

**Convenciones**:
- **Loading**: ¿hay skeleton/spinner mientras fetch-ea?
- **Empty**: ¿hay mensaje + CTA cuando no hay items?
- **Error**: ¿hay fallback con retry cuando falla el fetch?
- **Success**: ¿hay toast/banner tras submit exitoso?
- **Disabled**: ¿hay feedback visible + explicación cuando una acción no es posible?
- **Hover**: ¿hay feedback <100ms en todos los interactuables?
- **Focus**: ¿hay outline visible al tab?
- **Active**: ¿hay press feedback al click?

### Template (duplicar por proyecto)

| Ruta | Loading | Empty | Error | Success | Disabled | Hover | Focus | Active | Notas |
|------|---------|-------|-------|---------|----------|-------|-------|--------|-------|
| `/` | ✅ | N/A | ❌ | N/A | N/A | ✅ | ❌ | ✅ | Error global sin UI |
| `/products` | ✅ | ❌ | ✅ | N/A | N/A | ✅ | ❌ | ✅ | Empty state faltante |
| `/products/[id]` | ✅ | N/A | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | "Sin stock" bien marcado |
| `/checkout` | ❌ | N/A | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | Submit sin loading ni error handling |
| `/account` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Focus ring global apagado |
| `/404` | N/A | N/A | N/A | N/A | N/A | ✅ | ❌ | ✅ | Link "volver" sin focus |
| `/admin/dashboard` | ❌ | ❌ | ❌ | N/A | N/A | ✅ | ❌ | ✅ | Crítico: 3 estados faltantes |

**Agregación al reporte**:

```markdown
## Dimensión 2 — UI States (resumen)

- Total rutas auditadas: 7
- Checks totales (7 rutas × 8 estados): 56 (excluyendo N/A)
- ✅ OK: 32 (57%)
- ❌ Faltantes o rotos: 19 (34%)
- N/A: 5 (9%)

### Patrón dominante
- Focus visible roto en 7/7 rutas → fix único en `styles.scss` corrige global.
- Loading faltante en 2 rutas críticas (`/checkout`, `/admin/dashboard`).
- Error handling inexistente en `/` y `/checkout` → blocker de release.
```

---

## Priorización

Al escribir el reporte, usar esta jerarquía de severidad para UI states:

| Severidad | Cuándo |
|-----------|--------|
| **Alta** | Focus visible roto, error handling faltante en rutas críticas (checkout, pago, auth), loading faltante en rutas con fetch >2s |
| **Media-Alta** | Empty state faltante (UX pobre pero no bloqueante), success toast que tapa CTA, disabled sin explicación |
| **Media** | Hover inconsistente, active feedback faltante, loading sin skeleton (spinner solo) |
| **Baja** | Timing de hover fuera de escala, micro-timing de transiciones |

Te lo digo claro, loco: si el focus no es visible, es un finding Alta. Sin discusión. WCAG 2.4.7 es nivel AA y es legalmente exigible en EU (EAA 2026), US (ADA), Argentina (Ley 26.653). No es opcional.
