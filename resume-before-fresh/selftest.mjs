#!/usr/bin/env node
/**
 * Self-test for the resume-before-fresh guard.
 *
 * The fixture is CONSTRUCTED here — records built in this file, transcripts written into a temporary
 * directory, `now` passed in explicitly. It never reads the live harness store, because a self-test
 * whose fixture is live mutable state rots on its own and then reddens over a correct tree, which is
 * how a guard gets switched off (`guard-that-cannot-go-red`, fourth face).
 *
 * The state space this decision ranges over, and every one of them is exercised below:
 *   - the same errand, worded identically            -> REFUSE
 *   - the same errand, re-worded                     -> REFUSE  (the shape that actually occurs)
 *   - a terse errand contained in a verbose prior one -> REFUSE  (the asymmetry is deliberate)
 *   - genuinely different work                       -> PASS    (the case that decides survival)
 *   - shares a word or two but is not the errand     -> PASS    (the near miss)
 *   - a prior agent older than the window            -> PASS
 *   - a prior agent in a different project           -> PASS
 *   - a prior agent whose transcript is gone         -> PASS
 *   - an empty or one-word description               -> PASS
 *
 * The PASS cases outnumber the refusals on purpose: a guard that blocks legitimate delegation is
 * removed the same day, and that is the same end state as one that cannot fire.
 *
 * @es Fixture CONSTRUIDO aquí, nunca leído del store vivo: un self-test cuyo fixture es estado mutable
 * se pudre solo y luego enrojece sobre un árbol correcto, que es como se acaba desactivando un guard.
 * Los casos que PASAN superan a los que rechazan a propósito.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { worktreeName } from '../agent-liveness/liveness.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { EXHAUSTED_TRANSCRIPT_BYTES, exhaustedAgents, priorAgents, relatedLiveAgents, significantWords, canonicalWord, coverage, projectSlug, address, decide, evaluate, sessionOf } from './guard.mjs';

// The holder decision reads the agent lifecycle; a selftest never reads the live one.
// @es La decisión de titular lee el ciclo de vida de agentes; un selftest nunca lee el vivo.
isolateState('resume-before-fresh');

const NOW = Date.parse('2026-09-09T21:00:00Z');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * The checkout path carries a DOT inside the username and the store directory does not — that is the
 * real pairing on this machine, and it is the state that made the guard silent against live data
 * while every fixture case passed. Deriving the fixture's project name with `projectSlug` would hide
 * it again, so the store name is written out LITERALLY, exactly as the harness spells it on disk.
 * @es La ruta lleva un PUNTO en el usuario y el directorio del store no: ese es el par real en esta
 * máquina, y es el estado que dejó mudo al guard. El nombre del store se escribe LITERAL.
 */
const REPO = 'C:\\Users\\adrian.jimenez\\Desktop\\Projects\\b100-am-ui';
const SLUG = 'C--Users-adrian-jimenez-Desktop-Projects-b100-am-ui';

/**
 * The session the delegation is dispatched from, and another one of the same project. A subagent can be
 * resumed only from the session that spawned it, so a record of the OTHER session is never a candidate.
 * @es La sesión desde la que se despacha y otra del mismo proyecto. Un subagente solo se reanuda desde la
 * sesión que lo lanzó, así que un registro de la OTRA sesión nunca es candidato.
 */
const SESSION = 'c45d798b-d78f-4f60-9a32-1f722bbe86e5';
const OTHER_SESSION = '0b7e1d2a-5c3f-4e9a-8d61-aa00bb11cc22';

