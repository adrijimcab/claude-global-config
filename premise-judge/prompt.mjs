/**
 * The premise judge: the rubric the Stop command hook `node "$HOME/.claude/judge-gate/run.mjs" premise` asks a model,
 * kept here as its one source (`../judge-gate/judges.mjs` loads it; the selftest refuses a native prompt hook that
 * still carries it).
 *
 * WHY. Owner directive 2026-10-06 (`rules/00-owner-mandates.md`): every premise the assistant acts on, the
 * owner's own included, is judged before it is acted on or presented as a constraint. The claim guard
 * (`hooks/claim-guard.mjs`) catches the phrasings a pattern can see; this hook asks a model the two questions a
 * pattern cannot: (a) is an unevidenced premise or claim presented as a constraint, (b) was an owner
 * instruction carried out without weighing a real architectural, security or performance downside.
 *
 * CONTRACT (code.claude.com/docs/en/hooks, "Prompt-based hooks", read 2026-10-06): `type: "prompt"`, the hook
 * input JSON replaces `$ARGUMENTS`, the default model is the one Claude Code uses for background work, the
 * default timeout is 30 s, and the model answers `{"ok": true}` or `{"ok": false, "reason": "..."}`. On `Stop`,
 * `ok: false` feeds the reason back as Claude's next instruction and the turn continues. That was the native hook's
 * contract; since 2026-10-12 the judge runs through `../judge-gate/`, a command hook that keeps the same answer
 * shape and decides in CODE what the native hook left to the model: `stop_hook_active` (a continued stop is judged
 * only until its turn has had `MAX_BLOCKS_PER_TURN` blocks) and an answer that is no verdict (it passes as
 * `non-verdict`). No rule of the rubric asks the model to test `stop_hook_active`; the harness's cap of 8
 * consecutive continuations stays the outer backstop.
 *
 * RUBRIC v5 (2026-10-12): v4 with rule 1 rewritten. The gate (`../judge-gate/`) now passes a continued stop in code, so
 * the model is no longer asked to test `stop_hook_active`; measured on the voice judge, the model failed that test in 1 of 5
 * runs. The hook is a `command` hook because `if` is evaluated only on tool events (docs, read 2026-10-12).
 * RUBRIC v6 (2026-10-18): rule 1 rewritten again. The gate now also judges the rewrite after a block, until the turn has
 * had two blocks (judge-gate MAX_BLOCKS_PER_TURN), so the model may see either kind of stop and judges both the same way.
 * @es RÚBRICA v5: v4 con la regla 1 reescrita. La compuerta pasa en código toda parada continuada; el modelo ya no
 * prueba `stop_hook_active` (medido en el juez de voz: falló esa prueba en 1 de 5 corridas).
 *
 * RUBRIC v4 (2026-10-11): v3 minus case (d). Case (d) refused a final message that reported a measurable
 * state as probable or unverified; it was retired on 2026-10-11 pending calibration on the recorded blocks
 * (14 blocks in one session, most demanding receipts already in that turn's tool results, the last naming
 * states the reply never claimed). It returns only after that calibration. Rule 4 keeps v3's sharper wording:
 * "unverified" passes ONLY when it cannot be measured this turn.
 * @es RÚBRICA v4: v3 sin el caso (d). El caso (d) rechazaba un mensaje final que informaba como probable o no
 * verificado un estado medible; se retiró el 2026-10-11 a la espera de calibrarlo sobre los bloqueos
 * registrados (14 en una sesión, la mayoría exigía comprobantes ya presentes en los resultados de ese turno y
 * los últimos nombraban estados que la respuesta no afirmaba). Vuelve solo tras esa calibración. La regla 4
 * conserva la redacción de v3: «no verificado» pasa SOLO si no se puede medir en este turno.
 *
 * MEASURED. A prompt hook's decision is visible to no other hook, so the reason must start with the marker
 * `PREMISE-JUDGE:`, which `journal-guard.mjs` finds in the transcript on the next stop and journals as a
 * `decision` of the `premise-judge` mechanism, the population `guard-precision/` samples. The rubric spells the
 * marker in words, never literally, so the prompt text (which the transcript may log as the hook's label) is
 * never mistaken for a block. `PROMPT_SIGNATURE` is the rubric's first line, which `latency.mjs` uses to find
 * this hook's duration among the Stop hooks of a transcript.
 *
 * @es El juez de premisas: la rúbrica que el hook de comando de Stop `judge-gate/run.mjs premise` le pregunta a un
 * modelo, guardada aquí como su única fuente. POR QUÉ: directiva del
 * dueño 2026-10-06, toda premisa se juzga antes de actuar o de presentarla como restricción. La guardia de
 * afirmaciones caza los giros que un patrón ve; este hook pregunta a un modelo lo que un patrón no puede.
 * CONTRATO (docs oficiales, leídas el 2026-10-06): `$ARGUMENTS` es el JSON de entrada, modelo de fondo por
 * defecto, 30 s de timeout, respuesta `{"ok": true}` o `{"ok": false, "reason": "..."}`; en Stop, `ok: false`
 * devuelve el motivo como siguiente instrucción. Ese era el contrato del hook nativo; desde el 2026-10-12 el juez corre
 * por `../judge-gate/`, un hook de comando que decide en CÓDIGO `stop_hook_active` (una parada continuada se juzga
 * solo hasta que su turno lleve `MAX_BLOCKS_PER_TURN` bloqueos) y una respuesta que no es veredicto (pasa como
 * `non-verdict`); ninguna regla le pide al modelo probar `stop_hook_active`, y el tope del harness de 8
 * continuaciones seguidas sigue siendo la red exterior. MEDIDO: el motivo empieza por la marca
 * `PREMISE-JUDGE:`, que `journal-guard.mjs` encuentra en el transcript y registra; la rúbrica la deletrea en
 * palabras, nunca literal, para que el texto del prompt no se confunda con un bloqueo.
 */

