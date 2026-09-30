#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for backlog-guard — the `Stop` mechanism enforcing the owner directive
 * "Backlog maestro — todo hallazgo entra en el momento" (`~/.claude/rules/00-owner-mandates.md`).
 *
 * Exercises `decide()`'s whole state space with constructed, real-shaped payloads and injected
 * dependencies — never a live session, per this fleet's own `guard-that-cannot-go-red` rule (a guard is
 * not trusted until proven to discriminate across the state space its decision ranges over). Then runs
 * the real `guard.mjs` process end to end over one small, real, constructed transcript file, to prove
 * the WIRING (stdin -> decide -> stdout) and not just the injected decision.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de backlog-guard. Ejercita todo el espacio de estados de `decide()` con
 * payloads construidos y dependencias inyectadas — nunca una sesión viva. Luego corre `guard.mjs` de
 * verdad, de punta a punta, sobre un transcript pequeño y real construido, para probar el CABLEADO.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { commandDismiss, MINIMUM_REASON_LENGTH, parseArgs } from './dismiss.mjs';
import { decide } from './decide.mjs';
import { evaluate } from './guard.mjs';
import { findPendingMarker, PENDING_MARKERS } from './markers.mjs';
import { hasMasterBacklogSave, hasMasterBacklogUpdate, isMasterBacklogTopicKey, numericIdValuesIn, observedMasterIdPairings, topicKeyValuesIn } from './master-save.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD_CLI = path.join(HERE, 'guard.mjs');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);

  if (actualText === expectedText) {
    passed += 1;
    return;
  }

  failures.push(`${name} — expected ${expectedText}, got ${actualText}`);
}

const PENDING_MESSAGE = 'Found a real bug in the coverage exclude list — this is worth flagging, still open for the owner to decide.';
const CLEAN_MESSAGE = 'All 52 selftest assertions pass, 19 of 19 mutants killed, nothing else to report.';

/** A real-shaped `Stop` payload, mirroring the fields `turn-guard.mjs`/`claim-guard.mjs` already read. @es Un payload `Stop` con forma real. */
function stopPayload(message, { sessionId = 's-1', transcriptPath = 'C:/fixture/transcript.jsonl', stopHookActive = false } = {}) {
  return {
    session_id: sessionId,
    transcript_path: transcriptPath,
    hook_event_name: 'Stop',
    stop_hook_active: stopHookActive,
    last_assistant_message: message
  };
}

/**
 * The verdict as `'allow'` / `'deny'`, from FULLY injected dependencies — no real transcript file and,
 * critically, no REAL known-master-ids store touched. Without isolating that store too, a fixture run
 * would read/write `state/known-master-ids.json` on disk, and a fact "learned" by one selftest run
 * would silently leak into the next — the exact `guard-that-cannot-go-red` shape (a fixture built on
 * live mutable state) this fleet's own promoted rule names.
 * @es El veredicto con TODAS las dependencias inyectadas — sin tocar ni el transcript real ni,
 * críticamente, el registro REAL de ids maestros conocidos.
 */
function verdict(payload, { offset = 0, tail = '', size = undefined, knownIds = new Set() } = {}) {
  const writes = [];
  const learned = [];
  const decision = decide(payload, {
    readState: () => (offset === undefined ? undefined : { offset }),
    writeState: (sessionId, state) => writes.push({ sessionId, state }),
    readTail: () => tail,
    sizeOf: () => size,
    readKnownIds: () => new Set(knownIds),
    recordKnownIds: (pairings) => learned.push(...pairings)
  });

  return { result: decision === undefined ? 'allow' : 'deny', writes, learned };
}

// ---------------------------------------------------------------------------------------------
// STATE 1: pending phrase + no save -> block
// ---------------------------------------------------------------------------------------------
check('pending phrase + no save -> block', verdict(stopPayload(PENDING_MESSAGE), { tail: 'plain text, no tool calls at all' }).result, 'deny');

// ---------------------------------------------------------------------------------------------
// STATE 2: pending phrase + master save in turn -> allow
// ---------------------------------------------------------------------------------------------
{
  const tail = '{"type":"tool_use","name":"mem_save","input":{"topic_key":"backlog/1.0.0-master","content":"…"}}';
  check('pending phrase + master save in turn -> allow', verdict(stopPayload(PENDING_MESSAGE), { tail }).result, 'allow');
}

