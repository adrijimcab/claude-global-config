# `work-split-by-line-count-without-reading-structure` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-04 (condensed)

- [global] 2026-10-04 — I split reports.service.js (12109 lines) into two units by line number (1-6100, 6100-end) and told the first unit its range held report generators; it measured that lines 28-8087 are one i18n dictionary and every generator sits in 8228-12102, so one unit had nothing to do and the other got all the work -> root cause: I sized the split from the file's length without reading its top-level structure, which a symbol listing would have shown in one command -> RULE: before splitting a file across units, list its top-level symbols (or read its outline) and cut at symbol boundaries by the work each part holds, never by line count. <!--fc:work-split-by-line-count-without-reading-structure#1-->
