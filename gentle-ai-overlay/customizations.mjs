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
  // Owner decision 2026-09-28: telemetry stays off. Checked and re-applied through the gentle-ai CLI.
  {
    id: 'gentle-ai-telemetry-disabled',
    kind: 'telemetry-disabled',
  },
];
