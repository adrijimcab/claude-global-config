#!/usr/bin/env node
/**
 * DIFFERENTIAL PROOF that reading the live transcripts through the incremental index (`transcript-index/index.mjs`
 * with `AGENT_ACTIVITY_FOLD`) and only when a repo needs them (`decide.mjs` `readLiveAgents`) changes NO answer of
 * this guard. The oracle is the reader this guard shipped with until B1: the whole transcript read as text, then
 * `writtenPathsIn` and `shellCallsIn` over it, eagerly, before any repo was looked at.
 *
 * WHAT WOULD MAKE THE INDEXED READER WRONG, and the case that catches each: a record absorbed twice or never across
 * an append that cuts a line (every corpus is written in seeded random chunks, cut mid-line, and compared after
 * EVERY chunk); a parseable last line with no newline yet (the text reader reads it, so the fold must too, without
 * caching it); a call id repeated or absent, a result with no id, a record with no or a bad timestamp, a text block
 * that carries `"tool_use"` only as a stop reason, CRLF, a BOM, blank and corrupt lines; a finished worker's
 * windows ending where its transcript ends; and a transcript replaced by a different one.
 * WHAT WOULD MAKE THE LAZY READ WRONG: a decision that needed the agents and did not get them. Every repo state of
 * the matrix (clean, dirty with paths this session, another session or nobody live wrote, ahead with own and
 * foreign commits, missing, unmeasurable) is decided both ways and the whole hook output must be byte-identical.
 *
 * THE ONE DELIBERATE DIFFERENCE, pinned last: when reading the transcripts THROWS and no repo needs them, the old
 * guard failed open SILENTLY (the throw escaped before any repo was classified) and dropped the notes of its other
 * repos; the lazy guard still reports them. A note is never a block, so no turn is ended differently.
 *
 * @es PRUEBA DIFERENCIAL de que leer los transcripts vivos por el índice incremental y solo cuando un repo los
 * necesita no cambia NINGUNA respuesta de esta guardia. El oráculo es el lector con que la guardia se publicó hasta
 * B1: el transcript entero como texto, luego `writtenPathsIn` y `shellCallsIn`, de forma anticipada. Cada corpus se
 * escribe en trozos aleatorios con semilla, cortados a mitad de línea, y se compara tras CADA trozo; cada estado de
 * repo de la matriz se decide de las dos formas y la salida entera del hook debe ser idéntica byte a byte. LA ÚNICA
 * DIFERENCIA DELIBERADA, fijada al final: si leer los transcripts LANZA y ningún repo los necesita, la guardia
 * vieja dejaba pasar EN SILENCIO y perdía las notas de sus otros repos; la perezosa las informa. Una nota nunca es
 * un bloqueo, así que ningún turno termina de otra forma.
 */

import { appendFileSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { isolateState } from '../hook-state/locations.mjs';
import { ACTIVE_WINDOW_MS, agentRecords, FINISHED_HORIZON_MS, liveAgentWrites } from './attribution.mjs';
import { decide } from './decide.mjs';
import { evaluate } from './guard.mjs';
import { shellCallsIn } from './shell-windows.mjs';
import { writtenPathsIn } from './transcript-writes.mjs';

const stateRoot = isolateState('config-sync-guard');
const scratch = path.join(stateRoot, 'scratch');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (isDeepStrictEqual(actual, expected) && JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** What `action` returns, or `threw: <message>`: a throw is a checked value, never a crash. @es Lo que devuelve `action`, o `threw: <mensaje>`. */
function outcome(action) {
  try {
    return action();
  } catch (error) {
    return `threw: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * THE ORACLE: `liveAgentWrites` as it shipped before B1, verbatim but for the injected `records`: every transcript
 * in reach read whole as text. @es EL ORÁCULO: `liveAgentWrites` tal como se publicó antes de B1: cada transcript leído entero.
 */
function wholeTextAgents(now, records) {
  const byAgent = new Map();

  for (const record of records) {
    let age;

    try {
      age = now - statSync(record.transcript).mtimeMs;
    } catch {
      age = Infinity;
    }

    const live = age < ACTIVE_WINDOW_MS;

    if (!live && !(record.subagent && age < FINISHED_HORIZON_MS)) continue;

    try {
      const text = readFileSync(record.transcript, 'utf8');

      byAgent.set(record.id, { session: record.session, subagent: record.subagent, live, writes: writtenPathsIn(text), windows: shellCallsIn(text, live ? now : now - age) });
    } catch {
      continue;
    }
  }

  return byAgent;
}

/** A seeded generator (mulberry32), so every run cuts the same chunks. @es Un generador con semilla: cada corrida corta los mismos trozos. */
function seeded(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const T0 = Date.parse('2026-10-27T10:00:00.000Z');
const at = (second) => new Date(T0 + second * 1000).toISOString();
const json = (value) => JSON.stringify(value);
const use = (second, id, name, input, extra = {}) => json({ type: 'assistant', timestamp: at(second), cwd: 'C:\\work', ...extra, message: { content: [{ type: 'tool_use', ...(id === undefined ? {} : { id }), name, input }] } });
const result = (second, id, extra = {}) => json({ type: 'user', timestamp: at(second), message: { content: [{ type: 'tool_result', ...(id === undefined ? {} : { tool_use_id: id }), content: 'ok', ...extra }] } });

/** Every record shape the readers distinguish, in an order that exercises them. @es Cada forma de registro que distinguen los lectores. */
const CORPUS = [
  use(1, 'w1', 'Write', { file_path: 'C:\\Work\\A.ts', content: 'x' }),
  use(2, 'w2', 'Edit', { file_path: 'c:/work/a.ts' }),
  use(3, 'w3', 'MultiEdit', { file_path: 'C:/work/sub/ñandú.ts' }),
  use(4, 'w4', 'NotebookEdit', { notebook_path: 'C:/work/n.ipynb' }),
  use(5, 'r1', 'Read', { file_path: 'C:/work/read-only.ts' }),
  use(6, 'w5', 'Write', { file_path: '' }),
  use(7, 'w6', 'Write', { file_path: 42 }),
  use(8, 'b1', 'Bash', { command: 'git commit -m x' }),
  use(9, 'p1', 'PowerShell', { command: 'Set-Content x' }, { cwd: 'C:\\other' }),
  json({ type: 'assistant', timestamp: at(10), message: { stop_reason: 'tool_use', content: [{ type: 'text', text: 'thinking aloud' }] } }),
  result(11, 'p1'),
  result(12, 'b1', { is_error: true }),
  use(13, 'b2', 'Bash', {}),
  use(14, 'b2', 'Bash', { command: 'repeated id replaces in place' }),
  use(15, undefined, 'Bash', { command: 'no id' }),
  result(16, undefined),
  result(17, 'unknown'),
  json({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b3', name: 'Bash', input: { command: 'no timestamp' } }] } }),
  json({ type: 'assistant', timestamp: 'not a date', message: { content: [{ type: 'tool_use', id: 'b4', name: 'Bash', input: { command: 'bad timestamp' } }] } }),
  json({ type: 'user', timestamp: at(18), message: { content: 'a prose prompt naming C:/work/prose.ts and "tool_use"' } }),
  '',
  '{"tool_use": cut off',
  'null',
  '7',
  `${use(19, 'b5', 'Bash', { command: 'crlf line' })}\r`,
  use(20, 'b6', 'Bash', { command: 'still running' }),
  use(21, 'w7', 'Write', { file_path: 'C:/work/late.ts' })
];

/** The corpus as one text, every line newline-terminated except, optionally, the last. @es El corpus como un texto. */
const corpusText = ({ bom = false, torn = false } = {}) => `${bom ? '\uFEFF' : ''}${CORPUS.join('\n')}${torn ? '' : '\n'}`;

let fileCounter = 0;

/** A fresh session layout `<root>/proj/<session>.jsonl` and a worker under it. @es Un árbol de sesión nuevo. */
function freshStore() {
  fileCounter += 1;
  const root = path.join(scratch, `store-${fileCounter}`);

  mkdirSync(path.join(root, 'proj', 'sess', 'subagents'), { recursive: true });
  writeFileSync(path.join(root, 'proj', 'sess', 'subagents', 'agent-w.meta.json'), '{}');

  return { root, main: path.join(root, 'proj', 'sess.jsonl'), worker: path.join(root, 'proj', 'sess', 'subagents', 'agent-w.jsonl') };
}

/** Sets a file's mtime to `ageMs` before `now`, growing monotonically so an append is never read as a replacement. @es Fija la mtime de un fichero. */
function age(file, now, ageMs) {
  const when = new Date(now - ageMs);

  utimesSync(file, when, when);
}

// --- Part A: the readers agree after every chunk, whatever the cut points ---
// @es Parte A: los lectores coinciden tras cada trozo, sean cuales sean los puntos de corte.
for (const [label, options] of [['plain', {}], ['bom', { bom: true }], ['torn last line', { torn: true }]]) {
  for (const seed of [1, 7, 42, 1234, 99_999]) {
    const random = seeded(seed);
    const store = freshStore();
    const bytes = Buffer.from(corpusText(options));
    const now = T0 + 3_600_000;
    let written = 0;
    let step = 0;
    let agreed = true;
    let firstDisagreement = '';

    writeFileSync(store.main, '');
    writeFileSync(store.worker, '');

    while (written < bytes.length) {
      const next = Math.min(bytes.length, written + 1 + Math.floor(random() * 700));

      appendFileSync(store.main, bytes.subarray(written, next));
      appendFileSync(store.worker, bytes.subarray(written, next));
      written = next;
      step += 1;
      age(store.main, now, 60_000 - step);
      age(store.worker, now, ACTIVE_WINDOW_MS + 60_000 - step);

      const records = agentRecords(store.root);
      const indexed = outcome(() => liveAgentWrites(now, records));
      const whole = wholeTextAgents(now, records);

      if (!isDeepStrictEqual(indexed, whole)) {
        agreed = false;
        firstDisagreement ||= `after ${String(written)} bytes: indexed ${JSON.stringify([...(indexed instanceof Map ? indexed : [])])} whole ${JSON.stringify([...whole])}`;
      }
    }

    check(`readers agree after every chunk (${label}, seed ${String(seed)}, ${String(step)} chunks)${firstDisagreement === '' ? '' : `: ${firstDisagreement}`}`, agreed, true);
  }
}

{
  const store = freshStore();
  const now = T0 + 3_600_000;

  writeFileSync(store.main, corpusText());
  writeFileSync(store.worker, corpusText());
  age(store.main, now, 1000);
  age(store.worker, now, ACTIVE_WINDOW_MS + 1000);

  const indexed = liveAgentWrites(now, agentRecords(store.root));

  check('the corpus is not vacuous: the live main session wrote the four structured targets, deduplicated', indexed.get('main-sess')?.writes, ['c:/work/a.ts', 'c:/work/sub/ñandú.ts', 'c:/work/n.ipynb', 'c:/work/late.ts']);
  check('the corpus is not vacuous: the finished worker\'s open calls end where its transcript ends, not at now', indexed.get('agent-w')?.windows.at(-1)?.end, Date.parse(at(21)));
  check('readers agree on a whole file read at once', indexed, wholeTextAgents(now, agentRecords(store.root)));

  writeFileSync(store.main, `${use(1, 'x1', 'Write', { file_path: 'C:/replaced/only.ts' })}\n`);
  age(store.main, now, 500);
  check('readers agree after the transcript is replaced by a different, shorter one', liveAgentWrites(now, agentRecords(store.root)), wholeTextAgents(now, agentRecords(store.root)));
}

// --- Part B: every repo state decides the same with the lazy indexed agents and the eager whole-text ones ---
// @es Parte B: cada estado de repo decide lo mismo con los agentes perezosos e indexados y con los anticipados.
const WORKTREE = path.join(scratch, 'repo');

mkdirSync(WORKTREE, { recursive: true });

/** A fake declared repo whose git answers are fixed. @es Un repo declarado falso con respuestas de git fijas. */
function fakeRepo(name, { statusOk = true, statusText = '## master...origin/master\n', logText = '', worktree = WORKTREE } = {}) {
  return {
    name,
    worktree,
    run: (args) => (args.includes('log') ? { ok: true, stdout: logText, stderr: '' } : { ok: statusOk, stdout: statusText, stderr: statusOk ? '' : 'simulated git failure' }),
    gitPrefix: `git-${name}`,
    deliveryRoute: 'commit',
    pushCommand: `push-${name}`
  };
}

const store = freshStore();
const NOW = Date.now();
const live = (file, lines) => {
  writeFileSync(file, `${lines.join('\n')}\n`);
  age(file, NOW, 60_000);
};
const target = (name) => path.join(WORKTREE, name);

mkdirSync(path.join(store.root, 'proj', 'other', 'subagents'), { recursive: true });
writeFileSync(path.join(store.root, 'proj', 'other', 'subagents', 'agent-o.meta.json'), '{}');
live(store.main, [use(1, 's1', 'Write', { file_path: target('mine.ts') })]);
live(store.worker, [use(1, 'w1', 'Edit', { file_path: target('worker.ts') })]);
live(path.join(store.root, 'proj', 'other', 'subagents', 'agent-o.jsonl'), [use(1, 'o1', 'Write', { file_path: target('theirs.ts') }), use(2, 'o2', 'Write', { file_path: target('shared/commit-path.ts') })]);

for (const name of ['mine.ts', 'worker.ts', 'theirs.ts', 'nobody.ts']) writeFileSync(target(name), 'x');

const aheadLog = (hash, ...paths) => `\u0001${hash} subject ${hash}\n${paths.join('\n')}\n`;
const STATES = [
  ['clean', { statusText: '## master...origin/master\n' }],
  ['dirty, written by this session', { statusText: '## master...origin/master\n M mine.ts\n' }],
  ['dirty, written by this session\'s worker', { statusText: '## master...origin/master\n M worker.ts\n' }],
  ['dirty, written by another session', { statusText: '## master...origin/master\n M theirs.ts\n' }],
  ['dirty, written by nobody live', { statusText: '## master...origin/master\n M nobody.ts\n' }],
  ['dirty, untracked directory', { statusText: '## master...origin/master\n?? shared/\n' }],
  ['ahead by a foreign commit', { statusText: '## master...origin/master [ahead 1]\n', logText: aheadLog('aaa1111', 'shared/commit-path.ts') }],
  ['ahead by an unowned commit', { statusText: '## master...origin/master [ahead 1]\n', logText: aheadLog('bbb2222', 'unknown.ts') }],
  ['missing', { worktree: path.join(scratch, 'no-such-repo') }],
  ['unmeasurable', { statusOk: false }]
];
const payloadFor = (session) => ({ session_id: session, stop_hook_active: false, hook_event_name: 'Stop', transcript_path: store.main });
const common = { now: NOW, mtimeOf: () => NOW - 30_000, fingerprintOf: () => undefined, dismissals: [], authoredWrites: [] };
const ledger = { file: path.join(scratch, 'pending.jsonl') };
let lazyReads = 0;

for (const session of ['sess', 'someone-else', undefined]) {
  for (const [firstLabel, first] of STATES) {
    for (const [secondLabel, second] of [STATES[0], STATES[1], STATES[4], STATES[8]]) {
      const repos = [fakeRepo('first', first), fakeRepo('second', second)];
      const eager = { ...common, repos, liveAgents: wholeTextAgents(NOW, agentRecords(store.root)) };
      const lazy = { ...common, repos, readLiveAgents: () => { lazyReads += 1; return liveAgentWrites(NOW, agentRecords(store.root)); } };
      const raw = JSON.stringify(payloadFor(session));
      const label = `${firstLabel} + ${secondLabel}, session ${String(session)}`;

      check(`decision identical: ${label}`, outcome(() => decide(payloadFor(session), lazy)), outcome(() => decide(payloadFor(session), eager)));
      check(`hook output byte-identical: ${label}`, JSON.stringify(outcome(() => evaluate(raw, lazy, ledger))), JSON.stringify(outcome(() => evaluate(raw, eager, ledger))));
    }
  }
}

check('the matrix is not vacuous: a commit only another session\'s live agent wrote is foreign, noted', decide(payloadFor('sess'), { ...common, repos: [fakeRepo('a', STATES[6][1])], readLiveAgents: () => liveAgentWrites(NOW, agentRecords(store.root)) })?.notes?.[0]?.includes('aaa1111 (agent-o)'), true);
check('the matrix is not vacuous: some states block and some note', [JSON.stringify(decide(payloadFor('sess'), { ...common, repos: [fakeRepo('a', STATES[1][1])], readLiveAgents: () => liveAgentWrites(NOW, agentRecords(store.root)) }))?.includes('"block"'), decide(payloadFor('sess'), { ...common, repos: [fakeRepo('a', STATES[4][1])], readLiveAgents: () => liveAgentWrites(NOW, agentRecords(store.root)) })?.kind], [true, 'note']);

{
  let reads = 0;
  const count = () => {
    reads += 1;

    return liveAgentWrites(NOW, agentRecords(store.root));
  };

  decide(payloadFor('sess'), { ...common, repos: [fakeRepo('a'), fakeRepo('b'), fakeRepo('m', STATES[8][1]), fakeRepo('u', STATES[9][1])], readLiveAgents: count });
  check('a Stop whose repos are clean, missing or unmeasurable never reads a transcript', reads, 0);
  decide(payloadFor('sess'), { ...common, repos: [fakeRepo('a', STATES[1][1]), fakeRepo('b', STATES[6][1])], readLiveAgents: count });
  check('two repos that need the agents read them once', reads, 1);
  check('the lazy reader was exercised by the matrix', lazyReads > 0, true);
}

// --- the one deliberate difference ---
{
  const throwing = () => {
    throw new Error('the projects root cannot be listed');
  };

  check('a census that throws, with only clean and missing repos: the lazy guard still reports the missing repo', decide(payloadFor('sess'), { ...common, repos: [fakeRepo('a'), fakeRepo('m', STATES[8][1])], readLiveAgents: throwing })?.kind, 'note');
  check('a census that throws when a repo needs it still fails open, as before', evaluate(JSON.stringify(payloadFor('sess')), { ...common, repos: [fakeRepo('a', STATES[1][1])], readLiveAgents: throwing }, ledger), undefined);
}

if (failures.length > 0) {
  console.error(`config-sync-guard incremental-equivalence selftest FAILED (${String(failures.length)} of ${String(passed + failures.length)}). @es el selftest de equivalencia incremental de config-sync-guard FALLÓ.`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`config-sync-guard incremental-equivalence selftest OK (${String(passed)} checks). @es el selftest de equivalencia incremental de config-sync-guard está OK (${String(passed)} comprobaciones).`);
