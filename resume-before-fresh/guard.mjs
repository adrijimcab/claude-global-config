#!/usr/bin/env node
/**
 * `PreToolUse` guard on delegation — refuses to spawn a FRESH agent for work a recent agent already
 * has a transcript for, and hands over the exact call that resumes it instead.
 *
 * WHAT HAPPENED, measured 2026-09-09. Five agents died together on a session rate limit. The owner
 * said «relanza los agentes», twice. I ran `ListAgents`, read back "No reachable agents — no other
 * Claude session is running on this machine", and told the owner the five were unrecoverable and that
 * relaunching meant dispatching fresh ones. The owner refused the answer — «es imposible que no
 * estén» — and was right. `ListAgents` enumerates SESSIONS and live peers; it does not enumerate this
 * session's own STOPPED subagents. Addressing each by its raw `agentId` resumed it from its own
 * transcript on the first try, five times out of five.
 *
 * THE ROOT CAUSE, and it is not "I forgot the other tool". It is `bounded-search-read-as-absence`
 * wearing its worst clothes: the store that held the answer was one this repository had already built
 * code against. `../agent-liveness/liveness.mjs` walks the harness records under
 * `~/.claude/projects/<project>/<session>/subagents/` — 431 of them, every single one carrying a
 * `description` — and the answer still came from a different tool's silence. A negative carries no
 * trace of its own coverage, so "ListAgents lists nobody" and "nobody exists" read identically on the
 * page, and the owner plans from the second reading.
 *
 * WHY A GUARD AND NOT A LINE IN A CONTRACT. The rule already existed as text: this project's own
 * memory carries `feedback-resume-agents-before-fresh`, written after an earlier occurrence. Text did
 * not stop it. Under the owner's stop-the-line directive, closing an incident requires a mechanism
 * that makes the repeat impossible — and the moment it becomes expensive is the DISPATCH, because
 * that is where a live transcript gets abandoned and its work paid for twice.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not decide whether resuming is WISE. It decides whether a
 * candidate EXISTS, and makes it impossible not to have seen one. It is bounded to this project and
 * to a recency window, because beyond that the trunk has moved underneath the transcript and a fresh
 * agent really is the right call — a guard that reddens over correct work is worse than one that
 * cannot fire, since the first teaches people to switch it off.
 *
 * FAILS OPEN on every malfunction of its own: a guard able to wedge delegation is a larger hazard
 * than the one it closes.
 *
 * @es Guard de `PreToolUse` sobre delegación: rechaza lanzar un agente FRESCO para un encargo del que
 * un agente reciente ya tiene transcript, y entrega la llamada exacta que lo reanuda. Causa raíz: una
 * búsqueda acotada leída como ausencia — `ListAgents` enumera SESIONES, no los subagentes PARADOS de
 * esta sesión, y el store que sí tenía la respuesta es el mismo contra el que este repo ya había
 * escrito código. No decide si reanudar es sensato: decide si EXISTE un candidato, y hace imposible
 * no haberlo visto. Acotado a este proyecto y a una ventana de recencia, porque más allá el tronco se
 * ha movido bajo el transcript y un agente fresco sí es lo correcto.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { EXHAUSTED_TRANSCRIPT_BYTES, SIZE_RULE_LEDGER_KEY, exhaustionOf, holderOf, takeoverDeclaration } from '../agent-liveness/holder.mjs';
import { readLifecycle } from '../agent-liveness/lifecycle-log.mjs';
import { agentRecords } from '../agent-liveness/liveness.mjs';
import { advise, deny, hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { declaredWorktrees, recordWorktrees, sameErrand } from './worktree-identity.mjs';

const DELEGATION_TOOLS = new Set(['Agent', 'Task']);

/**
 * How recent a stopped agent must be for resuming it to beat starting over. Beyond this the trunk has
 * moved, the measurements inside its transcript have expired, and a fresh agent is the honest choice.
 * @es Cuán reciente debe ser un agente parado para que reanudarlo gane a empezar de cero.
 */
export const RESUMABLE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The exhaustion classification (context-length stop, transcript past the ledger size) lives in the shared
 * holder decision, `../agent-liveness/holder.mjs`, so this guard and `orphan-work` read ONE answer to "can
 * the agent that holds this worktree continue". Re-exported for the callers that read them from here.
 * @es La clasificación de agotamiento vive en la decisión compartida de titular, `holder.mjs`, para que este
 * guard y `orphan-work` lean UNA sola respuesta. Se reexporta para quien la lee desde aquí.
 */
