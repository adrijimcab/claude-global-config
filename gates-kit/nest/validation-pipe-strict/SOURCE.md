# validation-pipe-strict

ESLint with one AST rule (`no-restricted-syntax`): every `new ValidationPipe(...)` must carry
`whitelist: true` and `forbidNonWhitelisted: true` in its options. `whitelist` strips a property the DTO does
not declare; `forbidNonWhitelisted` turns that into a rejected request, so a client learns it sent something
the API ignores. Both together close the mass-assignment class `node-express.md` section 1 describes. This is
the "global `ValidationPipe`" gate of `templates/nest-api/AGENT-CONTRACT.md` (G3), in the one form a parser can
decide.
@es ESLint con una regla de AST (`no-restricted-syntax`): todo `new ValidationPipe(...)` debe llevar
`whitelist: true` y `forbidNonWhitelisted: true` en sus opciones. `whitelist` descarta una propiedad que el DTO
no declara; `forbidNonWhitelisted` lo convierte en una petición rechazada. Juntas cierran la clase
mass-assignment de `node-express.md`, sección 1. Es el gate de "`ValidationPipe` global" de
`templates/nest-api/AGENT-CONTRACT.md` (G3), en la única forma que un parser puede decidir.

## Sources (not re-fetched)

- `node-express.md` section 1 (validation at every boundary; `class-validator` for Nest; the schema's
  whitelist mode closes mass-assignment).
- `templates/nest-api/AGENT-CONTRACT.md` G3 ("the global `ValidationPipe`").
- https://docs.nestjs.com/techniques/validation (`whitelist`, `forbidNonWhitelisted`).
- https://eslint.org/docs/latest/rules/no-restricted-syntax (selectors are AST queries, esquery syntax).

## Not measured here (stated)

The gate decides what a pipe CONSTRUCTED in the scanned tree says; it does not prove a pipe is registered
globally (`app.useGlobalPipes`), nor read options passed through a variable or a spread (those are reported:
the options object must be written at the `new` call). No Nest repository was measured. Whether the pipe is
installed at all is the code review and the end-to-end test's job.

## Fixtures

- `pass/main.ts`: `new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- `fail/main.ts`: `whitelist: true` without `forbidNonWhitelisted`. The verifier's single fail fixture
  exercises only the `forbidNonWhitelisted` selector; the `whitelist` selector was measured by hand on a pipe
  with no options, with `whitelist: false` and with an options object lacking it (each reported).

## Toolchain

`GATES_KIT_TOOLCHAIN` as in `ts-strict-type-checked` (`gates-kit/toolchains/nest/package.json`). The parser is
`typescript-eslint`'s, with no type information, so `@nestjs/common` need not be installed.
@es `GATES_KIT_TOOLCHAIN` como en `ts-strict-type-checked`. El parser es el de `typescript-eslint`, sin
información de tipos, así que `@nestjs/common` no necesita estar instalado.
