#!/usr/bin/env node
/**
 * Selftest of the premise judge: the WIRING (the settings entry is the rubric of `prompt.mjs`, byte for byte,
 * with its timeout; the rubric passes on `stop_hook_active`, holds one `$` and never the literal marker; the
 * journal guard is in the Stop manifest with its sidecar), the JOURNAL (`journal-guard.mjs`: only a continued
 * stop is read, only feedback records count, each reason once per session, cut to its limit, fail open, never a
 * verdict) and the LATENCY arithmetic (`latency.mjs`). Every journal write goes to a temporary
 * `HOOK_STATE_DIR`, never to the live state.
 *
 * @es Selftest del juez de premisas: el CABLEADO (la entrada de settings es la rúbrica de `prompt.mjs`, byte a
 * byte, con su timeout; la rúbrica pasa con `stop_hook_active`, lleva un solo `$` y nunca la marca literal; la
 * guardia de journal está en el manifiesto de Stop con su sidecar), el JOURNAL (solo se lee una parada
 * continuada, solo cuentan registros de realimentación, cada motivo una vez por sesión, cortado a su límite,
 * falla abierto, nunca un veredicto) y la aritmética de LATENCIA. Toda escritura va a un `HOOK_STATE_DIR`
 * temporal, nunca al estado vivo.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE = mkdtempSync(path.join(tmpdir(), 'premise-judge-state-'));
const WORK = mkdtempSync(path.join(tmpdir(), 'premise-judge-work-'));

process.env.HOOK_STATE_DIR = STATE;

/**
 * COMPLETION SENTINEL: an import that ran a module's `main()` would end this process half way, green.
 * @es CENTINELA: un import que corriera el `main()` de un módulo terminaría este proceso a mitad, en verde.
 */
let summarised = false;
process.on('exit', () => {
  rmSync(STATE, { recursive: true, force: true });
  rmSync(WORK, { recursive: true, force: true });
  if (summarised) return;

  console.error('FAIL the selftest exited before printing its summary @es FALLO el selftest salió antes de imprimir su resumen');
  process.exitCode = 1;
});

const { MARKER, PROMPT, PROMPT_SIGNATURE, TIMEOUT_SECONDS } = await import('./prompt.mjs');
const { hookCommand, loadJudge } = await import('../judge-gate/judges.mjs');
// Only this judge is loaded, as its own hook process does. @es Solo se carga este juez, como su propio proceso.
const GATE_JUDGE = await loadJudge('premise');
const { MECHANISM, REASON_LIMIT, TAIL_RECORDS, evaluate, importPromptModule, journalJudgeBlocks, judgeReasons, loadJournaledJudges } = await import('./journal-guard.mjs');
const { MARKER: VOICE_MARKER } = await import('../voice-judge/prompt.mjs');
const { MARKER: PENDING_MARKER } = await import('../pending-judge/prompt.mjs');
const JOURNALED = await loadJournaledJudges();
const { judgeLatency, latencyReport, main: latencyMain } = await import('./latency.mjs');
const { digestInput, firesPath, journalPath } = await import('../hook-state/journal.mjs');

await new Promise((resolve) => setTimeout(resolve, 100));

let passed = 0;
const failures = [];
const failedLabels = [];
const check = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failures.push(`${label}: got ${JSON.stringify(actual)?.slice(0, 200)}, expected ${JSON.stringify(expected)?.slice(0, 200)}`);
    failedLabels.push(label);
  }
};

// --- WIRING. @es CABLEADO.
const settings = JSON.parse(readFileSync(path.join(HERE, '..', 'settings.json'), 'utf8'));
const commandHooks = (settings.hooks?.Stop ?? []).flatMap((group) => group.hooks ?? []).filter((hook) => hook.command === hookCommand('premise'));

