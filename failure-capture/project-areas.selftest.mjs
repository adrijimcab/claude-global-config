#!/usr/bin/env node
/**
 * Discrimination proof of PROJECT AREAS: a project declares its own path-scoped lesson areas in
 * `.claude/failure-capture.json`, and `route --key K --to AREA` moves a lesson of THAT project's ledger into
 * `.claude/rules/lessons-AREA.md` of the same project, a file whose `paths:` frontmatter makes the harness load it
 * only when a matching file is read. What must hold, in both directions: the lesson lands there retagged and
 * byte for byte otherwise; the project ledger loses exactly that line; a lesson never crosses projects, never goes
 * from the home into a project area and never from a project into a home area; a recurrence of a routed lesson
 * folds into the area ledger instead of writing it twice; an invalid area declaration is refused whole.
 * FIXTURES ARE CONSTRUCTED, NEVER LIVE (`capture-world.mjs`): a sandbox home and sandbox projects.
 *
 * @es Prueba de discriminación de las ÁREAS DE PROYECTO: un proyecto declara en `.claude/failure-capture.json`
 * sus propias áreas de lecciones con alcance de ruta, y `route --key K --to ÁREA` mueve una lección del ledger de
 * ESE proyecto a `.claude/rules/lessons-ÁREA.md` del mismo proyecto, un fichero cuyo frontmatter `paths:` hace que
 * el harness lo cargue solo al leer un fichero coincidente. Debe cumplirse en ambos sentidos: la lección aterriza
 * allí con otra etiqueta y byte a byte por lo demás; el ledger del proyecto pierde solo esa línea; una lección
 * nunca cruza proyectos, nunca va del home a un área de proyecto ni de un proyecto a un área del home; una
 * recurrencia de una lección enrutada se suma al ledger del área y no se escribe dos veces; una declaración de
 * área inválida se rechaza entera. Los fixtures se CONSTRUYEN: home y proyectos de arena.
 */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { holdsWholeLine } from './conservation.mjs';
import { lessonFor, makeCaptureWorld, readOrEmpty } from './capture-world.mjs';
import { areaLedgerHeader } from './ledger-routes.mjs';
import { HEADER, PROJECT_LOADER, ledgerFiles } from './ledgers.mjs';
import { areaProblems } from './project-areas.mjs';
import { areasOfLedger, projectAreaFile, projectOf } from './project.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca el vivo.
isolateState('failure-capture');

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-project-areas-')));

process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

const AREA = 'ui-testing';
const AREAS = { [AREA]: { about: 'writing browser and component tests', paths: ['**/*.spec.ts', 'e2e/**'] } };
const KEY = 'project-area-lesson-key';
const OTHER = 'project-stays-lesson-key';
const GLOBAL_HEAD = '# Lessons Ledger — global\n\n---\n';
const projectHead = (scope) => HEADER(scope, PROJECT_LOADER);
const lessonLine = (scope, key, count) => `- [${scope}] 2026-09-14 — it recurred -> RULE: do the ${key} thing <!--fc:${key}#${String(count)}-->\n`;

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 900)}`));

const worldOf = (name, { files = {}, config = { scope: 'demo', areas: AREAS } } = {}) => makeCaptureWorld({ scratch, name, config, files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, ...files } });
const areaFile = (world, area = AREA) => projectAreaFile(world.repo, area);
const projectLedger = (world) => path.join(world.repo, '.claude', 'lessons-ledger.md');

// ---------------------------------------------------------------------------------------------
// a project lesson routes to its project area
// ---------------------------------------------------------------------------------------------

{
  const keep = lessonLine('demo', OTHER, 1);
  const moving = lessonLine('demo', KEY, 3);
  const world = worldOf('route-project-lesson', { files: { 'repo/.claude/lessons-ledger.md': `${projectHead('demo')}${keep}${moving}` } });
  const before = readOrEmpty(projectLedger(world));
  const dry = world.run(['route', '--key', KEY, '--to', AREA]);

  check('a project route is a DRY RUN without --write: it names the lesson and the area and writes nothing', dry.status === 0 && dry.out.includes(KEY) && dry.out.includes(AREA) && readOrEmpty(projectLedger(world)) === before && readOrEmpty(areaFile(world)) === '', dry.out);

  const written = world.run(['route', '--key', KEY, '--to', AREA, '--write']);
  const file = readOrEmpty(areaFile(world));

  check('route --write moves the project lesson into the project area, retagged and otherwise byte for byte, marker and counter included', written.status === 0 && holdsWholeLine(file, moving.trimEnd().replace('- [demo]', `- [${AREA}]`)), `${written.out}\n${file}`);
  check('...the area file carries the path-scoped frontmatter the harness reads, with the project\'s own globs', file.startsWith('---\npaths:\n  - "**/*.spec.ts"\n  - "e2e/**"\n---\n'), file);
  check('...and the header the project\'s declaration gives it', file.startsWith(areaLedgerHeader(AREA, AREAS[AREA]).trimEnd()), file);
  check('...the project ledger keeps only the other lesson', readOrEmpty(projectLedger(world)) === `${projectHead('demo')}${keep}`, readOrEmpty(projectLedger(world)));
  check('...the home ledger and the home rules were not touched', readOrEmpty(world.ledger) === GLOBAL_HEAD && readOrEmpty(path.join(world.home, '.claude', 'rules', `lessons-${AREA}.md`)) === '', readOrEmpty(world.ledger));
  check('...a second run is a no-op: the lesson is already there', world.run(['route', '--key', KEY, '--to', AREA, '--write']).status === 0 && readOrEmpty(areaFile(world)) === file, '');

  const again = world.run(['capture', '--key', KEY, '--scope', 'global', '--actor', 'orchestrator', '--lesson', lessonFor(KEY)]);

  check('a recurrence of the routed lesson folds into the area ledger (counter bumped) and is not written a second time', again.status === 0 && readOrEmpty(areaFile(world)).includes(`<!--fc:${KEY}#4-->`) && !readOrEmpty(projectLedger(world)).includes(KEY), `${again.out}\n${readOrEmpty(areaFile(world))}`);
}

