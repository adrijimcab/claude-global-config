# Agent Contract template: Node library with Vitest

Copy to the repository as `.claude/AGENT-CONTRACT.md`. Replace the full-chain command with the repository's own script and keep exactly one such line.
@es Copiar al repositorio como `.claude/AGENT-CONTRACT.md`. Reemplazar el comando de cadena completa por el script propio del repositorio y conservar exactamente una línea así.

## G1 Zero suppression

No agent adds or creates an exclusion, allowlist, ignore entry, baseline, coverage exclusion, skipped or `.only` test, `eslint-disable`, `@ts-ignore`, a rule set to off, or a threshold below the measured value. A failing gate is fixed in the code; only when a rule is genuinely wrong for the domain is the rule changed, with a written justification. A surviving mutant is killed by a new assertion, never by excluding the mutated file or the mutator.
@es Ningún agente agrega ni crea una exclusión, lista de permitidos, entrada de ignore, línea base, exclusión de cobertura, test omitido o `.only`, `eslint-disable`, `@ts-ignore`, regla en off ni umbral por debajo del valor medido. Un gate que falla se corrige en el código; solo cuando una regla es realmente inadecuada para el dominio se cambia la regla, con una justificación escrita. Un mutante superviviente se mata con una aserción nueva, nunca excluyendo el fichero mutado ni el mutador.

## G2 Bilingual runtime text

Comments and documentation read English first, then the Spanish mirror marked `@es`. Every runtime message (console output, thrown error text, CLI output) carries both languages in the same message. Identifiers, error codes and parsed values are not translated.
@es Los comentarios y la documentación van primero en inglés y luego el espejo en español marcado con `@es`. Todo mensaje en ejecución (salida de consola, texto de errores lanzados, salida de CLI) lleva ambos idiomas en el mismo mensaje. Los identificadores, los códigos de error y los valores que un programa parsea no se traducen.

## G3 Scoped gates during work, full chain once at landing

Gates of this stack: lint with typescript-eslint strict-type-checked, `tsc --noEmit`, Vitest with coverage caps, Stryker mutation testing, commit message lint with its hooks, and the package build.
@es Gates de este stack: lint con typescript-eslint strict-type-checked, `tsc --noEmit`, Vitest con topes de cobertura, pruebas de mutación con Stryker, lint de mensajes de commit con sus hooks y el build del paquete.

Full-chain command: `npm run build:ci`
@es Comando de la cadena completa: `npm run build:ci`

A worker runs only the gates that read what it touched; the full chain runs once, at the end, by the orchestrator.
@es Un worker corre solo los gates que leen lo que tocó; la cadena completa corre una sola vez, al final, por el orquestador.

## G4 Out-of-scope repositories untouched

An agent edits only the repository and the paths its brief names. Consumers of the library and other repositories the owner placed out of scope are read-only: a gap found there becomes a finding with its evidence, never an edit.
@es Un agente edita solo el repositorio y las rutas que su brief nombra. Los consumidores de la librería y los demás repositorios que el dueño dejó fuera de alcance son de solo lectura: una carencia encontrada allí se convierte en un hallazgo con su evidencia, nunca en una edición.

## G5 Unit size and writers

A unit is at most about 130 product lines and a commit is at most 400 changed lines, with at most three concurrent writers on disjoint files. Commit with an explicit pathspec before reporting a unit done; never run a fresh `npm ci` in a shared worktree.
@es Una unidad tiene como máximo unas 130 líneas de producto y un commit como máximo 400 líneas cambiadas, con a lo sumo tres escritores concurrentes sobre ficheros disjuntos. Se commitea con un pathspec explícito antes de dar una unidad por terminada; nunca se corre un `npm ci` nuevo en un worktree compartido.

## G6 Closed items need evidence

A backlog item, an open point or a "closed by mechanism" claim is closed only with evidence: the command, its real exit code, the path or the measurement. A claim without a receipt is a hypothesis and is marked as one.
@es Un ítem del backlog, un punto abierto o una afirmación de "cerrado por mecanismo" se cierra solo con evidencia: el comando, su código de salida real, la ruta o la medición. Una afirmación sin recibo es una hipótesis y se marca como tal.