// ---------------------------------------------------------------------------------------------
// STATE 3 (the near miss): pending phrase + save with a DIFFERENT topic_key -> block
// ---------------------------------------------------------------------------------------------
{
  const tail = '{"type":"tool_use","name":"mem_save","input":{"topic_key":"decision/pending-something","content":"…"}}';
  check('near miss: save with a DIFFERENT topic_key -> still block', verdict(stopPayload(PENDING_MESSAGE), { tail }).result, 'deny');
}
{
  // A second near miss: the mcp-prefixed tool name, still detected via substring — and STILL a
  // near miss when the topic_key namespace is right but the SUFFIX is not "-master" (a per-item
  // backlog note, not the one master record).
  const tail = '{"name":"mcp__plugin_engram_engram__mem_save","input":{"topic_key":"backlog/1.0.0-item-42"}}';
  check('near miss: backlog/ namespace but NOT the -master suffix -> still block', verdict(stopPayload(PENDING_MESSAGE), { tail }).result, 'deny');
}

// ---------------------------------------------------------------------------------------------
// THE mem_update FACE, found in live use (`mem_update` edits an existing observation by `id` alone —
// no `topic_key` of its own): required states, from the owner's own bug report.
// ---------------------------------------------------------------------------------------------
{
  // mem_update of the master id, in-turn -> allow. `knownIds` models "this guard already learned,
  // at some point, that observation 972 IS the master backlog" — exactly what an earlier `mem_save`
  // teaches (`observedMasterIdPairings`, exercised separately below).
  const tail = '{"name":"mcp__engram__mem_update","input":{"id":972,"content":"revisión actualizada"}}';
  check('mem_update of the master id, in-turn -> allow', verdict(stopPayload(PENDING_MESSAGE), { tail, knownIds: new Set([972]) }).result, 'allow');
}
{
  // mem_update of an UNRELATED id -> block. Same tail shape, an id this guard has never tied to any
  // master topic_key.
  const tail = '{"name":"mcp__engram__mem_update","input":{"id":631,"content":"a different, unrelated note"}}';
  check('mem_update of an UNRELATED id -> block', verdict(stopPayload(PENDING_MESSAGE), { tail, knownIds: new Set([972]) }).result, 'deny');
}
{
  // mem_update of the master id, but the id was learned in an EARLIER turn only, and the update
  // itself sits in THIS turn's tail -> allow (the FACT "972 is master" is durable across turns; the
  // WRITE must be in this turn, and it is).
  const tail = '{"name":"mcp__engram__mem_update","input":{"id":972,"content":"turn 2 revision"}}';
  check('mem_update of the master id, id known from an EARLIER turn, update happens THIS turn -> allow', verdict(stopPayload(PENDING_MESSAGE), { tail, knownIds: new Set([972]) }).result, 'allow');
}
{
  // The counterpart the owner explicitly asked for: the UPDATE ITSELF happened in an earlier turn
  // only (this turn's tail has nothing at all) -> block, same per-turn windowing as every other state.
  check('mem_update of the master id in an EARLIER turn only (nothing in THIS turn\'s tail) -> block', verdict(stopPayload(PENDING_MESSAGE), { tail: '', knownIds: new Set([972]) }).result, 'deny');
}
{
  // The id/topic_key pairing can be learned from THIS SAME turn's own tail (a mem_save followed
  // later, in the same tail, by a mem_update of the id its own result just revealed) -- no
  // pre-seeded `knownIds` needed at all.
  const tail = [
    '{"name":"mem_save","input":{"topic_key":"backlog/1.0.0-master","content":"…"}}',
    '{"tool_use_id":"toolu_1","content":[{"type":"text","text":"{\\"id\\":972,\\"result\\":\\"Memory saved\\"}"}]}',
    '{"name":"mcp__engram__mem_update","input":{"id":972,"content":"same-turn follow-up"}}'
  ].join('\n');
  const { result, learned } = verdict(stopPayload(PENDING_MESSAGE), { tail });

  check('the id/topic_key pairing is learned from a mem_save earlier in the SAME turn, satisfying a later mem_update in that same turn', result, 'allow');
  check('...and the learned pairing is exactly {972, backlog/1.0.0-master}', learned, [{ id: 972, topicKey: 'backlog/1.0.0-master' }]);
}

