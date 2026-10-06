# Angular 21 gates toolchain

Pinned packages the Angular gates run on for a project on Angular 21 (exact versions, no ranges;
`package-lock.json` makes the install reproducible). `toolchainFor(profile, hostNode)` in
`gates-kit/toolchain-for.mjs` names this toolchain for `{ framework: 'angular', major: 21 }`. Install once,
outside every repository: copy `package.json` and `package-lock.json` into a directory such as
`~/.claude-toolchains/angular-21`, run `npm ci --no-audit --no-fund` there, then verify with
`GATES_KIT_TOOLCHAIN=<that dir> node gates-kit/verify.mjs --toolchain angular-21`. `node_modules` is never
committed.

@es Paquetes fijados sobre los que corren los gates de Angular para un proyecto en Angular 21 (versiones
exactas, sin rangos; `package-lock.json` hace reproducible la instalación). `toolchainFor` nombra esta toolchain
para `{ framework: 'angular', major: 21 }`. Se instala una vez, fuera de todo repositorio: copiar
`package.json` y `package-lock.json` a un directorio como `~/.claude-toolchains/angular-21`, ejecutar allí
`npm ci --no-audit --no-fund` y verificar con `GATES_KIT_TOOLCHAIN=<ese dir> node gates-kit/verify.mjs
--toolchain angular-21`. `node_modules` nunca se versiona.

## Why these versions (npm, 2026-10-06; latest stable only, never a prerelease)

- Angular: latest 21.x 21.2.25.
- TypeScript: `>=5.9 <6.0` → 5.9.3. `@angular/compiler-cli@21.2.25` peers `>=5.9 <6.1`, but `@angular/build@21.2.25` peers `>=5.9 <6.0`: measured in a fresh `ng new` 21.2.25 project, npm refuses TypeScript 6.0.3 with ERESOLVE (only `--legacy-peer-deps` installs it, after which `ng build` and `tsc` pass). The pin is the intersection that installs cleanly.
- Lint: angular-eslint 21.4.0 peers `eslint ^8.57.0 || ^9.0.0 || ^10.0.0` → ESLint 10.12.0 (flat config only). It also peers `@angular/cli >=21 <22`, so npm locks `@angular/cli` 21.2.25 in; typescript-eslint 8.71.1 (`latest`; peers `typescript >=4.8.4 <6.1.0`, `eslint ^8.57.0 || ^9.0.0 || ^10.0.0`).
- Test runners: Vitest 4.1.11 with `@vitest/coverage-v8` 4.1.11, the `ng new` default (`testRunner` default `vitest`, `vitest ^4.0.8`), and Karma with Jasmine, still supported (`jasmine-core ~6.0.0` → 6.0.1). The gate runs the runner the project uses (`profile.testRunner`), never the default.
- dependency-cruiser 18.5.0 (`latest`).
- Node: Angular `^20.19.0 || ^22.12.0 || >=24.0.0`; every package of this lockfile `^22.13.0 || ^24.0.0 || >=26.0.0`.

Evidence: `npm view <pkg>@<range> version peerDependencies` for each package above, and `npm pack
@schematics/angular@^21` (`utility/latest-versions/package.json`, `ng-new/schema.json`). The lockfile was
produced with `npx npm@11.21.0 install --package-lock-only --ignore-scripts`: npm 10.9.4 and 10.9.9 crash
building it ("Cannot read properties of null (reading 'edgesOut')" with Vitest 4) or write a lock `npm ci`
refuses (chokidar/readdirp out of sync), measured; `npm ci` with npm 10.9.4 installs the npm 11 lock.

@es Versiones: la última estable de cada paquete que admite Angular 21 (nunca prerelease), con la evidencia
de `npm view` y `npm pack @schematics/angular`. El gate corre el runner que usa el proyecto, nunca el de por
defecto. El lockfile se generó con npm 11.21.0 porque npm 10 falla al construirlo o escribe uno que `npm ci`
rechaza (medido); `npm ci` con npm 10.9.4 instala el lock de npm 11.
