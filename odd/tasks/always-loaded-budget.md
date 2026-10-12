# always-loaded-budget — bring the global always-loaded set down by at least 15,000 harness-counted characters, zero rules lost

Route: tracked-odd. Branch `feat/always-loaded-budget` on `land/checkpoint-29`. Worker: delegated, single writer.
@es Ruta tracked-odd. Rama `feat/always-loaded-budget`. Un solo worker escritor.

## Decided design (orchestrator's decisions, with the reason)

- Nothing binding disappears. A binding line stays loaded, or moves to a file a loaded line names by path with WHEN to read it, or to a `paths:`-scoped rules file.
- Promoted rules that apply to an ACTION (delegating, landing, recording) cannot be scoped by `paths:`; they move to `~/.claude/lessons/on-demand/promoted-<topic>.md`, named from `rules/promoted-rules.md` with the situation. Rejected alternative: a new `AREAS` entry with paths, because no path predicts those actions.
- `capture.mjs` must still find the rule text of a promoted key after the move, so `lessons/on-demand/*.md` joins the rules-file family (`ledger-routes.mjs: onDemandRulesFiles`). Without it a recurrence would be told to edit `promoted-rules.md` and `promote` would write the key twice.
- Narrative, dated provenance and the English/Spanish mirror paragraphs are cut by WHOLE-LINE removal, so `rule-tiering/check.mjs` proves each cut line is archived verbatim (`lessons/archive/*-before-2026-10-12.md`) and no added line invents text.
- Area lessons (three guard lessons) move with `capture.mjs route --key <k> --to guards --write`, never by hand.
- `capture.mjs` has no home flag: it reads `os.homedir()`. It was driven with `USERPROFILE`/`HOME` pointed at a scratch home whose `.claude` is a junction to this worktree, so the live `~/.claude` was never read or written.

## Tasks

- [x] T1 Make the promoted-rules family include `lessons/on-demand/*.md` (code, selftest case, 2 mutants). Commit `61d7cdf`. Route: inline (one module + wiring, understood). Evidence: `routing.selftest` 38 passed; `routing.mutants` 19/19, 16/16, 21/21, 38/38 killed; the on-demand case fails without the change (promote cannot find the key token).
- [x] T2 Move 20 action-scoped promoted entries into three on-demand files; `promoted-rules.md` keeps the verification-class rules plus 3 pointer lines; overlay anchors follow the entries. Commit `8545fe2`. Evidence: promoted-rules.md 21,779 -> 8,968; `gentle-ai-overlay/check.mjs --home <scratch>` all HELD (3 new on-demand entries); overlay selftest 221/221.
- [x] T3 Cut narrative and `@es` mirrors from `00-owner-mandates.md` and `verification-contract.md`; archive the originals; one pointer line in `20-lessons.md`. Commit `c738e5a`. Evidence: `rule-tiering/check.mjs` conserved for both files (0 deficits); 00-owner-mandates 26,241 -> 23,897, verification-contract 4,998 -> 4,241.
- [x] T4 Route three guard lessons to the guards area ledger with `capture.mjs route`. Commit `809f88e`. Evidence: lessons-ledger.md 16,045 -> 15,044.
- [x] T5 Prove: inventory (0 missing of 207 binding items), budget before/after, selftests (34 files, 0 failed). Commit: this document.

## Result

Global always-loaded set, harness-counted: 106,744 -> 90,002 (-16,742; raw 108,232 -> 91,490). Ceiling 147,000 with the Discovery project's own 30,453 on top (handled elsewhere).
@es Conjunto global siempre cargado, contado por el harness: 106.744 -> 90.002 (-16.742).

## Not done, on purpose

- `CLAUDE.md` (30,661, managed by `gentle-ai sync`) untouched.
- The tiering check reports 26 `rule-lost` and 5 `invented` for `promoted-rules.md` against the old text: the 26 are the RULE sentences of the 20 moved entries, present literally in `lessons/on-demand/` (inventory proves it); the 5 are the new pointer lines and the header line.