// ---------------------------------------------------------------------------------------------
// STATE 4: no pending phrase -> allow
// ---------------------------------------------------------------------------------------------
check('no pending phrase -> allow', verdict(stopPayload(CLEAN_MESSAGE), { tail: '' }).result, 'allow');
check('empty message -> allow', verdict(stopPayload('')).result, 'allow');

// ---------------------------------------------------------------------------------------------
// STATE 5: a save in an EARLIER turn only -> block. Modelled as: the stored offset already sits
// PAST the position of that earlier save (because the guard advanced it at the end of that turn),
// so the tail available to THIS turn never contains it.
// ---------------------------------------------------------------------------------------------
{
  const earlierSave = '{"name":"mem_save","input":{"topic_key":"backlog/1.0.0-master"}}';
  const wholeTranscript = `${earlierSave}\n{"type":"assistant","text":"turn 2, nothing saved this time"}`;
  const offsetPastTheEarlierSave = earlierSave.length + 1; // the guard's own offset, recorded after turn 1
  const tailForThisTurn = wholeTranscript.slice(offsetPastTheEarlierSave); // what THIS turn's window actually sees

  check(
    'a master save from an EARLIER turn does not satisfy a LATER pending announcement',
    verdict(stopPayload(PENDING_MESSAGE), { offset: offsetPastTheEarlierSave, tail: tailForThisTurn }).result,
    'deny'
  );
  check('the earlier save is truly absent from what this turn reads', tailForThisTurn.includes('mem_save'), false);
}

// ---------------------------------------------------------------------------------------------
// STATE 6: stop_hook_active -> allow (already raised once this turn, never raise it twice)
// ---------------------------------------------------------------------------------------------
check('stop_hook_active -> allow, even with a pending phrase and no save', verdict(stopPayload(PENDING_MESSAGE, { stopHookActive: true }), { tail: '' }).result, 'allow');

// ---------------------------------------------------------------------------------------------
// STATE 7: malformed payload -> allow + exit 0 (via the real `evaluate()`, not the injected decide())
// ---------------------------------------------------------------------------------------------
check('malformed JSON -> evaluate() allows (undefined)', evaluate('NOT JSON AT ALL'), undefined);
check('empty stdin -> evaluate() allows (undefined)', evaluate(''), undefined);
check('BOM + valid JSON is still parsed (PowerShell 5.1 shape)', evaluate(`\ufeff${JSON.stringify(stopPayload(CLEAN_MESSAGE))}`), undefined);

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: the offset always advances, on every non-bypassed path, so the NEXT turn's window
// starts fresh — proven by inspecting the `writes` the injected `writeState` captured.
// ---------------------------------------------------------------------------------------------
{
  const { writes } = verdict(stopPayload(CLEAN_MESSAGE), { size: 4242 });
  check('the offset advances to the current transcript size even when nothing was pending', writes[0]?.state?.offset, 4242);
}
{
  const { writes } = verdict(stopPayload(PENDING_MESSAGE), { tail: '', size: 9999 });
  check('the offset advances even when the turn is blocked (the retry bypasses via stop_hook_active)', writes[0]?.state?.offset, 9999);
}

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: an unreadable transcript fails OPEN, never a false block.
// ---------------------------------------------------------------------------------------------
check(
  'an unreadable transcript (tail undefined) fails OPEN, never a false block',
  decide(stopPayload(PENDING_MESSAGE), { readState: () => undefined, writeState: () => {}, readTail: () => undefined, sizeOf: () => undefined }) === undefined,
  true
);

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: the marker/topic_key primitives, in isolation.
// ---------------------------------------------------------------------------------------------
check('findPendingMarker finds a real owner-named root', findPendingMarker('This is still open and worth flagging.'), 'still open');
check('findPendingMarker does not fire on the bare Spanish word "todo" alone', findPendingMarker('Corrí todo el árbol y todo salió verde.'), undefined);
check('findPendingMarker fires on the list/comment shape "todo:"', findPendingMarker('todo: reconciliar node_modules'), 'todo:');
check('PENDING_MARKERS is non-empty', PENDING_MARKERS.length > 0, true);

