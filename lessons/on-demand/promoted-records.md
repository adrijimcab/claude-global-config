# Promoted rules — records (on demand, NOT loaded)

Binding. The harness does NOT load this file; `~/.claude/rules/promoted-rules.md` names it and says when to read it: before a mem_save or mem_update on an existing record, an edit of a backlog document, or promoting a lesson or recording its recurrence. Read it IN FULL then. The full account of each key is in `~/.claude/lessons/evidence/<key>.md`.
@es Vinculante. El harness NO carga este fichero: `~/.claude/rules/promoted-rules.md` lo nombra y dice cuándo leerlo: antes de un mem_save o mem_update sobre un registro existente, de editar un documento de backlog, o de promover una lección o registrar su reincidencia. Leerlo ENTERO entonces.

- **`backlog-rewritten-from-summary-lost-detail`** — CLOSED BY MECHANISM. A memory record is saved by EDITING its previous revision, never by re-summarising it: `mem_save` on an existing `topic_key` is a full upsert that REPLACES the content.
  RULE: a revision is the previous one edited; a finding enters with its measured detail and keeps it until closed with evidence.
  RULE: read the current revision (`mem_get_observation`) and resend it WHOLE plus the addition; to retire an item on purpose, write a line with a closure word (`CLOSED`, `CERRADO`, `SUPERSEDED`, `SUPERSEDIDO`) AND the item's first 6 words verbatim.
  RULE: an existing item is resent byte-identical; new facts go in their own paragraph or bullet; changing an item means a closure line for the old one plus the new one.
  RULE: (1) `mem_save` the old sections VERBATIM into a new record in the same project whose `topic_key` is the target's `topic_key` + `-archive` + a suffix (`backlog/1.0.0-master-archive-1`); (2) read the archive back (`mem_get_observation`) to get its id; (3) resend the target WITHOUT those sections, plus one line `ARCHIVED: #<archive id>` (several ids per line, comma-separated).

- **`promotion-to-contract-read-as-prevention`** — Promoting a lesson into a binding contract is not the same as preventing it, and treating the promotion as the end of the work is how a "closed" lesson keeps firing. **RULE: a promoted rule prevents only the FACES ITS TEXT NAMES, never the lesson in the abstract.** So on every recurrence of an ALREADY-promoted key, do not re-record it — READ the existing contract text, decide whether this incident is a face that text already names, and when it is not, EXTEND the text with the new face in every file that carries it before promoting again.

## Where each master backlog lives, and who commits its document (moved from rules/00-owner-mandates.md, 2026-11-10)

- Donde un registro de engram no cabe (tope de 50.000 bytes), el backlog maestro vive en un DOCUMENTO VERSIONADO y
  engram guarda un puntero con su registro de cambios: en `~/.claude`, `checklists/master-backlog.md` (+
  `host-backlog.md`); en b100-am-ui, desde el 2026-10-11 (decisión del dueño), `.claude/checklists/master-backlog.md`
  del repo de respaldo del tooling, con `backlog/1.0.0-master` (#972) congelado (sin más líneas: llegó al tope; se
  reduce a puntero cuando el guard de contenido acepte el documento como archivo; el registro de cambios es el
  historial git del documento). En los demás proyectos, el registro de engram `backlog/<hito>-master`.
- El documento de un backlog versionado lo edita, lo commitea (pathspec explícito) y lo sube en el mismo turno la
  sesión que orquesta ESE proyecto — el de b100-am-ui su sesión de b100, en su repo de respaldo; el global la sesión de
  `~/.claude`, por `land.mjs` a `master` (decisión del dueño 2026-10-11: «cada proyecto debería subir sus propios
  commits… y los universales… que se commiteen a master»). Un commit del documento es un dato, no código de hooks: no
  pide pausa de coordinación. Sus archivos (`master-backlog-archive/`) están congelados.
