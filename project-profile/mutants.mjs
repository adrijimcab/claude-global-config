#!/usr/bin/env node
/**
 * The decisions of `project-profile/` (root search, version reading, framework and runner detection, change
 * detection, support status, the summary line and the hook), each broken once, that `selftest.mjs` must catch.
 * The runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant
 * that only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `project-profile/`, rotas una a una, que `selftest.mjs` debe detectar. Un mutante que
 * solo hace caer el selftest cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const F = 'project-profile/facts.mjs';
const P = 'project-profile/profile.mjs';
const S = 'project-profile/angular-support.mjs';
const L = 'project-profile/summary-line.mjs';
const H = 'project-profile/session-start.mjs';

const MUTANTS = [
  // --- facts: the root search ---
  ['the repository top is not a wall', F, 'if (isRepositoryTop(dir) || chain.length >= 64) return chain;', 'if (chain.length >= 64) return chain;'],
  ['the home directory can be the project', F, "if (dir === parent || (home !== undefined && dir === path.resolve(home))) return chain;", 'if (dir === parent) return chain;'],
  ['the farthest manifest wins', F, 'for (const dir of chain) {\n    if (existsSync(path.join(dir, MANIFEST)))', 'for (const dir of [...chain].reverse()) {\n    if (existsSync(path.join(dir, MANIFEST)))'],
  ['children are tried from any folder', F, "if (top === undefined || !isRepositoryTop(top)) return undefined;", 'if (top === undefined) return undefined;'],
  ['node_modules is a project child', F, ' && !SKIPPED_CHILDREN.has(name))', ')'],
  ['dot folders are project children', F, "!name.startsWith('.') && ", ''],
  ['a child without a framework is the project', F, '.some((declared) => preferred.includes(declared));', '.some(() => true);'],
  ['children are not sorted', F, 'return [...names].sort().filter(', 'return [...names].filter('],
  ['the chosen child is not returned', F, 'return name === undefined ? undefined : { root: path.join(top, name)', 'return name === undefined || true ? undefined : { root: path.join(top, name)'],
  ['a malformed nested manifest stops the walk', F, "if (typeof manifest?.version === 'string') return manifest.version;", 'return manifest?.version;'],
  ['the installed version is read from the project only', F, 'installedVersion(pkg, chain)]', 'installedVersion(pkg, [found.root])]'],
  ['undeclared packages are read too', F, 'packages.filter((pkg) => declared.has(pkg))', 'packages'],
  ['lockfiles are read at the root only', F, 'const lockfiles = chain.flatMap(', 'const lockfiles = [found.root].flatMap('],
  ['peer dependencies are not declarations', F, "['dependencies', 'devDependencies', 'peerDependencies'].flatMap", "['dependencies', 'devDependencies'].flatMap"],
  ['a BOM breaks a manifest', F, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['an array manifest is accepted', F, "typeof value === 'object' && !Array.isArray(value) ? value : undefined", "typeof value === 'object' ? value : undefined"],

  // --- profile: versions ---
  ['a bare major is not a version', P, "const [major, minor = '0'] = text.split('.');", "const [major, minor] = text.split('.');"],
  ['an empty part is a number', P, "const isNumber = (part) => part !== '' && ", 'const isNumber = (part) => '],
  ['a letter is a digit', P, "character >= '0' && character <= '9'", "character >= '0'"],
  ['only the last union member is read', P, "range.trim().split('||')[0]", "range.trim().split('||').at(-1)"],
  ['an upper bound is read as the version', P, ".trim().split(' ')[0];", ".trim().split(' ').at(-1);"],
  ['range operators are not stripped', P, "'^~>=v'.includes(first[start])", "'^~'.includes(first[start])"],
  ['a star major reads as 0.0', P, 'index > 0 && (part', 'index >= 0 && (part'],
  ['an x minor is not read', P, "(part === 'x' || part === '*')", "(part === '*')"],
  ['the declared range wins over the install', P, "if (installed !== undefined) return { ...installed, source: 'installed' };", ''],
  ['an undeclared package has an installed version', P, '  if (range === undefined) return undefined;\n\n  const installed', '  const installed'],
  ['dev dependencies are read before runtime ones', P, 'manifest?.dependencies?.[pkg] ?? manifest?.devDependencies?.[pkg]', 'manifest?.devDependencies?.[pkg] ?? manifest?.dependencies?.[pkg]'],
  ['peer dependencies are not read', P, ' ?? manifest?.peerDependencies?.[pkg];', ';'],

  // --- profile: Angular workspace ---
  ['the library is described before the application', P, "projects.find((project) => project.projectType === 'application') ?? projects[0]", 'projects[0]'],
  ['the newer targets key is not read', P, 'project?.architect ?? project?.targets ?? {}', 'project?.architect ?? {}'],
  ['a string polyfill is not read', P, "if (typeof value === 'string') return [value];", ''],
  ['a zone.js/testing polyfill is not zone.js', P, " || entry.startsWith('zone.js/')", ''],
  ['a polyfill merely starting with zone.js is zone.js', P, "entry.startsWith('zone.js/')", "entry.startsWith('zone.js')"],
  ['zone.js declared elsewhere reads as zoneless', P, "=== undefined ? true : undefined;", '=== undefined ? true : true;'],
  ['no zone.js at all reads as unknown', P, "'zone.js') === undefined ? true : undefined;", "'zone.js') === undefined ? undefined : undefined;"],
  ['standalone is default from 18', P, 'if (major >= 19) return', 'if (major >= 18) return'],
  ['standalone opt-in from 15', P, "major >= 14 ? 'opt-in'", "major >= 15 ? 'opt-in'"],
  ['the karma builder is not a runner', P, "if (builder.endsWith(':karma')) return 'karma';", ''],
  ['the jest builder is not a runner', P, "if (builder.endsWith(':jest')) return 'jest';", ''],
  ['the unit-test builder ignores its runner option', P, "typeof test.options?.runner === 'string' ? test.options.runner : 'vitest'", "'vitest'"],
  ['the unit-test builder defaults to karma', P, "test.options.runner : 'vitest';", "test.options.runner : 'karma';"],
  ['a non-Angular project reads angular.json runners', P, "framework === 'angular' ? builderRunnerOf(targets.test) : undefined", 'builderRunnerOf(targets.test)'],
  ['the builder runner is dropped', P, '...(builderRunner === undefined ? [] : [builderRunner]), ', ''],
  ['a runner is counted twice', P, 'const testRunners = [...new Set([', 'const testRunners = [...(['],

  // --- profile: the rest ---
  ['the lockfile wins over the packageManager field', P, "if (typeof field === 'string' && field.includes('@')) return field.split('@')[0];", ''],
  ['a field without a version is read', P, "typeof field === 'string' && field.includes('@')", "typeof field === 'string'"],
  ['the farthest lockfile wins', P, "facts.lockfiles?.map((name) => lockfileManagers[name]).find(", "facts.lockfiles?.map((name) => lockfileManagers[name]).reverse().find("],
  ['eslintrc wins over flat', P, "if (rootFiles.some((name) => name.startsWith('eslint.config.'))) return 'flat';", ''],
  ['eslintrc is not recognised', P, "name.startsWith('.eslintrc')) ? 'eslintrc'", "name.startsWith('.eslintrc.never')) ? 'eslintrc'"],
  ['Next.js loses to React', P, "  ['next', 'next', 'Next.js'],\n  ['react', 'react', 'React'],", "  ['react', 'react', 'React'],\n  ['next', 'next', 'Next.js'],"],
  ['NestJS wins over Angular', P, "  ['angular', '@angular/core', 'Angular'],\n  ['next', 'next', 'Next.js'],", "  ['next', 'next', 'Next.js'],\n  ['angular', '@angular/core', 'Angular'],"],
  ['a framework-less project is not Node', P, "const framework = match === undefined ? 'node' : match[0];", "const framework = match === undefined ? 'react' : match[0];"],
  ['the start itself is a relative root', P, "below !== '' && !below.startsWith('..')", "!below.startsWith('..')"],
  ['a root above the start is a relative root', P, " && !below.startsWith('..') ?", ' ?'],
  ['agent files are not listed', P, 'agentFiles: AGENT_FILES.filter((name) => facts.rootFiles?.includes(name)),', 'agentFiles: [],'],
  ['the CLI accepts any flag', P, "flags.some((flag) => flag !== '--json') || positional.length > 1", 'positional.length > 1'],
  ['the CLI accepts two directories', P, " || positional.length > 1) {", ') {'],
  ['the CLI ignores --json', P, "flags.includes('--json') ? JSON.stringify(profile, null, 2)", "false ? JSON.stringify(profile, null, 2)"],
  ['no project exits 0', P, '    return 1;\n  }\n\n  const { profileLine }', '    return 0;\n  }\n\n  const { profileLine }'],
  ['a bad call exits 1', P, '    return 2;\n  }\n\n  const profile', '    return 1;\n  }\n\n  const profile'],

  // --- support ---
  ['near EOL is 60 days', S, 'export const NEAR_EOL_DAYS = 90;', 'export const NEAR_EOL_DAYS = 60;'],
  ['the last LTS day is EOL', S, 'if (today > window.ltsUntil) return', 'if (today >= window.ltsUntil) return'],
  ['the near-EOL limit is exclusive', S, 'window.ltsUntil) <= NEAR_EOL_DAYS)', 'window.ltsUntil) < NEAR_EOL_DAYS)'],
  ['near EOL is never said', S, "if (daysBetween(today, window.ltsUntil) <= NEAR_EOL_DAYS) return { status: 'near-eol', until: window.ltsUntil };", ''],
  ['an unknown newer major is supported', S, "status: major < 19 ? 'eol' : 'unknown'", "status: major < 19 ? 'eol' : 'active'"],
  ['an older major is unknown', S, "major < 19 ? 'eol'", "major < 18 ? 'eol'"],
  ['v19 support ended later', S, "19: Object.freeze({ activeUntil: '2025-05-28', ltsUntil: '2026-05-19' })", "19: Object.freeze({ activeUntil: '2025-05-28', ltsUntil: '2026-11-19' })"],
  ['v20 support ends on the 20 branch date', S, "ltsUntil: '2026-11-28' })", "ltsUntil: '2026-11-21' })"],
  ['the last active day is LTS', S, 'today > window.activeUntil ?', 'today >= window.activeUntil ?'],
  ['LTS and active swap their end dates', S, "{ status: 'lts', until: window.ltsUntil }", "{ status: 'lts', until: window.activeUntil }"],

  // --- the summary line ---
  ['the official rules file is read from v22', L, 'export const OFFICIAL_RULES_SINCE = 21;', 'export const OFFICIAL_RULES_SINCE = 22;'],
  ['the official rules file path drifts', L, "'node_modules/@angular/core/resources/best-practices.md'", "'node_modules/@angular/core/best-practices.md'"],
  ['the official file is claimed even when missing', L, 'const present = exists(official);', 'const present = true;'],
  ['a major outside the matrix gets a file of its own', L, 'const nearest = VERSION_FILE_MAJORS.includes(major) ? major :', 'const nearest = true ? major :'],
  ['below the matrix takes the newest file', L, 'major < VERSION_FILE_MAJORS[0] ? VERSION_FILE_MAJORS[0] : VERSION_FILE_MAJORS.at(-1)', 'VERSION_FILE_MAJORS.at(-1)'],
  ['an out-of-matrix column is not flagged', L, "const column = VERSION_FILE_MAJORS.includes(major) ? `column v${major}` :", 'const column = true ? `column v${major}` :'],
  ['EOL says nothing', L, "if (status === 'eol') return", "if (status === 'never') return"],
  ['near EOL says nothing', L, "if (status === 'near-eol') return", "if (status === 'never-near') return"],
  ['the next major is the same major', L, 'plan the update to v${major + 1}.`, `Angular ${major} está FUERA', 'plan the update to v${major}.`, `Angular ${major} está FUERA'],
  ['the Spanish half is dropped', L, "return `Profile${where}: ${factsText(profile)}. ${english.join(' ')} @es ${spanish.join(' ')}`;", "return `Profile${where}: ${factsText(profile)}. ${english.join(' ')}`;"],
  ['the toolchain is named without existing', L, "|| !exists(path.join(home, '.claude', 'gates-kit', 'toolchains', result.toolchain, 'package.json'))) return undefined;", ') return undefined;'],
  ['a toolchain is named without a home', L, "if (home === undefined || !exists", 'if (!exists'],
  ['a refusal is swallowed', L, "if (result.ok === false) {", 'if (false) {'],
  ['a refusal drops its Spanish half', L, "`Sin toolchain de gates: ${spanish}.`", "`Sin toolchain de gates.`"],
  ['a refusal says nothing of its reason', L, "`No gates toolchain: ${english}.`", "`No gates toolchain.`"],
  ['the gates sentence also covers React, Vue and Next', L, "const GATES_FRAMEWORKS = Object.freeze(['angular', 'nest', 'node']);", "const GATES_FRAMEWORKS = Object.freeze(['angular', 'nest', 'node', 'react', 'vue', 'next']);"],
  ['Nest gets no gates sentence', L, "const GATES_FRAMEWORKS = Object.freeze(['angular', 'nest', 'node']);", "const GATES_FRAMEWORKS = Object.freeze(['angular', 'node']);"],
  ['the toolchain is decided without the host Node', L, 'toolchainForProfile(profile, hostNode)', "toolchainForProfile(profile, '24.15.0')"],
  ['the host Node default is not the process one', L, 'hostNode = process.versions.node', "hostNode = '1.0.0'"],
  ['the chosen runner is not named', L, "toolchains/${result.toolchain} (${result.testRunner}).`, `Toolchain", "toolchains/${result.toolchain}.`, `Toolchain"],
  ['a declared version is not marked', L, "version.source === 'declared' ? ' (declared, not installed)' : ''", "''"],
  ['zoneless reads as zone.js', L, "profile.angular.zoneless === true ? 'zoneless'", "profile.angular.zoneless === false ? 'zoneless'"],
  ['the relative root is not named', L, "const where = profile.relativeRoot === undefined || profile.relativeRoot === '' ? '' :", "const where = true ? '' :"],
  ['non-Angular projects get Angular docs', L, "if (profile.framework === 'angular' && major !== undefined) {", 'if (major !== undefined) {'],

  // --- the hook ---
  ['CLAUDE_PROJECT_DIR wins over the payload cwd', H, "if (typeof payload?.cwd === 'string' && payload.cwd !== '') return payload.cwd;", ''],
  ['an empty cwd is used', H, " && payload.cwd !== '') return payload.cwd;", ') return payload.cwd;'],
  ['CLAUDE_PROJECT_DIR is ignored', H, "return typeof env.CLAUDE_PROJECT_DIR === 'string' && env.CLAUDE_PROJECT_DIR !== '' ? env.CLAUDE_PROJECT_DIR : fallback;", 'return fallback;'],
  ['the payload is not read through the port parser', H, 'sessionDirectory(tryParsePayload(raw), env, cwd)', "sessionDirectory(raw.startsWith('{') ? JSON.parse(raw) : undefined, env, cwd)"],
  ['a project outside speaks', H, '    if (profile === undefined) return undefined;\n', ''],
  ['a malfunction is silent', H, "  } catch (error) {\n    context = `Project profile could not be measured", "  } catch (error) {\n    return undefined;\n    context = `Project profile could not be measured"],
  ['the output names another event', H, "hookEventName: 'SessionStart', additionalContext: context", "hookEventName: 'UserPromptSubmit', additionalContext: context"],
  ['importing the hook runs it', H, 'runWhenMain(import.meta.url, hookMain(sessionStartOutput, readInput));', 'hookMain(sessionStartOutput, readInput)();'],
  ['the hook never runs as the main process', H, 'runWhenMain(import.meta.url, hookMain(sessionStartOutput, readInput));', ''],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['project-profile', 'fleet-kit/lib', 'gates-kit'],
  selftest: 'project-profile/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000,
});

process.exit(survivors === 0 ? 0 : 1);
