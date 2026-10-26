# Voice judge: live or shadow — the owner's decision, and the rule that decides it

Status on 2026-10-26: v8g is LIVE by the owner's promotion (`promotion.json`, «dejalo metido»), with its ship bar
NOT met (`ship-bar.json`). Nothing in this file changes that. It gives the owner a rule, written before the
measurement it applies to, and the exact commands that produce that measurement on his machine. The switch the rule
would flip exists and is off: `judge-gate/modes.json` has `"voice": "live"`.

## 1. The question

Does v8g block replies the owner would pass often enough that it should stop holding turns (shadow mode: it is still
asked, every verdict is recorded in the outcome log as `shadow-block` or `pass`, nothing is printed) until a rubric
meets the ship bar?

## 2. The rule, fixed before the measurement it decides

- **Bar.** The ship bar is recall ≥ 90% on the owner's fails and precision ≥ 95% on his passes
  (`measure.mjs`, `SHIP_BAR`). A pass the judge does not let through is a false block, so the bar tolerates a
  false-block rate of **5%** (`FALSE_BLOCK_BAR`, derived in code from the precision, never typed twice).
- **Measurement.** The owner's labels on a packet drawn at random (section 3), each reply judged once
  (`--runs 1`, as the live gate judges a stop once). A false block is an owner pass the judge answered `ok: false`
  with a valid verdict; a non-verdict passes live, so it is not one.
- **Interval.** Wilson 95% on false blocks / owner passes (`judge-gate/wilson.mjs`).
- **Decision** (`measure.mjs` `decisionOf`, printed per run by `--rates`):
  - `shadow` when even the interval's LOW end is above 5%: the bar is missed beyond sampling doubt.
  - `within-bar` when even its HIGH end is at or below 5%.
  - `undecided` otherwise: the owner's promotion stands, and the next packet (a new `--seed`) is labelled.
  - `not measured` when the packet holds no owner pass: label the next packet.
- **What it takes.** With 10 replies the rule can only reach `shadow` or `undecided`: `within-bar` needs about 73
  owner passes with zero false blocks. Two false blocks out of five passes are already `shadow` (Wilson low 11.8%);
  one out of five is `undecided` (low 3.6%).

Why one-sided on false blocks: shadow mode exists to stop a judge from holding turns it should not hold. A judge that
misses fails costs leniency, not turns; recall is printed beside it and stays the ship bar's business.

**What would make this rule wrong.** (1) The packet is drawn from the unadjudicated fixtures (real replies of
2026-10-11 to 2026-10-18); if the owner's replies since v8g went live differ, the packet is not the live population.
(2) Wilson assumes independent draws; ten replies from three sessions are not fully independent. (3) A label given
after reading the judge's line is not blind; the packet puts the reply first for that reason.

## 3. The commands, on the owner's machine

Draw and judge the packet (10 replies, the seed fixes the draw; the selftest pins the shuffle):

```
node "$HOME/.claude/voice-judge/measure.mjs" --packet "$HOME/voice-packet-20261026.md" --seed 20261026
```

With today's fixtures that seed draws: `discovery-explain-simple`, `real-green-5f411d3c-10121547`,
`held-v8-red-5f411d3c-10121411`, `held-red-664a8a26-10181710`, `real-green-5f411d3c-10121109`,
`real-green-5f411d3c-10121606`, `real-green-5f411d3c-10121251`, `real-red-664a8a26-10181358`,
`held-red-c4d7f854-10181729`, `real-v8-green-5f411d3c-10182232`.

Write each label into its fixture (`"expect": "pass"` or `"fail"`, `"labelledBy": "owner"`, `"labelledOn"`), then
apply the rule to those ten only (the earlier owner labels are the ones v8g was derived from, so they stay out):

```
node "$HOME/.claude/voice-judge/measure.mjs" --rates --runs 1 --prefix '' --only discovery-explain-simple,real-green-5f411d3c-10121547,held-v8-red-5f411d3c-10121411,held-red-664a8a26-10181710,real-green-5f411d3c-10121109,real-green-5f411d3c-10121606,real-green-5f411d3c-10121251,real-red-664a8a26-10181358,held-red-c4d7f854-10181729,real-v8-green-5f411d3c-10182232
```

The line `run 1 owner false-block k/n = … (Wilson 95% …), bar 5%: decision=…` is the decision. The same command
with `--rubric v8h` gives the candidate's (section 5).

The live block rate, from the gate's own log (monitoring, not the decision):

```
node "$HOME/.claude/judge-gate/rates.mjs" --judge voice --since 2026-10-26
```

It prints the first-stop block rate with its Wilson interval, and the continued, capped, non-verdict and malfunction
counts apart. A missing log exits 2 ("not measured"), never 0%. A block rate is not a false-block rate: if b is the
live block rate and f the share of replies the owner would fail, the false-block rate is at least (b − f) / (1 − f)
— a floor, informative only when b is well above f.

