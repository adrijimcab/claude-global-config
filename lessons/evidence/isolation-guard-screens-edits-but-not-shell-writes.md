# `isolation-guard-screens-edits-but-not-shell-writes` — full evidence / evidencia completa

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
- **`isolation-guard-screens-edits-but-not-shell-writes`** — CLOSED BY MECHANISM 2026-09-30
  (b100-am-ui). A rule enforced on ONE write channel and absent on the other is not a rule. MEASURED
  twice on 2026-09-30 (workers `ad9703db` and `a5808993`): each was isolated in its own worktree, its
  brief authorised edits to gitignored main-checkout tooling by absolute path, the harness refused its
  `Edit`/`Write` calls while a plain `cp` onto the same path ran, and both shipped by copying across.
  The refusal text is the HARNESS's own (it is in no guard of ours), so the edit channel is not ours to
  change; the gap was that nothing on the shell channel said the same. **POLICY, one rule:** an isolated
  worker writes ONLY inside its own worktree and its private scratch; main-checkout tooling is changed by
  a worker that is NOT isolated and whose brief carries a `TENANCY:` line naming it. RULE: before a brief
  authorises a write by absolute path, establish whether its worker is isolated; an isolated worker is
  never told to write the main checkout, and a policy about writes is decided over the write TARGETS of
  a call, never per tool, so every channel gets the same answer. Two faces of the lesson stay
  unmechanised and are stated: a brief's prose authorisation cannot be discriminated from its prohibition
  (the same measured class as `brief-tenancy`), and writes made by a child process or by `rm`/`mkdir`/
  `touch` are not lexed. Mechanism: `.claude/isolation-boundary/guard.mjs` over the single shared
  write-target lexer `.claude/write-targets/` (`tool-call-writes.mjs`, `shell-writes.mjs`, `redirect-targets.mjs`),
  which `golden-guard` now reads too. Selftest 91/91, mutants 20/20 killed, and the two real incident
  commands replayed through the real dispatcher: DENY.
````
