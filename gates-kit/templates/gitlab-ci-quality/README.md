# GitLab CI quality stage

Copy these files to the repository root and replace every `<PLACEHOLDER>`. Four blocking jobs: styles
lint, secrets, dependency audit, Lighthouse CI. None may carry `allow_failure`.

@es Copiar estos ficheros a la raíz del repositorio y reemplazar cada `<PLACEHOLDER>`. Cuatro jobs
bloqueantes: lint de estilos, secretos, auditoría de dependencias, Lighthouse CI. Ninguno puede llevar
`allow_failure`.

## package.json

Scripts the jobs call: `"lint:styles": "stylelint \"src/**/*.scss\""`, `"build"` (the app build whose
output `.lighthouserc.cjs` serves). Dev dependencies: `@base100/eslint-plugin` `^3.0.0`,
`@base100/stylelint-plugin` `^1.0.0`, `eslint-plugin-security`, `stylelint`, `postcss-scss`,
`@lhci/cli`.

@es Scripts que llaman los jobs: `"lint:styles"` y `"build"` (el build de la app cuya salida sirve
`.lighthouserc.cjs`). Dependencias de desarrollo: las de arriba.

## Adoption rule

A lint rule is adopted only at ZERO offenders: measure it, fix the code, then enable it. A rule that
is registered but switched off is debt that looks like progress, so there is no such list in these
files.

@es Una regla de lint se adopta solo con CERO infractores: se mide, se corrige el código y recién
entonces se activa. Una regla registrada pero apagada es deuda que parece progreso, por eso estos
ficheros no llevan esa lista.

## Registry token

`.npmrc` holds only the environment reference `${REGISTRY_TOKEN}`. Define `REGISTRY_TOKEN` as a masked
CI/CD variable; never commit its value.

@es `.npmrc` guarda solo la referencia de entorno `${REGISTRY_TOKEN}`. Definir `REGISTRY_TOKEN` como
variable de CI/CD enmascarada; nunca versionar su valor.
