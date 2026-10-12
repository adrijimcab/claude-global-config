#!/usr/bin/env node
/**
 * Proof that the gates-kit verifier DISCRIMINATES. Every case builds its own kit in a temporary folder, so
 * the verdict never depends on which gates the live kit holds. State space: a gate that is correct; a fail
 * fixture that passes; a pass fixture that fails; each missing part; an empty fixture folder; an invalid
 * declaration; a gate command that times out or does not exist (neither is a kill); a config with an
 * ignore, an `off`, a downgrade to `warn`, a disable directive in a comment, a threshold under the floor;
 * the near misses of each (`office`, `ignored` inside a comment, a threshold at the floor); discovery
 * (stack filter, `templates` and `toolchains` skipped, empty kit, unknown stack); the toolchains (verified
 * beside the gates, a broken one refused, a stack with a toolchain and no gate measured, the package a launched
 * gate runs read against the toolchain of its own stack and never run when undeclared); and the exit codes of
 * the CLI.
 *
 * @es Prueba de que el verificador de gates-kit DISCRIMINA. Cada caso construye su propio kit temporal.
 * Espacio de estados: gate correcto; fixture fail que pasa; fixture pass que falla; cada parte ausente;
 * carpeta de fixtures vacía; declaración inválida; comando que agota el tiempo o no existe (ninguno
 * cuenta como detección); config con ignore, `off`, `warn`, directiva de desactivación en un comentario,
 * umbral bajo el mínimo (o puntuación de mutación `break`); los casi-aciertos de cada uno; el descubrimiento;
 * las toolchains (verificadas junto a los gates, una rota rechazada, un stack con toolchain y sin gate medido,
 * el paquete que corre un gate lanzado leído contra la toolchain de SU stack y nunca ejecutado si no está
 * declarado); y los códigos de salida del CLI.
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
// Every root is removed on every exit, a throw included: a selftest leaves nothing behind it. @es Toda raíz se
// elimina en toda salida, también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

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

function runCli(args, env = {}) {
  const run = spawnSync(process.execPath, [VERIFY, ...args], { encoding: 'utf8', env: { ...process.env, GATES_KIT_TOOLCHAIN: '', ...env } });

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
// A command that leaves anything behind in the gate folder, or in the fixture it was given, is a problem.
/** A gate.json whose command runs the JavaScript `script` with the target as its argument. @es Un gate.json cuyo comando corre `script`. */
const running = (script) => JSON.stringify({ command: ['node', '-e', script, '{target}'] });
/** The problems of a gate whose command runs `script`, as `id:detail`. @es Los problemas de un gate cuyo comando corre `script`. */
const residueOf = (script, overrides = {}) => {
  const dir = buildGate(freshRoot(), 's', 'g', { 'gate.json': running(script), ...overrides });

  return verifyGate({ stack: 's', name: 'g', dir }).problems.filter((problem) => problem.id === 'left-residue').map((problem) => problem.detail).join(' ');
};

