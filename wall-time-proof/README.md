# wall-time-proof

Guard key: `wall-time-asserted-as-concurrency-proof` (lessons ledger).

## The rule

Inside a selftest check (the arguments of a `check`, `expect`, `assert`, `ok`, `equal` or `assert.*` call in a
`*.selftest.mjs`), an **elapsed wall time** must not be compared against a bound. Prove an ordering with a condition
the proof controls: a release file the process waits on, an injected clock, a counted event, the engine's own answer.

An elapsed wall time is the difference of two clock readings (`Date.now()`, `performance.now()`, `process.hrtime()`
or `process.hrtime.bigint()`), written in the check or held in a name (`const spent = Date.now() - started;`), or
arithmetic over one. A bound is any comparison (`<`, `<=`, `>`, `>=`, `==`, `===`, `!=`, `!==`).

## What is flagged

- `check('fast', Date.now() - started < 100)`, with the bound on either side, upper or lower.
- `const spent = Date.now() - started; check('fast', spent < 1000)`, and `spent / 1000`.
- `const fast = Date.now() - started < 5; check('fast', fast)`.
- `performance.now()`, `process.hrtime.bigint()`, `hrtime()` and `process.hrtime(start)` in the same shapes.

## What is not flagged

- A **deadline that bounds waiting**: `while (!ready() && Date.now() < deadline)`, `until(fn, 5000)`,
  `check('in time', Date.now() < deadline)`. A deadline has no difference of two readings in it.
- An elapsed value that is only **reported** (`` `${String(Date.now() - started)} ms` `` in a detail) or passed bare.
- A past instant: `stamp > Date.now() - 60_000` (the other operand is not a reading).
- A difference outside an assertion (`if (Date.now() - started > 5000) throw ...`): the rule is about proofs.
- Text that only mentions a clock: strings, comments, template text and regular expressions are skipped by the lexer.

Names are tracked by spelling over the whole file, not by scope, and a bare elapsed name passed as a check argument is
not flagged (a check's detail argument is legitimate); both are the known limits of a scanner without a full parser.

## Files

| File | Owns |
|---|---|
| `lexer.mjs` | tokens; where strings, templates, comments and regular expressions begin and end |
| `token-walk.mjs` | brackets, `name = expression` ranges, how far an operand reaches |
| `elapsed-values.mjs` | which tokens are an elapsed time; the names that hold readings, elapsed values and verdicts |
| `check-calls.mjs` | the assertion calls and the lines where they compare an elapsed time against a bound |
| `scan.mjs` | scanning a list of files through an injected reader |
| `messages.mjs` | the bilingual rule and finding text |
| `selftest.mjs` | proof over constructed sources: every forbidden shape red, every deadline shape green |
| `tree.selftest.mjs` | the enforcement: scans every selftest the selftest runner discovers, red with `file:line` |
| `mutants.mjs` | the mutation campaign of the deciding modules |

`tree.selftest.mjs` is a `*.selftest.mjs`, so `selftest-runner/run.mjs` runs it on every landing with no list to keep.

## The two incidents

1. **2026-11-04 (first face):** the landing of `fix/mg-t24-async-runner` went red 185/186: `judge-gate/selftest.mjs`
   proved that `spawnAsync` runs children at once by a wall-time bound (three 400 ms children under 1100 ms), which
   failed once the parallel selftest runner loaded the machine although the children did overlap. Fixed in `4324bcb`
   with a meeting (each child waits for the marks of the others).
2. **2026-11-10 (second face):** `full-chain-lock/detach.selftest.mjs` checked `returnedIn < 1400` (a difference of
   `Date.now()` readings) against a 1500 ms chain as proof that `--detach` returns before the chain ends. It measured
   2481 ms under the parallel selftest runner and the landing of `land/checkpoint-t32` was refused 188/189. Fixed in
   `1240db2` by a release file the chain waits on: the proof decides when the chain ends.

The same commit series as this guard fixed the seven assertions the scan found in the tree: `baseline-record/collect`,
`full-chain-lock/runner`, `hook-state/journal`, `owner-language-guard/pretool` (two) and `process-control/kill-tree`
(two), each with a condition the proof controls and no exemption.

@es **La regla:** dentro de un check de selftest, un tiempo de pared transcurrido (diferencia de dos lecturas de reloj)
no se compara con una cota; el orden se prueba con una condición que la prueba controla (un fichero de liberación, un
reloj inyectado, un evento contado, la respuesta del motor). Un plazo que acota una espera no se marca; tampoco un valor
que solo se informa, un instante pasado, una diferencia fuera de una aserción ni texto que solo menciona un reloj.
`tree.selftest.mjs` hace cumplir la regla en cada aterrizaje y `selftest.mjs` prueba ambos lados.
