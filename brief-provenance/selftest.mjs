#!/usr/bin/env node
/**
 * Self-test for the brief-provenance guard.
 *
 * It exercises the DECISION's state space, not merely that the guard fires — the `guard-that-cannot-
 * go-red` rule was promoted into the global contract precisely because two mechanisms of mine passed
 * their own tests while deciding wrongly. Testing that something FIRES is not testing that it
 * DISCRIMINATES, and the states your first real cases happen to contain are not the states that exist.
 *
 * TWO THINGS ARE ASSERTED PER CASE: the VERDICT, and a fragment of the REFUSAL TEXT. A guard that
 * denies for the wrong stated reason gets routed around — the third face of the same rule. Checking
 * only deny/allow cannot tell "refused because the word is buried" from "refused because it is absent",
 * and those two need different fixes.
 *
 * EVERY PAYLOAD HAS THE SHAPE THE HARNESS SENDS, and this is the part the previous version lacked. It
 * built `SendMessage` payloads as `{ tool_input: { prompt } }` and passed 26 of 26 while the guard read
 * a field `SendMessage` never carries: a real resume with no declaration was ALLOWED, silently, on every
 * send. The payloads now come from `~/.claude/hook-payloads/payloads.mjs`, which substitutes text into a RECORDED
 * payload without naming any field, so the proof cannot agree with the guard by construction. Every
 * payload's `cwd` is overridden with a sandbox directory of this run, so no case reads a live project
 * through the recording's real `cwd`.
 *
 * AND THE WIRING IS PART OF THE PROOF. The guard decided for `SendMessage` in code while the settings
 * registered it only for `Agent|Task`, and nothing compared the two. The wiring block asserts the chain
 * code → declaration: the tools the decision reads a brief from are exactly the tools
 * `guard.mjs.hook-registration.json` declares, and each reads the field its recording carries in full.
 * The fleet self-check (`.claude/hook-registration-selfcheck/`) asserts the other link, declaration →
 * registration, on every prompt.
 *
 * @es Auto-test del guard. Ejercita el espacio de estados de la DECISIÓN y afirma dos cosas por caso:
 * el veredicto y un fragmento del texto del rechazo. TODO PAYLOAD TIENE LA FORMA QUE ENVÍA EL HARNESS,
 * con su `cwd` sustituido por un directorio de prueba de esta corrida, para que ningún caso lea un
 * proyecto vivo. Y EL CABLEADO ES PARTE DE LA PRUEBA: el bloque del cableado afirma que las herramientas
 * de las que la decisión lee un brief son exactamente las que declara el sidecar de registro, y que cada
 * una lee el campo que su grabación lleva entero.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readMechanism } from '../guard-precision/blocks.mjs';
import { payloadFor, recordedPayload } from '../hook-payloads/payloads.mjs';
import { isolateState, stateDir } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('brief-provenance');

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const DECLARATION = join(HERE, 'guard.mjs.hook-registration.json');

// ---------------------------------------------------------------------------------------------
// THE DEPENDENCY-CLAIM FACE's constructed projects, built in a fresh directory under the OS temp root
// and removed in a `finally`. `project` declares dependencies in all three sections plus workspaces.
// @es Los proyectos construidos de la cara de dependencias, en un directorio nuevo bajo el temporal del
// sistema, borrados en un `finally`.
// ---------------------------------------------------------------------------------------------
const FIXTURES = mkdtempSync(join(tmpdir(), 'brief-provenance-dep-'));
const fixtureDir = (name) => join(FIXTURES, name).split('\\').join('/');

/** The directory every payload's `cwd` points at unless a case names another: an empty tree. @es El `cwd` de todo payload salvo que un caso nombre otro. */
const SANDBOX = fixtureDir('sandbox');

const long = (extra = '') => `${'x'.repeat(1600)}\n${extra}`;

/** The session every payload here is journaled under, so no proof run reads as real traffic. @es La sesión con la que se registra todo payload de aquí. */
const SESSION = 'selftest';

/** A recorded payload carrying `text`, with its `cwd` in the sandbox. @es Un payload registrado con `text` y `cwd` en el sandbox. */
const sandboxed = (tool, text, options = {}) => ({ ...payloadFor(tool, text, { sessionId: SESSION, ...options }), cwd: SANDBOX });

/** A delegation brief, in the recorded Agent payload. @es Un brief de delegación en el payload registrado de Agent. */
const agent = (text) => JSON.stringify(sandboxed('Agent', text));

/** The same shape under the harness's older alias. @es La misma forma bajo el alias antiguo del harness. */
const task = (text) => JSON.stringify(sandboxed('Agent', text, { toolName: 'Task' }));

/** A resume, in the payload CAPTURED from a real SendMessage call. @es Un resume, en el payload CAPTURADO de un SendMessage real. */
const resume = (text) => JSON.stringify(sandboxed('SendMessage', text));

/** A delegation whose payload carries no `cwd` at all. @es Una delegación cuyo payload no lleva `cwd`. */
const withoutCwd = (text) => {
  const payload = sandboxed('Agent', text);

  delete payload.cwd;

  return JSON.stringify(payload);
};

const MEASURED_LINE = 'MEASURED: 24 symbols (etc/*.api.md)';
const HYPOTHESIS_LINE = 'HYPOTHESIS: none';
const BOTH_GLUED = `${MEASURED_LINE}\n${HYPOTHESIS_LINE}`;

const write = (directory, file, content) => {
  mkdirSync(join(FIXTURES, directory), { recursive: true });
  writeFileSync(join(FIXTURES, directory, file), content);
};

/** The dependency names that are English words, written out here so a mutant cannot drop a word and its case together. @es Las palabras inglesas, escritas aquí. */
const ENGLISH_NAMES = ['ignore', 'concurrently', 'prettier', 'unified', 'glob', 'chalk', 'debug', 'ms', 'open'];

