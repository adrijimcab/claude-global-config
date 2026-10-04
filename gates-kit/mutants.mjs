#!/usr/bin/env node
/**
 * The decisions of the gates-kit verifier, each broken once, that `verify.selftest.mjs` must catch. The
 * runner and its rules (green baseline, exactly-once target, parse check) live in
 * `../mutation-proof/run-mutants.mjs`; crash-only kills count as survivors (`crashKills: 'fail'`). Each row
 * names the decision it removes, not the line it edits.
 *
 * Known residual: the sort of discovery and the quoting of Windows shim arguments are not distinguished by
 * any fixture (a file system lists in order anyway; no fixture path holds a space), so neither has a mutant.
 *
 * @es Las decisiones del verificador de gates-kit, rotas una a una, que `verify.selftest.mjs` debe cazar.
 * Una muerte solo por crash cuenta como superviviente. Residual conocido: el orden del descubrimiento y el
 * entrecomillado de los shims de Windows no tienen mutante porque ningún fixture los distingue.
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
  ['a key ending in lines counts as a threshold', R, '/\\b(?:statements|', '/(?:statements|'],
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
  ['the templates folder is a stack', L, "new Set(['templates'])", 'new Set([])'],
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
  ['a gate with a missing part still runs its command', V, 'if (problems.length === 0) for', 'if (true) for'],
  ['config suppressions are not reported', V, '...configProblems(configs)', ''],
  ['the npm shim is not launched through a shell', V, "new Set(['npx', 'npm', 'pnpm', 'yarn'])", "new Set(['npx', 'pnpm', 'yarn'])"],
  ['a message without its @es half is rendered', V, "entry.some((half) => typeof half !== 'string' || half.trim() === '')", 'false'],
  ['the @es marker is dropped from every line', V, '`${english} @es ${spanish}`', '`${english} ${spanish}`'],
  ['a gate with problems exits 0', V, 'return ok === results.length ? 0 : 1;', 'return 0;'],
  ['an empty kit exits 0', V, "print(say('run.none'));\n\n    return 2;", "print(say('run.none'));\n\n    return 0;"],
  ['an unknown option is not refused', V, 'if (options.error !== undefined) {', 'if (false) {'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof'], selftest: 'gates-kit/verify.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