check('topicKeyValuesIn extracts every value, in order', topicKeyValuesIn('a"topic_key":"x"b"topic_key":"y"c'), ['x', 'y']);
check('isMasterBacklogTopicKey accepts the real b100-am-ui shape', isMasterBacklogTopicKey('backlog/1.0.0-master'), true);
check('isMasterBacklogTopicKey rejects a namespace match with the wrong suffix', isMasterBacklogTopicKey('backlog/1.0.0-item-1'), false);
check('isMasterBacklogTopicKey rejects an unrelated namespace', isMasterBacklogTopicKey('decision/1.0.0-master'), false);
check('isMasterBacklogTopicKey rejects the bare namespace with no milestone', isMasterBacklogTopicKey('backlog/-master'), false);
check('hasMasterBacklogSave is false without ANY save-tool marker, even with a matching topic_key', hasMasterBacklogSave('"topic_key":"backlog/1.0.0-master"'), false);
check('hasMasterBacklogSave is false for undefined/empty input', hasMasterBacklogSave(undefined), false);

check('numericIdValuesIn extracts every numeric id, deduplicated by Set', [...numericIdValuesIn('a"id":972 b"id":631 c"id":972')].sort(), [631, 972]);
check('numericIdValuesIn is empty for text with no id field', [...numericIdValuesIn('nothing here')], []);

{
  const REAL_SHAPE = '{"tool_use_id":"toolu_01TPGJisE5XwtsgFDQDauo55","name":"mcp__plugin_engram_engram__mem_save","input":{"project":"b100-am-ui","topic_key":"backlog/1.0.0-master","content":"…"}}\n{"content":[{"type":"text","text":"{\\"id\\":972,\\"judgment_required\\":false,\\"result\\":\\"Memory saved\\"}"}]}';
  check('observedMasterIdPairings learns {id, topicKey} from the REAL measured mem_save+result shape', observedMasterIdPairings(REAL_SHAPE), [{ id: 972, topicKey: 'backlog/1.0.0-master' }]);
}
check('observedMasterIdPairings ignores a topic_key that is not master-shaped', observedMasterIdPairings('"topic_key":"decision/foo""id":631'), []);
check('observedMasterIdPairings is empty for undefined/empty input', observedMasterIdPairings(undefined), []);

// --- SECOND SOURCE, found missing in live use the day AFTER the mem_update fix shipped: a
//     `mem_get_observation` RESULT's own human-readable metadata footer (`Topic: backlog/…-master`),
//     never a `mem_save` call's JSON input. Fixtures use the EXACT shape measured against this
//     session's own real transcript (session c45d798b, lines 76992-76993).
{
  // The exact literal shape measured on this session's own real transcript (session c45d798b, line
  // 76993): a `"result":"#<id> [...` prefix, and — later in the SAME string, separated by a
  // JSON-escaped newline (`\n`, two characters: backslash then `n`) — a `Topic: <topic_key>` line.
  const REAL_GET_OBSERVATION_RESULT = '"result":"#972 [decision] BACKLOG MAESTRO 1.0.0\\nmucho contenido aqui\\nTopic: backlog/1.0.0-master\\nDuplicates: 1\\nRevisions: 12"';

  check(
    'observedMasterIdPairings learns {id, topicKey} from a REAL mem_get_observation result\'s metadata footer',
    observedMasterIdPairings(REAL_GET_OBSERVATION_RESULT),
    [{ id: 972, topicKey: 'backlog/1.0.0-master' }]
  );
}
check(
  'the metadata-footer source ignores a non-master Topic (a per-item backlog note, not the master record)',
  observedMasterIdPairings('"result":"#631 [decision] some note\\nTopic: backlog/1.0.0-item-7\\nDuplicates: 0"'),
  []
);
check(
  'the metadata-footer source works with a REAL (unescaped) newline too, not only the JSON-escaped \\\\n form',
  observedMasterIdPairings('"result":"#972 [decision] x\nTopic: backlog/1.0.0-master\nDuplicates: 1"'),
  [{ id: 972, topicKey: 'backlog/1.0.0-master' }]
);
check('the metadata-footer source is silent when there is no "Topic: " line at all', observedMasterIdPairings('"result":"#972 [decision] no metadata footer here"'), []);
// Adversarial: with NO "Topic: " label, the six characters right after the id happen to spell out a
// real master-shaped value starting at the exact offset a missing not-found guard would fall through
// to (`indexOf` returning `-1`, then `-1 + 'Topic: '.length === 6`), and nothing after it (no trailing
// character, no newline) to break the `-master` ending. Proves the guard is load-bearing, not merely
// present: remove it and this exact fixture teaches a pairing that was never really announced.
check('the metadata-footer source does not fabricate a match from a coincidental offset when "Topic: " is absent', observedMasterIdPairings('"result":"#972 ABCDEbacklog/1.0.0-master'), []);

