# `angular-update-skipped-intermediate-major` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-26 (condensed)

- [global] 2026-10-25 — Discovery went from Angular 20 to 22 in one step; the 21 migrations never ran (the 22 migrations.json lists only 22.x), so provideZoneChangeDetection was never added and the app ran zoneless, failing 47 specs -> root cause: ng update applies only the target major's migrations, and skipping a major drops the intermediate ones -> RULE: a multi-major Angular update runs one major at a time with its migrations committed per hop; when a hop was skipped, list the skipped major's migrations from its own package tarball and apply each before trusting the tree. <!--fc:angular-update-skipped-intermediate-major#1-->
