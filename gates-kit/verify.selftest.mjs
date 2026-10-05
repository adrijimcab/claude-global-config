#!/usr/bin/env node
/**
 * Proof that the gates-kit verifier DISCRIMINATES. Every case builds its own kit in a temporary folder, so
 * the verdict never depends on which gates the live kit holds. State space: a gate that is correct; a fail
 * fixture that passes; a pass fixture that fails; each missing part; an empty fixture folder; an invalid
 * declaration; a gate command that times out or does not exist (neither is a kill); a config with an
 * ignore, an `off`, a downgrade to `warn`, a disable directive in a comment, a threshold under the floor;
 * the near misses of each (`office`, `ignored` inside a comment, a threshold at the floor); discovery
 * (stack filter, `templates` and `toolchains` skipped, empty kit, unknown stack); and the exit codes of the CLI.
 *
 * @es Prueba de que el verificador de gates-kit DISCRIMINA. Cada caso construye su propio kit temporal.
 * Espacio de estados: gate correcto; fixture fail que pasa; fixture pass que falla; cada parte ausente;
 * carpeta de fixtures vacía; declaración inválida; comando que agota el tiempo o no existe (ninguno
 * cuenta como detección); config con ignore, `off`, `warn`, directiva de desactivación en un comentario,
 * umbral bajo el mínimo; los casi-aciertos de cada uno; el descubrimiento y los códigos de salida del CLI.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { THRESHOLD_FLOOR, configViolations } from './config-rules.mjs';
import { DEFAULT_TIMEOUT_MS, discoverGates, inspectGate } from './gate-layout.mjs';
import { MESSAGES, say, verifyGate } from './verify.mjs';

const VERIFY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify.mjs');
const CHECKER = "import{readdirSync,readFileSync}from'node:fs';const d=process.argv[2];process.exit(readdirSync(d).some((f)=>readFileSync(d+'/'+f,'utf8').includes('BAD'))?1:0);";
const GOOD_CONFIG = 'export default { rules: { strict: true }, lines: 90 };\n';

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

const roots = [];

/** Builds `<root>/<stack>/<gate>` from a spec of overrides; `null` removes a part. @es Construye un gate; `null` quita una parte. */
function buildGate(root, stack, name, overrides = {}) {
  const dir = path.join(root, stack, name);
  const parts = {
    'config.mjs': GOOD_CONFIG,
    'SOURCE.md': 'https://example.invalid/docs\n',
    'gate.json': JSON.stringify({ command: ['node', 'check.mjs', '{target}'] }),
    'check.mjs': CHECKER,
    'pass/a.txt': 'fine\n',
    'fail/a.txt': 'BAD\n',
    ...overrides,
  };

  for (const [file, content] of Object.entries(parts)) {
    if (content === null) continue;

    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }

  return dir;
}

function freshRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'gates-kit-verify-'));

  roots.push(root);

  return root;
}

/** The problem ids of a built gate; a throw is reported as an id so it fails the assertion. @es Ids de problema; un throw falla la aserción. */
function problemsIn(dir) {
  try {
    return verifyGate({ stack: 's', name: 'g', dir }).problems.map((problem) => problem.id);
  } catch (error) {
    return [`threw: ${error.message}`];
  }
}

/** The problem ids of a fresh gate built from overrides. @es Ids de problema de un gate nuevo. */
function problemsOf(overrides) {
  return problemsIn(buildGate(freshRoot(), 's', 'g', overrides));
}

/** A fresh gate whose part is replaced by an empty folder named `folder`. @es Un gate con una carpeta vacía. */
function gateWithEmptyFolder(removed, folder) {
  const dir = buildGate(freshRoot(), 's', 'g', { [removed]: null });

  mkdirSync(path.join(dir, folder));

  return problemsIn(dir);
}

function runCli(args) {
  const run = spawnSync(process.execPath, [VERIFY, ...args], { encoding: 'utf8' });

  return { status: run.status, lines: `${run.stdout}${run.stderr}`.split('\n').filter((line) => line.trim() !== '') };
}

// The correct gate and the two verdict directions.
check('a correct gate has no problem', problemsOf({}).length === 0);
check('a fail fixture that passes is refused as fail-passed', problemsOf({ 'fail/a.txt': 'fine\n' }).join() === 'fail-passed');
check('a pass fixture that fails is refused as pass-failed', problemsOf({ 'pass/a.txt': 'BAD\n' }).join() === 'pass-failed');
check('both fixtures wrong report both problems', problemsOf({ 'pass/a.txt': 'BAD\n', 'fail/a.txt': 'fine\n' }).sort().join() === 'fail-passed,pass-failed');
check('the target token points each side at its own folder', problemsOf({ 'pass/a.txt': 'fine\n', 'fail/a.txt': 'BAD\n', 'fail/b.txt': 'BAD\n' }).length === 0);

