/**
 * The pending judge: the rubric of the third Stop judge of `../judge-gate/`, the one source the selftest compares
 * the wiring against.
 *
 * WHY. Owner directive (`rules/00-owner-mandates.md`, «Backlog maestro — todo hallazgo entra en el momento»): a
 * finding, a defect, a debt or a decision left for later is recorded in the turn it appears. Whether a message
 * LEAVES something for later, and whether a record already covers it, is a question of intent that a word list
 * cannot answer (five rounds of lexical refinements each opened a new edge; judgment-day escalated on
 * 2026-10-19). So `../backlog-guard/markers.mjs` only PREFILTERS, broadly, and this rubric decides, on a model
 * call that happens only when a marker was found and the turn saved nothing.
 *
 * CONTRACT. Same as `../voice-judge/prompt.mjs`: the hook input replaces `$ARGUMENTS`, the answer is
 * `{"ok": true}` or `{"ok": false, "reason": "..."}`, and a block's reason starts with `MARKER`, which
 * `../premise-judge/journal-guard.mjs` journals under the `pending-judge` mechanism. The gate appends the fixed
 * instructions to record or dismiss (`appendix.mjs`), so the rubric never asks the model for a rewrite phrase. The
 * rubric spells the marker in words, never literally.
 *
 * @es El juez de pendientes: la rúbrica del tercer juez de Stop de `../judge-gate/`. POR QUÉ: un hallazgo, defecto,
 * deuda o decisión que se deja para después se registra en el turno en que aparece; si un mensaje lo deja, y si un
 * registro ya lo cubre, es una pregunta de intención que una lista de palabras no responde. Los marcadores solo
 * PREFILTRAN, con amplitud, y esta rúbrica decide, en una llamada al modelo que ocurre solo si hubo marcador y el
 * turno no guardó nada. La compuerta añade las instrucciones fijas de registrar o descartar, así que la rúbrica
 * nunca pide una frase de reescritura.
 */

/** The marker every block reason starts with. @es La marca con que empieza todo motivo de bloqueo. */
export const MARKER = 'PENDING-JUDGE:';

/** The first line of the rubric. @es La primera línea de la rúbrica. */
export const PROMPT_SIGNATURE = 'pending-judge rubric v2.';

/** The timeout of the hook, in seconds. @es El timeout del hook, en segundos. */
export const TIMEOUT_SECONDS = 30;

/** The rubric. `$ARGUMENTS` is its only `$`. @es La rúbrica. `$ARGUMENTS` es su único `$`. */
export const PROMPT = [
  PROMPT_SIGNATURE,
  'You review the FINAL message of one assistant turn for one question only: does it announce a pending item that is NOT recorded in a durable store? The hook input JSON is: $ARGUMENTS',
  '',
  'Definitions:',
  '- A pending item is a finding, a defect, a debt, a decision or a task that the message PARKS: it is left for later, nobody is doing it right now, and the message does not say it is finished.',
  '- Work in flight is NOT parked, so it is not pending: a worker or a run that is still going, a landing underway, a wait for a report, and the next step of the current plan ("cuando termine el worker, lo verifico y lo integro", "sigo esperando el reporte", "apenas aterrice, lo pruebo", "once it lands I will check it").',
  '- An ITEM deferred past that wait is still parked: a finding, a defect, a debt or a decision that the message puts off until a worker, a landing or a report finishes is pending unless its record is cited ("cuando termine el worker miro el bug del retry", "after the landing I will look at the flaky test").',
  '- A durable store is engram, a backlog record, a feature document or a commit. A message RECORDS an item only when it names the record OF THAT ITEM: the master backlog save or revision that holds it, the engram id of its own record (such as #1234), or the feature-document entry for it (such as odd/tasks/x.md T3). A commit hash, a path or an engram topic counts only when it is that record; a hash or a path of other work records nothing.',
  '',
  'Rules, in order:',
  '1. Judge only the field last_assistant_message. Never judge earlier messages or anything you could read through transcript_path. The input may be a first stop or the rewrite after a block (stop_hook_active true); judge both the same way. Judge every message the same way, whoever it is addressed to.',
  '2. Answer {"ok": true} when the message leaves nothing for later: it says nothing is pending (a plain negation: "no queda nada pendiente", "no hay hallazgos nuevos", "nothing is left", "no new findings"), it reports finished work, it reports work in flight and the next steps of the current plan, it states a measurement ("queda por debajo de 200 ms", "the latency stays under 200 ms"), it only names or quotes the rule about backlogs, or it only offers or asks ("si querés lo agrego al backlog", "want me to add it?").',
  '3. Answer {"ok": true} when every item it leaves for later is recorded: the sentence or its neighbours name the record of that item ("queda pendiente la decisión del dueño, está en #1234", "pending: the retry bug, saved in odd/tasks/x.md T4"). A plain statement that this very item is already in the master backlog counts too ("ya estaba en el backlog", "it is already in the backlog"). A record of other work does not count: "Queda pendiente el bug del retry; el arreglo del parser está en a1b2c3d." cites nothing for the retry bug.',
  '4. Answer {"ok": false} when the message leaves an item for later and cites no record of it. These are pending: "Encontré un defecto en el parser, lo veo después.", "Queda por revisar el matcher.", "Lo sumo al backlog cuando cierre la tanda.", "I found a defect in the parser; I will fix it later.", "Left pending: the retry bug.", "Cuando termine el worker miro el bug del retry.".',
  '5. «todavía no», «aún no» and «not yet» followed by a deferral are pending, not a negation of pending: "No lo anoto todavía en el backlog.", "Todavía no lo guardé.", "Not yet recorded: the retry bug." all say the item exists and is unrecorded, so answer {"ok": false}. A negation that only says nothing is pending is not: "todavía no hay nada pendiente" passes.',
  '6. Judge the meaning of the sentence, not its words. An item the message says it is doing in this very message, or finished, is not left for later. When unsure whether something is left for later, answer {"ok": true}; when it plainly is left for later, answer {"ok": false} unless a citation covers it.',
  '7. Never set the field impossible. Never ask for a rewrite or suggest a phrase to say.',
  '8. Answer with the JSON object only: {"ok": true}, or {"ok": false, "reason": "<reason>"}. The reason starts with the word PENDING-JUDGE followed by a colon, then names the item in the message\'s own words (quote the sentence) and says no record of it is cited.',
].join('\n');
