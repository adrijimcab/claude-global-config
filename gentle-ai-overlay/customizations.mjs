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
  '- **`audit-verdict-from-commit-subjects-not-from-reading`**',
  '- **`worker-claim-about-unreachable-file-committed-as-fact`**',
];

// The promoted rules that apply to an ACTION, not to a path, in lessons/on-demand/ (the harness does not load them;
// promoted-rules.md names each file and when to read it). They were moved out of promoted-rules.md on 2026-10-12 to
// keep the always-loaded set under its ceiling; their anchors move with them. @es Las reglas promovidas que valen
// para una ACCIÓN y no para una ruta, en lessons/on-demand/ (el harness no las carga; promoted-rules.md nombra cada
// fichero y cuándo leerlo). Salieron de promoted-rules.md el 2026-10-12 para mantener el conjunto siempre cargado
// bajo su techo; sus anclas van con ellas.
const PROMOTED_ON_DEMAND_RULE_ANCHORS = {
  delegation: ['- **`brief-marker-written-as-prose-not-literal-form`**', '- **`provisioning-bound-to-delegation-not-worktree-creation`**', '- **`gitignored-deliverable-destroyed-by-worktree-autoclean`**'],
  landing: ['- **`integrated-a-range-without-running-its-cheap-gates`**', '- **`collision-fixed-by-deleting-unread-side`**'],
  records: ['- **`promotion-to-contract-read-as-prevention`**'],
};

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
      en: 'Blocking-prompt contracts (lossless relay of a prompt, menu or choice envelope for the user; Gentle AI provider-defect handoff): `{stash}`. READ IT IN FULL, and follow it as if written here, as soon as a sub-agent or tool returns a blocking prompt, menu or choice envelope, or a `gentle-ai` invocation exits non-zero or refuses.',
    },
  },
  // The review execution contract is lazy whatever the review mode. Owner decision 2026-10-01 loaded it only
  // while gentle-ai reviews may run; with the switch on that kept ~14.7 KB inline and pushed CLAUDE.md over the
  // 40,000-byte harness per-file limit (43,446 measured 2026-10-18), so it is now read on its triggers, which
  // the pointer names, exactly like the sections above. A CLAUDE.md already moved is repointed by the next
  // apply. @es El contrato de ejecución de revisiones es diferido sea cual sea el modo de revisión. La decisión
  // del dueño del 2026-10-01 lo cargaba solo mientras las revisiones de gentle-ai pueden correr; con el
  // interruptor encendido eso dejaba ~14,7 KB en línea y CLAUDE.md pasaba el límite por fichero del harness de
  // 40.000 bytes (43.446 medidos el 2026-10-18), así que ahora se lee ante sus disparadores, que el puntero
  // nombra, igual que las secciones de arriba. Un CLAUDE.md ya movido se re-apunta con el siguiente apply.
  {
    name: 'review-contract',
    label: 'review contract',
    start: '#### Review Execution Contract',
    end: '#### Cost and Context Balance',
    regions: ORCHESTRATOR_REGIONS,
    witness: '# Native Compact Review Orchestration',
    stash: `${LAZY_DIR}/review-execution-contract.md`,
    pointer: {
      en: 'Review Execution Contract (native review lifecycle, lenses, consent, capture, correction, acknowledgement): `{stash}`. READ IT IN FULL, and follow it as if written here, before running any `gentle-ai review` command other than `gentle-ai review mode status`, whenever the review switch is on (`gentle-ai review mode status` reports `effective: on`), before relaying a `gentle-ai.review-integration.consent/v3` envelope, and as soon as a capture or STATUS returns a review transition.',
    },
  },
  // gentle-ai v4 (ODD) only: the spans below exist in the `orchestrator` and `agent-routing` regions that v4
  // renders, so `regions` names the v4 ids alone and a v2/v3 render never matches them (it is refused, never
  // moved under a v4 pointer). Measured 2026-10-11 on a v4.0.0 render in an emulated home: with them the
  // always-loaded set fell from 88,826 to under the 66,000-character target. @es Solo gentle-ai v4 (ODD): estos
  // tramos existen en las regiones `orchestrator` y `agent-routing` que genera v4, así que `regions` nombra solo
  // los ids de v4 y un render v2/v3 nunca coincide (se rechaza, nunca se mueve bajo un puntero de v4). Medido el
  // 2026-10-11 sobre un render de v4.0.0 en un home emulado.
  {
    name: 'orchestrator-mental-model',
    label: 'orchestrator mental model',
    start: '### Mental Model',
    end: '### Lossless Blocking Prompts (MANDATORY)',
    regions: ['orchestrator'],
    stash: `${LAZY_DIR}/orchestrator-mental-model.md`,
    pointer: {
      en: 'Mental Model, restating `## Implementation Routing`: `{stash}`. READ IT IN FULL when unsure whether to coordinate or execute.',
    },
  },
  {
    name: 'delegation-and-verification',
    label: 'language, delegation and verification contracts',
    start: '### Language Domain Contract',
    end: '#### Review Execution Contract',
    regions: ['orchestrator'],
    stash: `${LAZY_DIR}/delegation-and-verification.md`,
    pointer: {
      en: 'Language Domain Contract, Delegation Rules and its triggers (restated, always loaded, under `## Implementation Routing`), Delegated Verification Gate, Native Checking Contract: `{stash}`. READ IT IN FULL, and follow it as if written here, before launching a delegated worker, when a delegated writer returns work, and before deciding what verification a finished change needs.',
    },
  },
  {
    name: 'routing-and-hand-off',
    label: 'routing ladder, hand-off rules and skill discovery',
    start: '#### Cost and Context Balance',
    end: '### Safety',
    regions: ['orchestrator'],
    stash: `${LAZY_DIR}/routing-and-hand-off.md`,
    pointer: {
      en: 'Cost and Context Balance, Work Routing Ladder, Canonical Lightweight Workflows, Allowed edit surfaces (MANDATORY for every writer), Key Learnings closing block, Delivery strategy and Intent-Driven Skill Discovery: `{stash}`. READ IT IN FULL before launching a delegated worker, before recovering from a tooling or worktree incident, and when a request implies a skill the injected list does not show.',
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
      en: 'Skill Registry Protocol (`.atl/skill-registry.md`, exact `SKILL.md` paths for workers): `{stash}`. READ IT IN FULL before the first delegation of a session and when a worker reports `skill_resolution`.',
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
      en: 'ODD reference detail (research, the feature document `odd/tasks/<feature>.md` and its engram mirror, resume, test-first policy, per-commit review assessment, delivery strategy): `{stash}`. READ IT IN FULL before creating, resuming or updating a feature document, before the first write of substantial authorized work, and before any work-unit commit or pull request.',
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
      en: 'Receipt-driven development switch rules (opt-in, off by default, never enabled on the user\'s behalf): `{stash}`. READ IT IN FULL when the user mentions receipt-driven development, review mode or `gentle-ai review`, and before running `gentle-ai review mode enable|disable`.',
    },
  },
  // The core of the rule stays loaded in the pointer itself; the stash holds its full text. @es El núcleo de la
  // regla sigue cargado en el propio puntero; el depósito guarda su texto completo.
  {
    name: 'remote-authorization',
    label: 'remote operation authorization',
    start: '## Remote operation authorization',
    end: '<!-- /gentle-ai:remote-authorization -->',
    regions: ['remote-authorization'],
    stash: `${LAZY_DIR}/remote-operation-authorization.md`,
    pointer: {
      en: 'Remote execution, file transfer, and inspecting or using SSH agents, credentials or authenticated sessions need the user\'s explicit authorization of destination, operation and credential; local-development permission is not it. Full rules: `{stash}`. READ IT IN FULL before any such step.',
    },
  },
];

