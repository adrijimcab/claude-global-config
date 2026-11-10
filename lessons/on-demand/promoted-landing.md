# Promoted rules — landing (on demand, NOT loaded)

Binding. The harness does NOT load this file; `~/.claude/rules/promoted-rules.md` names it and says when to read it: before integrating, landing, merging, fast-forwarding or pushing a branch, resolving a collision, or when the integration branch changes. Read it IN FULL then. The full account of each key is in `~/.claude/lessons/evidence/<key>.md`.
@es Vinculante. El harness NO carga este fichero: `~/.claude/rules/promoted-rules.md` lo nombra y dice cuándo leerlo: antes de integrar, aterrizar, avanzar o subir una rama, o cuando cambia la rama de integración. Leerlo ENTERO entonces.

- **`integrated-a-range-without-running-its-cheap-gates`** — Every integration onto `develop` runs every gate that can READ the changed paths, never a gate list I chose. **A hand-picked gate set is a bounded search written down as coverage.**
  RULE: after a cherry-pick, run the gates derived from the change (`vitest related` plus every `check:*` whose inputs include a touched path), or all of `ci:lint` + `ci:checks` when that is cheap enough, and read their real exit codes before calling the integration done.
  RULE: a gate deferred because a resource is busy is a HARD BLOCKER on landing, written into the plan as one; a change to shipped styles or tokens runs `check:a11y` BEFORE anything is stacked on it; and no ref move onto `develop`/`main` happens without a complete green verdict of the full chain for that exact tree.
  RULE: every fast-forward of develop requires a green `npm test -- --all` on that exact tree, on top of the related `check:*` gates; a list I pick is never the landing proof.
  RULE: a move whose content changes any `*.spec.ts` is also graded by `check:spec-typecheck`.
  RULE (face of 2026-10-11, ~/.claude): `hook-state/census.selftest.mjs` reads EVERY selftest and every state writer, so it is a gate of any change that adds or edits one; a ~/.claude worker runs it in its scoped proof and every brief for ~/.claude work names it. Twice in one day a worker's selftest drove the dispatcher without `isolateState` and only `land.mjs` caught it. Mechanism to build: the brief preflight refuses a ~/.claude brief that does not name the census.
  RULE (face of 2026-10-12, b100-am-ui-f8): this binds every WORKER BRIEF, not only the landing. A brief's gate list is DERIVED from the paths the unit will touch, never written by hand. Briefs for b100 dashboard units U2-U5 omitted `check:barrel-parity` and `check:entry-minimality`; six option types went unexported and the group grew to 15.6 kB against a 14 kB budget before any worker ran either gate. Mechanism to build, split by ownership: each project owns its path-to-gates deriver, because the gates and their declared inputs are the project's own (b100: `.claude/`). `~/.claude/brief-feasibility` owns ONE generic preflight face: when a project declares a deriver, the preflight refuses a brief whose gate list omits a gate the deriver returns for the brief's paths.

- **`landing-gate-run-on-a-tree-that-cannot-fast-forward`** — A landing-proof gate run (the whole gate chain invoked with no arguments, or the unit-suite floor `ci:test`) must REFUSE before a single gate starts, and before any verdict is written as `running`, when its tree cannot fast-forward the integration branch it means to prove.
  RULE: before any landing-proof gate run starts, ask git directly — `git merge-base --is-ancestor <integration branch> HEAD` — never trust a base named in a brief or remembered from an earlier turn.

- **`unverified-commit-published-by-another-sessions-sync`**
  RULE: work in progress goes on a branch in its own worktree with no upstream, and reaches the shared branch only through `node ~/.claude/worktree-landing/land.mjs --worktree <dir> --main <dir> --branch <shared> --remote <remote>` (verifies in the worktree, then fast-forwards, pushes and reads the remote tip back); never commit to, merge into or fast-forward the shared branch by hand.
  RULE (face of 2026-10-11, Discovery): a project's `.claude/fleet-kit.json` `integrationBranches` names the branch work ACTUALLY lands on, the current batch branch first; a guard configured for a branch nobody integrates into governs nothing and refuses every honest delegation. Owner, 2026-10-11: «cuando se cambie esa rama o se mergee o se integre en otra se cambie también su configuración, para que apunte a la nueva rama» — so whenever the integration branch is switched, merged into another branch, or integrated anywhere that becomes the new line of work, the project's single declared source of its integration branches is updated in the SAME turn and in the same change, the new branch first, and the project's backup commits it. That source is `.claude/fleet-kit.json` `integrationBranches` where the project uses fleet-kit, and the project's own module where it has one (b100-am-ui: `.claude/integrate/integration-branches.mjs`); every other tool reads that one source, never a hard-coded branch name. Mechanism (to build): `land.mjs` refuses a landing whose target branch is not `integrationBranches[0]` of that project, naming the file to update.

- **`collision-fixed-by-deleting-unread-side`**
  RULE: before choosing a side, diff what each side uniquely HOLDS, not just what the gate will re-check; when both sides carry content, the resolution is a union you construct and verify, never a side you pick.
  RULE: act on what a finding SAYS, never on what its state name suggests.
  RULE (face of 2026-10-18, Discovery): before writing a shared memory or configuration file, check whether it exists and read it; extend it, never replace it, because another session may have created it minutes earlier.

## The backup repository of each project, and how publication is decided (moved from rules/00-owner-mandates.md, 2026-11-10)

- Repos de respaldo (rama `master` en todos):
  - `~/.claude/**` → `adrijimcab/claude-global-config` (`git -C ~/.claude …`);
  - `<b100-am-ui>/.claude/**` → `adrijimcab/b100-am-ui-claude-tooling` (`node .claude/backup-repo.mjs …`);
  - `<di_1700002_discovery_fe>/.claude/**` → `adrijimcab/di-1700002-discovery-fe-claude-tooling`
    (`node .claude/backup-repo.mjs …`; creado el 2026-10-11 con autorización del dueño);
  - un repo de proyecto nuevo con `.claude/` propio declara aquí su repo de respaldo antes de usarlo;
  - ese proyecto declara también `.claude/agent-contract/anchors.json` con el par inglés/español de su contrato, y el
    guard `agent-contract-parity` rechaza toda delegación mientras falte.
- Un guard que necesita conocer los nombres de herramientas de IA (el de atribución en los commits) lee la lista desde
  fuera del repo, nunca la versiona.
- Mecanismo de publicación: `land.mjs` decide por la URL del remoto — `adrijimcab` se publica, cualquier otro remoto
  integra solo en local e imprime el comando de push para el dueño, sin ningún flag que lo encienda.