check('a command that writes a file in the gate folder is refused and the file named', residueOf('require("fs").writeFileSync("residue.txt","x")') === 'residue.txt');
check('a command that writes a file in the fixture is refused and the file named', residueOf('require("fs").writeFileSync(require("path").join(process.argv[1],"extra.txt"),"x")').split(' ').includes('fail/extra.txt'));
check('the changed paths are listed in order, removed and added alike', residueOf('const fs=require("fs");fs.rmSync(require("path").join(process.argv[1],"a.txt"),{force:true});fs.writeFileSync("aaa.txt","x")') === 'aaa.txt fail/a.txt pass/a.txt');
check('a command that creates a folder is refused', residueOf('require("fs").mkdirSync("cache")') === 'cache');
check('a command that creates a nested file is refused with its path', residueOf('require("fs").mkdirSync("a/b",{recursive:true});require("fs").writeFileSync("a/b/c.txt","x")').includes('a/b/c.txt'));
check('a command that deletes a file is refused', residueOf('require("fs").rmSync(require("path").join(process.argv[1],"a.txt"),{force:true})').includes('/a.txt'));
check('a command that rewrites a file with the same text is refused', residueOf('const f=require("path").join(process.argv[1],"a.txt");const s=require("fs").readFileSync(f);require("fs").writeFileSync(f,s);require("fs").utimesSync(f,1,1)').includes('/a.txt'));
check('a command that only reads leaves no residue', residueOf('require("fs").readdirSync(process.argv[1])') === '');
check('a correct gate leaves no residue', problemsOf({}).every((id) => id !== 'left-residue'));
check('a gate that writes nothing is not refused for residue even when it fails', residueOf('process.exit(0)') === '');
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
check('a mutation break score under the floor is refused', rules(`"break": ${THRESHOLD_FLOOR - 1}`).join() === 'threshold');
check('a mutation break score at the floor is allowed', rules(`"break": ${THRESHOLD_FLOOR}`).length === 0);
check('a yaml break score under the floor is refused', rules('break: 10').join() === 'threshold');
check('a key merely starting with break is not a threshold', rules('breakpoint: 10').length === 0);
check('a key merely ending in break is not a threshold', rules('lineBreak: 1').length === 0);
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
buildGate(kit, 'clean-code-profile', 'not-a-gate-neither');
writeFileSync(path.join(kit, 'README.md'), 'a plain file\n');

check('discovery lists gates of every stack in a stable order', discoverGates(kit).map((gate) => `${gate.stack}/${gate.name}`).join() === 'angular/a-gate,angular/b-gate,nest/c-gate');
check('discovery honours the stack filter', discoverGates(kit, 'nest').length === 1);
check('discovery skips the templates folder', !discoverGates(kit).some((gate) => gate.stack === 'templates'));
check('discovery skips the toolchains folder', !discoverGates(kit).some((gate) => gate.stack === 'toolchains'));
check('discovery skips the clean-code-profile folder', !discoverGates(kit).some((gate) => gate.stack === 'clean-code-profile'));
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
check('every problem id has a message', ['missing-config', 'missing-pass', 'missing-fail', 'missing-source', 'missing-gate-json', 'invalid-gate-json', 'config-ignore', 'config-off', 'config-directive', 'config-threshold', 'pass-failed', 'fail-passed', 'could-not-run', 'timed-out', 'left-residue'].every((id) => MESSAGES[`problem.${id}`] !== undefined));

// Toolchains: the verifier checks each one beside the gates, and a gate's package against its stack's toolchain.
/** Writes `<root>/toolchains/<stack>` with a manifest and the lockfile that matches it; `lock: false` omits the lockfile. @es Escribe una toolchain correcta; `lock: false` omite el lockfile. */
function buildToolchain(root, stack, { dependencies = { eslint: '9.39.4' }, lock = true } = {}) {
  const dir = path.join(root, 'toolchains', stack);
  const manifest = { name: `gates-kit-${stack}-toolchain`, version: '1.0.0', private: true, dependencies };
  const packages = { '': { dependencies } };

  for (const [name, version] of Object.entries(dependencies)) packages[`node_modules/${name}`] = { version };

  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  if (lock) writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }));
}

const LAUNCHED = JSON.stringify({ command: ['node', '../../run-tool.mjs', 'eslint', 'eslint', '--format', 'stylish', '{target}'] });
const coupledKit = freshRoot();

buildGate(coupledKit, 'angular', 'g', { 'gate.json': LAUNCHED });
buildToolchain(coupledKit, 'angular');

/** Problem ids and detail of a gate of `root` named `stack/g`. @es Ids de problema de un gate. */
function coupling(root, stack, overrides) {
  const dir = buildGate(root, stack, 'g', overrides);

  return verifyGate({ stack, name: 'g', dir, toolchain: path.join(root, 'toolchains', stack) }).problems.map((problem) => `${problem.id}${problem.detail === undefined ? '' : `:${problem.detail}`}`);
}

check('a gate whose package its toolchain declares has no coupling problem', !coupling(coupledKit, 'angular', { 'gate.json': LAUNCHED }).some((id) => id.startsWith('tool-') || id === 'no-toolchain'));

const undeclared = freshRoot();

