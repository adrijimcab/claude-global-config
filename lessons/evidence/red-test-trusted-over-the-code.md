# `red-test-trusted-over-the-code` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-11-04 (captured)

- [global] 2026-11-04 — b100-am-ui 2026-11-04: toolchain-guard/selftest.mjs:816 went red on "cd <linked worktree> && npm ci". The case built the command from a native Windows path with unquoted backslashes, which bash reads as escapes, so the cd never reached the worktree and the guard was right to refuse the wipe. Changing the guard to make the case pass would have opened a real hole -> root cause: a red test is read as a defect of the code, without first checking whether the test itself states the truth (its fixture, its input spelling, its expectation) RULE: Before changing code to turn a red test green, verify that the test states the truth: reproduce its input on a minimal case and check the fixture and the expectation; when the test is wrong, fix the test and add a case that pins the correct behaviour. <!--fc:red-test-trusted-over-the-code#1-->