{
  const world = worldOf('capture-into-area');
  const done = world.run(['capture', '--key', 'fresh-area-lesson-key', '--scope', AREA, '--actor', 'orchestrator', '--lesson', lessonFor('fresh-area-lesson-key')]);

  check('a new capture may name a project area as its scope, and lands in that area file', done.status === 0 && readOrEmpty(areaFile(world)).includes('<!--fc:fresh-area-lesson-key#1-->') && readOrEmpty(areaFile(world)).includes(`- [${AREA}] `), `${done.out}\n${readOrEmpty(areaFile(world))}`);
}

{
  const help = worldOf('help').run([]);

  check('the help text documents the project areas and the no-loss refusal, in both languages', help.status === 0 && help.out.includes('declares as "areas"') && help.out.includes('declara como "areas"') && help.out.includes('lost, duplicated or reworded') && help.out.includes('pierda, duplique ni reescriba'), help.out);
}

// ---------------------------------------------------------------------------------------------
// what is REFUSED: across projects, between the home and a project, an area nobody declared
// ---------------------------------------------------------------------------------------------

{
  const world = worldOf('cross-project', {
    files: {
      'repo/.claude/lessons-ledger.md': `${projectHead('demo')}${lessonLine('demo', OTHER, 1)}`,
      'other/.claude/CLAUDE.md': '# Other project\n',
      'other/.claude/failure-capture.json': JSON.stringify({ scope: 'other', areas: { 'other-area': { about: 'the other project', paths: ['**/other/**'] } } }),
      'other/.claude/lessons-ledger.md': `${projectHead('other')}${lessonLine('other', KEY, 1)}`
    }
  });
  const otherRoot = path.join(path.dirname(world.repo), 'other');
  const otherBefore = readOrEmpty(path.join(otherRoot, '.claude', 'lessons-ledger.md'));
  const fromHere = world.run(['route', '--key', KEY, '--to', AREA, '--write']);
  const toTheirArea = world.run(['route', '--key', OTHER, '--to', 'other-area', '--write']);
  const fromThere = world.run(['route', '--key', KEY, '--to', AREA, '--write'], { cwd: otherRoot });

  check("another project's lesson is not routed into this project's area (no ledger of this project holds it)", fromHere.status === 1 && fromHere.out.includes('@es') && fromHere.out.includes(KEY) && readOrEmpty(areaFile(world)) === '', fromHere.out);
  check("this project's lesson is not routed into ANOTHER project's area (it is not an area here)", toTheirArea.status === 1 && toTheirArea.out.includes('is not an area') && toTheirArea.out.includes('@es'), toTheirArea.out);
  check("a project's area is not an area of the other project, so its own lesson is refused there too", fromThere.status === 1 && fromThere.out.includes('is not an area') && readOrEmpty(path.join(otherRoot, '.claude', 'lessons-ledger.md')) === otherBefore, fromThere.out);
}

