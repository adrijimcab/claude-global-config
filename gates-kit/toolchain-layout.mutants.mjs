#!/usr/bin/env node
/**
 * The decisions of the toolchain inspector and of the gate-to-package link, each broken once, that
 * `toolchain-layout.selftest.mjs` must catch. The runner and its rules (green baseline, exactly-once target,
 * parse check) live in `../mutation-proof/run-mutants.mjs`; crash-only kills count as survivors
 * (`crashKills: 'fail'`). Each row names the decision it removes, not the line it edits.
 *
 * Known residual: the sort of discovery is not distinguished by any fixture (a file system lists in order
 * anyway), so it has no mutant.
 *
 * @es Las decisiones del inspector de toolchains y del vínculo gate-paquete, rotas una a una, que
 * `toolchain-layout.selftest.mjs` debe cazar. Una muerte solo por crash cuenta como superviviente. Residual
 * conocido: el orden del descubrimiento no lo distingue ningún fixture, así que no tiene mutante.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const T = 'gates-kit/toolchain-layout.mjs';
const L = 'gates-kit/gate-layout.mjs';

const MUTANTS = [
  ['a version may start with other text', T, '/^\\d+\\.\\d+\\.\\d+(?:', '/\\d+\\.\\d+\\.\\d+(?:'],
  ['a version may end with other text', T, '+)?$/;', '+)?/;'],
  ['a prerelease is required', T, '(?:-[0-9A-Za-z.-]+)?$/', '(?:-[0-9A-Za-z.-]+)$/'],
  ['a prerelease is refused', T, '(?:-[0-9A-Za-z.-]+)?', ''],
  ['a version with two numbers is exact', T, '/^\\d+\\.\\d+\\.\\d+(?:', '/^\\d+\\.\\d+(?:'],
  ['a non-string version is read as text', T, "typeof spec === 'string' && ", ''],
  ['a devDependencies section is allowed', T, "'devDependencies', ", ''],
  ['an optionalDependencies section is allowed', T, "'optionalDependencies', ", ''],
  ['a peerDependencies section is allowed', T, ", 'peerDependencies'", ''],
  ['an unexpected section is not reported', T, 'if (manifest[section] !== undefined) problems.push', 'if (false) problems.push'],
  ['a manifest named for another folder is accepted', T, 'if (manifest.name !== expectedName) problems.push', 'if (false) problems.push'],
  ['the expected name drops the stack', T, '`gates-kit-${stack}-toolchain`', "'gates-kit-toolchain'"],
  ['a manifest that is not private is accepted', T, 'if (manifest.private !== true) problems.push', 'if (false) problems.push'],
  ['a manifest without dependencies is accepted', T, 'if (Object.keys(dependencies).length === 0) problems.push', 'if (false) problems.push'],
  ['an inexact version is not reported', T, 'if (!isExactVersion(spec)) problems.push', 'if (false) problems.push'],
  ['a lock root that differs is accepted', T, '!sameDependencies(root.dependencies, dependencies)', 'false'],
  ['a lock without a root entry is accepted', T, 'root === undefined || ', ''],
  ['a lock root with an extra dependency is accepted', T, 'names.length === Object.keys(right).length && ', ''],
  ['a lock root with another version is accepted', T, 'left[name] === right[name]', 'true'],
  ['an inexact version is compared with the lock', T, 'if (!isExactVersion(spec)) continue;', ''],
  ['a missing package entry is not reported', T, 'if (entry === undefined) problems.push', 'if (false) problems.push'],
  ['a resolved version other than the pin is accepted', T, 'else if (entry.version !== spec) problems.push', 'else if (false) problems.push'],
  ['a missing manifest is read as an invalid one', T, 'if (!existsSync(file)) return undefined;', 'if (!existsSync(file)) return null;'],
  ['an array is a valid manifest', T, '&& !Array.isArray(value)', ''],
  ['an unreadable file is a valid manifest', T, '} catch {\n    return null;', '} catch {\n    return {};'],
  ['a missing manifest is not reported', T, 'if (manifest === undefined) problems.push', 'if (false) problems.push'],
  ['an invalid manifest is not reported', T, 'else if (manifest === null) problems.push', 'else if (false) problems.push'],
  ['a missing lockfile is not reported', T, 'if (lock === undefined) problems.push', 'if (false) problems.push'],
  ['an invalid lockfile is not reported', T, 'else if (!hasPackages(lock)) problems.push', 'else if (false) problems.push'],
  ['a lockfile without its packages table is valid', T, " && typeof lock.packages === 'object' && lock.packages !== null", ''],
  ['an unreadable manifest is still inspected', T, 'if (manifest === undefined || manifest === null) return problems;', 'if (manifest === undefined) return problems;'],
  ['the lock is not compared with the manifest', T, 'if (hasPackages(lock)) problems.push(...lockProblems(dependencies, lock));', ''],
  ['the manifest is not inspected', T, 'problems.push(...manifestProblems(manifest, dependencies, path.basename(dir)));', ''],
  ['the manifest is read against another stack', T, 'path.basename(dir)', "'toolchain'"],
  ['a kit without a toolchains folder is read', T, 'if (!existsSync(base)) return [];', ''],
  ['the stack filter is ignored by toolchain discovery', T, 'stack === undefined || name === stack', 'true'],
  ['a plain file counts as a toolchain', T, '.filter((entry) => entry.isDirectory())', '.filter(() => true)'],
  ['a command that runs no package is checked', T, 'if (tool === undefined) return [];', ''],
  ['a stack without a toolchain is read as declaring nothing', T, "if (!existsSync(toolchainDir)) return [{ id: 'no-toolchain' }];", ''],
  ['a package the toolchain lacks is accepted', T, "Object.hasOwn(declared, tool) ? [] : [{ id: 'tool-not-declared', detail: tool }]", '[]'],
  ['the launcher is any script name', L, "script?.split(/[\\\\/]/).at(-1) !== LAUNCHER", 'false'],
  ['the launcher is found by its full path only', L, 'script?.split(/[\\\\/]/).at(-1) !== LAUNCHER', 'script !== LAUNCHER'],
  ['the launcher is found only under forward slashes', L, '.split(/[\\\\/]/)', ".split('/')"],
  ['the launcher is not required to run under node', L, "program !== 'node' || ", ''],
  ['the launcher file is renamed', L, "const LAUNCHER = 'run-tool.mjs';", "const LAUNCHER = 'launch.mjs';"],
  ['a --cwd folder is read as the package', L, "rest[0] === '--cwd' ? rest[2] : rest[0]", 'rest[0]'],
  ['the package is read one place too early after --cwd', L, "rest[0] === '--cwd' ? rest[2] : rest[0]", "rest[0] === '--cwd' ? rest[1] : rest[0]"],
  ['the package is read after --cwd even without it', L, "rest[0] === '--cwd' ? rest[2] : rest[0]", 'rest[2]'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof', 'bilingual-output'], selftest: 'gates-kit/toolchain-layout.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
