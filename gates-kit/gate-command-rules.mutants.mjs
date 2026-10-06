#!/usr/bin/env node
/**
 * The decisions of the gate-command rules (pinned reporter, banned `eslint --quiet`), each broken once, that
 * `gate-command-rules.selftest.mjs` must catch. The runner and its rules (green baseline, exactly-once target,
 * parse check) live in `../mutation-proof/run-mutants.mjs`; crash-only kills count as survivors
 * (`crashKills: 'fail'`). Each row names the decision it removes, not the line it edits.
 *
 * @es Las decisiones de las reglas del comando de un gate (reporter fijado, `eslint --quiet` prohibido), rotas
 * una a una, que `gate-command-rules.selftest.mjs` debe cazar. Una muerte solo por crash cuenta como
 * superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const C = 'gates-kit/gate-command-rules.mjs';
const L = 'gates-kit/gate-layout.mjs';

const MUTANTS = [
  ['eslint needs no reporter', C, "  eslint: { flag: '--format' },\n", ''],
  ['tsc may keep its pretty output', C, "typescript: { flag: '--pretty', value: 'false' }", "typescript: { flag: '--pretty' }"],
  ['vitest is read with the jest flag', C, "vitest: { flag: '--reporter' }", "vitest: { flag: '--reporters' }"],
  ['dependency-cruiser needs no reporter', C, "  'dependency-cruiser': { flag: '--output-type' },\n", ''],
  ['eslint --quiet is allowed', C, "BANNED_FLAGS = { eslint: ['--quiet'] }", 'BANNED_FLAGS = {}'],
  ['--quiet=value escapes the ban', C, 'arg === banned || arg.startsWith(`${banned}=`)', 'arg === banned'],
  ['any argument starting with --quiet is banned', C, 'arg === banned || arg.startsWith(`${banned}=`)', 'arg.startsWith(banned)'],
  ['a banned flag is not reported', C, "problems.push({ id: 'quiet-flag', detail: `${tool} ${banned}` });", ''],
  ['a package outside the table passes', C, "problems.push({ id: 'reporter-unknown', detail: tool });", ''],
  ['the required reporter value is not compared', C, ' || (reporter.value !== undefined && value !== reporter.value)', ''],
  ['a missing reporter is not reported', C, "if (value === undefined || (reporter.value", "if ((reporter.value"],
  ['a flag with an empty = value counts', C, 'arg.slice(flag.length + 1) || undefined', 'arg.slice(flag.length + 1)'],
  ['the = form is not read', C, 'if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1) || undefined;', ''],
  ['a following flag counts as the value', C, "next === undefined || next.startsWith('-') ? undefined : next", 'next'],
  ['a flag inside another argument counts', C, 'if (arg === flag) {', 'if (arg.endsWith(flag)) {'],
  ['the binary and arguments start at the package', L, 'args: rest.slice(at + 1)', 'args: rest.slice(at)'],
  ['a launcher call without a package still has a tool', L, 'return tool === undefined ? undefined : { tool, args: rest.slice(at + 1) };', 'return { tool, args: rest.slice(at + 1) };'],
  ['a command that is not a launcher call is checked', C, 'if (call === undefined) return [];', "if (call === undefined) return [{ id: 'reporter-unknown', detail: command[0] }];"],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof'], selftest: 'gates-kit/gate-command-rules.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
