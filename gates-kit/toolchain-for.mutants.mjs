#!/usr/bin/env node
/**
 * The decisions of `toolchainFor`, each broken once, that `toolchain-for.selftest.mjs` must catch. The runner
 * and its rules (green baseline, exactly-once target, parse check) live in `../mutation-proof/run-mutants.mjs`;
 * crash-only kills count as survivors (`crashKills: 'fail'`). Each row names the decision it removes, not the
 * line it edits.
 *
 * @es Las decisiones de `toolchainFor`, rotas una a una, que `toolchain-for.selftest.mjs` debe cazar. Una
 * muerte solo por crash cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const F = 'gates-kit/toolchain-for.mjs';

const MUTANTS = [
  ['Angular 19 also pins Vitest', F, "'angular-19': { runners: [KARMA]", "'angular-19': { runners: [KARMA, VITEST]"],
  ['Angular 20 runs only its Karma default', F, "'angular-20': { runners: [KARMA, VITEST]", "'angular-20': { runners: [KARMA]"],
  ['Angular 21 runs only its Vitest default', F, "'angular-21': { runners: [KARMA, VITEST]", "'angular-21': { runners: [VITEST]"],
  ['Angular 22 runs only its Vitest default', F, "'angular-22': { runners: [KARMA, VITEST]", "'angular-22': { runners: [VITEST]"],
  ['Nest also pins Vitest', F, 'nest: { runners: [JEST]', 'nest: { runners: [JEST, VITEST]'],
  ['the Angular 22 Node range is the one of 20 and 21', F, "node: { framework: '^22.22.3 || ^24.15.0 || >=26.0.0'", 'node: { framework: ANGULAR_20_21_NODE'],
  ['the Angular 19 Node range drops Node 18', F, "framework: '^18.19.1 || ^20.11.1 || >=22.0.0'", "framework: '^20.11.1 || >=22.0.0'"],
  ['the Angular 19 to 21 toolchains accept Node 22.12', F, "ANGULAR_19_21_TOOLCHAIN_NODE = '^22.13.0 || ^24.0.0 || >=26.0.0'", "ANGULAR_19_21_TOOLCHAIN_NODE = '^22.12.0 || ^24.0.0 || >=26.0.0'"],
  ['the Angular 19 to 21 toolchains accept Node 25', F, "ANGULAR_19_21_TOOLCHAIN_NODE = '^22.13.0 || ^24.0.0 || >=26.0.0'", "ANGULAR_19_21_TOOLCHAIN_NODE = '^22.13.0 || >=24.0.0'"],
  ['the Nest toolchain accepts Node 22.12', F, "toolchain: '^20.19.0 || ^22.13.0 || >=24.0.0'", "toolchain: '^20.19.0 || ^22.12.0 || >=24.0.0'"],
  ['the Node toolchain accepts Node 22.13', F, "toolchain: '^22.18.0 || >=24.11.0'", "toolchain: '^22.13.0 || >=24.11.0'"],
  ['Angular 18 is a supported major', F, 'ANGULAR_MAJORS = [19, 20, 21, 22]', 'ANGULAR_MAJORS = [18, 19, 20, 21, 22]'],
  ['a major given as a string is read as a number', F, '!Number.isInteger(major) || !ANGULAR_MAJORS.includes(major)', '!ANGULAR_MAJORS.includes(Number(major))'],
  ['a major outside the table falls back to the latest', F, "return refuse('unsupported-major', major);\n\n  return `angular-${major}`;", "return 'angular-22';\n\n  return `angular-${major}`;"],
  ['an unknown framework falls back to Node', F, "if (framework !== 'angular') return refuse('unsupported-framework', framework);", "if (framework !== 'angular') return 'node-vitest';"],
  ['Nest is not recognised', F, "if (framework === 'nest') return 'nest';", ''],
  ['Node maps to the Nest toolchain', F, "if (framework === 'node') return 'node-vitest';", "if (framework === 'node') return 'nest';"],
  ['Jasmine without Karma runs the Karma gate', F, 'if (!runners.includes(runner)) return refuse', "if (!runners.includes(runner === 'jasmine' ? KARMA : runner)) return refuse"],
  ['an absent runner is read as the default', F, "if (runner === undefined || runner === null || runner === '') return refuse('unknown-test-runner', '');", "if (runner === undefined || runner === null || runner === '') return { ok: true, toolchain: id, testRunner: runners[0] };"],
  ['a null runner is not refused as absent', F, 'runner === undefined || runner === null || ', 'runner === undefined || '],
  ['an unpinned runner falls back to the toolchain default', F, "return refuse('unsupported-test-runner', runner, { toolchain: id });", "return { ok: true, toolchain: id, testRunner: runners[0] };"],
  ['an unpinned runner is accepted', F, 'if (!runners.includes(runner)) return refuse', 'if (false) return refuse'],
  ['the framework Node range is not checked', F, 'if (!frameworkFit) return refuse', 'if (false) return refuse'],
  ['the toolchain Node range is not checked', F, 'if (!toolchainFit) return refuse', 'if (false) return refuse'],
  ['the toolchain range is checked before the framework range', F, "if (!frameworkFit) return refuse('node-outside-framework', hostNode, { range: node.framework });\n  if (!toolchainFit) return refuse('node-outside-toolchain', hostNode, { toolchain: id, range: node.toolchain });", "if (!toolchainFit) return refuse('node-outside-toolchain', hostNode, { toolchain: id, range: node.toolchain });\n  if (!frameworkFit) return refuse('node-outside-framework', hostNode, { range: node.framework });"],
  ['an unreadable host Node is read as fitting', F, '} catch {\n    return undefined;\n  }', '} catch {\n    return true;\n  }'],
  ['an unreadable host Node is not refused', F, "if (frameworkFit === undefined || toolchainFit === undefined) return refuse('unreadable-node', hostNode);", ''],
  ['a framework refusal does not name its range', F, "{ range: node.framework }", '{}'],
  ['the result names the default runner, not the project one', F, 'testRunner: runner };', 'testRunner: runners[0] };'],
  ['a refusal line drops its @es half', F, '`${english} @es ${spanish}`', '`${english}`'],
  ['an unknown refusal reason renders empty', F, 'if (entry === undefined) throw new Error(`unknown refusal reason', 'if (entry === undefined) return \'\';\n  if (false) throw new Error(`unknown refusal reason'],
  ['a refusal line keeps its placeholders', F, ".replace(/\\{(\\w+)\\}/g, (_, key) => String(refusal[key] ?? ''))", ''],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof'], selftest: 'gates-kit/toolchain-for.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
