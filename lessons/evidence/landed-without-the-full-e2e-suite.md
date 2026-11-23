# `landed-without-the-full-e2e-suite` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-23 (captured)

- [global] 2026-11-23 — The Discovery orchestrator landed objects-dictionary-search, cics-parity and program-info T5/T6 on develop with build:ci only, without the full chromium e2e suite the project memory requires (feedback_e2e-always-integrated.md:19), so 7 stale specs reached develop (returnUrl redirect of 264d67bc, clustering filter moved by 42c94d7c), found only when use-cases-parity ran the suite; fixed in 234b8bc2 -> root cause: the rule lived in a memory file read at will, and nothing on the landing path asks for an e2e verdict of the exact tree RULE: Before any merge or fast-forward of an integration branch, the full e2e suite of that project runs green on that exact tree and its verdict is read; mechanism requested as T80 of the ~/.claude owner session (landing guard on Discovery develop). <!--fc:landed-without-the-full-e2e-suite#1-->

## Ledger line archived 2026-11-23 (measured)

- [global] 2026-11-23 — RULE: Before any merge or fast-forward of an integration branch, the full e2e suite of that project runs green on that exact tree and its verdict is read; mechanism requested as T80 of the ~/.claude owner session (landing guard on Discovery develop). Evidence: lessons/evidence/landed-without-the-full-e2e-suite.md <!--fc:landed-without-the-full-e2e-suite#1-->

Measured 2026-11-23: Mechanism landed 2026-11-23 (T80 of the ~/.claude owner session, owner order «ok t 80»): Discovery .claude/fleet-kit.json unitSuite.npmScript = "test:land" (measured by the Discovery orchestrator: fleet-kit.json:5-7), and test:land = typecheck:e2e + test:all + scripts/test-land.mjs (the whole chromium suite). The fleet-kit landing guard (enforce) refuses a develop move to a tree without a green gate-run verdict of test:land; an older test:all verdict no longer matches. gate-run.mjs spawns npm with no env option (line 55), so it inherits the caller environment: run it where the local back on 4595 and E2E_PROXY_CONFIG are set.
