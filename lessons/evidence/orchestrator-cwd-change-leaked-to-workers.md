# `orchestrator-cwd-change-leaked-to-workers` — full evidence / evidencia completa

Ledger lines archived verbatim, append-only: each block is one original line, byte for byte, and may end with a closure note. @es Líneas del ledger archivadas literalmente, solo se añade: cada bloque es una línea original, byte a byte, y puede terminar con una nota de cierre.

## Ledger line archived 2026-10-01 (promoted)

- [global] 2026-09-30 — A live worker (a595e4b34a58b8c1d) received unprompted Environment update notices moving its Bash cwd to agent-aa3437bf9bf7832a9 and then to the main checkout, the exact sequence of cd commands I ran in my own Bash tool; it verified no damage and re-anchored with explicit cd. Root cause: the orchestrator changed its session cwd with cd inside Bash calls, and that cwd change propagated as a session-level environment update to other actors -> RULE: the orchestrator never uses cd in a Bash call; every command runs with absolute paths or git -C <path>, and a background command that needs a cwd sets it inside a spawned script, never through the session shell. <!--fc:orchestrator-cwd-change-leaked-to-workers#2-->

Promoted 2026-10-01 to ~/.claude/rules/promoted-rules.md; closed by mechanism C:/Users/adrian.jimenez/.claude/cwd-change-guard/guard.mjs (selftest run, exit 0)

## Loaded text archived 2026-10-01 (tiered)

Each block below was loaded from `~/.claude/rules/promoted-rules.md` until the tiering of 2026-10-01; it is archived byte for byte, and the loaded file keeps only its binding text. @es Cada bloque de abajo se cargaba desde `~/.claude/rules/promoted-rules.md` hasta el escalonado del 2026-10-01; se archiva byte a byte, y el fichero cargado conserva solo su texto vinculante.

````markdown
- **`orchestrator-cwd-change-leaked-to-workers`** — CLOSED BY MECHANISM 2026-09-30. A FOREGROUND
  shell call from the main session that changes the session shell's directory (`cd`, `pushd`,
  `Set-Location`…) moves the harness's "Primary working directory", and the harness announces that to
  every live worker as an "Environment update". MEASURED twice on 2026-09-30: the first reached a live
  worker (a595e4b34a58b8c1d), the second was a foreground `cd …/worktrees/fix-spec-types && node …`
  answered with "Primary working directory: …/fix-spec-types (was …/b100-am-ui)", restored by a later
  `cd`. MEASURED as NOT moving it: a `( cd X && … )` subshell and a `run_in_background` call. The rule was
  a ledger line ("never `cd` in a Bash call") and recurred, so it is now a mechanism, not a memory.
  RULE: the main session runs a command in another directory with (1) absolute paths or `git -C <dir>`,
  (2) a `( cd <dir> && … )` subshell, or (3) `run_in_background`. Mechanism:
  `~/.claude/cwd-change-guard/guard.mjs`, registered through the shell dispatcher manifest
  (`hook-dispatch/manifests/pretooluse-shell.json`), decided over the shared tokenizer
  (`shell-command/shell-command.mjs`, now with `includeNested: false`), never a regex or substring: a
  `cd` counts only in command position at the line's top level, in ANY position (not only the first),
  and never inside `( )`, `$( )`, backticks, `bash -c`, `cmd /c`, a pipe member, a `&` job, or as DATA
  (an `echo`, a commit message, a heredoc). A subagent's call is never refused: the caller is told apart
  by the same two signals `backlog-owner-guard` uses. Selftest 81/81, mutants 29/29 killed, and the
  wiring proven separately (removing the guard from the manifest turns the selftest red). The real
  incident command replayed through the real dispatcher: DENY. Replayed over the 83 real main-session
  shell payloads of session c45d798b: 42 refused, each a foreground `cd`, and the 2 `cd` calls with
  `run_in_background` allowed. NOT MEASURED, stated: whether a PowerShell `Set-Location` moves the
  harness cwd the way bash `cd` does — the guard covers it on the same premise.
  @es Una llamada de shell en PRIMER PLANO de la sesión principal que cambia el directorio de la shell
  (`cd`, `pushd`, `Set-Location`) mueve el «Primary working directory» del harness, y este lo anuncia a
  todos los workers vivos. Usar rutas absolutas o `git -C`, un subshell `( cd X && … )` o
  `run_in_background`. Lo impide `~/.claude/cwd-change-guard/guard.mjs`.
````
