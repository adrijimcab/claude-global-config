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

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAPTURE_MESSAGES } from './capture-messages.mjs';
import { lessonFor, makeCaptureWorld, monolingualRuns, readOrEmpty } from './capture-world.mjs';
import { messageProblems, render } from '../bilingual-output/message.mjs';
import { areaScopes } from './ledger-routes.mjs';
import { GLOBAL_SCOPE } from './project.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('failure-capture');

const scratch = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'failure-capture-messages-')));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
const KEY = 'message-lesson-key';
const GLOBAL_HEAD = '# Lessons Ledger — global\n\n---\n';
const plain = (count) => `- [global] 2026-09-14 — it happened -> RULE: do the thing <!--fc:${KEY}#${String(count)}-->\n`;

let passed = 0;
const failures = [];
const check = (name, condition, detail) => (condition === true ? (passed += 1) : failures.push(`${name} — ${String(detail).slice(0, 600)}`));

/** A message rendered, or the text of why it could not be: a message that cannot render fails the check that expects it instead of crashing the run. @es Un mensaje renderizado, o el texto de por qué no pudo: un mensaje que no se renderiza hace fallar la comprobación que lo espera en vez de tumbar la corrida. */
const attempt = (message, params) => {
  try {
    return render(message, params);
  } catch (error) {
    return `RENDER FAILED: ${error instanceof Error ? error.message : String(error)}`;
  }
};

/** The run's output must contain the table's message for `id`, filled with `params`. @es La salida debe contener el mensaje `id` de la tabla. */
const says = (name, out, id, params = {}) => {
  check(`${name}: says ${id} in both languages`, out.includes(attempt(CAPTURE_MESSAGES[id], params)), out);
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
  says('capture refused (scope, inside a project)', out, 'capture.problem.scope', { allowed: [GLOBAL_SCOPE, ...areaScopes(), 'demo'].map((scope) => `"${scope}"`).join(' / ') });
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

  says('a scope that needs a project, from outside any', out, 'capture.problem.scope.noProject', { allowed: [GLOBAL_SCOPE, ...areaScopes()].map((scope) => `"${scope}"`).join(' / ') });
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

  check('a recurring lesson: says capture.recurrence in both languages', out.includes(attempt(CAPTURE_MESSAGES['capture.recurrence'], { key: KEY, count: 2 })), out);
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

{
  const world = fresh('usage');
  const none = world.run([]);
  const unknown = world.run(['frobnicate']);

  check('no command prints the usage and exits 0', none.status === 0, none.out);
  says('no command', none.out, 'usage');
  check('an unknown command prints the same usage and exits 1', unknown.status === 1 && unknown.out.includes(attempt(CAPTURE_MESSAGES.usage)), unknown.out);
}

{
  // An invalid project configuration fails only the commands that read it, with exit 2, in both languages.
  // @es Una configuración de proyecto inválida hace fallar solo a los comandos que la leen, con salida 2, en ambos idiomas.
  const world = fresh('config-unreadable', GLOBAL_HEAD, { scope: 'global' });
  const { status, out } = world.run(['status']);
  const defect = `${path.join(world.repo, '.claude', 'failure-capture.json')} is invalid: "scope" must be a non-empty string other than "global"`;

  check('an invalid project configuration exits 2', status === 2, out);
  says('an invalid project configuration', out, 'project.configUnreadable', { command: 'status', defect });
}

{
  const world = fresh('condense-keys');
  const keys = path.join(scratch, 'condense-keys', 'keys.json');

  writeFileSync(keys, '{}', 'utf8');

  const { status, out } = world.run(['condense', '--keys', keys]);

  check('a keys file with no "keys" array exits 1', status === 1, out);
  says('a keys file with no "keys" array', out, 'condense.keysInvalid', { detail: 'the file has no "keys" array' });
}

{
  // What the commands print through modules (condense, budget) is bilingual too.
  // @es Lo que los comandos imprimen a través de módulos (condense, budget) también es bilingüe.
  const world = fresh('module-output', `${GLOBAL_HEAD}${plain(1)}`);
  const condense = world.run(['condense']);
  const budget = world.run(['budget', '--project', world.repo, '--ceiling', scratch]);

  check('condense prints nothing English only', condense.out.length > 0 && monolingualRuns(condense.out).length === 0, condense.out);
  check('budget prints nothing English only', budget.out.length > 0 && monolingualRuns(budget.out).length === 0, budget.out);
}

// ---------------------------------------------------------------------------------------------
// THE COMMAND HOLDS NO PRINT OF ITS OWN: every output goes through the speaker, so no sentence can be English only
// @es EL COMANDO NO TIENE NINGÚN PRINT PROPIO: toda salida pasa por el speaker, así que ninguna frase puede ser solo inglés
// ---------------------------------------------------------------------------------------------

/** The lines of `source` that call `console.*` outside a comment. @es Las líneas de `source` que llaman a `console.*` fuera de un comentario. */
const consoleCalls = (source) => source.split('\n').filter((text) => {
  const code = text.trimStart();

  return code.includes('console.') && !code.startsWith('//') && !code.startsWith('*') && !code.startsWith('/*');
});

check('the scan flags a console call', consoleCalls("  console.log('x');").length === 1 && consoleCalls('foo(); console.error(1);').length === 1, 'not flagged');
check('the scan ignores a comment that names console', consoleCalls('// console.log is not used\n * console.error neither\n/* console.warn */').length === 0, 'flagged a comment');

{
  const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'capture.mjs'), 'utf8');

  check('capture.mjs holds no console call: every sentence it prints goes through the speaker', consoleCalls(source).length === 0, consoleCalls(source).join(' | '));
}

console.log(`capture-messages selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
