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
import { frontmatterOf } from './harness-count.mjs';
import { loadedSet } from './loaded-set.mjs';
import { areaLedgerHeader } from './ledger-routes.mjs';
import { GLOBAL_LOADER, HEADER, PROJECT_LOADER, ledgerFiles } from './ledgers.mjs';
import { areaProblems } from './project-areas.mjs';
import { areasOfLedger, projectAreaFile, projectOf } from './project.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

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
  ['areas that is a list', [], '"areas" must be an object'],
  ['a glob with a backslash (a YAML escape in the double-quoted frontmatter)', { 'slash-area': { about: 'x', paths: ['src\\app\\**'] } }, '"paths"'],
  ['a glob with a tab (a control character)', { 'tab-area': { about: 'x', paths: ['a\tb'] } }, '"paths"'],
  ['a glob with a NUL (a control character)', { 'nul-area': { about: 'x', paths: ['a\u0000b'] } }, '"paths"'],
  ['a glob with a DEL (a control character)', { 'del-area': { about: 'x', paths: ['a\u007fb'] } }, '"paths"'],
  ['an "about" with a line feed (it would inject lines into the header)', { 'feed-about-area': { about: 'x\n- [demo] 2026-01-01 — injected', paths: ['a'] } }, '"about"'],
  ['an "about" with a carriage return', { 'return-about-area': { about: 'x\ry', paths: ['a'] } }, '"about"'],
  ['the always-loaded glob "**" (the area would not be path-scoped)', { 'all-area': { about: 'x', paths: ['src/**', '**'] } }, 'every file'],
  ['the always-loaded glob "**/*"', { 'all-files-area': { about: 'x', paths: ['**/*'] } }, 'every file'],
  ['the always-loaded glob "**/**"', { 'all-below-area': { about: 'x', paths: ['**/**'] } }, 'every file']
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
check('...a path-scoped glob that starts with "**" is still valid', areaProblems({ 'deep-area': { about: 'x', paths: ['**/*.spec.ts', '**/e2e/**'] } }).length === 0, JSON.stringify(areaProblems({ 'deep-area': { about: 'x', paths: ['**/*.spec.ts', '**/e2e/**'] } })));

// ---------------------------------------------------------------------------------------------
// a glob declared with Windows separators is normalised, and the frontmatter the harness reads stays path-scoped
// ---------------------------------------------------------------------------------------------

{
  const SLASHED = { [AREA]: { about: 'writing browser and component tests', paths: ['src\\app\\**', 'e2e\\*.spec.ts'] } };
  const moving = lessonLine('demo', KEY, 2);
  const world = worldOf('backslash-glob', { config: { scope: 'demo', areas: SLASHED }, files: { 'repo/.claude/lessons-ledger.md': `${projectHead('demo')}${moving}` } });
  const project = (() => {
    try {
      return projectOf(world.repo, { homes: [world.home] });
    } catch (error) {
      return { areas: `threw: ${error.message}` };
    }
  })();

  check('a glob declared with backslashes is normalised to forward slashes when the config is read', JSON.stringify(project?.areas?.[AREA]?.paths) === JSON.stringify(['src/app/**', 'e2e/*.spec.ts']), JSON.stringify(project?.areas));

  const written = world.run(['route', '--key', KEY, '--to', AREA, '--write']);
  const file = readOrEmpty(areaFile(world));

  check('...the area file is written with the normalised globs, no YAML escape in its frontmatter', written.status === 0 && frontmatterOf(file) === '---\npaths:\n  - "src/app/**"\n  - "e2e/*.spec.ts"\n---\n', `${written.out}\n${JSON.stringify(frontmatterOf(file))}`);

  const loaded = loadedSet({ home: world.home, projectRoot: world.repo, ceiling: path.dirname(world.repo) }).files.map((one) => path.resolve(one.path));

  check('...and the reader of the loaded set reads that frontmatter as path-scoped: the area file is not always loaded', existsSync(areaFile(world)) && !loaded.includes(path.resolve(areaFile(world))) && loaded.includes(path.resolve(path.join(world.repo, '.claude', 'CLAUDE.md'))), JSON.stringify(loaded));
}

