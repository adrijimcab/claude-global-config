# DESIGN TOKENS CHECKLIST

> Checklist concreto para auditar si el Design System del proyecto usa tokens como Dios manda o si hay un caos de valores hardcodeados.
>
> Importado el 2026-09-29 desde el repo personal `adrii-docs` del dueño (revisión aprobada,
> engram `audit/adrii-docs-import-review`, proyecto `b100-am-ui`) y **adaptado de Tailwind/React a
> Angular Material 19 + SCSS**: se quitaron los ejemplos de `tailwind.config.js`/clases arbitrarias
> (`bg-[#6366f1]`, `p-[13px]`, `z-[N]`) y el `theme.extend` de Tailwind, se reemplazaron por el
> patrón real de tokens en capas de un proyecto Angular Material 19 (`--mat-sys-*` generados por
> `mat.theme()`/`define-theme`, custom properties propias bajo `@layer`, `light-dark()` para
> paridad de tema), y se quitó el enlace a `COSMETIC-AUDIT-PROTOCOL.md` (el pipeline de auditoría
> por regex de ese repo, que NO se importó por contradecir el mandato M5 de b100-am-ui — cero
> regex para parsear estructura). Nada de este directorio se carga automáticamente: es material
> de referencia para revisiones manuales de UI/theming/stories.

---

## Por qué esto importa

Un color hex hardcodeado en un `.ts` NO es un error menor — es **deuda técnica que escala exponencialmente**. Cada `#6366f1` suelto es:

1. **Un bug de dark mode esperando a pasar** — no tiene par dark, el cambio de theme lo rompe.
2. **Un bug de brand esperando a pasar** — el día que marketing cambia el primary, buscás con grep y encontrás 47 lugares distintos (algunos con typo: `#6366F1`, `#6366f2`).
3. **Un bug de accesibilidad esperando a pasar** — no garantiza contraste 4.5:1 en todos los backgrounds.
4. **Un bloqueador para re-skinning** — si mañana el cliente quiere una variante white-label, no hay token que tocar.

**Los tokens son el API interno de tu Design System**. Sin ellos, no hay DS — hay opiniones dispersas en 200 archivos. ¿Se entiende?

La regla es **ZERO COLORES HARDCODEADOS**. En Angular Material 19 esto se verifica leyendo
componentes y hojas de estilo (grep localiza candidatos, nunca dictamina — ver la regla promovida
`audit-verdict-from-commit-subjects-not-from-reading`), nunca con un hook automático que bloquee
por patrón: un hex color es legítimo en el archivo canónico de tokens/tema y ilegítimo en
cualquier otro lado, y esa distinción la hace un lector, no un regex.

---

## Cómo usar este checklist

Para cada categoría:
1. Ejecutá el **grep hint** en la raíz del proyecto.
2. Si devuelve 0 resultados → ✅ categoría aprobada.
3. Si devuelve >0 resultados → ❌ documentar cada ocurrencia en el reporte cosmético (Dimensión 1).
4. Aplicar el **fix pattern** mecánicamente.

Los greps asumen `ripgrep` (`rg`) — alternativa: `grep -rn`. Ajustá los globs según el stack.

---

## 1. Colors

**Qué chequear**: TODOS los colores visibles en el producto vienen de `var(--token)` — ya sean
tokens propios (`--color-*`, `--spacing-*`, definidos bajo `@layer` propio) o del sistema M3 de
Angular Material 19 (`--mat-sys-primary`, `--mat-sys-on-surface`, `--mat-sys-error`, etc., emitidos
por `@include mat.theme(...)` / `mat.define-theme(...)`). Cero `#hex`, cero `rgb()`, cero `hsl()`
hardcoded en archivos de lógica o templates. El único lugar donde es aceptable un valor raw es la
definición del token mismo (el partial canónico de tokens/tema, p. ej. `_tokens-primitive.scss` o
el `theme.scss` que llama a `mat.theme()`).

**Grep hints** (ejecutar desde la raíz del repo):

