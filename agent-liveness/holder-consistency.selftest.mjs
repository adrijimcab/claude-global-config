#!/usr/bin/env node
/**
 * CROSS-GUARD CONSISTENCY of the holder decision: the same constructed world — one governed repository, its
 * parked worktree, one harness store, one lifecycle — fed to BOTH `resume-before-fresh` and
 * `fleet-kit/orphan-work`, over the matrix {live, resumable, unresumable, none} × {no TENANCY, TENANCY of this
 * worktree, TENANCY of another worktree}, plus a fifth row: the incident's exhausted agent SUPERSEDED by a newer
 * resumable holder of the same worktree, where the latest-record rule decides; a holder of ANOTHER session; and
 * a holder last written OUTSIDE the resume window (both unresumable from the dispatching session).
 *
 * THE INCIDENT IT REPRODUCES (2026-10-26, the Discovery session): a worktree with 37 unlanded commits whose
 * agent `ac19aff` held a 21.87 MB transcript. `resume-before-fresh` advised a fresh replacement carrying a
 * `TENANCY:` line for that worktree, and `orphan-work` refused that very replacement. The fixture is that
 * worktree — 37 commits in no integration branch — and that transcript size, in records read back with
 * `agentRecords()` so their shape is the harness's own.
 *
 * THE INVARIANT. "Resume-before-fresh advises a takeover of W" is read from its output exactly as a worker
 * would act on it: the `TENANCY:` lines it prints, read with orphan-work's own declaration reader. Then:
 *   I1  on a brief that already declares W, never (resume-before-fresh advises the takeover of W) AND
 *       (orphan-work refuses because of W);
 *   I2  following the advice clears it: the brief plus every advised line is never refused because of an
 *       advised worktree;
 *   I3  orphan-work never clears W unless the holder is unresumable and the brief declares exactly W;
 *   I4  resume-before-fresh offers a resume exactly when the holder decision reads the holder resumable (or
 *       live) from the dispatching session and the brief names that holder's errand: by W itself, or by the
 *       wording of the holder's own errand (the superseded row's wording names the OLD agent, not the holder).
 *       A brief naming another worktree is another errand.
 * The literal "never both on the same brief" cannot hold for a brief that does NOT yet declare W: there the
 * advice is to ADD the line, and refusing the undeclared brief is case (d) of the design. I2 is the form of
 * the invariant that this case owes.
 *
 * @es CONSISTENCIA ENTRE GUARDS de la decisión de titular: el mismo mundo construido se da a
 * `resume-before-fresh` y a `orphan-work` sobre la matriz {live, resumable, unresumable, none} × {sin TENANCY,
 * TENANCY de este worktree, TENANCY de otro}. Reproduce el incidente: 37 commits sin aterrizar y un transcript
 * de 21,87 MB. INVARIANTE: I1 con el brief ya declarando W, nunca aconseja relevar W y a la vez se rechaza por
 * W; I2 seguir el consejo lo despeja; I3 orphan-work nunca despeja W salvo titular irreanudable y W declarado.
 */

import { mkdirSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { baseConfig, cleanup, commitFiles, git, makeRepository, tempDir, writeConfig } from '../fleet-kit/testing/fixtures.mjs';
import { canonicalPath, declaredTenancies, evaluateWith, parkedWork } from '../fleet-kit/orphan-work/guard.mjs';
import { evaluate as resumeEvaluate, projectSlug } from '../resume-before-fresh/guard.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { holderOf, takeoverDeclaration } from './holder.mjs';
import { appendLifecycle } from './lifecycle-log.mjs';
import { agentRecords } from './liveness.mjs';

isolateState('agent-liveness');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NOW = Date.now();
const SESSION = 'c45d798b-d78f-4f60-9a32-1f722bbe86e5';
const ERRAND = 'Finish the discovery migration study';
const INCIDENT_BYTES = 21_870_000;
const INCIDENT_COMMITS = 37;

let failures = 0;
let checked = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`}`);
}

const root = tempDir('holder-consistency');