/** The marker every block reason starts with. @es La marca con que empieza todo motivo de bloqueo. */
export const MARKER = 'PREMISE-JUDGE:';

/** The first line of the rubric: how this hook is told apart among the Stop hooks of a transcript. @es La primera línea de la rúbrica. */
export const PROMPT_SIGNATURE = 'premise-judge rubric v6.';

/** The timeout of the hook, in seconds: the documented default, written down so the selftest pins it. @es El timeout del hook, en segundos. */
export const TIMEOUT_SECONDS = 30;

/** The rubric. `$ARGUMENTS` is its only `$`: any other would need escaping. @es La rúbrica. `$ARGUMENTS` es su único `$`. */
export const PROMPT = [
  PROMPT_SIGNATURE,
  'You review the FINAL message of one assistant turn. The hook input JSON is: $ARGUMENTS',
  '',
  'Rules, in order:',
  '1. You see either the first stop of a turn or the rewrite after a block: the gate judges a continued stop until its turn has had two blocks. Judge both the same way.',
  '2. Judge only the field last_assistant_message. Do not judge style, tone, completeness, language or code quality.',
  '3. Answer ok false ONLY in one of these three cases, and only when you can quote the exact sentence:',
  '   (a) The message presents a premise or claim as a constraint or as the reason for a decision (for example "your mandate says", "the config requires", "the docs say", "the agent reported", "tu mandato exige", "según la documentación"), and the message gives no evidence for it: no file path, file:line, URL, quotation of the source, or command with its output.',
  '   (b) The message carries out or accepts an instruction of the owner (the user) whose concrete architectural, security or performance downside is visible in the message itself, without naming that downside or a better path.',
  '   (c) The message states its own decision or recommendation and justifies it as the easier, faster, smaller or temporary option (for example "for now", "quick fix", "workaround", "simplest", "por ahora", "lo más rápido", "parche", "temporal") while the message itself names a better path it did not take, and gives no reason only the owner holds (credentials, permissions, business priority, an explicit owner order).',
  '4. In every other case, and whenever you are unsure, answer {"ok": true}. A claim the message marks as unverified passes ONLY when it cannot be measured this turn (another machine, the future, a third party\'s intent, a cost not yet incurred). Words of someone else inside quotation marks or code are not the assistant\'s premise.',
  '5. Answer with the JSON object only: {"ok": true}, or {"ok": false, "reason": "<reason>"}. The reason starts with the word PREMISE-JUDGE followed by a colon, then the case letter, the exact sentence in double quotes, and the fix: "verify it and cite the evidence, or name the downside and the better path, or take the better path; if it cannot be verified now, mark it UNVERIFIED instead of presenting it as a constraint".',
].join('\n');