function buildFixtures() {
  mkdirSync(join(FIXTURES, 'sandbox'), { recursive: true });
  write('project', 'package.json', JSON.stringify({
    dependencies: { 'left-pad': '1.0.0' },
    devDependencies: { playwright: '1.58.0', '@playwright/test': '1.58.0' },
    peerDependencies: { 'peer-thing': '1.0.0' },
    workspaces: ['packages/*', 'tools', 'ghost', 'missing/*', 'broken-ws']
  }));
  write('plain', 'package.json', JSON.stringify({ dependencies: { 'plain-dep': '1.0.0' } }));
  write('object-ws', 'package.json', JSON.stringify({ workspaces: { packages: [7, 'tools'] } }));
  write('object-ws/tools', 'package.json', JSON.stringify({ devDependencies: { 'obj-ws-dep': '1.0.0' } }));
  write('null-deps', 'package.json', JSON.stringify({ dependencies: null, devDependencies: { 'nd-dev': '1.0.0' } }));
  write('string-deps', 'package.json', JSON.stringify({ dependencies: 'abc' }));
  write('array-deps', 'package.json', JSON.stringify({ dependencies: ['array-dep', 'other'], devDependencies: { 'beside-array': '1.0.0' } }));
  write('self-ws', 'package.json', JSON.stringify({ dependencies: { 'self-dep': '1.0.0' }, workspaces: ['.'] }));
  write('null-manifest', 'package.json', 'null');
  write('string-manifest', 'package.json', '"text"');
  write('project/packages/a', 'package.json', JSON.stringify({ dependencies: { 'ws-glob-dep': '1.0.0' } }));
  write('project/tools', 'package.json', JSON.stringify({ devDependencies: { 'ws-plain-dep': '1.0.0' }, workspaces: ['sub'] }));
  write('project/tools/sub', 'package.json', JSON.stringify({ dependencies: { 'nested-dep': '1.0.0' } }));
  write('project/broken-ws', 'package.json', '{ not json');
  write('broken', 'package.json', '{ not json');
  write('bom', 'package.json', `\uFEFF${JSON.stringify({ dependencies: { 'bom-dep': '1.0.0' } })}`);
  write('local', 'package.json', JSON.stringify({
    dependencies: { 'local-lib': 'workspace:*', 'file-lib': 'file:projects/file-lib', 'num-dep': 1, 'real-dep': '^1.0.0' }
  }));
  write('words', 'package.json', JSON.stringify({
    dependencies: Object.fromEntries(ENGLISH_NAMES.map((name) => [name, '1.0.0'])),
    devDependencies: { eslint: '9.0.0', typescript: '~5.8.0', LegacyPkg: '1.0.0' }
  }));
  // A checkout whose npm project sits one folder down, as in a repository whose workspace is `App/`.
  write('nested/App', 'package.json', JSON.stringify({ devDependencies: { 'nested-app-dep': '1.0.0' }, workspaces: ['projects/*'] }));
  write('nested/App/projects/lib', 'package.json', JSON.stringify({ dependencies: { 'nested-lib-dep': '1.0.0' } }));
  write('nested/Other', 'package.json', JSON.stringify({ dependencies: { 'nested-other-dep': '1.0.0' } }));
  write('nested/node_modules', 'package.json', JSON.stringify({ dependencies: { 'installed-root-dep': '1.0.0' } }));
  write('nested/.hidden', 'package.json', JSON.stringify({ dependencies: { 'hidden-dep': '1.0.0' } }));
  write('nested', 'README.txt', 'a file beside the nested project, never a project of its own');
  write('nested-broken/App', 'package.json', '{ not json');
  // Workspace entries that climb out of the checkout, and one that only looks like it does.
  write('escape', 'package.json', JSON.stringify({
    dependencies: { 'escape-dep': '1.0.0' },
    workspaces: ['../plain', '..\\object-ws\\tools', '..', '../*', 'in/../../project/tools', `${FIXTURES.split('\\').join('/')}/self-ws`, './inside/../inside']
  }));
  write('escape/inside', 'package.json', JSON.stringify({ dependencies: { 'inside-dep': '1.0.0' } }));
  mkdirSync(join(FIXTURES, 'empty'), { recursive: true });
}

const PROJECT = fixtureDir('project');
const tenancy = (directory) => `TENANCY: ${directory}`;
/** A brief that declares a project and a MEASURED line, with a HYPOTHESIS line. @es Un brief con proyecto, línea MEASURED y HYPOTHESIS. */
const claim = (measured, directory = PROJECT) => agent(`${tenancy(directory)}\n${measured}\n${HYPOTHESIS_LINE}`);
const SOURCE = 'node_modules/playwright/lib/runner/sigIntWatcher.js:12';
const WORDS = fixtureDir('words');

