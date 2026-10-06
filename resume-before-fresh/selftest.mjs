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

import { priorAgents, relatedLiveAgents, significantWords, canonicalWord, coverage, projectSlug, address, decide } from './guard.mjs';

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

const scratch = mkdtempSync(join(tmpdir(), 'resume-before-fresh-'));
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
function record({ id, description, project = SLUG, ageMs = 5 * MINUTE, transcript = true, worktreePath = '', lastRecord = {} }) {
  const path = join(scratch, `${id}.jsonl`);

  if (transcript) {
    writeFileSync(path, `{}\n${JSON.stringify(lastRecord)}\n`);

    const seconds = (NOW - ageMs) / 1000;

    utimesSync(path, seconds, seconds);
  }

  return { id, description, project, worktree: '', worktreePath, transcript: path };
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
  record({ id: 'agent-aFIXCAROUSEL000', description: 'Fix failing carousel specs' })
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

  // --- NUMBERS ARE THE OBJECT, added 2026-10-06. «tasks 89 127 129» was a REAL errand whose only objects
  // are its numbers; they are shorter than any word the filter keeps, so two different batches read as
  // the same label.
  // @es LOS NÚMEROS SON EL OBJETO. «tasks 89 127 129» era un encargo REAL cuyos únicos objetos son sus
  // números, más cortos que cualquier palabra que el filtro conserva.
  ['pass', 'Reopen tasks 130 131', 'a different batch of numbers is a different errand'],
  ['pass', 'Reopen tasks 89 127 130', 'one different number is a different errand'],
  ['refuse', 'Reopen tasks 89 127 129 130', 'the same numbers plus one more is the same errand, extended'],
  ['refuse', 'Refresh the visual regression baselines', 'a normal completion: resumable, still offered'],
  ['refuse', 'Trace the demo crawler timeout', 'failed for ANOTHER reason (server error): resumable, still offered']
];

let failures = 0;
// Counted as each check reports, never written by hand: a hand total under-reported new checks.
let checked = 0;

for (const [expected, description, label] of cases) {
  const matches = priorAgents(description, REPO, records, NOW);
  const actual = matches.length === 0 ? 'pass' : 'refuse';
  const ok = actual === expected;

  checked += 1; if (!ok) failures += 1;

  const named = matches.map((match) => address(match.id)).join(', ');

  console.log(`${ok ? 'PASS' : 'FAIL'}  expected=${expected} actual=${actual}  ${label}${named === '' ? '' : `  [${named}]`}`);
}

// --- THE OUTPUT for the context-exhausted state (owner priority, 2026-09-30): the replacement is ALLOWED,
//     the old agent is named UNRESUMABLE, and the brief is told to carry a TENANCY line for its worktree.
{
  const exhaustedOnly = decide('Gates: coverage-exclusion legitimacy + type-only assertion rule', '', REPO, records, NOW);
  const context = exhaustedOnly?.hookSpecificOutput?.additionalContext ?? '';
  const checks = [
    [exhaustedOnly?.hookSpecificOutput?.permissionDecision === undefined && context.length > 0, 'the replacement of a context-exhausted agent is allowed, with advice'],
    [context.includes('UNRESUMABLE') && context.includes('aa3437bf9bf7832a9'), 'the advice names the old agent as unresumable'],
    [context.includes(EXHAUSTED_TREE) && context.includes('TENANCY:'), 'the advice names its worktree and asks for a TENANCY line'],
    [!context.includes('SendMessage'), 'the advice never prints a resume recipe that cannot work'],
    [decide('Measure the storybook render budget', '', REPO, records, NOW)?.hookSpecificOutput?.permissionDecision === 'deny', 'a rate-limited agent still gets the resume-first refusal'],
    [decide('Extract the reorder state machine into its own controller', '', REPO, records, NOW) === undefined, 'unrelated work gets no output at all']
  ];

  for (const [ok, label] of checks) {
    checked += 1; if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

// --- The foreign-project record must never be reachable from this repo, whatever the wording.
{
  const matches = priorAgents('Re-measure coverage floors', REPO, records, NOW);
  const leaked = matches.some((match) => match.id === 'agent-aFOREIGN0000000');
  const ok = !leaked;

  checked += 1; if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  a record from another project is never offered as a candidate`);
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
  const refused = priorAgents(realDescription, REPO, [accessibility], NOW).length > 0;

  checked += 1;
  if (refused) failures += 1;

  console.log(`${refused ? 'FAIL' : 'PASS'}  the real case is advised, never refused`);

  rmSync(liveTree, { recursive: true, force: true });
}

rmSync(scratch, { recursive: true, force: true });

const total = checked;

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