check('hasMasterBacklogUpdate is false with no mem_update marker at all', hasMasterBacklogUpdate('"id":972', new Set([972])), false);
check('hasMasterBacklogUpdate is false with an empty known-ids set', hasMasterBacklogUpdate('mem_update "id":972', new Set()), false);
check('hasMasterBacklogUpdate accepts a plain array too, not only a Set', hasMasterBacklogUpdate('mem_update "id":972', [972]), true);

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: the dismiss CLI's own validation.
// ---------------------------------------------------------------------------------------------
check('parseArgs reads --flag value pairs', parseArgs(['--session', 's-1', '--reason', 'because it is genuinely not a finding here']), { session: 's-1', reason: 'because it is genuinely not a finding here' });
{
  const calls = [];
  const result = commandDismiss(
    { session: 's-1', marker: 'still open', reason: 'this is a false positive: "still open" here means the door, not work' },
    { append: (...args) => calls.push(args), mkdir: () => {} }
  );

  check('a long-enough reason is accepted and appended', result.ok, true);
  check('the dismissal is appended exactly once', calls.length, 1);
}
{
  const result = commandDismiss({ session: 's-1', reason: 'too short' }, { append: () => {}, mkdir: () => {} });

  check('a reason shorter than the minimum is REFUSED', result.ok, false);
  check('the refusal names the minimum length', result.problems.some((p) => p.includes(String(MINIMUM_REASON_LENGTH))), true);
}
{
  const result = commandDismiss({ session: 's-1', reason: 'one line only, but\nthis has a newline in it' }, { append: () => {}, mkdir: () => {} });

  check('a multi-line reason is REFUSED (it must fit one JSONL line)', result.ok, false);
}