{
  const header = areaLedgerHeader('escape-area', { about: 'x', paths: ['a\\b"c'] });

  check('the frontmatter ESCAPES a backslash and a double quote at write time (defence in depth)', header.startsWith('---\npaths:\n  - "a\\\\b\\"c"\n---\n'), JSON.stringify(header.slice(0, 60)));
  check('...a glob with neither is written as it is', areaLedgerHeader(AREA, AREAS[AREA]).startsWith('---\npaths:\n  - "**/*.spec.ts"\n  - "e2e/**"\n---\n'), areaLedgerHeader(AREA, AREAS[AREA]).slice(0, 60));
}

// ---------------------------------------------------------------------------------------------
// an area that is dropped from the declaration while its file still holds lessons
// ---------------------------------------------------------------------------------------------

{
  const world = worldOf('dropped-with-lessons', { config: { scope: 'demo', areas: {} }, files: { 'repo/.claude/lessons-ledger.md': projectHead('demo'), [`repo/.claude/rules/lessons-${AREA}.md`]: `${areaLedgerHeader(AREA, AREAS[AREA])}\n${lessonLine(AREA, KEY, 2)}` } });
  const refused = world.run(['status']);

  check('a declaration that drops an area whose file still holds lessons is refused (exit 2), bilingual, naming the file and the command that routes them out first', refused.status === 2 && refused.out.includes(`lessons-${AREA}.md`) && refused.out.includes('capture.mjs route --key <key> --to demo --write') && refused.out.includes('devuelve cada lección'), refused.out);
}

{
  // The same holds with no "areas" key at all, and with no config file at all: the area ledger is recognised by the
  // header capture.mjs wrote, wherever the declaration went.
  // @es Lo mismo sin clave "areas", y sin fichero de config: el ledger de área se reconoce por el encabezado que
  // escribió capture.mjs, se haya ido adonde se haya ido la declaración.
  const owned = { 'repo/.claude/lessons-ledger.md': projectHead('demo'), [`repo/.claude/rules/lessons-${AREA}.md`]: `${areaLedgerHeader(AREA, AREAS[AREA])}\n${lessonLine(AREA, KEY, 2)}` };
  const noKey = worldOf('dropped-no-areas-key', { config: { scope: 'demo' }, files: owned });
  const noFile = worldOf('dropped-no-config-file', { files: owned });

  rmSync(path.join(noFile.repo, '.claude', 'failure-capture.json'));

  const withoutKey = noKey.run(['status']);
  const withoutFile = noFile.run(['status']);

  check('a config with no "areas" key while an area ledger still holds lessons is refused (exit 2), naming the file', withoutKey.status === 2 && withoutKey.out.includes(`lessons-${AREA}.md`), withoutKey.out);
  check('a DELETED config while an area ledger still holds lessons is refused too (exit 2), naming the file, bilingual', withoutFile.status === 2 && withoutFile.out.includes(`lessons-${AREA}.md`) && withoutFile.out.includes('devuelve cada lección'), withoutFile.out);
}

{
  // Hand-written rules files named lessons-*.md, a list of links and a task list, are not area ledgers: capture.mjs
  // did not write them, so they never make a declaration invalid, with or without a config.
  // @es Ficheros de reglas escritos a mano llamados lessons-*.md, una lista de enlaces y una lista de tareas, no son
  // ledgers de área: no los escribió capture.mjs, así que nunca invalidan una declaración, con config o sin ella.
  const handWritten = { 'repo/.claude/lessons-ledger.md': projectHead('demo'), 'repo/.claude/rules/lessons-links.md': '# Lessons we keep\n\n- [Angular docs](https://angular.dev)\n- [RxJS](https://rxjs.dev)\n', 'repo/.claude/rules/lessons-tasks.md': '# Open lessons\n\n- [ ] write the guard\n- [x] measure it\n' };
  const declared = worldOf('hand-written-declared', { files: handWritten });
  const undeclared = worldOf('hand-written-no-areas', { config: { scope: 'demo' }, files: handWritten });
  const noConfig = worldOf('hand-written-no-config', { files: handWritten });

  rmSync(path.join(noConfig.repo, '.claude', 'failure-capture.json'));

  const statuses = [declared.run(['status']), undeclared.run(['status']), noConfig.run(['status'])];

  check('hand-written lessons-*.md files with links and with tasks are accepted, with areas, without the key and without a config', statuses.every((one) => one.status === 0), statuses.map((one) => one.out).join('\n---\n'));
}

