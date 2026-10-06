# Agent Contract template: Angular library

Copy to the repository as `.claude/AGENT-CONTRACT.md`. Replace the full-chain command with the repository's own script and keep exactly one such line.
@es Copiar al repositorio como `.claude/AGENT-CONTRACT.md`. Reemplazar el comando de cadena completa por el script propio del repositorio y conservar exactamente una línea así.

Findings register: `.claude/FINDINGS.jsonl`
@es Registro de hallazgos: `.claude/FINDINGS.jsonl`

## G1 Zero suppression

No agent adds or creates an exclusion, allowlist, ignore entry, baseline, coverage exclusion, skipped or `.only` test, `eslint-disable`, `@ts-ignore`, a rule set to off, or a threshold below the measured value. A failing gate is fixed in the code; only when a rule is genuinely wrong for the domain is the rule changed, with a written justification. A public API change is made on purpose and recorded, never hidden by loosening the API check.
@es Ningún agente agrega ni crea una exclusión, lista de permitidos, entrada de ignore, línea base, exclusión de cobertura, test omitido o `.only`, `eslint-disable`, `@ts-ignore`, regla en off ni umbral por debajo del valor medido. Un gate que falla se corrige en el código; solo cuando una regla es realmente inadecuada para el dominio se cambia la regla, con una justificación escrita. Un cambio de API pública se hace a propósito y se registra, nunca se oculta aflojando el chequeo de API.

## G2 Bilingual runtime text

Comments and documentation read English first, then the Spanish mirror marked `@es`. Every runtime message (`console.*`, logger lines, thrown error text, user-facing validation messages) carries both languages in the same message. Identifiers, i18n keys and parsed values are not translated.
@es Los comentarios y la documentación van primero en inglés y luego el espejo en español marcado con `@es`. Todo mensaje en ejecución (`console.*`, líneas de logger, texto de errores lanzados, mensajes de validación para el usuario) lleva ambos idiomas en el mismo mensaje. Los identificadores, las claves de i18n y los valores que un programa parsea no se traducen.

## G3 Scoped gates during work, full chain once at landing

Gates of this stack: `ng lint` with typescript-eslint strict-type-checked and the Angular template accessibility rules, `tsc --noEmit` over the library configuration, the spec type check, unit tests with coverage caps, the library package build, the public API check and the dependency-boundary check.
@es Gates de este stack: `ng lint` con typescript-eslint strict-type-checked y las reglas de accesibilidad de plantillas de Angular, `tsc --noEmit` sobre la configuración de la librería, el chequeo de tipos de los specs, los tests unitarios con topes de cobertura, el build del paquete de la librería, el chequeo de API pública y el chequeo de fronteras de dependencias.

Full-chain command: `npm run build:ci-pr`
@es Comando de la cadena completa: `npm run build:ci-pr`

A worker runs only the gates that read what it touched; the full chain runs once, at the end, by the orchestrator.
@es Un worker corre solo los gates que leen lo que tocó; la cadena completa corre una sola vez, al final, por el orquestador.

## G4 Out-of-scope repositories untouched

An agent edits only the repository and the paths its brief names. Consumer applications and other repositories the owner placed out of scope are read-only: a gap found there becomes a finding with its evidence in the findings register (`node ~/.claude/gates-kit/findings-register.mjs add`), never an edit.
@es Un agente edita solo el repositorio y las rutas que su brief nombra. Las aplicaciones consumidoras y los demás repositorios que el dueño dejó fuera de alcance son de solo lectura: una carencia encontrada allí se convierte en un hallazgo con su evidencia en el registro de hallazgos (`node ~/.claude/gates-kit/findings-register.mjs add`), nunca en una edición.

## G5 Unit size and writers

A unit is at most about 130 product lines and a commit is at most 400 changed lines, with at most three concurrent writers on disjoint files. Commit with an explicit pathspec before reporting a unit done; never run a fresh `npm ci` in a shared worktree.
@es Una unidad tiene como máximo unas 130 líneas de producto y un commit como máximo 400 líneas cambiadas, con a lo sumo tres escritores concurrentes sobre ficheros disjuntos. Se commitea con un pathspec explícito antes de dar una unidad por terminada; nunca se corre un `npm ci` nuevo en un worktree compartido.

## G6 Closed items need evidence

A backlog item, an open point or a "closed by mechanism" claim is closed only with evidence: the command, its real exit code, the path or the measurement. A claim without a receipt is a hypothesis and is marked as one. A finding is closed only by a `close` entry in the register that carries its own receipt; an open finding never exempts a gate.
@es Un ítem del backlog, un punto abierto o una afirmación de "cerrado por mecanismo" se cierra solo con evidencia: el comando, su código de salida real, la ruta o la medición. Una afirmación sin recibo es una hipótesis y se marca como tal. Un hallazgo se cierra solo con una entrada `close` en el registro que lleve su propio recibo; un hallazgo abierto nunca exime a un gate.
