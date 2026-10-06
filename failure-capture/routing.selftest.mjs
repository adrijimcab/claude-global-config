#!/usr/bin/env node
/**
 * Discrimination proof of the LEDGER ROUTER: where each kind of ledger line lives, by scope, and which of
 * those places the harness loads.
 *
 * The home ledger is loaded in EVERY session, so a line that does not need to be there costs tokens in every
 * session. Two kinds of line do not: the stub `promote` leaves for a promoted lesson (the rule text itself is
 * in a rules file the harness already loads, so the stub only says that a rule exists), and a lesson that is
 * about one area of work (it matters when files of that area are in play, never otherwise). The router sends
 * the stub to an UNLOADED file and an area lesson to a rules file whose `paths:` frontmatter makes the harness
 * load it only when a matching file is read (Claude Code's native path-scoped rules).
 *
 * WHAT MUST HOLD, in both directions: a promoted global lesson's stub lands in the unloaded file and the loaded
 * ledger loses it; a project lesson's stub stays in the project ledger; a recurrence of a promoted lesson still
 * finds its stub and counts there (a recurrence that missed it would write the lesson a second time);
 * `route --stubs` moves what is already there, byte for byte, nothing lost, and is a no-op the second time; and
 * what the harness loads no longer carries the stubs.
 *
 * FIXTURES ARE CONSTRUCTED, NEVER LIVE (`capture-world.mjs`).
 *
 * @es Prueba de discriminación del ENRUTADOR DE LEDGERS: dónde vive cada tipo de línea del ledger, por
 * alcance, y cuáles de esos sitios carga el harness. El ledger del home se carga en TODA sesión, así que una
 * línea que no hace falta ahí cuesta tokens en todas. Dos tipos no hacen falta: el muñón que deja `promote`
 * (el texto de la regla ya está en un fichero de reglas que el harness carga) y una lección de un área de
 * trabajo (importa cuando hay ficheros de esa área en juego). El enrutador manda el muñón a un fichero NO
 * cargado y la lección de área a un fichero de reglas con `paths:` (reglas con alcance de ruta nativas de
 * Claude Code). Los fixtures se CONSTRUYEN, nunca son los vivos.
 */

import { existsSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { lessonFor, makeCaptureWorld, readOrEmpty, writeFiles } from './capture-world.mjs';
import { holdsWholeLine } from './conservation.mjs';
import { HEADER, GLOBAL_LOADER } from './ledgers.mjs';
import { STUBS_HEADER, areaLedgerHeader } from './ledger-routes.mjs';
import { loadedSet } from './loaded-set.mjs';

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-routing-')));
const KEY = 'promoted-lesson-key';
const OTHER = 'ordinary-lesson-key';
const REASON = 'a claim written in prose cannot be detected by any hook; measured 0 of 6 recall';
const GLOBAL_HEAD = '# Lessons Ledger — global\n\n---\n';
const PROJECT_HEAD = '# Lessons Ledger — demo\n\n---\n';
const lessonLine = (scope, key, count) => `- [${scope}] 2026-09-14 — it recurred -> RULE: do the ${key} thing <!--fc:${key}#${String(count)}-->\n`;
const stubLine = (key, count) => `- [promoted] 2026-09-30 — ${key}: no mechanism <!--fc:${key}#${String(count)}-->\n`;
const rulesFor = (key) => `- (\`${key}\`) face one.\n`;

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 900)}`));

const homeFile = (world, ...segments) => path.join(world.home, '.claude', ...segments);
const stubsOf = (world) => readOrEmpty(homeFile(world, 'lessons-promoted.md'));
const globalOf = (world) => readOrEmpty(world.ledger);
const promote = (world, key = KEY) => world.run(['promote', '--key', key, '--no-mechanism', REASON]);

// ---------------------------------------------------------------------------------------------
// WHERE a stub lands
// ---------------------------------------------------------------------------------------------

{
  const world = makeCaptureWorld({ scratch, name: 'global-stub', files: { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${lessonLine('global', OTHER, 1)}${lessonLine('global', KEY, 2)}`, 'home/.claude/rules/promoted-rules.md': rulesFor(KEY) } });
  const done = promote(world);

  check('a GLOBAL lesson promotes', done.status === 0, done.out);
  check('...its stub is in the UNLOADED file, with the original marker and counter', stubsOf(world).includes(`<!--fc:${KEY}#2-->`) && stubsOf(world).includes('- [promoted] '), stubsOf(world));
  check('...and the loaded home ledger no longer carries it', !globalOf(world).includes(KEY), globalOf(world));
  check('...while the other lesson of the loaded ledger is untouched, byte for byte', holdsWholeLine(globalOf(world), lessonLine('global', OTHER, 1).trimEnd()), globalOf(world));
  check('...and the evidence still archives the whole original line', holdsWholeLine(readOrEmpty(homeFile(world, 'lessons', 'evidence', `${KEY}.md`)), lessonLine('global', KEY, 2).trimEnd()), readOrEmpty(homeFile(world, 'lessons', 'evidence', `${KEY}.md`)));
  check('...the new file says it is never loaded, and where the rule text is', stubsOf(world).includes('NOT loaded') && stubsOf(world).includes('promoted-rules.md'), stubsOf(world));

  check('...the new file is the header, a blank line, and the stub: nothing else', stubsOf(world).startsWith(`${STUBS_HEADER}\n- [promoted] `) && stubsOf(world).endsWith(` — ${KEY}: no mechanism <!--fc:${KEY}#2-->`) && stubsOf(world).slice(STUBS_HEADER.length + 1).split('\n').length === 1, JSON.stringify(stubsOf(world)));
  check('status says the stubs file is NOT loaded, and the loaded ledger is not', world.run(['status']).out.split('\n').some((row) => row.includes('lessons-promoted.md') && row.includes('NOT loaded')), world.run(['status']).out);

  const keys = world.run(['keys']);
  check('keys still lists the promoted lesson, from the unloaded file', keys.out.includes(KEY), keys.out);
  check('status does not list it as due: a stub in the unloaded file counts as promoted', !world.run(['status']).out.includes('PROMOTION DUE'), world.run(['status']).out);

  mkLoaded(world);
  const loaded = loadedSet({ home: world.home, projectRoot: world.home, ceiling: world.home });
  const loadedText = loaded.files.map((file) => readFileSync(file.path, 'utf8')).join('\n');
  check('the harness-loaded set holds the ordinary lesson and NOT the stub', loadedText.includes(OTHER) && !loadedText.includes(`${KEY}#`), loaded.files.map((file) => file.path).join(', '));
}

/** Imports the home ledger the way `rules/20-lessons.md` does. @es Importa el ledger del home como lo hace `rules/20-lessons.md`. */
function mkLoaded(world) {
  writeFiles(path.dirname(world.home), { 'home/.claude/rules/20-lessons.md': '# Lessons\n\n@~/.claude/lessons-ledger.md\n' });
}

{
  const world = makeCaptureWorld({ scratch, name: 'project-stub', files: { 'repo/.claude/lessons-ledger.md': `${PROJECT_HEAD}${lessonLine('demo', KEY, 2)}`, 'repo/.claude/CLAUDE.md': rulesFor(KEY), 'home/.claude/lessons-ledger.md': GLOBAL_HEAD } });
  const done = promote(world);

  check('a PROJECT lesson promotes into the project contract', done.status === 0, done.out);
  check('...and its stub stays in the PROJECT ledger, which only that project loads', readOrEmpty(path.join(world.repo, '.claude', 'lessons-ledger.md')).includes(`- [promoted] `) && !existsSync(homeFile(world, 'lessons-promoted.md')), readOrEmpty(path.join(world.repo, '.claude', 'lessons-ledger.md')));
}