{
  // A lesson of a project area moves BACK to the project ledger, which is how an area is retired.
  // @es Una lección de un área de proyecto VUELVE al ledger del proyecto, que es como se retira un área.
  const keep = lessonLine('demo', OTHER, 1);
  const inArea = lessonLine(AREA, KEY, 3);
  const world = worldOf('route-back', { files: { 'repo/.claude/lessons-ledger.md': `${projectHead('demo')}${keep}`, [`repo/.claude/rules/lessons-${AREA}.md`]: `${areaLedgerHeader(AREA, AREAS[AREA])}\n${inArea}` } });
  const moved = world.run(['route', '--key', KEY, '--to', 'demo', '--write']);

  check('route --key K --to <project scope> moves a project area lesson back to the project ledger, retagged and otherwise byte for byte', moved.status === 0 && holdsWholeLine(readOrEmpty(projectLedger(world)), inArea.trimEnd().replace(`- [${AREA}]`, '- [demo]')) && holdsWholeLine(readOrEmpty(projectLedger(world)), keep.trimEnd()), `${moved.out}\n${readOrEmpty(projectLedger(world))}`);
  check('...the area ledger keeps its header and loses only that lesson', readOrEmpty(areaFile(world)) === areaLedgerHeader(AREA, AREAS[AREA]), readOrEmpty(areaFile(world)));

  writeFileSync(path.join(world.repo, '.claude', 'failure-capture.json'), JSON.stringify({ scope: 'demo', areas: {} }), 'utf8');

  check('...and once the area holds no lesson, it can be dropped from the declaration', world.run(['status']).status === 0);
}

{
  // The second write of a lesson route lands and then fails (`write-fault.preload.cjs`): both files get back their
  // exact bytes (the doubled blank line at the end included), and a file the route created is removed again.
  // @es La segunda escritura de una ruta de lección aterriza y luego falla: ambos ficheros recuperan sus bytes exactos
  // (incluida la línea en blanco doble del final), y un fichero que la ruta creó se borra otra vez.
  const ledgerText = `${projectHead('demo')}${lessonLine('demo', OTHER, 1)}${lessonLine('demo', KEY, 2)}\n\n`;
  const world = worldOf('route-fault', { files: { 'repo/.claude/lessons-ledger.md': ledgerText } });
  const failed = world.run(['route', '--key', KEY, '--to', AREA, '--write'], { nodeArgs: ['--require', path.join(HERE, 'write-fault.preload.cjs')], env: { FC_FAULT_RENAME_MATCH: path.join('repo', '.claude', 'lessons-ledger.md') } });

  check('a lesson route whose second write fails exits non-zero and says so in both languages, naming the cause', failed.status !== 0 && failed.out.includes('injected write fault') && failed.out.includes('route FAILED while writing') && failed.out.includes('route FALLÓ al escribir'), failed.out);
  check('...the project ledger gets back its EXACT bytes and the area file the route created is gone', readOrEmpty(projectLedger(world)) === ledgerText && !existsSync(areaFile(world)), JSON.stringify([readOrEmpty(projectLedger(world)), existsSync(areaFile(world))]));

  const existing = `${areaLedgerHeader(AREA, AREAS[AREA])}\n${lessonLine(AREA, OTHER.replace('stays', 'there'), 1)}\n\n`;
  const second = worldOf('route-fault-existing', { files: { 'repo/.claude/lessons-ledger.md': ledgerText, [`repo/.claude/rules/lessons-${AREA}.md`]: existing } });
  const refused = second.run(['route', '--key', KEY, '--to', AREA, '--write'], { nodeArgs: ['--require', path.join(HERE, 'write-fault.preload.cjs')], env: { FC_FAULT_RENAME_MATCH: path.join('repo', '.claude', 'lessons-ledger.md') } });

  check('...and an area file that existed gets back its exact bytes too', refused.status !== 0 && readOrEmpty(areaFile(second)) === existing && readOrEmpty(projectLedger(second)) === ledgerText, JSON.stringify([readOrEmpty(areaFile(second)), readOrEmpty(projectLedger(second))]));
}

{
  const world = worldOf('renamed-with-lessons', { config: { scope: 'demo', areas: { 'browser-testing': AREAS[AREA] } }, files: { 'repo/.claude/lessons-ledger.md': projectHead('demo'), [`repo/.claude/rules/lessons-${AREA}.md`]: `${areaLedgerHeader(AREA, AREAS[AREA])}\n${lessonLine(AREA, KEY, 2)}` } });
  const refused = world.run(['capture', '--key', KEY, '--scope', 'demo', '--actor', 'orchestrator', '--lesson', lessonFor(KEY)]);

  check('a RENAMED area whose old file holds lessons is refused too, and the lesson is not written a second time', refused.status === 2 && refused.out.includes(`lessons-${AREA}.md`) && !readOrEmpty(projectLedger(world)).includes(KEY), `${refused.out}\n${readOrEmpty(projectLedger(world))}`);
}