check('settings: exactly one command Stop hook runs the premise judge through the gate', commandHooks.length, 1);
check('settings: its timeout is the pinned one', commandHooks[0]?.timeout, TIMEOUT_SECONDS);
check('rubric: the gate runs this rubric, the single source', GATE_JUDGE.prompt === PROMPT, true);
check('rubric: starts with its signature', PROMPT.startsWith(`${PROMPT_SIGNATURE}\n`), true);
check('rubric: one $ and it is $ARGUMENTS', [PROMPT.split('$').length - 1, PROMPT.split('$ARGUMENTS').length - 1], [1, 1]);
check('rubric: the model judges the first stop and the rewrite after a block alike', PROMPT.includes('You see either the first stop of a turn or the rewrite after a block: the gate judges a continued stop until its turn has had two blocks. Judge both the same way.'), true);
check('rubric: the model is no longer asked to test stop_hook_active', PROMPT.includes('If the input field stop_hook_active'), false);
check('rubric: judges an own decision justified as the easier path while it names a better one', PROMPT.includes('(c) The message states its own decision or recommendation and justifies it as the easier'), true);
check('rubric: unverified passes only when it cannot be measured this turn', PROMPT.includes("passes ONLY when it cannot be measured this turn (another machine, the future, a third party's intent, a cost not yet incurred)"), true);
check('rubric: case d is retired', PROMPT.includes('(d) '), false);
check('rubric: three cases', PROMPT.includes('in one of these three cases'), true);
check('rubric: the signature is the v6 line', PROMPT_SIGNATURE, 'premise-judge rubric v6.');
check('rubric: never holds the literal marker', PROMPT.includes(MARKER), false);
check('rubric: spells the marker in words', PROMPT.includes('starts with the word PREMISE-JUDGE followed by a colon'), true);
check('rubric: the marker is what the words spell', MARKER, 'PREMISE-JUDGE:');

const stopManifest = JSON.parse(readFileSync(path.join(HERE, '..', 'hook-dispatch', 'manifests', 'stop.json'), 'utf8'));
const sidecar = JSON.parse(readFileSync(path.join(HERE, 'journal-guard.mjs.hook-registration.json'), 'utf8'));

check('manifest: the Stop dispatcher runs the journal guard', stopManifest.guards.includes('../../premise-judge/journal-guard.mjs'), true);
check('sidecar: the journal guard is registered on Stop', sidecar.registrations, [{ event: 'Stop' }]);
check('mechanism: the folder name', MECHANISM, path.basename(HERE));

// --- JOURNAL. @es JOURNAL.
let transcriptCount = 0;
const transcript = (records) => {
  transcriptCount += 1;
  const file = path.join(WORK, `t${transcriptCount}.jsonl`);

  writeFileSync(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n');

  return file;
};
const reasonA = `${MARKER} (a) "your mandate says read it all" - verify it and cite the evidence`;
const reasonB = `${MARKER} (b) "I disabled the lock as asked" - name the downside`;
const feedback = (reason) => ({ type: 'user', isMeta: true, message: { role: 'user', content: `Stop hook feedback:\n${reason}` } });
const stopPayload = (file, extra = {}) => ({ hook_event_name: 'Stop', session_id: 's1', transcript_path: file, stop_hook_active: true, last_assistant_message: 'ok', ...extra });
const journal = () => {
  try {
    return readFileSync(journalPath(MECHANISM), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
  } catch {
    return [];
  }
};
const fires = () => {
  try {
    return JSON.parse(readFileSync(firesPath(MECHANISM), 'utf8')).count;
  } catch {
    return 0;
  }
};

/** A throw is a verdict about the module, reported as a value, never an uncaught crash. @es Un throw se informa como valor. */
const blocksOf = (payload) => {
  try {
    return journalJudgeBlocks(payload, JOURNALED);
  } catch (error) {
    return `threw ${error.message}`;
  }
};

const withA = transcript([{ type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } }, feedback(reasonA)]);

check('journal: a first stop is never read', blocksOf(stopPayload(withA, { stop_hook_active: false })), 0);
check('journal: a payload with no transcript path is not read', blocksOf(stopPayload(42)), 0);
check('journal: a continued stop journals the feedback, before any journal exists', blocksOf(stopPayload(withA)), 1);

const [first] = journal();

check('journal: the record is a Stop decision of no tool use', [first?.kind, first?.event, first?.toolUseId], ['decision', 'Stop', null]);
check('journal: the reason is the text from the marker on', first?.reason, reasonA);
check('journal: the digest is of session and reason', first?.inputDigest, digestInput(`s1\n${reasonA}`));
check('journal: the block has an id', typeof first?.blockId === 'string' && first.blockId !== '', true);
check('journal: the same feedback met again is not journaled twice', blocksOf(stopPayload(withA)), 0);
check('journal: the same reason in another session is its own block', blocksOf(stopPayload(withA, { session_id: 's2' })), 1);

const twoRecordsOneReason = transcript([feedback(reasonB), { type: 'system', subtype: 'stop_hook_summary', hookErrors: [reasonB] }]);

check('journal: one reason in two records is one block', blocksOf(stopPayload(twoRecordsOneReason, { session_id: 's3' })), 1);

const notFeedback = transcript([
  { type: 'assistant', message: { content: [{ type: 'text', text: `I quote ${reasonA}` }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: `const MARKER = '${MARKER}';` }] } },
  { type: 'user', toolUseResult: { stdout: `${MARKER} from a command` }, message: { content: 'x' } },
  { type: 'user', message: { content: 'no marker here' } },
]);