```bash
# Hex colors en código de aplicación (NO en archivos de tokens)
rg -n "#[0-9a-fA-F]{3,8}\b" --glob '*.{ts,html}' \
   --glob '!**/theme.{scss,css,ts}' \
   --glob '!**/_tokens.{scss,css}' \
   --glob '!**/tokens.ts' \
   --glob '!**/node_modules/**'

# rgb() / rgba() hardcoded
rg -n "rgba?\s*\(" --glob '*.{ts,html,scss,css}' \
   --glob '!**/theme.{scss,css}' \
   --glob '!**/_tokens.{scss,css}'

# hsl() / hsla() hardcoded
rg -n "hsla?\s*\(" --glob '*.{ts,html,scss,css}' \
   --glob '!**/theme.{scss,css}'

# Colors nombrados (red, blue, etc.) en CSS — casi siempre son un error
rg -n "color:\s*(red|blue|green|yellow|black|white|gray|grey|orange|purple)\b" \
   --glob '*.{scss,css,html}'
```

**Red flags** (ejemplos reales vistos en producción):

```typescript
// ❌ MAL — colores hardcoded en el template inline del componente
@Component({ template: `<div style="background: #1a1a1a; color: #ffffff;">...</div>` })

// ❌ MAL — canvas/gráfico leyendo un hex literal en vez del token computado
const material = new THREE.MeshBasicMaterial({ color: 0x6366f1 });

// ❌ MAL — SCSS de componente con hex propio en vez de reusar el token semántico o de Material
.b100-widget__header { background: #1a1a1a; color: #ffffff; }

// ❌ MAL — inline style con rgba en el binding de Angular
<div [style.background-color]="'rgba(0,0,0,0.5)'">
```

**Fix pattern**:

```typescript
// ✅ BIEN — clase consumida desde el template, color resuelto en SCSS
@Component({ template: `<div class="b100-toast">...</div>` })
// b100-toast.component.scss:
// .b100-toast { background: var(--color-surface-inverse); color: var(--color-text-inverse); }

// ✅ BIEN — canvas/gráfico leyendo el token YA resuelto por el navegador (incluye --mat-sys-*)
const root = getComputedStyle(document.documentElement);
const primary = root.getPropertyValue('--mat-sys-primary').trim();
const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(primary) });

// ✅ BIEN — SCSS de componente consumiendo el token semántico propio o el system token de Material
.b100-widget__header {
  background: var(--mat-sys-surface-container);
  color: var(--mat-sys-on-surface);
}

// ✅ BIEN — overlay con token propio bajo @layer
.b100-overlay-dim { background: var(--color-overlay-dim); }
```

**Token definition check**: `var(--color-primary)` (o el `--mat-sys-*` equivalente) debe resolver
correctamente tanto en modo claro como oscuro. En Angular Material 19 esto se logra con
`light-dark()` dentro de la propia definición del token (`--color-primary:
light-dark(#4338ca, #818cf8);`) o con un bloque de override explícito por modo (p. ej.
`:root[data-theme-mode='dark']`, como en `modes/_dark.scss` de este proyecto) — nunca con un
segundo archivo de tokens paralelo. Si un token solo tiene valor claro → ❌ problema de paridad
dark/light (ver categoría 8).

---

## 2. Spacing scale

**Qué chequear**: todo `padding`, `margin`, `gap`, `top`, `left`, etc. debe venir de una escala fija (ej: 4/8/12/16/24/32/48/64). Cero valores arbitrarios tipo `padding: 13px`, `margin: 7px`, `gap: 22px`.

**Escala recomendada** (multiplos de 4, base-8):

| Token | Valor | Uso típico |
|-------|-------|------------|
| `--space-0` | 0 | reset |
| `--space-1` | 4px | gap entre ícono y texto |
| `--space-2` | 8px | padding interno chicos |
| `--space-3` | 12px | padding de inputs |
| `--space-4` | 16px | padding de cards, body base |
| `--space-5` | 24px | separación entre secciones chicas |
| `--space-6` | 32px | padding de containers |
| `--space-8` | 48px | separación de sections |
| `--space-12` | 96px | hero padding |

**Grep hints**:

```bash
# Padding/margin con valores arbitrarios (no múltiplos de 4)
rg -n "(padding|margin|gap):\s*\d+(\.\d+)?px" --glob '*.{scss,css}' \
  | rg -v "\b(0|4|8|12|16|24|32|48|64|96|128)px\b"

# Inline styles con spacing en templates Angular
rg -n "\[style\.(padding|margin)" --glob '*.html'
rg -n "style=.*(padding|margin):\s*\d" --glob '*.html'
```

**Red flags**:

```css
/* ❌ MAL — valores arbitrarios */
.card { padding: 13px 17px; margin-bottom: 22px; }

/* ❌ MAL — pixel perfecto fuera de escala */
.header { height: 73px; }

/* ❌ MAL — binding de Angular con spacing crudo */
<div [style.padding.px]="13" [style.margin-bottom.px]="22">
```

**Fix pattern**:

```css
/* ✅ BIEN — escala */
.card { padding: var(--space-3) var(--space-4); margin-bottom: var(--space-5); }

.header { height: var(--size-header, 64px); /* 64 está en escala */ }
```

---

## 3. Typography scale

**Qué chequear**: escala tipográfica definida (display / h1 / h2 / h3 / h4 / h5 / h6 / body-lg / body / body-sm / caption / overline), con `font-size`, `line-height`, `font-weight`, `letter-spacing` como tokens. Los componentes consumen la escala, no definen tamaños.

**Escala recomendada**:

| Token | Tamaño | Line-height | Weight | Uso |
|-------|--------|-------------|--------|-----|
| `--text-display` | 48px | 1.1 | 700 | hero headlines |
| `--text-h1` | 36px | 1.2 | 700 | page titles |
| `--text-h2` | 28px | 1.25 | 600 | section titles |
| `--text-h3` | 22px | 1.3 | 600 | subsection |
| `--text-h4` | 18px | 1.4 | 600 | card titles |
| `--text-body-lg` | 18px | 1.5 | 400 | intro paragraphs |
| `--text-body` | 16px | 1.5 | 400 | body default |
| `--text-body-sm` | 14px | 1.45 | 400 | dense UI |
| `--text-caption` | 12px | 1.4 | 400 | footnotes, labels |
| `--text-overline` | 11px | 1.3 | 600 + uppercase | category labels |

**Grep hints**:

```bash
# font-size con valor arbitrario
rg -n "font-size:\s*\d+(\.\d+)?(px|rem|em)" --glob '*.{scss,css}' \
  | rg -v "var\(--"

# Inline font-size
rg -n "style=.*font-size" --glob '*.html'

# line-height arbitrario
rg -n "line-height:\s*\d" --glob '*.{scss,css}' | rg -v "var\(--"
```

**Red flags**:

```css
/* ❌ MAL */
.headline { font-size: 35px; line-height: 43px; font-weight: 700; }

/* ❌ MAL — 14.5px es una señal de "ajuste fino" = fuera de escala */
.caption { font-size: 14.5px; }
```

**Fix pattern**:

```css
/* ✅ BIEN */
.headline { font: var(--text-h1); /* shorthand con weight + size + lh */ }
/* o */
.headline {
  font-size: var(--fs-h1);
  line-height: var(--lh-h1);
  font-weight: var(--fw-bold);
}
```

---

## 4. Border radius

**Qué chequear**: radios de borde tokenizados. Escala mínima: `none / sm / md / lg / xl / full`.

**Escala recomendada**:

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-none` | 0 | reset |
| `--radius-sm` | 4px | badges, tags |
| `--radius-md` | 8px | inputs, buttons |
| `--radius-lg` | 12px | cards |
| `--radius-xl` | 16px | modales, containers grandes |
| `--radius-full` | 9999px | avatars, pills |

**Grep hints**:

```bash
rg -n "border-radius:\s*\d+(\.\d+)?(px|rem|%)" --glob '*.{scss,css}' \
  | rg -v "var\(--"

# Overrides de forma de Material sin pasar por --mat-sys-corner-*
rg -n "\.mdc-[a-z-]+\s*\{[^}]*border-radius" --glob '*.scss'
```

**Red flags**:

```css
/* ❌ MAL */
.card { border-radius: 6px; } /* ni sm (4) ni md (8) — fuera de escala */
.avatar { border-radius: 50%; } /* debería ser --radius-full para semántica */
```

**Fix pattern**:

```css
.card { border-radius: var(--radius-md); }
.avatar { border-radius: var(--radius-full); }
```

---

## 5. Shadows

**Qué chequear**: sombras tokenizadas con escala `sm / md / lg / xl`. Elevación consistente = jerarquía visual clara.

**Escala recomendada**:

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | subtle lift (inputs focus) |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | cards, dropdowns |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.15)` | modales |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.2)` | popovers elevados |

**En dark mode**, las sombras necesitan versión propia — `rgba(0,0,0,0.5)` no tiene impacto sobre un fondo `#0a0a0a`. Usá sombras con color base negro con alpha alto, o reemplazá por borders sutiles.

