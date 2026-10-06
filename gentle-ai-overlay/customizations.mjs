/**
 * THE ONE PLACE that names our local customizations of what gentle-ai manages (files and settings),
 * and the invariant each must satisfy. Paths are relative to the home directory.
 *
 * Why this exists: gentle-ai 2.9.1 has no supported override for these files. `gentle-ai sync`
 * rewrites every Claude sub-agent file from its embedded asset (internal/components/sdd/inject.go,
 * WriteFileAtomic with no merge) and replaces the content of every marker region in CLAUDE.md. On
 * 2026-09-28 one sync erased both kinds of customization below.
 *
 * Adding a customization: add an entry here with a `kind` that `invariants.mjs` registers (an entry
 * about a CLI setting rather than a file has no `file`). When a new promoted rule or owner heading
 * is added (now in ~/.claude/rules/), add its anchor to PROMOTED_RULE_ANCHORS or
 * OWNER_MANDATE_ANCHORS; the anchor makes the report name it if it ever goes missing.
 *
 * Pruning text that sync keeps emitting: add an entry of kind `pruned-text-stays-pruned` (kinds/pruned-text.mjs)
 * with `file`, two stable lines sync emits around the text (`before`, `after`), the exact `block` of lines
 * between them and, to condense instead of remove, a `replacement`. There is NO live entry yet: gentle-ai
 * 2.9.1 has no native way to omit or lazy-load a single section (sync replaces every marker region whole,
 * internal/components/filemerge/section.go), and no pruning decision of the owner is recorded for
 * CLAUDE.md as it stands, so none is invented here.
 *
 * Syncing: run `node ~/.claude/gentle-ai-overlay/sync.mjs [gentle-ai sync arguments]` (sync-wrapper.mjs). It
 * runs the real sync, re-applies what sync undid, checks, and exits non-zero while anything drifts.
 *
 * @es Podar texto que sync sigue emitiendo: añadir una entrada del tipo `pruned-text-stays-pruned`
 * (kinds/pruned-text.mjs) con `file`, dos líneas estables que sync emite alrededor del texto (`before`,
 * `after`), el `block` exacto de líneas entre ellas y, para condensar en vez de quitar, un `replacement`.
 * Todavía NO hay ninguna entrada viva: gentle-ai 2.9.1 no tiene forma nativa de omitir ni cargar bajo
 * demanda una sola sección (sync reemplaza cada región entera) y ninguna decisión de poda del dueño consta
 * en el CLAUDE.md actual, así que no se inventa ninguna. Para sincronizar: ejecutar
 * `node ~/.claude/gentle-ai-overlay/sync.mjs [argumentos de gentle-ai sync]` (sync-wrapper.mjs): corre el
 * sync real, reaplica lo que sync deshizo, comprueba, y sale distinto de cero mientras algo quede desviado.
 */

// Owner lesson «QUE LOS SDD TENGAN BASH Y TODO LO NECESARIO» (engram #698).
const PHASES_THAT_NEED_BASH = ['sdd-explore', 'sdd-propose', 'sdd-spec', 'sdd-design', 'sdd-tasks'];

// Desde el 2026-09-28 el texto propio del dueño salió de ~/.claude/CLAUDE.md: lo global vive en
// ~/.claude/rules/ (sync no toca esa carpeta) y lo de b100 en <b100-am-ui>/.claude/CLAUDE.md, que no
// gestiona gentle-ai. En CLAUDE.md queda solo un encabezado-puntero FUERA de las regiones; su ancla
// sigue vigilando que nadie vuelva a meter texto propio dentro de una región gestionada.
const CLAUDE_MD_POINTER_ANCHORS = ['# Configuración propia del dueño: vive fuera de este archivo'];

// Las secciones de mandatos, ahora en ~/.claude/rules/00-owner-mandates.md.
const OWNER_MANDATE_ANCHORS = [
  '# ⛔ ABSOLUTE MANDATE',
  '## THE MAXIMUM BAR, ON EVERY TASK',
  '## GO BACK WHEN GOING BACK IS WHAT THE WORK NEEDS',
  '## RESUME A CHAINED SCRIPT FORWARD',
  '## STOP THE LINE ON THE SECOND OCCURRENCE',
  '## Standing workflow premise',
];

