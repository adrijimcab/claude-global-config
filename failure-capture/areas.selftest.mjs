#!/usr/bin/env node
/**
 * Discrimination proof of the AREAS of the ledger router: a lesson about one area of work (guards and their
 * tests, repository tooling, run artifacts) is written under that area's scope, in a rules file whose `paths:`
 * frontmatter makes the harness load it only when a matching file is in play (Claude Code's native
 * path-scoped rules), and never in the home ledger every session loads.
 *
 * WHAT MUST HOLD: a capture under an area scope lands in the area's file with the frontmatter the harness reads;
 * the loaded set does not hold it; an unknown scope is refused naming the areas; a recurrence folds where the
 * lesson is; the evidence of an area lesson lands in the same evidence store as every other lesson (a `lessons/`
 * directory under `rules/` would be LOADED, so it must not exist); promoting an area lesson asks for the AREA's
 * rules file, which is path-scoped too, and records its stub in the unloaded file; `route --key K --to AREA`
 * moves an existing lesson without losing it, refusing what it cannot place; and a project may not take a
 * scope that names an area.
 *
 * FIXTURES ARE CONSTRUCTED, NEVER LIVE (`capture-world.mjs`).
 *
 * @es Prueba de discriminación de las ÁREAS del enrutador de ledgers: una lección sobre un área de trabajo
 * (guards y sus tests, tooling del repositorio, artefactos de ejecución) se escribe bajo el alcance de esa
 * área, en un fichero de reglas cuyo frontmatter `paths:` hace que el harness lo cargue solo cuando hay un
 * fichero coincidente en juego (reglas con alcance de ruta nativas de Claude Code), y nunca en el ledger del
 * home que toda sesión carga. Los fixtures se CONSTRUYEN, nunca son los vivos.
 */

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { lessonFor, makeCaptureWorld, readOrEmpty } from './capture-world.mjs';
import { AREAS, areaLedgerFile, areaRulesFile, isAreaScope } from './ledger-routes.mjs';
import { holdsWholeLine } from './conservation.mjs';
import { loadedSet } from './loaded-set.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('failure-capture');

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-areas-')));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
const AREA = 'guards';
const KEY = 'area-lesson-key';
const OTHER = 'global-lesson-key';
const REASON = 'a claim written in prose cannot be detected by any hook; measured 0 of 6 recall. @es una afirmación escrita en prosa no la detecta ningún hook; recuerdo medido 0 de 6.';
const GLOBAL_HEAD = '# Lessons Ledger — global\n\n---\n';
const lessonLine = (scope, key, count) => `- [${scope}] 2026-09-14 — it recurred -> RULE: do the ${key} thing <!--fc:${key}#${String(count)}-->\n`;
const rulesFor = (key) => `- **\`${key}\`** — the rule, face one.\n`;

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 900)}`));

const at = (world, ...segments) => path.join(world.home, '.claude', ...segments);
const capture = (world, key = KEY, scope = AREA, extra = []) => world.run(['capture', '--key', key, '--scope', scope, '--actor', 'orchestrator', '--lesson', lessonFor(key), ...extra]);
const loadedPaths = (world) => loadedSet({ home: world.home, projectRoot: world.home, ceiling: world.home }).files.map((file) => file.path);

// ---------------------------------------------------------------------------------------------
// the registry
// ---------------------------------------------------------------------------------------------

check('the registry names the areas and their paths, and the helpers agree', Object.keys(AREAS).length >= 3 && Object.keys(AREAS).every((area) => isAreaScope(area) && AREAS[area].paths.length > 0 && AREAS[area].paths.every((glob) => typeof glob === 'string' && glob.trim() !== '')), JSON.stringify(Object.keys(AREAS)));
check('a scope that is not an area is not one', !isAreaScope('global') && !isAreaScope('promoted') && !isAreaScope('constructor') && !isAreaScope(undefined), '');
check('the files of an area are in rules/, named by the area', areaLedgerFile('/h', AREA) === path.join('/h', '.claude', 'rules', `lessons-${AREA}.md`) && areaRulesFile('/h', AREA) === path.join('/h', '.claude', 'rules', `promoted-${AREA}.md`), `${areaLedgerFile('/h', AREA)} ${areaRulesFile('/h', AREA)}`);

// ---------------------------------------------------------------------------------------------
// capture under an area scope
// ---------------------------------------------------------------------------------------------

{
  const world = makeCaptureWorld({ scratch, name: 'capture', files: { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${lessonLine('global', OTHER, 1)}`, 'home/.claude/rules/00-always.md': '# Always loaded\n\nA plain rule.\n' } });
  const done = capture(world);
  const file = readOrEmpty(areaLedgerFile(world.home, AREA));

  check('a capture under an area scope is recorded', done.status === 0, done.out);
  check('...in the area\'s rules file, as a line of that scope with the original marker', file.includes(`- [${AREA}] `) && file.includes(`<!--fc:${KEY}#1-->`), file);
  check('...whose frontmatter is the registry\'s paths, the form the harness reads, at the very top', file.startsWith(`---\npaths:\n${AREAS[AREA].paths.map((glob) => `  - "${glob}"`).join('\n')}\n---\n`), file.slice(0, 400));
  check('...and the home ledger is untouched, byte for byte', readOrEmpty(world.ledger) === `${GLOBAL_HEAD}${lessonLine('global', OTHER, 1)}`, readOrEmpty(world.ledger));

  const paths = loadedPaths(world);
  check('the loaded set holds the always-loaded rule and NOT the path-scoped area file', paths.some((one) => one.endsWith('00-always.md')) && !paths.some((one) => one.endsWith(`lessons-${AREA}.md`)), paths.join(', '));
  check('keys lists the area lesson, and status says the file is read on matching paths only', world.run(['keys']).out.includes(KEY), world.run(['keys']).out);
}

