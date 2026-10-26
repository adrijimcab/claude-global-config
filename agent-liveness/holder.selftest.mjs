#!/usr/bin/env node
/**
 * Selftest of the shared holder decision (`holder.mjs`) over a CONSTRUCTED harness store: the records are
 * read back with `agentRecords(store)`, so their shape is the one the harness store yields, never a hand-made
 * approximation. Every state is driven — `live` (recorded start, fresh transcript), `resumable`, `unresumable`
 * (past the ledger size, context-length stop), `none` (no record, another worktree, no transcript) — plus the
 * latest-record rule, the brief claim of a non-isolated taker, the threshold edge, and the incident payload:
 * the 37-commit worktree whose agent `ac19aff` held a 21.87 MB transcript.
 * @es Selftest de la decisión compartida de titular sobre un store de harness CONSTRUIDO y leído con
 * `agentRecords(store)`, para que la forma de los registros sea la real. Recorre cada estado, la regla del
 * registro más reciente, la reclamación por brief, el borde del umbral y el caso del incidente.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { declarationOf, tenancyLines } from '../brief-tenancy/tenancy-declaration.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { EXHAUSTED_TRANSCRIPT_BYTES, RESUMABLE_WINDOW_MS, holderOf, resumabilityOf, sessionOf, takeoverDeclaration } from './holder.mjs';
import { lifecycleFrom } from './lifecycle-log.mjs';
import { agentRecords } from './liveness.mjs';

isolateState('agent-liveness');

const NOW = Date.parse('2026-10-26T12:00:00Z');
/** The dispatching session, and the folder its records sit in. @es La sesión que despacha y la carpeta de sus registros. */
const SESSION = 'session-1';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const scratch = mkdtempSync(join(tmpdir(), 'holder-selftest-'));

process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

/** The measured context-length stop of aa3437bf9bf7832a9, reused from resume-before-fresh. @es La parada medida por longitud de contexto. */
const CONTEXT_STOP = JSON.stringify(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'resume-before-fresh', 'fixtures', 'aa3437bf9bf7832a9.last-record.json'), 'utf8')));

/** A linked worktree folder: its `.git` is a FILE. @es Un worktree enlazado: su `.git` es un FICHERO. */
function linkedWorktree(name) {
  const folder = join(scratch, 'repo', '.claude', 'worktrees', name);

  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, '.git'), 'gitdir: elsewhere\n');

  return folder.split('\\').join('/');
}

/**
 * One harness record in a fresh store, read back through `agentRecords`: `agent-<id>.meta.json` beside its
 * `agent-<id>.jsonl` transcript, under `<store>/<project>/<session>/subagents/`.
 * @es Un registro de harness en un store nuevo, leído con `agentRecords`.
 */
function store(agents) {
  const root = mkdtempSync(join(scratch, 'store-'));

  for (const { id, worktreePath = '', brief = '', last = '{}', ageMs = 2 * HOUR, sizeBytes = 0, transcript = true, session = SESSION } of agents) {
    const folder = join(root, 'C--repo', session, 'subagents');

    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, `agent-${id}.meta.json`), JSON.stringify({ agentType: 'general-purpose', description: `errand of ${id}`, ...(worktreePath === '' ? {} : { worktreePath }) }));

    if (!transcript) continue;

    const file = join(folder, `agent-${id}.jsonl`);
    const first = JSON.stringify({ type: 'user', message: { role: 'user', content: brief } });

    writeFileSync(file, `${first}\n${last}\n`);
    // A size past the content is reached by extending the file (sparse), so a 21.87 MB transcript costs nothing.
    // @es Un tamaño mayor que el contenido se alcanza extendiendo el fichero (disperso): no cuesta nada.
    if (sizeBytes > 0) truncateSync(file, sizeBytes);
    utimesSync(file, new Date(NOW - ageMs), new Date(NOW - ageMs));
  }

  return agentRecords(root);
}

const recorded = (...events) => lifecycleFrom(events.map(([event, id, ageMs]) => JSON.stringify({ event, agent_id: id, time: new Date(NOW - ageMs).toISOString() })).join('\n'));
const NOTHING = new Map();
const holder = (worktree, records, lifecycle = NOTHING, session = SESSION) => holderOf(worktree, { records, now: NOW, lifecycle, session });
const brief = (path) => `MEASURED: none.\nTENANCY: ${path} — taking it over.\nGOAL: finish it.`;

let failures = 0;
let checked = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
}

const state = (verdict) => [verdict.state, verdict.agentId];
const W = linkedWorktree('wt-holder');
const OTHER = linkedWorktree('wt-other');

// --- none
check('no record: none', state(holder(W, [])), ['none', undefined]);
check('a record of ANOTHER worktree: none', state(holder(W, store([{ id: 'aOTHER', worktreePath: OTHER }]))), ['none', undefined]);
check('a record with no transcript: none (nothing to resume, nothing exhausted)', state(holder(W, store([{ id: 'aGHOST', worktreePath: W, transcript: false }]))), ['none', undefined]);
check('the none reason is bilingual', holder(W, []).reason.includes('@es ningún registro'), true);