export { CONTEXT_EXHAUSTED_ERROR_CLASS, CONTEXT_EXHAUSTED_TEXT, EXHAUSTED_TRANSCRIPT_BYTES, stoppedOnContextLength } from '../agent-liveness/holder.mjs';

/**
 * Share of the SMALLER errand's identifying words that must appear in the other before this refuses: all
 * of them. "The same errand, phrased differently" means one description is the other plus qualifiers;
 * the moment EACH side carries a word the other lacks, they name two objects of one verb — the siblings
 * of a fan-out («Port the table component» / «Port the dialog component»), or a verifier beside the
 * writer — and refusing the second for the first's transcript is the false refusal that gets a guard
 * switched off. This was 0.6, which let three shared words of four through; no real re-wording measured
 * here ever needed less than containment, because a re-dispatch ADDS words, it does not swap them.
 * @es Proporción de las palabras identificativas del encargo MENOR que deben aparecer en el otro para
 * rechazar: todas. «El mismo encargo, con otras palabras» es una descripción que es la otra más
 * calificativos; en cuanto CADA lado lleva una palabra que falta en el otro, nombran dos objetos del mismo
 * verbo (los hermanos de un reparto, un verificador junto al escritor) y rechazar al segundo por el
 * transcript del primero es el rechazo falso que acaba apagando un guard. Era 0.6; un re-despacho AÑADE
 * palabras, no las cambia.
 */
export const OVERLAP_THRESHOLD = 1;

/**
 * Words that carry no errand. Kept deliberately short: every entry here is a word this guard becomes
 * blind to, and a long list is how a discriminator quietly stops discriminating.
 * @es Palabras que no llevan encargo. Deliberadamente corta: cada entrada es una palabra a la que este
 * guard se vuelve ciego.
 */
const NOISE = new Set([
  'that', 'this', 'with', 'from', 'into', 'over', 'their', 'there', 'these', 'those', 'about',
  'again', 'after', 'before', 'work', 'task', 'make', 'made', 'does', 'done', 'have', 'been',
  'will', 'would', 'should', 'could', 'also', 'just', 'only', 'them', 'then', 'than', 'when', 'what'
]);

/**
 * DISPATCH vocabulary: words that describe how an errand is being handed out — a takeover, a resume, a
 * worker, a context that ran out — never what the errand is ABOUT. They are removed from BOTH sides before
 * two errands are compared, so identity rests on the domain object.
 *
 * MEASURED 2026-09-30 (the coordinator, live): «Takeover of exhausted coverage-exclusions worker» was
 * refused as the errand of «Takeover of context-exhausted demo worker» — a different errand in a
 * different worktree. The only overlap was takeover / exhausted / worker: 3 of 5 words, exactly the 0.6
 * threshold. Unlike `NOISE`, this does not make the guard blind to anything an errand can be: a real
 * errand still carries its object («coverage exclusions», «demo»), and two takeovers of the SAME object
 * still match on that object.
 * @es Vocabulario de DESPACHO: palabras que dicen cómo se reparte un encargo (relevo, reanudar, worker,
 * contexto agotado), nunca de qué trata. Se quitan de AMBOS lados antes de comparar. Medido el 2026-09-30:
 * dos relevos de encargos distintos coincidían solo en takeover/exhausted/worker, justo el umbral.
 */
export const DISPATCH_VOCABULARY = new Set([
  'takeover', 'resume', 'resumed', 'resuming', 'relaunch', 'relaunched', 'restart', 'retry', 'continue',
  'continuation', 'fresh', 'replacement', 'worker', 'agent', 'subagent', 'exhausted', 'context', 'stalled'
]);

/**
 * The words that identify an errand: its significant words minus the dispatch vocabulary.
 * @es Las palabras que identifican un encargo: las significativas menos el vocabulario de despacho.
 */
export function errandWords(text) {
  return new Set([...significantWords(text)].filter((word) => !DISPATCH_VOCABULARY.has(word)));
}

/**
 * Numeronyms this repository writes interchangeably with the word they abbreviate. Measured
 * 2026-09-14: a fresh "Fix the 18 failing check:a11y suites at root" went out while
 * "Close the accessibility gates" — the same domain, its worktree alive, its transcript holding 32
 * analyses of the very rules — sat resumable, because `a11y` and `accessibility` share no characters a
 * word comparison can see. This is vocabulary folding, not an allowlist: each entry makes the guard SEE
 * more, never less, and it is limited to spellings that are the same word by definition.
 * @es Numerónimos que este repo escribe indistintamente con la palabra que abrevian. `a11y` y
 * `accessibility` no comparten nada que una comparación de palabras vea. Cada entrada hace que el guard
 * VEA más, nunca menos.
 */