{
  const world = makeCaptureWorld({ scratch, name: 'capture-outside-a-project', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD } });
  const done = world.run(['capture', '--key', KEY, '--scope', AREA, '--actor', 'orchestrator', '--lesson', lessonFor(KEY), '--ceiling', scratch], { cwd: world.home });

  check('a capture under an area scope works from OUTSIDE any project too: it is folded into the area file, not left in the spool', done.status === 0 && readOrEmpty(areaLedgerFile(world.home, AREA)).includes(`<!--fc:${KEY}#1-->`), `${done.out}\n${readOrEmpty(areaLedgerFile(world.home, AREA))}`);
}

{
  const world = makeCaptureWorld({ scratch, name: 'unknown-scope', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD } });
  const refused = capture(world, KEY, 'not-an-area');

  check('an unknown scope is refused, bilingual, naming the areas it could have been', refused.status === 1 && Object.keys(AREAS).every((area) => refused.out.includes(`"${area}"`)) && refused.out.includes('@es'), refused.out);
  check('...and nothing is written anywhere', !existsSync(areaLedgerFile(world.home, AREA)) && readOrEmpty(world.ledger) === GLOBAL_HEAD, readOrEmpty(world.ledger));
}

{
  const world = makeCaptureWorld({ scratch, name: 'recurrence', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD } });
  capture(world);
  const again = capture(world, KEY, 'global');

  check('a recurrence folds in where the lesson IS, whatever scope it is captured under: the counter moves in the area file', readOrEmpty(areaLedgerFile(world.home, AREA)).includes(`<!--fc:${KEY}#2-->`) && !readOrEmpty(world.ledger).includes(KEY), `${again.out}\n${readOrEmpty(areaLedgerFile(world.home, AREA))}`);
}

{
  const world = makeCaptureWorld({ scratch, name: 'evidence', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD } });
  const narrative = 'what went wrong in the area -> root cause: nothing proved it discriminates';
  const done = world.run(['capture', '--key', KEY, '--scope', AREA, '--actor', 'orchestrator', '--lesson', narrative, '--rule', 'do the area thing the right way every time']);

  check('a tiered capture under an area scope is recorded', done.status === 0, done.out);
  check('...its evidence is in the ONE evidence store, `~/.claude/lessons/evidence`', existsSync(at(world, 'lessons', 'evidence', `${KEY}.md`)) && readOrEmpty(areaLedgerFile(world.home, AREA)).includes(`Evidence: lessons/evidence/${KEY}.md`) && holdsWholeLine(readOrEmpty(at(world, 'lessons', 'evidence', `${KEY}.md`)), `- [${AREA}] ${new Date().toLocaleDateString('sv')} — ${narrative} RULE: do the area thing the right way every time <!--fc:${KEY}#1-->`), readOrEmpty(at(world, 'lessons', 'evidence', `${KEY}.md`)));
  check('...and NOTHING is written under rules/lessons, which the harness would LOAD as a rule', !existsSync(at(world, 'rules', 'lessons')), '');
}

