# lint-check-only

ESLint run without `--fix` and with `--max-warnings 0`: a violation the fixer could rewrite still fails the
run, so a gate never "passes" by mutating the tree it grades. Inline directives are inert
(`noInlineConfig`), unused ones are errors.
@es ESLint sin `--fix` y con `--max-warnings 0`: una violación que el fixer podría reescribir sigue
fallando, así que un gate nunca "pasa" mutando el árbol que juzga. Las directivas en línea son inertes.

## Sources (not re-fetched)

- https://typescript-eslint.io/users/configs (the `recommended` preset used as the base).
- `templates/node-lib-vitest/AGENT-CONTRACT.md` G1: a failing gate is fixed in the code, never by a rewrite
  that hides it. The gate is the one `angular/lint-check-only` runs, kept in this folder so a project copies
  one self-contained gate.

## Fixtures

- `pass/total.ts`: `const sum`, clean.
- `fail/total.ts`: `let sum` never reassigned, `prefer-const`, reported as "potentially fixable with
  --fix": exactly the violation a `--fix` run would hide. Do not add `--fix` to `gate.json`: it would rewrite
  the fixture and the gate could no longer go red.

## Toolchain

`GATES_KIT_TOOLCHAIN` as in `ts-strict-type-checked` (`gates-kit/toolchains/node-vitest/package.json`).
@es `GATES_KIT_TOOLCHAIN` como en `ts-strict-type-checked` (`gates-kit/toolchains/node-vitest/package.json`).
