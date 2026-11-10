---
paths:
  - "**/package.json"
  - "**/package-lock.json"
  - "**/eslint.config.*"
  - "**/.eslintrc*"
  - "**/eslint-suppressions.json"
  - "**/.husky/**"
  - "**/lefthook.yml"
  - "**/.pre-commit-config.yaml"
---
# Lessons Ledger — repo-tooling (path-scoped)

Lessons about the repository manifest, lint configuration and git hooks. The harness loads this file ONLY when a file matching the `paths:` above is read.
One line per RULE (a repeat folds into its line and bumps the counter). Machine state: the trailing `<!--fc:KEY#N-->`
marker belongs to `~/.claude/failure-capture/`; this file is written only by `capture.mjs`, never by hand.

---

- [repo-tooling] 2026-07-20 — RULE: when introducing a lint rule backed by a native suppressions ratchet, VERIFY the project's actual lint command loads the suppressions file (`npx eslint <baselined-file>` exit 0 vs the project runner); if the runner is `ng lint`/a framework builder, switch lint to the ESLint CLI with the flat config (parity-verified) or the ratchet is a silent no-op. Evidence: lessons/evidence/suppression-ratchet-unread-by-framework-builder.md
- [repo-tooling] 2026-09-29 — RULE: antes de prometer un arreglo de audit, verificar con npm view que exista una versión fuera del rango vulnerable dentro del mismo major y quién la fija; y un recuento de otro agente sobre ese campo va al dueño marcado como no verificado. Evidence: lessons/evidence/npm-fixavailable-read-as-a-non-breaking-fix.md <!--fc:npm-fixavailable-read-as-a-non-breaking-fix#1-->
- [repo-tooling] 2026-07-10 — RULE: en pre-push usar mutate+abort-on-change o check-only; los syncs mutantes que deben entrar al commit van en pre-commit. Evidence: lessons/evidence/mutating-sync-placed-in-pre-push.md
- [repo-tooling] 2026-10-27 — RULE: A worktree that runs Vite or Vitest gets its own node_modules from the lockfile (npm ci in that worktree), never a junction to another checkout's; the provisioner refuses a linked node_modules. Evidence: lessons/evidence/junctioned-node-modules-broke-vitest-coverage.md <!--fc:junctioned-node-modules-broke-vitest-coverage#1-->
- [repo-tooling] 2026-10-25 — RULE: a multi-major Angular update runs one major at a time with its migrations committed per hop; when a hop was skipped, list the skipped major's migrations from its own package tarball and apply each before trusting the tree. Evidence: lessons/evidence/angular-update-skipped-intermediate-major.md <!--fc:angular-update-skipped-intermediate-major#1-->