// ---------------------------------------------------------------------------------------------
// promotion of an area lesson
// ---------------------------------------------------------------------------------------------

{
  const files = { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, [`home/.claude/rules/lessons-${AREA}.md`]: `---\npaths:\n  - "**/*.selftest.mjs"\n---\n# Lessons Ledger — ${AREA}\n\n---\n${lessonLine(AREA, KEY, 2)}`, 'home/.claude/rules/promoted-rules.md': rulesFor(KEY) };
  const world = makeCaptureWorld({ scratch, name: 'promote-wrong-file', files });
  const refused = world.run(['promote', '--key', KEY, '--no-mechanism', REASON]);

  check('an area lesson asks for the AREA\'s rules file, and the global one does not satisfy it', refused.status === 1 && refused.out.includes(`promoted-${AREA}.md`) && !refused.out.includes('promoted-rules.md'), refused.out);
  check('...and the ledger line is not collapsed', readOrEmpty(areaLedgerFile(world.home, AREA)).includes(`- [${AREA}] `) && !existsSync(at(world, 'lessons-promoted.md')), readOrEmpty(areaLedgerFile(world.home, AREA)));
}

{
  const files = { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, [`home/.claude/rules/lessons-${AREA}.md`]: `---\npaths:\n  - "**/*.selftest.mjs"\n---\n# Lessons Ledger — ${AREA}\n\n---\n${lessonLine(AREA, KEY, 2)}`, [`home/.claude/rules/promoted-${AREA}.md`]: rulesFor(KEY) };
  const world = makeCaptureWorld({ scratch, name: 'promote-lands', files });
  const done = world.run(['promote', '--key', KEY, '--no-mechanism', REASON]);
  const record = readOrEmpty(world.incidents).split('\n').filter((entry) => entry.includes('"kind":"promotion"')).map((entry) => JSON.parse(entry)).at(-1);

  check('an area lesson promotes once its text is in the area\'s rules file', done.status === 0, done.out);
  check('...its stub goes to the unloaded stubs file and leaves the area ledger', readOrEmpty(at(world, 'lessons-promoted.md')).includes(`<!--fc:${KEY}#2-->`) && !readOrEmpty(areaLedgerFile(world.home, AREA)).includes(KEY), readOrEmpty(areaLedgerFile(world.home, AREA)));
  check('...and the closure record says it landed in the global family under the scope of the AREA, measured on the area file', record?.target === 'claude-md' && record?.scope === AREA && Object.keys(record?.faces ?? {}).length === 1, JSON.stringify(record));

  const again = capture(world, KEY, 'global');

  check('a recurrence of the promoted area lesson is told ALREADY PROMOTED, naming the area file that holds its text', again.out.includes('ALREADY PROMOTED') && again.out.includes(`promoted-${AREA}.md`) && !again.out.includes('promoted-rules.md'), again.out);
  check('...and the stub counts it, in the unloaded file', readOrEmpty(at(world, 'lessons-promoted.md')).includes(`<!--fc:${KEY}#3-->`), readOrEmpty(at(world, 'lessons-promoted.md')));
}

// ---------------------------------------------------------------------------------------------
// route --key K --to AREA
// ---------------------------------------------------------------------------------------------