// A command that never decided is not a kill.
check('a fail command that times out is not a kill', problemsOf({ 'gate.json': JSON.stringify({ command: ['node', '-e', 'setTimeout(()=>{},5000)'], timeoutMs: 300 }) }).includes('timed-out'));
check('a command that does not exist is not a kill', problemsOf({ 'gate.json': JSON.stringify({ command: ['gates-kit-no-such-binary-xyz'] }) }).includes('could-not-run'));
check('a package-manager command runs (npm --version exits 0 on pass)', !problemsOf({ 'gate.json': JSON.stringify({ command: ['npm', '--version'] }) }).includes('could-not-run'));

// Missing parts, each named.
for (const [part, id] of [['config.mjs', 'missing-config'], ['SOURCE.md', 'missing-source'], ['gate.json', 'missing-gate-json'], ['pass/a.txt', 'missing-pass'], ['fail/a.txt', 'missing-fail']]) {
  check(`a gate without ${part} is refused as ${id}`, problemsOf({ [part]: null }).includes(id));
}

check('an empty SOURCE.md is refused', problemsOf({ 'SOURCE.md': '' }).includes('missing-source'));
check('an invalid declaration (not an array) is refused', problemsOf({ 'gate.json': '{"command":"node x"}' }).includes('invalid-gate-json'));
check('an invalid declaration (extra key) is refused', problemsOf({ 'gate.json': '{"command":["node"],"shell":true}' }).includes('invalid-gate-json'));
check('an invalid declaration (not JSON) is refused', problemsOf({ 'gate.json': '{' }).includes('invalid-gate-json'));
check('an invalid declaration (bad timeout) is refused', problemsOf({ 'gate.json': '{"command":["node"],"timeoutMs":0}' }).includes('invalid-gate-json'));
check('a gate with a missing part does not run its command', problemsOf({ 'pass/a.txt': null, 'fail/a.txt': 'fine\n' }).join() === 'missing-pass');

check('an empty pass folder is refused', gateWithEmptyFolder('pass/a.txt', 'pass').includes('missing-pass'));
check('an empty fail folder is refused', gateWithEmptyFolder('fail/a.txt', 'fail').includes('missing-fail'));
check('a pass that is a file, not a folder, is refused', problemsOf({ 'pass/a.txt': null, pass: 'x' }).includes('missing-pass'));
check('a file merely starting with config is not a config', problemsOf({ 'config.mjs': null, 'configure.md': 'x' }).includes('missing-config'));
check('a folder named config.d is not a config file', gateWithEmptyFolder('config.mjs', 'config.d').includes('missing-config'));
check('a whitespace-only SOURCE.md is refused', problemsOf({ 'SOURCE.md': '  \n' }).includes('missing-source'));
check('an empty command array is refused', problemsOf({ 'gate.json': '{"command":[]}' }).includes('invalid-gate-json'));
check('an empty argument is refused', problemsOf({ 'gate.json': '{"command":["node",""]}' }).includes('invalid-gate-json'));
check('a non-string argument is refused', problemsOf({ 'gate.json': '{"command":["node",1]}' }).includes('invalid-gate-json'));
check('a fractional timeout is refused', problemsOf({ 'gate.json': '{"command":["node"],"timeoutMs":1.5}' }).includes('invalid-gate-json'));
check('the default timeout is 300000 ms', DEFAULT_TIMEOUT_MS === 300_000);

// Config refusals and their near misses.
const rules = (text) => configViolations(text).map((violation) => violation.rule);

