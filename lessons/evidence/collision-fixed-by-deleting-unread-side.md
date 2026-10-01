# `collision-fixed-by-deleting-unread-side` — evidencia completa

Texto literal movido desde `~/.claude/CLAUDE.md` (sección «Promoted rules») el 2026-09-28. La forma vinculante vive en `~/.claude/rules/promoted-rules.md`.

- **`collision-fixed-by-deleting-unread-side`** — Resolving a conflict by taking one whole side preserves only what you
  thought to check afterwards. Measured, twice, and the second time it destroyed my own earlier
  work: I resolved three `docs/SCRIPTS.md` cherry-pick conflicts by keeping one side and
  re-substituting the machine-checkable cells from `package.json`, which silently dropped a
  hand-authored paragraph I had salvaged hours before — leaving the row self-contradicting (the
  Command column ran `--max-warnings=-1` while its own Description documented the spelling that
  aborts with `No -NUM option defined`) with `check:script-docs` green the whole time, because that
  gate compares commands and never reads prose.
  **The asymmetry: a side-taking resolution loses exactly the content no gate verifies**, which is
  also the content a human wrote deliberately and nobody will notice missing. So: before choosing a
  side, diff what each side uniquely HOLDS, not just what the gate will re-check. When both sides
  carry content, the resolution is a union you construct and verify, never a side you pick.
  **SECOND FACE — A STATE NAME IS NOT A DIAGNOSIS, and this one destroys work that was already
  right.** Measured: `check:i18n-provenance` reported one key `UNSTAMPED` in four locales and I wrote
  four fresh translations over the top. `UNSTAMPED` means "never recorded against a source text" — it
  says nothing about the text being absent, wrong, or even unreviewed. The translations were already
  there and already good; the whole remedy was to READ them and run the recorder. I noticed only
  because my own script echoed the values it was about to replace, and I then had to restore another
  worker's four translations from `HEAD` and redo the binding — the correct change turned out to be
  four sidecar files and nothing else.
  RULE: act on what a finding SAYS, never on what its state name suggests. Whenever the remedy might
  be "record, adopt or accept what is already there", read what is there FIRST. Overwriting is not a
  neutral default — it is the one move that cannot be undone by re-running the tool.


## Ledger line archived 2026-10-01 (condensed)

- [promoted] 2026-09-22 — collision-fixed-by-deleting-unread-side: now a binding rule in ~/.claude/rules/promoted-rules.md; closed by mechanism .claude/collision-guard/guard.mjs (selftest run, exit 0); full incident history in .claude/failure-capture/state/incidents.jsonl <!--fc:collision-fixed-by-deleting-unread-side#3-->

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
- **`collision-fixed-by-deleting-unread-side`** — Resolving a conflict by taking one whole side
  preserves only what you thought to check afterwards. **The asymmetry: a side-taking resolution
  loses exactly the content no gate verifies**, which is also the content a human wrote deliberately
  and nobody will notice missing. RULE: before choosing a side, diff what each side uniquely HOLDS,
  not just what the gate will re-check; when both sides carry content, the resolution is a union you
  construct and verify, never a side you pick.
  - **A STATE NAME IS NOT A DIAGNOSIS.** RULE: act on what a finding SAYS, never on what its state
    name suggests. Whenever the remedy might be "record, adopt or accept what is already there", read
    what is there FIRST — overwriting is not a neutral default.
  Evidencia completa de cada cara (incidentes medidos, literal): `~/.claude/lessons/evidence/collision-fixed-by-deleting-unread-side.md`.
````
