#!/usr/bin/env node
/**
 * The decisions of where a selftest runs and what counts as an escape from its sandbox, each broken once, that
 * `sandbox.selftest.mjs` must catch. The campaign runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 * A mutant is never deleted or softened to get a clean campaign: a survivor is a missing assertion.
 *
 * @es Las decisiones de dónde corre un selftest y qué cuenta como fuga de su sandbox, rotas una a una, que
 * `sandbox.selftest.mjs` debe cazar. Un mutante nunca se borra ni se ablanda: un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const RUN = 'selftest-runner/run.mjs';
const SANDBOX = 'selftest-runner/sandbox.mjs';
const VERDICT = 'selftest-runner/sandbox-verdict.mjs';
const TREE = 'selftest-runner/tree-status.mjs';

const MUTANTS = [
  // The runner's wiring / El cableado del runner
  ['the child runs in the runner environment, not its sandbox', RUN, 'const env = sandboxEnv(sandbox, { base: process.env, tree: root, gitDir });', 'const env = process.env;'],
  ['the tree named to the child is the runner cwd', RUN, 'sandboxEnv(sandbox, { base: process.env, tree: root, gitDir })', 'sandboxEnv(sandbox, { base: process.env, tree: process.cwd(), gitDir })'],
  ['the sandbox is left behind', RUN, '    removeSandbox(sandbox);\n', ''],
  ['every selftest shares one sandbox', RUN, 'const sandbox = createSandbox();', 'const sandbox = (globalThis.sharedSandbox ??= createSandbox());'],
  [
    'the tree is read "before" the selftest only after it ran',
    RUN,
    '    const treeBefore = treeStatus(root);\n    const checkoutBefore = mainCheckout === undefined ? undefined : treeStatus(mainCheckout);\n    const failure = await exitOf({ root, entry, timeoutMs, spawn, env });',
    '    const checkoutBefore = mainCheckout === undefined ? undefined : treeStatus(mainCheckout);\n    const failure = await exitOf({ root, entry, timeoutMs, spawn, env });\n    const treeBefore = treeStatus(root);',
  ],
  ['the tree after the selftest is the tree before it', RUN, 'const treeAfter = treeStatus(root);', 'const treeAfter = treeBefore;'],
  ['a selftest that escaped but exited 0 is green', RUN, 'if (outcome.failure === null && outcome.escapes.length === 0) {', 'if (outcome.failure === null) {'],
  ['the escaped paths are not printed', RUN, '    lines.push(...escapeLines(escapes));\n', ''],
  ['an escape line names no path', RUN, '{ path: escape.path })}`);', '{ path: \'\' })}`);'],
  ['the escape count is not printed', RUN, "    lines.push(`    ${speaker.line('escaped', { count: escapes.length })}`);\n", ''],
  ['an unreadable tree crashes the run instead of stopping it as not measured', RUN, 'if (!(error instanceof TreeStatusError)) throw error;\n        unreadable', 'throw error;\n        unreadable'],
  ['an unreadable tree around a parallel batch crashes the run', RUN, 'if (!(error instanceof TreeStatusError)) throw error;\n      return stopped(error.tree, PARALLEL_BATCH, error.reason);\n    }\n    if (leaked', 'throw error;\n      return stopped(error.tree, PARALLEL_BATCH, error.reason);\n    }\n    if (leaked'],
  ['the reason a tree stopped the run does not close the report', RUN, 'report: [...report, notMeasured], notMeasured };', 'report, notMeasured };'],
  ['an unreadable tree is reported as a red run', RUN, 'return { exitCode: EXIT_NOT_MEASURED, report: [...report, notMeasured], notMeasured };', 'return { exitCode: EXIT_RED, report: [...report, notMeasured], notMeasured };'],
  // What a child is given / Qué recibe el hijo
  ['USERPROFILE is not pointed at the sandbox home', SANDBOX, "const HOME_VARIABLES = ['HOME', 'USERPROFILE'];", "const HOME_VARIABLES = ['HOME'];"],
  ['HOME is not pointed at the sandbox home', SANDBOX, "const HOME_VARIABLES = ['HOME', 'USERPROFILE'];", "const HOME_VARIABLES = ['USERPROFILE'];"],
  ['TMP is not pointed at the private temp', SANDBOX, "const TEMP_VARIABLES = ['TMP', 'TEMP', 'TMPDIR'];", "const TEMP_VARIABLES = ['TEMP', 'TMPDIR'];"],
  ['TEMP is not pointed at the private temp', SANDBOX, "const TEMP_VARIABLES = ['TMP', 'TEMP', 'TMPDIR'];", "const TEMP_VARIABLES = ['TMP', 'TMPDIR'];"],
  ['TMPDIR is not pointed at the private temp', SANDBOX, "const TEMP_VARIABLES = ['TMP', 'TEMP', 'TMPDIR'];", "const TEMP_VARIABLES = ['TMP', 'TEMP'];"],
  ['HOOK_CLAUDE_HOME is not pointed at the sandbox', SANDBOX, '  setVariable(env, CLAUDE_HOME_VARIABLE, sandbox.claudeHome);\n', ''],
  ['HOOK_STATE_DIR is not pointed at the sandbox', SANDBOX, '  setVariable(env, STATE_ROOT_VARIABLE, sandbox.state);\n', ''],
  ['SELFTEST_TREE is not set', SANDBOX, '  setVariable(env, TREE_VARIABLE, path.resolve(tree));\n', ''],
  ['SELFTEST_TREE is not made absolute', SANDBOX, 'setVariable(env, TREE_VARIABLE, path.resolve(tree));', 'setVariable(env, TREE_VARIABLE, tree);'],
  ['SELFTEST_FLEET is not set', SANDBOX, '  setVariable(env, FLEET_VARIABLE, FLEET_ROOT);\n', ''],
  ['SELFTEST_GIT_DIR is never set', SANDBOX, '  setVariable(env, GIT_DIR_VARIABLE, gitDir === undefined ? undefined : path.resolve(gitDir));\n', ''],
  ['SELFTEST_GIT_DIR is handed over as given, not absolute', SANDBOX, 'path.resolve(gitDir));', 'gitDir);'],
  ['an inherited SELFTEST_GIT_DIR survives a run without --git-dir', SANDBOX, 'gitDir === undefined ? undefined :', 'gitDir === undefined ? base[GIT_DIR_VARIABLE] :'],
  ['SELFTEST_GIT_DIR is left as the literal text "undefined" when there is no git dir', SANDBOX, 'if (value !== undefined) env[name] = value;', 'env[name] = String(value);'],
  ['SELFTEST_FLEET names the sandbox home instead of the fleet', SANDBOX, 'setVariable(env, FLEET_VARIABLE, FLEET_ROOT);', 'setVariable(env, FLEET_VARIABLE, sandbox.claudeHome);'],
  ['SELFTEST_FLEET names the runner directory, not the fleet above it', SANDBOX, "const FLEET_ROOT = path.resolve(import.meta.dirname, '..');", 'const FLEET_ROOT = import.meta.dirname;'],
  ['a variable spelled in another case is left beside the new one', SANDBOX, 'if (key.toUpperCase() === name) delete env[key];', 'if (key.toUpperCase() === name) void env[key];'],
  ['the state root lives inside the home', SANDBOX, "state: path.join(root, 'state-root')", "state: path.join(home, 'state-root')"],
  ["Node's compile cache stays on in the child", SANDBOX, "  setVariable(env, COMPILE_CACHE_OFF, '1');\n", ''],
  ['the empty .claude is not created', SANDBOX, '[sandbox.claudeHome, sandbox.state, sandbox.temp]', '[sandbox.state, sandbox.temp]'],
  ['the private temp is not created', SANDBOX, '[sandbox.claudeHome, sandbox.state, sandbox.temp]', '[sandbox.claudeHome, sandbox.state]'],
  ['removing a sandbox removes only its temp', SANDBOX, 'rmSync(sandbox.root, { recursive: true, force: true });', 'rmSync(sandbox.temp, { recursive: true, force: true });'],
  // What is an escape / Qué es una fuga
  ['the home is not looked at', VERDICT, 'return [...homeEscapes(sandbox), ...tempEscapes(sandbox)];', 'return [...tempEscapes(sandbox)];'],
  ['the temp is not looked at', VERDICT, 'return [...homeEscapes(sandbox), ...tempEscapes(sandbox)];', 'return [...homeEscapes(sandbox)];'],
  ['the tree is not looked at', VERDICT, "return [...statusEscapes('tree', tree, treeBefore, treeAfter), ...inCheckout];", 'return [...inCheckout];'],
  ['the temp is listed before the home', VERDICT, 'return [...homeEscapes(sandbox), ...tempEscapes(sandbox)];', 'return [...tempEscapes(sandbox), ...homeEscapes(sandbox)];'],
  ['a selftest run one at a time loses its sandbox verdict', VERDICT, 'return [...sandboxEscapes(sandbox), ...treeEscapes({ tree, treeBefore, treeAfter, checkout })];', 'return [...treeEscapes({ tree, treeBefore, treeAfter, checkout })];'],  ['the empty .claude itself is an escape', VERDICT, '.filter((relative) => relative !== CLAUDE_FOLDER)', '.filter(() => true)'],
  ['a removed .claude is not an escape', VERDICT, 'if (lstatSync(sandbox.claudeHome, { throwIfNoEntry: false })?.isDirectory() !== true) {', 'if (false) {'],
  ['an empty directory is not named', VERDICT, 'leaves.push(...(children.length > 0 ? children : [relative]));', 'leaves.push(...(children.length > 0 ? children : lstatSync(full).isDirectory() ? [] : [relative]));'],
  ['a directory is named instead of its contents', VERDICT, 'leaves.push(...(children.length > 0 ? children : [relative]));', 'leaves.push(relative);'],
  ['a link is entered', VERDICT, "import { lstatSync, readdirSync } from 'node:fs';", "import { statSync as lstatSync, readdirSync } from 'node:fs';"],
  ['the leftovers are listed in the order the disk gives them', VERDICT, 'readdirSync(directory).sort()', 'readdirSync(directory)'],
  ['a home escape loses its ~/ prefix', VERDICT, "path: `~/${relative}`", 'path: relative'],
  ['a temp escape loses its $TMP/ prefix', VERDICT, "path: `$TMP/${relative}`", 'path: relative'],
  // What git lists / Lo que lista git
  // The main checkout of a linked worktree / El checkout principal de un worktree enlazado
  ['the main checkout is not looked at', VERDICT, '...statusEscapes(\'tree\', tree, treeBefore, treeAfter), ...inCheckout];', '...statusEscapes(\'tree\', tree, treeBefore, treeAfter)];'],
  ['the main checkout is listed before the tree', VERDICT, '...statusEscapes(\'tree\', tree, treeBefore, treeAfter), ...inCheckout];', '...inCheckout, ...statusEscapes(\'tree\', tree, treeBefore, treeAfter)];'],
  ['a main-checkout escape is reported as the tree\'s', VERDICT, "statusEscapes('checkout', checkout.top,", "statusEscapes('tree', checkout.top,"],
  ['a tree or main-checkout escape is named relative to its checkout', VERDICT, 'path: path.join(top, relative)', 'path: relative'],
  ['a linked worktree has no main checkout', TREE, 'return realpathSync.native(main) === realpathSync.native(tree) ? undefined : main;', 'return undefined;'],
  ['the main checkout run as the tree is watched twice', TREE, 'return realpathSync.native(main) === realpathSync.native(tree) ? undefined : main;', 'return main;'],
  ['a bare repository is taken for a main checkout', TREE, "if (main === undefined || lines.includes('bare')) return undefined;", 'if (main === undefined) return undefined;'],
  ['a worktree listing git refused reads as no main checkout', TREE, 'if (listed.error || listed.status !== 0) throw', 'if (false) throw'],
  ['the main checkout after the selftest is the one before it', RUN, 'after: treeStatus(mainCheckout) }', 'after: checkoutBefore }'],
  ['the main checkout is read "before" only after the selftest ran', RUN, 'before: checkoutBefore,', 'before: treeStatus(mainCheckout),'],
  ['a staged rename is paired', TREE, "'--no-renames', ", ''],
  ['a new untracked directory is listed as one entry', TREE, "'--untracked-files=all'", "'--untracked-files=normal'"],
  ['a file touched again while dirty is not a change', TREE, '`${entry.slice(0, 2)}|${signatureOf(path.join(tree, entry.slice(3)))}`', '`${entry.slice(0, 2)}`'],
  ['a status change with the same bytes is not a change', TREE, '`${entry.slice(0, 2)}|${signatureOf(path.join(tree, entry.slice(3)))}`', '`${signatureOf(path.join(tree, entry.slice(3)))}`'],
  ['a git failure reads as a clean tree', TREE, 'if (result.error || result.status !== 0) throw', 'if (false) throw'],
  ['an added path is not a change', TREE, "    if (!before.has(entry)) changes.push({ path: entry, change: 'added' });\n    else if", '    if (!before.has(entry)) continue;\n    else if'],
  ['a changed path is not a change', TREE, "    else if (before.get(entry) !== signature) changes.push({ path: entry, change: 'changed' });\n", ''],
  ['a path no longer listed is not a change', TREE, "if (!after.has(entry)) changes.push({ path: entry, change: 'removed' });", 'void entry;'],
  ['the tree changes are not sorted', TREE, 'return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));', 'return changes;'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['selftest-runner', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'selftest-runner/sandbox.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
