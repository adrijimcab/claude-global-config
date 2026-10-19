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
 * EVERY PAYLOAD HAS THE SHAPE THE HARNESS SENDS. It built `SendMessage` payloads as `{ tool_input: { prompt } }`
 * once and passed 26 of 26 while the guard read a field `SendMessage` never carries. The payloads come from
 * `~/.claude/hook-payloads/payloads.mjs`, which substitutes text into a RECORDED payload without naming any
 * field. Every payload's `cwd` is overridden with a sandbox directory of this run, so no case reads a live
 * project through the recording's real `cwd`.
 *
 * THE CLAIM JUDGE IS INJECTED. Every case runs `evaluate` in this process with a stand-in for the model call
 * that answers what the case names (refuse, pass, throw, a non-verdict) and RECORDS each call, so a case also
 * asserts WHETHER the judge was consulted: the prefilter's whole job is deciding when it is not. A few cases
 * spawn the guard as the registered process would run it, on briefs that never reach the judge, to prove `main`.
 *
 * AND THE WIRING IS PART OF THE PROOF: the tools the decision reads a brief from are exactly the tools
 * `guard.mjs.hook-registration.json` declares, and each reads the field its recording carries in full.
 *
 * @es Auto-test del guard. Afirma el veredicto y un fragmento del rechazo por caso, con payloads de la forma
 * que envía el harness y su `cwd` en un sandbox. EL JUEZ SE INYECTA: cada caso corre `evaluate` en este proceso
 * con un sustituto de la llamada al modelo que contesta lo que el caso pide y REGISTRA cada llamada, así cada
 * caso afirma también SI se consultó al juez. Algunos casos lanzan el guard como proceso para probar `main`. Y
 * EL CABLEADO es parte de la prueba.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readMechanism } from '../guard-precision/blocks.mjs';
import { payloadFor, recordedPayload } from '../hook-payloads/payloads.mjs';
import { isolateState, stateDir } from '../hook-state/locations.mjs';
import { evaluate } from './guard.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal.
isolateState('brief-provenance');

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const DECLARATION = join(HERE, 'guard.mjs.hook-registration.json');

