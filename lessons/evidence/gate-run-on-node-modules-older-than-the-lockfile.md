# `gate-run-on-node-modules-older-than-the-lockfile` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-15 (captured)

- [global] 2026-11-15 — On 2026-11-15 ci:test on worktree angular-21 went 920 of 1556 files red (provideZonelessChangeDetection is not a function; Cannot find package @angular/ssr): the worktree was provisioned from develop (Angular 19 lockfile), then 16 commits moving package.json and the lockfile to Angular 21 were cherry-picked into it with no reinstall -> root cause: provisioning ran at creation, the lockfile changed after it, and nothing compares the installed tree with the lockfile before a gate RULE: After any commit that changes package.json or the lockfile lands in a worktree (cherry-pick, merge, checkout), reinstall it from that lockfile and read the installed versions before running a gate there. <!--fc:gate-run-on-node-modules-older-than-the-lockfile#1-->