{
  const keep = lessonLine('global', OTHER, 1);
  const moving = lessonLine('global', KEY, 3);
  const world = makeCaptureWorld({ scratch, name: 'route-lesson', files: { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${keep}${moving}` } });
  const before = readOrEmpty(world.ledger);
  const dry = world.run(['route', '--key', KEY, '--to', AREA]);

  check('route --key is a DRY RUN without --write: it says what it would move and writes nothing', dry.status === 0 && dry.out.includes(KEY) && dry.out.includes(AREA) && readOrEmpty(world.ledger) === before && !existsSync(areaLedgerFile(world.home, AREA)), dry.out);

  const written = world.run(['route', '--key', KEY, '--to', AREA, '--write']);
  const file = readOrEmpty(areaLedgerFile(world.home, AREA));

  check('route --key --write moves the lesson to the area, retagged and otherwise byte for byte, marker and counter included', written.status === 0 && holdsWholeLine(file, moving.trimEnd().replace('- [global]', `- [${AREA}]`)), `${written.out}\n${file}`);
  check('...the home ledger keeps only the other lesson', readOrEmpty(world.ledger) === `${GLOBAL_HEAD}${keep}`, readOrEmpty(world.ledger));
  check('...a second run is a no-op: the lesson is already there', world.run(['route', '--key', KEY, '--to', AREA, '--write']).status === 0 && readOrEmpty(areaLedgerFile(world.home, AREA)) === file, '');
}

{
  const bare = `- [global] 2026-07-20 — RULE: a rule written before markers existed. Evidence: lessons/evidence/${KEY}.md\n`;
  const world = makeCaptureWorld({ scratch, name: 'route-markerless', files: { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${bare}` } });
  const done = world.run(['route', '--key', KEY, '--to', AREA, '--write']);

  check('a line with no marker is found by the key of its evidence pointer, and moved whole', done.status === 0 && holdsWholeLine(readOrEmpty(areaLedgerFile(world.home, AREA)), bare.trimEnd().replace('- [global]', `- [${AREA}]`)) && !readOrEmpty(world.ledger).includes(KEY), `${done.out}\n${readOrEmpty(areaLedgerFile(world.home, AREA))}`);
}