for (const [name, key, to, files] of [
  ['a project lesson into a HOME area', KEY, 'guards', { 'repo/.claude/lessons-ledger.md': `${projectHead('demo')}${lessonLine('demo', KEY, 1)}` }],
  ['a [global] lesson of the home into a PROJECT area', KEY, AREA, { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${lessonLine('global', KEY, 1)}`, 'repo/.claude/lessons-ledger.md': projectHead('demo') }],
  ['a project lesson into the home ledger itself', KEY, 'global', { 'repo/.claude/lessons-ledger.md': `${projectHead('demo')}${lessonLine('demo', KEY, 1)}` }],
  ['a key the project area already holds', KEY, AREA, { 'repo/.claude/lessons-ledger.md': `${projectHead('demo')}${lessonLine('demo', KEY, 1)}`, 'repo/.claude/rules/lessons-ui-testing.md': `${areaLedgerHeader(AREA, AREAS[AREA])}\n${lessonLine(AREA, KEY, 1)}` }]
]) {
  const world = worldOf(`refused-${name.replaceAll(' ', '-')}`, { files });
  const before = [readOrEmpty(projectLedger(world)), readOrEmpty(world.ledger), readOrEmpty(areaFile(world))];
  const refused = world.run(['route', '--key', key, '--to', to, '--write']);

  check(`route REFUSES ${name}: non-zero, bilingual, and no file changed`, refused.status === 1 && refused.out.includes('@es') && JSON.stringify([readOrEmpty(projectLedger(world)), readOrEmpty(world.ledger), readOrEmpty(areaFile(world))]) === JSON.stringify(before), refused.out);
}

// ---------------------------------------------------------------------------------------------
// the declaration itself
// ---------------------------------------------------------------------------------------------

{
  const world = worldOf('declared', { files: { 'repo/.claude/lessons-ledger.md': projectHead('demo') } });
  // A declaration the config reader refuses throws; here it is a failed check, not a crashed selftest.
  // @es Una declaración que el lector de config rechaza lanza; aquí es un check fallido, no un selftest caído.
  const project = (() => {
    try {
      return projectOf(world.repo, { homes: [world.home] });
    } catch (error) {
      return { areas: `threw: ${error.message}` };
    }
  })();
  const files = typeof project?.areas === 'string' ? {} : ledgerFiles({ project, home: world.home });

  check('the project context surfaces its declared areas', JSON.stringify(project?.areas) === JSON.stringify(AREAS), JSON.stringify(project?.areas));
  check("...and its ledgers include one file per area, in the project's rules folder, with the declared header", files[AREA]?.file === path.join(world.repo, '.claude', 'rules', `lessons-${AREA}.md`) && files[AREA]?.header === areaLedgerHeader(AREA, AREAS[AREA]), JSON.stringify(files[AREA]));
}

for (const [name, areas, wanted] of [
  ['an area that is not an object', { 'bad-area-name': 'text' }, 'must be an object'],
  ['a name that is not kebab-case', { 'Bad Name': { about: 'x', paths: ['a'] } }, 'lowercase kebab'],
  ['an area with no "about"', { 'no-about-area': { paths: ['a'] } }, '"about"'],
  ['an area with no paths', { 'no-paths-area': { about: 'x', paths: [] } }, '"paths"'],
  ['a glob with a double quote (it would break the frontmatter)', { 'quote-area': { about: 'x', paths: ['a"b'] } }, '"paths"'],
  ['a glob with a line break', { 'break-area': { about: 'x', paths: ['a\nb'] } }, '"paths"'],
  ['a glob with a carriage return', { 'return-area': { about: 'x', paths: ['a\rb'] } }, '"paths"'],
  ['an empty glob', { 'empty-area': { about: 'x', paths: [''] } }, '"paths"'],
  ['a glob that is not text', { 'number-area': { about: 'x', paths: [5] } }, '"paths"'],
  ['a glob that is a list of text', { 'nested-area': { about: 'x', paths: [['a']] } }, '"paths"'],
  ['an area that is an array', { 'array-area': [] }, 'must be an object'],
  ['an area that is null', { 'null-area': null }, 'must be an object'],
  ['an "about" that is empty', { 'blank-area': { about: '', paths: ['a'] } }, '"about"'],
  ['an unknown key inside an area', { 'extra-key-area': { about: 'x', paths: ['a'], more: 1 } }, 'unknown key "more"'],
  ['areas that is a list', [], '"areas" must be an object']
]) {
  const problems = areaProblems(areas);

  check(`the declaration REFUSES ${name}, bilingual`, problems.length > 0 && problems.every((problem) => problem.includes(' @es ')) && problems.join(' ').includes(wanted), JSON.stringify(problems));
}

{
  const world = worldOf('areas-of-ledger', { files: { 'repo/.claude/lessons-ledger.md': projectHead('demo'), 'plain/.claude/lessons-ledger.md': projectHead('plain'), 'broken/.claude/failure-capture.json': JSON.stringify({ areas: { 'no-paths-area': { about: 'x' } } }), 'broken/.claude/lessons-ledger.md': projectHead('broken') } });
  const rootOf = (name) => path.join(path.dirname(world.repo), name);

  check('the areas of a ledger are read from the config of ITS project', JSON.stringify(areasOfLedger(projectLedger(world))) === JSON.stringify(AREAS), JSON.stringify(areasOfLedger(projectLedger(world))));
  check('...a project that declares none has none', JSON.stringify(areasOfLedger(path.join(rootOf('plain'), '.claude', 'lessons-ledger.md'))) === '{}', JSON.stringify(areasOfLedger(path.join(rootOf('plain'), '.claude', 'lessons-ledger.md'))));
  check('...and a project whose declaration is invalid answers undefined, never an empty set', areasOfLedger(path.join(rootOf('broken'), '.claude', 'lessons-ledger.md')) === undefined);
}

{
  // An entry spooled by a project whose config has since become invalid is LEFT in the spool for that project, and
  // the project that reconciles it neither crashes nor writes it anywhere.
  // @es Una entrada del spool de un proyecto cuya config se volvió inválida se DEJA en el spool para ese proyecto,
  // y el proyecto que reconcilia ni se cae ni la escribe en ningún sitio.
  const world = worldOf('spooled-broken', { files: { 'repo/.claude/lessons-ledger.md': projectHead('demo'), 'broken/.claude/CLAUDE.md': '# Broken\n', 'broken/.claude/failure-capture.json': JSON.stringify({ scope: 'broken', areas: { 'no-paths-area': { about: 'x' } } }), 'broken/.claude/lessons-ledger.md': projectHead('broken') } });
  const brokenLedger = path.join(path.dirname(world.repo), 'broken', '.claude', 'lessons-ledger.md');
  const spoolDir = path.join(world.home, '.claude', 'failure-capture', 'state', 'spool');

  mkdirSync(spoolDir, { recursive: true });
  writeFileSync(path.join(spoolDir, '1-1-left.json'), JSON.stringify({ key: 'spooled-elsewhere-key', scope: 'broken', actor: 'orchestrator', lesson: lessonFor('spooled-elsewhere-key'), date: '2026-09-14', session: 'x', at: '2026-09-14T00:00:00.000Z', project: { scope: 'broken', ledgerFile: brokenLedger } }), 'utf8');

  const done = world.run(['capture', '--key', 'reconciling-here-key', '--scope', 'demo', '--actor', 'orchestrator', '--lesson', lessonFor('reconciling-here-key')]);

  check("a capture reconciling a spool entry of a project with an invalid declaration still succeeds and records its own lesson", done.status === 0 && readOrEmpty(projectLedger(world)).includes('<!--fc:reconciling-here-key#1-->'), done.out);
  check('...the foreign entry stays in the spool and is written nowhere', existsSync(path.join(spoolDir, '1-1-left.json')) && readOrEmpty(brokenLedger) === projectHead('broken'), readOrEmpty(brokenLedger));
}

check('a valid declaration, or none, has no problem', areaProblems(AREAS).length === 0 && areaProblems(undefined).length === 0, JSON.stringify(areaProblems(AREAS)));

for (const [name, areas, wanted] of [
  ['an area named like a home area', { guards: { about: 'x', paths: ['a'] } }, 'is reserved'],
  ['an area named like the project scope', { demo: { about: 'x', paths: ['a'] } }, 'is reserved'],
  ['an area named like the home ledger of stubs', { promoted: { about: 'x', paths: ['a'] } }, 'is reserved']
]) {
  const world = worldOf(`shadow-${name.replaceAll(' ', '-')}`, { config: { scope: 'demo', areas } });
  const refused = world.run(['status']);

  check(`a project that declares ${name} is refused (exit 2), bilingual, naming the area`, refused.status === 2 && refused.out.includes(wanted) && refused.out.includes('@es'), refused.out);
}

{
  const world = worldOf('invalid-declaration', { config: { scope: 'demo', areas: { 'no-paths-area': { about: 'x' } } } });
  const refused = world.run(['route', '--headers']);

  check('an invalid area declaration stops the command that reads the project (exit 2), naming the defect', refused.status === 2 && refused.out.includes('"paths"') && refused.out.includes('@es'), refused.out);
}

process.stdout.write(`failure-capture project-areas selftest: ${passed} passed, ${failures.length} failed\n`);
for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.exit(failures.length === 0 ? 0 : 1);