// --- live
check('a recorded start with no stop: live', state(holder(W, store([{ id: 'aSTARTED', worktreePath: W }]), recorded(['start', 'aSTARTED', 10 * MINUTE]))), ['live', 'agent-aSTARTED']);
check('no lifecycle and a transcript written a minute ago: live (the window rule)', state(holder(W, store([{ id: 'aFRESH', worktreePath: W, ageMs: MINUTE }]))), ['live', 'agent-aFRESH']);
check('a live holder beats an exhausted transcript', state(holder(W, store([{ id: 'aBUSY', worktreePath: W, ageMs: MINUTE, sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES + 1 }]))), ['live', 'agent-aBUSY']);

// --- resumable / unresumable
check('a stopped small transcript: resumable', state(holder(W, store([{ id: 'aSMALL', worktreePath: W }]), recorded(['stop', 'aSMALL', HOUR]))), ['resumable', 'agent-aSMALL']);
check('exactly the threshold: resumable', state(holder(W, store([{ id: 'aEDGE', worktreePath: W, sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES }]))), ['resumable', 'agent-aEDGE']);
check('one byte past the threshold: unresumable', state(holder(W, store([{ id: 'aOVER', worktreePath: W, sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES + 1 }]))), ['unresumable', 'agent-aOVER']);
check('the measured context-length stop: unresumable', state(holder(W, store([{ id: 'aCONTEXT', worktreePath: W, last: CONTEXT_STOP }]))), ['unresumable', 'agent-aCONTEXT']);
check('the size reason names the bytes and the threshold, in both languages', ['transcript is 2000001 bytes, past 2000000', '@es', 'irreanudable'].every((part) => holder(W, store([{ id: 'aOVER', worktreePath: W, sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES + 1 }])).reason.includes(part)), true);
const OTHER_CLASS = JSON.stringify({ ...JSON.parse(CONTEXT_STOP), error: 'rate_limit' });

check('the context-length text with another error class (a rate limit) stays resumable', state(holder(W, store([{ id: 'aRATE', worktreePath: W, last: OTHER_CLASS }]))), ['resumable', 'agent-aRATE']);
check('the context reason names the context failure', holder(W, store([{ id: 'aCONTEXT', worktreePath: W, last: CONTEXT_STOP }])).reason.includes('context-length failure'), true);
const probe = (bytes, lastWrite, session = SESSION) => resumabilityOf({ transcript: join(scratch, 'C--repo', SESSION, 'subagents', 'agent-none.jsonl') }, { now: NOW, session, bytes, lastWrite });

check('the per-record answer: a small fresh own record is resumable', [probe(10, NOW - HOUR).resumable, probe(10, NOW - HOUR).causes], [true, []]);
check('the per-record answer names every cause, in order', probe(EXHAUSTED_TRANSCRIPT_BYTES + 1, NOW - RESUMABLE_WINDOW_MS - 1, 'another').causes, ['oversized', 'stale', 'other-session']);
check('exhausted is the context or size half alone', [probe(EXHAUSTED_TRANSCRIPT_BYTES + 1, NOW).exhausted, probe(10, NOW - RESUMABLE_WINDOW_MS - 1).exhausted], [true, false]);
check('exactly the window edge is still inside it', probe(10, NOW - RESUMABLE_WINDOW_MS).resumable, true);
check('the session is the folder above subagents/', sessionOf({ transcript: join('store', 'C--repo', 'sess-x', 'subagents', 'agent-a.jsonl') }), 'sess-x');

// --- RESUMABLE FROM THE DISPATCHING SESSION, inside the window (2026-10-26): a subagent resumes only from the
// session that spawned it, and only inside RESUMABLE_WINDOW_MS, so outside either it is unresumable here.
// @es REANUDABLE DESDE LA SESIÓN QUE DESPACHA y dentro de la ventana: fuera de cualquiera es irreanudable aquí.
check('a holder last written outside the window: unresumable', state(holder(W, store([{ id: 'aSTALE', worktreePath: W, ageMs: RESUMABLE_WINDOW_MS + HOUR }]))), ['unresumable', 'agent-aSTALE']);
check('the window reason says so, in both languages', ['outside the 24 h resume window', 'fuera de la ventana de 24 h'].every((part) => holder(W, store([{ id: 'aSTALE', worktreePath: W, ageMs: RESUMABLE_WINDOW_MS + HOUR }])).reason.includes(part)), true);
check('a holder of ANOTHER session: unresumable', state(holder(W, store([{ id: 'aFOREIGN', worktreePath: W, session: 'session-2' }]))), ['unresumable', 'agent-aFOREIGN']);
check('the session reason names both sessions, in both languages', ['belongs to session session-2, not the dispatching one (session-1)', 'solo se reanuda desde la sesión que lo lanzó'].every((part) => holder(W, store([{ id: 'aFOREIGN', worktreePath: W, session: 'session-2' }])).reason.includes(part)), true);
const unknownSession = holderOf(W, { records: store([{ id: 'aSMALL', worktreePath: W }]), now: NOW, lifecycle: NOTHING });

