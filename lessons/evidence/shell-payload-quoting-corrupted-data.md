# `shell-payload-quoting-corrupted-data` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-06-30 — (×4) A shell one-liner silently corrupted data four times: a `python - <<'PY'` heredoc OWNED stdin so the piped data was never read (0 results); the shell ate the apostrophes in French JSON (`d échouer`); `node -e '…"\b"…'` reached JS as a literal BACKSPACE and two scripts reported "58 symbols missing from develop" when the answer was 0; and an unquoted `$rev:$path` in a Git-Bash loop failed on path separators → RULE: any payload with quotes, apostrophes, escapes, regex or non-ASCII goes in a `.mjs`/script FILE run with node — never inline in the shell, never piped into a heredoc-fed tool — always quote `"$rev:$path"`, and batch `xargs -n 40` (Windows' 8191-char command limit). Detection corollary: a catastrophic, implausible result (all missing, all empty, zero matches) is FIRST a suspected tool bug and only then a finding — check it against something already known before reporting it.

## Ledger line archived 2026-10-16 (captured)

- [global] 2026-10-16 — Creating node_modules junctions for four worktrees, the orchestrator built a Windows path inside a bash double-quoted string as "...worktrees\$1"; the escaped dollar was not expanded, PowerShell received the literal path .claude/worktrees$1, created that stray folder with two junctions to the real node_modules, and the other three junction calls failed -> root cause: a path with backslashes and a shell variable assembled inline in bash for another shell RULE: Paths passed from bash to PowerShell or cmd are never assembled inline with backslashes and variables; the work goes in a .ps1 or .mjs file that takes plain arguments. <!--fc:shell-payload-quoting-corrupted-data#1-->

## Ledger line archived 2026-10-26 (recounted)

- [global] 2026-10-16 — RULE: Paths passed from bash to PowerShell or cmd are never assembled inline with backslashes and variables; the work goes in a .ps1 or .mjs file that takes plain arguments. Evidence: lessons/evidence/shell-payload-quoting-corrupted-data.md <!--fc:shell-payload-quoting-corrupted-data#4-->

Recounted 2026-10-26 from 4 to 3: one recurrence carried in 9f8c0cf was captured twice by the Discovery session (orchestrator P2-7 finding; HYPOTHESIS here: incidents.jsonl lives on the owner host)
