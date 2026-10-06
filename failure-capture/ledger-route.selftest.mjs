#!/usr/bin/env node
/**
 * Discrimination proof of the pure side of the ledger router (`ledger-route.mjs`): what a stub route plans, what
 * it refuses, and the PROOF that a written route lost and invented nothing, including when the write LIES (a
 * file that comes back different from what was written).
 *
 * @es Prueba de discriminación del lado puro del enrutador (`ledger-route.mjs`): qué planea una ruta de
 * muñones, qué rechaza, y la PRUEBA de que una ruta escrita no perdió ni inventó nada, también cuando la
 * escritura MIENTE (un fichero que vuelve distinto de lo escrito).
 */

import { commitHeaderRoute, commitRoute, locateLesson, planHeaderRoute, planLessonRoute, planStubRoute, provesHeaderRoute, provesRoute, routeOutcome } from './ledger-route.mjs';

const HEADER = '# Stubs\n\n---\n';
const stub = (key, count = 2) => `- [promoted] 2026-09-30 — ${key}: no mechanism <!--fc:${key}#${String(count)}-->`;
const lesson = (key) => `- [global] 2026-09-14 — ${key} -> RULE: do it <!--fc:${key}#1-->`;
const lines = (...entries) => entries.join('\n').split('\n');

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 600)}`));

const SOURCE = ['# Ledger', '', '---', lesson('keep-one'), stub('first-key', 14), lesson('keep-two'), stub('second-key'), ''];

// --- the plan
{
  const plan = planStubRoute({ source: SOURCE, destination: undefined, header: HEADER });

  check('the plan moves every stub, in order, and only stubs', plan.ok && plan.moved.map((one) => one.key).join() === 'first-key,second-key', JSON.stringify(plan));
  check('...the source keeps the rest, in order, byte for byte', plan.source?.join('\n') === ['# Ledger', '', '---', lesson('keep-one'), lesson('keep-two'), ''].join('\n'), plan.source?.join('\n'));
  check('...a new destination starts from the header, a blank line after its separator, the stubs, a final newline', plan.destination?.join('\n') === `${HEADER}\n${stub('first-key', 14)}\n${stub('second-key')}\n`, JSON.stringify(plan.destination));
}

{
  const existing = lines('# Stubs', '', '---', '', stub('old-key', 5), '');
  const plan = planStubRoute({ source: SOURCE, destination: existing, header: HEADER });

  check('an existing destination keeps what it held, in front, and no blank line is added after a stub', plan.destination?.join('\n') === ['# Stubs', '', '---', '', stub('old-key', 5), stub('first-key', 14), stub('second-key'), ''].join('\n'), plan.destination?.join('\n'));
}

{
  const plan = planStubRoute({ source: [lesson('a-lesson'), ''], destination: undefined, header: HEADER });

  check('nothing to move is ok, with nothing moved and the source as it was', plan.ok && plan.moved.length === 0 && plan.source?.join('\n') === [lesson('a-lesson'), ''].join('\n'), JSON.stringify(plan));
}

for (const [name, source, destination] of [
  ['a key the destination already holds', [stub('dup-key')], lines('# Stubs', '---', stub('dup-key'))],
  ['the same key twice in the source', [stub('twice-key'), stub('twice-key', 3)], undefined],
  ['a stub with no marker', ['- [promoted] 2026-09-30 — nokey: no mechanism'], undefined],
]) {
  const plan = planStubRoute({ source, destination, header: HEADER });

  check(`the plan REFUSES ${name}, whole, bilingual`, !plan.ok && plan.problems.length > 0 && plan.problems.every((problem) => problem.includes(' @es ')), JSON.stringify(plan));
}

{
  const plan = planStubRoute({ source: [stub('good-key'), stub('dup-key')], destination: [stub('dup-key')], header: HEADER });

  check('a refusal is whole: the good stub is not moved either', !plan.ok && plan.moved === undefined, JSON.stringify(plan));
}

// --- the proof
const before = { source: SOURCE, destination: lines('# Stubs', '', '---', '', stub('old-key', 5), '') };
const planned = planStubRoute({ source: before.source, destination: before.destination, header: HEADER });
const after = { source: planned.source, destination: planned.destination };
const verdict = (patch) => provesRoute({ before, after: { ...after, ...patch } });
const named = (result, fragment) => !result.ok && result.deficits.some((deficit) => deficit.includes(fragment) && deficit.includes(' @es '));

check('the proof holds for the planned route', provesRoute({ before, after }).ok === true, JSON.stringify(provesRoute({ before, after })));
check('a stub dropped on the way is a LOST line, named', named(verdict({ destination: after.destination.filter((line) => !line.includes('second-key')) }), 'second-key'), JSON.stringify(verdict({ destination: after.destination.filter((line) => !line.includes('second-key')) })));
check('a line that was never there is an INVENTED line, named', named(verdict({ destination: [...after.destination, stub('made-up-key')] }), 'made-up-key'));
check('a stub written twice is an invented line', named(verdict({ destination: [...after.destination, stub('first-key', 14)] }), 'first-key'));
check('a counter altered on the way is a lost AND an invented line', !verdict({ destination: after.destination.map((line) => line.replace('#14', '#13')) }).ok);
check('the lessons the source kept changing order are caught', named(verdict({ source: [...after.source.slice(0, 3), after.source[4], after.source[3], ''] }), 'order'));
check('the source header changing is caught', named(verdict({ source: after.source.map((line) => (line === '# Ledger' ? '# Other' : line)) }), 'not a lesson'));
check('the destination header lost is caught', named(verdict({ destination: after.destination.filter((line) => line !== '# Stubs') }), 'destination'));
check('a stub left in the source AND written to the destination is a duplicate, caught', !verdict({ source: before.source }).ok);

// --- the commit, with writes that tell the truth and writes that lie
function memory(initial) {
  const state = { source: initial.source, destination: initial.destination, writes: [] };

  return {
    state,
    io: {
      writeSource: (next) => { state.source = next; state.writes.push('source'); },
      writeDestination: (next) => { state.destination = next; state.writes.push('destination'); },
      readBack: () => ({ source: state.source, destination: state.destination })
    }
  };
}

{
  const world = memory(before);
  const proof = commitRoute({ before, plan: planned, io: world.io });

  check('commit with honest writes: proved, both written, destination first', proof.ok && world.state.writes.join() === 'destination,source', JSON.stringify(world.state.writes));
  check('...and the files are the planned ones', world.state.source.join('\n') === planned.source.join('\n') && world.state.destination.join('\n') === planned.destination.join('\n'));
}

{
  const world = memory(before);
  const liar = { ...world.io, writeDestination: (next) => { world.state.destination = next.filter((line) => !line.includes('second-key')); world.state.writes.push('destination'); } };
  const proof = commitRoute({ before, plan: planned, io: liar });

  check('a destination that comes back WITHOUT a stub is not proved: the proof reads the re-read file, not the plan', !proof.ok, JSON.stringify(proof));
  check('...and BOTH files are restored to what they were', world.state.source.join('\n') === before.source.join('\n') && world.state.destination.join('\n') === before.destination.join('\n'), JSON.stringify(world.state));
}

{
  const world = memory({ source: before.source, destination: undefined });
  const fresh = planStubRoute({ source: before.source, destination: undefined, header: HEADER });
  let lied = false;
  const liar = { ...world.io, writeSource: (next) => { world.state.source = lied ? next : next.filter((line) => !line.includes('keep-one')); lied = true; } };
  const proof = commitRoute({ before: { source: before.source, destination: undefined }, plan: fresh, io: liar });

  check('a source that comes back with a LESSON dropped is not proved', !proof.ok, JSON.stringify(proof));
  check('...a destination that did not exist is restored to NOT existing (undefined), not to an empty file', world.state.destination === undefined && world.state.source.join('\n') === before.source.join('\n'), JSON.stringify(world.state));
}

// --- moving a lesson to an area
const AREA_HEADER = '---\npaths:\n  - "x"\n---\n# Area\n\n---\n';
const GLOBAL_LEDGER = { scope: 'global', lines: ['# Ledger', '---', lesson('stay-key'), lesson('go-key'), '- [global] 2026-07-20 — RULE: written before markers. Evidence: lessons/evidence/old-key.md', ''] };
const STUBS_LEDGER = { scope: 'promoted', lines: ['# Stubs', stub('stub-key'), ''] };
const at = (key) => planLessonRoute({ found: locateLesson([GLOBAL_LEDGER, STUBS_LEDGER], key), area: 'guards', key, destination: undefined, header: AREA_HEADER });

check('locateLesson finds a line by the key of its marker, in whichever ledger holds it', locateLesson([GLOBAL_LEDGER, STUBS_LEDGER], 'go-key')?.index === 3 && locateLesson([GLOBAL_LEDGER, STUBS_LEDGER], 'stub-key')?.ledger.scope === 'promoted', JSON.stringify(locateLesson([GLOBAL_LEDGER, STUBS_LEDGER], 'go-key')));
check('...and a line with no marker by the key of its evidence pointer', locateLesson([GLOBAL_LEDGER], 'old-key')?.index === 4, JSON.stringify(locateLesson([GLOBAL_LEDGER], 'old-key')));
check('...a key nobody holds is not found, and a header line is never a lesson', locateLesson([GLOBAL_LEDGER], 'nobody-key') === undefined && locateLesson([{ scope: 'global', lines: ['# Ledger', ''] }], 'ledger') === undefined);

{
  const plan = at('go-key');

  check('a lesson moves retagged to the area, and only its scope tag changes', plan.ok && plan.moved[0].line === lesson('go-key').replace('- [global]', '- [guards]'), JSON.stringify(plan));
  check('...the source loses exactly that line, in order', plan.source?.join('\n') === ['# Ledger', '---', lesson('stay-key'), '- [global] 2026-07-20 — RULE: written before markers. Evidence: lessons/evidence/old-key.md', ''].join('\n'), plan.source?.join('\n'));
  check('...a new area file is the header, a blank line, the lesson, a final newline', plan.destination?.join('\n') === `${AREA_HEADER}\n${lesson('go-key').replace('- [global]', '- [guards]')}\n`, JSON.stringify(plan.destination));
  check('...and the rename is declared to the proof', plan.renamed.get(lesson('go-key')) === lesson('go-key').replace('- [global]', '- [guards]'));
}

check('a marker-less lesson moves too, retagged', at('old-key').ok && at('old-key').moved[0].line.startsWith('- [guards] 2026-07-20'), JSON.stringify(at('old-key')));
check('a lesson already in the area is ok with nothing moved', planLessonRoute({ found: locateLesson([{ scope: 'guards', lines: [lesson('go-key')] }], 'go-key'), area: 'guards', key: 'go-key', destination: [lesson('go-key')], header: AREA_HEADER }).moved?.length === 0);

for (const [name, plan] of [
  ['an area that does not exist', planLessonRoute({ found: locateLesson([GLOBAL_LEDGER], 'go-key'), area: 'nowhere', key: 'go-key', destination: undefined, header: AREA_HEADER })],
  ['a lesson no ledger holds', planLessonRoute({ found: undefined, area: 'guards', key: 'nobody-key', destination: undefined, header: AREA_HEADER })],
  ['a promoted stub (its text moves with its rule, not as a lesson line)', at('stub-key')],
  ['a [global]-tagged line that sits in a project ledger', planLessonRoute({ found: locateLesson([{ scope: 'demo', lines: [lesson('go-key')] }], 'go-key'), area: 'guards', key: 'go-key', destination: undefined, header: AREA_HEADER })],
  ['a key the destination already holds', planLessonRoute({ found: locateLesson([GLOBAL_LEDGER], 'go-key'), area: 'guards', key: 'go-key', destination: [lesson('go-key').replace('- [global]', '- [guards]')], header: AREA_HEADER })],
]) check(`planLessonRoute REFUSES ${name}, bilingual`, !plan.ok && plan.problems.every((problem) => problem.includes(' @es ')), JSON.stringify(plan));

{
  const renamed = new Map([[lesson('go-key'), lesson('go-key').replace('- [global]', '- [guards]')]]);
  const sides = { before: { source: GLOBAL_LEDGER.lines, destination: undefined }, after: { source: GLOBAL_LEDGER.lines.filter((line) => line !== lesson('go-key')), destination: ['# Area', lesson('go-key').replace('- [global]', '- [guards]'), ''] } };

  check('the proof accepts a lesson that was only RETAGGED', provesRoute({ ...sides, renamed }).ok, JSON.stringify(provesRoute({ ...sides, renamed })));
  check('...and without being told of the rename it is a lost line and an invented one', !provesRoute(sides).ok);
  check('...a retag that changed anything else is not the declared rename', !provesRoute({ ...sides, after: { ...sides.after, destination: ['# Area', lesson('go-key').replace('- [global]', '- [guards]').replace('#1', '#9'), ''] }, renamed }).ok);
}

{
  const planned = at('go-key');
  const world = memory({ source: GLOBAL_LEDGER.lines, destination: undefined });
  const proof = commitRoute({ before: { source: GLOBAL_LEDGER.lines, destination: undefined }, plan: planned, io: world.io });

  check('a committed lesson route is proved WITH its rename: the retag is not read as a lost line and an invented one', proof.ok, JSON.stringify(proof));
}

// --- the header of a ledger
{
  const declared = '# Ledger — declared\n\nOne line per RULE.\n\n---\n';
  const old = ['# Old hand-written header', '', 'Many rules about the format.', '', '---', '', lesson('first-key'), '', lesson('second-key'), ''];
  const plan = planHeaderRoute({ lines: old, header: declared });

  check('a header is replaced by the declared one, a blank line after it; the lessons and what stands between them are untouched', plan.changed && plan.lines.join('\n') === ['# Ledger — declared', '', 'One line per RULE.', '', '---', '', lesson('first-key'), '', lesson('second-key'), ''].join('\n'), plan.lines.join('\n'));
  check('a ledger that already has the declared header is not changed', planHeaderRoute({ lines: plan.lines, header: declared }).changed === false);
  check('a ledger with no lesson becomes the declared header alone', planHeaderRoute({ lines: ['# Old'], header: declared }).lines.join('\n') === declared);

  const proves = (patch) => provesHeaderRoute({ before: old, after: patch ?? plan.lines, header: declared });

  check('the proof holds for the planned header', proves().ok, JSON.stringify(proves()));
  check('a lesson dropped is caught, bilingual', !proves(plan.lines.filter((line) => !line.includes('second-key'))).ok && proves(plan.lines.filter((line) => !line.includes('second-key'))).deficits.every((deficit) => deficit.includes(' @es ')));
  check('a lesson changed is caught', !proves(plan.lines.map((line) => line.replace('#1', '#2'))).ok);
  check('lessons in another order are caught', !proves([...plan.lines.slice(0, 6), plan.lines[8], '', plan.lines[6], '']).ok);
  check('a header that is not the declared one is caught', !proves(['# Another', ...plan.lines.slice(1)]).ok);
  check('text between the lessons that changed is caught', !proves([...plan.lines.slice(0, 7), 'a stray line', ...plan.lines.slice(7)]).ok);

  let state = old;
  const honest = { write: (lines) => { state = lines; }, readBack: () => state };
  check('a commit with honest writes is proved and leaves the declared header', commitHeaderRoute({ before: old, plan, header: declared, io: honest }).ok && state.join('\n') === plan.lines.join('\n'));

  state = old;
  let lied = false;
  const liar = { write: (lines) => { state = lied ? lines : lines.filter((line) => !line.includes('first-key')); lied = true; }, readBack: () => state };
  const proof = commitHeaderRoute({ before: old, plan, header: declared, io: liar });

  check('a write that drops a lesson is NOT proved, and the ledger is restored as it was', !proof.ok && state.join('\n') === old.join('\n'), JSON.stringify([proof, state]));
}

// --- what the command says
check('a proved route is reported done, exit 0, with how many lines moved', routeOutcome({ proof: { ok: true }, count: 3 }).status === 0 && routeOutcome({ proof: { ok: true }, count: 3 }).say.join() === 'route.done,[object Object]' && routeOutcome({ proof: { ok: true }, count: 3 }).say[1].count === 3);
const unproved = routeOutcome({ proof: { ok: false, deficits: ['a line was lost'] }, count: 3 });
check('an UNPROVED route is never reported done: exit 1, the failure named, the deficits carried', unproved.status === 1 && unproved.complain === 'route.proofFailed' && unproved.say === undefined && unproved.deficits.join() === 'a line was lost', JSON.stringify(unproved));

console.log(`ledger-route selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