buildToolchain(undeclared, 's', { dependencies: { karma: '6.4.4' } });

check('a gate whose package its toolchain does not declare is refused and not run', coupling(undeclared, 's', { 'gate.json': LAUNCHED }).join() === 'tool-not-declared:eslint');
check('a gate in a stack without a toolchain is refused and not run', coupling(freshRoot(), 's', { 'gate.json': LAUNCHED }).join() === 'no-toolchain');
check('a gate that runs no package needs no toolchain', coupling(freshRoot(), 's', {}).length === 0);

const withToolchains = freshRoot();

buildGate(withToolchains, 'good', 'g');
buildGate(withToolchains, 'broken', 'g');
buildToolchain(withToolchains, 'good');
buildToolchain(withToolchains, 'broken', { lock: false });
buildToolchain(withToolchains, 'only', {});

const tools = runCli(['--root', withToolchains]);
const goodOnly = runCli(['--root', withToolchains, '--stack', 'good']);
const onlyToolchain = runCli(['--root', withToolchains, '--stack', 'only']);
const brokenOnly = runCli(['--root', withToolchains, '--stack', 'broken']);

check('a toolchain is verified beside the gates and named', tools.lines.some((line) => line.includes('toolchain good') && line.includes('pinned')));
check('a toolchain without its lockfile is refused and its problem named', brokenOnly.lines.some((line) => line.includes('toolchain broken') && line.includes('REFUSED')) && brokenOnly.lines.some((line) => line.includes('package-lock.json is missing')));
check('a broken toolchain makes the CLI exit 1', brokenOnly.status === 1 && tools.status === 1);
check('a correct stack and toolchain exit 0', goodOnly.status === 0);
check('the toolchain summary counts the toolchains', goodOnly.lines.some((line) => line.includes('1 of 1 toolchain(s) correct')));
check('the stack filter narrows the toolchains too', !goodOnly.lines.some((line) => line.includes('toolchain broken')));
check('a stack with a toolchain and no gate is measured, not empty', onlyToolchain.status === 0);
check('no toolchain line is printed when the kit holds none', !runCli(['--root', kit, '--stack', 'nest']).lines.some((line) => line.includes('toolchain')));
check('a toolchain-only run prints no gate summary', !onlyToolchain.lines.some((line) => line.includes('gate(s) correct')));

// A launched gate end to end: the launcher is a stub beside the stacks, so the wiring to the stack's toolchain is what is measured.
const STUB_LAUNCHER = "import{readdirSync,readFileSync}from'node:fs';const d=process.argv.at(-1);process.exit(readdirSync(d).some((f)=>readFileSync(d+'/'+f,'utf8').includes('BAD'))?1:0);";
const wired = freshRoot();

writeFileSync(path.join(wired, 'run-tool.mjs'), STUB_LAUNCHER);
buildGate(wired, 'wired', 'g', { 'gate.json': LAUNCHED });
buildToolchain(wired, 'wired');

const wiredRun = runCli(['--root', wired]);

check('a launched gate whose package its stack toolchain declares is verified and runs', wiredRun.status === 0 && wiredRun.lines.some((line) => line.includes('gate wired/g: pass exits 0')));

const unwired = freshRoot();

writeFileSync(path.join(unwired, 'run-tool.mjs'), STUB_LAUNCHER);
buildGate(unwired, 'unwired', 'g', { 'gate.json': LAUNCHED });
buildToolchain(unwired, 'unwired', { dependencies: { karma: '6.4.4' } });
buildGate(unwired, 'aaa', 'g', { 'gate.json': LAUNCHED });
buildToolchain(unwired, 'aaa');

const unwiredRun = runCli(['--root', unwired]);