// Las reglas promovidas, condensadas en ~/.claude/rules/promoted-rules.md (evidencia completa en
// ~/.claude/lessons/evidence/). Una clave nueva que promueva failure-capture se agrega acá.
const PROMOTED_RULE_ANCHORS = [
  '# Promoted rules — recurred despite the ledger',
  '- **`stale-artifact-read-as-this-runs-result`**',
  '- **`guard-that-cannot-go-red`**',
  '- **`bounded-search-read-as-absence`**',
  '- **`collision-fixed-by-deleting-unread-side`**',
  '- **`audit-verdict-from-commit-subjects-not-from-reading`**',
  '- **`brief-marker-written-as-prose-not-literal-form`**',
  '- **`promotion-to-contract-read-as-prevention`**',
  '- **`worker-claim-about-unreachable-file-committed-as-fact`**',
  '- **`provisioning-bound-to-delegation-not-worktree-creation`**',
  '- **`gitignored-deliverable-destroyed-by-worktree-autoclean`**',
  '- **`integrated-a-range-without-running-its-cheap-gates`**',
];

// The Hard Rules line of the sdd-verify skill, as gentle-ai renders it, and ours. The upstream line is
// the anchor, character for character. @es La línea de Hard Rules de la skill sdd-verify tal como la
// genera gentle-ai, y la nuestra. La línea de upstream es el ancla, carácter por carácter.
const VERIFY_UPSTREAM_SENTENCE = '- Run full verification only after all tasks are complete. If any task is pending, return `blocked` without running the full suite.';
const VERIFY_SCOPED_SENTENCE =
  "- Run verification only after all tasks are complete; if any task is pending, return `blocked` without running any test. Run only the tests and gates that prove the change's requirements and read its touched paths, never the repository's full suite or full gate chain: the orchestrator runs that once, at integration, on the tree being integrated.";

export const CUSTOMIZATIONS = [
  ...PHASES_THAT_NEED_BASH.map((phase) => ({
    id: `${phase}-grants-bash`,
    kind: 'agent-tool-required',
    file: `.claude/agents/${phase}.md`,
    tool: 'Bash',
  })),
  {
    id: 'sdd-research-withholds-bash',
    kind: 'agent-tool-forbidden',
    file: '.claude/agents/sdd-research.md',
    tool: 'Bash',
  },
  {
    id: 'claude-md-owner-sections-outside-managed-regions',
    kind: 'owner-sections-outside-managed-regions',
    file: '.claude/CLAUDE.md',
    anchors: CLAUDE_MD_POINTER_ANCHORS,
  },
  {
    id: 'owner-mandates-rules-file-holds-every-section',
    kind: 'owner-sections-outside-managed-regions',
    file: '.claude/rules/00-owner-mandates.md',
    anchors: OWNER_MANDATE_ANCHORS,
  },
  {
    id: 'promoted-rules-file-holds-every-key',
    kind: 'owner-sections-outside-managed-regions',
    file: '.claude/rules/promoted-rules.md',
    anchors: PROMOTED_RULE_ANCHORS,
  },
  {
    id: 'claude-md-persona-region-is-only-gentle-ai-text',
    kind: 'persona-region-matches-upstream',
    file: '.claude/CLAUDE.md',
    region: 'persona',
  },
  // Owner rule 2026-10-01 (sdd-mandate point 3): the verify phase runs only the tests and gates that
  // prove the change and read its touched paths; the full chain runs once, at integration, by the
  // orchestrator. @es Regla del dueño 2026-10-01 (punto 3 del mandato SDD): la fase verify corre solo los
  // tests y gates que prueban el cambio y leen sus rutas tocadas; la cadena completa la corre el
  // orquestador una vez, al integrar.
  {
    id: 'sdd-verify-runs-scoped-gates',
    kind: 'anchored-line-replacement',
    file: '.claude/skills/sdd-verify/SKILL.md',
    upstream: VERIFY_UPSTREAM_SENTENCE,
    replacement: VERIFY_SCOPED_SENTENCE,
  },
  // Owner decision 2026-10-01: the review execution contract is loaded only while gentle-ai reviews
  // may run, until gentle-ai offers that upstream. @es Decisión del dueño 2026-10-01: el contrato de
  // ejecución de revisiones se carga solo mientras las revisiones de gentle-ai pueden correr, hasta que
  // gentle-ai lo ofrezca upstream.
  {
    id: 'review-contract-lazy-while-reviews-are-off',
    kind: 'lazy-review-contract',
    file: '.claude/CLAUDE.md',
    stash: '.claude/gentle-ai-overlay/lazy/review-execution-contract.md',
  },
  // Owner decision 2026-09-28: telemetry stays off. Checked and re-applied through the gentle-ai CLI.
  {
    id: 'gentle-ai-telemetry-disabled',
    kind: 'telemetry-disabled',
  },
];