// ---------------------------------------------------------------------------------------------
// THE DEPENDENCY-CLAIM FACE's constructed projects, built in a fresh directory under the OS temp root
// and removed in a `finally`. `project` declares dependencies in all three sections plus workspaces.
// @es Los proyectos construidos, en un directorio nuevo bajo el temporal del sistema, borrados en un `finally`.
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
    dependencies: { 'local-lib': 'workspace:*', 'file-lib': 'file:projects/file-lib', 'link-lib': 'link:../link-lib', 'portal-lib': 'portal:../portal-lib', 'num-dep': 1, 'real-dep': '^1.0.0' }
  }));
  // A project whose workspace sibling is depended on by a plain range, as npm workspaces do.
  write('siblings', 'package.json', JSON.stringify({ name: 'root-app', dependencies: { 'sib-lib': '^1.0.0', 'third-dep': '1.0.0', 'root-app': '1.0.0' }, workspaces: ['libs/*'] }));
  write('siblings/libs/sib', 'package.json', JSON.stringify({ name: 'sib-lib', dependencies: { 'sib-third': '1.0.0' } }));
  write('siblings/libs/unnamed', 'package.json', JSON.stringify({ name: 7, dependencies: { 'unnamed-third': '1.0.0' } }));
  write('words', 'package.json', JSON.stringify({
    dependencies: { ignore: '1.0.0' },
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

// ---------------------------------------------------------------------------------------------
// THE INJECTED JUDGE. A case names how the stand-in answers; a case that names nothing asserts the judge is
// NEVER consulted. A refusal by the judge is the proof that a claim reached it.
// @es EL JUEZ INYECTADO. Un caso nombra cómo contesta el sustituto; uno que no nombra nada afirma que el juez
// NUNCA se consulta. Un rechazo del juez prueba que la afirmación le llegó.
// ---------------------------------------------------------------------------------------------
const JUDGE_REASON = 'DEPENDENCY-CLAIM: claim 1 says the package closes its children on SIGTERM';
const ANSWERS = {
  refuse: () => ({ answer: JSON.stringify({ ok: false, reason: JUDGE_REASON }) }),
  pass: () => ({ answer: '{"ok": true}' }),
  throw: () => {
    throw new Error('model timed out');
  },
  garbage: () => ({ answer: 'I think it is fine' }),
  unmarked: () => ({ answer: '{"ok": false, "reason": "no marker here"}' })
};
const REFUSE = 'refuse';

const cases = [
  // ---------------------------------------------------------------------------------------------
  // ALLOWED — the brief declares its provenance. Both spellings of a declaration are legitimate.
  // ---------------------------------------------------------------------------------------------
  ['allow', agent(long(BOTH_GLUED)), 'both markers, colon glued to the word'],
  ['allow', agent(long('MEASURED: none — exploratory task.\nHYPOTHESIS: none')), 'explicitly no claims — the honest escape that keeps this cheap to satisfy'],
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
  ['deny', agent(long('as the MEASURED: value shows, and the HYPOTHESIS: was wrong')), 'BURIED mid-sentence', 'not at the START of a line'],
  ['deny', agent(long(`MEASURED 70 of 70 with no colon anywhere\n${HYPOTHESIS_LINE}`)), 'heads a line but carries no colon', 'carries no colon'],
  ['deny', agent(long(`MEASUREDLY: a different word entirely\n${HYPOTHESIS_LINE}`)), 'a prefix of a longer word must not satisfy the marker', 'MEASURED'],
  ['deny', agent(long(`MEASUREDly: a lowercase continuation is a different word too\n${HYPOTHESIS_LINE}`)), 'a lowercase continuation must not satisfy the marker', 'MEASURED'],
  ['deny', agent(long('Xxxxxxx. see MEASURED: 70 of 70\nYyyyyyyyy. see HYPOTHESIS: a guess')), 'BURIED after as many characters as the word is long', 'not at the START of a line'],
  ['deny', agent(long(`MEASURED\n${HYPOTHESIS_LINE}`)), 'the bare word alone on its line heads it, and carries no colon', 'carries no colon'],
  ['allow', agent(long(`MEASURED with no colon, then a real one below\nMEASURED: 24 symbols\n${HYPOTHESIS_LINE}`)), 'a later declaring line satisfies the marker after a colonless one'],
  ...['*', '+', '#', '>'].map((bullet) => ['allow', agent(long(`${bullet} ${MEASURED_LINE}\n${bullet} ${HYPOTHESIS_LINE}`)), `a "${bullet}" list or heading prefix still declares`]),
  ['deny', agent(long()), 'an Agent refusal names its surface', 'this delegation (Agent)'],
  ['deny', task(long()), 'a Task refusal names its surface', 'this delegation (Task)'],
  ['deny', resume(long()), 'a SendMessage refusal names its surface', 'this message (SendMessage)'],
  ['deny', `﻿${agent(long())}`, 'a BOM-prefixed payload is still judged', 'ABSENT'],
  ['deny', agent('read src/x.ts and report the export list'), 'a SHORT prompt is refused too', 'ABSENT'],

  // THE RESUME SURFACE, in the payload the harness really sends. @es EL SURFACE DE RESUME.
  ['deny', resume(long()), 'REAL CASE: a resume with no declaration', 'ABSENT'],
  ['allow', resume(long(BOTH_GLUED)), 'a resume that declares its provenance passes untouched'],
  ['allow', resume(long('MEASURED (by me, just now): develop is at 3ea04d36\nHYPOTHESIS — to confirm: the failure is pre-existing')), 'a qualifier before the colon on the resume surface'],
  ['deny', resume(long('as the MEASURED: value shows, and the HYPOTHESIS: was wrong')), 'a resume with buried markers is refused', 'not at the START of a line'],
  ['deny', resume('Another worker independently confirmed it. Both share the same reconstruction.'), 'a SHORT resume is refused too', 'ABSENT'],
  ['deny', resume(`Resume.\n${'y'.repeat(60)}`), 'a resume refused on its full text, not on its 50-character preview', 'no MEASURED line at all'],
  ['allow', resume(''), 'a pure idle subscription carries message "" — nothing to declare'],

  // ---------------------------------------------------------------------------------------------
  // THE DEPENDENCY-CLAIM FACE — the prefilter sends a claim to the judge only when it names a dependency and
  // cites no source location; the judge's refusal is shown in full.
  // @es LA CARA DE DEPENDENCIAS — el prefiltro manda al juez solo lo que nombra una dependencia sin citar fuente.
  // ---------------------------------------------------------------------------------------------
  ['deny', claim('MEASURED: Playwright closes its children on SIGTERM'), 'REAL INCIDENT, as written: the claim reaches the judge, which refuses', 'playwright', REFUSE, 'Playwright closes its children on SIGTERM (playwright)'],
  ['deny', claim('MEASURED: Playwright closes its children on SIGTERM and they exit 0'), 'JUDGES: an exit code beside the claim does not keep it from the judge', 'playwright', REFUSE],
  ['deny', claim('MEASURED: `playwright` closes its children on SIGTERM'), 'JUDGES: a backticked name does not keep it from the judge', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright 1.58.0 in package.json closes its children on SIGTERM'), 'JUDGES: a version beside package.json does not keep it from the judge', 'playwright', REFUSE],
  ['deny', claim('MEASURED: PLAYWRIGHT closes its children'), 'an upper-case name is the same package', 'playwright', REFUSE],
  ['deny', claim('MEASURED: legacypkg breaks on SIGTERM', WORDS), 'a manifest name with capitals is matched folded', 'legacypkg', REFUSE],
  ['deny', claim('MEASURED: playwright closes its children'), 'the refusal carries the judge\'s reason', `JUDGE — ${JUDGE_REASON}`, REFUSE],
  ['deny', claim('MEASURED: playwright closes its children'), 'the refusal shows the claim the judge read', 'READ — MEASURED: playwright closes its children', REFUSE],
  ['deny', claim('MEASURED: playwright closes its children'), 'the refusal is bilingual', '@es Una afirmación sobre cómo se comporta', REFUSE],
  ['deny', claim('MEASURED: playwright closes its children'), 'the refusal names the HYPOTHESIS way out', '2. Move the claim to a HYPOTHESIS: line', REFUSE],
  ['deny', claim('MEASURED: playwright closes its children'), 'the refusal names the citation way out', 'cite it in the claim as dir/file:line', REFUSE],
  ['deny', claim('MEASURED: playwright closes its children'), 'the refusal says an exit code does not measure a behaviour claim', 'an exit code beside a behaviour claim does not measure it', REFUSE],
  ['deny', claim('MEASURED: playwright closes its children'), 'the refusal says the proof runs against the real tool', 'against the real tool', REFUSE],
  ['deny', claim('MEASURED: left-pad and playwright both close'), 'both packages are named, once each', 'left-pad, playwright', REFUSE, '(left-pad, playwright)'],
  ['deny', claim('MEASURED: left-pad pads\nMEASURED: playwright closes'), 'every candidate unit goes to ONE question, numbered', 'left-pad, playwright', REFUSE, '2. MEASURED: playwright closes (playwright)'],
  // The judge's other answers: a pass allows, anything else allows and is journaled as undecided.
  // @es Las otras respuestas del juez: un pase permite; lo demás permite y queda como no decidido.
  ['allow', claim('MEASURED: npx eslint src exit 0', WORDS), 'JUDGES: a run receipt the judge passes is allowed', undefined, 'pass', 'npx eslint src exit 0 (eslint)'],
  ['allow', claim('MEASURED: typescript ~5.8.0 in package.json', WORDS), 'JUDGES: a version read the judge passes is allowed', undefined, 'pass'],
  ['allow', claim('MEASURED: we ignore the generated folder', WORDS), 'a dependency name used as an English word is the judge\'s call, with no hand-kept list', undefined, 'pass', '(ignore)'],
  ['allow', claim('MEASURED: playwright closes its children'), 'a judge that throws decides nothing: allowed, journaled', undefined, 'throw'],
  ['allow', claim('MEASURED: playwright closes its children'), 'a judge that answers no JSON decides nothing', undefined, 'garbage'],
  ['allow', claim('MEASURED: playwright closes its children'), 'a judge block without its marker decides nothing', undefined, 'unmarked'],

  // Every character that separates a package name from its prose, one case each, written out here.
  // @es Cada carácter que separa un nombre de su prosa, un caso por carácter.
  ...[' ', '\t', '\r', ':', ',', ';', '(', ')', '[', ']', '{', '}', '<', '>', '|', '"', "'", '`', '=', '!', '?'].map((separator) => [
    'deny',
    claim(`MEASURED: a${separator}playwright${separator}b`),
    `${JSON.stringify(separator)} separates a package name from the prose around it`,
    'playwright',
    REFUSE
  ]),
  ['deny', claim('MEASURED: a\n  playwright\n  b'), 'a newline inside a unit separates a package name', 'playwright', REFUSE],
  ['deny', claim('MEASURED: it is playwright.'), 'a name ending the sentence is matched', 'playwright', REFUSE],
  ['deny', claim('MEASURED: @playwright/test retries on SIGTERM'), 'a scoped dependency name is matched whole', '@playwright/test', REFUSE],
  ['allow', claim('MEASURED: the playwrightish helper retries on SIGTERM'), 'a substring that is not a whole token never reaches the judge'],
  ['allow', claim('MEASURED: the helper at C:/x/playwright retries'), 'a path segment never reaches the judge'],
  ['allow', claim('MEASURED: lodash is not a dependency here and closes nothing'), 'a package that is not a dependency never reaches the judge'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\nHYPOTHESIS: playwright closes its detached children on SIGTERM`), 'a HYPOTHESIS line never reaches the judge'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\n${HYPOTHESIS_LINE}\nplaywright closes its children, said the old brief`), 'a name outside a MEASURED unit never reaches the judge'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\nMEASUREDLY: playwright closes\n${HYPOTHESIS_LINE}`), 'a longer word is not a MEASURED line'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\n${HYPOTHESIS_LINE}\nXxxxxxx. see MEASURED: playwright closes`), 'a MEASURED word buried in prose is no claim'],

  // A SOURCE CITATION settles a unit with no model call; anything short of one goes to the judge.
  // @es Una CITA de fuente decide la unidad sin modelo; lo que no llega a cita va al juez.
  ...[' ', '\t', '\r', ',', ';', '(', ')', '[', ']', '{', '}', '<', '>', '|', '"', "'", '`'].map((separator) => [
    'allow',
    claim(`MEASURED: playwright ${separator}x/y.js:12${separator}`),
    `${JSON.stringify(separator)} wraps a citation without breaking it`
  ]),
  ['allow', claim('MEASURED: playwright, see x/y.js:1234567890'), 'every digit is a line number digit'],
  ['allow', claim(`MEASURED: playwright stops only on SIGINT (${SOURCE})`), 'a node_modules/<pkg>/<file>:<line> citation passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see runner/sigIntWatcher.js:12-14.'), 'a path:line-range citation passes, the period notwithstanding'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see node_modules\\playwright\\lib\\x.js:12'), 'a Windows path:line citation passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see C:/x/node_modules/playwright/lib/x.js:12'), 'a drive-letter citation passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see C:\\x\\lib\\x.js:12'), 'a Windows drive-letter citation passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see lib/x.js:12:5'), 'a path:line:col citation passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see lib/x.js:12-14:5'), 'a path:range:col citation passes'],
  ['allow', claim('MEASURED: playwright stops only on SIGINT, see lib/.npmrc:2'), 'a hidden file under a directory is a citation'],
  ['allow', claim('MEASURED: the teardown, playwright included:\n  - read in node_modules/playwright/lib/x.js:3'), 'a heading and its cited bullet are ONE unit: the heading is not refused alone'],
  ['allow', claim('MEASURED: lodash ok\nMEASURED: playwright closes (node_modules/playwright/lib/x.js:1)'), 'every dependency unit cited passes'],
  ['allow', claim('MEASURED: playwright stops on SIGINT:\n  node_modules/playwright/lib/x.js:3'), 'a citation opening a continuation line is its own word'],
  ['deny', claim('MEASURED: playwright closes, see sigIntWatcher.js:12'), 'a bare file name with no directory is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, served at example.com:443'), 'a host and port with no scheme is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, served at localhost:4200/app.js:12'), 'a host:port path is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, served at C:/x:9/app.js:12'), 'a colon past the drive letter is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, served at http://localhost:4200'), 'a URL with a port is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, see https://example.com/x.js:12'), 'a URL to a file is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, read under node_modules/playwright'), 'a directory names no line', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, see src/runner:12'), 'a path with no extension is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, see src.v1/runner:12'), 'a dot in a directory is no extension', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, see lib/x.1:12'), 'a digit extension is no extension', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, see lib/x.:12'), 'an empty extension is no extension', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, see lib/x.js:12:x'), 'a column that is not a number is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, see lib/x.js:12:5-6'), 'a column is one number, never a range', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, see lib/x.js:abc:5'), 'a column after a non-number is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, see lib/x.js:12:'), 'an empty column is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes, see 12:5'), 'a line and column with no path is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes at lib/x.js:abc'), 'a colon and a non-number is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes at lib/x.js:'), 'a colon and nothing is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes at :12'), 'a line number with no path is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes at lib/x.js:1-2-3'), 'a three-part range is no citation', 'playwright', REFUSE],
  ['deny', claim('MEASURED: playwright closes at lib/x.js:-3'), 'a range with an empty part is no citation', 'playwright', REFUSE],

  // A CLAIM UNIT is the heading and its continuation, judged whole.
  // @es Una UNIDAD es el encabezado y su continuación, juzgada entera.
  ['deny', claim('MEASURED: the teardown, read today:\n  - playwright closes its children on SIGTERM'), 'a bullet under the heading is part of the unit', 'READ — MEASURED: the teardown, read today: / playwright closes its children on SIGTERM', REFUSE],
  ['deny', claim('MEASURED: the teardown:\n\tplaywright closes its children'), 'a tab-indented line is part of the unit', 'playwright', REFUSE],
  ['deny', claim('MEASURED: the teardown:\n  - nothing here\n  - playwright closes its children'), 'every continuation line is part of the unit', 'playwright', REFUSE],
  ['deny', claim('- MEASURED: the teardown:\n  - playwright closes its children'), 'a bulleted heading has its continuation too', 'playwright', REFUSE],
  ['deny', agent(`${tenancy(PROJECT)}\r\nMEASURED: the teardown:\r\n  - playwright closes its children\r\n${HYPOTHESIS_LINE}`), 'a CRLF brief: the continuation is read', 'playwright', REFUSE],
  ['allow', claim('MEASURED: the teardown:\n\n  - playwright closes its children'), 'a blank line ends the unit'],
  ['allow', claim('MEASURED: the teardown:\n   \n  - playwright closes its children'), 'a whitespace-only line ends the unit'],
  ['allow', claim('MEASURED: the teardown:\nplaywright closes its children, said the old brief'), 'an unindented line ends the unit'],
  ['allow', claim('MEASURED: the teardown:\n  - HYPOTHESIS: playwright closes its children'), 'an indented HYPOTHESIS marker ends the unit'],
  ['allow', claim('MEASURED: the teardown:\n  - HYPOTHESIS: a guess\n  - playwright closes its children'), 'the lines after an indented HYPOTHESIS marker belong to it'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\nMEASUREDLY: x\n  - playwright closes\n${HYPOTHESIS_LINE}`), 'a longer word heads no unit, so its bullets are not read'],
  ['allow', agent(`${tenancy(PROJECT)}\n${MEASURED_LINE}\nnot a heading\n  - playwright closes\n${HYPOTHESIS_LINE}`), 'bullets under prose belong to no unit'],

  // WHICH NAMES ARE THIRD-PARTY. @es QUÉ NOMBRES SON DE TERCEROS.
  ['deny', claim('MEASURED: left-pad pads on the left'), 'a dependencies entry is matched', 'left-pad', REFUSE],
  ['deny', claim('MEASURED: peer-thing peers'), 'a peerDependencies entry is matched', 'peer-thing', REFUSE],
  ['deny', claim('MEASURED: ws-glob-dep behaves'), 'a dir/* workspace manifest is read', 'ws-glob-dep', REFUSE],
  ['deny', claim('MEASURED: ws-plain-dep behaves'), 'a plain workspace manifest is read', 'ws-plain-dep', REFUSE],
  ['allow', claim('MEASURED: nested-dep behaves'), 'the workspaces of a workspace are not followed'],
  ['allow', claim('MEASURED: local-lib renders the table', fixtureDir('local')), 'a workspace:* package is not third-party'],
  ['allow', claim('MEASURED: file-lib renders the table', fixtureDir('local')), 'a file: package is not third-party'],
  ['allow', claim('MEASURED: link-lib renders the table', fixtureDir('local')), 'a link: package is not third-party'],
  ['allow', claim('MEASURED: portal-lib renders the table', fixtureDir('local')), 'a portal: package is not third-party'],
  ['deny', claim('MEASURED: real-dep renders the table', fixtureDir('local')), 'a registry range beside them is third-party', 'real-dep', REFUSE],
  ['deny', claim('MEASURED: num-dep renders the table', fixtureDir('local')), 'a non-string version is still a dependency', 'num-dep', REFUSE],
  ['allow', claim('MEASURED: sib-lib renders the table', fixtureDir('siblings')), 'a sibling workspace depended on by a plain range is not third-party'],
  ['allow', claim('MEASURED: root-app renders the table', fixtureDir('siblings')), 'the project\'s own root name is not third-party'],
  ['deny', claim('MEASURED: third-dep renders the table', fixtureDir('siblings')), 'a third-party name beside the siblings still counts', 'third-dep', REFUSE],
  ['deny', claim('MEASURED: sib-third renders the table', fixtureDir('siblings')), 'a sibling\'s own dependency still counts', 'sib-third', REFUSE],
  ['deny', claim('MEASURED: unnamed-third renders the table', fixtureDir('siblings')), 'a manifest whose name is not a string still contributes its dependencies', 'unnamed-third', REFUSE],
  ['deny', JSON.stringify({ ...sandboxed('Agent', `MEASURED: playwright closes\n${HYPOTHESIS_LINE}`), cwd: PROJECT }), 'with no TENANCY line the hook payload cwd names the project', 'playwright', REFUSE],
  ['allow', JSON.stringify({ ...sandboxed('Agent', `${tenancy(fixtureDir('empty'))}\nMEASURED: playwright closes\n${HYPOTHESIS_LINE}`), cwd: PROJECT }), 'a TENANCY line wins over cwd, and its project declares nothing'],
  ['deny', resume(`${tenancy(PROJECT)}\nMEASURED: playwright closes\n${HYPOTHESIS_LINE}`), 'the resume surface is covered too', 'this message (SendMessage)', REFUSE],
  ['deny', task(`${tenancy(PROJECT)}\nMEASURED: playwright closes\n${HYPOTHESIS_LINE}`), 'the Task alias is covered too', 'this delegation (Task)', REFUSE],
  ['allow', claim('MEASURED: playwright closes', fixtureDir('empty')), 'no package.json: the face does not decide'],
  ['allow', claim('MEASURED: playwright closes', fixtureDir('broken')), 'an unreadable package.json: the face does not decide'],
  ['allow', withoutCwd(`MEASURED: playwright closes\n${HYPOTHESIS_LINE}`), 'no project at all: the face does not decide'],
  ['allow', agent(`MEASURED: playwright closes\n${HYPOTHESIS_LINE}`), 'a payload whose cwd is the sandbox reads no live project'],
  ['deny', claim('MEASURED: plain-dep closes', fixtureDir('plain')), 'a manifest with no workspaces is read', 'plain-dep', REFUSE],
  ['deny', claim('MEASURED: obj-ws-dep closes', fixtureDir('object-ws')), 'the object form of workspaces is read, a non-string entry skipped', 'obj-ws-dep', REFUSE],
  ['deny', claim('MEASURED: nd-dev closes', fixtureDir('null-deps')), 'a null dependency section does not hide the others', 'nd-dev', REFUSE],
  ['allow', claim('MEASURED: count 0 of 3', fixtureDir('string-deps')), 'a string dependency section contributes no names'],
  ['allow', claim('MEASURED: count 0 of 1 failed', fixtureDir('array-deps')), 'an array dependency section yields no index names'],
  ['allow', claim('MEASURED: array-dep closes', fixtureDir('array-deps')), 'an array dependency section yields no element names either'],
  ['deny', claim('MEASURED: beside-array closes', fixtureDir('array-deps')), 'an array section does not hide the others', 'beside-array', REFUSE],
  ['deny', claim('MEASURED: self-dep closes', fixtureDir('self-ws')), 'a workspace entry pointing at the root does not recurse', 'self-dep', REFUSE],
  ['allow', claim('MEASURED: playwright closes', fixtureDir('null-manifest')), 'a null manifest: the face does not decide'],
  ['allow', claim('MEASURED: playwright closes', fixtureDir('string-manifest')), 'a string manifest: the face does not decide'],
  ['deny', claim('MEASURED: bom-dep closes', fixtureDir('bom')), 'a manifest written with a UTF-8 BOM is read', 'bom-dep', REFUSE],
  ['deny', claim('MEASURED: left-pad behaves'), 'an unparsable workspace manifest does not hide the root', 'left-pad', REFUSE],
  ['deny', claim('MEASURED: nested-app-dep closes', fixtureDir('nested')), 'a project one folder down is read', 'nested-app-dep', REFUSE],
  ['deny', claim('MEASURED: nested-other-dep closes', fixtureDir('nested')), 'every project one folder down is read, as a union', 'nested-other-dep', REFUSE],
  ['deny', claim('MEASURED: nested-lib-dep closes', fixtureDir('nested')), 'the workspaces of a project one folder down are read', 'nested-lib-dep', REFUSE],
  ['allow', claim('MEASURED: installed-root-dep closes', fixtureDir('nested')), 'node_modules is never read as a nested project'],
  ['allow', claim('MEASURED: hidden-dep closes', fixtureDir('nested')), 'a dot-folder is never read as a nested project'],
  ['allow', claim('MEASURED: playwright closes', fixtureDir('nested-broken')), 'an unparsable nested manifest: the face does not decide'],
  ['deny', claim('MEASURED: escape-dep closes', fixtureDir('escape')), 'the root of a checkout with escaping entries is still read', 'escape-dep', REFUSE],
  ['allow', claim('MEASURED: plain-dep closes', fixtureDir('escape')), 'a ../ entry is not followed out of the checkout'],
  ['allow', claim('MEASURED: obj-ws-dep closes', fixtureDir('escape')), 'a ..\\ entry is not followed out of the checkout'],
  ['allow', claim('MEASURED: ws-plain-dep closes', fixtureDir('escape')), 'an entry that climbs out through an inner folder is not followed'],
  ['allow', claim('MEASURED: self-dep closes', fixtureDir('escape')), 'an absolute entry is not followed'],
  ['deny', claim('MEASURED: inside-dep closes', fixtureDir('escape')), 'an entry that only looks like a climb is normalised and read', 'inside-dep', REFUSE],

  // OUTSIDE THE DECISION — not a claim-bearing tool, or nothing to read. @es FUERA DE LA DECISIÓN.
  ['allow', JSON.stringify({ tool_name: 'Bash', tool_input: { command: long() }, cwd: SANDBOX }), 'not a claim-bearing tool'],
  ['allow', JSON.stringify({ ...sandboxed('Agent', ''), tool_input: {} }), 'no prompt at all'],
  ['allow', agent('   \n  '), 'whitespace-only prompt'],
  ['allow', JSON.stringify({ ...sandboxed('SendMessage', ''), tool_input: { to: 'main', message: { type: 'shutdown_response' } } }), 'a structured (non-string) message carries no brief'],
  ['allow', 'NOT JSON AT ALL', 'garbage payload'],
  ['allow', '', 'empty payload'],
  ['allow', '{"tool_name":', 'truncated json'],
  ['allow', '﻿NOT JSON', 'BOM + garbage']
];

/** The briefs the registered PROCESS is run on, none of which reaches the judge: they prove `main`. @es Los briefs con que se corre el PROCESO registrado. */
const spawned = [
  ['deny', agent(long()), 'spawned: a refusal is printed by main', 'ABSENT'],
  ['allow', agent(long(BOTH_GLUED)), 'spawned: an allowed brief prints nothing'],
  ['allow', 'NOT JSON AT ALL', 'spawned: garbage fails open'],
  ['allow', '', 'spawned: an empty stdin fails open']
];

let failures = 0;
let total = 0;

/** Records one outcome and prints it. @es Registra un resultado y lo imprime. */
function report(ok, line) {
  total += 1;

  if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

/** Checks one outcome: the verdict, the refusal fragment, and whether and how the judge was asked. @es Comprueba un resultado. */
function check(expected, output, label, expectedText, judge, promptText, prompts) {
  const actual = output.includes('"deny"') ? 'deny' : 'allow';
  // The reason travels inside a JSON string, so the fragment is checked against the serialised output.
  const textOk = expectedText === undefined || output.includes(JSON.stringify(expectedText).slice(1, -1));
  const askedOk = judge === undefined ? prompts.length === 0 : prompts.length === 1;
  const promptOk = promptText === undefined || prompts.some((prompt) => prompt.includes(promptText));
  const why = [textOk ? '' : `[the refusal never named: ${expectedText}]`, askedOk ? '' : `[the judge was asked ${prompts.length} time(s)]`, promptOk ? '' : `[the judge never read: ${promptText}]`].join(' ').trim();

  report(actual === expected && textOk && askedOk && promptOk, `expected=${expected} actual=${actual}  ${label}${why === '' ? '' : `  ${why}`}`);
}

async function runCases() {
  for (const [expected, input, label, expectedText, judge, promptText] of cases) {
    const prompts = [];
    const ask = async (prompt) => {
      prompts.push(prompt);

      return (ANSWERS[judge] ?? ANSWERS.pass)();
    };
    let output = '';

    try {
      output = JSON.stringify((await evaluate(input, { ask })) ?? null);
    } catch {
      // `main` and the dispatcher both let a thrown evaluation through: it allows. @es Una evaluación que lanza permite.
      output = '';
    }

    check(expected, output, label, expectedText, judge, promptText, prompts);
  }

  for (const [expected, input, label, expectedText] of spawned) {
    let output = '';
    let code = 0;

    try {
      output = execFileSync('node', [GUARD], { input, encoding: 'utf8' });
    } catch (error) {
      code = error.status;
      output = error.stdout ?? '';
    }

    if (code === 0) check(expected, output, label, expectedText, undefined, undefined, []);
    else report(false, `${label}  [the guard process exited ${code}]`);
  }
}

// ---------------------------------------------------------------------------------------------
// THE WIRING: code → declaration. @es EL CABLEADO: código → declaración.
// ---------------------------------------------------------------------------------------------

/** The recording that proves where each claim-bearing tool carries its brief. @es La grabación que prueba dónde lleva su brief cada herramienta. */
const RECORDING_OF = { Agent: 'Agent', Task: 'Agent', SendMessage: 'SendMessage' };

async function checkWiring() {
  let carriers;

  try {
    ({ BRIEF_CARRIERS: carriers } = await import('./provenance.mjs'));
  } catch (error) {
    report(false, `the decision module could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
  }

  let declared;

  try {
    const declaration = JSON.parse(readFileSync(DECLARATION, 'utf8'));
    const entry = declaration.registrations.find((registration) => registration.event === 'PreToolUse');

    declared = new Set(String(entry?.matcher ?? '').split('|').filter((tool) => tool.length > 0));
  } catch (error) {
    report(false, `guard.mjs.hook-registration.json is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`);
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
function journalLines(...file) {
  const journal = join(stateDir('brief-provenance'), ...file);

  if (!existsSync(journal)) return [];

  return readFileSync(journal, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

// ---------------------------------------------------------------------------------------------
// THE FACE SAYS SO WHEN IT CANNOT DECIDE, in `undecided/entries.jsonl`, never among the refusals and never
// where guard-precision counts. @es LA CARA DICE QUE NO PUEDE DECIDIR, fuera de los rechazos y de lo que cuenta
// guard-precision.
// ---------------------------------------------------------------------------------------------
function checkJournals() {
  const refusals = journalLines('refusals.jsonl');
  const undecided = journalLines('undecided', 'entries.jsonl');
  const reasons = undecided.flatMap((entry) => entry.undecided.map(({ file, reason }) => `${file ?? ''} ${reason}`));
  const leftCheckout = (entry) => reasons.some((reason) => reason.includes('escape/package.json') && reason.includes(`workspace entry "${entry}" leaves the checkout`));

  report(reasons.some((reason) => reason.includes('empty/package.json')), 'a project without package.json is journaled as undecided, with the file');
  report(reasons.some((reason) => reason.includes('broken/package.json')), 'an unreadable package.json is journaled as undecided, with the file');
  report(reasons.some((reason) => reason.includes('project/broken-ws/package.json')), 'an unparsable workspace manifest is journaled as undecided');
  report(reasons.some((reason) => reason.includes('nested-broken/App/package.json')), 'an unparsable nested manifest is journaled as undecided');
  report(!reasons.some((reason) => reason.includes('nested/package.json')), 'a checkout read one folder down is decided, not journaled');
  report(reasons.some((reason) => reason.includes('no project directory')), 'a brief with no project is journaled as undecided');
  report(reasons.filter((reason) => reason.includes('manifest/package.json') && reason.includes('not a JSON object')).length === 2, 'a null and a string manifest are journaled as not a JSON object');
  report(!reasons.some((reason) => reason.includes('ghost')), 'a workspace entry without a manifest is routine and is not journaled');
  report(!reasons.some((reason) => reason.includes('bom/package.json')), 'a manifest with a BOM is read, not journaled');
  for (const entry of ['../plain', '..\\object-ws\\tools', '..', '../*', 'in/../../project/tools']) report(leftCheckout(entry), `the escaping workspace entry ${entry} is journaled as undecided`);
  report(reasons.some((reason) => reason.includes('/self-ws" leaves the checkout')), 'an absolute workspace entry is journaled as undecided');
  report(!reasons.some((reason) => reason.includes('./inside/../inside')), 'an entry that stays inside is not journaled');
  report(reasons.some((reason) => reason.includes('the claim judge could not be asked: model timed out')), 'a judge that throws is journaled as undecided, with its error');
  report(reasons.filter((reason) => reason.includes('the claim judge gave no verdict')).length === 2, 'a non-JSON and an unmarked answer are journaled as undecided');
  report(undecided.length > 0 && undecided.every((entry) => entry.kind === 'dependency-claim-undecided' && typeof entry.tool === 'string' && entry.tool.length > 0), 'an undecided entry names its kind and its tool');
  report(refusals.some((entry) => entry.kind === 'dependency-claim' && entry.packages.includes('playwright') && entry.reason === JUDGE_REASON), 'a refusal is journaled with its packages and the judge\'s reason');
  report(!refusals.some((entry) => entry.kind === 'dependency-claim-undecided'), 'the refusal journal holds no undecided line');

  // guard-precision reads every *.jsonl at the top of this state: the undecided journal must not move its count.
  // @es guard-precision lee cada *.jsonl de la raíz de este estado: el diario de no decididos no mueve su cuenta.
  const precision = readMechanism('brief-provenance', readdirSync);

  report(
    precision.records.length === 0 && JSON.stringify(precision.unclassifiedFiles) === JSON.stringify({ 'refusals.jsonl': refusals.length }),
    `guard-precision counts no block and no undecided line: its unclassified lines are exactly the ${refusals.length} refusals`
  );
}

let crashed;

try {
  buildFixtures();
  await runCases();
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
