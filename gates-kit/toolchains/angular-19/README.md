# Angular 19 gates toolchain

Pinned packages the Angular gates run on for a project on Angular 19 (exact versions, no ranges;
`package-lock.json` makes the install reproducible). `toolchainFor(profile, hostNode)` in
`gates-kit/toolchain-for.mjs` names this toolchain for `{ framework: 'angular', major: 19 }`. Install once,
outside every repository: copy `package.json` and `package-lock.json` into a directory such as
`~/.claude-toolchains/angular-19`, run `npm ci --no-audit --no-fund` there, then verify with
`GATES_KIT_TOOLCHAIN=<that dir> node gates-kit/verify.mjs --toolchain angular-19`. `node_modules` is never
committed.

@es Paquetes fijados sobre los que corren los gates de Angular para un proyecto en Angular 19 (versiones
exactas, sin rangos; `package-lock.json` hace reproducible la instalación). `toolchainFor` nombra esta toolchain
para `{ framework: 'angular', major: 19 }`. Se instala una vez, fuera de todo repositorio: copiar
`package.json` y `package-lock.json` a un directorio como `~/.claude-toolchains/angular-19`, ejecutar allí
`npm ci --no-audit --no-fund` y verificar con `GATES_KIT_TOOLCHAIN=<ese dir> node gates-kit/verify.mjs
--toolchain angular-19`. `node_modules` nunca se versiona.

## Why these versions (npm, 2026-10-06; latest stable only, never a prerelease)

- Angular: latest 19.x 19.2.25 (`@angular/core`; CLI 19.2.27).
- TypeScript: `>=5.5 <5.9` (`@angular/compiler-cli@19.2.25` and `@angular/build@19.2.27` peers) → 5.8.3.
- Lint: angular-eslint 19.8.1 peers `eslint ^8.57.0 || ^9.0.0` → ESLint 9.39.5 (ESLint 10 is outside its peer); typescript-eslint 8.71.1 (`latest`; peers `typescript >=4.8.4 <6.1.0`, `eslint ^8.57.0 || ^9.0.0 || ^10.0.0`).
- Test runners: Karma with Jasmine only: `ng new` 19 has no test-runner option and writes Karma (`@schematics/angular@19.2.27`, `jasmine-core ~5.6.0` → 5.6.0). A 19 project on Vitest is refused by `toolchainFor`. The gate runs the runner the project uses (`profile.testRunner`), never the default.
- dependency-cruiser 18.5.0 (`latest`).
- Node: Angular `^18.19.1 || ^20.11.1 || >=22.0.0`; every package of this lockfile `^22.13.0 || ^24.0.0 || >=26.0.0` (dependency-cruiser `^22||^24||>=26`, its `watskeburt` `^22.13`).
- Angular 19 reached end of life on 2026-05-19; the toolchain exists because projects on it still need gates.

Evidence: `npm view <pkg>@<range> version peerDependencies` for each package above, and `npm pack
@schematics/angular@^19` (`utility/latest-versions/package.json`, `ng-new/schema.json`). The lockfile was
produced with `npx npm@11.21.0 install --package-lock-only --ignore-scripts`: npm 10.9.4 and 10.9.9 crash
building it ("Cannot read properties of null (reading 'edgesOut')" with Vitest 4) or write a lock `npm ci`
refuses (chokidar/readdirp out of sync), measured; `npm ci` with npm 10.9.4 installs the npm 11 lock.

@es Versiones: la última estable de cada paquete que admite Angular 19 (nunca prerelease), con la evidencia
de `npm view` y `npm pack @schematics/angular`. El gate corre el runner que usa el proyecto, nunca el de por
defecto. El lockfile se generó con npm 11.21.0 porque npm 10 falla al construirlo o escribe uno que `npm ci`
rechaza (medido); `npm ci` con npm 10.9.4 instala el lock de npm 11.