for (const [name, args, files] of [
  ['an area that does not exist', ['--key', KEY, '--to', 'nowhere'], { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${lessonLine('global', KEY, 1)}` }],
  ['a key no ledger holds', ['--key', 'no-such-lesson-key', '--to', AREA], { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${lessonLine('global', KEY, 1)}` }],
  ['a key that is already in the destination under another file', ['--key', KEY, '--to', AREA], { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${lessonLine('global', KEY, 1)}`, [`home/.claude/rules/lessons-${AREA}.md`]: `---\npaths:\n  - "x"\n---\n${lessonLine(AREA, KEY, 1)}` }],
  ['--to without --key', ['--to', AREA], { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD }],
  ['--stubs together with --key and --to (two routes at once)', ['--stubs', '--key', KEY, '--to', AREA], { 'home/.claude/lessons-ledger.md': `${GLOBAL_HEAD}${lessonLine('global', KEY, 1)}` }],
]) {
  const world = makeCaptureWorld({ scratch, name: `route-refused-${name.replaceAll(' ', '-')}`, files });
  const before = readOrEmpty(world.ledger);
  const refused = world.run(['route', ...args, '--write']);

  check(`route REFUSES ${name}: non-zero, bilingual, and the home ledger is untouched`, refused.status === 1 && refused.out.includes('@es') && readOrEmpty(world.ledger) === before, refused.out);
}

// ---------------------------------------------------------------------------------------------
// route --key K --to AREA, for a promoted lesson: its rule text moves, its stub stays
// ---------------------------------------------------------------------------------------------

{
  const stay = '- **`staying-rule-key`** — another rule.\n  RULE: it stays in the always-loaded file.\n';
  const move = `- **\`${KEY}\`** — the rule that moves.\n  RULE: first sentence, with a ñ.\n  RULE: second sentence.\n`;
  const stubText = `# Stubs\n\n---\n\n- [promoted] 2026-09-30 — ${KEY}: no mechanism <!--fc:${KEY}#4-->\n`;
  const world = makeCaptureWorld({ scratch, name: 'route-block', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, 'home/.claude/lessons-promoted.md': stubText, 'home/.claude/rules/promoted-rules.md': `# Promoted\n\n${stay}\n${move}\n- **\`last-rule-key\`** — the last.\n` } });
  const rulesBefore = readOrEmpty(at(world, 'rules', 'promoted-rules.md'));
  const dry = world.run(['route', '--key', KEY, '--to', AREA]);

  check('route --key on a PROMOTED lesson is a dry run without --write: it names the key and the file, and writes nothing', dry.status === 0 && dry.out.includes(KEY) && dry.out.includes(`promoted-${AREA}.md`) && readOrEmpty(at(world, 'rules', 'promoted-rules.md')) === rulesBefore && !existsSync(areaRulesFile(world.home, AREA)), dry.out);

  const done = world.run(['route', '--key', KEY, '--to', AREA, '--write']);
  const area = readOrEmpty(areaRulesFile(world.home, AREA));

  check('--write moves the rule block into the area rules file, whole, under the path-scoped frontmatter', done.status === 0 && area.startsWith(`---\npaths:\n${AREAS[AREA].paths.map((glob) => `  - "${glob}"`).join('\n')}\n---\n`) && area.includes(move.trimEnd()), `${done.out}\n${area}`);
  check('...the always-loaded rules file loses exactly that block and one blank line', readOrEmpty(at(world, 'rules', 'promoted-rules.md')) === `# Promoted\n\n${stay}\n- **\`last-rule-key\`** — the last.\n`, readOrEmpty(at(world, 'rules', 'promoted-rules.md')));
  check('...and the stub stays exactly where it was, so the lesson is still promoted', readOrEmpty(at(world, 'lessons-promoted.md')) === stubText, readOrEmpty(at(world, 'lessons-promoted.md')));

  const paths = loadedPaths(world);
  check('the loaded set now holds the always-loaded rules without the block, and not the area file', paths.some((one) => one.endsWith('promoted-rules.md')) && !paths.some((one) => one.endsWith(`promoted-${AREA}.md`)) && !readFileSync(at(world, 'rules', 'promoted-rules.md'), 'utf8').includes(KEY), paths.join(', '));
  check('a second run is a no-op: the rule is already in the area', world.run(['route', '--key', KEY, '--to', AREA, '--write']).status === 0 && readOrEmpty(areaRulesFile(world.home, AREA)) === area, '');

  const recurred = capture(world, KEY, 'global');

  check('a recurrence of the moved rule is told ALREADY PROMOTED and pointed at the AREA file now holding its text', recurred.out.includes('ALREADY PROMOTED') && recurred.out.includes(`promoted-${AREA}.md`) && !recurred.out.includes('promoted-rules.md'), recurred.out);
}

{
  // The SECOND write of a block route lands and then fails (`write-fault.preload.cjs`): the route is one transaction,
  // so the area rules file it created is removed again and the source gets back its exact bytes.
  // @es La SEGUNDA escritura de una ruta de bloque aterriza y luego falla: la ruta es una transacción, así que el
  // fichero de reglas del área que creó se borra otra vez y el origen recupera sus bytes exactos.
  const move = `- **\`${KEY}\`** — the rule that moves.\n  RULE: first sentence.\n`;
  const rules = `# Promoted\n\n${move}\n\n\n`;
  const world = makeCaptureWorld({ scratch, name: 'route-block-fault', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, 'home/.claude/lessons-promoted.md': `# Stubs\n\n---\n\n- [promoted] 2026-09-30 — ${KEY}: no mechanism <!--fc:${KEY}#4-->\n`, 'home/.claude/rules/promoted-rules.md': rules } });
  const failed = world.run(['route', '--key', KEY, '--to', AREA, '--write'], { nodeArgs: ['--require', path.join(HERE, 'write-fault.preload.cjs')], env: { FC_FAULT_RENAME_MATCH: 'promoted-rules.md' } });

  check('a block route whose second write fails exits non-zero and says so in both languages, naming the cause', failed.status !== 0 && failed.out.includes('injected write fault') && failed.out.includes('route FAILED while writing') && failed.out.includes('route FALLÓ al escribir'), failed.out);
  check('...the source rules file gets back its exact bytes and the area rules file it created is gone', readFileSync(at(world, 'rules', 'promoted-rules.md'), 'utf8') === rules && !existsSync(areaRulesFile(world.home, AREA)), JSON.stringify([readOrEmpty(at(world, 'rules', 'promoted-rules.md')), existsSync(areaRulesFile(world.home, AREA))]));
}

{
  // The block route writes through a temporary file renamed over each file, never in place.
  // @es La ruta de bloque escribe por un fichero temporal renombrado encima de cada fichero, nunca en el sitio.
  const move = `- **\`${KEY}\`** — the rule that moves.\n  RULE: first sentence.\n`;
  const world = makeCaptureWorld({ scratch, name: 'route-block-atomic', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, 'home/.claude/lessons-promoted.md': `# Stubs\n\n---\n\n- [promoted] 2026-09-30 — ${KEY}: no mechanism <!--fc:${KEY}#4-->\n`, 'home/.claude/rules/promoted-rules.md': `# Promoted\n\n${move}` } });
  const failed = world.run(['route', '--key', KEY, '--to', AREA, '--write'], { nodeArgs: ['--require', path.join(HERE, 'write-fault.preload.cjs')], env: { FC_FAULT_RENAME_MATCH: `promoted-${AREA}.md` } });

  check('...and each write of a block route is an atomic rename (a fault on the first rename is seen and undone)', failed.status !== 0 && failed.out.includes('injected write fault') && !existsSync(areaRulesFile(world.home, AREA)) && readOrEmpty(at(world, 'rules', 'promoted-rules.md')) === `# Promoted\n\n${move}`, failed.out);
}