const NUMERONYMS = new Map([
  ['a11y', 'accessibility'],
  ['i18n', 'internationalization'],
  ['l10n', 'localization']
]);

/**
 * One spelling per word: numeronyms expanded, and a trailing plural `s` dropped from words long enough
 * that the drop cannot collide (`gates` and `gate` are the same errand; `bus` stays `bus`). Deliberately
 * NOT a stemmer — a stemmer folds unrelated words together, and a guard that refuses real work is
 * switched off the same day.
 * @es Una grafía por palabra: numerónimos expandidos y la `s` de plural quitada solo en palabras largas.
 * NO es un stemmer: un stemmer junta palabras distintas y un guard que rechaza trabajo real se apaga.
 */
export function canonicalWord(word) {
  const expanded = NUMERONYMS.get(word) ?? word;
  const isPlural = expanded.length >= 5 && expanded.endsWith('s') && !expanded.endsWith('ss');

  return isPlural ? expanded.slice(0, -1) : expanded;
}

/** The shortest word that can carry an errand; a number carries one at any length. @es La palabra más corta que puede llevar un encargo; un número lo lleva con cualquier longitud. */
const MIN_WORD_LENGTH = 4;

/**
 * Whether a token is a number, which is an OBJECT however short: «Reopen tasks 89 127 129» names its
 * errand by its numbers alone, and a length filter that drops them makes every batch of «Reopen tasks»
 * the same label.
 * @es Si un token es un número, que es un OBJETO por corto que sea: «Reopen tasks 89 127 129» nombra su
 * encargo solo con los números, y un filtro de longitud que los quita hace que todo lote sea la misma etiqueta.
 */
const isNumber = (token) => token.length > 0 && [...token].every((character) => character >= '0' && character <= '9');

/**
 * The words a description is actually ABOUT. Split on anything that is not a letter or a digit — never
 * a regex (M5): a regex that fails to match SKIPS silently, and a guard whose scan quietly empties is
 * the exact defect this whole family of guards exists to close.
 * @es Las palabras de las que trata de verdad una descripción. Sin regex (M5): una regex que no casa
 * SALTA en silencio, y un guard cuyo escaneo se vacía sin avisar es justo el defecto que se cierra.
 */
