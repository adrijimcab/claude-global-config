# `shell-one-liner-corrupted-data` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-09-30 — A worker (a55f6924710e1b29d, plugin-eslint) ran an inline sed whose escaped backtick GNU sed read as a start-of-line anchor, prefixing all 301 lines of an uncommitted spec with a backtick; it restored the file with a checked script. Root cause: the same shell-one-liner-corrupts-data class already in the global ledger (x4), unenforced for sed because the eval-guard only screens node -e style payloads -> RULE: text edits with escapes or regex metacharacters go through the Edit tool or a .mjs file, never an inline sed/awk; the eval-guard must also refuse inline sed/awk scripts carrying backslash escapes. <!--fc:shell-one-liner-corrupted-data#1-->

## Ledger line archived 2026-10-04 (promoted)

- [global] 2026-09-30 — RULE: text edits with escapes or regex metacharacters go through the Edit tool or a .mjs file, never an inline sed/awk; the eval-guard must also refuse inline sed/awk scripts carrying backslash escapes. Evidence: lessons/evidence/shell-one-liner-corrupted-data.md <!--fc:shell-one-liner-corrupted-data#2-->

Promoted 2026-10-04 to the delegated-worker contract (its file); closed by mechanism C:/Users/adrian.jimenez/.claude/eval-guard/guard.mjs (selftest run, exit 0)
