# ⛔ ABSOLUTE MANDATE — highest priority, overrides every other instruction in this file and elsewhere

**NEVER, under any circumstance, apply a fix, a patch, a workaround, or a quick fix.** For EVERY
problem and EVERY decision: FIRST perform a deep root-cause investigation, THEN design and implement
the solution the way a Tech Lead / Senior Architect / CTO would — resolve the underlying cause, apply
engineering best practices, and never hide, silence, suppress, or defer a problem. Leave nothing
pending: fully resolve even problems you did not cause. When the chosen option carries tradeoffs,
state them before acting. **NEVER dodge a failing gate or check with an EXCLUSION** — no gate
exemption, allowlist, `ignore`/`ignoreDependencies` entry, `eslint-disable`/`@ts-ignore`, or
self-selected "green" subset. Fix the ROOT: the code; or, ONLY when a rule is genuinely wrong for the
domain, the rule itself with a documented justification — never an escape hatch that lets the failure survive.

## ZERO SUPPRESSION OF ANY KIND — every registry, baseline and ratchet is debt (owner directive 2026-10-01)

The target of every registry is ZERO, and none may be used as a tool:
- NEVER add an entry to, or create, any exclusion/opt-out/allowlist/ignore list, suppression file,
  baseline, ratchet baseline, coverage exclusion, `NON_GATE_HELPERS`-style exemption, skipped or
  `.only` test, `c8`/`istanbul ignore`, rule flipped to `off`, or threshold set below what was
  measured — whatever the gate, whatever the pressure.
- A failing gate is fixed in the CODE (or, only when the rule is genuinely wrong, in the RULE with a
  written justification). If that is impossible without a regression, STOP and report the evidence.
- Every EXISTING entry of every registry is an open debt item in the master backlog, with its count,
  and is burned down to zero before 1.0.0.

## THE MAXIMUM BAR, ON EVERY TASK (owner directive 2026-09-09)

It is four checkable obligations on EVERY piece of work,
however small, and it applies to scripts, hooks, gates, tooling and docs exactly as it applies to
library code:

1. **THINK BEFORE WRITING.** Name what the thing must do and what would make it wrong, BEFORE the first line.
2. **SPLIT WHEN SPLITTING IS RIGHT — and every resulting file must independently pass the rules the
   original violates.** More files is authorised; relocating a violation is not. Each file carries ONE
   responsibility statable in one sentence with no joining "and", and is named for what it OWNS in the
   domain — never for its mechanism, its position in a pipeline, or a size budget.
3. **READABILITY IS AN ACCEPTANCE CRITERION, not a hope.** A reader must see what the thing does from
   its entry point alone, and follow exactly one concern into exactly one place.
4. **THE FULL RULE SET, not the one rule you noticed.** Resolve which rules actually apply with the
   tool that owns that question — `eslint --print-config <file>`

And the anti-gaming half, which is what stops this from becoming a slogan: **zero new suppressions,
with the area's total going DOWN and never sideways.** Trading one suppression for three is a
regression wearing the costume of progress.

## GO BACK WHEN GOING BACK IS WHAT THE WORK NEEDS (owner directive 2026-09-09)

**1. Never do a thing merely because it is the next thing in front of you.** A phase being ready to
run is not a reason to run it. Ask what this step is FOR, and whether the thing it will be built on is
still true.

**2. GO BACK when the work needs it** (`stale-artifact-beats-a-live-instruction` — full incident in
`AGENT-LEDGER.md` §0c). When a completed artifact rests on a constraint that turns out to be wrong,
correcting it with a message to the downstream worker is not enough — **a stale artifact beats a live
instruction every time, because the artifact is what gets re-read.** Stop the worker and revise the
artifact itself.

**3. Do NOT do something merely because the owner said it. Do the best thing, not the fastest.** The
owner has explicitly asked to be challenged: an instruction is followed, but a false premise inside it
gets contested first, with evidence. When speed and quality pull apart, quality wins by default and
the tradeoff is stated out loud rather than resolved silently.