const scratch = mkdtempSync(join(tmpdir(), 'resume-before-fresh-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
const EXHAUSTED_TREE = join(scratch, 'agent-aa3437bf9bf7832a9');

mkdirSync(EXHAUSTED_TREE);

/**
 * The REAL last transcript record of aa3437bf9bf7832a9 (2026-09-30), extracted verbatim from its transcript
 * into `fixtures/`: the fixture is the measured record, not a reconstruction of its format.
 * @es El último registro REAL de aa3437bf9bf7832a9, extraído literal de su transcript.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const EXHAUSTED_RECORD = fixture('aa3437bf9bf7832a9.last-record.json');

/** The second measured context-length stop, aad6e241f1cc53532 (2026-09-30). @es La segunda parada medida. */
const SECOND_EXHAUSTED_RECORD = fixture('aad6e241f1cc53532.last-record.json');

/**
 * A REAL rate-limit stop (session 4acddc6a, 2026-07-19): the same synthetic shape, `error: "rate_limit"`.
 * Rate-limited agents were resumed by id successfully, so this one must stay resumable.
 * @es Una parada REAL por límite de tasa: misma forma sintética, `error: "rate_limit"`. Sigue reanudable.
 */
const RATE_LIMIT_RECORD = fixture('rate-limit-4acddc6a.record.json');

/**
 * Near misses built FROM the measured record, one field changed each: the same class with another message
 * (not context length), and the context-length message without the error flag (an agent quoting it).
 * @es Casi-aciertos construidos DESDE el registro medido, cambiando un solo campo cada uno.
 */
const OTHER_INVALID_REQUEST_RECORD = { ...EXHAUSTED_RECORD, message: { ...EXHAUSTED_RECORD.message, content: [{ type: 'text', text: 'Prompt is too long for the image attachment limit' }] } };
const QUOTED_TEXT_RECORD = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Prompt is too long' }] } };
const OTHER_CLASS_RECORD = { ...EXHAUSTED_RECORD, error: 'rate_limit' };
const { isApiErrorMessage: _dropped, ...UNFLAGGED_RECORD } = EXHAUSTED_RECORD;

/** A normal final answer, and a failure for another reason: both leave the agent resumable. @es Un final normal y otro fallo: ambos reanudables. */
const COMPLETED_RECORD = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Task complete. Commit 1a2b3c4 holds the change.' }] } };
const SERVER_ERROR_RECORD = { type: 'assistant', isApiErrorMessage: true, error: 'api_error', message: { model: '<synthetic>', content: [{ type: 'text', text: 'API Error: 500 {"type":"error","error":{"type":"api_error","message":"Internal server error"}}' }] } };

/** A constructed record whose transcript really exists on disk with a chosen age. */
function record({ id, description, project = SLUG, session = SESSION, ageMs = 5 * MINUTE, transcript = true, worktreePath = '', lastRecord = {}, sizeBytes = 0, brief = '' }) {
  // The harness layout, as `agentRecords` walks it: <store>/<project>/<session>/subagents/<id>.jsonl.
  // @es La disposición del harness tal como la recorre `agentRecords`.
  const folder = join(scratch, project, session, 'subagents');
  const path = join(folder, `${id}.jsonl`);

  mkdirSync(folder, { recursive: true });

  if (transcript) {
    // A padding line FIRST, so the last record stays at the tail where the guard reads it.
    // @es Una línea de relleno PRIMERO, para que el último registro siga al final, donde el guard lo lee.
    // `sizeBytes` is the EXACT size of the file, so the threshold edge can be built to the byte.
    // @es `sizeBytes` es el tamaño EXACTO del fichero, para construir el borde del umbral al byte.
    // The brief is the FIRST record of a transcript, where `briefOf` reads it.
    // @es El brief es el PRIMER registro del transcript, donde lo lee `briefOf`.
    const first = brief === '' ? '{}' : JSON.stringify({ type: 'user', message: { role: 'user', content: brief } });
    const body = `${first}\n${JSON.stringify(lastRecord)}\n`;
    const padding = sizeBytes > 0 ? `${JSON.stringify({ pad: 'x'.repeat(sizeBytes - body.length - '{"pad":""}\n'.length) })}\n` : '';

    writeFileSync(path, `${padding}${body}`);

    const seconds = (NOW - ageMs) / 1000;

    utimesSync(path, seconds, seconds);
  }

  // The SHAPE `agentRecords()` returns: `worktree` is the directory name of `worktreePath`, never blank beside it.
  // @es La FORMA que devuelve `agentRecords()`: `worktree` es el nombre de directorio de `worktreePath`.
  return { id, description, project, worktree: worktreeName(worktreePath), worktreePath, transcript: path };
}

const records = [
  record({ id: 'agent-a06941e5065917eda', description: 'Re-measure coverage floors' }),
  record({ id: 'agent-a153f28c32544646b', description: 'Close the accessibility gates on the table, the deck and the carousel' }),
  record({ id: 'agent-a85d7b7902015f8f6', description: 'Reopen tasks 89 127 129' }),
  record({ id: 'agent-aOLD00000000000', description: 'Rotate the registry credential', ageMs: 40 * HOUR }),
  record({ id: 'agent-aFOREIGN0000000', description: 'Re-measure coverage floors', project: 'C--other-project' }),
  record({ id: 'agent-aNOTRANSCRIPT0', description: 'Publish the release tarball', transcript: false }),
  // A worktree RECORDED and since REMOVED. The harness refuses to resume such an agent (measured
  // 2026-09-10), so offering it would refuse a delegation and point at a door that will not open.
  record({ id: 'agent-aREAPED000000', description: 'Apply the table store decomposition', worktreePath: join(scratch, 'gone-worktree') }),
  // A worktree RECORDED and still present: fully resumable, must still be offered.
  record({ id: 'agent-aLIVETREE00000', description: 'Regenerate the presentation deck artifacts', worktreePath: scratch }),
  // REAL CASE 2026-09-30 (a8534307c229206b6): a takeover of a DIFFERENT errand, sharing only dispatch words.
  record({ id: 'agent-a8534307c229206b6', description: 'Takeover of context-exhausted demo worker' }),
  // A same-object errand, for the takeover that IS the same work.
  record({ id: 'agent-aGALLERY000000', description: 'Rebuild the demo gallery screenshots' }),
  // REAL CASE 2026-09-30 (aa3437bf9bf7832a9): the transcript's last record, exactly as measured, and its
  // worktree still on disk.
  record({ id: 'agent-aa3437bf9bf7832a9', description: 'Gates: coverage-exclusion legitimacy + type-only assertion rule', lastRecord: EXHAUSTED_RECORD, worktreePath: EXHAUSTED_TREE }),
  record({ id: 'agent-aCOMPLETED00000', description: 'Refresh the visual regression baselines', lastRecord: COMPLETED_RECORD }),
  record({ id: 'agent-aSERVERERROR000', description: 'Trace the demo crawler timeout', lastRecord: SERVER_ERROR_RECORD }),
  // An API error that is NOT a context-length stop: rate-limited agents were resumed by id successfully.
  record({ id: 'agent-aRATELIMIT0000', description: 'Measure the storybook render budget', lastRecord: RATE_LIMIT_RECORD }),
  // REAL CASE 2026-09-30 (aad6e241f1cc53532): the second context-length stop, verbatim.
  record({ id: 'agent-aad6e241f1cc53532', description: 'Harness audit: assert real values and cover harnesses', lastRecord: SECOND_EXHAUSTED_RECORD }),
  record({ id: 'agent-aOTHERINVALID00', description: 'Compress the carousel hero imagery', lastRecord: OTHER_INVALID_REQUEST_RECORD }),
  record({ id: 'agent-aQUOTEDTEXT0000', description: 'Explain the tooltip positioning fallback', lastRecord: QUOTED_TEXT_RECORD }),
  record({ id: 'agent-aOTHERCLASS0000', description: 'Profile the datepicker overlay repaint', lastRecord: OTHER_CLASS_RECORD }),
  record({ id: 'agent-aUNFLAGGED00000', description: 'Document the stepper keyboard contract', lastRecord: UNFLAGGED_RECORD }),
  // SIBLINGS of one fan-out: the same verb and the same generic noun, each on its own object. The first
  // sibling's record exists when the second is dispatched, so each of these is the "prior" of its twin.
  // @es HERMANOS de un mismo reparto: mismo verbo y mismo sustantivo genérico, cada uno sobre su objeto.
  record({ id: 'agent-aPORTTABLE00000', description: 'Port the table component to signals' }),
  record({ id: 'agent-aMIGRATEUSERS00', description: 'Migrate users controller tests' }),
  record({ id: 'agent-aFIXCAROUSEL000', description: 'Fix failing carousel specs' }),
  // ANOTHER SESSION of the same project: stopped, recent, transcript on disk — and not resumable from here.
  // @es OTRA SESIÓN del mismo proyecto: parada, reciente, con transcript, y no reanudable desde aquí.
  record({ id: 'agent-aOTHERSESSION00', description: 'Compile the typography scale report', session: OTHER_SESSION }),
  record({ id: 'agent-aOTHERSESSDUP0', description: 'Re-measure coverage floors', session: OTHER_SESSION }),
  // TRANSCRIPT SIZE, ledger key resumed-giant-transcripts-exhausted-quota: past the threshold a resume is
  // never offered. The reported case was a 2,575,678-byte stopped agent; the near misses sit either side.
  // @es TAMAÑO DEL TRANSCRIPT: pasado el umbral nunca se ofrece un resume. Caso real: 2.575.678 bytes.
  record({ id: 'agent-aHUGE00000000000', description: 'Wire the tooling selftests ladder', sizeBytes: 2_500_000 }),
  record({ id: 'agent-aBELOW0000000000', description: 'Profile the sidebar scroll jank', sizeBytes: 1_900_000 }),
  record({ id: 'agent-aEDGE000000000000', description: 'Audit the toast stacking order', sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES }),
  record({ id: 'agent-aOVER0000000000', description: 'Reorder the legend swatch rows', sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES + 1 }),
  record({ id: 'agent-aPAIRHUGE0000000', description: 'Replace the pagination footer layout', sizeBytes: 2_500_000, ageMs: 1 * MINUTE }),
  record({ id: 'agent-aPAIRSMALL000000', description: 'Replace the pagination footer layout', ageMs: 10 * MINUTE }),
  record({ id: 'agent-aGONE0000000000', description: 'Rewrite the breadcrumb separator', transcript: false })
];

const cases = [
  // --- THE SAME ERRAND: refused.
  ['refuse', 'Re-measure coverage floors', 'REAL CASE: identical to a stopped agent'],
  ['refuse', 'Re-measure the coverage floors against the current develop tip', 'REAL CASE: same errand, re-worded — the shape that actually happens'],
  ['refuse', 'Close the accessibility gates', 'terse errand contained in a verbose prior one — the asymmetry'],
  ['refuse', 'Reopen tasks 89 127 129', 'REAL CASE: identical, digits carry the errand'],

  // --- LEGITIMATE NEW WORK: never touched. These decide whether the guard survives.
  ['pass', 'Extract the reorder state machine into its own controller', 'THE ONE THAT MATTERS — unrelated work must dispatch'],
  ['pass', 'Rebuild the storybook static output', 'unrelated'],
  ['pass', 'Measure the bundle size budget', 'shares the word "measure" only — the near miss'],
  ['pass', 'Close the release checklist', 'shares "close" only — the near miss on the other side'],
  ['pass', 'Rotate the registry credential', 'a matching prior agent exists but is older than the window'],
  ['pass', 'Publish the release tarball', 'a matching prior agent exists but has no transcript to resume'],
  ['pass', '', 'empty description'],
  ['pass', 'coverage', 'a single word is too little to judge'],
  ['pass', 'Audit', 'one short word'],

  // --- THE WORKTREE DIMENSION, added after a real resume was refused because the tree was gone.
  ['pass', 'Apply the table store decomposition', 'REAL CASE: errand matches but that agent is UNRESUMABLE — its worktree was removed'],
  ['refuse', 'Regenerate the presentation deck artifacts', 'errand matches and its worktree still exists, so it IS resumable'],
  ['refuse', 'Reopen tasks 89 127 129', 'a record with NO worktree ran in the main checkout and is resumable'],

  // --- DISPATCH VOCABULARY, added 2026-09-30 after two real false identities.
  ['pass', 'Takeover of exhausted coverage-exclusions worker', 'REAL CASE: shares only takeover/exhausted/worker with a different errand'],
  ['refuse', 'Takeover of the stalled demo gallery screenshots rebuild', 'a takeover of the SAME object still matches on the object'],
  ['refuse', 'Takeover of context-exhausted demo worker', 'REPLAY CASE: the identical label re-sent, one object word left, still the same errand'],
  ['pass', 'Takeover of the exhausted worker', 'a label of dispatch words only matches no DIFFERENT label'],

  // --- TERMINAL STATE, added 2026-09-30: an agent whose context ran out cannot be resumed.
  ['pass', 'Gates: coverage-exclusion legitimacy + type-only assertion rule', 'REAL CASE aa3437bf9bf7832a9: stopped on "Prompt is too long", so unresumable'],
  ['pass', 'Harness audit: assert real values and cover harnesses', 'REAL CASE aad6e241f1cc53532: the second measured context-length stop, unresumable'],
  ['refuse', 'Measure the storybook render budget', 'REAL rate-limit record (error "rate_limit"): resumable, still offered'],
  ['refuse', 'Compress the carousel hero imagery', 'NEAR MISS: class invalid_request with another message is not context length'],
  ['refuse', 'Explain the tooltip positioning fallback', 'NEAR MISS: the context-length text in a normal answer, no error flag'],
  ['refuse', 'Profile the datepicker overlay repaint', 'NEAR MISS: the measured record with another error class'],
  ['refuse', 'Document the stepper keyboard contract', 'NEAR MISS: the measured record without its API-error flag'],

  // --- SIBLINGS ARE NOT THE SAME ERRAND, added 2026-10-06. Two descriptions that each carry a word the
  // other lacks name two OBJECTS of the same verb; refusing the second sibling of a fan-out for the first
  // one's transcript is the false refusal that teaches people to switch the guard off. One errand is the
  // other PLUS qualifiers — that is a re-wording, and stays refused.
  // @es LOS HERMANOS NO SON EL MISMO ENCARGO. Dos descripciones que llevan cada una una palabra que falta
  // en la otra nombran dos OBJETOS del mismo verbo; un encargo que es el otro MÁS calificativos es un
  // reformulado y se sigue rechazando.
  ['pass', 'Port the dialog component to signals', 'FAN-OUT: same verb and noun as a stopped sibling, another object'],
  ['pass', 'Migrate orders controller tests', 'FAN-OUT: three of four words shared with a stopped sibling, another object'],
  ['pass', 'Verify carousel specs fix', 'another role on the same object: neither errand contains the other'],
  ['refuse', 'Port the table component to signals and add the stories', 'a re-wording: the stopped errand plus a qualifier'],
  ['refuse', 'Fix failing carousel specs on the hero slide', 'a re-wording: the stopped errand plus a qualifier'],

  // --- A SUBAGENT RESUMES ONLY FROM THE SESSION THAT SPAWNED IT, added 2026-10-06. Counting another
  // session's record is a guaranteed false refusal: its address does not open from here.
  // @es UN SUBAGENTE SOLO SE REANUDA DESDE LA SESIÓN QUE LO LANZÓ. Contar el registro de otra sesión es un
  // rechazo falso garantizado: su dirección no abre desde aquí.
  ['pass', 'Compile the typography scale report', 'the identical errand, but its agent belongs to ANOTHER session'],

  // --- NUMBERS ARE THE OBJECT, added 2026-10-06. «tasks 89 127 129» was a REAL errand whose only objects
  // are its numbers; they are shorter than any word the filter keeps, so two different batches read as
  // the same label.
  // @es LOS NÚMEROS SON EL OBJETO. «tasks 89 127 129» era un encargo REAL cuyos únicos objetos son sus
  // números, más cortos que cualquier palabra que el filtro conserva.
  ['pass', 'Reopen tasks 130 131', 'a different batch of numbers is a different errand'],
  ['pass', 'Reopen tasks 89 127 130', 'one different number is a different errand'],
  ['refuse', 'Reopen tasks 89 127 129 130', 'the same numbers plus one more is the same errand, extended'],
  ['refuse', 'Refresh the visual regression baselines', 'a normal completion: resumable, still offered'],
  ['refuse', 'Trace the demo crawler timeout', 'failed for ANOTHER reason (server error): resumable, still offered'],

  // --- TRANSCRIPT SIZE, added 2026-10-12 (reported by session b100-am-ui-15): the ledger says a transcript
  // past ~2 MB is not resumed, and the guard used to refuse the fresh launch anyway.
  // @es TAMAÑO DEL TRANSCRIPT: el ledger dice que no se reanuda un transcript de más de ~2 MB y el guard
  // rechazaba igualmente el lanzamiento fresco.
  ['pass', 'Wire the tooling selftests ladder', 'REAL CASE: a 2.5 MB stopped match is exhausted, never offered for resume'],
  ['refuse', 'Profile the sidebar scroll jank', 'a 1.9 MB stopped match is still resumable'],
  ['refuse', 'Audit the toast stacking order', 'a transcript of exactly the threshold (not past it) is still resumable'],
  ['pass', 'Reorder the legend swatch rows', 'one byte past the threshold is exhausted'],
  ['refuse', 'Replace the pagination footer layout', 'a huge match beside a small similar one: refused toward the small one'],
  ['pass', 'Rewrite the breadcrumb separator', 'the size cannot be read (no transcript): today behaviour, nothing to resume']
];

let failures = 0;
// Counted as each check reports, never written by hand: a hand total under-reported new checks.
let checked = 0;

for (const [expected, description, label] of cases) {
  const matches = priorAgents(description, REPO, records, NOW, SESSION);
  const actual = matches.length === 0 ? 'pass' : 'refuse';
  const ok = actual === expected;

  checked += 1; if (!ok) failures += 1;

  const named = matches.map((match) => address(match.id)).join(', ');

  console.log(`${ok ? 'PASS' : 'FAIL'}  expected=${expected} actual=${actual}  ${label}${named === '' ? '' : `  [${named}]`}`);
}

// --- THE OUTPUT for the context-exhausted state (owner priority, 2026-09-30): the replacement is ALLOWED,
//     the old agent is named UNRESUMABLE, and the brief is told to carry a TENANCY line for its worktree.
{
  const exhaustedOnly = decide('Gates: coverage-exclusion legitimacy + type-only assertion rule', '', REPO, records, NOW, SESSION);
  const context = exhaustedOnly?.hookSpecificOutput?.additionalContext ?? '';
  const checks = [
    [exhaustedOnly?.hookSpecificOutput?.permissionDecision === undefined && context.length > 0, 'the replacement of a context-exhausted agent is allowed, with advice'],
    [context.includes('UNRESUMABLE') && context.includes('aa3437bf9bf7832a9'), 'the advice names the old agent as unresumable'],
    [context.includes(EXHAUSTED_TREE) && context.includes('TENANCY:'), 'the advice names its worktree and asks for a TENANCY line'],
    [!context.includes('SendMessage'), 'the advice never prints a resume recipe that cannot work'],
    [context.includes(`  TENANCY: ${EXHAUSTED_TREE} — taking over`) && context.includes('context failure or oversized transcript') && context.includes(`@es   TENANCY: ${EXHAUSTED_TREE} — relevo`) && context.includes('irreanudable'), 'the closing TENANCY line names the worktree itself and both causes, in both languages'],
    [!context.includes('<that worktree folder>'), 'with a worktree to name, the template placeholder is not printed'],
    [decide('Measure the storybook render budget', '', REPO, records, NOW, SESSION)?.hookSpecificOutput?.permissionDecision === 'deny', 'a rate-limited agent still gets the resume-first refusal'],
    [decide('Extract the reorder state machine into its own controller', '', REPO, records, NOW, SESSION) === undefined, 'unrelated work gets no output at all']
  ];

  for (const [ok, label] of checks) {
    checked += 1; if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

// --- THE TAKEOVER ADVICE FOLLOWS THE SHARED HOLDER DECISION, added 2026-10-26 (P1-5). The advice to take a
//     worktree over is given only when `holderOf` reads its holder as unresumable — the state `orphan-work`
//     accepts a declared takeover for. An older exhausted agent does not make a worktree takeable when a
//     NEWER resumable agent, or another LIVE one, holds it: that advice would be refused.
// @es EL CONSEJO DE RELEVO SIGUE LA DECISIÓN COMPARTIDA DE TITULAR: solo se aconseja relevar un worktree si
//     `holderOf` lee su titular como irreanudable. Un agente agotado más viejo no lo hace relevable cuando lo
//     tiene un agente MÁS NUEVO reanudable, u otro VIVO.
{
  const newerTree = join(scratch, 'wt-newer-resumable');
  const liveTree = join(scratch, 'wt-live-other');

  mkdirSync(newerTree);
  mkdirSync(liveTree);

  const population = [
    record({ id: 'agent-aOLDEXHAUSTED00', description: 'Shard the chart legend renderer', lastRecord: EXHAUSTED_RECORD, worktreePath: newerTree, ageMs: 3 * HOUR }),
    // The newer holder is of THIS session: only then can it be resumed from here (another session's is unresumable).
    // @es El titular más nuevo es de ESTA sesión: solo así se reanuda desde aquí.
    record({ id: 'agent-aNEWERRESUME000', description: 'Unrelated follow-up wording here', worktreePath: newerTree, ageMs: 2 * HOUR }),
    record({ id: 'agent-aEXHAUSTEDLIVE0', description: 'Split the gauge needle animation', lastRecord: EXHAUSTED_RECORD, worktreePath: liveTree, ageMs: 3 * HOUR }),
    record({ id: 'agent-aLIVEOTHER00000', description: 'Another live errand entirely', worktreePath: liveTree, ageMs: 1 * MINUTE, session: OTHER_SESSION })
  ];
  const adviceFor = (description) => decide(description, '', REPO, population, NOW, SESSION)?.hookSpecificOutput?.additionalContext ?? '';
  const newer = adviceFor('Shard the chart legend renderer');
  const live = adviceFor('Split the gauge needle animation');
  const checks = [
    [newer.includes('aOLDEXHAUSTED00') && !newer.includes(`TENANCY: ${newerTree}`), 'a NEWER resumable holder: the worktree is not advised for takeover'],
    [newer.includes('NOT for takeover') && newer.includes('aNEWERRESUME000') && newer.includes('@es NO se releva'), 'and the advice says why, naming the newer holder, in both languages'],
    [newer.includes('TENANCY: <that worktree folder>'), 'with no worktree to advise, the template shape is printed'],
    [live.includes('aEXHAUSTEDLIVE0') && !live.includes(`TENANCY: ${liveTree}`) && live.includes('aLIVEOTHER00000'), 'another LIVE agent in the worktree: not advised for takeover, the live one named']
  ];

  for (const [ok, label] of checks) {
    checked += 1; if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

// --- RESUMABLE FROM HERE IS ONE ANSWER, added 2026-10-26: the resume window and the dispatching session joined
//     the shared per-record decision (`resumabilityOf`), so the refusal and the holder decision `orphan-work`
//     reads can never differ. A holder outside the window, or of another session, cannot be resumed from here:
//     it is never offered, and with a worktree its takeover is advised; without one it stays silent, as before.
//     An older agent of a worktree whose NEWER holder is another agent is not offered either.
// @es REANUDABLE DESDE AQUÍ ES UNA SOLA RESPUESTA: la ventana y la sesión que despacha entraron en la decisión
//     compartida. Un titular fuera de la ventana o de otra sesión nunca se ofrece; con worktree se aconseja
//     relevarlo, sin worktree calla, como antes. Tampoco se ofrece el agente viejo de un worktree cuyo titular
//     más nuevo es otro.
{
  const staleTree = join(scratch, 'wt-stale-holder');
  const foreignTree = join(scratch, 'wt-foreign-holder');
  const supersededTree = join(scratch, 'wt-superseded-holder');

  for (const tree of [staleTree, foreignTree, supersededTree]) mkdirSync(tree);

  const population = [
    record({ id: 'agent-aSTALEHOLDER000', description: 'Carve the minimap tile cache', worktreePath: staleTree, ageMs: 30 * HOUR }),
    record({ id: 'agent-aFOREIGNHOLDER0', description: 'Carve the radar sweep shader', worktreePath: foreignTree, session: OTHER_SESSION }),
    record({ id: 'agent-aSUPERSEDEDOLD0', description: 'Carve the compass rose glyphs', worktreePath: supersededTree, ageMs: 3 * HOUR }),
    record({ id: 'agent-aSUPERSEDEDNEW0', description: 'Different later wording here', worktreePath: supersededTree, ageMs: 2 * HOUR })
  ];
  const outcome = (description) => decide(description, '', REPO, population, NOW, SESSION);
  const context = (description) => outcome(description)?.hookSpecificOutput?.additionalContext ?? '';
  const stale = context('Carve the minimap tile cache');
  const foreign = context('Carve the radar sweep shader');
  const superseded = context('Carve the compass rose glyphs');
  const checks = [
    [outcome('Carve the minimap tile cache')?.hookSpecificOutput?.permissionDecision === undefined && stale.includes(`TENANCY: ${staleTree} — taking over`), 'a holder outside the resume window is never offered; its worktree is advised for takeover'],
    [stale.includes('outside the 24 h resume window') && stale.includes('fuera de la ventana de 24 h'), 'and the advice says it is outside the window, in both languages'],
    [outcome('Carve the radar sweep shader')?.hookSpecificOutput?.permissionDecision === undefined && foreign.includes(`TENANCY: ${foreignTree} — taking over`), 'a holder of ANOTHER session is never offered; its worktree is advised for takeover'],
    [foreign.includes(`belongs to session ${OTHER_SESSION}`) && foreign.includes('solo se reanuda desde la sesión que lo lanzó'), 'and the advice names its session, in both languages'],
    [outcome('Carve the compass rose glyphs')?.hookSpecificOutput?.permissionDecision === undefined && superseded.includes('a newer agent (aSUPERSEDEDNEW0, resumable) holds its worktree'), 'an older agent whose worktree a newer agent holds is not offered, and the advice says who holds it'],
    [!superseded.includes(`TENANCY: ${supersededTree}`) && superseded.includes('NOT for takeover'), 'and that worktree is not advised for takeover: its holder can be resumed'],
    [decide('Rotate the registry credential', '', REPO, records, NOW, SESSION) === undefined, 'a holder outside the window with NO worktree stays silent, as before'],
    [decide('Compile the typography scale report', '', REPO, records, NOW, SESSION) === undefined, 'a holder of another session with NO worktree stays silent, as before']
  ];

  for (const [ok, label] of checks) {
    checked += 1; if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

// --- THE OUTPUT for the oversized state: allowed, the rule printed bilingually, the old agent and its size named.
{
  const huge = decide('Wire the tooling selftests ladder', '', REPO, records, NOW, SESSION);
  const context = huge?.hookSpecificOutput?.additionalContext ?? '';
  const pair = decide('Replace the pagination footer layout', '', REPO, records, NOW, SESSION);
  const reason = pair?.hookSpecificOutput?.permissionDecisionReason ?? '';
  const checks = [
    [huge?.hookSpecificOutput?.permissionDecision === undefined && context.length > 0, 'the fresh launch beside an oversized match is allowed, with the rule'],
    [context.includes('aHUGE00000000000') && context.includes('2500'), 'the rule names the old agent and its size'],
    [context.includes('resumed-giant-transcripts-exhausted-quota') && context.includes('narrow scope') && context.includes('@es') && context.includes('alcance acotado'), 'the ledger rule is printed in English and in Spanish'],
    [!context.includes('SendMessage'), 'the oversized advice never prints a resume recipe'],
    [pair?.hookSpecificOutput?.permissionDecision === 'deny' && reason.includes('aPAIRSMALL000000') && !reason.includes('aPAIRHUGE0000000'), 'beside a small similar match the refusal points at the small one only'],
    [exhaustedAgents('Wire the tooling selftests ladder', REPO, records, NOW).every((match) => match.oversized && match.bytes > EXHAUSTED_TRANSCRIPT_BYTES), 'the exhausted match records that it is oversized and how large'],
    [EXHAUSTED_TRANSCRIPT_BYTES === 2_000_000, 'the threshold is the ledger 2 MB, 2,000,000 bytes']
  ];

  for (const [ok, label] of checks) {
    checked += 1; if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

// --- ERRAND IDENTITY BY WORKTREE, added 2026-10-12. When the new brief and the stopped agent both name a
//     linked worktree, the worktree decides the errand: the same one is the same errand whatever the words,
//     a different one is a different errand whatever the words. Either side naming none falls back to the
//     wording rule, unchanged.
// @es IDENTIDAD DE ENCARGO POR WORKTREE. Si el brief nuevo y el agente parado nombran un worktree enlazado,
//     decide el worktree; si algún lado no nombra ninguno, rige la regla de palabras, sin cambios.
{
  // A LINKED worktree has a .git FILE; a main checkout has a .git DIRECTORY and is shared by everyone.
  // @es Un worktree ENLAZADO tiene un FICHERO .git; un checkout principal tiene un DIRECTORIO .git.
  const tree = (name, linked = true) => {
    const dir = join(scratch, 'trees', name);

    mkdirSync(dir, { recursive: true });

    if (linked) writeFileSync(join(dir, '.git'), 'gitdir: elsewhere\n');
    else mkdirSync(join(dir, '.git'));

    return dir.split('\\').join('/');
  };
  const ALPHA = tree('wt-alpha');
  const BETA = tree('wt-beta');
  const GAMMA = tree('wt-gamma');
  // The same worktree NAME in capitals and in lower case, as two folders, so the case fold is observable on a
  // case-sensitive filesystem too: worktrees are compared by directory name (`worktreeName`), case folded.
  // @es El mismo NOMBRE de worktree en mayúsculas y en minúsculas, en dos carpetas, para que el plegado se vea
  // también en un sistema que distingue mayúsculas: se comparan por nombre de directorio, sin mayúsculas.
  const DELTA_UPPER = tree('upper/WT-DELTA');
  const DELTA_LOWER = tree('lower/wt-delta');
  const MAIN = tree('main-checkout', false);
  // Never created: a path that names no worktree on disk.
  // @es Nunca se crea: una ruta que no nombra ningún worktree en disco.
  const GHOST = join(BETA, '..', 'ghost').split(String.fromCharCode(92)).join('/');
  const brief = (path) => `MEASURED: none.\nROUTE: direct\n\nTENANCY: you write ONLY inside ${path} and your private scratch.\n\nGOAL: do the thing.`;
  const population = [
    record({ id: 'agent-aTENALPHA000000', description: 'Alpha migrate sidebar tokens', brief: brief(ALPHA) }),
    record({ id: 'agent-aTENBETA0000000', description: 'Rework dashboard grid spacing', worktreePath: BETA }),
    record({ id: 'agent-aTENPLAIN000000', description: 'Compile the icon sprite', brief: 'MEASURED: none.\nGOAL: compile.' }),
    record({ id: 'agent-aTENMAIN0000000', description: 'Tune the legend marker weights', brief: brief(MAIN) }),
    record({ id: 'agent-aTENHARNESS0000', description: 'Polish the toolbar overflow menu', worktreePath: BETA, brief: brief(ALPHA), ageMs: 6 * MINUTE }),
    record({ id: 'agent-aTENGHOST0000000', description: 'Polish the icon gutter', brief: brief(GHOST) }),
    // An oversized agent: unresumable, so it never refuses, but a fresh launch into ITS worktree is told so.
    // @es Un agente sobredimensionado: irreanudable, no rechaza, pero un lanzamiento fresco en SU worktree se entera.
    record({ id: 'agent-aTENDELTA000000', description: 'Delta tune the chip ripple', worktreePath: DELTA_UPPER }),
    record({ id: 'agent-aTENHUGE00000000', description: 'Zzz quux bar baz', worktreePath: GAMMA, sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES + 1000 })
  ];
  const names = (description, prompt) => priorAgents(description, REPO, population, NOW, SESSION, prompt).map((match) => address(match.id)).sort();
  const decisions = [
    [['aTENALPHA000000'], names('', brief(ALPHA)), 'an empty description still matches by the worktree it names'],
    [[], names('Unrelated phrase three', brief(GHOST)), 'a path that is not a worktree on disk is no identity: the wording rule decides, and the words differ'],
    [['aTENALPHA000000'], names('Completely different words entirely', brief(ALPHA)), 'the SAME worktree is the same errand whatever the words'],
    // Capitals name the same folder only where the filesystem folds case (Windows); on POSIX an upper-cased
    // path is another, absent, folder, so only the separators change there.
    // @es Las mayúsculas nombran la misma carpeta solo donde el sistema pliega mayúsculas (Windows); en POSIX
    // una ruta en mayúsculas es otra carpeta, inexistente, así que allí solo cambian los separadores.
    [['aTENALPHA000000'], names('Completely different words entirely', brief((process.platform === 'win32' ? ALPHA.toUpperCase() : ALPHA).split('/').join('\\'))), 'the same worktree written with backslashes (and capitals, on Windows) is still the same'],
    [['aTENDELTA000000'], names('Unrelated phrase four', brief(DELTA_LOWER)), 'a worktree recorded in capitals is the same name named in lower case'],
    [[], names('Alpha migrate sidebar tokens', brief(GAMMA)), 'a DIFFERENT worktree is a different errand even with identical words'],
    [['aTENPLAIN000000'], names('Compile the icon sprite', brief(GAMMA)), 'a stopped agent that names no worktree falls back to wording'],
    [['aTENALPHA000000'], names('Alpha migrate sidebar tokens', 'GOAL: no tenancy line here.'), 'a new brief that names no worktree falls back to wording'],
    [[], names('Something else altogether', 'GOAL: no tenancy line here.'), 'no worktree and no wording overlap: nothing'],
    [['aTENBETA0000000'], names('Unrelated phrase one', brief(BETA)), 'a harness-recorded worktree is an identity too, and wins over the brief of the same agent; only its LATEST holder is offered'],
    [['aTENALPHA000000'], names('Unrelated phrase five', brief(ALPHA)), 'the older agent of BETA claims ALPHA only in its brief: the harness worktree wins, so it is not ALPHA\'s errand'],
    [[], names('Unrelated phrase two', brief(MAIN)), 'a main checkout (.git directory) is shared by everyone: never an identity, so the wording rule decides and nothing here overlaps the words'],
  ];

  const refusal = decide('Completely different words entirely', brief(ALPHA), REPO, population, NOW, SESSION);
  const advice = decide('Completely different words entirely', brief(GAMMA), REPO, population, NOW, SESSION);
  const viaDecide = [
    [refusal?.hookSpecificOutput?.permissionDecision === 'deny' && refusal.hookSpecificOutput.permissionDecisionReason.includes('aTENALPHA000000'), 'decide refuses by the worktree the prompt names'],
    [advice?.hookSpecificOutput?.permissionDecision === undefined && (advice?.hookSpecificOutput?.additionalContext ?? '').includes('aTENHUGE00000000'), 'a fresh launch into the worktree of an oversized agent is allowed and told about it']
  ];

  for (const [ok, label] of viaDecide) {
    checked += 1; if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }

  for (const [expected, actual, label] of decisions) {
    const ok = expected.join() === actual.join();

    checked += 1; if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  expected=[${expected.join()}] actual=[${actual.join()}]  ${label}`);
  }
}

// --- The foreign-project record must never be reachable from this repo, whatever the wording.
{
  const matches = priorAgents('Re-measure coverage floors', REPO, records, NOW, SESSION);
  const leaked = matches.some((match) => match.id === 'agent-aFOREIGN0000000');
  const ok = !leaked;

  checked += 1; if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  a record from another project is never offered as a candidate`);
}

// --- The session of a record is read from where the harness put its transcript, and the refusal names
//     only agents of the dispatching session, even when another session holds the same errand.
{
  const own = records.find((entry) => entry.id === 'agent-a06941e5065917eda');
  const other = records.find((entry) => entry.id === 'agent-aOTHERSESSDUP0');
  const named = priorAgents('Re-measure coverage floors', REPO, records, NOW, SESSION).map((match) => match.id);
  const checks = [
    [sessionOf(own) === SESSION && sessionOf(other) === OTHER_SESSION, 'the session is the folder above subagents/ in the transcript path'],
    [named.includes('agent-a06941e5065917eda') && !named.includes('agent-aOTHERSESSDUP0'), 'the same errand held by two sessions names only the dispatching one'],
    [priorAgents('Re-measure coverage floors', REPO, records, NOW, OTHER_SESSION).map((match) => match.id).join() === 'agent-aOTHERSESSDUP0', 'seen from the other session, only its own agent is named'],
    [priorAgents('Re-measure coverage floors', REPO, records, NOW, undefined).length === 0, 'a delegation with no session id has no candidate: fail open'],
    [priorAgents('Re-measure coverage floors', REPO, records, NOW, '').length === 0, 'an empty session id has no candidate: fail open'],
    [decide('Re-measure coverage floors', '', REPO, records, NOW, undefined) === undefined, 'decide allows a delegation with no session id'],
    [decide('Re-measure coverage floors', '', REPO, records, NOW, SESSION)?.hookSpecificOutput?.permissionDecision === 'deny', 'and refuses the same delegation once the session id names the owner']
  ];

  // The same decision through the hook entry point: the payload's own `session_id` is what scopes it.
  // @es La misma decisión por el punto de entrada del hook: el `session_id` del propio payload la acota.
  const call = (session) => evaluate(JSON.stringify({ session_id: session, tool_name: 'Agent', tool_input: { description: 'Re-measure coverage floors', prompt: '' } }), { records, now: NOW });

  process.env.CLAUDE_PROJECT_DIR = REPO;
  checks.push(
    [call(SESSION)?.hookSpecificOutput?.permissionDecision === 'deny', 'evaluate refuses for the session that owns the agent'],
    [call(undefined) === undefined, 'evaluate allows a payload with no session_id'],
    [call('ffffffff-0000-4000-8000-000000000000') === undefined, 'evaluate allows a session that owns no agent of the errand']
  );

  for (const [ok, label] of checks) {
    checked += 1; if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

// --- The address is what SendMessage accepts, not the record file name. Getting this wrong is the
//     whole reason a resume looked impossible, so it is asserted rather than assumed.
{
  const ok = address('agent-a06941e5065917eda') === 'a06941e5065917eda' && address('a06941e5065917eda') === 'a06941e5065917eda';

  checked += 1; if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  the agent- prefix is stripped to give the address SendMessage accepts`);
}

// --- Word extraction and coverage, asserted directly so a silent emptying cannot hide behind a
//     decision that happens to come out right.
{
  const words = significantWords('Re-measure the coverage floors!');
  // `floors` is stored as its canonical `floor` since plural folding landed.
  const ok = words.has('measure') && words.has('coverage') && words.has('floor') && !words.has('floors') && !words.has('the');

  checked += 1; if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  significant words drop noise and punctuation  [${[...words].join(' ')}]`);
}

{
  const words = significantWords('Reopen tasks 89 127 129 in v2 to a1');
  // Numbers are kept at any length; a short word and a short mixed token are not.
  const ok = words.has('89') && words.has('127') && words.has('129') && words.has('reopen') && !words.has('v2') && !words.has('a1') && !words.has('to') && !words.has('in');

  checked += 1; if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  numbers are errand words at any length, short words and mixed tokens are not  [${[...words].join(' ')}]`);
}

{
  const { shared, ratio } = coverage(significantWords('close accessibility gates'), significantWords('close the accessibility gates on the table'));
  const ok = shared === 3 && ratio === 1;

  checked += 1; if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  a contained errand scores full coverage  [shared=${shared} ratio=${ratio}]`);
}

// --- Vocabulary folding, added after "a11y" and "accessibility" read as unrelated words (2026-09-14).
{
  const ok =
    canonicalWord('a11y') === 'accessibility' &&
    canonicalWord('i18n') === 'internationalization' &&
    canonicalWord('gates') === 'gate' &&
    canonicalWord('class') === 'class' &&
    canonicalWord('bus') === 'bus';

  checked += 1; if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  numeronyms expand, long plurals fold, "class" and short words are left alone`);
}

// --- The ADVISORY path. Its state space: worktree alive / removed / never recorded, and a brief that
//     does / does not contain the prior errand. The real case is first and is quoted from the incident.
{
  const liveTree = mkdtempSync(join(tmpdir(), 'resume-before-fresh-live-'));
  // Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
  // también ante una excepción: un selftest no deja nada tras de sí.
  process.once('exit', () => rmSync(liveTree, { recursive: true, force: true }));
  const accessibility = record({ id: 'agent-a153f28c32544646b', description: 'Close the accessibility gates', ageMs: 87 * HOUR, worktreePath: liveTree });
  const reaped = record({ id: 'agent-aREAPEDA11Y0000', description: 'Close the accessibility gates', ageMs: 87 * HOUR, worktreePath: join(scratch, 'gone') });
  const mainCheckout = record({ id: 'agent-aMAINA11Y00000', description: 'Close the accessibility gates', ageMs: 87 * HOUR });

  const realDescription = 'Fix the 18 failing check:a11y suites at root';
  const realPrompt = 'Close `check:a11y` to exit 0 by fixing every failing suite at its ROOT. The gate dies before testing a story; accessibility incompletes remain.';
  const unrelatedPrompt = 'Measure the per-entry bundle size through the packed consumer build and report the budget.';

  const advisoryCases = [
    ['advise', [accessibility], realDescription, realPrompt, 'REAL CASE: 87h old, worktree alive, whole errand inside the brief'],
    ['silent', [accessibility], 'Measure the bundle budget', unrelatedPrompt, 'worktree alive but the brief is about something else'],
    ['silent', [reaped], realDescription, realPrompt, 'errand inside the brief but the worktree was removed — unresumable'],
    ['silent', [mainCheckout], realDescription, realPrompt, 'no recorded worktree: liveness unknowable, left to the recency-bounded refusal']
  ];

  for (const [expected, population, description, prompt, label] of advisoryCases) {
    const related = relatedLiveAgents(description, prompt, REPO, population);
    const actual = related.length === 0 ? 'silent' : 'advise';
    const ok = actual === expected;

    checked += 1; if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  expected=${expected} actual=${actual}  ${label}`);
  }

  // The real case must advise WITHOUT refusing: description overlap is 1 word, so a refusal here would
  // mean the thresholds drifted and legitimate work is being blocked.
  const refused = priorAgents(realDescription, REPO, [accessibility], NOW, SESSION).length > 0;

  checked += 1;
  if (refused) failures += 1;

  console.log(`${refused ? 'FAIL' : 'PASS'}  the real case is advised, never refused`);
}

const total = checked;

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