check('a launched gate is read against the toolchain of its own stack', unwiredRun.status === 1 && unwiredRun.lines.some((line) => line.includes('eslint') && line.includes('does not declare')));
check('the toolchain of another stack does not satisfy a gate', unwiredRun.lines.some((line) => line.includes('gate unwired/g: REFUSED')));
check('every toolchain problem id has a message', ['missing-manifest', 'invalid-manifest', 'missing-lockfile', 'invalid-lockfile', 'no-dependencies', 'range-version', 'unexpected-section', 'not-private', 'bad-name', 'lock-out-of-sync', 'lock-missing-package', 'lock-version-mismatch', 'tool-not-declared', 'no-toolchain'].every((id) => MESSAGES[`problem.${id}`] !== undefined));
check('every toolchain line carries its @es half', [...tools.lines, ...goodOnly.lines, ...brokenOnly.lines].every((line) => line.includes(' @es ')));

// The reporter and quiet rules over a gate command, as the verifier reports them.
const commandOf = (args) => JSON.stringify({ command: ['node', '../../run-tool.mjs', ...args] });
const ruled = freshRoot();
/** The command-rule problems of a gate of `ruled`. @es Los problemas de reglas de comando de un gate. */
const ruleIds = (gateJson) => coupling(ruled, 's', { 'gate.json': gateJson }).filter((id) => /^(reporter|quiet)-/.test(id)).join();

buildToolchain(ruled, 's', { dependencies: { eslint: '9.39.4', mystery: '1.0.0' } });

check('a launched eslint without --format is refused as reporter-not-pinned', ruleIds(commandOf(['eslint', 'eslint', '{target}'])) === 'reporter-not-pinned:eslint --format');
check('a launched eslint with --quiet is refused as quiet-flag', ruleIds(commandOf(['eslint', 'eslint', '--format', 'stylish', '--quiet', '{target}'])) === 'quiet-flag:eslint --quiet');
check('a launched package with no decided reporter is refused', ruleIds(commandOf(['mystery', 'mystery', '{target}'])) === 'reporter-unknown:mystery');
check('every command-rule problem id has a message', ['reporter-not-pinned', 'reporter-unknown', 'quiet-flag'].every((id) => MESSAGES[`problem.${id}`] !== undefined));

// A stack with one toolchain per major: --toolchain picks one, a gate another sibling serves is not applicable.
const VITEST_LAUNCHED = commandOf(['vitest', 'vitest', 'run', '--reporter', 'default', '{target}']);
const perMajor = freshRoot();

writeFileSync(path.join(perMajor, 'run-tool.mjs'), STUB_LAUNCHER);
buildGate(perMajor, 'fw', 'lint', { 'gate.json': LAUNCHED });
buildGate(perMajor, 'fw', 'test', { 'gate.json': VITEST_LAUNCHED });
buildToolchain(perMajor, 'fw-1', { dependencies: { eslint: '9.39.4' } });
buildToolchain(perMajor, 'fw-2', { dependencies: { eslint: '10.12.0', vitest: '5.0.3' } });

const majorOne = runCli(['--root', perMajor, '--toolchain', 'fw-1']);
const majorTwo = runCli(['--root', perMajor, '--toolchain', 'fw-2']);

check('a gate another toolchain of the stack serves is not applicable, and the run exits 0', majorOne.status === 0 && majorOne.lines.some((line) => line.includes('gate fw/test: not applicable on toolchain fw-1') && line.includes('vitest')));
check('a not-applicable gate is not counted as correct', majorOne.lines.some((line) => line.includes('1 of 1 gate(s) correct')) && majorOne.lines.some((line) => line.includes('1 gate(s) not applicable on toolchain fw-1')));
check('--toolchain verifies only that toolchain', majorOne.lines.some((line) => line.includes('toolchain fw-1')) && !majorOne.lines.some((line) => line.includes('toolchain fw-2')));
check('every gate runs on the toolchain that declares all their packages', majorTwo.status === 0 && majorTwo.lines.some((line) => line.includes('2 of 2 gate(s) correct')) && !majorTwo.lines.some((line) => line.includes('not applicable')));
check('without --toolchain a per-major stack has no toolchain of its name', runCli(['--root', perMajor, '--stack', 'fw']).lines.some((line) => line.includes('--toolchain <id>')));
check('--stack discovers every per-major toolchain of the stack', ['fw-1', 'fw-2'].every((id) => runCli(['--root', perMajor, '--stack', 'fw']).lines.some((line) => line.includes(`toolchain ${id}:`))));
check('an unknown toolchain exits 2', runCli(['--root', perMajor, '--toolchain', 'fw-9']).status === 2);
check('a --stack that does not hold the toolchain exits 2', runCli(['--root', perMajor, '--stack', 'other', '--toolchain', 'fw-1']).status === 2);
check('a --stack that holds the toolchain is accepted', runCli(['--root', perMajor, '--stack', 'fw', '--toolchain', 'fw-1']).status === 0);