If the decision is `shadow`: set `"voice": "shadow"` in `~/.claude/judge-gate/modes.json` (the file is the owner's
record, edited by hand; the judge-gate selftest checks every judge has a known mode). `promotion.json` is not touched:
promotion says which text runs, the mode says whether its blocks hold a turn.

## 4. What was measured on 2026-10-26 (in this cloud worktree, haiku, `judge-gate/model.mjs`)

These are reported, NOT the deciding measurement: the rule above was written after them, and the owner labels they
score are the ones v8g was derived from.

- v8g, 115 fixtures × 3 runs, 0 non-verdicts: owner fails caught 28/30; owner passes blocked **7/9** (Wilson 95%
  45.3%–93.7%); author passes blocked 2/21; unadjudicated replies blocked **235/252 = 93.3%** (the "92%" of the
  backlog, reproduced). The owner himself labelled 10 of his 13 replies fail, so a high block rate alone does not
  show false blocks; the 7/9 does, in-sample.
- **Rule 8 over-application: not reproduced under v8g.** Of the 213 judgments of replies with no bullet, numbered or
  table line, 183 were blocks and **0** gave rule 8 as their reason (each candidate read; the nine reasons a word
  search flagged were all rule 6). The blocks of prose status replies now come from rule 6: the third-person log
  clause and the four mentor traits. Whether those are false is the owner's ear, which is what the packet measures;
  no rubric text was changed for rule 8, because there was no measured defect to change it for.
- **`third-person-su-possessive`, the unstable fixture.** Under v8g, 20 of 33 runs (3 + 10 + 20) blocked it with a
  rule-4 reason reading Discovery's «su» as usted aimed at the owner. What in the text tells the two apart: of the 115
  fixtures, 78 hold su or sus, 24 of those also address the owner with a common vos form, and in all 24 every su is a
  third person's (read one by one); one reply never addresses the same man with vos and with usted. v8h
  (`rubrics/v8h.mjs`) adds exactly that sentence to rule 4. Under v8h: **0 of 30** runs gave a rule-4 su reason; the
  fixture still fails as expected (on rule 6) in 29 of 30. No fixture was relabelled or removed.
- v8h, 115 fixtures × 3 runs: owner fails caught 27/30, owner passes blocked 4/9, author passes blocked 2/21,
  unadjudicated blocked 238/252, 1 non-verdict (the gate passes it). Owner-set differences from v8g are inside the
  noise of n = 9.
- The detector that scores a rule-4 false positive (`citesRule4`) counted praise as citations ("passes rule 4",
  "rule 4 is not violated: there is no tú or usted word", "voseo aimed at the owner in 'sepas'"); fixed and pinned
  verbatim, and the counts above use the fixed detector.

## 5. The second decision: v8h

v8h fixes the su instability at its root and changes nothing else in v8g's text. It is a candidate: the selftest
refuses it live without a MET ship-bar record or an owner promotion of its exact sha256. Running the section 3
`--rates` command with `--rubric v8h` on the labelled packet gives its decision under the same rule; promoting it is
the owner's call, recorded as `promotion.json` is now.

## @es Resumen en español

Estado al 2026-10-26: la v8g está VIVA por promoción del dueño, con la barra NO alcanzada; este archivo no cambia eso.
REGLA, fijada antes de la medición que decide: la barra tolera un 5% de falsos bloqueos (derivado en código de su
precisión del 95%); se mide con las etiquetas del dueño sobre un paquete sacado al azar, cada respuesta juzgada una
vez; con el intervalo de Wilson del 95% sobre falsos bloqueos / pases del dueño, `shadow` si hasta el extremo bajo
supera el 5%, `within-bar` si hasta el extremo alto queda en o bajo el 5%, `undecided` si no (la promoción sigue y se
etiqueta otro paquete con otra semilla), `not measured` si no hay pases. Qué la haría incorrecta: un paquete que no
represente las respuestas en vivo, sorteos no independientes, etiquetas dadas tras leer al juez. COMANDOS: los tres
de la sección 3 (paquete, regla sobre esos diez ids, tasa en vivo con `judge-gate/rates.mjs`); si sale `shadow`, poner
`"voice": "shadow"` en `judge-gate/modes.json`, sin tocar `promotion.json`. MEDIDO HOY (informado, no decide): la v8g
bloqueó 7/9 pases del dueño (en muestra) y el 93,3% de las respuestas sin adjudicar; la sobreaplicación de la regla 8
no se reproduce (0 de 213 juicios en prosa la citan; los bloqueos vienen de la regla 6); el su de una tercera persona
se leía como usted en 20 de 33 corridas con la v8g y en 0 de 30 con la candidata v8h, que solo agrega esa oración a la
regla 4. Promover la v8h es una segunda decisión del dueño.