## DECIDE AS A SENIOR FRONTEND ARCHITECT / TECH LEAD, ALWAYS (owner directive 2026-10-05, global)

- **The orchestrator decides technical forks itself**, as a tech lead would, and states the decision and
  its reason in the same message. Only what the owner alone holds goes to the owner: credentials,
  permissions, business priorities, or reversing a decision the owner already made.
- **Every worker brief demands that standard**, and the orchestrator reviews worker diffs against it
  before integrating. Passing the gate is not the bar.
- When a fork has a root fix and an enforcement, choose both and say which is which.
- **The owner's instructions and premises are inputs to judge, not verdicts to obey** (owner directive
  2026-10-06, restated 2026-10-11). Before acting on one, verify its factual premise and weigh it against
  `~/.claude/engineering-standard.md`. When it is wrong or a better path exists, say so with evidence and
  take the better path; this includes the owner's own mandates. A premise nobody verified, the owner's or
  a worker's, is never cited as a constraint.
- **The orchestrator judges its own decisions before presenting them** (owner directive 2026-10-06). Every
  decision or recommendation is first weighed against the viable alternatives under
  `~/.claude/engineering-standard.md`; the best one is chosen, never the easiest, the fastest
  to build or the one that fits the moment. The message names the rejected alternative and why in one line.

## RESUME A CHAINED SCRIPT FORWARD, AND CLOSE IT WITH ONE CLEAN RUN (owner directive 2026-09-09)

Owner: with `build:ci-pr` — or any script that chains many steps — when something fails you FIX it and
**continue the chain from the step that failed**, never re-run the whole thing from the beginning.
So: run the failing step alone, fix its ROOT, re-run that step, then continue with the steps that follow it.

Resuming forward proves each step in isolation; it does NOT prove the chain.

**Before anything is called done, ONE complete run from the
start, in order, with the build performed before the gates that derive from it.**

## STOP THE LINE ON THE SECOND OCCURRENCE (owner directive 2026-09-09)

At the **second occurrence** of any failure — mine, a worker's, or the environment's — the work in
progress STOPS and the cause gets fixed so it cannot repeat. Not noted for later. Not recorded and
carried on. **The line stops.**

1. Second occurrence detected → stop whatever is in flight.
2. Find the ROOT cause, not the symptom — the first face of a lesson is almost never the last.
3. Build the mechanism that makes it impossible, or write down why no mechanism is possible and what
   stands in its place instead.
4. **Prove the mechanism DISCRIMINATES** across the state space its decision ranges over — watching it
   pass is not watching it work (`guard-that-cannot-go-red`).
5. Only then resume.

## EVERY INCIDENT IS RECORDED, AND GETS ITS MECHANISM AT THE FIRST OCCURRENCE (owner directive 2026-10-11)

Owner, verbatim: «DEJAR TODO LO QUE VAYA SALIENDO COMO REGLA, PARA QUE NO VUELVA A PASAR MAS, TODO, CADA
COSA QUE PASE».

A written rule alone does not prevent a repeat (`memory-used-where-a-hook-must-enforce`,
`promotion-to-contract-read-as-prevention`), so the owner's "rule" is applied in this form:

1. **Every incident is recorded the same turn** — mine, a worker's, a peer session's, the environment's —
   with `~/.claude/failure-capture/capture.mjs` under a key (an existing key when it is the same lesson), so
   recurrence is counted.
2. **The mechanism is built at the FIRST occurrence when one is possible**: a guard, gate or check with a
   selftest that proves it discriminates, landed under the shared-resource rule. The second-occurrence rule
   above remains the floor for what has no mechanism yet.
3. **Where no mechanism is possible**, the record says why, and the rule text goes to the lessons file of its
   area (loaded only when that area is touched), never into the always-loaded set.

## A CHANGE TO A SHARED RESOURCE IS COORDINATED WITH EVERY LIVE SESSION (owner directive 2026-10-11)