// The review stop hook that gentle-ai registers on two events of settings.json, replaced by the shim that runs it only in
// a linked worktree (review-site/stop-hook.mjs). `sync` appends its own command again whenever no entry carries it, so
// the replacement is a customization (kind hook-command-replacement), not a one-off edit. @es El hook de parada de
// revisión que gentle-ai registra en dos eventos de settings.json, sustituido por el conducto que lo corre solo en un
// worktree enlazado. `sync` vuelve a añadir su comando cuando ninguna entrada lo lleva, así que el reemplazo es una
// personalización (tipo hook-command-replacement), no una edición suelta.
const REVIEW_STOP_HOOK = {
  upstream: 'gentle-ai review stop-hook --agent claude-code',
  replacement: 'node "$HOME/.claude/review-site/stop-hook.mjs"',
};
const REVIEW_STOP_HOOK_EVENTS = ['SessionStart', 'Stop'];

// The precedence between the brevity rules and the voice, inserted right below the last brevity rule in the two files
// gentle-ai renders them in: the output style and the persona region of CLAUDE.md. Upstream says "be brief" and never
// that brevity is about LENGTH only, so a short reply drifted into plain status prose. Owner mandate 2026-10-18; the
// same precedence is written in rules/00-owner-mandates.md. @es La precedencia entre las reglas de brevedad y la voz,
// insertada justo bajo la última regla de brevedad en los dos ficheros donde gentle-ai las genera: el output style y la
// región persona de CLAUDE.md. Upstream dice «sé breve» y nunca que la brevedad es solo de LARGO, así que una respuesta
// corta derivaba en prosa de estado plana. Mandato del dueño 2026-10-18; la misma precedencia está en
// rules/00-owner-mandates.md.
const VOICE_PRECEDENCE_LINE = '- Brevity governs length, never the voice: a short reply is still the Gentleman mentor, warm Rioplatense voseo that speaks to the person, with the why and a closing that lands.';
const VOICE_PRECEDENCE_PLACES = [
  { name: 'output-style', file: '.claude/output-styles/gentleman.md', after: '- If unsure whether to be brief or detailed, be brief.' },
  { name: 'claude-md-persona', file: '.claude/CLAUDE.md', after: '- If unsure about length or detail, choose the shorter response.' },
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
  ...Object.entries(PROMOTED_ON_DEMAND_RULE_ANCHORS).map(([topic, anchors]) => ({
    id: `promoted-${topic}-on-demand-rules-file-holds-every-key`,
    kind: 'owner-sections-outside-managed-regions',
    file: `.claude/lessons/on-demand/promoted-${topic}.md`,
    anchors,
  })),
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
    ownedLines: [VOICE_PRECEDENCE_LINE],
  },
  ...VOICE_PRECEDENCE_PLACES.map((place) => ({
    id: `brevity-never-governs-the-voice-in-${place.name}`,
    kind: 'anchored-line-insertion',
    file: place.file,
    after: place.after,
    line: VOICE_PRECEDENCE_LINE,
  })),
  ...LAZY_SECTIONS.map((section) => ({ id: `lazy-${section.name}`, kind: 'lazy-section', file: '.claude/CLAUDE.md', ...section })),
  ...REVIEW_STOP_HOOK_EVENTS.map((event) => ({
    id: `review-stop-hook-runs-only-in-a-linked-worktree-on-${event}`,
    kind: 'hook-command-replacement',
    file: '.claude/settings.json',
    event,
    ...REVIEW_STOP_HOOK,
  })),
  // Owner decision 2026-09-28: telemetry stays off. Checked and re-applied through the gentle-ai CLI.
  {
    id: 'gentle-ai-telemetry-disabled',
    kind: 'telemetry-disabled',
  },
];