{
  // Beside it, a rules file that is not an area ledger holds a markdown task list (`- [ ]`), and a `lessons-*.txt`
  // holds a lesson-shaped line: neither is an area ledger, so neither is read as a stranded area.
  // @es A su lado, un fichero de reglas que no es ledger de área tiene una lista de tareas markdown (`- [ ]`), y un
  // `lessons-*.txt` tiene una línea con forma de lección: ninguno es ledger de área, así que ninguno cuenta como área varada.
  // Nor is a copy of an area ledger, its capture header and its lesson included, kept under another name: an archived
  // `archive-<area>.md` and a backup `lessons-<area>.bk` are not the `lessons-<area>.md` the loop owns.
  // @es Tampoco una copia de un ledger de área, con su encabezado de captura y su lección, guardada con otro nombre: un
  // `archive-<área>.md` archivado y un `lessons-<área>.bk` de respaldo no son el `lessons-<área>.md` del bucle.
  const copy = `${areaLedgerHeader(AREA, AREAS[AREA])}\n${lessonLine(AREA, KEY, 1)}`;
  const world = worldOf('dropped-empty', { config: { scope: 'demo', areas: {} }, files: { 'repo/.claude/lessons-ledger.md': projectHead('demo'), [`repo/.claude/rules/lessons-${AREA}.md`]: areaLedgerHeader(AREA, AREAS[AREA]), 'repo/.claude/rules/checklist.md': '# Checklist\n\n- [ ] a task list item\n', 'repo/.claude/rules/lessons-notes.txt': lessonLine('notes', KEY, 1), [`repo/.claude/rules/archive-${AREA}.md`]: copy, [`repo/.claude/rules/lessons-${AREA}.bk`]: copy } });
  const accepted = world.run(['status']);

  check('...while dropping an area whose file holds no lesson is accepted, and rules files that are not area ledgers are not read as such', accepted.status === 0, accepted.out);
}

{
  // An entry spooled under an area that has since been dropped has no ledger: it is DEFERRED, with its reason recorded
  // in the entry, and every later reconcile keeps working.
  // @es Una entrada del spool bajo un área que ya no está declarada no tiene ledger: se DIFIERE, con su motivo anotado
  // en la entrada, y cada reconciliación posterior sigue funcionando.
  const world = worldOf('spooled-dropped-area', { config: { scope: 'demo', areas: {} }, files: { 'repo/.claude/lessons-ledger.md': projectHead('demo') } });
  const spoolDir = path.join(world.home, '.claude', 'failure-capture', 'state', 'spool');
  const spooled = path.join(spoolDir, '1-1-dropped.json');

  mkdirSync(spoolDir, { recursive: true });
  writeFileSync(spooled, JSON.stringify({ key: 'spooled-dropped-key', scope: AREA, actor: 'orchestrator', lesson: lessonFor('spooled-dropped-key'), date: '2026-09-14', session: 'x', at: '2026-09-14T00:00:00.000Z', project: { scope: 'demo', ledgerFile: projectLedger(world) } }), 'utf8');

  const first = world.run(['capture', '--key', 'first-after-drop-key', '--scope', 'demo', '--actor', 'orchestrator', '--lesson', lessonFor('first-after-drop-key')]);
  const second = world.run(['capture', '--key', 'second-after-drop-key', '--scope', 'demo', '--actor', 'orchestrator', '--lesson', lessonFor('second-after-drop-key')]);
  const left = (() => {
    try {
      return JSON.parse(readOrEmpty(spooled));
    } catch {
      return {};
    }
  })();

  check('a spooled entry whose area was dropped does not wedge the spool: the next captures succeed and are written', first.status === 0 && second.status === 0 && readOrEmpty(projectLedger(world)).includes('<!--fc:first-after-drop-key#1-->') && readOrEmpty(projectLedger(world)).includes('<!--fc:second-after-drop-key#1-->'), `${first.out}\n${second.out}`);
  check('...the entry is left in the spool, written nowhere, with the reason it was deferred recorded in it, bilingual', left.key === 'spooled-dropped-key' && typeof left.deferred?.reason === 'string' && left.deferred.reason.includes(AREA) && left.deferred.reason.includes(' @es ') && typeof left.deferred.at === 'string' && !readOrEmpty(projectLedger(world)).includes('spooled-dropped-key'), JSON.stringify(left));
  check('...and every capture that leaves it says so: how many, which key and why, in both languages', [first, second].every((one) => one.out.includes('1 spooled capture(s) could not be folded') && one.out.includes('1 captura(s) del spool no se pudieron plegar') && one.out.includes(`spooled-dropped-key: no ledger holds the scope "${AREA}"`)), `${first.out}\n${second.out}`);

  // Declared again, the scope has its ledger back: the entry folds into it, and the deferral record is not part of the capture.
  // @es Declarado de nuevo, el alcance recupera su ledger: la entrada se pliega en él, y la anotación de diferimiento no es parte de la captura.
  writeFileSync(path.join(world.repo, '.claude', 'failure-capture.json'), JSON.stringify({ scope: 'demo', areas: AREAS }), 'utf8');

  const third = world.run(['capture', '--key', 'third-after-drop-key', '--scope', 'demo', '--actor', 'orchestrator', '--lesson', lessonFor('third-after-drop-key')]);
  const folded = readOrEmpty(world.incidents).split('\n').filter((line) => line.includes('spooled-dropped-key'));

  check('...once the area is declared again the deferred entry folds into its ledger and leaves the spool, and its incident carries no deferral record', third.status === 0 && readOrEmpty(areaFile(world)).includes('<!--fc:spooled-dropped-key#1-->') && !existsSync(spooled) && folded.length === 1 && !folded[0].includes('deferred') && !third.out.includes('could not be folded'), `${third.out}\n${readOrEmpty(areaFile(world))}\n${folded.join('\n')}`);
}

