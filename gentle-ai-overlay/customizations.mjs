/**
 * THE ONE PLACE that names our local customizations of what gentle-ai manages (files and settings),
 * and the invariant each must satisfy. Paths are relative to the home directory.
 *
 * Why this exists: gentle-ai (2.9.1, and v4.0.0 as re-measured on 2026-10-11) has no supported override for these files. `gentle-ai sync`
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
 * Loading text only when it is needed: add a section to LAZY_SECTIONS below (kind `lazy-section`,
 * lazy-section.mjs): the span between two whole lines of CLAUDE.md moves to a stash file under
 * gentle-ai-overlay/lazy/ and a pointer saying exactly when to read it takes its place. The check proves the
 * stash is byte-identical to what gentle-ai rendered (a SHA-256 in the sentinel), and sync can only undo it.
 *
 * Syncing: run `node ~/.claude/gentle-ai-overlay/sync.mjs [gentle-ai sync arguments]` (sync-wrapper.mjs). It
 * runs the real sync, re-applies what sync undid, checks, and exits non-zero while anything drifts. A RAW
 * `gentle-ai sync` is healed by the PostToolUse and SessionStart hooks, which re-apply every sync-safe
 * customization (post-command-hook.mjs, reapply-hook-output.mjs).
 *
 * @es Cargar texto solo cuando hace falta: añadir una sección a LAZY_SECTIONS más abajo (tipo `lazy-section`,
 * lazy-section.mjs): el tramo entre dos líneas enteras de CLAUDE.md pasa a un fichero de depósito bajo
 * gentle-ai-overlay/lazy/ y un puntero que dice exactamente cuándo leerlo ocupa su lugar. El check prueba que
 * el depósito es idéntico byte a byte a lo que generó gentle-ai (un SHA-256 en el centinela), y sync solo
 * puede deshacerlo. Un `gentle-ai sync` CRUDO lo reparan los hooks PostToolUse y SessionStart, que reaplican
 * toda personalización segura ante sync.
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

// The promoted rules whose text is path-scoped, in the rules file of their area (failure-capture/ledger-routes.mjs:
// the harness loads them only when a file matching the area's `paths:` is read). They were moved out of
// promoted-rules.md by `capture.mjs route --key <key> --to <area> --write`; their anchors move with them, so the
// report still names a rule if it ever goes missing. @es Las reglas promovidas cuyo texto tiene alcance de ruta,
// en el fichero de reglas de su área: el harness las carga solo cuando se lee un fichero que coincide con los
// `paths:` del área. Las movió `capture.mjs route --key <clave> --to <área> --write`; sus anclas van con ellas.
const PROMOTED_AREA_RULE_ANCHORS = {
  guards: ['- **`guard-that-cannot-go-red`**'],
  'run-artifacts': ['- **`stale-artifact-read-as-this-runs-result`**'],
};

// Sections of CLAUDE.md that are loaded only when needed. Each one is a span of the orchestrator region
// that gentle-ai renders whole (`start` up to, not including, `end`; both whole lines, anchors that are
// headings gentle-ai itself uses) and that this machine reads only in a situation, which the pointer names.
// `regions`: the orchestrator region is `sdd-orchestrator` in gentle-ai v2/v3 and `orchestrator` in v4 (internal/
// components/agentguidance/orchestrator.go: OrchestratorSectionID, legacyOrchestratorSectionID).
// The pointers are English only: they are instructions to the model, not user-facing text, and every
// character of them is paid in every session.
// @es Secciones de CLAUDE.md que se cargan solo cuando hacen falta. Cada una es un tramo de la región
// orquestadora que gentle-ai genera entero (`start` hasta, sin incluir, `end`; ambas líneas enteras, anclajes
// que son encabezados que gentle-ai mismo usa) y que esta máquina lee solo ante una situación, que el puntero
// nombra. `regions`: la región orquestadora es `sdd-orchestrator` en gentle-ai v2/v3 y `orchestrator` en v4.
// Los punteros van solo en inglés: son instrucciones para el modelo, no texto para el usuario, y cada
// carácter suyo se paga en cada sesión.
const ORCHESTRATOR_REGIONS = ['sdd-orchestrator', 'orchestrator'];
const LAZY_DIR = '.claude/gentle-ai-overlay/lazy';

const LAZY_SECTIONS = [
  {
    name: 'blocking-prompts',
    label: 'blocking-prompt contracts',
    start: '### Lossless Blocking Prompts (MANDATORY)',
    end: '### Language Domain Contract',
    regions: ORCHESTRATOR_REGIONS,
    stash: `${LAZY_DIR}/blocking-prompt-contracts.md`,
    pointer: {
      en: 'The blocking-prompt contracts (lossless relay of a prompt, menu or choice envelope meant for the user; the Gentle AI provider-defect handoff) are not loaded here; their exact text is in `{stash}`. READ THAT FILE IN FULL, and follow it as if it were written here, as soon as a sub-agent or tool returns a blocking prompt, menu or choice envelope, or a `gentle-ai` invocation exits non-zero or refuses.',
    },
  },
  {
    name: 'delegated-verification',
    label: 'verification contracts',
    start: '#### Delegated Verification Gate (MANDATORY)',
    end: '#### Review Execution Contract',
    regions: ORCHESTRATOR_REGIONS,
    stash: `${LAZY_DIR}/delegated-verification-contracts.md`,
    pointer: {
      en: 'The verification contracts (Delegated Verification Gate, Native Checking Contract) are not loaded here; their exact text is in `{stash}`. READ THAT FILE IN FULL, and follow it as if it were written here, when a delegated writer returns work, and before deciding what verification or checking a finished change needs.',
    },
  },
  // Owner decision 2026-10-01: the review execution contract is loaded only while gentle-ai reviews may
  // run, until gentle-ai offers that upstream. Its first pointer was bilingual; it is English only now, like
  // the others, and a CLAUDE.md already moved is repointed by the next apply. @es Decisión del dueño
  // 2026-10-01: el contrato de ejecución de revisiones se carga solo mientras las revisiones de gentle-ai
  // pueden correr, hasta que gentle-ai lo ofrezca upstream. Su primer puntero era bilingüe; ahora es solo en
  // inglés, como los demás, y un CLAUDE.md ya movido se re-apunta con el siguiente apply.
  {
    name: 'review-contract',
    label: 'review contract',
    start: '#### Review Execution Contract',
    end: '#### Cost and Context Balance',
    regions: ORCHESTRATOR_REGIONS,
    witness: '# Native Compact Review Orchestration',
    loadedWhile: 'reviews-may-run',
    stash: `${LAZY_DIR}/review-execution-contract.md`,
    pointer: {
      en: 'Receipt-driven development is off globally, so this contract is not loaded here; its exact text is in `{stash}`. READ THAT FILE IN FULL, and follow it as if it were written here, before any `gentle-ai review` command other than `gentle-ai review mode status`, before relaying a `gentle-ai.review-integration.consent/v3` envelope, and as soon as `gentle-ai review mode status` reports `effective: on`.',
    },
  },
  // gentle-ai v4 (ODD) only: the spans below exist in the `orchestrator` and `agent-routing` regions that v4
  // renders, so `regions` names the v4 ids alone and a v2/v3 render never matches them. Measured 2026-10-11 on
  // a v4.0.0 render in an emulated home: they hold 22,177 of the 39,821 characters that stayed loaded after
  // the sections above moved. @es Solo gentle-ai v4 (ODD): estos tramos existen en las regiones
  // `orchestrator` y `agent-routing` que genera v4, así que `regions` nombra solo los ids de v4 y un render
  // v2/v3 nunca coincide. Medido el 2026-10-11 sobre un render de v4.0.0 en un home emulado.
  {
    name: 'delegation-restatement',
    label: 'orchestrator delegation rules',
    start: '### Delegation Rules',
    end: '#### Delegated Verification Gate (MANDATORY)',
    regions: ['orchestrator'],
    stash: `${LAZY_DIR}/orchestrator-delegation-rules.md`,
    pointer: {
      en: 'The orchestrator Delegation Rules table and its own list of delegation triggers are not loaded here: `### Mandatory Delegation Triggers` under `## Implementation Routing`, always loaded, binds the same triggers. Their exact text is in `{stash}`. READ THAT FILE IN FULL when that section does not settle whether a piece of work stays inline or goes to a delegated worker.',
    },
  },
  {
    name: 'routing-ladder',
    label: 'routing ladder and delegation hand-off rules',
    start: '#### Cost and Context Balance',
    end: '### Delivery strategy',
    regions: ['orchestrator'],
    stash: `${LAZY_DIR}/routing-ladder-and-hand-off.md`,
    pointer: {
      en: 'Cost and Context Balance, the Work Routing Ladder, the Canonical Lightweight Workflows, the Allowed edit surfaces contract (MANDATORY for every writer) and the Key Learnings closing block are not loaded here; their exact text is in `{stash}`. READ THAT FILE IN FULL before launching any delegated worker (explorer, writer or verifier), and before recovering from a tooling or worktree incident.',
    },
  },
  {
    name: 'skill-discovery',
    label: 'intent-driven skill discovery',
    start: '### Intent-Driven Skill Discovery',
    end: '### Safety',
    regions: ['orchestrator'],
    stash: `${LAZY_DIR}/intent-driven-skill-discovery.md`,
    pointer: {
      en: 'Intent-driven skill discovery is not loaded here; its exact text is in `{stash}`. READ THAT FILE IN FULL when a request names or implies a workflow a skill may cover and the injected skill list does not show that skill.',
    },
  },
  {
    name: 'skill-registry-protocol',
    label: 'skill registry protocol',
    start: '### Skill Registry Protocol',
    end: '<!-- /gentle-ai:orchestrator -->',
    regions: ['orchestrator'],
    stash: `${LAZY_DIR}/skill-registry-protocol.md`,
    pointer: {
      en: 'The skill registry protocol (resolving `.atl/skill-registry.md` and passing exact `SKILL.md` paths to workers under `## Skills to load before work`) is not loaded here; its exact text is in `{stash}`. READ THAT FILE IN FULL before the first delegation of a session, and when a worker reports `skill_resolution`.',
    },
  },
  {
    name: 'odd-reference',
    label: 'ODD reference detail',
    start: '### Organic Driven Development',
    end: '### Receipt-driven development is user-owned',
    regions: ['agent-routing'],
    stash: `${LAZY_DIR}/odd-reference.md`,
    pointer: {
      en: 'The ODD reference detail (research and assumption challenges, the feature document `odd/tasks/<feature>.md` and its engram mirror, resume, the test-first policy, per-commit review assessment, and the delivery strategy) is not loaded here; its exact text is in `{stash}`. READ THAT FILE IN FULL before creating, resuming or updating a feature document, before the first write of substantial authorized work, and before any work-unit commit or pull request.',
    },
  },
  {
    name: 'rdd-user-owned',
    label: 'receipt-driven development switch rules',
    start: '### Receipt-driven development is user-owned',
    end: '<!-- gentle-ai:remote-authorization -->',
    regions: ['agent-routing'],
    stash: `${LAZY_DIR}/receipt-driven-development-switch.md`,
    pointer: {
      en: 'The rules for the receipt-driven development switch (`gentle-ai review mode enable|disable|status`: opt-in, off by default, never enabled on the user\'s behalf) are not loaded here; their exact text is in `{stash}`. READ THAT FILE IN FULL when the user mentions receipt-driven development, review mode or `gentle-ai review`, and before running `gentle-ai review mode enable|disable`.',
    },
  },
];

export const CUSTOMIZATIONS = [
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
  ...Object.entries(PROMOTED_AREA_RULE_ANCHORS).map(([area, anchors]) => ({
    id: `promoted-${area}-rules-file-holds-every-key`,
    kind: 'owner-sections-outside-managed-regions',
    file: `.claude/rules/promoted-${area}.md`,
    anchors,
  })),
  {
    id: 'claude-md-persona-region-is-only-gentle-ai-text',
    kind: 'persona-region-matches-upstream',
    file: '.claude/CLAUDE.md',
    region: 'persona',
  },
  ...LAZY_SECTIONS.map((section) => ({ id: `lazy-${section.name}`, kind: 'lazy-section', file: '.claude/CLAUDE.md', ...section })),
  // Owner decision 2026-09-28: telemetry stays off. Checked and re-applied through the gentle-ai CLI.
  {
    id: 'gentle-ai-telemetry-disabled',
    kind: 'telemetry-disabled',
  },
];