export function significantWords(text) {
  const words = new Set();
  let current = '';

  // The noise and length filter judges the word AS WRITTEN; folding only changes how a kept word is
  // spelled. Folding first made `tasks` into the noise word `task` and silently emptied a real errand
  // ("Reopen tasks 89 127 129") — the self-test caught it the moment folding landed.
  // @es El filtro juzga la palabra TAL CUAL se escribió; plegar solo cambia la grafía de una palabra
  // conservada. Plegar antes convertía `tasks` en la palabra de ruido `task` y vaciaba un encargo real.
  const flush = () => {
    if ((current.length >= MIN_WORD_LENGTH || isNumber(current)) && !NOISE.has(current)) words.add(canonicalWord(current));

    current = '';
  };

  for (const character of String(text).toLowerCase()) {
    const isWordCharacter =
      (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9');

    if (isWordCharacter) current += character;
    else flush();
  }

  flush();

  return words;
}

/**
 * How far one errand is contained in the other, measured in BOTH directions and reported as the
 * stronger containment.
 *
 * The first version of this measured one direction only — "is the NEW errand contained in an older
 * one" — reasoning that a terse new description must not be diluted by a verbose old one. Its own
 * self-test refuted it on the case that actually occurs. Re-dispatching real work is almost never
 * done in the same words: it is done in MORE words, because the author adds what they learned since.
 * "Re-measure coverage floors" against a prior "Re-measure coverage floors" scores 1.0, but
 * "Re-measure the coverage floors against the current develop tip" scores 0.5 — the same errand,
 * waved through by the qualifiers that make it more precise.
 *
 * Both containments answer the same question from opposite ends, so the decision takes the maximum:
 * the elaborated errand is caught because the OLD one is wholly inside it, and the terse errand is
 * caught because the NEW one is wholly inside the old. Unrelated work is contained in neither
 * direction and stays well under the threshold — measured on this repository's real descriptions, the
 * nearest false candidate reaches 0.33.
 *
 * @es Contención medida en AMBAS direcciones, decidiendo por la mayor. La primera versión medía solo
 * una y su propio self-test la refutó en el caso que de verdad ocurre: un encargo se re-despacha casi
 * nunca con las mismas palabras, sino con MÁS, porque el autor añade lo aprendido — y esos
 * calificativos diluían el ratio hasta dejarlo pasar.
 */
export function coverage(candidate, prior) {
  if (candidate.size === 0 || prior.size === 0) return { shared: 0, ratio: 0 };

  let shared = 0;

  for (const word of candidate) if (prior.has(word)) shared += 1;

  return { shared, ratio: Math.max(shared / candidate.size, shared / prior.size) };
}

/**
 * A project key that a checkout path and a harness store directory both reduce to.
 *
 * NOT the harness's own slug function, and deliberately so. The first version of this WAS that
 * function, reconstructed by eye: colon and both separators to a dash. It computed
 * `C--Users-adrian.jimenez-...` while the store on disk says `C--Users-adrian-jimenez-...` — the
 * harness dashes the DOT in a username too. Result: zero records matched, the guard went silent
 * against live data with its self-test at 17 of 17 green, and it would have shipped as a control that
 * cannot fire. A reconstructed mapping is a borrowed probe, and it is wrong in exactly the character
 * nobody thinks to test.
 *
 * So neither side is trusted to be canonical: BOTH are reduced by the same rule — lowercase, every
 * character outside `a-z0-9` becomes a dash — and the reduction is idempotent on an already-dashed
 * slug. That holds whatever else the harness decides to dash, which is the property that matters,
 * because this code does not own that decision and will not be told when it changes.
 *
 * @es NO es la función de slug del harness, a propósito. La primera versión SÍ lo era, reconstruida a
 * ojo, y fallaba en el PUNTO del nombre de usuario: cero registros casaban, el guard se quedó mudo
 * contra datos reales con su self-test en 17 de 17. Una función reconstruida es una sonda prestada, y
 * se equivoca justo en el carácter que nadie prueba. Se reducen AMBOS lados con la misma regla, que
 * además es idempotente sobre un slug ya guionizado.
 */
export function projectSlug(repoPath) {
  let key = '';

  for (const character of String(repoPath).toLowerCase()) {
    const isKeyCharacter =
      (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9');

    key += isKeyCharacter ? character : '-';
  }

  return key;
}

/** Whether two labels carry exactly the same significant words. @es Si dos etiquetas llevan exactamente las mismas palabras. */
function sameLabel(left, right) {
  return left.size > 0 && left.size === right.size && [...left].every((word) => right.has(word));
}

/**
 * Recent agents in THIS project whose errand already covers the one about to be dispatched, newest
 * first. Every match is returned rather than only the best one, because naming a single candidate
 * hides the rest and the author then makes the same trip again for the next of them.
 * @es Agentes recientes de ESTE proyecto cuyo encargo ya cubre el que se va a despachar, del más
 * reciente al más antiguo. Se devuelven TODOS: nombrar solo uno esconde los demás.
 */
function matchingAgents(description, repoPath, records, now, prompt = '') {
  const wanted = errandWords(description);
  const label = significantWords(description);
  const wantedTrees = declaredWorktrees(prompt);
  // Overlap needs two shared object words — refusing on a single word would be noise. An IDENTICAL label
  // is judged anyway: measured in the migration replay, «Takeover of context-exhausted demo worker» re-sent
  // verbatim keeps one object word once dispatch words go, and would otherwise pass unseen.
  // @es El solapamiento exige dos palabras de objeto; una etiqueta IDÉNTICA se juzga igual (medido en el replay).
  if (label.size === 0 && wantedTrees.size === 0) return [];

  const slug = projectSlug(repoPath);
  const matches = [];

  for (const record of records) {
    // BOTH sides go through the same reduction. Comparing a raw store directory name against a
    // reduced checkout path is what made this guard silent on live data: the names differ by the
    // characters the harness dashes and this code does not.
    // @es AMBOS lados pasan por la misma reducción: comparar el nombre crudo del store contra una
    // ruta reducida es lo que dejó mudo a este guard con datos reales.
    if (projectSlug(record.project) !== slug) continue;
    if (record.description === '') continue;

    const { shared, ratio } = coverage(wanted, errandWords(record.description));
    const overlaps = shared >= 2 && ratio >= OVERLAP_THRESHOLD;
    const wordingMatches = overlaps || sameLabel(label, significantWords(record.description));

    // A worktree that was spawned and then REMOVED makes its agent unresumable: the harness refuses
    // with "its worktree no longer exists, and the fallback directory is not covered by the session's
    // isolation fences". Measured 2026-09-10 on a real resume attempt. Offering it as a candidate is
    // worse than useless — it refuses a delegation and points at a door that will not open, which is
    // how a control gets routed around. The branch and transcript survive, so the work is not lost;
    // it simply cannot be continued in place.
    // @es Un worktree creado y luego ELIMINADO deja a su agente irreanudable: el harness lo rechaza.
    // Ofrecerlo como candidato es peor que inútil — rechaza una delegación y señala una puerta que no
    // abre, que es como se acaba esquivando un control. La rama y el transcript sobreviven.
    // NOTE the shape of this test. An agent with NO recorded worktree ran in the main checkout and is
    // perfectly resumable, so only a RECORDED path that has since vanished disqualifies a candidate.
    // Written as a positive check on a present string rather than as `!== ''`, because a record whose
    // field is absent yields `undefined`, and `undefined !== ''` is true — that is the first face of
    // `guard-that-cannot-go-red`, a filter on a field that does not exist, and it emptied four of this
    // guard's own self-test cases the moment it was introduced.
    // @es Un agente SIN worktree registrado corrió en el checkout principal y es perfectamente
    // reanudable: solo descalifica una ruta REGISTRADA que ya no existe. Escrito como comprobación
    // positiva sobre una cadena presente y no como `!== ''`, porque un campo ausente da `undefined` y
    // `undefined !== ''` es cierto — la primera cara de `guard-that-cannot-go-red`.
    const recordedWorktree = typeof record.worktreePath === 'string' ? record.worktreePath : '';

    if (recordedWorktree.length > 0 && !existsSync(recordedWorktree)) continue;

    let lastWrite;
    let bytes;

    try {
      // One stat answers both questions, so a transcript whose size cannot be read is also one whose age
      // cannot: it is skipped, exactly as before.
      // @es Un solo stat responde a ambas preguntas: un transcript cuyo tamaño no se lee tampoco tiene edad
      // legible, y se salta igual que antes.
      const stats = statSync(record.transcript);

      lastWrite = stats.mtimeMs;
      bytes = stats.size;
    } catch {
      continue; // no transcript is nothing to resume
    }

    if (now - lastWrite > RESUMABLE_WINDOW_MS) continue;

    // The worktree the two dispatches NAME decides the errand when both name one: the same worktree is the
    // same errand whatever the wording, a different one is a different errand whatever the wording. Only
    // when either side names no linked worktree does the wording rule above decide, unchanged.
    // @es El worktree que NOMBRAN los dos despachos decide el encargo cuando ambos lo nombran: el mismo
    // worktree es el mismo encargo con cualquier redacción, otro distinto es otro encargo. Solo si algún
    // lado no nombra un worktree enlazado decide la regla de palabras de arriba, sin cambios.
    const identity = wantedTrees.size === 0 ? 'unknown' : sameErrand(wantedTrees, recordWorktrees(record));

    if (identity === 'different' || (identity === 'unknown' && !wordingMatches)) continue;

    // Exhausted: either the context ran out (a resume replays the transcript that was already too long) or the
    // transcript passed the ledger size (a resume pays that whole history again). Either way the agent is
    // UNRESUMABLE. It is still returned — marked — because the author must be told where its worktree is.
    // @es Agotado: o se acabó el contexto (un resume reproduce el transcript ya demasiado largo) o el
    // transcript pasó el tamaño del ledger (un resume paga de nuevo todo ese historial). En ambos casos NO se
    // puede reanudar. Se devuelve marcado, porque al autor hay que decirle dónde está su worktree.
    const { oversized, exhausted } = exhaustionOf(record.transcript, bytes);

    matches.push({ id: record.id, description: record.description, lastWrite, ratio, worktreePath: recordedWorktree, bytes, oversized, exhausted });
  }

  return matches.sort((left, right) => right.lastWrite - left.lastWrite);
}

/**
 * The session that spawned an agent, read from where the harness put its transcript:
 * `<store>/<project>/<session>/subagents/<id>.jsonl`. Derived here from the record's own `transcript`
 * rather than added to the shared liveness record, which is byte-pinned from the reference fleet.
 * @es La sesión que lanzó a un agente, leída de dónde el harness puso su transcript. Se deriva aquí del
 * `transcript` del propio registro y no se añade al registro compartido de liveness, que está fijado por
 * hash desde la flota de referencia.
 */
export function sessionOf(record) {
  return path.basename(path.dirname(path.dirname(record.transcript)));
}

/**
 * Recent agents of the DISPATCHING SESSION that already hold the errand AND can be resumed — the ones a
 * fresh delegation is refused over. A subagent can be resumed (SendMessage to its id) only from the
 * session that spawned it, so a record of another session is never a candidate: counting it is a
 * guaranteed false refusal that points at a door that will not open. With no session id there is no
 * candidate, because the guard cannot tell whose door it would be pointing at.
 * @es Agentes recientes de la SESIÓN que despacha que ya tienen el encargo Y se pueden reanudar: por
 * ellos se rechaza. Un subagente solo se reanuda desde la sesión que lo lanzó, así que el registro de otra
 * sesión nunca es candidato: contarlo es un rechazo falso garantizado. Sin id de sesión no hay candidato.
 */
export function priorAgents(description, repoPath, records = agentRecords(), now = Date.now(), session = undefined, prompt = '') {
  // An absent or empty session matches no record: the fail-open case needs no branch of its own.
  // @es Una sesión ausente o vacía no casa con ningún registro: el caso de fallo abierto no necesita rama.
  const own = records.filter((record) => sessionOf(record) === session);

  return matchingAgents(description, repoPath, own, now, prompt).filter((match) => !match.exhausted);
}

/**
 * Recent agents that hold the errand but stopped on a context-length failure: never a refusal, since
 * their resume cannot work, but always named, so the fresh replacement inherits their worktree.
 * @es Agentes que tienen el encargo pero pararon por longitud de contexto: nunca rechazan, siempre se nombran.
 */
export function exhaustedAgents(description, repoPath, records = agentRecords(), now = Date.now(), prompt = '') {
  return matchingAgents(description, repoPath, records, now, prompt).filter((match) => match.exhausted);
}

/**
 * Agents of ANY age whose worktree is still on disk and whose whole errand appears inside the new
 * brief — surfaced to the author, never refused.
 *
 * Why this exists beside `priorAgents`, measured 2026-09-14. The refusal compares description with
 * description inside a 24-hour window, and the real miss failed both: "Close the accessibility gates"
 * was 87 hours old, and its three words appear in neither the wording nor the length of "Fix the 18
 * failing check:a11y suites at root". Yet all three sat inside the BRIEF of that fresh agent, which
 * said "close `check:a11y`", "the gate", "accessibility" throughout. The brief is where an author spells
 * out the errand; the description is a five-word label.
 *
 * Why it only ADVISES. Containment inside a long brief is a weaker identity signal than description
 * overlap — a brief mentions many things — so refusing on it would block legitimate work, and a guard
 * that blocks legitimate work gets removed the same day. The question it answers is narrower and never
 * wrong to ask: "a live worktree already holds work on this; did you look?". A recorded worktree that
 * still EXISTS is what makes age irrelevant — the context is on disk, whatever the clock says. A record
 * with no recorded worktree ran in the main checkout, and its liveness cannot be judged from here, so it
 * is left to the recency-bounded refusal.
 * @es Agentes de CUALQUIER edad con worktree aún en disco cuyo encargo entero aparece dentro del brief
 * nuevo: se AVISA, nunca se rechaza. La descripción es una etiqueta de cinco palabras; el brief es
 * donde el autor escribe el encargo. Rechazar por contención en un brief largo bloquearía trabajo
 * legítimo, así que solo pregunta «ya hay un worktree vivo con esto; ¿lo miraste?».
 */
export function relatedLiveAgents(description, prompt, repoPath, records = agentRecords()) {
  const brief = errandWords(`${description} ${prompt}`);
  const slug = projectSlug(repoPath);
  const related = [];

  for (const record of records) {
    if (projectSlug(record.project) !== slug || record.description === '') continue;

    const worktree = typeof record.worktreePath === 'string' ? record.worktreePath : '';

    if (worktree.length === 0 || !existsSync(worktree) || !existsSync(record.transcript)) continue;

    const errand = errandWords(record.description);

    if (errand.size < 2) continue; // a one-word label is contained in everything

    const { shared } = coverage(errand, brief);

    if (shared === errand.size) related.push({ id: record.id, description: record.description, worktree });
  }

  return related;
}

function advisory(related) {
  const lines = [
    'RESUME-BEFORE-FRESH — NOT refused, but read this before the agent you just launched goes far:',
    'a worktree that still exists already holds an agent whose whole errand appears inside this brief.',
    ''
  ];

  for (const agent of related) lines.push(`  ${address(agent.id)}  —  "${agent.description}"  (${agent.worktree})`);

  lines.push(
    '',
    'If it is the same work, stop the fresh agent and resume that one by its id: its transcript holds',
    'what it already measured. If it is different work, carry on — this is advice, not a refusal.'
  );

  return lines.join('\n');
}

/**
 * The raw address `SendMessage` accepts. The harness names its record file with an `agent-` prefix
 * that the address does not carry, and getting that wrong is what makes a resume look impossible.
 * @es La dirección cruda que acepta `SendMessage`: el fichero lleva un prefijo que la dirección no.
 */
export function address(id) {
  return id.startsWith('agent-') ? id.slice('agent-'.length) : id;
}

function reason(description, matches, now) {
  const lines = [
    'RESUME-BEFORE-FRESH REFUSED this delegation: a recent agent already holds this errand.',
    '',
    `  you asked for : ${description}`,
    '',
    'ALREADY HAS A TRANSCRIPT:'
  ];

  for (const match of matches)
    lines.push(
      `  ${address(match.id)}  —  "${match.description}"`,
      `    last wrote ${Math.round((now - match.lastWrite) / 60000)} min ago`
    );

  lines.push(
    '',
    'RESUME IT INSTEAD — this is the exact call, and the id IS the address:',
    '',
    `  SendMessage({ to: "${address(matches[0].id)}", message: "Resume: <what changed since you stopped>" })`,
    '',
    'A STOPPED AGENT IS NOT GONE. On 2026-09-09 five agents died together on a session rate limit and',
    'the owner was told they were unrecoverable, because ListAgents reported nobody. ListAgents',
    'enumerates SESSIONS and live peers — it does not enumerate this session’s stopped subagents.',
    'Addressing each by its raw agentId resumed it from its own transcript, five out of five.',
    '',
    'A fresh agent starts blind: it re-derives what the stopped one already measured, and the stopped',
    'one’s worktree may still hold uncommitted work that the fresh one will never look at.',
    '',
    'If this genuinely IS different work, say so in the description. The refusal is keyed on the words',
    'of the errand, so a description naming what is new about it will pass.'
  );

  return lines.join('\n');
}

/**
 * La salida de hook para un payload crudo, o `undefined`. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso; ejecutada directamente, la
 * misma función corre como hook propio (`main`, abajo). `records` y `now` se inyectan solo en el selftest.
 */
export function evaluate(raw, { records = undefined, now = Date.now(), lifecycle = undefined } = {}) {
  // The port tolerates the UTF-8 BOM a PowerShell writer adds; an unreadable payload fails open.
  // @es El puerto tolera el BOM de UTF-8 que añade PowerShell; un payload ilegible falla abierto.
  const payload = tryParsePayload(raw);

  if (!DELEGATION_TOOLS.has(payload?.tool_name)) return;

  try {
    const repoPath = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

    // A payload with no `session_id` reaches `decide` as `undefined`, which has no candidate to refuse over:
    // it fails open, like every other malfunction of this guard.
    // @es Un payload sin `session_id` llega a `decide` como `undefined`, que no tiene candidato por el que
    // rechazar: falla abierto, como cualquier otro fallo de este guard.
    return decide(payload?.tool_input?.description ?? '', payload?.tool_input?.prompt ?? '', repoPath, records ?? agentRecords(), now, payload?.session_id, lifecycle ?? readLifecycle());
  } catch {
    return; // fail open
  }
}

/**
 * The hook output for one delegation, as a pure function of the records and the clock:
 *   - a RESUMABLE agent holds the errand       -> refuse, with the resume call;
 *   - only CONTEXT-EXHAUSTED agents hold it    -> allow, naming them unresumable and their worktree;
 *   - a live worktree's errand is in the brief -> allow, with advice;
 *   - otherwise                                -> nothing.
 * @es La salida para una delegación, función pura de los registros y el reloj: reanudable -> rechaza;
 * solo agotados -> permite nombrándolos irreanudables; worktree vivo -> aviso; si no, nada.
 */
export function decide(description, prompt, repoPath, records, now, session = undefined, lifecycle = readLifecycle()) {
  const resumable = priorAgents(description, repoPath, records, now, session, prompt);

  if (resumable.length > 0) {
    return deny(reason(description, resumable, now));
  }

  const advice = [unresumableNotice(exhaustedAgents(description, repoPath, records, now, prompt), { records, now, lifecycle }), relatedNotice(relatedLiveAgents(description, prompt, repoPath, records))].filter((text) => text !== undefined);

  return advice.length === 0 ? undefined : advise(advice.join('\n\n'));
}

/**
 * The ledger rule, in both languages, naming each oversized agent and its size.
 * @es La regla del ledger, en ambos idiomas, nombrando a cada agente sobredimensionado y su tamaño.
 */
function sizeRule(oversized) {
  return [
    '',
    `LEDGER RULE (${SIZE_RULE_LEDGER_KEY}): once a worker's transcript passes ~${EXHAUSTED_TRANSCRIPT_BYTES / 1e6} MB, do not resume it:`,
    'launch a fresh agent with a narrow scope that reads the state from the files.',
    `@es REGLA DEL LEDGER (${SIZE_RULE_LEDGER_KEY}): pasados ~${EXHAUSTED_TRANSCRIPT_BYTES / 1e6} MB el transcript de un worker no se reanuda:`,
    '@es se lanza un agente fresco con alcance acotado que lee el estado de los ficheros.',
    ...oversized.map((agent) => `  ${address(agent.id)}: ${(agent.bytes / 1e6).toFixed(2)} MB (${agent.bytes} bytes) > ${EXHAUSTED_TRANSCRIPT_BYTES} bytes`)
  ];
}

/**
 * Whether the replacement of `agent` may be told to take its worktree over: only when the shared holder
 * decision (`holderOf`) agrees the worktree's holder is unresumable — the very state `orphan-work` accepts a
 * declared takeover for. A worktree read as `live` counts as long as the live owner IS that same agent (its
 * last write is still inside the window, or nothing recorded its stop); a worktree another agent is working
 * in, or whose newer holder can be resumed, is NOT advised for takeover: that advice would be refused.
 * @es Si al reemplazo de `agent` se le puede decir que tome su worktree: solo cuando la decisión compartida
 * de titular (`holderOf`) dice que su titular es irreanudable, el mismo estado en que `orphan-work` acepta un
 * relevo declarado. Un worktree `live` cuenta solo si el dueño vivo ES ese mismo agente; uno en el que
 * trabaja otro agente, o cuyo titular más reciente se puede reanudar, NO se aconseja: ese consejo se rechazaría.
 */
function takeoverOf(agent, holderContext) {
  if (agent.worktreePath === '') return { advised: false };

  const holder = holderOf(agent.worktreePath, holderContext);
  const advised = holder.state === 'unresumable' || (holder.state === 'live' && holder.agentId === agent.id);

  return { advised, holder };
}

/** How one unresumable agent is named, with what its worktree allows. @es Cómo se nombra a un agente irreanudable y qué permite su worktree. */
function namedAgent(agent, takeover) {
  const head = `  ${address(agent.id)}  —  "${agent.description}"`;

  if (agent.worktreePath === '') return `${head}  (ran in the main checkout)`;
  if (takeover.advised) return `${head}\n    worktree: ${agent.worktreePath}`;

  return [
    `${head}\n    worktree: ${agent.worktreePath}`,
    `    NOT for takeover: ${takeover.holder.reason}`,
    '    @es NO se releva: la decisión de titular de ese worktree no es «irreanudable».'
  ].join('\n');
}

/** The advice for errand holders whose context ran out, or `undefined`. @es El aviso para quienes agotaron el contexto. */
function unresumableNotice(exhausted, holderContext) {
  if (exhausted.length === 0) return undefined;

  const oversized = exhausted.filter((agent) => agent.oversized);
  const takeovers = exhausted.map((agent) => ({ agent, takeover: takeoverOf(agent, holderContext) }));
  const advised = [...new Set(takeovers.filter(({ takeover }) => takeover.advised).map(({ agent }) => agent.worktreePath))];
  // The line is written for each worktree a takeover is advised for, in the one format `orphan-work` accepts;
  // with none, the template shows its shape. @es La línea se escribe por cada worktree que se aconseja relevar,
  // en el único formato que acepta `orphan-work`; sin ninguno, la plantilla muestra su forma.
  const lines = advised.length === 0 ? [takeoverDeclaration('<that worktree folder>')] : advised.map((worktree) => takeoverDeclaration(worktree));

  return [
    'RESUME-BEFORE-FRESH — NOT refused: the agent(s) that hold this errand are UNRESUMABLE.',
    'Each stopped on a context-length failure ("Prompt is too long") or holds a transcript past the ledger',
    'size, and a resume replays that same oversized transcript, so a fresh replacement is the right dispatch.',
    '@es Ninguno se puede reanudar: pararon por longitud de contexto o su transcript pasa el tamaño del ledger.',
    '',
    ...takeovers.map(({ agent, takeover }) => namedAgent(agent, takeover)),
    ...(oversized.length === 0 ? [] : sizeRule(oversized)),
    '',
    'Its worktree may hold uncommitted or unlanded work. Give the replacement a line naming it, e.g.:',
    ...lines.map((line) => `  ${line.en}`),
    '@es Su worktree puede tener trabajo sin commitear o sin aterrizar; dale al reemplazo una línea que lo nombre:',
    ...lines.map((line) => `@es   ${line.es}`)
  ].join('\n');
}

/** The advice for live worktrees whose errand is in the brief, or `undefined`. @es El aviso de worktrees vivos, o `undefined`. */
const relatedNotice = (related) => (related.length === 0 ? undefined : advisory(related));

// Only as the main process: when the dispatcher or a selftest imports this module, `main` must not read their stdin.
// @es Solo como proceso principal: si el dispatcher o un selftest importan este módulo, `main` no debe leer su stdin.
runWhenMain(import.meta.url, hookMain(evaluate));