check('an ignore key is refused', rules('export default { ignores: ["x"] };').join() === 'ignore');
check('an allowlist is refused', rules('allowlist: ["x"]').join() === 'ignore');
check('an exclude entry is refused', rules('"codeCoverageExclude": ["x"]').join() === 'ignore');
check('a rule set to "off" is refused', rules("rules: { a: 'off' }").join() === 'off');
check('a rule downgraded to "warn" is refused', rules('rules: { a: "warn" }').join() === 'off');
check('a yaml `a: off` is refused', rules('rule: off').join() === 'off');
check('office is not off', rules("name: 'office'").length === 0);
check('offset is not off', rules('"offset": 3').length === 0);
check('a disable directive inside a comment is refused', rules('// eslint-disable-next-line x').join() === 'directive');
check('ts-ignore inside a comment is refused', rules('/* @ts-ignore */').includes('directive'));
check('the word ignore inside a comment is not a config entry', rules('// nothing ignored here\nstrict: true').length === 0);
check('a threshold under the floor is refused', rules(`lines: ${THRESHOLD_FLOOR - 1}`).join() === 'threshold');
check('a threshold at the floor is allowed', rules(`lines: ${THRESHOLD_FLOOR}`).length === 0);
check('a decimal threshold under the floor is refused', rules('statements: 79.5').join() === 'threshold');
check('a key merely ending in lines is not a threshold', rules('maxLines: 5').length === 0);
check('a violation names its line', configViolations('a: 1\nb: "off"\n')[0].line === 2);
check('a clean config has no violation', rules(GOOD_CONFIG).length === 0);
check('a config with an ignore makes the gate refuse', problemsOf({ 'config.mjs': 'ignores: []\n' }).includes('config-ignore'));
check('a config with off makes the gate refuse', problemsOf({ 'config.mjs': "a: 'off'\n" }).includes('config-off'));
check('a config with a directive makes the gate refuse', problemsOf({ 'config.mjs': '// eslint-disable\n' }).includes('config-directive'));
check('a config with a low threshold makes the gate refuse', problemsOf({ 'config.mjs': 'branches: 10\n' }).includes('config-threshold'));
check('every config file of the gate is scanned', problemsOf({ 'config.extra.json': '{"a":"off"}' }).includes('config-off'));

// Layout and discovery.
const kit = freshRoot();

buildGate(kit, 'angular', 'b-gate');
buildGate(kit, 'angular', 'a-gate');
buildGate(kit, 'nest', 'c-gate');
buildGate(kit, 'templates', 'not-a-gate');
buildGate(kit, 'toolchains', 'not-a-gate-either');
writeFileSync(path.join(kit, 'README.md'), 'a plain file\n');

check('discovery lists gates of every stack in a stable order', discoverGates(kit).map((gate) => `${gate.stack}/${gate.name}`).join() === 'angular/a-gate,angular/b-gate,nest/c-gate');
check('discovery honours the stack filter', discoverGates(kit, 'nest').length === 1);
check('discovery skips the templates folder', !discoverGates(kit).some((gate) => gate.stack === 'templates'));
check('discovery skips the toolchains folder', !discoverGates(kit).some((gate) => gate.stack === 'toolchains'));
check('the toolchains folder is not found even when asked for by name', discoverGates(kit, 'toolchains').length === 0);
check('an unknown stack yields no gate', discoverGates(kit, 'nope').length === 0);
check('a plain file beside the stacks is not a stack', discoverGates(kit).length === 3);
check('inspectGate reports the parsed command', inspectGate(path.join(kit, 'nest', 'c-gate')).gate.command[0] === 'node');

// CLI exit codes and bilingual output.
const green = runCli(['--root', kit, '--stack', 'nest']);

check('the CLI exits 0 over a correct stack', green.status === 0);

const broken = freshRoot();

buildGate(broken, 's', 'bad', { 'fail/a.txt': 'fine\n', 'config.mjs': 'a: "off"\n' });
buildGate(broken, 's', 'incomplete', { 'SOURCE.md': null });

const red = runCli(['--root', broken]);

check('the CLI exits 1 when any gate has a problem', red.status === 1);
check('the CLI names the gate and the problems', red.lines.some((line) => line.includes('s/bad')) && red.lines.some((line) => line.includes('s/incomplete')));
check('an empty kit exits 2, never 0', runCli(['--root', freshRoot()]).status === 2);
check('an unknown stack exits 2', runCli(['--root', kit, '--stack', 'nope']).status === 2);
check('an unknown option exits 2', runCli(['--bogus']).status === 2);
check('every printed line carries its @es half', [...green.lines, ...red.lines].every((line) => line.includes(' @es ')));
check('every message of the table has both halves', Object.values(MESSAGES).every(([english, spanish]) => english.length > 0 && spanish.length > 0));
check('a Spanish half keeps its accents', Object.values(MESSAGES).some(([, spanish]) => /[áéíóúñ]/.test(spanish)));
check('a message without its @es half throws', (() => { MESSAGES['test.half'] = ['only English', '']; try { say('test.half'); return false; } catch { return true; } finally { delete MESSAGES['test.half']; } })());
check('an unknown message id throws', (() => { try { say('no.such.id'); return false; } catch { return true; } })());
check('every problem id has a message', ['missing-config', 'missing-pass', 'missing-fail', 'missing-source', 'missing-gate-json', 'invalid-gate-json', 'config-ignore', 'config-off', 'config-directive', 'config-threshold', 'pass-failed', 'fail-passed', 'could-not-run', 'timed-out'].every((id) => MESSAGES[`problem.${id}`] !== undefined));

for (const root of roots) rmSync(root, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`gates-kit verify selftest FAILED @es el selftest de verify de gates-kit FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`gates-kit verify selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);
