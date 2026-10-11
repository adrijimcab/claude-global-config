# GitLab CI quality stage — lint standard, adoption rule, registry pattern

The copyable files live in `templates/gitlab-ci-quality/` (CI file, gitleaks, Lighthouse CI, ESLint, Stylelint,
`.npmrc`). They are checked by `templates/quality-stage-rules.mjs`, selftest and mutants. This page holds what
cannot sit in those files: why they are shaped this way and what is still open.

@es Los ficheros copiables viven en `templates/gitlab-ci-quality/` (CI, gitleaks, Lighthouse CI, ESLint,
Stylelint, `.npmrc`). Los verifica `templates/quality-stage-rules.mjs`, con su selftest y sus mutantes. Esta
página guarda lo que no cabe en esos ficheros: por qué tienen esa forma y qué sigue abierto.

## The four jobs (all blocking)

| Job | Tool | What fails it |
|---|---|---|
| `quality:styles` | Stylelint + `@base100/stylelint-plugin` | any finding of an adopted rule |
| `quality:secrets` | gitleaks (kit menu row 1) | a committed secret; entropy 3.5 on `generic-api-key` |
| `quality:dependency-audit` | `npm audit --audit-level=high` (menu row 4) or osv-scanner | a known high or critical advisory |
| `quality:lighthouse` | Lighthouse CI (menu row 11) | accessibility median below 0.9 (error) |

No job carries `allow_failure`. A gate that cannot fail the pipeline is a report; the owner's
zero-suppression rule applies. A gate that is not ready is not added yet, it is added the day it measures
zero. The prose of the gitleaks and Lighthouse choices is in `tier1-tier3-menu.md` (rows 1 and 11); the
templates carry the configs.

@es Ningún job lleva `allow_failure`. Un gate que no puede hacer fallar el pipeline es un informe; rige la
regla de cero supresión del dueño. Un gate que aún no está listo no se agrega todavía: se agrega el día que
mide cero. La prosa de gitleaks y Lighthouse está en `tier1-tier3-menu.md` (filas 1 y 11); las plantillas
llevan las configs.

Measured while building the template (gitleaks 8.30.1): the `[extend.entropy] Min = 3.5` table shown in older
guides is accepted without error and has no effect, as does any unknown table. Entropy is set on the rule:
`[[rules]] id = "generic-api-key" entropy = 3.5` (3.0 flags a 3.29-entropy value, 3.5 does not). The checker
refuses the no-op table. Lighthouse CI's default `assert.aggregationMethod` is `optimistic`, so the template
sets `median` explicitly; "median of 3" is otherwise not what is asserted.

@es Medido al construir la plantilla (gitleaks 8.30.1): la tabla `[extend.entropy] Min = 3.5` de guías
antiguas se acepta sin error y no tiene efecto, igual que cualquier tabla desconocida. La entropía se fija
en la regla. El verificador rechaza la tabla sin efecto. El valor por defecto de `aggregationMethod` en
Lighthouse CI es `optimistic`, por eso la plantilla fija `median`.

## The lint standard

`@base100/eslint-plugin` `^3.0.0` with `configs.consumer` (spread as is, never re-listed rule by rule),
`@base100/stylelint-plugin` `^1.0.0` with `postcss-scss`, and `eslint-plugin-security`. The company-facing
statement of the standard is these published packages; copied files cite them and nothing private.

@es El estándar de cara a la empresa son estos paquetes publicados; los ficheros copiados los citan y no
nombran nada privado.

## Adoption rule: ZERO offenders, then enable

A rule is adopted only at ZERO offenders. Measure it on the tree, fix the code at the root, then enable it.
A rule is never added "registered but off" (`"off"`, `null`, `false`, a commented-out job, a list of pending
rules with counts): that is debt that looks like progress and the checker refuses it in the lint configs. If
the fix is not possible without a regression, stop and report the evidence; the rule waits outside the file.

@es Una regla se adopta solo con CERO infractores. Se mide en el árbol, se corrige el código de raíz y recién
entonces se activa. Nunca se agrega "registrada pero apagada" (`"off"`, `null`, `false`, un job comentado,
una lista de reglas pendientes con conteos): es deuda que parece progreso y el verificador la rechaza en las
configs de lint. Si el arreglo no es posible sin una regresión, se detiene el trabajo y se informa la
evidencia; la regla espera fuera del fichero.

## Registry pattern (`.npmrc`)

The scoped registry points at `<REGISTRY_HOST>`; the credential is only the environment reference
`${REGISTRY_TOKEN}`. npm expands it when it reads the file, so the value lives in a masked CI/CD variable
and in each developer's environment, never in a tracked file. The checker refuses a literal `_authToken`,
`_auth` or `_password` and a registry line without the placeholder.

@es El registro con scope apunta a `<REGISTRY_HOST>`; la credencial es solo la referencia de entorno
`${REGISTRY_TOKEN}`. npm la expande al leer el fichero, así que el valor vive en una variable de CI/CD
enmascarada y en el entorno de cada desarrollador, nunca en un fichero versionado.

## Open company items

Owner-acknowledged, company-side, no date. They are not permanent: do not design around their absence.

1. TLS on the company GitLab host (the registry is reached over plain HTTP today).
2. Closing the GitLab npm forwarding, or claiming the scope on the public registry, so a scoped name cannot
   be served from the wrong place.

Until both are closed, the token never sits in a tracked file; it is a masked CI/CD variable on the company
side. The template already uses `https://`, so it needs no change when TLS arrives.

@es Reconocidos por el dueño, del lado de la empresa, sin fecha. No son permanentes: no diseñar alrededor de
su ausencia. (1) TLS en el host de GitLab de la empresa (hoy se llega al registro por HTTP plano). (2) Cerrar
el reenvío npm de GitLab, o reclamar el scope en el registro público, para que un nombre con scope no pueda
servirse desde el lugar equivocado. Hasta que ambos se cierren, el token nunca está en un fichero
versionado; es una variable de CI/CD enmascarada del lado de la empresa. La plantilla ya usa `https://`, así
que no necesita cambios cuando llegue TLS.

## Not verified here

The pipeline was not run in a GitLab runner (none available). The gitleaks config was run with gitleaks
8.30.1 against the template folder (no leaks, exit 0). The Chromium install step in `quality:lighthouse` and the
`@base100` rule names in the Stylelint file are carried over from a measured branch and not re-run.

@es El pipeline no se corrió en un runner de GitLab (no hay uno disponible). La config de gitleaks sí se corrió
con gitleaks 8.30.1 sobre la carpeta de la plantilla (sin hallazgos, exit 0). El paso que instala Chromium en
`quality:lighthouse` y los nombres de reglas `@base100` del fichero de Stylelint vienen de una rama medida y no
se volvieron a correr.