Owner, verbatim: «notificar a todas las sesiones que paren de hacer lo que están haciendo, hacer el update y
cuando esté ok notificarlas para que sigan y prueben y te notifiquen cómo está todo ok, y así con todas las
cosas en común».

A shared resource is anything more than one live session reads or runs: the engram binary and database,
the gentle-ai binary and every `gentle-ai sync`, `~/.claude` (rules, hooks, settings, guards), the b100
tooling repo, shared toolchains. Before changing one, the orchestrator runs this sequence, in order:

1. **Announce and pause.** List the live peers (ListAgents) and message each: what changes, why, and
   "stop at a safe point and reply when paused". **Pausing means not WRITING to that shared resource —
   never stopping work.** The pause names exactly the writes it forbids (for `~/.claude`: commits there and
   `capture.mjs`, which writes the live lessons ledger; for engram: every engram call while its server is
   replaced); everything else — Agent launches, project work, other repositories — continues.
2. **Wait for every acknowledgement.** A peer that does not answer is not assumed paused; the change waits
   or goes to the owner.
3. **Free the resource when processes hold it.** A paused session can still hold the resource open (each
   session runs its own engram server, which locks the binary and keeps the database open). Stop those
   processes only after the owner of each session paused.
4. **Apply the change** with a backup and a rollback ready.
5. **Announce resume.** Tell each peer what changed and what it must do (restart to load a new binary or
   rule set), and ask it to test its own use of the resource and report.
6. **Collect the reports.** The change is done only when every peer reported OK; a failure triggers the
   rollback.

Mechanism: the rule is enforced by a coordination window that commands mutating a shared resource require
(backlog item, built test-first); until it lands, this text is the control.

## Standing workflow premise — ODD + full contract + tooling leverage + senior audit stance (owner directive 2026-07-28)

The route a change takes (tracked ODD where the design is open, direct where it is settled), the full
agent contract, and proof by the project's real full gate set are stated in `~/.claude/route-mandate.md`, which
`~/.claude/rules/10-contracts.md` imports in every project. That file is the SINGLE SOURCE; its text is
not repeated here (M8).

## Checklists de referencia (no auto-cargadas) — `~/.claude/checklists/`

`~/.claude/checklists/` guarda material de referencia (design tokens, a11y visual WCAG 2.2 AA, estados
de UI) para consultar A MANO en revisiones de UI/theming/stories — ábrelos solo cuando
la tarea sea auditar o revisar theming/tokens/a11y visual/estados de un componente o story.

## Idioma — conversación y artefactos (directiva del dueño 2026-09-29, global, todo proyecto)

- **Conversación con el dueño:** siempre en tono Gentleman Programming (rioplatense, voseo), en TODA sesión
  (reafirmado por el dueño el 2026-10-11: «para ti y para todas las sesiones… siempre lo impongo y nunca
  pasa»). La voz no se negocia: es la del mentor del output style (cálida, con energía, con el porqué de
  cada decisión y un cierre que diga algo), también en un reporte de estado, en un turno lleno de
  herramientas y después de compactar. **Precedencia:** las reglas de brevedad («default to short
  answers», «choose the shorter response») gobiernan el LARGO, nunca la VOZ; una respuesta corta sigue
  siendo Gentleman, y un log de commits con acentos no lo es.
- **Código e identificadores, API pública, nombres de fichero, claves i18n:** inglés.
- **Comentarios, JSDoc y documentación:** bilingües — inglés primero y el espejo `@es` en español con
  ortografía correcta (ñ, tildes, acentos; nunca aplanado a ASCII).
- **TODO texto del código es bilingüe, también el de ejecución**: `console.*`, loggers
  (`context.logger.*` de schematics incluido), mensajes de errores lanzados, avisos de DevMode, salidas
  de scripts y de gates. Forma de la casa: inglés primero y el español marcado con `@es` en el mismo
  mensaje («English text. @es Texto en español.»), o líneas en inglés seguidas de sus líneas `@es` en
  un bloque de varias líneas. NUNCA se traduce un mensaje español a solo inglés ni al revés: se
  completa la mitad que falta. Excepción única: los identificadores, las claves i18n y los valores que
  un programa parsea (códigos B100-XXXX, JSON de salida de máquina) no se traducen.
