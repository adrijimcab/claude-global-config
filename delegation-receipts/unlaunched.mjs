/**
 * The decision: of the delegations this turn reached for, which ones never got launched.
 *
 * WHAT THIS OWNS. A ledger over the turn's attempts, and nothing else — no files, no transcript, no
 * hook. A refusal opens a DEBT; a later successful delegation, or an explicitly recorded abandonment,
 * PAYS one. Whatever is still owed when the turn ends is what the guard refuses over.
 *
 * WHY A LEDGER AND NOT A MATCH. The obvious design pairs a refusal to its retry by comparing what they
 * say — description against description, brief against brief. That is an identity guard over natural
 * language, and this fleet has already measured what it costs: an identity guard comparing five-word
 * descriptions could not see that `a11y` and `accessibility` are the same errand, and let a duplicate
 * launch through. So pairing here is by COUNT and ORDER, which are facts, and the refusal says so
 * plainly rather than implying it knows which attempt the retry belonged to.
 *
 * WHY THE NEWEST DEBT IS PAID FIRST. A retry follows its own refusal almost immediately — measured in
 * this session's transcript: `RESUME-BEFORE-FRESH` refused at 13:02:54 and the `SendMessage` that
 * answered it succeeded at 13:03:17, 23 seconds later. So a success most plausibly answers the refusal
 * it most recently follows, and what is left named is the OLDER one. That matches the hazard's real
 * shape: you re-issue what you just watched fail, and the one you forget is the one further back.
 *
 * ORDER IS PART OF THE CHECK. A success BEFORE a refusal cannot be its retry, and an abandonment
 * recorded before a refusal cannot excuse it. Both are settled by timestamp, for the same reason the
 * engram-persistence guard reads only the transcript written since its last satisfaction: a stale
 * receipt that can cover new work is not a receipt. Calls of ONE model message were all issued before
 * any result came back, so a success never pays a refusal from its own batch, whichever is listed first.
 *
 * @es La decisión: de las delegaciones que el turno intentó, cuáles no llegaron a lanzarse. Un rechazo
 * abre una DEUDA; un lanzamiento posterior, o un abandono registrado, PAGA una. Se empareja por CUENTA
 * y ORDEN, no por contenido: comparar descripciones es un guard de identidad sobre lenguaje natural, y
 * ya medimos que no distingue `a11y` de `accessibility`. Se paga la deuda MÁS RECIENTE primero porque
 * un reintento sigue a su propio rechazo casi al instante (medido: 23 segundos). El ORDEN cuenta: un
 * éxito anterior al rechazo no puede ser su reintento, ni uno del mismo mensaje del modelo (mismo lote).
 */

/** Milliseconds for a timestamp, or `undefined` when it cannot be read as one. @es Milisegundos de una marca de tiempo. */
function instant(value) {
  if (typeof value !== 'string') return undefined;

  const at = Date.parse(value);

  return Number.isNaN(at) ? undefined : at;
}

/**
 * Pays the newest debt `launch` can answer. Calls that share one model message (`batch`) were all issued
 * before any result came back, so a launch never pays a refusal from its own batch, in either order; it
 * pays only one from an EARLIER batch. An attempt with no known batch is paid by order alone.
 * @es Paga la deuda más reciente que `launch` puede responder. Las llamadas de un mismo mensaje del modelo
 * salieron todas antes de cualquier resultado: un lanzamiento nunca paga un rechazo de su propio lote, en
 * ningún orden; solo uno de un lote ANTERIOR. Sin lote conocido, decide solo el orden.
 */
function payNewestFromEarlierBatch(owed, launch) {
  const debt = owed.findLastIndex((refused) => refused.batch === undefined || refused.batch !== launch.batch);

  if (debt !== -1) owed.splice(debt, 1);
}

/**
 * The attempts still unaccounted for when the turn ends, oldest first.
 *
 * @param attempts Delegation attempts in the order made, each `{ tool, label, at, outcome }` where
 *   `outcome` is `refused`, `launched` or `unknown`.
 * @param abandonments Recorded abandonments for this session, each `{ at, reason }`.
 * @es Los intentos que siguen sin responder al terminar el turno, del más antiguo al más reciente.
 */
export function unlaunchedDelegations(attempts, abandonments = []) {
  const owed = [];

  // An attempt whose result never arrived matches NEITHER branch: it says nothing either way, so it
  // neither opens a debt nor pays one. Reading it as a payment would let an interrupted call excuse a
  // real refusal. @es Un intento sin resultado no encaja en ninguna rama: ni abre deuda ni la paga.
  for (const attempt of attempts) {
    if (attempt.outcome === 'refused') owed.push(attempt);
    else if (attempt.outcome === 'launched') payNewestFromEarlierBatch(owed, attempt);
  }

  const recorded = [...abandonments].sort((left, right) => (instant(left.at) ?? 0) - (instant(right.at) ?? 0));

  for (const abandonment of recorded) {
    const at = instant(abandonment.at);

    if (at === undefined) continue;

    // Newest debt first, and only one the abandonment could actually be about: an abandonment written
    // before a refusal happened cannot be that refusal's answer.
    // @es La deuda más reciente que el abandono pudiera cubrir; nunca una posterior a él.
    const index = owed.findLastIndex((attempt) => {
      const refusedAt = instant(attempt.at);

      return refusedAt === undefined || refusedAt <= at;
    });

    if (index !== -1) owed.splice(index, 1);
  }

  return owed;
}
