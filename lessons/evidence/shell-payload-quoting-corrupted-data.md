# `shell-payload-quoting-corrupted-data` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (condensed)

- [global] 2026-06-30 — (×4) A shell one-liner silently corrupted data four times: a `python - <<'PY'` heredoc OWNED stdin so the piped data was never read (0 results); the shell ate the apostrophes in French JSON (`d échouer`); `node -e '…"\b"…'` reached JS as a literal BACKSPACE and two scripts reported "58 symbols missing from develop" when the answer was 0; and an unquoted `$rev:$path` in a Git-Bash loop failed on path separators → RULE: any payload with quotes, apostrophes, escapes, regex or non-ASCII goes in a `.mjs`/script FILE run with node — never inline in the shell, never piped into a heredoc-fed tool — always quote `"$rev:$path"`, and batch `xargs -n 40` (Windows' 8191-char command limit). Detection corollary: a catastrophic, implausible result (all missing, all empty, zero matches) is FIRST a suspected tool bug and only then a finding — check it against something already known before reporting it.
