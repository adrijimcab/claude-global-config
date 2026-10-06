# Rolling a Gate Out Through `~/.claude/fleet-kit/`

This kit names WHAT to gate; `~/.claude/fleet-kit/` (see its own `DESIGN.md`) is the portable mechanism
that makes a gate's result something an agent cannot quietly ignore. The two are independent — a
project can adopt this kit's gates without fleet-kit — but where fleet-kit is wired into a repository
(a `.claude/fleet-kit.json` + `.claude/settings.local.json` pair, both local and git-excluded), it is
the enforcement layer for the no-hidden-failures rule.

@es Este kit dice QUÉ gatear; `~/.claude/fleet-kit/` es el mecanismo portable que hace que el resultado
de un gate no pueda ignorarse en silencio. Son independientes — un proyecto puede adoptar los gates de
este kit sin fleet-kit — pero donde fleet-kit está conectado a un repositorio, es la capa de
cumplimiento de la regla de no esconder fallos.

## What each fleet-kit mechanism enforces about a new gate

- **`gate-run`** — records a unit-suite/gate verdict only against a CLEAN tree (`HEAD^{tree}`, no
  porcelain entries). A gate's "it passed" can never be claimed against a dirty working copy, so a new
  gate's zero-offenders claim is tied to an actual commit, not a workspace someone is mid-edit on.
- **`ungated-landing-guard`** — refuses moving an integration branch (`develop`/`main`) to a tree with
  no green verdict from the configured unit suite. A new gate wired into that suite therefore cannot be
  bypassed by landing anyway; the floor is per-repository configuration
  (`landingGuard.mode: "enforce"` vs `"advise"`), never a hardcoded assumption.
- **`diff-coverage`** — grades ONLY the lines a change actually touches, against real coverage output
  (lcov for Karma/Jest/Vitest). This is the mechanism behind "100% of what you add" in
  `AGENT-CONTRACT.md`: it is measured per-diff, not against the repository's historical total, so a new
  gate's coverage requirement never becomes "raise the global threshold" (a forbidden move — thresholds
  are a floor, never adjusted per-change).
- **`handback`** — refuses a worker's completion claim (`SubagentHandback`) while uncommitted work
  remains, and — where coverage is configured — while the diff it is handing back has uncovered changed
  lines. This is what makes "commit before you claim done" and "100% coverage of what you add"
  mechanically true rather than aspirational.
- **`orphan-work-guard`** — flags work that exists (porcelain entries, or commits `git cherry` cannot
  find on the integration branch) but was never surfaced — the same "a failure hidden by never being
  reported" class the no-hidden-failures rule targets, at the level of an agent's own deliverable rather
  than a lint finding.

@es **`gate-run`** solo registra un veredicto contra un árbol LIMPIO. **`ungated-landing-guard`**
rechaza mover la rama de integración a un árbol sin veredicto verde de la suite configurada.
**`diff-coverage`** califica solo las líneas que un cambio realmente toca — el mecanismo detrás del
"100% de lo que agregás" del `AGENT-CONTRACT.md`, medido por diff, nunca contra el total histórico del
repo (así nunca se convierte en "subir el umbral global", un movimiento prohibido). **`handback`**
rechaza una entrega mientras quede trabajo sin commitear o líneas cambiadas sin cubrir. **`orphan-work-
guard`** marca trabajo que existe pero nunca se reportó — la misma clase de "fallo escondido" que la
regla de no esconder fallos apunta, a nivel del propio entregable de un agente.

## The findings register

A gap a gate or a review finds that cannot be fixed in the same unit (a repository the owner placed out of
scope, a hypothesis not yet measured) is never routed around: it is recorded in the repository's findings
register, `.claude/FINDINGS.jsonl`, which every `templates/<stack>/AGENT-CONTRACT.md` names. `node
~/.claude/gates-kit/findings-register.mjs list` prints the open findings; `add` records one with its receipt
(the command and its real exit code, a path, or a measurement; a claim with none is recorded as a
`hypothesis`); `close` closes it with its own receipt. The register is a record and never an exception: no
gate and no fleet-kit mechanism reads it to pass, and its closed schema has no key that could say "ignore". A
delegated worker puts the finding in its handback as well, and the orchestrator carries it to the master
backlog (`rules/00-owner-mandates.md`).

@es Una carencia que un gate o una revisión encuentra y que no se puede arreglar en la misma unidad (un
repositorio que el dueño dejó fuera de alcance, una hipótesis aún sin medir) nunca se rodea: se anota en el
registro de hallazgos del repositorio, `.claude/FINDINGS.jsonl`, que nombra cada
`templates/<stack>/AGENT-CONTRACT.md`. `list` imprime los hallazgos abiertos; `add` anota uno con su recibo
(el comando y su código de salida real, una ruta o una medición; una afirmación sin ninguno se anota como
`hypothesis`); `close` lo cierra con su propio recibo. El registro es un registro y nunca una excepción:
ningún gate ni mecanismo de fleet-kit lo lee para pasar, y su esquema cerrado no tiene ninguna clave que pueda
decir "ignorar". Un worker delegado pone además el hallazgo en su handback, y el orquestador lo lleva al
backlog maestro.

## What this means for a NEW gate from this kit specifically

1. Add the gate's config to the project (its own tree, never referencing this kit's files at runtime).
2. Run it once, read the findings. Fix them at the root. This is the step that cannot be skipped or
   delegated to a registry (see the README's no-hidden-failures section).
3. Wire it into the project's own CI/lint/test command so it runs on every change going forward.
4. If the repository has fleet-kit configured, its `unitSuite`/`coverage`/`landingGuard` sections
   already enforce steps 2-3 stayed true for anything landing on the integration branch — a gate that
   is part of `npm run lint`/`npm test` is automatically covered; a gate that is a SEPARATE script
   (Semgrep, ZAP, Trivy — anything not part of the unit-suite/lint command) is NOT automatically
   covered by fleet-kit today and needs its own CI wiring (a GitLab CI job, a separate `npm run` script
   run in the pipeline) until fleet-kit grows a section for it.
5. Where a repository's fleet-kit config disables a section with a reason (e.g. the legacy `discovery-
   api`'s `unitSuite`/`coverage`/`landingGuard` are disabled because no test runner exists there), that
   reason is itself the record of what a change there must prove instead — see that repository's own
   `AGENT-CONTRACT.md`.

@es 1) Añadir la config del gate al proyecto. 2) Correrlo una vez, leer los hallazgos, arreglarlos en
la raíz — este paso no se puede saltar ni delegar a un registro. 3) Conectarlo al comando de CI/lint/
test propio del proyecto. 4) Si el repo tiene fleet-kit configurado, sus secciones ya cubren que los
pasos 2-3 se mantengan ciertos para lo que aterrice en la rama de integración — un gate que es parte de
`npm run lint`/`npm test` queda cubierto automáticamente; un gate que es un script APARTE (Semgrep,
ZAP, Trivy) hoy NO está cubierto automáticamente por fleet-kit y necesita su propio cableado de CI. 5)
Donde la config de fleet-kit de un repo desactiva una sección con un motivo (p. ej. el `unitSuite` del
`discovery-api` legado, sin runner de tests), ese motivo es el registro de qué debe probar un cambio en
su lugar — ver el `AGENT-CONTRACT.md` de ese repositorio.