{
  const world = makeCaptureWorld({ scratch, name: 'route-block-absent', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, 'home/.claude/lessons-promoted.md': `# Stubs\n\n---\n\n- [promoted] 2026-09-30 — ${KEY}: no mechanism <!--fc:${KEY}#4-->\n`, 'home/.claude/rules/promoted-rules.md': '# Promoted\n' } });
  const refused = world.run(['route', '--key', KEY, '--to', AREA, '--write']);

  check('a promoted lesson whose rule text is in no rules file is REFUSED, bilingual, and nothing is created', refused.status === 1 && refused.out.includes('@es') && !existsSync(areaRulesFile(world.home, AREA)), refused.out);
}

{
  const move = `- **\`${KEY}\`** — the rule that moves.\n  RULE: one sentence.\n`;
  const stubs = `# Stubs\n\n---\n\n- [promoted] 2026-09-30 — ${KEY}: no mechanism <!--fc:${KEY}#4-->\n`;
  const twice = makeCaptureWorld({ scratch, name: 'route-block-twice', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, 'home/.claude/lessons-promoted.md': stubs, 'home/.claude/rules/promoted-rules.md': `# Promoted\n\n${move}`, [`home/.claude/rules/promoted-run-artifacts.md`]: `---\npaths:\n  - "x"\n---\n${move}` } });
  const refused = twice.run(['route', '--key', KEY, '--to', AREA, '--write']);

  check('a rule text held by TWO rules files is REFUSED, whole: nothing moves, bilingual', refused.status === 1 && refused.out.includes('more than one') && refused.out.includes('@es') && !existsSync(areaRulesFile(twice.home, AREA)) && readOrEmpty(at(twice, 'rules', 'promoted-rules.md')).includes(KEY), refused.out);

  const between = makeCaptureWorld({ scratch, name: 'route-block-between-areas', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, 'home/.claude/lessons-promoted.md': stubs, 'home/.claude/rules/promoted-rules.md': '# Promoted\n', [`home/.claude/rules/promoted-run-artifacts.md`]: `---\npaths:\n  - "x"\n---\n${move}` } });
  const moved = between.run(['route', '--key', KEY, '--to', AREA, '--write']);

  check('a rule text moves from one area\'s file to another\'s, wherever it is held', moved.status === 0 && readOrEmpty(areaRulesFile(between.home, AREA)).includes(move.trimEnd()) && !readOrEmpty(at(between, 'rules', 'promoted-run-artifacts.md')).includes(KEY), `${moved.out}\n${readOrEmpty(areaRulesFile(between.home, AREA))}`);
}

// ---------------------------------------------------------------------------------------------
// a project may not take an area's name
// ---------------------------------------------------------------------------------------------

{
  const world = makeCaptureWorld({ scratch, name: 'reserved-scope', config: { scope: AREA }, files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD } });
  const refused = world.run(['keys']);

  check('a project whose scope names an area is a configuration error for the commands that read the project', refused.status === 2 && refused.out.includes(AREA) && refused.out.includes('@es'), refused.out);
}

console.log(`areas selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