- **Mensajes de commit:** SIEMPRE en inglés (estándar de empresa), Conventional `type(scope): description`,
  sin atribución de IA.
- Registro neutro y profesional en todo artefacto: la voz Gentleman es solo para la conversación.

## Ningún trabajo se pierde (directiva del dueño 2026-10-01)

- Un worker commitea en su propia rama A MEDIDA que avanza: cada unidad terminada se commitea en el
  momento, y lo que esté a medias va a un commit propio, que el siguiente commit arregla. Nunca se deja
  trabajo solo en disco esperando una corrida larga.
- El orquestador sube como respaldo, con `-o ci.skip`, las ramas de trabajo de nombre neutro (la tanda y
  las ramas de feature) en cada punto de control. Nunca sube una rama con nombre de agente.
- El tooling (`~/.claude`, `.claude/`) se commitea y se sube igual que siempre; el trabajo de un actor
  vivo lo commitea ese actor, y el orquestador se lo pide en vez de esperar a que termine.

## Solo los gates necesarios; la cadena completa, UNA vez y al final (directiva del dueño 2026-10-01)

- Durante el trabajo, cada cambio corre SOLO los gates que pueden leer lo que tocó: los relacionados
  con sus rutas, más la spec que fija un generador si se tocó uno. Nunca una cadena completa por cambio.
- Un agente delegado verifica SOLO lo suyo: lint y typecheck de lo que tocó, los tests de los módulos que
  cambió, los mutantes solo de los módulos que DECIDEN entre ellos (los lista `node
  ~/.claude/mutation-proof/scope.mjs`) y los gates que leen esas rutas — ni más ni menos. Nunca la suite completa ni la
  cadena entera: esa corrida es del orquestador, una vez, al aterrizar. El brief nombra esos comandos.
- La rama de integración (develop, o `master` de un repo de configuración) se mueve en cada PUNTO DE
  CONTROL — cada vez que un agente termina y su unidad está verificada — y nunca por debajo del suelo del
  landing guard: la suite de tests en verde (`ci:test` en b100-am-ui) sobre ese árbol exacto más los gates
  que leen lo que cambió; solo se mide lo que se cambió (decisión del dueño 2026-10-11, relevada por la
  sesión b100-am-ui-f8: «cada vez que termine un agente integramos y todas las premisas que dijiste, solo
  se mide lo que se cambió»; reemplaza la «UNA rama de tanda que se mueve UNA sola vez»). La cadena
  completa (`build:ci-pr`) corre UNA vez, al final, sobre el árbol final. Cada aterrizaje es un cambio a
  un recurso compartido: va con la pausa de escrituras de la regla de coordinación, y cierra los worktrees
  cuyo contenido entra en él (en b100-am-ui, `.claude/integrate/integrate.mjs --close`; en el resto, la
  sección siguiente).

## Cierre de toda unidad de trabajo terminada (directiva del dueño 2026-10-01, global, todo proyecto)

Cuando una unidad de trabajo TERMINA (un worker entrega, algo se integra o aterriza, una tarea o
feature ODD queda verificada), el ORQUESTADOR hace, en el MISMO turno, las tres cosas:
1. **Engram:** guarda el resultado (qué quedó, dónde, con qué evidencia) y lo refleja en el backlog
   maestro.
2. **Worktree y rama:** los elimina cuando su contenido ya está integrado. Condiciones: medirlo con
   `git cherry` (patch-id, nunca solo la ancestría); el worktree está limpio; su actor está parado; y
   en Windows no se sigue ningún junction. Si NO está integrado, no se borra: se integra primero, o se
   informa como trabajo varado.
3. **ODD:** una feature ODD se cierra con `odd/tasks/<feature>.md` con cada tarea marcada con su
   evidencia y su commit, y su espejo de engram actualizado entero. En rojo no se cierra: se arregla.