try {
  const repository = makeRepository(root);
  const worktreeOf = (name) => path.join(repository, '.claude', 'worktrees', name);
  const threeHoursAgo = new Date(NOW - 3 * HOUR).toISOString();

  writeConfig(repository, baseConfig());
  process.env.CLAUDE_PROJECT_DIR = repository;

  // The incident worktree: 37 commits in no integration branch, last touched three hours ago.
  // @es El worktree del incidente: 37 commits en ninguna rama de integración, tocado hace tres horas.
  const W = worktreeOf('agent-ac19aff0000000000');
  const O = worktreeOf('agent-aOTHER000000000');

  git(repository, 'worktree', 'add', '--quiet', '-b', 'discovery-study', W);
  for (let index = 1; index <= INCIDENT_COMMITS; index += 1) commitFiles(W, { [`step-${index}.txt`]: `${index}\n` }, `feat: study step ${index}`);
  git(W, 'commit', '--amend', '--no-edit', '--quiet', '--date', threeHoursAgo);
  git(repository, 'worktree', 'add', '--quiet', '-b', 'other-errand', O);

  /**
   * One state of W's holder, as a harness store read back with `agentRecords`, and its lifecycle lines.
   * @es Un estado del titular de W: un store de harness leído con `agentRecords`, y su ciclo de vida.
   */
  const holderRecord = (store, { id, session = SESSION, description = ERRAND, bytes = 0, ageMs = 3 * HOUR, stopped = true }) => {
    const folder = path.join(store, projectSlug(repository), session, 'subagents');
    const transcript = path.join(folder, `agent-${id}.jsonl`);

    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, `agent-${id}.meta.json`), JSON.stringify({ agentType: 'general-purpose', description, worktreePath: W }));
    writeFileSync(transcript, `${JSON.stringify({ type: 'user', message: { role: 'user', content: `GOAL: ${description}.` } })}\n`);
    // A size past the content is reached by extending the file (sparse): the 21.87 MB costs nothing.
    // @es Un tamaño mayor que el contenido se alcanza extendiendo el fichero (disperso).
    if (bytes > 0) truncateSync(transcript, bytes);
    utimesSync(transcript, new Date(NOW - ageMs), new Date(NOW - ageMs));
    appendLifecycle({ event: 'start', agent_id: id, time: new Date(NOW - ageMs - 2 * HOUR).toISOString() });
    if (stopped) appendLifecycle({ event: 'stop', agent_id: id, time: new Date(NOW - ageMs).toISOString() });
  };
  const world = (state) => {
    const store = path.join(root, `store-${state.split(' ').join('-')}`);

    mkdirSync(store, { recursive: true });

    if (state === 'live') holderRecord(store, { id: 'ac19afflive', stopped: false });
    if (state === 'resumable') holderRecord(store, { id: 'ac19affresumable' });
    if (state === 'unresumable') holderRecord(store, { id: 'ac19affunresumable', bytes: INCIDENT_BYTES });
    // A small, recent holder that cannot be resumed FROM HERE: spawned by another session, or written outside the
    // resume window. Both are unresumable in the one decision, so both guards must treat them as the incident.
    // @es Un titular pequeño y reciente que no se reanuda DESDE AQUÍ: de otra sesión, o fuera de la ventana.
    if (state === 'other session') holderRecord(store, { id: 'ac19affforeign', session: 'another-session' });
    if (state === 'older than window') holderRecord(store, { id: 'ac19affstale', ageMs: 30 * HOUR });

    // SUPERSEDED: the incident's exhausted agent, then a NEWER one of THIS session, resumable from here, on the
    // same worktree. The holder is the newer one, so a takeover must be neither advised nor accepted.
    // @es SUSTITUIDO: el agente agotado del incidente y luego uno MÁS NUEVO de ESTA sesión, reanudable desde
    // aquí, en el mismo worktree. El titular es el nuevo: no se aconseja ni se acepta un relevo.
    if (state === 'superseded') {
      holderRecord(store, { id: 'ac19affsuperseded', bytes: INCIDENT_BYTES, ageMs: 5 * HOUR });
      holderRecord(store, { id: 'anewersuperseded', description: 'Carry on with the study notes', ageMs: 3 * HOUR });
    }

    return agentRecords(store);
  };

  const briefs = {
    'no TENANCY': `GOAL: ${ERRAND}.`,
    'TENANCY same': `GOAL: ${ERRAND}.\n${takeoverDeclaration(W).en}`,
    'TENANCY other': `GOAL: ${ERRAND}.\n${takeoverDeclaration(O).en}`
  };
  const canonical = (folder) => canonicalPath(folder);
  const payload = (prompt) => ({ session_id: SESSION, tool_name: 'Agent', cwd: repository, tool_input: { description: ERRAND, prompt } });
  const refusedBecauseOf = (records, prompt) => parkedWork(payload(prompt), { records, now: NOW }).map(({ worktree }) => canonical(worktree.path));
  const advisedTakeovers = (records, prompt) => {
    const output = resumeEvaluate(JSON.stringify(payload(prompt)), { records, now: NOW });

    return [...declaredTenancies({ tool_input: { prompt: output?.hookSpecificOutput?.additionalContext ?? '' } })];
  };
  const w = canonical(W);

  // The fixture is the incident: 37 unlanded commits, read by the guard's own measurement.
  // @es El fixture es el incidente: 37 commits sin aterrizar, leídos por la medición del propio guard.
  const incidentRecords = world('unresumable');

  check('INCIDENT fixture: the worktree holds 37 commits in no integration branch', parkedWork(payload(briefs['no TENANCY']), { records: incidentRecords, now: NOW }).find(({ worktree }) => canonical(worktree.path) === w)?.work, { dirty: 0, unintegrated: INCIDENT_COMMITS });
  check('INCIDENT fixture: the record shape is the harness store\'s', Object.keys(incidentRecords[0]).sort(), ['description', 'id', 'project', 'transcript', 'worktree', 'worktreePath']);
  check('INCIDENT fixture: its holder is unresumable for its 21.87 MB transcript', [holderOf(W, { records: incidentRecords, now: NOW, session: SESSION }).state, holderOf(W, { records: incidentRecords, now: NOW, session: SESSION }).reason.includes(`${INCIDENT_BYTES} bytes`)], ['unresumable', true]);

  // What each guard says, cell by cell. The rows are the design's cases (a)-(e); the invariants follow.
  // @es Lo que dice cada guard, celda a celda; las filas son los casos (a)-(e) del diseño.
  const expected = {
    live: { 'no TENANCY': [false, false], 'TENANCY same': [false, false], 'TENANCY other': [false, false] },
    resumable: { 'no TENANCY': [false, true], 'TENANCY same': [false, true], 'TENANCY other': [false, true] },
    unresumable: { 'no TENANCY': [true, true], 'TENANCY same': [true, false], 'TENANCY other': [false, true] },
    none: { 'no TENANCY': [false, true], 'TENANCY same': [false, true], 'TENANCY other': [false, true] },
    superseded: { 'no TENANCY': [false, true], 'TENANCY same': [false, true], 'TENANCY other': [false, true] },
    'other session': { 'no TENANCY': [true, true], 'TENANCY same': [true, false], 'TENANCY other': [false, true] },
    'older than window': { 'no TENANCY': [true, true], 'TENANCY same': [true, false], 'TENANCY other': [false, true] }
  };
  const holderState = { live: 'live', resumable: 'resumable', unresumable: 'unresumable', none: 'none', superseded: 'resumable', 'other session': 'unresumable', 'older than window': 'unresumable' };

  for (const state of ['live', 'resumable', 'unresumable', 'none', 'superseded', 'other session', 'older than window']) {
    const records = state === 'unresumable' ? incidentRecords : world(state);

    check(`[${state}] the holder decision reads ${holderState[state]}`, holderOf(W, { records, now: NOW, session: SESSION }).state, holderState[state]);

    for (const [shape, prompt] of Object.entries(briefs)) {
      const advised = advisedTakeovers(records, prompt);
      const refused = refusedBecauseOf(records, prompt);
      const declaresW = declaredTenancies({ tool_input: { prompt } }).has(w);

      check(`[${state} × ${shape}] resume-before-fresh advises the takeover of W / orphan-work refuses because of W`, [advised.includes(w), refused.includes(w)], expected[state][shape]);

      // I1 — on a brief that declares W, the advice and the refusal never coexist.
      if (declaresW) check(`[${state} × ${shape}] I1: never advised AND refused on a brief declaring W`, advised.includes(w) && refused.includes(w), false);

      // I2 — following the advice, line for line, clears every advised worktree.
      const followed = [prompt, ...advised.map((folder) => takeoverDeclaration(folder).en)].join('\n');

      check(`[${state} × ${shape}] I2: the brief that follows the advice is refused over no advised worktree`, refusedBecauseOf(records, followed).filter((folder) => advised.includes(folder)), []);

      const holder = holderOf(W, { records, now: NOW, session: SESSION }).state;

      // I4 — the offer to resume derives from the same answer: resume-before-fresh refuses (offering a resume)
      // only while the holder decision reads W's holder resumable or live, and always when it does.
      const offered = resumeEvaluate(JSON.stringify(payload(prompt)), { records, now: NOW })?.hookSpecificOutput?.permissionDecision === 'deny';

      check(`[${state} × ${shape}] I4: a resume is offered exactly when the holder can be resumed from here`, offered, ['resumable', 'live'].includes(holder) && shape !== 'TENANCY other' && !(state === 'superseded' && shape === 'no TENANCY'));

      // I3 — W is cleared only for an unresumable holder declared exactly.
      if (holder !== 'live' && !refused.includes(w)) check(`[${state} × ${shape}] I3: W is cleared only for a declared unresumable holder`, [holder, declaresW], ['unresumable', true]);
    }
  }

  // The hook decisions themselves, for the incident's replacement: orphan-work lets it through (nothing else
  // is parked), and resume-before-fresh does not refuse it.
  // @es Las decisiones de hook para el relevo del incidente: orphan-work lo deja pasar y resume-before-fresh no lo rechaza.
  const replacement = JSON.stringify(payload(briefs['TENANCY same']));

  check('INCIDENT: orphan-work lets the declared replacement through', await evaluateWith({ records: incidentRecords, now: NOW })(replacement), undefined);
  check('INCIDENT: resume-before-fresh does not refuse it', resumeEvaluate(replacement, { records: incidentRecords, now: NOW })?.hookSpecificOutput?.permissionDecision, undefined);
  check('INCIDENT: the undeclared brief is still refused by orphan-work', (await evaluateWith({ records: incidentRecords, now: NOW })(JSON.stringify(payload(briefs['no TENANCY']))))?.hookSpecificOutput?.permissionDecision, 'deny');
} finally {
  cleanup(root);
}

console.log(`\n${checked - failures}/${checked} cases green @es ${checked - failures}/${checked} casos en verde`);
process.exit(failures === 0 ? 0 : 1);
