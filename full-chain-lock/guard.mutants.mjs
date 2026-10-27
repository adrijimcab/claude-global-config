#!/usr/bin/env node
/**
 * The decisions of the full-chain GUARD (the hook, the reading of a line, the declaration, the refusal), each
 * broken once, that `guard.selftest.mjs` must catch. A mutant that only crashes the selftest counts as a survivor
 * (`crashKills: 'fail'`). The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * Not mutated, stated: `chains.json` and the two JSON registration files (the runner mutates only code it can
 * parse-check; the selftest asserts their content instead), and the Spanish prose of the refusal beyond its
 * accents and one word, which no check can judge as a sentence.
 *
 * @es Las decisiones del GUARD de cadenas completas, rotas una a una, que `guard.selftest.mjs` debe detectar.
 * Un mutante que solo hace caer el selftest cuenta como superviviente. No se muta, dicho: `chains.json` y los dos
 * JSON de registro (el motor solo muta lo que puede comprobar que parsea; el selftest afirma su contenido) y la
 * prosa española de la negativa más allá de sus acentos y una palabra.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { copiedPaths, importClosure } from '../mutation-proof/import-closure.mjs';
import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FLEET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL_MANIFEST = 'hook-dispatch/manifests/pretooluse-shell.json';

/**
 * What the selftest RUNS without importing it: the dispatcher and every guard of the shell manifest, which it spawns
 * through `dispatch.mjs`, with their import closures. Derived from the manifest, so a guard added to it is copied
 * without anyone editing this list (a hand list here missed `hook-io/`, which left the baseline NOT MEASURED).
 * @es Lo que el selftest EJECUTA sin importarlo: el dispatcher y cada guard del manifiesto de shell, con sus cierres
 * de imports. Derivado del manifiesto: una lista a mano omitió `hook-io/` y dejó la línea base SIN MEDIR.
 */
function spawnedPaths() {
  const guards = JSON.parse(readFileSync(path.join(FLEET, SHELL_MANIFEST), 'utf8')).guards.map((guard) => path.posix.join(path.posix.dirname(SHELL_MANIFEST), guard));
  const { files, problems } = importClosure({ root: FLEET, entries: ['hook-dispatch/dispatch.mjs', ...guards] });

  if (problems.length > 0) throw new Error(problems.join('\n'));

  return copiedPaths(files);
}

const G = 'full-chain-lock/guard.mjs';
const I = 'full-chain-lock/chain-invocations.mjs';
const K = 'full-chain-lock/chains-config.mjs';
const F = 'full-chain-lock/refusal.mjs';
const M = 'full-chain-lock/messages.mjs';
const OPTIONS = "const OPTIONS_WITH_VALUE = new Set(['--prefix', '-C', '--cwd', '-w', '--workspace', '--cache', '--userconfig', '--loglevel', '--filter', '-F']);";
const withoutOption = (name) => OPTIONS.replace(`'${name}', `, '').replace(`, '${name}'])`, '])');