// ---------------------------------------------------------------------------------------------
// THE WHOLE HOOK, END TO END, over a REAL constructed transcript file and a REAL `guard.mjs`
// process — proves the wiring (stdin -> decide -> stdout, offset persisted on disk), not just the
// injected decision. Real git/session state is never read; everything here is a fixture this
// selftest builds and removes.
// ---------------------------------------------------------------------------------------------
{
  const scratch = mkdtempSync(path.join(tmpdir(), 'backlog-guard-selftest-'));
  const transcriptPath = path.join(scratch, 'transcript.jsonl');
  const sessionId = `selftest-${String(process.pid)}-${String(Date.now())}`;

  function runGuard(message) {
    const input = JSON.stringify(stopPayload(message, { sessionId, transcriptPath }));

    try {
      const out = execFileSync(process.execPath, [GUARD_CLI], { input, encoding: 'utf8' });
      return { code: 0, out };
    } catch (error) {
      return { code: typeof error?.status === 'number' ? error.status : 'did-not-run', out: `${error?.stdout ?? ''}` };
    }
  }

  // Turn 1: nothing saved yet, no pending phrase -> allow, and the offset gets recorded.
  writeFileSync(transcriptPath, '{"type":"assistant","text":"turn 1, exploring, nothing pending yet"}\n', 'utf8');
  const turn1 = runGuard(CLEAN_MESSAGE);
  check('END TO END turn 1 (no pending phrase): allowed, exit 0', `${String(turn1.code)}/${turn1.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/allow');

  // An intervening, non-pending turn is where the master-backlog save actually happens (a routine
  // housekeeping save, unrelated to any pending announcement) — running the guard here is what
  // advances its offset PAST the save, the same way it would after any real turn.
  appendToFile(transcriptPath, '{"name":"mem_save","input":{"topic_key":"backlog/1.0.0-master"}}\n');
  const housekeepingTurn = runGuard(CLEAN_MESSAGE);
  check('END TO END housekeeping turn (save happens, no pending phrase): allowed', `${String(housekeepingTurn.code)}/${housekeepingTurn.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/allow');

  // Turn 2: a pending phrase NOW, but the only save in the whole file sits BEFORE the offset the
  // housekeeping turn just recorded — this turn's own window never sees it -> block.
  const journalPath = path.join(HERE, 'state', 'refusals.jsonl');
  const journalledFor = () => (existsSync(journalPath) ? readFileSync(journalPath, 'utf8').split('\n').filter((line) => line.includes(sessionId)).length : 0);
  const journalBefore = journalledFor();

  appendToFile(transcriptPath, '{"type":"assistant","text":"turn 2, found a real bug, still open for the owner"}\n');
  const turn2 = runGuard(PENDING_MESSAGE);
  check('END TO END turn 2 (pending phrase, save was in the ALREADY-COVERED earlier window): blocked', `${String(turn2.code)}/${turn2.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/deny');
  check('END TO END turn 2: the refusal names the guard', turn2.out.includes('BACKLOG-GUARD TRIPPED'), true);
  check('END TO END turn 2: the refusal names the dismiss escape hatch', turn2.out.includes('dismiss.mjs'), true);
  check('END TO END turn 2: the refusal is journaled as evidence', journalledFor() - journalBefore, 1);

  // Turn 3: a master-backlog save appended DURING this turn's own window (after turn 2's offset) ->
  // the SAME pending phrase now passes, because this time the save genuinely sits in this turn.
  appendToFile(transcriptPath, '{"name":"mem_save","input":{"topic_key":"backlog/1.0.0-master","content":"updated with the finding"}}\n');
  const turn3 = runGuard(PENDING_MESSAGE);
  check('END TO END turn 3 (pending phrase, save genuinely IN this turn): allowed', `${String(turn3.code)}/${turn3.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/allow');

  // Turn 4: a REAL mem_save+topic_key(master)+id pairing, teaching the durable known-ids record for
  // real (on disk, via `state.mjs`'s own `recordKnownMasterIds`) — not injected. No pending phrase, so
  // this turn is a plain housekeeping save.
  const masterId = 90210;
  appendToFile(
    transcriptPath,
    `{"name":"mcp__engram__mem_save","input":{"topic_key":"backlog/1.0.0-master","content":"…"}}\n{"content":[{"type":"text","text":"{\\"id\\":${String(masterId)},\\"result\\":\\"Memory saved\\"}"}]}\n`
  );
  const turn4 = runGuard(CLEAN_MESSAGE);
  check('END TO END turn 4 (real mem_save+id pairing, no pending phrase): allowed', `${String(turn4.code)}/${turn4.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/allow');

  // Turn 5: a FRESH process (a distinct `execFileSync` call, no injected dependencies at all) sees a
  // pending phrase and a `mem_update` of that SAME id — this can only ALLOW if turn 4's learning
  // actually persisted to the REAL `state/known-master-ids.json` on disk and turn 5's fresh process
  // actually read it back. This is what proves `state.mjs`'s real read/write path, not just the
  // injected `decide()` fixtures above.
  appendToFile(transcriptPath, `{"name":"mcp__engram__mem_update","input":{"id":${String(masterId)},"content":"revised"}}\n`);
  const turn5 = runGuard(PENDING_MESSAGE);
  check('END TO END turn 5 (mem_update of an id LEARNED for real in an earlier, separate process): allowed', `${String(turn5.code)}/${turn5.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/allow');

  // Cleanup: turn 4 taught the REAL, durable known-ids record a fixture id — remove it, since that
  // record is shared, real, ongoing state for this deployed mechanism, not this proof's to keep.
  {
    const knownIdsFile = path.join(HERE, 'state', 'known-master-ids.json');

    if (existsSync(knownIdsFile)) {
      try {
        const known = JSON.parse(readFileSync(knownIdsFile, 'utf8'));

        writeFileSync(knownIdsFile, JSON.stringify(known.filter((id) => id !== masterId)), 'utf8');
      } catch {
        /* best-effort cleanup; a proof may not crash over housekeeping */
      }
    }
  }

  // Turns 6/7: REPLAY of the second live defect, structurally — `mem_get_observation`'s metadata-footer
  // pairing (NOT the mem_save topic_key pairing turn 4/5 already proved) learned in an EARLIER, separate
  // process, then a `mem_update` of that SAME id in a LATER turn with a pending phrase. MEASURED
  // sequence this replays (this session, in order): a `mem_get_observation({id:972})` result carried
  // `Topic: backlog/1.0.0-master` in the turn BEFORE the one that tripped; a `mem_update({id:972,...})`
  // ran in the tripping turn; the guard still blocked, because at the time this ran the metadata-footer
  // source did not exist yet (turn 4/5 above only ever exercises the mem_save-input `topic_key` source).
  // A fresh id (never 972, never 90210) keeps this replay independent of both real production state and
  // the earlier fixture's cleanup.
  const metadataLearnedId = 55501;
  appendToFile(
    transcriptPath,
    `{"name":"mcp__engram__mem_get_observation","input":{"id":${String(metadataLearnedId)}}}\n{"result":"#${String(metadataLearnedId)} [decision] BACKLOG MAESTRO\\nTopic: backlog/1.0.0-master\\nDuplicates: 1"}\n`
  );
  const turn6 = runGuard(CLEAN_MESSAGE);
  check('END TO END turn 6 (mem_get_observation metadata footer, no pending phrase): allowed', `${String(turn6.code)}/${turn6.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/allow');

  appendToFile(transcriptPath, `{"name":"mcp__engram__mem_update","input":{"id":${String(metadataLearnedId)},"content":"revised, real cross-turn metadata-footer replay"}}\n`);
  const turn7 = runGuard(PENDING_MESSAGE);
  check('END TO END turn 7 (mem_update of an id LEARNED ONLY from an earlier turn\'s mem_get_observation metadata footer): allowed', `${String(turn7.code)}/${turn7.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/allow');

  // Cleanup: turn 6 taught the real, durable known-ids record this fixture's id too.
  {
    const knownIdsFile = path.join(HERE, 'state', 'known-master-ids.json');

    if (existsSync(knownIdsFile)) {
      try {
        const known = JSON.parse(readFileSync(knownIdsFile, 'utf8'));

        writeFileSync(knownIdsFile, JSON.stringify(known.filter((id) => id !== metadataLearnedId)), 'utf8');
      } catch {
        /* best-effort cleanup; a proof may not crash over housekeeping */
      }
    }
  }

  // stop_hook_active always allows, real process included.
  const bypassed = execFileSync(process.execPath, [GUARD_CLI], {
    input: JSON.stringify(stopPayload(PENDING_MESSAGE, { sessionId, transcriptPath, stopHookActive: true })),
    encoding: 'utf8'
  });
  check('END TO END stop_hook_active: allowed even with a pending phrase', bypassed.includes('"decision":"block"'), false);

  rmSync(scratch, { recursive: true, force: true });

  function appendToFile(file, text) {
    writeFileSync(file, readFileSync(file, 'utf8') + text, 'utf8');
  }
}

// ---------------------------------------------------------------------------------------------
// THE WIRING: the guard is registered for Stop, and the REAL global manifest lists it. Read from
// `homedir()`, deliberately NOT from a path relative to this file's own location: there is exactly
// ONE real `~/.claude/hook-dispatch/manifests/stop.json` on the machine, and a mutation-proof sandbox
// copies this selftest into a throwaway directory that has no sibling `hook-dispatch/` at all — a
// path relative to `HERE` would silently read nothing there and this check would stop meaning
// anything the moment it runs inside a mutant sandbox.
// @es EL CABLEADO: el manifiesto REAL, leído desde `homedir()` a propósito, nunca relativo a la
// ubicación de este fichero — un sandbox de mutación copia este selftest a un directorio sin
// `hook-dispatch/` hermano, y una ruta relativa a `HERE` leería nada ahí en silencio.
{
  const declaration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  check('the declaration registers Stop', declaration.registrations?.[0]?.event, 'Stop');

  const manifestPath = path.join(homedir(), '.claude', 'hook-dispatch', 'manifests', 'stop.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { guards: [] };
  check('the REAL global Stop manifest lists backlog-guard', manifest.guards.some((entry) => entry.includes('backlog-guard/guard.mjs')), true);
}

process.stdout.write(`backlog-guard.selftest: ${String(passed)} passed, ${String(failures.length)} failed\n`);

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);

process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
