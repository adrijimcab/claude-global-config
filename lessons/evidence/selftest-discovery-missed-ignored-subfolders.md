# `selftest-discovery-missed-ignored-subfolders` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-12 (condensed)

- [global] 2026-10-12 — The selftest runner change of 2026-10-11 (9a9ac4d, owned by the ~/.claude session) resolves --root to the git top level and, inside a gitignored directory, reads only its direct children, so b100's gitignored .claude with 59 selftests in subfolders reports none found and the b100 landing refuses with exit 2 -> root cause: discovery replaced a walk of --root with git ls-files plus a one-level scan of ignored directories -> RULE: a change to selftest discovery is proven against every project tree that declares selftests (b100 .claude: 59) before it lands. <!--fc:selftest-discovery-missed-ignored-subfolders#1-->