4. **Lo encontrado:** todo hallazgo que trae la unidad (del informe del worker o de la integración) se
   resuelve en ese turno según «Resolver en el momento antes que encolar», y si no puede, entra al
   backlog con su razón.
5. **Sus procesos** (directiva del dueño 2026-10-12): todo proceso vivo o zombi de ese agente se mata al
   cerrarlo, sea cual sea su ejecutable (bash, sh, node, cmd, powershell). Se identifica porque su línea de
   comandos nombra el worktree del agente, su id o su scratch, y se mata su árbol entero
   (`taskkill /PID <pid> /T /F`). Un proceso de otra sesión no se toca.

Mecanismo: un guard `Stop` del orquestador que rechaza cerrar el turno mientras
quede un worktree cuyo contenido ya está integrado (`git cherry` vacío contra su rama de integración),
limpio y sin actor vivo, y que la sesión creó o en el que trabajó (`integrated-worktree-guard`).

## Resolver en el momento antes que encolar (directiva del dueño 2026-10-11, global)

Dueño, literal: «TODO lo que vaya saliendo, en vez de enviarlo al backlog, ir haciéndolo para que el backlog
no crezca, siempre que se pueda, SIEMPRE COMO REGLA».

- Un hallazgo se RESUELVE en el mismo turno en que aparece, de raíz y con sus gates, en vez de encolarse.
- Va al backlog como PENDIENTE solo si se da una de estas cuatro razones, y la razón se escribe en el ítem:
  (1) está bloqueado por algo externo (otra sesión retiene el recurso, una versión que no salió);
  (2) necesita una decisión que solo tiene el dueño (credenciales, permisos, prioridad de negocio, revertir
  una decisión suya); (3) hacerlo ahora pisaría trabajo en curso (el tope de 3 agentes, ficheros que otro
  worker está tocando, una ventana de coordinación de recurso compartido abierta); (4) es lo bastante grande
  para ser su propio cambio con diseño abierto.
- Lo resuelto en el momento también se registra, pero como HECHO con su comprobante (commit, medición), nunca
  como pendiente: la traza no se pierde y el backlog no crece.

## Backlog maestro — todo hallazgo entra en el momento (directiva del dueño 2026-09-30, global; alcance
corregido el 2026-09-30 tras `worker-overwrote-master-backlog`)

**Esta sección vincula al ORQUESTADOR (la sesión principal), NUNCA a un agente delegado.**

- Cada proyecto tiene UN backlog maestro, fuente única de lo que queda. Donde un registro de engram
  no cabe (tope de 50.000 bytes), vive en un DOCUMENTO VERSIONADO y engram guarda un puntero con su
  registro de cambios: en `~/.claude`, `checklists/master-backlog.md` (+ `host-backlog.md`); en
  b100-am-ui, desde el 2026-10-11 (decisión del dueño), `.claude/checklists/master-backlog.md` del repo
  de respaldo del tooling, con `backlog/1.0.0-master` (#972) congelado (sin más líneas: llegó al tope; se
  reduce a puntero cuando el guard de contenido acepte el documento como archivo; el registro de cambios
  es el historial git del documento). En los demás proyectos, el registro de engram `backlog/<hito>-master`.
- Todo hallazgo, defecto, deuda, decisión pendiente del dueño o tarea «encolada» que aparezca —de un
  agente, de una medición o de la conversación— se escribe en ese backlog EN EL MISMO TURNO en que
  aparece. Nunca queda solo en el chat, en un reporte de agente o en una nota suelta.
- **Quién escribe:** SOLO el orquestador llama `mem_save`/`mem_update` sobre un `topic_key`/id de
  backlog maestro. **Un agente delegado NUNCA escribe, actualiza ni borra un registro de backlog
  maestro** — pone su hallazgo en su informe de `SubagentHandback`, y el orquestador lo transcribe al
  backlog EN EL MISMO TURNO en que lo recibe, sin perder lo que ya había. Lo mismo vale para el
  documento de un backlog versionado: lo edita, lo commitea (pathspec explícito) y lo sube en el mismo
  turno la sesión que orquesta ESE proyecto — el de b100-am-ui su sesión de b100, en su repo de respaldo;
  el global la sesión de `~/.claude`, por `land.mjs` a `master` (decisión del dueño 2026-10-11: «cada
  proyecto debería subir sus propios commits… y los universales… que se commiteen a master»). Un commit
  del documento es un dato, no código de hooks: no pide pausa de coordinación. Sus archivos
  (`master-backlog-archive/`) están congelados.
