#!/usr/bin/env node
/**
 * Discrimination proof of WHERE a promotion lands and HOW its text growth is measured.
 *
 * WHERE: by the lesson's OWN scope, never by who repeated it. A project-scoped key is promoted into that
 * project's contract files even when the repeating actor was the orchestrator; a global key goes to the
 * global promoted-rules file even when the repeating actor was a worker.
 *
 * GROWTH: by FACES (`faces.mjs`), never by key occurrences, and for EVERY file the promotion lands in:
 * a paragraph that repeats the key five times is not growth; a new face is; growth in the first of two
 * contract files does not excuse the second; a closure recorded the old way (an occurrence count, no
 * per-file faces) is no baseline. The closure record carries the faces of every file and its scope.
 *
 * @es Prueba de discriminación de DÓNDE aterriza una promoción y CÓMO se mide el crecimiento de su texto.
 * DÓNDE: por el alcance PROPIO de la lección, nunca por quién reincidió. CRECIMIENTO: por CARAS, nunca por
 * apariciones de la clave, y para CADA fichero donde aterriza: un párrafo que repite la clave cinco veces no
 * es crecimiento; una cara nueva sí; crecer en el primero de dos ficheros no excusa al segundo; un cierre
 * registrado a la antigua (cuenta de apariciones, sin caras por fichero) no es línea base. El registro de
 * cierre lleva las caras de cada fichero y su alcance.
 */

import { mkdtempSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { contractFileId } from './closure.mjs';
import { makeCaptureWorld, readOrEmpty } from './capture-world.mjs';
import { promotionTargetOf } from './promotion-target.mjs';

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-scope-')));
const KEY = 'scoped-lesson-key';
const REASON = 'a claim written in prose cannot be detected by any hook; measured 0 of 6 recall';
const GLOBAL_HEAD = '# Lessons Ledger — global\n\n---\n';
const PROJECT_HEAD = '# Lessons Ledger — demo\n\n---\n';
const line = (scope, count) => `- [${scope}] 2026-09-14 — it recurred -> RULE: do the thing <!--fc:${KEY}#${String(count)}-->\n`;
const incident = (actor, at) => `${JSON.stringify({ key: KEY, actor, lesson: 'x', date: at.slice(0, 10), at })}\n`;
const closure = (record) => `${JSON.stringify({ kind: 'promotion', key: KEY, ...record })}\n`;
const items = (count) => Array.from({ length: count }, (_, at) => `- (\`${KEY}\`) face ${String(at + 1)}.\n`).join('');

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 700)}`));
const promote = (world) => world.run(['promote', '--key', KEY, '--no-mechanism', REASON]);
const records = (world) => readOrEmpty(world.incidents).split('\n').filter((entry) => entry.includes('"kind":"promotion"')).map((entry) => JSON.parse(entry));

// ---------------------------------------------------------------------------------------------
// WHERE it lands
// ---------------------------------------------------------------------------------------------

{
  const world = makeCaptureWorld({ scratch, name: 'project-key-orchestrator', files: { 'repo/.claude/lessons-ledger.md': `${PROJECT_HEAD}${line('demo', 2)}`, 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, 'home/.claude/failure-capture/state/incidents.jsonl': incident('orchestrator', '2026-09-14T10:00:00.000Z') } });
  const refused = promote(world);

  check('a PROJECT key repeated by the orchestrator asks for the PROJECT contract, not the global file', refused.status === 1 && refused.out.includes(path.join(world.repo, '.claude', 'CLAUDE.md')) && !refused.out.includes('promoted-rules.md'), refused.out);
}

{
  const world = makeCaptureWorld({ scratch, name: 'project-key-lands', files: { 'repo/.claude/lessons-ledger.md': `${PROJECT_HEAD}${line('demo', 2)}`, 'repo/.claude/CLAUDE.md': items(1), 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, 'home/.claude/failure-capture/state/incidents.jsonl': incident('orchestrator', '2026-09-14T10:00:00.000Z') } });
  const done = promote(world);
  const [record] = records(world);

  check('a PROJECT key promotes into the project contract even though the actor was the orchestrator', done.status === 0, done.out);
  check('...and the closure record says it landed in the contract of scope "demo"', record?.target === 'contract' && record?.scope === 'demo', JSON.stringify(record));
}

{
  const world = makeCaptureWorld({ scratch, name: 'global-key-worker', files: { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${line('global', 2)}`, 'home/.claude/rules/promoted-rules.md': items(1), 'home/.claude/failure-capture/state/incidents.jsonl': incident('worker:coder', '2026-09-14T10:00:00.000Z') } });
  const done = promote(world);
  const [record] = records(world);

  check('a GLOBAL key repeated by a worker promotes into the global rules file, not the project contract', done.status === 0, done.out);
  check('...and the closure record says global', record?.target === 'claude-md' && record?.scope === 'global', JSON.stringify(record));
}

// ---------------------------------------------------------------------------------------------
// HOW growth is measured
// ---------------------------------------------------------------------------------------------

