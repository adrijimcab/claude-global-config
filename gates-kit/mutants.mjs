#!/usr/bin/env node
/**
 * The decisions of the gates-kit verifier, each broken once, that `verify.selftest.mjs` must catch. The
 * runner and its rules (green baseline, exactly-once target, parse check) live in
 * `../mutation-proof/run-mutants.mjs`; crash-only kills count as survivors (`crashKills: 'fail'`). Each row
 * names the decision it removes, not the line it edits.
 *
 * Known residual: the sort of discovery, the quoting of Windows shim arguments and the conversion of a
 * changed path's separator to a slash are not distinguished by any fixture on a POSIX file system (it lists
 * in order anyway, no fixture path holds a space, and a POSIX separator already is a slash), so none has a
 * mutant. The row for the npm shim below survives for the same reason on Linux (baseline).
 *
 * @es Las decisiones del verificador de gates-kit, rotas una a una, que `verify.selftest.mjs` debe cazar.
 * Una muerte solo por crash cuenta como superviviente. Residual conocido: el orden del descubrimiento y el
 * entrecomillado de los shims de Windows y la conversión del separador de una ruta cambiada a barra no
 * tienen mutante porque ningún fixture los distingue en un sistema de ficheros POSIX.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const R = 'gates-kit/config-rules.mjs';
const L = 'gates-kit/gate-layout.mjs';
const V = 'gates-kit/verify.mjs';

const MUTANTS = [
  ['the kit floor is lowered to zero', R, 'export const THRESHOLD_FLOOR = 80;', 'export const THRESHOLD_FLOOR = 0;'],
  ['a threshold exactly at the floor is refused', R, 'Number(value) < THRESHOLD_FLOOR', 'Number(value) <= THRESHOLD_FLOOR'],
  ['a threshold above the floor is refused', R, 'Number(value) < THRESHOLD_FLOOR', 'Number(value) !== THRESHOLD_FLOOR'],
  ['a key ending in lines counts as a threshold', R, '/\\b(?:(?:statements|', '/(?:(?:statements|'],
  ['a mutation break score stops being a threshold', R, '\\w*|break)', '\\w*)'],
  ['a key starting with break counts as a threshold', R, '\\w*|break)', '\\w*|break\\w*)'],
  ['the break word is optional so any number counts as a threshold', R, '|break)["', '|break)?["'],
  ['an ignore entry stops being refused', R, '/ignore|allow-?list|exclude/i', '/allow-?list|exclude/i'],
  ['an allowlist stops being refused', R, '/ignore|allow-?list|exclude/i', '/ignore|exclude/i'],
  ['an exclude entry stops being refused', R, '/ignore|allow-?list|exclude/i', '/ignore|allow-?list/i'],
  ['a downgrade to warn stops being refused', R, '/(["\'])(?:off|warn)\\1|[:=]\\s*(?:off|warn)\\s*$/i', '/(["\'])off\\1|[:=]\\s*off\\s*$/i'],
  ['an unquoted off stops being refused', R, '/(["\'])(?:off|warn)\\1|[:=]\\s*(?:off|warn)\\s*$/i', '/(["\'])(?:off|warn)\\1/i'],
  ['any word containing off counts as off', R, '/(["\'])(?:off|warn)\\1|[:=]\\s*(?:off|warn)\\s*$/i', '/off/i'],
  ['a disable directive in a comment is not read', R, "if (DIRECTIVE.test(content)) violations.push({ rule: 'directive', line });", "if (!isComment && DIRECTIVE.test(content)) violations.push({ rule: 'directive', line });"],
  ['a disable directive stops being refused', R, "if (DIRECTIVE.test(content)) violations.push({ rule: 'directive', line });", ''],
  ['a comment line is scanned for key rules', R, 'if (isComment) return;', ''],
  ['a double-slash line stops being a comment', R, '/^\\s*(?:\\/\\/|#|\\*|\\/\\*)/', '/^\\s*(?:#|\\*|\\/\\*)/'],
  ['violations report a zero-based line', R, 'const line = index + 1;', 'const line = index;'],
  ['the templates folder is a stack', L, "new Set(['templates', TOOLCHAINS_FOLDER])", 'new Set([TOOLCHAINS_FOLDER])'],
  ['the toolchains folder is a stack', L, "new Set(['templates', TOOLCHAINS_FOLDER])", "new Set(['templates'])"],
  ['the toolchains folder is named otherwise', L, "TOOLCHAINS_FOLDER = 'toolchains';", "TOOLCHAINS_FOLDER = 'toolchain';"],
  ['a toolchain is looked up outside its stack folder', L, 'path.join(root, TOOLCHAINS_FOLDER, stack)', 'path.join(root, TOOLCHAINS_FOLDER)'],
  ['a gate takes the toolchain of the first stack', L, 'toolchain: toolchainOf(root, name)', 'toolchain: toolchainOf(root, stacks[0])'],
  ['the stack filter is ignored', L, '(stack === undefined || name === stack)', 'true'],
  ['an empty fixture folder counts as content', L, 'readdirSync(dir).length > 0', 'true'],
  ['a file counts as a fixture folder', L, 'statSync(dir).isDirectory() && ', ''],
  ['a file merely starting with config counts as a config', L, "name.startsWith('config.')", "name.startsWith('config')"],
  ['a folder counts as a config file', L, '&& statSync(path.join(dir, name)).isFile()', ''],
  ['a whitespace-only SOURCE.md counts as content', L, ".trim() === ''", " === ''"],
  ['an extra declaration key is accepted', L, '!Object.keys(declaration).every((key) => DECLARATION_KEYS.has(key))', 'false'],
  ['an empty command array is accepted', L, 'declaration.command.length === 0 || ', ''],
  ['an empty argument is accepted', L, "typeof arg === 'string' && arg !== ''", "typeof arg === 'string'"],
  ['a non-string argument is accepted', L, "typeof arg === 'string' && arg !== ''", "arg !== ''"],
  ['a fractional timeout is accepted', L, 'Number.isInteger(declaration.timeoutMs) && ', ''],
  ['a zero timeout is accepted', L, 'declaration.timeoutMs > 0', 'declaration.timeoutMs >= 0'],
  ['the default timeout is read in seconds', L, 'DEFAULT_TIMEOUT_MS = 300_000', 'DEFAULT_TIMEOUT_MS = 300'],
  ['the declared timeout is ignored', V, 'timeout: gate.timeoutMs ?? DEFAULT_TIMEOUT_MS', 'timeout: DEFAULT_TIMEOUT_MS'],
  ['a timeout is read as an unstartable command', V, "if (run.error?.code === 'ETIMEDOUT') return { id: 'timed-out', detail: `${side}/` };", ''],
  ['a command that cannot start counts as a valid failure', V, "if (run.error !== undefined || typeof run.status !== 'number') return", 'if (false) return'],
  ['a failing pass fixture is accepted', V, "side === 'pass' && run.status !== 0", "side === 'pass' && false"],
  ['a passing fail fixture is accepted', V, "side === 'fail' && run.status === 0", "side === 'fail' && false"],
  ['the target token is not substituted', V, "arg.replaceAll('{target}', target)", 'arg'],
  ['both sides run on the pass folder', V, 'const target = path.join(dir, side);', "const target = path.join(dir, 'pass');"],
  ['the command runs outside the gate directory', V, '{ cwd: dir,', '{ cwd: undefined,'],
  ['a gate with a missing part still runs its command', V, 'if (problems.length === 0 && wiring.length === 0) {', 'if (true) {'],
  ['config suppressions are not reported', V, '...configProblems(configs)', ''],
  ['the npm shim is not launched through a shell', V, "new Set(['npx', 'npm', 'pnpm', 'yarn'])", "new Set(['npx', 'pnpm', 'yarn'])"],
  ['a gate that runs an undeclared package still runs', V, 'problems.length === 0 && wiring.length === 0', 'problems.length === 0'],
  ['an undeclared package is not reported', V, '...wiring, ...configProblems', '...configProblems'],
  ['a gate is not read against its toolchain', V, 'gate === undefined ? [] : gateToolProblems(gate.command, toolchain)', '[]'],
  ['an invalid declaration is read for its package', V, 'gate === undefined ? []', 'false ? []'],
  ['toolchains are not verified', V, 'const toolchainResults = toolchains.map(verifyToolchain);', 'const toolchainResults = [];'],
  ['a refused toolchain is printed as correct', V, "print(problems.length === 0 ? say('toolchain.ok', { stack }) : say('toolchain.refused', { stack, count: problems.length }));", "print(say('toolchain.ok', { stack }));"],
  ['toolchain problems are not listed', V, 'for (const { id, ...values } of problems) print(say(`problem.${id}`, values));\n  }\n\n  const toolchainsOk', '}\n\n  const toolchainsOk'],
  ['a broken toolchain does not fail the run', V, 'ok === results.length && toolchainsOk === toolchainResults.length ? 0 : 1', 'ok === results.length ? 0 : 1'],
  ['a kit with only toolchains is empty', V, 'gates.length === 0 && toolchains.length === 0', 'gates.length === 0'],
  ['a run without gates prints a gate summary', V, "if (gates.length > 0) print(say('run.summary'", "if (true) print(say('run.summary'"],
  ['a run without toolchains prints a toolchain summary', V, "if (toolchains.length > 0) print(say('run.summary-toolchains'", "if (true) print(say('run.summary-toolchains'"],
  ['the stack filter is ignored by toolchains', V, 'discoverToolchains(root, options.stack)', 'discoverToolchains(root)'],
  ['a command that leaves residue is accepted', V, 'if (changed.length > 0) all.push', 'if (false) all.push'],
  ['the gate folder is not read before the run', V, 'const before = snapshot(dir);', 'const before = new Map();'],
  ['a created folder is not seen', V, "entry.isDirectory() ? 'dir' : `${size}:${mtimeMs}`", "entry.isDirectory() ? undefined : `${size}:${mtimeMs}`"],
  ['a rewritten file is not seen', V, '`${size}:${mtimeMs}`', '`${size}`'],
  ['a removed file is not seen', V, '[...new Set([...before.keys(), ...after.keys()])]', '[...new Set([...after.keys()])]'],
  ['an added file is not seen', V, '[...new Set([...before.keys(), ...after.keys()])]', '[...new Set([...before.keys()])]'],
  ['the changed paths are not sorted', V, '.filter((key) => before.get(key) !== after.get(key)).sort()', '.filter((key) => before.get(key) !== after.get(key))'],
  ['the changed paths are not listed', V, "detail: changed.join(' ')", 'detail: changed.length'],
  ['a message without its @es half is rendered', V, "entry.some((half) => typeof half !== 'string' || half.trim() === '')", 'false'],
  ['the @es marker is dropped from every line', V, '`${english} @es ${spanish}`', '`${english} ${spanish}`'],
  ['a gate with problems exits 0', V, 'return ok === results.length && toolchainsOk === toolchainResults.length ? 0 : 1;', 'return 0;'],
  ['an empty kit exits 0', V, "print(say('run.none'));\n\n    return 2;", "print(say('run.none'));\n\n    return 0;"],
  ['an unknown option is not refused', V, 'if (options.error !== undefined) {', 'if (false) {'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof'], selftest: 'gates-kit/verify.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