// ---------------------------------------------------------------------------------------------
// route --headers refreshes the project's own area files too
// ---------------------------------------------------------------------------------------------

{
  const lessonInArea = lessonLine(AREA, KEY, 2);
  const stale = `---\npaths:\n  - "old/**"\n---\n# Old area header\n\nLessons about something else.\n\n---\n\n${lessonInArea}`;
  // The home ledger already carries its declared header, so only the project area file has a header to refresh.
  // @es El ledger del home ya lleva su encabezado declarado, así que solo el fichero del área de proyecto tiene encabezado que refrescar.
  const world = worldOf('headers-project-area', { files: { 'home/.claude/lessons-ledger.md': HEADER('global', GLOBAL_LOADER), 'repo/.claude/lessons-ledger.md': projectHead('demo'), [`repo/.claude/rules/lessons-${AREA}.md`]: stale } });
  const dry = world.run(['route', '--headers']);

  check('route --headers names a project area file whose header is stale, and a dry run writes nothing', dry.status === 0 && dry.out.includes(AREA) && readOrEmpty(areaFile(world)) === stale, dry.out);

  const done = world.run(['route', '--headers', '--write']);
  const file = readOrEmpty(areaFile(world));

  check('route --headers --write gives the project area file its declared header (paths and about) and keeps its lesson byte for byte', done.status === 0 && file.startsWith(areaLedgerHeader(AREA, AREAS[AREA]).trimEnd()) && holdsWholeLine(file, lessonInArea.trimEnd()) && !file.includes('old/**'), `${done.out}\n${file}`);
}

{
  // A home ledger that holds NO lesson and has an old header is refreshed too, and it does not stop the project area.
  // @es Un ledger del home SIN lecciones y con un encabezado viejo también se refresca, y no detiene al área del proyecto.
  const lessonInArea = lessonLine(AREA, KEY, 2);
  const stale = `---\npaths:\n  - "old/**"\n---\n# Old area header\n\n---\n\n${lessonInArea}`;
  const world = worldOf('headers-lessonless-home', { files: { 'repo/.claude/lessons-ledger.md': projectHead('demo'), [`repo/.claude/rules/lessons-${AREA}.md`]: stale } });
  const done = world.run(['route', '--headers', '--write']);

  check('route --headers --write refreshes a lesson-less home ledger AND the project area after it', done.status === 0 && readOrEmpty(world.ledger) === HEADER('global', GLOBAL_LOADER) && readOrEmpty(areaFile(world)).startsWith(areaLedgerHeader(AREA, AREAS[AREA]).trimEnd()) && holdsWholeLine(readOrEmpty(areaFile(world)), lessonInArea.trimEnd()), `${done.out}\n${readOrEmpty(world.ledger)}\n${readOrEmpty(areaFile(world))}`);
}

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