{
  const world = makeCaptureWorld({ scratch, name: 'recurrence', files: { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${lessonLine('global', KEY, 2)}`, 'home/.claude/rules/promoted-rules.md': rulesFor(KEY) } });
  promote(world);
  const again = world.run(['capture', '--key', KEY, '--scope', 'global', '--actor', 'orchestrator', '--lesson', lessonFor(KEY)]);

  check('a recurrence of a promoted lesson still finds its stub: the counter moves IN the unloaded file', stubsOf(world).includes(`<!--fc:${KEY}#3-->`), `${stubsOf(world)}\n${again.out}`);
  check('...no second line is written to the loaded ledger', !globalOf(world).includes(KEY), globalOf(world));
  check('...and it is told ALREADY PROMOTED, naming the rules file to read', again.out.includes('ALREADY PROMOTED') && again.out.includes('promoted-rules.md'), again.out);
}

// ---------------------------------------------------------------------------------------------
// `route --stubs` moves what is already there
// ---------------------------------------------------------------------------------------------

{
  const stubs = [stubLine('first-stub-key', 14), stubLine('second-stub-key', 2)];
  const files = { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${lessonLine('global', OTHER, 3)}${stubs[0]}${lessonLine('global', KEY, 1)}${stubs[1]}` };
  const world = makeCaptureWorld({ scratch, name: 'route-stubs', files });
  const before = globalOf(world);
  const dry = world.run(['route', '--stubs']);

  check('route --stubs is a DRY RUN without --write: it names what it would move and writes nothing', dry.status === 0 && dry.out.includes('first-stub-key') && dry.out.includes('second-stub-key') && globalOf(world) === before && !existsSync(homeFile(world, 'lessons-promoted.md')), dry.out);

  const written = world.run(['route', '--stubs', '--write']);

  check('route --stubs --write moves every stub, in order, byte for byte', written.status === 0 && stubs.every((stub) => holdsWholeLine(stubsOf(world), stub.trimEnd())) && stubsOf(world).indexOf('first-stub-key') < stubsOf(world).indexOf('second-stub-key'), `${written.out}\n${stubsOf(world)}`);
  check('...into a new file that is the header, a blank line and the stubs, with a final newline', stubsOf(world) === `${STUBS_HEADER}\n${stubs.join('')}`, JSON.stringify(stubsOf(world)));
  check('...the loaded ledger keeps only the lessons, byte for byte', globalOf(world) === `${GLOBAL_HEAD}${lessonLine('global', OTHER, 3)}${lessonLine('global', KEY, 1)}`, globalOf(world));
  check('...conserving every line: the lines of both files are exactly the lines of the ledger before', [...globalOf(world).split('\n'), ...stubsOf(world).split('\n')].filter((line) => line.startsWith('- [')).sort().join('\n') === before.split('\n').filter((line) => line.startsWith('- [')).sort().join('\n'), '');

  const stubsAfter = stubsOf(world);
  const second = world.run(['route', '--stubs', '--write']);

  check('a second run is a no-op: nothing to move, nothing rewritten', second.status === 0 && stubsOf(world) === stubsAfter && globalOf(world) === `${GLOBAL_HEAD}${lessonLine('global', OTHER, 3)}${lessonLine('global', KEY, 1)}`, second.out);
}

{
  const world = makeCaptureWorld({ scratch, name: 'route-stubs-existing', files: { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${stubLine('moved-now-key', 2)}`, 'home/.claude/lessons-promoted.md': `# Promoted stubs\n\n---\n${stubLine('already-there-key', 5)}` } });
  const done = world.run(['route', '--stubs', '--write']);

  check('stubs already in the unloaded file are kept, and the new ones are appended after them', done.status === 0 && stubsOf(world).indexOf('already-there-key') < stubsOf(world).indexOf('moved-now-key') && stubsOf(world).includes('# Promoted stubs'), `${done.out}\n${stubsOf(world)}`);
}

{
  const world = makeCaptureWorld({ scratch, name: 'route-stubs-duplicate', files: { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${stubLine('dup-key', 2)}`, 'home/.claude/lessons-promoted.md': `# Promoted stubs\n\n---\n${stubLine('dup-key', 2)}` } });
  const before = globalOf(world);
  const refused = world.run(['route', '--stubs', '--write']);

  check('NEAR MISS: a key that is already in the unloaded file is REFUSED, never written twice, and nothing is changed', refused.status !== 0 && globalOf(world) === before && (stubsOf(world).match(/dup-key#2/g) ?? []).length === 1, refused.out);
}

{
  const bare = '- [promoted] 2026-09-30 — markerless: no mechanism\n';
  const world = makeCaptureWorld({ scratch, name: 'route-markerless', files: { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${bare}` } });
  const refused = world.run(['route', '--stubs', '--write']);

  check('NEAR MISS: a stub with no marker is REFUSED, bilingual, and nothing is moved', refused.status === 1 && refused.out.includes('no readable marker') && refused.out.includes('@es') && globalOf(world) === `${GLOBAL_HEAD}${bare}` && !existsSync(homeFile(world, 'lessons-promoted.md')), refused.out);
}

{
  const world = makeCaptureWorld({ scratch, name: 'route-locked', files: { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${stubLine('locked-key', 2)}`, 'home/.claude/failure-capture/state/ledger.lock': '' } });
  const before = globalOf(world);
  const locked = world.run(['route', '--stubs', '--write']);

  check("a ledger locked by another writer: exit 2, bilingual, nothing written, the holder's lock untouched", locked.status === 2 && locked.out.includes('locked') && locked.out.includes('@es') && globalOf(world) === before && !existsSync(homeFile(world, 'lessons-promoted.md')) && existsSync(homeFile(world, 'failure-capture', 'state', 'ledger.lock')), locked.out);
  check('...and a dry run does not need the lock', world.run(['route', '--stubs']).status === 0);
}

{
  const manual = '# Lessons Ledger — hand written\n\nA long hand-written account of the format that every session paid for.\n\n---\n';
  const lessons = `\n${lessonLine('global', OTHER, 3)}\n${lessonLine('global', KEY, 1)}`;
  const projectLedger = `${PROJECT_HEAD}${lessonLine('demo', 'project-lesson-key', 1)}`;
  const world = makeCaptureWorld({ scratch, name: 'route-headers', files: { 'home/.claude/lessons-ledger.md': `${manual}${lessons}`, 'home/.claude/rules/lessons-guards.md': `---\npaths:\n  - "old"\n---\n# Old area header\n\n---\n\n${lessonLine('guards', 'area-lesson-key', 2)}`, 'repo/.claude/lessons-ledger.md': projectLedger } });
  const before = globalOf(world);
  const dry = world.run(['route', '--headers']);

  check('route --headers is a DRY RUN without --write: it names the ledgers whose header differs and writes nothing', dry.status === 0 && dry.out.includes('global') && dry.out.includes('guards') && globalOf(world) === before, dry.out);

  const done = world.run(['route', '--headers', '--write']);
  const expected = `${HEADER('global', GLOBAL_LOADER)}${lessons}`;

  check('route --headers --write puts the declared header on the home ledger and keeps its lessons byte for byte', done.status === 0 && globalOf(world) === `${HEADER('global', GLOBAL_LOADER).trimEnd()}\n${lessons}`, `${done.out}\n${JSON.stringify(globalOf(world))}\n${JSON.stringify(expected)}`);
  check('...the area ledger gets its own declared header, frontmatter included, and its lesson', readOrEmpty(homeFile(world, 'rules', 'lessons-guards.md')).startsWith(areaLedgerHeader('guards').trimEnd()) && readOrEmpty(homeFile(world, 'rules', 'lessons-guards.md')).includes('area-lesson-key#2'), readOrEmpty(homeFile(world, 'rules', 'lessons-guards.md')));
  check('...a PROJECT ledger is not a home ledger: its header is left alone', readOrEmpty(path.join(world.repo, '.claude', 'lessons-ledger.md')) === projectLedger, readOrEmpty(path.join(world.repo, '.claude', 'lessons-ledger.md')));
  check('...a ledger whose file does not exist is not created', !existsSync(homeFile(world, 'lessons-promoted.md')) && !existsSync(homeFile(world, 'rules', 'lessons-repo-tooling.md')), '');

  const settled = globalOf(world);

  check('a second run is a no-op', world.run(['route', '--headers', '--write']).status === 0 && globalOf(world) === settled, '');
}

{
  const world = makeCaptureWorld({ scratch, name: 'route-usage', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD } });
  const bare = world.run(['route']);

  check('route with nothing to route says what it needs, and changes nothing', bare.status === 1 && bare.out.includes('--stubs') && bare.out.includes('--headers') && bare.out.includes('@es'), bare.out);
  check('route with two things to route is refused too', world.run(['route', '--stubs', '--headers']).status === 1);
}

console.log(`routing selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
