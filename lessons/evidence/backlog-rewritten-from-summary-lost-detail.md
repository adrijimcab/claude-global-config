# `backlog-rewritten-from-summary-lost-detail` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-09-30 — The owner found the master backlog missing things; a read-only audit (addaaded) traced it through revisions 50-59: the forms finding #35 was cut from its measured detail (file, spy evidence, markForCheck sites, b100-date, proposal) to one line at revision 53, items 36/37 vanished at revision 58, and the whole GitLab release-blocker block (#927) and the debt re-measurement (#978) never reached it. Root cause: each full rewrite of the backlog was authored from my running summary instead of from the previous revision plus the new sources, so every rewrite was a lossy re-summarisation and detail decayed monotonically -> RULE: a backlog revision is the previous revision EDITED, never re-summarised; a finding enters with its measured detail and keeps it until closed with evidence; and any report that names debt is folded in whole the same turn. <!--fc:backlog-rewritten-from-summary-lost-detail#1-->

## Ledger line archived 2026-10-01 (promoted)

- [global] 2026-09-30 — RULE: a backlog revision is the previous revision EDITED, never re-summarised; a finding enters with its measured detail and keeps it until closed with evidence; and any report that names debt is folded in whole the same turn. Evidence: lessons/evidence/backlog-rewritten-from-summary-lost-detail.md <!--fc:backlog-rewritten-from-summary-lost-detail#2-->

Promoted 2026-10-01 to ~/.claude/rules/promoted-rules.md; closed by mechanism C:/Users/adrian.jimenez/.claude/backlog-content-guard/guard.mjs (selftest run, exit 0)

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
- **`backlog-rewritten-from-summary-lost-detail`** — CLOSED BY MECHANISM. A memory record is saved by
  EDITING its previous revision, never by re-summarising it: `mem_save` on an existing `topic_key` is a
  full upsert that REPLACES the content. Two faces recorded to date:
  - **EACH FULL REWRITE AUTHORED FROM A RUNNING SUMMARY (2026-09-30).** The master backlog lost measured
    detail across revisions 53-59. RULE: a revision is the previous one edited; a finding enters with its
    measured detail and keeps it until closed with evidence.
  - **AN APPEND THAT WAS AN UPSERT (2026-10-01).** A save meant to append to
    `backlog/1.0.0-bilingual-gate-hardening` (observation #1092) replaced the detailed record with a short
    update; the prose rule above had already been promoted and recurred. RULE: read the current revision
    (`mem_get_observation`) and resend it WHOLE plus the addition; to retire an item on purpose, write a
    line with a closure word (`CLOSED`, `CERRADO`, `SUPERSEDED`, `SUPERSEDIDO`) AND the item's first 6
    words verbatim. CLOSED BY MECHANISM: `~/.claude/backlog-content-guard/guard.mjs`, a `PreToolUse` guard
    on `mem_save`/`mem_update` (both engram mounts, every caller) that compares logical items of the
    current revision with the new content and denies a write that drops meaningful items; reorder,
    reflow and additions are allowed. It fails CLOSED for `backlog/*-master` when the store cannot be read
    and OPEN for ordinary records (tradeoff: an ordinary record can lose detail while the store is
    unreadable). Selftest, mutants and the real-incident replay in its directory.
  @es Un registro de memoria se guarda EDITANDO su revisión anterior, nunca re-resumiéndola: `mem_save`
  sobre un `topic_key` existente es un upsert completo que REEMPLAZA el contenido. Dos caras: cada
  reescritura completa hecha desde un resumen (2026-09-30) y un «añadido» que era un upsert
  (2026-10-01, observación #1092). REGLA: leer la revisión actual y reenviarla ENTERA más lo nuevo; para
  retirar un item a propósito, una línea con palabra de cierre (`CLOSED`, `CERRADO`, `SUPERSEDED`,
  `SUPERSEDIDO`) Y las 6 primeras palabras del item literales. Lo impide
  `~/.claude/backlog-content-guard/guard.mjs` (cierra CERRADO para `backlog/*-master` si no puede leer
  el almacén; ABIERTO para registros ordinarios).
````