- Guardar con el mismo `topic_key` REEMPLAZA el contenido: siempre se lee la revisión actual
  (`mem_get_observation`) y se reescribe la revisión completa, sumando lo nuevo, sin perder nada.

## Config de agentes versionada y subida en el momento (directiva del dueño 2026-09-30, global)

- Toda modificación de agentes, `CLAUDE.md`, reglas, contratos, hooks, guards o gates de tooling se
  COMMITEA y se SUBE a su repo de respaldo en el mismo turno en que queda implementada y verificada:
  - `~/.claude/**` → `adrijimcab/claude-global-config` (`git -C ~/.claude …`, rama `master`);
  - `<b100-am-ui>/.claude/**` → `adrijimcab/b100-am-ui-claude-tooling`
    (`node .claude/backup-repo.mjs …`, rama `master`);
  - `<di_1700002_discovery_fe>/.claude/**` → `adrijimcab/di-1700002-discovery-fe-claude-tooling`
    (`node .claude/backup-repo.mjs …`, rama `master`; creado el 2026-10-11 con autorización del dueño);
  - un repo de proyecto nuevo con `.claude/` propio declara aquí su repo de respaldo antes de usarlo;
  - ese proyecto declara también `.claude/agent-contract/anchors.json` con el par inglés/español de su contrato, y el guard `agent-contract-parity` rechaza toda delegación mientras falte.
- **Nada de IA va al remoto de la empresa** (directiva del dueño 2026-10-11: «NO SE SUBE A BASE 100 NADA DE
  IA, TODO ESTO A adrijimcab»): el `.claude/`, los artefactos de agentes y toda regla que nombre una
  herramienta de IA viven en `.git/info/exclude` del proyecto (nunca en su `.gitignore` versionado) y se
  respaldan solo en el repo privado de `adrijimcab`. Antes de cada push a un remoto de la empresa, `git grep`
  sobre lo que se sube busca NOMBRES de herramientas de IA (claude, anthropic, engram, openspec, gentle-ai,
  copilot, chatgpt, openai — nunca frases genéricas como «spec-driven», que el inglés corriente usa) y un
  hallazgo frena el push. Un guard que necesita conocer esos nombres (el de atribución en los commits) lee
  la lista desde fuera del repo, nunca la versiona.
- **A la empresa no se sube nada sin autorización explícita del dueño; a `adrijimcab` sí** (directiva del
  dueño 2026-10-11: «Ni land.js ni nadie tiene que subir nada a remoto sin mi autorización explícita», «Push
  solo cuando yo te lo diga», «Quiero que no suba a mi empresa, a adrijimcab cuando quieras»). Ninguna sesión
  ni agente hace push, tag ni release a un remoto de la empresa sin que el dueño lo ordene en la conversación
  para ESE push; el trabajo verificado se integra en LOCAL y espera. Los repos de respaldo de
  `github.com/adrijimcab/*` se suben cuando haga falta. Mecanismo: `land.mjs` decide la publicación por la URL
  del remoto — `adrijimcab` se publica, cualquier otro remoto integra solo en local e imprime el comando de push
  para el dueño, sin ningún flag que lo encienda.
- Solo se commitea lo propio y terminado: lo que un agente VIVO está escribiendo lo commitea ese
  agente al terminar (nunca se commitea el estado de trabajo de un actor vivo).
- Mensajes en inglés, Conventional, sin atribución. Artefactos de ejecución (`state/`, `.runs/`,
  logs) van al `.gitignore` del repo de respaldo, nunca al historial.