const cases = [
  // ---------------------------------------------------------------------------------------------
  // ALLOWED — the brief declares its provenance. Both spellings of a declaration are legitimate.
  // ---------------------------------------------------------------------------------------------
  ['allow', agent(long(BOTH_GLUED)), 'both markers, colon glued to the word'],
  ['allow', agent(long('MEASURED: none — exploratory task.\nHYPOTHESIS: none')), 'explicitly no claims — the honest escape that keeps this cheap to satisfy'],
  // A qualifier before the colon satisfies the control rather than evading it. The first version of
  // this file expected `deny` here, and it cost three refused delegations in one session to learn the
  // old check tested a PROXY (colon glued to the word) for the real property (the marker heads a line).
  // @es Un cualificador antes del dos puntos satisface el control, no lo esquiva.
  [
    'allow',
    agent(long('MEASURED (by me, on develop just now): 70 of 70\nHYPOTHESIS — to confirm per commit: the cache is shared')),
    'REAL CASE: a qualifier before the colon is a declaration, not an evasion'
  ],
  ['allow', agent(long(`  - ${MEASURED_LINE}\n  - ${HYPOTHESIS_LINE}`)), 'indented markers — a bulleted brief still declares'],
  ['allow', agent(BOTH_GLUED.split('\n').join('\r\n')), 'CRLF brief — an invisible character must not refuse a correct brief'],
  ['allow', agent(BOTH_GLUED), 'marker on the very first line, no preceding newline'],
  ['allow', task(long(BOTH_GLUED)), 'the Task alias is covered by the same decision'],

  // ---------------------------------------------------------------------------------------------
  // REFUSED — and each state must be NAMED, because each has a different remedy.
  // ---------------------------------------------------------------------------------------------
  ['deny', agent(long()), 'neither marker', 'ABSENT'],
  ['deny', agent(long(MEASURED_LINE)), 'HYPOTHESIS missing', 'no HYPOTHESIS line at all'],
  ['deny', agent(long(HYPOTHESIS_LINE)), 'MEASURED missing', 'no MEASURED line at all'],
  [
    'deny',
    agent(long('as the MEASURED: value shows, and the HYPOTHESIS: was wrong')),
    'BURIED mid-sentence — this PASSED the old glued-colon check and is refused now',
    'not at the START of a line'
  ],
  ['deny', agent(long(`MEASURED 70 of 70 with no colon anywhere\n${HYPOTHESIS_LINE}`)), 'heads a line but carries no colon', 'carries no colon'],
  ['deny', agent(long(`MEASUREDLY: a different word entirely\n${HYPOTHESIS_LINE}`)), 'a prefix of a longer word must not satisfy the marker', 'MEASURED'],
  ['deny', agent(long(`MEASUREDly: a lowercase continuation is a different word too\n${HYPOTHESIS_LINE}`)), 'a lowercase continuation must not satisfy the marker', 'MEASURED'],
  // The words sit at offsets 8 and 10 of their lines with a blank just after: a check that looks at the
  // text past the word's LENGTH instead of past the word itself would read them as declarations.
  // @es Las palabras quedan en los desplazamientos 8 y 10 con un blanco justo después.
  ['deny', agent(long('Xxxxxxx. see MEASURED: 70 of 70\nYyyyyyyyy. see HYPOTHESIS: a guess')), 'BURIED after as many characters as the word is long', 'not at the START of a line'],
  ['deny', agent(long(`MEASURED\n${HYPOTHESIS_LINE}`)), 'the bare word alone on its line heads it, and carries no colon', 'carries no colon'],
  ['allow', agent(long(`MEASURED with no colon, then a real one below\nMEASURED: 24 symbols\n${HYPOTHESIS_LINE}`)), 'a later declaring line satisfies the marker after a colonless one'],
  ...['*', '+', '#', '>'].map((bullet) => ['allow', agent(long(`${bullet} ${MEASURED_LINE}\n${bullet} ${HYPOTHESIS_LINE}`)), `a "${bullet}" list or heading prefix still declares`]),
  ['deny', agent(long()), 'an Agent refusal names its surface', 'this delegation (Agent)'],
  ['deny', task(long()), 'a Task refusal names its surface', 'this delegation (Task)'],
  ['deny', resume(long()), 'a SendMessage refusal names its surface', 'this message (SendMessage)'],
  ['deny', `﻿${agent(long())}`, 'a BOM-prefixed payload is still judged', 'ABSENT'],
  ['deny', agent('read src/x.ts and report the export list'), 'a SHORT prompt is refused too — length is not the variable (the #115 brief was 1086 chars)', 'ABSENT'],
  ['deny', task(long()), 'the Task alias refuses exactly as Agent does', 'ABSENT'],

  // ---------------------------------------------------------------------------------------------
  // THE RESUME SURFACE, in the payload the harness really sends. The first case below is the exact
  // state that slipped: under the previous guard it was ALLOWED with no output, because the guard read
  // `tool_input.prompt` and a SendMessage has none. Both directions are exercised, because a rule that
  // only ever refuses on a surface has not been shown to decide anything there.
  // @es EL SURFACE DE RESUME, con el payload que el harness envía de verdad. El primer caso es el estado
  // exacto que se escapó: el guard anterior lo PERMITÍA sin salida, porque leía `prompt` y un
  // SendMessage no lo lleva. Se ejercitan LAS DOS direcciones.
  // ---------------------------------------------------------------------------------------------
  ['deny', resume(long()), 'REAL CASE: a resume with no declaration — the 2026-09-08 laundering shape', 'ABSENT'],
  ['allow', resume(long(BOTH_GLUED)), 'a resume that declares its provenance passes untouched — the surface can go GREEN'],
  [
    'allow',
    resume(long('MEASURED (by me, just now): develop is at 3ea04d36\nHYPOTHESIS — to confirm: the failure is pre-existing')),
    'NEAR MISS on the resume surface: a qualifier before the colon is a declaration here too'
  ],
  [
    'deny',
    resume(long('as the MEASURED: value shows, and the HYPOTHESIS: was wrong')),
    'a resume with the markers buried mid-sentence is refused, exactly as a brief is',
    'not at the START of a line'
  ],
  ['deny', resume('Another worker independently confirmed it. Both share the same reconstruction.'), 'a SHORT resume is refused too — length is not the variable on this surface either', 'ABSENT'],
  // The payload also carries `content`, a 50-character PREVIEW of the message. Markers placed after
  // character 1600 are absent from the preview and present in the message, so this case reddens a guard
  // that reads the preview instead of the text the worker receives.
  // @es El payload lleva también `content`, una VISTA PREVIA de 50 caracteres. Con los marcadores tras
  // el carácter 1600, este caso enrojece un guard que lea la vista previa en vez del mensaje.
  ['allow', resume(long(BOTH_GLUED)), 'the brief is read from the full message, never from its 50-character preview'],
  ['deny', resume(`Resume.\n${'y'.repeat(60)}`), 'a resume refused on its full text, not on a preview that happens to look empty', 'no MEASURED line at all'],
  ['allow', resume(''), 'a pure idle subscription carries message "" (the schema default) — nothing to declare'],

  // ---------------------------------------------------------------------------------------------
  // THE DEPENDENCY-CLAIM FACE (guard-built-on-an-unmeasured-premise, 3x). A MEASURED line naming an
  // installed dependency must carry its evidence. The first case is the incident's own words.
  // @es LA CARA DE AFIRMACIONES SOBRE DEPENDENCIAS. El primer caso son las palabras del incidente.
  // ---------------------------------------------------------------------------------------------
  ['deny', claim('MEASURED: Playwright closes its children on SIGTERM'), 'REAL INCIDENT, as written: a capitalized name is the same package', 'playwright'],
  ['deny', claim('MEASURED: PLAYWRIGHT closes its children on SIGTERM'), 'an upper-case name is the same package', 'playwright'],
  ['deny', claim('MEASURED: legacypkg breaks on SIGTERM', WORDS), 'a manifest name with capitals is matched folded', 'legacypkg'],
  ['deny', claim('MEASURED: playwright closes its detached children on SIGTERM'), 'a MEASURED claim about an installed dependency with no citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes its detached children on SIGTERM'), 'the refusal is bilingual', '@es Una afirmación sobre cómo se comporta'],
  ['deny', claim('MEASURED: playwright closes its detached children on SIGTERM'), 'the refusal names the HYPOTHESIS way out', '2. Move the claim to a HYPOTHESIS: line'],
  ['deny', claim('MEASURED: playwright closes its detached children on SIGTERM'), 'the refusal names the citation way out', 'cite it on the same line as file:line (or file:line:col)'],
  ['deny', claim('MEASURED: playwright closes its detached children on SIGTERM'), 'the refusal names what already passes', 'a backticked command, or \\"exit 0\\"'],
  ['deny', claim('MEASURED: playwright closes its detached children on SIGTERM'), 'the refusal shows the offending line', 'UNSOURCED — MEASURED: playwright closes'],
  ['deny', claim('MEASURED: playwright closes its detached children on SIGTERM'), 'the refusal says the proof runs against the real tool', 'against the real tool'],
  // Every character that separates a package name from its prose, one case each; the lists are written out
  // here, not imported, so a mutant that drops a character cannot also drop its case.
  // @es Cada carácter que separa un nombre de paquete de su prosa, un caso por carácter; las listas se
  // escriben aquí y no se importan, para que un mutante que quite un carácter no quite también su caso.
  ...[' ', '\t', '\r', ':', ',', ';', '(', ')', '[', ']', '{', '}', '<', '>', '|', '"', "'", '`', '=', '!', '?'].map((separator) => [
    'deny',
    claim(`MEASURED: a${separator}playwright${separator}b`),
    `${JSON.stringify(separator)} separates a package name from the prose around it`,
    'playwright'
  ]),
  ...[' ', '\t', '\r', ',', ';', '(', ')', '[', ']', '{', '}', '<', '>', '|', '"', "'", '`'].map((separator) => [
    'allow',
    claim(`MEASURED: playwright ${separator}x/y.js:12${separator}`),
    `${JSON.stringify(separator)} wraps a citation without breaking it`
  ]),
  ['allow', claim('MEASURED: playwright, see x/y.js:1234567890'), 'every digit is a line number digit'],
  ['allow', claim(`MEASURED: playwright stops only on SIGINT (${SOURCE})`), 'the same claim citing node_modules/<pkg>/<file>:<line> passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see runner/sigIntWatcher.js:12'), 'a bare path:line citation passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see runner/sigIntWatcher.js:12-14.'), 'a path:line-range citation passes, the sentence period notwithstanding'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see sigIntWatcher.js:12'), 'a path:line citation with an extension and no slash passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see node_modules\\playwright\\lib\\runner\\sigIntWatcher.js:12'), 'a Windows path:line citation passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see C:/x/node_modules/playwright/lib/x.js:12'), 'a drive-letter path:line citation passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see lib/x.js:12:5'), 'a path:line:col citation passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see lib/x.js:12-14:5'), 'a path:range:col citation passes'],
  ['deny', claim('MEASURED: playwright stops only on SIGINT, read under node_modules/playwright'), 'a directory under node_modules/ names no line that was read', 'playwright'],
  ['deny', claim('MEASURED: playwright stops only on SIGINT, read under node_modules\\playwright'), 'a Windows directory under node_modules\\ names no line either', 'playwright'],
  ['deny', claim('MEASURED: playwright closes, served at http://localhost:4200'), 'a URL with a port is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes, see https://example.com:443'), 'a URL whose host looks like a file is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes, see https://example.com/x.js:12'), 'a URL to a file is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes, see lib/x.js:12:x'), 'a column that is not a number is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes, see lib/x.js:12:5-6'), 'a column is one number, never a range', 'playwright'],
  ['deny', claim('MEASURED: playwright closes, see lib/x.js:12:'), 'an empty column is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes, see lib/x.js:abc:5'), 'a column after a non-number is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes, see 12:5'), 'a line and column with no path is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright 1.58:2 closes its children'), 'a version-like 1.58:2 is not a path:line citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes its children at lib/x.js:abc'), 'a colon followed by a non-number is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes its children at lib/x.js:'), 'a colon followed by nothing is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes its children at :12'), 'a line number with no path is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes its children at lib/x.js:1-2-3'), 'a three-part range is not a citation', 'playwright'],
  ['deny', claim('MEASURED: playwright closes its children at lib/x.js:-3'), 'a range with an empty part is not a citation', 'playwright'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\nHYPOTHESIS: playwright closes its detached children on SIGTERM`), 'a HYPOTHESIS line naming the package passes'],
  ['allow', claim('MEASURED: lodash is not a dependency here and closes nothing'), 'a package that is not a dependency passes'],
  ['deny', claim('MEASURED: @playwright/test retries on SIGTERM'), 'a scoped dependency name is matched whole', '@playwright/test'],
  ['allow', claim('MEASURED: the playwrightish helper retries on SIGTERM'), 'a substring that is not a whole token passes'],
  ['allow', claim('MEASURED: the helper at C:/x/playwright retries'), 'a path segment that is not the whole token passes'],
  ['deny', claim('MEASURED: `playwright` closes its children on SIGTERM'), 'a one-word code span still names the package: only a command is a receipt', 'playwright'],

  // RUN RECEIPTS and MANIFEST VERSIONS are measurements: the judges' own examples, each beside its refused twin.
  // @es Los RECIBOS de ejecución y las VERSIONES de manifiesto son medidas: los ejemplos de los jueces, con su gemelo rechazado.
  ['allow', claim('MEASURED: npx eslint src exit 0', WORDS), 'JUDGES: a command followed by its exit code is a run receipt'],
  ['deny', claim('MEASURED: eslint reports nothing in src', WORDS), 'the same package with no receipt is a claim', 'eslint'],
  ['allow', claim('MEASURED: npx playwright test e2e/teardown.spec.ts --project=chromium exit 0'), 'JUDGES: a playwright run with its exit code is a receipt'],
  ['allow', claim('MEASURED: npx eslint src exit=0', WORDS), 'an exit=N receipt passes'],
  ['allow', claim('MEASURED: npx eslint src EXIT 1', WORDS), 'an EXIT N receipt passes, whatever the code'],
  ['allow', claim('MEASURED: npx eslint src (exit 0).', WORDS), 'a parenthesised exit code at the end of the sentence passes'],
  ['deny', claim('MEASURED: eslint does not exit cleanly', WORDS), 'the word exit with no code is no receipt', 'eslint'],
  ['deny', claim('MEASURED: eslint reports nothing, exit=ok', WORDS), 'exit= with no number is no receipt', 'eslint'],
  ['deny', claim('MEASURED: eslint reports nothing, exit=', WORDS), 'exit= with nothing after it is no receipt', 'eslint'],
  ['deny', claim('MEASURED: eslint reports nothing, then exit', WORDS), 'exit ending the line is no receipt', 'eslint'],
  ['deny', claim('MEASURED: eslint reports nothing, preexit 0', WORDS), 'a word that ends in exit is not the exit word', 'eslint'],
  ['allow', claim('MEASURED: `npx eslint src` reports nothing', WORDS), 'a backticked command is a run receipt'],
  ['deny', claim('MEASURED: `eslint` reports nothing', WORDS), 'a backticked single word is not a command', 'eslint'],
  ['deny', claim('MEASURED: `eslint` and then `tsc` report nothing', WORDS), 'the prose between two code spans is not a command', 'eslint'],
  ['deny', claim('MEASURED: eslint reports nothing after `npx eslint src', WORDS), 'an unclosed backtick quotes no command', 'eslint'],
  ['deny', claim('MEASURED: eslint reports nothing, see ` eslint `', WORDS), 'a single word padded with blanks is not a command', 'eslint'],
  ['allow', claim('MEASURED: typescript 5.8.0, read in package.json.', WORDS), 'a manifest ending the sentence is still cited'],
  ['allow', claim('MEASURED: typescript ~5.8.0 in package.json', WORDS), 'JUDGES: a version read from the manifest it cites passes'],
  ['deny', claim('MEASURED: typescript ~5.8.0', WORDS), 'a version with no manifest is a claim', 'typescript'],
  ['deny', claim('MEASURED: typescript strips enums, see package.json', WORDS), 'a manifest with no version is a claim', 'typescript'],
  ['allow', claim('MEASURED: typescript 5.8.0 in package-lock.json', WORDS), 'the lockfile is a manifest'],
  ['allow', claim('MEASURED: typescript 5.8.0 in Discovery-FE\\package.json', WORDS), 'a manifest named by its path is a manifest'],
  ['deny', claim('MEASURED: typescript 5.8.0 in mypackage.json', WORDS), 'a file that only ends like a manifest is not one', 'typescript'],
  ['deny', claim('MEASURED: typescript 5 in package.json', WORDS), 'a version needs a dot', 'typescript'],
  ['deny', claim('MEASURED: typescript ~ in package.json', WORDS), 'a range operator alone is no version', 'typescript'],
  ['deny', claim('MEASURED: typescript ~.8 in package.json', WORDS), 'a version starts with a digit after its operators', 'typescript'],
  ...['~', '^', '<', '>', '=', 'v'].map((lead) => ['allow', claim(`MEASURED: typescript ${lead}5.8.0 in package.json`, WORDS), `${JSON.stringify(lead)} may open a version read from the manifest`]),
  ['allow', claim('MEASURED: typescript >=5.8.0 in package.json', WORDS), 'a two-character range operator may open a version'],
  ['allow', claim('MEASURED: typescript =v5.8.0 in package.json', WORDS), 'several range operators may open a version'],

  // Names that are English words never count; a name of the same project that is not one still does.
  // @es Los nombres que son palabras inglesas nunca cuentan; uno del mismo proyecto que no lo es, sí.
  ...ENGLISH_NAMES.map((name) => ['allow', claim(`MEASURED: we ${name} the rest of the run`, WORDS), `the English word ${JSON.stringify(name)} is prose, not the package`]),
  ['deny', claim('MEASURED: we ignore the rest, and eslint closes', WORDS), 'an English-word name does not hide a real one beside it', 'eslint'],

  // Workspace-local packages are the project's own code.
  // @es Los paquetes locales del workspace son código propio.
  ['allow', claim('MEASURED: local-lib renders the table', fixtureDir('local')), 'a workspace:* package is not third-party'],
  ['allow', claim('MEASURED: file-lib renders the table', fixtureDir('local')), 'a file: package is not third-party'],
  ['deny', claim('MEASURED: real-dep renders the table', fixtureDir('local')), 'a registry range beside them is third-party', 'real-dep'],
  ['deny', claim('MEASURED: num-dep renders the table', fixtureDir('local')), 'a non-string version is still a dependency', 'num-dep'],

  // The continuation of a MEASURED heading is read too, line by line.
  // @es Se lee también la continuación de un encabezado MEASURED, línea a línea.
  ['deny', claim('MEASURED: the teardown, read today:\n  - playwright closes its children on SIGTERM'), 'a bullet under the heading is read', 'UNSOURCED — playwright closes its children'],
  ['deny', claim('MEASURED: the teardown, read today:\n\tplaywright closes its children on SIGTERM'), 'a tab-indented line under the heading is read', 'UNSOURCED — playwright closes'],
  ['deny', claim('MEASURED: the teardown:\n  - nothing here\n  - playwright closes its children'), 'every continuation line is read, not only the first', 'UNSOURCED — playwright closes'],
  ['deny', claim('- MEASURED: the teardown:\n  - playwright closes its children'), 'a bulleted heading has its continuation too', 'playwright'],
  ['allow', claim('MEASURED: the teardown:\n  - playwright stops on SIGINT (node_modules/playwright/lib/x.js:3)'), 'a cited continuation line passes'],
  ['deny', claim('MEASURED: the teardown, playwright included:\n  - read in node_modules/playwright/lib/x.js:3'), 'the evidence sits on each line: an uncited heading is refused alone', 'UNSOURCED — MEASURED: the teardown, playwright included'],
  ['allow', claim('MEASURED: the teardown:\n\n  - playwright closes its children'), 'a blank line ends the claim'],
  ['allow', claim('MEASURED: the teardown:\n   \n  - playwright closes its children'), 'a whitespace-only line ends the claim'],
  ['allow', claim('MEASURED: the teardown:\nplaywright closes its children, said the old brief'), 'an unindented line ends the claim'],
  ['allow', claim('MEASURED: the teardown:\n  - HYPOTHESIS: playwright closes its children'), 'an indented HYPOTHESIS marker ends the claim'],
  ['allow', claim('MEASURED: the teardown:\n  - HYPOTHESIS: a guess\n  - playwright closes its children'), 'the lines after an indented HYPOTHESIS marker belong to it'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\nMEASUREDLY: x\n  - playwright closes\n${HYPOTHESIS_LINE}`), 'a longer word heads no claim, so its bullets are not read'],
  ['deny', agent(`${tenancy(PROJECT)}\r\nMEASURED: the teardown:\r\n  - playwright closes its children\r\n${HYPOTHESIS_LINE}`), 'a CRLF brief: the continuation is read', 'playwright'],

  ['deny', claim('MEASURED: left-pad pads on the left'), 'a dependencies entry is matched', 'left-pad'],
  ['deny', claim('MEASURED: peer-thing peers'), 'a peerDependencies entry is matched', 'peer-thing'],
  ['deny', claim('MEASURED: ws-glob-dep behaves'), 'a dir/* workspace manifest is read', 'ws-glob-dep'],
  ['deny', claim('MEASURED: ws-plain-dep behaves'), 'a plain workspace manifest is read', 'ws-plain-dep'],
  ['allow', claim('MEASURED: nested-dep behaves'), 'the workspaces of a workspace are not followed (npm does not nest them)'],
  ['deny', claim('MEASURED: left-pad behaves'), 'an unparsable workspace manifest does not hide the root', 'left-pad'],
  ['deny', claim('MEASURED: "playwright", then more'), 'a quoted name is matched', 'playwright'],
  ['deny', claim('MEASURED: it is playwright.'), 'a name ending the sentence is matched', 'playwright'],
  ['deny', claim('MEASURED: playwright: closes'), 'a name followed by a colon is matched', 'playwright'],
  ['deny', claim('- MEASURED: playwright closes its children'), 'a bulleted MEASURED line is read too', 'playwright'],
  ['deny', claim('MEASURED: left-pad and playwright both close'), 'both packages are named', 'left-pad, playwright'],
  ['deny', claim('MEASURED: playwright closes\nMEASURED: lodash ok'), 'one unsourced line among several is enough', 'playwright'],
  ['allow', claim('MEASURED: lodash ok\nMEASURED: playwright closes (node_modules/playwright/lib/x.js:1)'), 'every dependency line cited passes'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\n${HYPOTHESIS_LINE}\nplaywright closes its children, said the old brief`), 'a package named outside a MEASURED line is not this face\'s business'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\nMEASUREDLY: playwright closes\n${HYPOTHESIS_LINE}`), 'a longer word is not a MEASURED line'],
  ['deny', JSON.stringify({ ...sandboxed('Agent', `MEASURED: playwright closes\n${HYPOTHESIS_LINE}`), cwd: PROJECT }), 'with no TENANCY line the hook payload cwd names the project', 'playwright'],
  ['allow', JSON.stringify({ ...sandboxed('Agent', `${tenancy(fixtureDir('empty'))}\nMEASURED: playwright closes\n${HYPOTHESIS_LINE}`), cwd: PROJECT }), 'a TENANCY line wins over cwd, and its project declares nothing'],
  ['deny', resume(`${tenancy(PROJECT)}\nMEASURED: playwright closes\n${HYPOTHESIS_LINE}`), 'the resume surface is covered too', 'this message (SendMessage)'],
  ['deny', task(`${tenancy(PROJECT)}\nMEASURED: playwright closes\n${HYPOTHESIS_LINE}`), 'the Task alias is covered too', 'this delegation (Task)'],
  ['allow', claim('MEASURED: playwright closes', fixtureDir('empty')), 'no package.json: the face does not decide'],
  ['allow', claim('MEASURED: playwright closes', fixtureDir('broken')), 'an unreadable package.json: the face does not decide'],
  ['allow', withoutCwd(`MEASURED: playwright closes\n${HYPOTHESIS_LINE}`), 'no project at all: the face does not decide'],
  ['allow', agent(`MEASURED: playwright closes\n${HYPOTHESIS_LINE}`), 'a payload whose cwd is the sandbox reads no live project'],
  ['deny', claim('MEASURED: plain-dep closes', fixtureDir('plain')), 'a manifest with no workspaces is read', 'plain-dep'],
  ['deny', claim('MEASURED: obj-ws-dep closes', fixtureDir('object-ws')), 'the object form of workspaces is read, a non-string entry skipped', 'obj-ws-dep'],
  ['deny', claim('MEASURED: nd-dev closes', fixtureDir('null-deps')), 'a null dependency section does not hide the others', 'nd-dev'],
  ['allow', claim('MEASURED: count 0 of 3', fixtureDir('string-deps')), 'a string dependency section contributes no names'],
  ['allow', claim('MEASURED: count 0 of 1 failed', fixtureDir('array-deps')), 'an array dependency section yields no index names'],
  ['allow', claim('MEASURED: array-dep closes', fixtureDir('array-deps')), 'an array dependency section yields no element names either'],
  ['deny', claim('MEASURED: beside-array closes', fixtureDir('array-deps')), 'an array section does not hide the others', 'beside-array'],
  ['deny', claim('MEASURED: self-dep closes', fixtureDir('self-ws')), 'a workspace entry pointing at the root does not recurse', 'self-dep'],
  ['allow', claim('MEASURED: playwright closes', fixtureDir('null-manifest')), 'a null manifest: the face does not decide'],
  ['allow', claim('MEASURED: playwright closes', fixtureDir('string-manifest')), 'a string manifest: the face does not decide'],
  ['deny', claim('MEASURED: bom-dep closes', fixtureDir('bom')), 'a manifest written with a UTF-8 BOM is read', 'bom-dep'],

  // A checkout whose npm project sits one folder down.
  // @es Un checkout cuyo proyecto npm está una carpeta más abajo.
  ['deny', claim('MEASURED: nested-app-dep closes', fixtureDir('nested')), 'a project one folder down is read', 'nested-app-dep'],
  ['deny', claim('MEASURED: nested-other-dep closes', fixtureDir('nested')), 'every project one folder down is read, as a union', 'nested-other-dep'],
  ['deny', claim('MEASURED: nested-lib-dep closes', fixtureDir('nested')), 'the workspaces of a project one folder down are read', 'nested-lib-dep'],
  ['allow', claim('MEASURED: installed-root-dep closes', fixtureDir('nested')), 'node_modules is never read as a nested project'],
  ['allow', claim('MEASURED: hidden-dep closes', fixtureDir('nested')), 'a dot-folder is never read as a nested project'],
  ['allow', claim('MEASURED: playwright closes', fixtureDir('nested-broken')), 'an unparsable nested manifest: the face does not decide'],

  // Containment: a workspace entry that leaves the checkout is never followed.
  // @es Contención: una entrada de workspace que sale del checkout nunca se sigue.
  ['deny', claim('MEASURED: escape-dep closes', fixtureDir('escape')), 'the root of a checkout with escaping entries is still read', 'escape-dep'],
  ['allow', claim('MEASURED: plain-dep closes', fixtureDir('escape')), 'a ../ entry is not followed out of the checkout'],
  ['allow', claim('MEASURED: obj-ws-dep closes', fixtureDir('escape')), 'a ..\\ entry is not followed out of the checkout'],
  ['allow', claim('MEASURED: ws-plain-dep closes', fixtureDir('escape')), 'an entry that climbs out through an inner folder is not followed'],
  ['allow', claim('MEASURED: self-dep closes', fixtureDir('escape')), 'an absolute entry is not followed'],
  ['deny', claim('MEASURED: inside-dep closes', fixtureDir('escape')), 'an entry that only looks like a climb is normalised and read', 'inside-dep'],

  ['deny', agent(`${tenancy(PROJECT)}\r\nMEASURED: it is playwright\r\n${HYPOTHESIS_LINE}`), 'a CRLF brief: the name ending its line is matched', 'playwright'],
  ['allow', agent(`${tenancy(PROJECT)}\r\nMEASURED: playwright, see x/y.js:12\r\n${HYPOTHESIS_LINE}`), 'a CRLF brief: the citation ending its line counts'],
  ['deny', claim('MEASURED: playwright closes, see line:12'), 'a bare word and a number is not a citation', 'playwright'],
  ['allow', claim('MEASURED: playwright closes, see .npmrc:2'), 'a hidden file path:line is a citation'],
  ['deny', claim('MEASURED: playwright closes, see src/runner:12'), 'a slashed path with no extension is not a citation', 'playwright'],
  ['deny', claim('MEASURED: left-pad a\nMEASURED: left-pad b'), 'a package named by two lines is listed once', '(left-pad)'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\n${HYPOTHESIS_LINE}\nXxxxxxx. see MEASURED: playwright closes`), 'a MEASURED word buried in prose is not a MEASURED line (a blank sits just past the word\'s length)'],

  // ---------------------------------------------------------------------------------------------
  // OUTSIDE THE DECISION — not a claim-bearing tool, or nothing to read.
  // ---------------------------------------------------------------------------------------------
  ['allow', JSON.stringify({ tool_name: 'Bash', tool_input: { command: long() }, cwd: SANDBOX }), 'not a claim-bearing tool'],
  ['allow', JSON.stringify({ ...sandboxed('Agent', ''), tool_input: {} }), 'no prompt at all'],
  ['allow', agent('   \n  '), 'whitespace-only prompt'],
  ['allow', JSON.stringify({ ...sandboxed('SendMessage', ''), tool_input: { to: 'main', message: { type: 'shutdown_response' } } }), 'a structured (non-string) message carries no brief'],

  // ---------------------------------------------------------------------------------------------
  // FAIL-OPEN — every malfunction of its own machinery must let the delegation run.
  // ---------------------------------------------------------------------------------------------
  ['allow', 'NOT JSON AT ALL', 'garbage payload'],
  ['allow', '', 'empty payload'],
  ['allow', '{"tool_name":', 'truncated json'],
  ['allow', '﻿NOT JSON', 'BOM + garbage']
];

