#!/usr/bin/env node
/**
 * Discrimination proof that `capture.mjs` says its record / keys / dismiss / status / init sentences in the
 * house bilingual form. For every state of those commands the CLI is driven in a constructed world and its
 * output must CONTAIN the message rendered from the table (`capture-messages.mjs`) with that state's data,
 * so the proof fails if a sentence goes back to English only, loses its Spanish half, or stops carrying its
 * data. The table itself must carry no problem (`messageProblems`).
 *
 * @es Prueba de discriminación de que `capture.mjs` dice las frases de registro, claves, descarte, estado e
 * init en la forma bilingüe de la casa. Para cada estado de esos comandos se maneja el CLI en un mundo
 * construido y su salida debe CONTENER el mensaje renderizado desde la tabla con los datos de ese estado:
 * la prueba falla si una frase vuelve a solo inglés, pierde su mitad española o deja de llevar sus datos.
 */

import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CAPTURE_MESSAGES } from './capture-messages.mjs';
import { lessonFor, makeCaptureWorld, monolingualRuns, readOrEmpty } from './capture-world.mjs';
import { messageProblems, render } from './message.mjs';

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-messages-')));
const KEY = 'message-lesson-key';
const GLOBAL_HEAD = '# Lessons Ledger — global\n\n---\n';
const plain = (count) => `- [global] 2026-09-14 — it happened -> RULE: do the thing <!--fc:${KEY}#${String(count)}-->\n`;

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 600)}`));

/** The run's output must contain the table's message for `id`, filled with `params`. @es La salida debe contener el mensaje `id` de la tabla. */
const says = (name, out, id, params = {}) => {
  check(`${name}: says ${id} in both languages`, out.includes(render(CAPTURE_MESSAGES[id], params)), out);
  check(`${name}: nothing it printed is English only`, monolingualRuns(out).length === 0, monolingualRuns(out).join(' | '));
};

check('the message table has no problem (every message keeps both halves and the same data)', messageProblems(CAPTURE_MESSAGES).length === 0, messageProblems(CAPTURE_MESSAGES).join('; '));

const fresh = (name, ledger = GLOBAL_HEAD, config) => makeCaptureWorld({ scratch, name, config, files: { 'home/.claude/lessons-ledger.md': ledger } });
const capture = (world, extra = [], { key = KEY, scope = 'global', actor = 'orchestrator', lesson = lessonFor(KEY), cwd } = {}) => world.run(['capture', '--key', key, '--scope', scope, '--actor', actor, '--lesson', lesson, ...extra], cwd === undefined ? {} : { cwd });

{
  const world = fresh('keys-empty');

  says('keys with no ledger line', world.run(['keys']).out, 'keys.none');
}

{
  const world = fresh('keys-listed', `${GLOBAL_HEAD}${plain(3)}`);
  const { out } = world.run(['keys']);

  says('keys with a lesson', out, 'keys.header');
  check('keys with a lesson: the row is data only, key and count', out.includes(`  ${KEY}  (3x)`), out);
}

{
  const world = fresh('capture-refused');
  const { status, out } = capture(world, [], { key: 'no', scope: 'elsewhere', actor: 'somebody', lesson: 'too short' });

  check('a refused capture exits 1', status === 1, out);
  says('capture refused', out, 'capture.refused');
  says('capture refused (key)', out, 'capture.problem.key');
  says('capture refused (scope, inside a project)', out, 'capture.problem.scope', { allowed: '"global" / "demo"' });
  says('capture refused (actor)', out, 'capture.problem.actor');
  says('capture refused (lesson too short)', out, 'capture.problem.lessonShort');
}

{
  const world = fresh('capture-no-rule');
  const { out } = capture(world, [], { lesson: 'a lesson that is long enough to pass the length check but states nothing' });

  says('a lesson with no RULE', out, 'capture.problem.lessonRule');
}

{
  const world = fresh('capture-outside-project');
  const outside = path.join(scratch, 'capture-outside-project', 'nowhere');

  mkdirSync(outside, { recursive: true });

  const { out } = capture(world, [], { scope: 'demo', cwd: outside });

  says('a scope that needs a project, from outside any', out, 'capture.problem.scope.noProject', { allowed: '"global"' });
}

{
  const world = fresh('capture-new');
  const { status, out } = capture(world);

  check('a new lesson exits 0', status === 0, out);
  says('a new lesson', out, 'capture.new', { key: KEY });
}

{
  const world = fresh('capture-recurrence', `${GLOBAL_HEAD}${plain(1)}`);
  const { out } = capture(world);

  check('a recurring lesson: says capture.recurrence in both languages', out.includes(render(CAPTURE_MESSAGES['capture.recurrence'], { key: KEY, count: 2 })), out);
}

{
  const world = fresh('dismiss');
  const refused = world.run(['dismiss', '--reason', 'short']);
  const done = world.run(['dismiss', '--reason', 'this is not a correction, it is the owner asking a question']);

  says('dismiss with a thin reason', refused.out, 'dismiss.refused');
  says('dismiss accepted', done.out, 'dismiss.done');
}

{
  const world = fresh('status', `${GLOBAL_HEAD}${plain(1)}`);
  const { out } = world.run(['status']);
  const bytes = Buffer.byteLength(readOrEmpty(world.ledger));

  says('status', out, 'status.ledger', { scope: 'global', file: world.ledger, bytes, tokens: Math.round(bytes / 4) });
  says('status keyed lessons', out, 'status.keyed', { count: 1 });
  says('status incidents', out, 'status.incidents', { count: 0 });
  says('status dismissals', out, 'status.dismissals', { count: 0 });
}

{
  const world = fresh('status-due', `${GLOBAL_HEAD}${plain(2)}`);
  const { out } = world.run(['status']);

  says('status with a lesson due', out, 'status.due');
  check('status with a lesson due: the row is data only, key, count and target', out.includes(`  ${KEY} (2x) -> claude-md`), out);
}

{
  const world = fresh('init-refused');
  const outside = path.join(scratch, 'init-refused', 'nowhere');

  mkdirSync(outside, { recursive: true });

  says('init outside any project', world.run(['init'], { cwd: outside }).out, 'init.noProject');
}

{
  const world = fresh('init');
  const { out } = world.run(['init']);

  const ledgerFile = path.join(world.repo, '.claude', 'lessons-ledger.md');
  const instructions = path.join(world.repo, '.claude', 'CLAUDE.md');

  says('init in a project: the ledger', out, 'init.ledger.created', { scope: 'demo', file: ledgerFile });
  says('init in a project: the import', out, 'init.import.added', { scope: 'demo', file: instructions });

  const again = world.run(['init']).out;

  says('init a second time: the ledger', again, 'init.ledger.present', { scope: 'demo', file: ledgerFile });
  says('init a second time: the import', again, 'init.import.present', { scope: 'demo', file: instructions });
}

{
  // Another writer holds the ledger lock: the capture is spooled and says so, losing nothing.
  // @es Otro escritor tiene el lock del ledger: la captura queda en el spool y lo dice, sin perder nada.
  const world = makeCaptureWorld({ scratch, name: 'capture-deferred', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, 'home/.claude/failure-capture/state/ledger.lock': '' } });
  const { status, out } = capture(world);

  check('a capture behind a held lock exits 0', status === 0, out);
  says('a capture behind a held lock', out, 'capture.deferred', { count: 1 });
}

{
  // A `--rule` that cannot be shortened (the evidence store is unwritable) is recorded in full, with its reason.
  // @es Una `--rule` que no puede acortarse (el almacén de evidencia no es escribible) se registra completa, con su motivo.
  const world = makeCaptureWorld({ scratch, name: 'capture-fallback', files: { 'home/.claude/lessons-ledger.md': GLOBAL_HEAD, 'home/.claude/lessons': 'a file where the evidence directory should be' } });
  const { out } = world.run(['capture', '--key', KEY, '--scope', 'global', '--actor', 'orchestrator', '--lesson', 'what went wrong with this lesson -> root cause of it all', '--rule', 'do it right every time']);

  check('a rule that cannot be shortened says so in both languages', out.includes('the lesson was recorded as a full line, not shortened.') && out.includes(' @es la lección se registró como línea completa, sin acortar.'), out);
  check('...and nothing it printed is English only', monolingualRuns(out).length === 0, monolingualRuns(out).join(' | '));
}

console.log(`capture-messages selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
