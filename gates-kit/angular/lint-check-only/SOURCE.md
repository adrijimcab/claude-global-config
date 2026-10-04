# lint-check-only

ESLint run without `--fix` and with `--max-warnings 0`: a violation the fixer could rewrite still fails the
run, so a gate never "passes" by mutating the tree it grades. Inline directives are inert
(`noInlineConfig`), unused ones are errors.
@es ESLint sin `--fix` y con `--max-warnings 0`: una violación que el fixer podría reescribir sigue
fallando, así que un gate nunca "pasa" mutando el árbol que juzga. Las directivas en línea son inertes.

## Sources (from the explore record, engram #1147; not re-fetched)

- https://typescript-eslint.io/users/configs (the `recommended` preset used as the base).
- The explore finding that `discovery-api` lints with `--fix` in its `lint` script (a check-only gap),
  recorded in #1147.

## Fixtures

- `pass/total.ts`: `const sum`, clean.
- `fail/total.ts`: `let sum` never reassigned, `prefer-const`, reported as "potentially fixable with
  --fix": exactly the violation a `--fix` run would hide. Do not add `--fix` to `gate.json`: it would rewrite
  the fixture and the gate could no longer go red.

## Toolchain

`GATES_KIT_TOOLCHAIN` as in `ts-strict-type-checked` (typescript-eslint 8.57.1, eslint 9.39.4).