check('with no dispatching session, no holder is its own: unresumable', [state(unknownSession), unknownSession.reason.includes('(unknown)')], [['unresumable', 'agent-aSMALL'], true]);
check('a live holder of another session is still live', state(holder(W, store([{ id: 'aFOREIGNBUSY', worktreePath: W, session: 'session-2', ageMs: MINUTE }]))), ['live', 'agent-aFOREIGNBUSY']);

// --- several records on one worktree: the most recent decides
// `agentRecords` lists a store in directory order, so the ids are chosen to put the older record FIRST in one
// pair and LAST in the other: neither list position can stand in for recency.
// @es `agentRecords` lista el store en orden de directorio: los ids ponen el registro viejo PRIMERO en un par y
// ÚLTIMO en el otro, para que ninguna posición pueda hacerse pasar por la recencia.
const olderFirst = store([{ id: 'aAOLDHUGE', worktreePath: W, sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES + 1, ageMs: 5 * HOUR }, { id: 'aZNEWSMALL', worktreePath: W, ageMs: 2 * HOUR }]);
const newerFirst = store([{ id: 'aANEWHUGE', worktreePath: W, sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES + 1, ageMs: 2 * HOUR }, { id: 'aZOLDSMALL', worktreePath: W, ageMs: 5 * HOUR }]);

check('the fixture lists the older record first in one pair and last in the other', [olderFirst.map((record) => record.id), newerFirst.map((record) => record.id)], [['agent-aAOLDHUGE', 'agent-aZNEWSMALL'], ['agent-aANEWHUGE', 'agent-aZOLDSMALL']]);
check('an older exhausted holder listed first and a NEWER small one: resumable (the newer decides)', state(holder(W, olderFirst)), ['resumable', 'agent-aZNEWSMALL']);
check('a NEWER exhausted holder listed first and an older small one: unresumable (the newer decides)', state(holder(W, newerFirst)), ['unresumable', 'agent-aANEWHUGE']);

// --- the brief claim of an agent launched without isolation
check('a taker whose brief declares the linked worktree holds it', state(holder(W, store([{ id: 'aTAKER', brief: brief(W), sizeBytes: EXHAUSTED_TRANSCRIPT_BYTES + 1 }]))), ['unresumable', 'agent-aTAKER']);
check('a taker whose brief declares another worktree does not', state(holder(W, store([{ id: 'aTAKER', brief: brief(OTHER) }]))), ['none', undefined]);
const notLinked = join(scratch, 'plain', 'wt-holder');

mkdirSync(notLinked, { recursive: true });
check('a brief claim is read only for a linked worktree (no .git file: none)', state(holder(notLinked, store([{ id: 'aTAKER', brief: brief(notLinked) }]))), ['none', undefined]);
check('the harness worktree wins over the brief of the same record', state(holder(W, store([{ id: 'aBOTH', worktreePath: OTHER, brief: brief(W) }]))), ['none', undefined]);
check('worktrees are compared by directory name, case folded', state(holder(W.toUpperCase().slice(0, -'wt-holder'.length) + 'WT-HOLDER', store([{ id: 'aSMALL', worktreePath: W }]))), ['resumable', 'agent-aSMALL']);
const UPPER = linkedWorktree('WT-UPPER');

check('a harness worktree recorded in capitals holds the same name asked in lower case', state(holder(UPPER.slice(0, -'WT-UPPER'.length) + 'wt-upper', store([{ id: 'aUPPER', worktreePath: UPPER }]))), ['resumable', 'agent-aUPPER']);

// --- the INCIDENT (2026-10-26): ac19aff held the 37-commit worktree with a 21.87 MB transcript.
const INCIDENT = linkedWorktree('agent-ac19aff0000000000');
const incident = holder(INCIDENT, store([{ id: 'ac19aff0000000000', worktreePath: INCIDENT, sizeBytes: 21_870_000, ageMs: 3 * HOUR }]), recorded(['start', 'ac19aff0000000000', 9 * HOUR], ['stop', 'ac19aff0000000000', 3 * HOUR]));

check('INCIDENT: the 21.87 MB holder of the 37-commit worktree is unresumable', state(incident), ['unresumable', 'agent-ac19aff0000000000']);
check('INCIDENT: the reason names its size', incident.reason.includes('21870000 bytes'), true);

// --- the takeover declaration: one format, read back by the shared marker reader
const declaration = takeoverDeclaration(INCIDENT);

check('the takeover line heads a TENANCY marker the shared reader finds', tenancyLines(declaration.en).length, 1);
check('the takeover line declares exactly that worktree', [declarationOf(declaration.en, INCIDENT), declarationOf(declaration.en, OTHER)], ['present', 'unnamed']);
check('the Spanish takeover line declares it too', declarationOf(declaration.es, INCIDENT), 'present');
check('the takeover line names both causes', [declaration.en.includes('context failure or oversized transcript'), declaration.es.includes('irreanudable')], [true, true]);

console.log(`\n${checked - failures}/${checked} cases green @es ${checked - failures}/${checked} casos en verde`);
process.exit(failures === 0 ? 0 : 1);