**Grep hints**:

```bash
rg -n "box-shadow:\s*[0-9]" --glob '*.{scss,css}' | rg -v "var\(--"
rg -n "filter:\s*drop-shadow\(" --glob '*.{scss,css}' | rg -v "var\(--"
```

**Red flags**:

```css
/* ❌ MAL */
.modal { box-shadow: 0 22px 40px rgba(15, 23, 42, 0.18); } /* valor único, nadie más lo usa */

/* ❌ MAL — misma sombra hardcoded en light y dark, invisible en dark */
.card { box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
```

**Fix pattern**:

```css
.modal { box-shadow: var(--shadow-xl); }
.card  { box-shadow: var(--shadow-md); }

/* theme.scss — dark override */
[data-theme="dark"] {
  --shadow-md: 0 4px 6px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
}
```

---

## 6. Transitions

**Qué chequear**: timings y easings tokenizados. Un hover dura 150ms, otro dura 400ms, otro no tiene → inconsistencia que el usuario percibe como "poco pulido".

**Escala recomendada**:

| Token | Valor | Uso |
|-------|-------|-----|
| `--duration-fast` | 150ms | hovers, tooltips |
| `--duration-base` | 250ms | most UI transitions |
| `--duration-slow` | 400ms | modales, drawers |
| `--duration-slower` | 600ms | page transitions |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | default |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | symmetric |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | bounce |

**Grep hints**:

```bash
# transition duration hardcoded
rg -n "transition:\s*.*\d+m?s" --glob '*.{scss,css}' | rg -v "var\(--"

# animation-duration hardcoded
rg -n "(animation|transition)-duration:\s*\d" --glob '*.{scss,css}' | rg -v "var\(--"
```

**Red flags**:

```css
/* ❌ MAL — cada componente inventa su timing */
.button:hover { transition: all 150ms ease; }
.card:hover   { transition: transform 300ms linear; }
.modal        { transition: opacity 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
```

**Fix pattern**:

```css
.button:hover { transition: all var(--duration-fast) var(--ease-out); }
.card:hover   { transition: transform var(--duration-base) var(--ease-out); }
.modal        { transition: opacity var(--duration-slow) var(--ease-in-out); }
```

**Bonus — respeto de `prefers-reduced-motion`** (obligatorio WCAG):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. Z-index scale

**Qué chequear**: escalera documentada. Sin esto, en 3 meses hay un botón con `z-index: 99999` para "ganar" sobre otro que tiene `9999`. El infierno del z-index es evitable.

**Escala recomendada**:

| Token | Valor | Uso |
|-------|-------|-----|
| `--z-base` | 0 | default flow |
| `--z-dropdown` | 10 | select dropdowns, menus |
| `--z-sticky` | 20 | headers/footers sticky |
| `--z-overlay` | 30 | backdrop oscurecedor |
| `--z-modal` | 40 | modales, drawers |
| `--z-popover` | 50 | tooltips, popovers |
| `--z-toast` | 60 | notifications, toasts |
| `--z-max` | 9999 | emergencia (evitar uso) |

**Grep hints**:

```bash
# z-index arbitrarios
rg -n "z-index:\s*\d+" --glob '*.{scss,css}' | rg -v "var\(--"

# z-index seteado inline desde el componente en vez del token
rg -n "\[style\.z-index\]|style\.setProperty\('z-index'" --glob '*.{ts,html}'
```

**Red flags**:

```css
/* ❌ MAL — la carrera armamentística del z-index */
.header-1 { z-index: 100; }
.sidebar  { z-index: 999; }
.modal    { z-index: 9999; }
.toast    { z-index: 99999; }
```

**Fix pattern**:

```css
.header-1 { z-index: var(--z-sticky); }
.sidebar  { z-index: var(--z-sticky); }
.modal    { z-index: var(--z-modal); }
.toast    { z-index: var(--z-toast); }
```

---

## 8. Dark mode parity

**Qué chequear**: cada token definido en light tiene su par en dark. NO se permiten "light-only tokens". Si un componente solo se ve bien en light → es un bug, no una feature.

**Patrón correcto**:

```scss
// theme.scss
:root {
  --color-bg:           #ffffff;
  --color-surface:      #f8f9fa;
  --color-text-main:    #0f172a;
  --color-text-muted:   #64748b;
  --color-border:       #e2e8f0;
  --color-primary:      #4338ca;
  --color-primary-hover:#3730a3;
  --color-danger:       #dc2626;
  --color-success:      #16a34a;
}

[data-theme="dark"], .dark {
  --color-bg:           #0f172a;
  --color-surface:      #1e293b;
  --color-text-main:    #f1f5f9;
  --color-text-muted:   #94a3b8;
  --color-border:       #334155;
  --color-primary:      #818cf8; /* ojo: color SHIFT para contraste */
  --color-primary-hover:#a5b4fc;
  --color-danger:       #f87171;
  --color-success:      #4ade80;
}
```

**Grep hint** (detecta tokens sin pair dark):

```bash
# Extraer todos los tokens definidos en :root
rg -n "^\s*--[a-z-]+:" theme.scss > /tmp/light-tokens.txt

# Extraer tokens definidos en [data-theme="dark"] o .dark
# (ajustar el rango de líneas según theme.scss)
rg -A 100 "\[data-theme=\"dark\"\]|\.dark\s*\{" theme.scss > /tmp/dark-tokens.txt

# Comparar manualmente — todo token en light debe estar en dark
```

**Red flags**:

```scss
/* ❌ MAL — token definido solo en light */
:root {
  --color-special: #f0f; /* sin par en dark */
}

/* ❌ MAL — usando color directo con hardcoded dark fallback */
.card {
  background: #fff;
}
[data-theme="dark"] .card {
  background: #000; /* debería ser var(--color-bg) */
}
```

**Fix pattern**:

```scss
:root {
  --color-special: #f0f;
}
[data-theme="dark"] {
  --color-special: #a0a; /* par dark definido */
}

.card { background: var(--color-bg); } /* funciona en ambos modos automáticamente */
```

---

## Token definition location

Dependiendo del stack, los tokens viven en distintos archivos. El auditor debe **verificar que exista UN lugar canónico** y que todos los demás consuman desde ahí.

| Stack | Archivo canónico | Notas |
|-------|------------------|-------|
| Angular Material 19 (system tokens) | El `theme.scss` que llama a `@include mat.theme(...)` / `mat.define-theme(...)` | Emite `--mat-sys-*` (color, tipografía, forma); NUNCA redefinir `--mat-sys-*` a mano fuera de ese punto |
| Angular Material 19 (tokens propios del DS) | `src/styles/_tokens-primitive.scss` (valores crudos) + `_tokens-semantic.scss` (`--color-*`, `--spacing-*`, bajo `@layer`) | El partial semántico consume el primitivo; los componentes consumen solo el semántico o `--mat-sys-*`, nunca el primitivo directo |
| Angular (proyectos sin M3) | `src/styles/theme.scss` o `src/styles/_tokens.scss` | Cargar en `angular.json` → `styles` |
| Design Tokens formal | `tokens/*.json` + Style Dictionary | Single source, genera CSS/Swift/Android; útil si el DS se comparte fuera de Angular |

**Red flag**: si hay tokens definidos en 2+ archivos distintos → hay drift seguro. Consolidar ANTES de cualquier refactor.

**Verificación final**:

```bash
# ¿Cuántos archivos definen tokens CSS?
rg -l "^\s*--[a-z-]+:" --glob '*.{scss,css}'
# Idealmente: 1 archivo (tokens canónicos) + archivos de componentes consumiendo.
# Si >3 definen tokens, consolidar.
```

---

## Entregable de esta checklist

Al completar la auditoría de tokens, documentar en el reporte cosmético (Dimensión 1) una tabla:

| Categoría | Estado | # de violaciones | Notas |
|-----------|--------|------------------|-------|
| 1. Colors | ❌ | 47 | Principalmente en `admin-*` components |
| 2. Spacing | ⚠️ | 12 | Mayormente `[style.padding.px]` con valores crudos |
| 3. Typography | ✅ | 0 | Escala bien implementada |
| 4. Border radius | ⚠️ | 3 | Avatars con `50%` hardcoded |
| 5. Shadows | ❌ | 8 | Valores únicos por componente |
| 6. Transitions | ⚠️ | 14 | Timings inconsistentes |
| 7. Z-index | ❌ | 6 | Carrera armamentística detectada |
| 8. Dark parity | ⚠️ | 3 tokens sin par | `--color-special` solo en light |

Cada ❌ y ⚠️ se expande como finding individual en la Dimensión 1 del reporte. Ya te lo estoy diciendo — si no lo documentás, no existió la auditoría.