const rules = (world) => contractFileId(path.join(world.home, '.claude', 'rules', 'promoted-rules.md'));
const growthWorld = ({ name, text, baseline, config, extra = {} }) => makeCaptureWorld({
  scratch,
  name,
  config,
  files: {
    'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${line('global', 3)}`,
    'home/.claude/rules/promoted-rules.md': text,
    'home/.claude/failure-capture/state/incidents.jsonl': `${incident('orchestrator', '2026-09-01T10:00:00.000Z')}${baseline}${incident('orchestrator', '2026-09-03T10:00:00.000Z')}`,
    ...extra
  }
});
const baselineOn = (name, faces) => closure({ target: 'claude-md', scope: 'global', faces: { [contractFileId(path.join(scratch, name, 'home', '.claude', 'rules', 'promoted-rules.md'))]: faces }, date: '2026-09-02', at: '2026-09-02T10:00:00.000Z' });

{
  const name = 'repeated-key';
  const stale = promote(growthWorld({ name, text: `- (\`${KEY}\`) ${KEY} ${KEY} ${KEY} ${KEY} ${KEY}.\n`, baseline: baselineOn(name, 1) }));

  check('a paragraph that repeats the key five times is NOT growth', stale.status === 1 && stale.out.includes('has not grown'), stale.out);
  check('...and the refusal counts FACES, one now against one then', stale.out.includes('1 face(s)'), stale.out);
}

{
  const name = 'new-face';
  const world = growthWorld({ name, text: items(2), baseline: baselineOn(name, 1) });
  const done = promote(world);
  const record = records(world).at(-1);

  check('a second face IS growth, and the promotion closes', done.status === 0, done.out);
  check('...recording the faces of the file it measured (2), keyed by its id', record?.faces?.[rules(world)] === 2, JSON.stringify(record));
}

{
  const name = 'legacy-baseline';
  const legacy = closure({ target: 'claude-md', tokenCount: 5, file: contractFileId(path.join(scratch, name, 'home', '.claude', 'rules', 'promoted-rules.md')), date: '2026-09-02', at: '2026-09-02T10:00:00.000Z' });
  const done = promote(growthWorld({ name, text: items(1), baseline: legacy }));

  check('NEAR MISS: a closure recorded as an OCCURRENCE count is no baseline for faces, so it demands nothing', done.status === 0, done.out);
}

{
  const name = 'other-file-shadow';
  const other = contractFileId(path.join(scratch, 'elsewhere', 'AGENT-LEDGER.md'));
  const newerElsewhere = closure({ target: 'claude-md', scope: 'global', faces: { [other]: 5 }, date: '2026-09-04', at: '2026-09-04T10:00:00.000Z' });
  const run = promote(growthWorld({ name, text: items(1), baseline: `${baselineOn(name, 1)}${newerElsewhere}` }));

  check('a NEWER closure measured on ANOTHER file does not shadow the baseline of this very file: unchanged text still refuses', run.status === 1 && run.out.includes('has not grown'), run.out);
}

{
  check('a global lesson targets the global rules file', promotionTargetOf('global') === 'claude-md', promotionTargetOf('global'));
  check('a project lesson targets the project contract', promotionTargetOf('demo') === 'contract', promotionTargetOf('demo'));
  check('a lesson with no scope has no target: it throws instead of guessing a repository', [undefined, ''].every((scope) => { try { promotionTargetOf(scope); return false; } catch { return true; } }), 'did not throw');
}

{
  const name = 'two-contracts';
  const config = { scope: 'demo', workerContracts: ['.claude/AGENT-LEDGER.md', '.agents/AGENTS.md'] };
  const ids = [path.join('.claude', 'AGENT-LEDGER.md'), path.join('.agents', 'AGENTS.md')].map((file) => contractFileId(path.join(scratch, name, 'repo', file)));
  const files = (first, second) => ({ 'repo/.claude/lessons-ledger.md': `${PROJECT_HEAD}${line('demo', 3)}`, 'repo/.claude/AGENT-LEDGER.md': items(first), 'repo/.agents/AGENTS.md': items(second), 'home/.claude/lessons-ledger.md': GLOBAL_HEAD });
  const history = (faces) => `${incident('worker:coder', '2026-09-01T10:00:00.000Z')}${closure({ target: 'contract', scope: 'demo', faces, date: '2026-09-02', at: '2026-09-02T10:00:00.000Z' })}${incident('worker:coder', '2026-09-03T10:00:00.000Z')}`;
  const base = { [ids[0]]: 1, [ids[1]]: 1 };

  const partial = makeCaptureWorld({ scratch, name, config, files: { ...files(2, 1), 'home/.claude/failure-capture/state/incidents.jsonl': history(base) } });
  const refused = promote(partial);

  check('growth in the FIRST contract file does not excuse the second: refused', refused.status === 1 && refused.out.includes('has not grown'), refused.out);
  check('...and the refusal names the file that did not grow, not the one that did', refused.out.includes('AGENTS.md') && !refused.out.includes('AGENT-LEDGER.md'), refused.out);

  const both = makeCaptureWorld({ scratch, name: `${name}-both`, config, files: { ...files(2, 2), 'home/.claude/failure-capture/state/incidents.jsonl': history({ [contractFileId(path.join(scratch, `${name}-both`, 'repo', '.claude', 'AGENT-LEDGER.md'))]: 1, [contractFileId(path.join(scratch, `${name}-both`, 'repo', '.agents', 'AGENTS.md'))]: 1 }) } });
  const done = promote(both);
  const [record] = records(both).slice(-1);

  check('growth in every contract file closes the promotion', done.status === 0, done.out);
  check('...and the closure records the faces of EACH file, not only the first', Object.keys(record?.faces ?? {}).length === 2 && Object.values(record?.faces ?? {}).every((count) => count === 2), JSON.stringify(record));
}

console.log(`promotion-scope selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
