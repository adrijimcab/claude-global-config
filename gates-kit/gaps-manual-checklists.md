# Gaps — Where No Tool Exists and a Checklist Is the Only Control

Some of what a "quality gate" needs to catch has no reliable automated check. For these, the control is
a manual checklist, not a missing gate to eventually build. All four checklists referenced below already
exist at `~/.claude/checklists/` — this kit points to them, it does not duplicate them.

@es Parte de lo que un "quality gate" tiene que atrapar no tiene chequeo automatizado confiable. Para
eso, el control es un checklist manual, no un gate pendiente de construir. Los cuatro checklists
referenciados abajo ya existen en `~/.claude/checklists/` — este kit apunta a ellos, no los duplica.

1. **Business-logic security** (IDOR, race conditions/TOCTOU, price/discount tampering, MFA-bypass
   flows) — no static or dynamic scanner reasons about domain semantics. Control: manual per-resource
   testing, structured by OWASP ASVS 5.0 chapters V2 (Validation/Business Logic), V6-V8
   (Authentication/Session/Authorization). The `frontend-security` skill's manual-review-checklist
   reference has the frontend-visible subset (IDOR spotting, cookie/CORS runtime verification); the
   full backend-owned checklist is out of this kit's scope.
2. **Whether the reading order matches visual order**, and **whether a live region actually announces
   at the right moment** — axe/Lighthouse cannot execute a screen reader. Control:
   `~/.claude/checklists/A11Y-VISUAL-CHECKLIST.md` manual pass + the `web-accessibility` skill's
   pattern reference for what *should* happen.
3. **UI state completeness** (does every route have a real loading/empty/error treatment, not just a
   spinner-then-crash) — no tool enumerates "the states a route should have" from outside. Control:
   `~/.claude/checklists/UI-STATES-CHECKLIST.md`'s route × state matrix.
4. **Design token discipline beyond hardcoded-value detection** (is this the *right* semantic token,
   not just *a* token) — a linter can catch a raw hex value but not "this should be `primary`, not
   `secondary`". Control: `~/.claude/checklists/DESIGN-TOKENS-CHECKLIST.md` + the `ui-ux-quality`
   skill's Material 3 token-tier reference for what "right" means.
5. **Structured-data content-visibility guideline compliance** (Google forbids marking up content not
   actually visible on the page) — schema validators check shape, not whether the marked-up content is
   genuinely rendered and visible. Control: manual spot-check during the `seo-technical` skill's review
   pass.
6. **E-E-A-T / content quality / editorial SEO** — entirely out of scope for any tool in this kit;
   genuinely needs human editorial judgment.
7. **Threat modeling and security architecture review** (STRIDE-style) — a design-time activity, not a
   code-time gate; adapt per-feature if needed. It is a process artifact, not something this kit
   automates.

@es
1. **Seguridad de lógica de negocio** (IDOR, condiciones de carrera/TOCTOU, manipulación de precio/
   descuento, bypass de MFA) — ningún escáner razona sobre semántica de dominio. Control: testing
   manual por recurso, estructurado por OWASP ASVS 5.0 V2/V6-V8. La skill `frontend-security` tiene el
   subconjunto visible desde el frontend; el checklist completo del backend queda fuera del alcance de
   este kit.
2. **Si el orden de lectura coincide con el orden visual**, y **si una live region anuncia en el
   momento correcto** — axe/Lighthouse no pueden ejecutar un lector de pantalla. Control:
   `~/.claude/checklists/A11Y-VISUAL-CHECKLIST.md` + la skill `web-accessibility`.
3. **Completitud de estados de UI** (¿cada ruta tiene un tratamiento real de carga/vacío/error?) —
   ninguna herramienta enumera "los estados que una ruta debería tener" desde afuera. Control:
   `~/.claude/checklists/UI-STATES-CHECKLIST.md`.
4. **Disciplina de design tokens más allá de detectar valores hardcodeados** (¿es el token semántico
   CORRECTO, no solo UN token?). Control: `~/.claude/checklists/DESIGN-TOKENS-CHECKLIST.md` + la skill
   `ui-ux-quality`.
5. **Cumplimiento de la guía de visibilidad de contenido de datos estructurados** — los validadores de
   schema comprueban forma, no si el contenido marcado está genuinamente renderizado y visible. Control:
   spot-check manual durante el pase de revisión de la skill `seo-technical`.
6. **E-E-A-T / calidad de contenido / SEO editorial** — totalmente fuera del alcance de cualquier
   herramienta de este kit; necesita juicio editorial humano.
7. **Threat modeling y revisión de arquitectura de seguridad** (estilo STRIDE) — una actividad de
   tiempo de diseño, no un gate de tiempo de código; adaptar por feature si hace falta.
