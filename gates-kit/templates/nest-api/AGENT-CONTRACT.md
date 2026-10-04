# Agent Contract template: NestJS API

Copy to the repository as `.claude/AGENT-CONTRACT.md`. Replace the full-chain command with the repository's own script and keep exactly one such line.
@es Copiar al repositorio como `.claude/AGENT-CONTRACT.md`. Reemplazar el comando de cadena completa por el script propio del repositorio y conservar exactamente una línea así.

## G1 Zero suppression

No agent adds or creates an exclusion, allowlist, ignore entry, baseline, coverage exclusion, skipped or `.only` test, `eslint-disable`, `@ts-ignore`, a rule set to off, or a threshold below the measured value. A failing gate is fixed in the code; only when a rule is genuinely wrong for the domain is the rule changed, with a written justification. A dependency audit finding is fixed by upgrading or replacing the package, never by lowering the audit level.
@es Ningún agente agrega ni crea una exclusión, lista de permitidos, entrada de ignore, línea base, exclusión de cobertura, test omitido o `.only`, `eslint-disable`, `@ts-ignore`, regla en off ni umbral por debajo del valor medido. Un gate que falla se corrige en el código; solo cuando una regla es realmente inadecuada para el dominio se cambia la regla, con una justificación escrita. Un hallazgo de auditoría de dependencias se corrige actualizando o reemplazando el paquete, nunca bajando el nivel de la auditoría.

## G2 Bilingual runtime text

Comments and documentation read English first, then the Spanish mirror marked `@es`. Every runtime message (logger lines, thrown error text, validation and exception messages returned to a client) carries both languages in the same message. Identifiers, error codes and parsed values are not translated.
@es Los comentarios y la documentación van primero en inglés y luego el espejo en español marcado con `@es`. Todo mensaje en ejecución (líneas de logger, texto de errores lanzados, mensajes de validación y de excepción devueltos a un cliente) lleva ambos idiomas en el mismo mensaje. Los identificadores, los códigos de error y los valores que un programa parsea no se traducen.

## G3 Scoped gates during work, full chain once at landing

Gates of this stack: lint with typescript-eslint strict-type-checked, `tsc --noEmit`, unit and end-to-end tests with coverage caps, the global `ValidationPipe`, `helmet` and OpenAPI drift checks, the dependency audit at its fixed level, and the production build.
@es Gates de este stack: lint con typescript-eslint strict-type-checked, `tsc --noEmit`, tests unitarios y de extremo a extremo con topes de cobertura, los chequeos de `ValidationPipe` global, `helmet` y deriva de OpenAPI, la auditoría de dependencias a su nivel fijo y el build de producción.

Full-chain command: `npm run build:ci`
@es Comando de la cadena completa: `npm run build:ci`

A worker runs only the gates that read what it touched; the full chain runs once, at the end, by the orchestrator.
@es Un worker corre solo los gates que leen lo que tocó; la cadena completa corre una sola vez, al final, por el orquestador.

## G4 Out-of-scope repositories untouched

An agent edits only the repository and the paths its brief names. Client applications, the legacy system and other repositories the owner placed out of scope are read-only: a gap found there becomes a finding with its evidence, never an edit. A real backend is never called by a test unless the brief names it.
@es Un agente edita solo el repositorio y las rutas que su brief nombra. Las aplicaciones cliente, el sistema legado y los demás repositorios que el dueño dejó fuera de alcance son de solo lectura: una carencia encontrada allí se convierte en un hallazgo con su evidencia, nunca en una edición. Un backend real nunca se invoca desde un test salvo que el brief lo nombre.

## G5 Unit size and writers

A unit is at most about 130 product lines and a commit is at most 400 changed lines, with at most three concurrent writers on disjoint files. Commit with an explicit pathspec before reporting a unit done; never run a fresh `npm ci` in a shared worktree.
@es Una unidad tiene como máximo unas 130 líneas de producto y un commit como máximo 400 líneas cambiadas, con a lo sumo tres escritores concurrentes sobre ficheros disjuntos. Se commitea con un pathspec explícito antes de dar una unidad por terminada; nunca se corre un `npm ci` nuevo en un worktree compartido.

## G6 Closed items need evidence

A backlog item, an open point or a "closed by mechanism" claim is closed only with evidence: the command, its real exit code, the path or the measurement. A claim without a receipt is a hypothesis and is marked as one.
@es Un ítem del backlog, un punto abierto o una afirmación de "cerrado por mecanismo" se cierra solo con evidencia: el comando, su código de salida real, la ruta o la medición. Una afirmación sin recibo es una hipótesis y se marca como tal.