const installedOne = path.join(perMajor, 'toolchains', 'fw-1');
const mismatch = runCli(['--root', perMajor, '--toolchain', 'fw-2'], { GATES_KIT_TOOLCHAIN: installedOne });

check('an installed toolchain other than the chosen one stops the run with 2', mismatch.status === 2 && mismatch.lines.some((line) => line.includes('gates-kit-fw-1-toolchain') && line.includes('fw-2')));
check('the installed toolchain that matches lets the run go on', runCli(['--root', perMajor, '--toolchain', 'fw-1'], { GATES_KIT_TOOLCHAIN: installedOne }).status === 0);
check('an installed folder without a manifest is a mismatch', runCli(['--root', perMajor, '--toolchain', 'fw-1'], { GATES_KIT_TOOLCHAIN: freshRoot() }).status === 2);

const servedNowhere = freshRoot();

buildGate(servedNowhere, 'fw', 'test', { 'gate.json': VITEST_LAUNCHED });
buildToolchain(servedNowhere, 'fw-1', { dependencies: { eslint: '9.39.4' } });
buildToolchain(servedNowhere, 'fw-2', { dependencies: { eslint: '10.12.0' } });

check('a package no toolchain of the stack declares stays refused', runCli(['--root', servedNowhere, '--toolchain', 'fw-1']).status === 1);

const staticKit = freshRoot();

buildGate(staticKit, 'fw', 'test', { 'gate.json': commandOf(['vitest', 'vitest', 'run', '{target}']), 'config.mjs': "a: 'off'\n" });
buildToolchain(staticKit, 'fw-1', { dependencies: { eslint: '9.39.4' } });
buildToolchain(staticKit, 'fw-2', { dependencies: { vitest: '5.0.3' } });

const staticRun = runCli(['--root', staticKit, '--toolchain', 'fw-1']);

check('a not-applicable gate still reports its config and command problems', staticRun.status === 1 && staticRun.lines.some((line) => line.includes('gate fw/test: REFUSED (2 problem(s))')));
check('a not-applicable gate is verified without running', (() => {
  const dir = buildGate(freshRoot(), 'fw', 'g', { 'gate.json': VITEST_LAUNCHED });
  const result = verifyGate({ stack: 'fw', name: 'g', dir, toolchain: path.join(perMajor, 'toolchains', 'fw-1'), siblings: [path.join(perMajor, 'toolchains', 'fw-1'), path.join(perMajor, 'toolchains', 'fw-2')] });

  return result.notApplicable === 'vitest' && result.problems.length === 0;
})());
check('the chosen toolchain alone among the siblings does not make a gate not applicable', (() => {
  const dir = buildGate(freshRoot(), 'fw', 'g', { 'gate.json': VITEST_LAUNCHED });
  const one = path.join(perMajor, 'toolchains', 'fw-1');
  const result = verifyGate({ stack: 'fw', name: 'g', dir, toolchain: one, siblings: [one] });

  return result.notApplicable === undefined && result.problems.map((problem) => problem.id).join() === 'tool-not-declared';
})());
check('discovery points every gate at the chosen toolchain', discoverGates(perMajor, 'fw', 'fw-2').every((gate) => gate.toolchain === path.join(perMajor, 'toolchains', 'fw-2')));
check('every per-major line carries its @es half', [...majorOne.lines, ...majorTwo.lines, ...mismatch.lines, ...staticRun.lines].every((line) => line.includes(' @es ')));

if (failures.length > 0) {
  console.error(`gates-kit verify selftest FAILED @es el selftest de verify de gates-kit FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`gates-kit verify selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);