let failures = 0;
let total = 0;

/** Records one outcome and prints it. @es Registra un resultado y lo imprime. */
function report(ok, line) {
  total += 1;

  if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

function runCases() {
  for (const [expected, input, label, expectedText] of cases) {
    let output = '';
    let code = 0;

    try {
      output = execFileSync('node', [GUARD], { input, encoding: 'utf8' });
    } catch (error) {
      code = error.status;
      output = error.stdout ?? '';
    }

    const actual = output.includes('"deny"') ? 'deny' : 'allow';
    // The reason travels inside a JSON string, so the fragment is checked against the raw payload.
    const textOk = expectedText === undefined || output.includes(expectedText);
    const why = textOk ? '' : `  [the refusal never named: ${expectedText}]`;

    report(actual === expected && code === 0 && textOk, `expected=${expected} actual=${actual} exit=${code}  ${label}${why}`);
  }
}

// ---------------------------------------------------------------------------------------------
// THE WIRING: code → declaration. A decision that covers a tool its declaration does not name is the
// exact drift that left SendMessage unguarded while the code claimed it.
// @es EL CABLEADO: código → declaración. Una decisión que cubre una herramienta que su declaración no
// nombra es exactamente la deriva que dejó SendMessage sin guardar mientras el código lo reclamaba.
// ---------------------------------------------------------------------------------------------

/** The recording that proves where each claim-bearing tool carries its brief. @es La grabación que prueba dónde lleva su brief cada herramienta. */
const RECORDING_OF = { Agent: 'Agent', Task: 'Agent', SendMessage: 'SendMessage' };

async function checkWiring() {
  let carriers;

  try {
    ({ BRIEF_CARRIERS: carriers } = await import('./provenance.mjs'));
  } catch (error) {
    report(false, `the decision module could not be loaded, so nothing ties the code to its wiring: ${error instanceof Error ? error.message : String(error)}`);
  }

  let declared;

  try {
    const declaration = JSON.parse(readFileSync(DECLARATION, 'utf8'));
    const entry = declaration.registrations.find((registration) => registration.event === 'PreToolUse');

    declared = new Set(String(entry?.matcher ?? '').split('|').filter((tool) => tool.length > 0));
  } catch (error) {
    report(false, `guard.mjs.hook-registration.json is missing or unreadable, so the fleet self-check cannot audit this guard: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (carriers === undefined || declared === undefined) return;

  const decided = Object.keys(carriers);

  for (const tool of decided) report(declared.has(tool), `the declaration registers ${tool}, which the decision reads a brief from`);

  for (const tool of declared) report(Object.hasOwn(carriers, tool), `the decision reads a brief from ${tool}, which the declaration registers`);

  for (const tool of decided) {
    const recording = RECORDING_OF[tool];

    if (recording === undefined) {
      report(false, `no recorded payload proves where ${tool} carries its brief`);
      continue;
    }

    const recorded = recordedPayload(recording);

    report(recorded.payload.tool_input[carriers[tool].field] === recorded.text, `${tool} reads tool_input.${carriers[tool].field}, the field its recording carries IN FULL`);
  }
}

/** The parsed lines of one journal of this guard; none when the guard never wrote it. @es Las líneas parseadas de un diario; ninguna si no existe. */
function journalLines(file) {
  const journal = join(stateDir('brief-provenance'), file);

  if (!existsSync(journal)) return [];

  return readFileSync(journal, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------------------------
// THE DEPENDENCY-CLAIM FACE SAYS SO WHEN IT CANNOT DECIDE: the cases above allowed briefs it could not
// read a project for; each left a line with its reason in `undecided.jsonl`, never among the refusals.
// @es LA CARA DICE QUE NO PUEDE DECIDIR: cada caso permitido sin proyecto legible dejó una línea con su
// motivo en `undecided.jsonl`, nunca entre los rechazos.
// ---------------------------------------------------------------------------------------------
function checkJournals() {
  const refusals = journalLines('refusals.jsonl');
  const undecided = journalLines('undecided.jsonl');
  const reasons = undecided.flatMap((entry) => entry.undecided.map(({ file, reason }) => `${file ?? ''} ${reason}`));
  const leftCheckout = (entry) => reasons.some((reason) => reason.includes('escape/package.json') && reason.includes(`workspace entry "${entry}" leaves the checkout`));

  report(reasons.some((reason) => reason.includes('empty/package.json')), 'a project without package.json is journaled as undecided, with the file');
  report(reasons.some((reason) => reason.includes('broken/package.json')), 'an unreadable package.json is journaled as undecided, with the file');
  report(reasons.some((reason) => reason.includes('project/broken-ws/package.json')), 'an unparsable workspace manifest is journaled as undecided, never dropped');
  report(reasons.some((reason) => reason.includes('nested-broken/App/package.json')), 'an unparsable nested manifest is journaled as undecided');
  report(!reasons.some((reason) => reason.includes('nested/package.json')), 'a checkout read one folder down is decided, not journaled');
  report(reasons.some((reason) => reason.includes('no project directory')), 'a brief with no project is journaled as undecided');
  report(reasons.filter((reason) => reason.includes('manifest/package.json') && reason.includes('not a JSON object')).length === 2, 'a null and a string manifest are journaled as not a JSON object');
  report(!reasons.some((reason) => reason.includes('ghost')), 'a workspace entry without a manifest is routine and is not journaled');
  report(!reasons.some((reason) => reason.includes('bom/package.json')), 'a manifest with a BOM is read, not journaled');
  for (const entry of ['../plain', '..\\object-ws\\tools', '..', '../*', 'in/../../project/tools']) report(leftCheckout(entry), `the escaping workspace entry ${entry} is journaled as undecided`);
  report(reasons.some((reason) => reason.includes('/self-ws" leaves the checkout')), 'an absolute workspace entry is journaled as undecided');
  report(!reasons.some((reason) => reason.includes('./inside/../inside')), 'an entry that stays inside is not journaled');
  report(undecided.length > 0 && undecided.every((entry) => entry.kind === 'dependency-claim-undecided' && typeof entry.tool === 'string' && entry.tool.length > 0), 'an undecided entry names its kind and its tool');
  report(refusals.some((entry) => entry.kind === 'dependency-claim' && entry.packages.includes('playwright')), 'a refusal is journaled with its packages');
  report(!refusals.some((entry) => entry.kind === 'dependency-claim-undecided'), 'the refusal journal holds no undecided line: an allowed brief is never journaled as a block');

  // guard-precision reads every journal of this guard's state: an undecided line must never become a block there.
  // @es guard-precision lee todo diario de este estado: una línea no decidida nunca se vuelve un bloqueo allí.
  const precision = readMechanism('brief-provenance', readdirSync);

  report(precision.records.length === 0 && precision.unclassifiedFiles['refusals.jsonl'] === refusals.length, 'guard-precision counts no block from this guard, and its refusal journal holds only refusals');
}

let crashed;

try {
  buildFixtures();
  runCases();
  await checkWiring();
  checkJournals();
} catch (error) {
  crashed = error;
} finally {
  rmSync(FIXTURES, { recursive: true, force: true });
}

if (crashed !== undefined) report(false, `the selftest itself crashed: ${crashed instanceof Error ? crashed.stack : String(crashed)}`);

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