const MUTANTS = [
  // --- the hook
  ['a non-shell tool is read as a shell', G, "if (dialect === undefined || typeof command !== 'string') return undefined;", "if (typeof command !== 'string') return undefined;"],
  ['an internal failure refuses the command instead of failing open', G, 'return undefined; // fail open: a malfunction of the decision or of the declaration must never block a command', "throw new Error('boom');"],
  ['a refusal is never produced', G, 'if (offenders.length === 0) return undefined;', 'return undefined;'],
  ['everything is refused, chain or not', G, 'if (offenders.length === 0) return undefined;', ''],
  ['a BOM-prefixed payload is not read', G, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['the decision is not a deny', G, "permissionDecision: 'deny',", "permissionDecision: 'ask',"],
  ['the hook event is wrong', G, "hookEventName: 'PreToolUse',", "hookEventName: 'PostToolUse',"],
  ['the calling session is not passed on', G, "typeof payload.session_id === 'string' ? payload.session_id : undefined", 'undefined'],
  ['the answer names the last chain of the line, not the first', G, 'refusalText(offenders[0],', 'refusalText(offenders.at(-1),'],

  // --- what a line runs
  ['yarn is not a package manager here', I, "const MANAGERS = new Set(['npm', 'pnpm', 'yarn']);", "const MANAGERS = new Set(['npm', 'pnpm']);"],
  ['pnpm is not a package manager here', I, "const MANAGERS = new Set(['npm', 'pnpm', 'yarn']);", "const MANAGERS = new Set(['npm', 'yarn']);"],
  ['pnpm does not take a bare word as a script', I, "const BARE_SCRIPT_MANAGERS = new Set(['pnpm', 'yarn']);", "const BARE_SCRIPT_MANAGERS = new Set(['yarn']);"],
  ['yarn does not take a bare word as a script', I, "const BARE_SCRIPT_MANAGERS = new Set(['pnpm', 'yarn']);", "const BARE_SCRIPT_MANAGERS = new Set(['pnpm']);"],
  ['npm takes any bare word as a script', I, 'if (LIFECYCLE_SHORTHANDS.has(verb) || BARE_SCRIPT_MANAGERS.has(manager)) return verb;', 'return verb;'],
  ['"run" is not a verb that runs a script', I, "const RUN_VERBS = new Set(['run', 'run-script', 'rum', 'urn']);", "const RUN_VERBS = new Set(['run-script', 'rum', 'urn']);"],
  ['"run-script" is not a verb that runs a script', I, "const RUN_VERBS = new Set(['run', 'run-script', 'rum', 'urn']);", "const RUN_VERBS = new Set(['run', 'rum', 'urn']);"],
  ['"rum" is not a verb that runs a script', I, "const RUN_VERBS = new Set(['run', 'run-script', 'rum', 'urn']);", "const RUN_VERBS = new Set(['run', 'run-script', 'urn']);"],
  ['"urn" is not a verb that runs a script', I, "const RUN_VERBS = new Set(['run', 'run-script', 'rum', 'urn']);", "const RUN_VERBS = new Set(['run', 'run-script', 'rum']);"],
  ['npm test is not a lifecycle shorthand', I, "const LIFECYCLE_SHORTHANDS = new Set(['test', 'start', 'stop', 'restart']);", "const LIFECYCLE_SHORTHANDS = new Set(['start', 'stop', 'restart']);"],
  ['npm start is not a lifecycle shorthand', I, "const LIFECYCLE_SHORTHANDS = new Set(['test', 'start', 'stop', 'restart']);", "const LIFECYCLE_SHORTHANDS = new Set(['test', 'stop', 'restart']);"],
  ['npm stop is not a lifecycle shorthand', I, "const LIFECYCLE_SHORTHANDS = new Set(['test', 'start', 'stop', 'restart']);", "const LIFECYCLE_SHORTHANDS = new Set(['test', 'start', 'restart']);"],
  ['npm restart is not a lifecycle shorthand', I, "const LIFECYCLE_SHORTHANDS = new Set(['test', 'start', 'stop', 'restart']);", "const LIFECYCLE_SHORTHANDS = new Set(['test', 'start', 'stop']);"],
  ...['--prefix', '-C', '--cwd', '-w', '--workspace', '--cache', '--userconfig', '--loglevel', '--filter', '-F'].map((name) => [`the option ${name} is not known to take a value`, I, OPTIONS, withoutOption(name)]),
  ['an option never consumes its value', I, 'index += OPTIONS_WITH_VALUE.has(word) ? 2 : 1;', 'index += 1;'],
  ['an option is taken for the script', I, "if (!word.startsWith('-')) return index;", 'return index;'],
  ['a line with no declared chain is reported', I, 'if (projects.length > 0) found.push', 'if (true) found.push'],
  ['every program is read as node', I, "} else if (program === 'node') {", '} else if (true) {'],
  ['a command path must equal the suffix, never end with it', I, 'target === candidate || target.endsWith(`/${candidate}`)', 'target === candidate'],
  ['a command path may merely end with the suffix text', I, 'target === candidate || target.endsWith(`/${candidate}`)', 'target.endsWith(candidate)'],
  ['a command path must end with the suffix, never equal it', I, 'target === candidate || target.endsWith(`/${candidate}`)', 'target.endsWith(`/${candidate}`)'],
  ['a Windows path is not read as a path', I, String.raw`const forwardSlashes = (word) => word.split('\\').join('/');`, 'const forwardSlashes = (word) => word;'],
  ['only the first project that declares a chain is named', I, "chains.projects.filter((entry) => entry[kind].includes(value)).map((entry) => entry.project)", "chains.projects.filter((entry) => entry[kind].includes(value)).map((entry) => entry.project).slice(0, 1)"],

  // --- the declaration
  ['an empty project list is accepted', K, 'parsed.projects.length === 0', 'false'],
  ['a project with no name is accepted', K, "typeof entry?.project !== 'string' || entry.project.trim() === ''", 'false'],
  ['a project declared twice is accepted', K, 'if (seen.has(entry.project))', 'if (false)'],
  ['the names seen are not remembered', K, '    seen.add(entry.project);\n', ''],
  ['a blank script name is accepted', K, "item.trim() !== ''", 'true'],
  ['scripts that are not a list are accepted', K, 'Array.isArray(value) && value.every', 'value.every'],
  ['a project that declares nothing is accepted', K, 'entry.scripts.length + entry.commands.length === 0', 'false'],
  ['an unreadable file is not named in the error', K, "throw new Error(say.line('config-invalid', { file, problem: error instanceof Error ? error.message : String(error) }), { cause: error });", "throw error;"],
  ['the error of a bad shape does not name the file', K, "throw new Error(say.line('config-invalid', { file, problem }));", "throw new Error(say.line('config-invalid', { file: 'config', problem }));"],

  // --- the refusal
  ['--project is named even when several projects declare the chain', F, 'projects.length === 1', 'projects.length >= 1'],
  ['--project is never named', F, 'projects.length === 1', 'false'],
  ['the runner path keeps its backslashes', F, String.raw`.split('\\').join('/');`, ';'],
  ['an unknown session is named in the command', F, "session === undefined ? '' :", "false ? '' :"],
  ['only the first project is named in the message', F, "offender.projects.join(' / ')", 'offender.projects[0]'],
  ['the message states another wait', F, 'defaultWaitSeconds: DEFAULT_WAIT_SECONDS', 'defaultWaitSeconds: 1'],
  ['the answer does not name the wrapped command', F, 'wrapped: wrappedCommand(offender, session),', 'wrapped: offender.text,'],
  ['the answer names the chain instead of the command', F, 'command: offender.text,', 'command: offender.chain,'],
  ['the command after -- is lost', F, '-- ${text}`', '-- `'],
  ['the English refusal loses the incident date', M, 'was reaped for low memory on 2026-10-05). The rule was kept by', 'was reaped for low memory). The rule was kept by'],
  ['the Spanish refusal loses its accent mark', M, 'FULL-CHAIN GUARD RECHAZÓ este comando', 'FULL-CHAIN GUARD RECHAZO este comando'],
  ['the Spanish refusal loses the word machine', M, 'dos a la vez ahogaron la máquina', 'dos a la vez ahogaron el sistema']
];

const survivors = runMutants({
  fleetRoot: FLEET,
  paths: [SHELL_MANIFEST, 'settings.json', ...spawnedPaths()],
  selftest: 'full-chain-lock/guard.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