check('journal: the assistant\'s own text, a tool result and a tool output are not feedback', blocksOf(stopPayload(notFeedback, { session_id: 's4' })), 0);
check('journal: two distinct reasons are two blocks', judgeReasons([feedback(reasonA), feedback(reasonB)]).length, 2);
check('journal: one reason twice is one reason', judgeReasons([feedback(reasonA), feedback(reasonA)]), [reasonA]);
check('journal: a tool result nested in an array is found', judgeReasons([{ type: 'user', message: { content: [{ type: 'text', text: 'x' }, { type: 'tool_result', content: [{ type: 'text', text: reasonA }] }] } }]), []);

const noSession = transcript([feedback(`${MARKER} no session`)]);

check('journal: a payload with no session id keys on the reason alone', [blocksOf(stopPayload(noSession, { session_id: undefined })), journal().at(-1)?.inputDigest], [1, digestInput(`\n${MARKER} no session`)]);
check('journal: a reason is cut to its limit', judgeReasons([feedback(`${MARKER} ${'x'.repeat(REASON_LIMIT * 2)}`)])[0].length, REASON_LIMIT);
check('journal: a reason is trimmed', judgeReasons([feedback(`${reasonA}   \n`)]), [reasonA]);

const far = transcript([feedback(`${MARKER} far back`), ...Array.from({ length: TAIL_RECORDS }, () => ({ type: 'user', message: { content: 'filler' } }))]);

check('journal: only the transcript tail is read', blocksOf(stopPayload(far, { session_id: 's5' })), 0);

// --- THE HOOK: never a verdict, counts every run, fails open. @es EL HOOK: nunca veredicto, cuenta, falla abierto.
const before = fires();
const withB = transcript([feedback(reasonB)]);

check('hook: evaluate never returns a verdict', await evaluate(JSON.stringify(stopPayload(withB, { session_id: 's6' }))), undefined);
check('hook: a run is counted', fires(), before + 1);
check('hook: evaluate journals through the same path', journal().some((record) => record.inputDigest === digestInput(`s6\n${reasonB}`)), true);
check('hook: a BOM-prefixed payload is read', [await evaluate(`﻿${JSON.stringify(stopPayload(withB, { session_id: 's7' }))}`), journal().some((record) => record.inputDigest === digestInput(`s7\n${reasonB}`))], [undefined, true]);
check('hook: an unreadable payload is not counted', [await evaluate('{ no json'), fires()], [undefined, before + 2]);
check('hook: a missing transcript fails open', await evaluate(JSON.stringify(stopPayload(path.join(WORK, 'missing.jsonl')))).catch((error) => `threw ${error.message}`), undefined);

