# `brief-had-workers-open-every-image` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-02 (promoted)

- [global] 2026-10-02 — A fresh, narrow-scope worker still grew an 18 MB transcript and the usage window ended after 51 minutes -> root cause: my capture brief told every worker to re-open each screenshot it saved or verified, and an image is the most expensive thing a worker can load into its context; ~200 images were opened -> RULE: a brief never asks a worker to open images one by one; the state is asserted from the DOM and the PNG size at capture time, images are reviewed through contact sheets of at most 6 built by the worker's script, and only doubtful ones are opened at full size. <!--fc:brief-had-workers-open-every-image#2-->

Promoted 2026-10-02 to ~/.claude/rules/promoted-rules.md; no mechanism is possible: A mechanism is possible and designed, but not built in this turn: a delegation guard in the pretooluse-delegation manifest that refuses a brief mentioning screenshots without an IMAGE BUDGET line. It is a multi-file change in the tooling repo with its own selftest, mutation proof and dispatcher wiring, and it is queued as the first tooling unit after the two study documents, by the owner's standing priority (documents first) and the three-agent cap that the usage limit imposes. Until it exists, the shared brief sections (verifier step 4, capture rule 4) carry the rule and every launch prompt repeats it.