// EACH JUDGE ON ITS OWN: a broken pending prompt leaves premise and voice journaled.
// @es CADA JUEZ POR SU CUENTA: un prompt de pendientes roto deja registrados a premise y voice.
{
  const brokenPending = (specifier) => (specifier.startsWith('../pending-judge/') ? Promise.reject(new SyntaxError('broken pending prompt')) : importPromptModule(specifier));
  const noVoiceMarker = (specifier) => (specifier.startsWith('../voice-judge/') ? Promise.resolve({ MARKER: 42 }) : importPromptModule(specifier));
  const mechanismsOf = (importModule) => loadJournaledJudges({ importModule }).then((judges) => judges.map((judge) => judge.mechanism), (error) => `threw: ${error.message}`);
  const voiceJournal = () => {
    try {
      return readFileSync(journalPath('voice-judge'), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  };

  check('lazy: every judge loads, in table order, with its own marker', JOURNALED.map((judge) => [judge.mechanism, judge.marker.endsWith(':')]), [['premise-judge', true], ['voice-judge', true], ['pending-judge', true]]);
  check('lazy: a broken pending prompt is skipped alone', await mechanismsOf(brokenPending), ['premise-judge', 'voice-judge']);
  check('lazy: a prompt with no marker text is skipped alone', await mechanismsOf(noVoiceMarker), ['premise-judge', 'pending-judge']);
  check('lazy: an empty marker is no marker', await mechanismsOf((specifier) => (specifier.startsWith('../voice-judge/') ? Promise.resolve({ MARKER: '' }) : importPromptModule(specifier))), ['premise-judge', 'pending-judge']);

  const voiceReason = `${VOICE_MARKER} rewrite it as a mentor would`;
  const pendingReason = `${PENDING_MARKER} "Queda pendiente el hook." is left for later`;
  const pendingJournal = () => {
    try {
      return readFileSync(journalPath('pending-judge'), 'utf8').split('\n').filter((line) => line !== '').length;
    } catch {
      return 0;
    }
  };
  const all = transcript([feedback(reasonA), feedback(voiceReason), feedback(pendingReason)]);
  const firesBefore = fires();
  const pendingBefore = pendingJournal();

  await evaluate(JSON.stringify(stopPayload(all, { session_id: 's9' })), { importModule: brokenPending });
  check('lazy: past a broken pending prompt the hook journals premise and voice, skips pending, and counts the run', [journal().some((record) => record.inputDigest === digestInput(`s9\n${reasonA}`)), voiceJournal().some((record) => record.inputDigest === digestInput(`s9\n${voiceReason}`)), pendingJournal() - pendingBefore, fires()], [true, true, 0, firesBefore + 1]);
  await evaluate(JSON.stringify(stopPayload(all, { session_id: 's10' })));
  check('lazy: with every prompt loading, the pending block is journaled too', pendingJournal() - pendingBefore, 1);
  check('lazy: the journal guard imports no other judge\'s prompt when it loads', readFileSync(path.join(HERE, 'journal-guard.mjs'), 'utf8').split('\n').filter((line) => line.startsWith('import ') && line.includes('-judge/')), []);
}

// --- J-1: each judge is counted and journaled on its own, so one broken judge never costs the other its record.
// @es J-1: cada juez se cuenta y registra por su cuenta: un juez roto nunca le cuesta el registro al otro.
{
  const ISOLATED = mkdtempSync(path.join(tmpdir(), 'premise-judge-j1-'));
  const saved = process.env.HOOK_STATE_DIR;
  const voiceReason = 'VOICE-JUDGE: write as the mentor, with the why';
  const both = transcript([feedback(reasonA), feedback(voiceReason)]);
  const records = (mechanism) => {
    try {
      return readFileSync(journalPath(mechanism), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  };
  const count = (mechanism) => {
    try {
      return JSON.parse(readFileSync(firesPath(mechanism), 'utf8')).count;
    } catch {
      return 0;
    }
  };

  // A virtual platform clock for one call: `Date.now` and the sleep under the lock's pause (`Atomics.wait`) advance
  // a counter instead of real time, so the hook's OWN default budget is proved by what it slept, never by how long
  // a loaded machine took. The counting runs before `evaluate`'s first await, so it all happens inside the call; the
  // journaling after it is awaited by the caller. @es Un reloj de plataforma virtual para una llamada: `Date.now` y
  // el sueño bajo la pausa del lock (`Atomics.wait`) avanzan un contador en vez del tiempo real, así que el
  // presupuesto POR DEFECTO del hook se prueba por lo que durmió, nunca por lo que tardó una máquina cargada. El
  // conteo corre antes del primer await de `evaluate`, dentro de la llamada; el registro posterior lo espera quien llama.
  const onVirtualClock = (action) => {
    const realNow = Date.now;
    const realWait = Atomics.wait;
    const slept = [];
    let virtual = realNow();

    Date.now = () => virtual;
    Atomics.wait = (_array, _index, _value, ms) => {
      slept.push(ms);
      virtual += ms;

      return 'timed-out';
    };

    try {
      return { value: action(), slept: slept.reduce((sum, ms) => sum + ms, 0), longest: Math.max(0, ...slept) };
    } finally {
      Date.now = realNow;
      Atomics.wait = realWait;
    }
  };

  process.env.HOOK_STATE_DIR = ISOLATED;

  try {
    // The premise judge's journal is a directory: it can be neither read back nor appended to.
    // @es El journal del juez de premisas es un directorio: no se puede releer ni ampliar.
    mkdirSync(journalPath(MECHANISM), { recursive: true });
    check('J-1: a judge whose journal is broken does not cost the other judge its block', [blocksOf(stopPayload(both, { session_id: 'j1' })), records('voice-judge').map((record) => record.reason)], [1, [voiceReason]]);

    // The premise judge's counter is corrupt: that run is not counted, the voice judge's is, and the blocks are still journaled.
    // @es El contador del juez de premisas está corrupto: esa corrida no se cuenta, la del de voz sí, y los bloqueos se registran igual.
    rmSync(journalPath(MECHANISM), { recursive: true, force: true });
    writeFileSync(firesPath(MECHANISM), '{not json');
    check('J-1: a judge whose counter cannot count still lets the hook count the other judge and journal both blocks', [await evaluate(JSON.stringify(stopPayload(both, { session_id: 'j2' }))), count('voice-judge'), records(MECHANISM).map((record) => record.reason), records('voice-judge').length], [undefined, 1, [reasonA], 2]);

    // The premise judge's counter is held by another process: the hook neither waits long nor loses the blocks.
    // @es El contador del juez de premisas lo tiene otro proceso: el hook ni espera mucho ni pierde los bloqueos.
    rmSync(firesPath(MECHANISM), { force: true });
    writeFileSync(`${firesPath(MECHANISM)}.lock`, '');

    // Thirteen waits of 15 ms on the busy counter, none on the free one: 195 ms slept. @es Trece esperas de 15 ms.
    const one = onVirtualClock(() => evaluate(JSON.stringify(stopPayload(both, { session_id: 'j3' }))));

    check('J-1: a busy counter costs the hook at most its 200 ms budget of sleep, and no block', [await one.value, one.slept, one.longest <= 15, count('voice-judge'), records(MECHANISM).length, records('voice-judge').length], [undefined, 195, true, 2, 2, 3]);

    // L5: BOTH counters held by other processes: the two judges share one budget, so the Stop waits about 200 ms
    // in all, not 200 ms per judge. @es L5: AMBOS contadores ocupados: los dos jueces comparten un presupuesto, así
    // que el Stop espera unos 200 ms en total, no 200 por juez.
    writeFileSync(`${firesPath('voice-judge')}.lock`, '');

    // One shared budget: 195 ms for the first judge, the last 5 for the second; a budget per judge would sleep 390.
    // @es Un presupuesto compartido: 195 ms para el primer juez y los 5 restantes para el segundo; uno por juez, 390.
    const two = onVirtualClock(() => evaluate(JSON.stringify(stopPayload(both, { session_id: 'j4' }))));

    check('L5: two busy counters cost the Stop 200 ms of sleep in all, not 200 per judge, and no block', [await two.value, two.slept, two.longest <= 15, records(MECHANISM).length, records('voice-judge').length], [undefined, 200, true, 3, 4]);
  } finally {
    process.env.HOOK_STATE_DIR = saved;
    rmSync(ISOLATED, { recursive: true, force: true });
  }
}

const alone = spawnSync(process.execPath, [path.join(HERE, 'journal-guard.mjs')], { input: JSON.stringify(stopPayload(withB, { session_id: 's8' })), encoding: 'utf8', env: { ...process.env, HOOK_STATE_DIR: STATE } });

check('hook: as its own process it prints nothing and exits 0', [alone.status, alone.stdout], [0, '']);
check('hook: as its own process it journals', journal().some((record) => record.inputDigest === digestInput(`s8\n${reasonB}`)), true);

// A lock failure that must not stop the hook (here a stale counter lock whose break cannot be journaled) goes to
// the judge's own `lock-faults.jsonl`, and the hook still prints nothing, on stdout or stderr.
// @es Un fallo del lock que no debe parar el hook (aquí, un lock caducado cuya rotura no se puede registrar) va al
// `lock-faults.jsonl` del juez, y el hook sigue sin imprimir nada, ni en stdout ni en stderr.
{
  const FAULTED = mkdtempSync(path.join(tmpdir(), 'premise-judge-faults-'));
  const judgeMechanisms = [MECHANISM, 'voice-judge'];

  try {
    for (const mechanism of judgeMechanisms) {
      const staleLock = path.join(FAULTED, mechanism, 'fires.json.lock');

      mkdirSync(`${staleLock}.breaks.jsonl`, { recursive: true });
      writeFileSync(staleLock, 'no owner');
      utimesSync(staleLock, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
    }

    const faulted = spawnSync(process.execPath, [path.join(HERE, 'journal-guard.mjs')], { input: JSON.stringify(stopPayload(withB, { session_id: 's9' })), encoding: 'utf8', env: { ...process.env, HOOK_STATE_DIR: FAULTED } });
    const faultsOf = (mechanism) => {
      try {
        return readFileSync(path.join(FAULTED, mechanism, 'lock-faults.jsonl'), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
      } catch {
        return [];
      }
    };
    const described = (mechanism) => faultsOf(mechanism).map((one) => [one.mechanism, /could not be journaled/.test(one.message), / @es /.test(one.message)]);

    check('hook: a lock failure on the Stop path is recorded in EACH judge\'s own lock-faults.jsonl, bilingual, and nothing is printed', [faulted.status, faulted.stdout, faulted.stderr, ...judgeMechanisms.map(described)], [0, '', '', ...judgeMechanisms.map((mechanism) => [[mechanism, true, true]])]);
  } finally {
    rmSync(FAULTED, { recursive: true, force: true });
  }
}

// --- LATENCY. @es LATENCIA.
const summary = (infos, timestamp = '2026-10-06T10:00:00.000Z') => ({ type: 'system', subtype: 'stop_hook_summary', timestamp, hookInfos: infos });
const judgeInfo = (durationMs) => ({ command: hookCommand('premise'), durationMs });
const latencyOf = (record) => {
  try {
    return judgeLatency(record);
  } catch (error) {
    return `threw ${error.message}`;
  }
};

check('latency: the judge adds what it ran past the slowest other hook', latencyOf(summary([{ command: 'node a', durationMs: 61 }, judgeInfo(2500), { command: 'node b', durationMs: 300 }])), { judgeMs: 2500, addedMs: 2200 });
check('latency: a judge faster than another hook adds nothing', latencyOf(summary([{ command: 'node a', durationMs: 900 }, judgeInfo(400)])), { judgeMs: 400, addedMs: 0 });
check('latency: a judge alone adds all it took', latencyOf(summary([judgeInfo(1200)])), { judgeMs: 1200, addedMs: 1200 });
check('latency: a summary without the judge is no sample', latencyOf(summary([{ command: 'node a', durationMs: 61 }])), undefined);
check('latency: another record is no sample', latencyOf({ type: 'user', subtype: 'stop_hook_summary', hookInfos: [judgeInfo(1)] }), undefined);
check('latency: another system record is no sample', latencyOf({ type: 'system', subtype: 'compact_boundary', hookInfos: [judgeInfo(1)] }), undefined);
check('latency: a summary with no hook list is no sample', latencyOf({ type: 'system', subtype: 'stop_hook_summary' }), undefined);
check('latency: an entry with no duration is ignored', latencyOf(summary([{ command: 'node a' }, judgeInfo(700)])), { judgeMs: 700, addedMs: 700 });

const identified = latencyReport([summary([judgeInfo(1000)]), summary([judgeInfo(3000), { command: 'node a', durationMs: 500 }]), { type: 'user' }]);

check('latency: the report counts summaries and samples', [identified.summaries, identified.withJudge], [2, 2]);
check('latency: the report gives median and p95', [identified.judgeMs, identified.addedMs], [{ median: 2000, p95: 3000 }, { median: 1750, p95: 2500 }]);
check('latency: no labels when the judge was found', identified.labelsSeen, undefined);

const unidentified = latencyReport([summary([{ command: 'prompt', durationMs: 9 }, { command: 'node a', durationMs: 1 }]), summary([{ command: 'node a', durationMs: 2 }])]);

check('latency: without the judge, the labels seen are listed by count', unidentified.labelsSeen, [{ label: 'node a', count: 2 }, { label: 'prompt', count: 1 }]);
check('latency: without the judge, no figures', [unidentified.judgeMs, unidentified.addedMs], [null, null]);
check('latency: no summaries, no labels', latencyReport([]).labelsSeen, undefined);

const projects = path.join(WORK, 'projects');

mkdirSync(path.join(projects, 'p', 's', 'subagents'), { recursive: true });
writeFileSync(path.join(projects, 'p', 's.jsonl'), `${JSON.stringify(summary([judgeInfo(1000)], '2026-10-01T00:00:00.000Z'))}\n{ torn\n${JSON.stringify(summary([judgeInfo(2000)], '2026-10-05T00:00:00.000Z'))}\n`);
writeFileSync(path.join(projects, 'p', 's', 'subagents', 'w.jsonl'), `${JSON.stringify(summary([judgeInfo(4000)], '2026-10-06T00:00:00.000Z'))}\n`);

const printed = [];
const run = async (argv) => {
  printed.length = 0;
  const code = await latencyMain(argv, { out: (text) => printed.push(text) });

  try {
    return { code, report: JSON.parse(printed.join('\n')) };
  } catch {
    return { code, report: printed.join('\n') };
  }
};

const all = await run(['--projects', projects]);

check('cli: reads every transcript, workers included, skipping a torn line', [all.code, all.report.withJudge, all.report.judgeMs], [0, 3, { median: 2000, p95: 4000 }]);

const recent = await run(['--projects', projects, '--since', '2026-10-04']);

check('cli: --since drops older summaries', [recent.code, recent.report.withJudge], [0, 2]);
check('cli: an unknown option is refused', (await run(['--nope'])).code, 2);
check('cli: a date that is not one is refused', (await run(['--since', 'yesterday'])).code, 2);

// A red run is never anonymous: the details go to stderr, and the last line of stdout, which every runner shows,
// names each failing check. @es Una corrida roja nunca es anónima: el detalle va a stderr y la última línea de
// stdout, la que muestra todo runner, nombra cada check que falló.
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed${failedLabels.length === 0 ? '' : ` — FAILED: ${failedLabels.join(' | ')}`}`);
summarised = true;
process.exitCode = failures.length === 0 ? 0 : 1;
