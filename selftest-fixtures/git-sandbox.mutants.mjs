#!/usr/bin/env node
/**
 * The decisions of `selftest-fixtures/git-sandbox.mjs`, each broken once, that `git-sandbox.selftest.mjs`
 * must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes
 * a mutant that only crashes the selftest count as a survivor.
 *
 * Both directions: mutants that let git escape the sandbox or read the machine's own configuration, and
 * mutants that make cleanup follow a link or leave something behind.
 *
 * @es Las decisiones de `git-sandbox.mjs`, rotas una a una, que `git-sandbox.selftest.mjs` debe detectar.
 * Ambas direcciones: las que dejan escapar a git del sandbox o leer la configuración de la máquina, y las
 * que hacen que la limpieza siga un enlace o deje algo atrás. Un mutante que solo hace caer el selftest cuenta
 * como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const G = 'selftest-fixtures/git-sandbox.mjs';

const MUTANTS = [
  // --- the ceiling ---
  ['the ceiling is not set', G, 'GIT_CEILING_DIRECTORIES: ceiling,', ''],
  ['the ceiling is the sandbox root, not its parent', G, 'const env = sandboxEnvironment(root, ceiling);', 'const env = sandboxEnvironment(root, root);'],
  ['the ceiling is the parent as given, not its real path', G, 'ceiling = realpathSync.native(parent);', 'ceiling = parent;'],
  ['the sandbox is created in the system temp directory whatever the parent', G, "mkdtempSync(path.join(ceiling, 'git-sandbox-'))", "mkdtempSync(path.join(tmpdir(), 'git-sandbox-'))"],
  ['the default parent is the working directory, not the temp directory', G, 'parent = tmpdir()', 'parent = process.cwd()'],

  // --- the environment ---
  ['no repository selector is dropped', G, 'for (const name of REPOSITORY_SELECTORS) delete env[name];', ''],
  ['GIT_DIR is kept', G, "['GIT_DIR', 'GIT_WORK_TREE'", "['GIT_WORK_TREE'"],
  ['GIT_WORK_TREE is kept', G, ", 'GIT_WORK_TREE'", ''],
  ['GIT_INDEX_FILE is kept', G, ", 'GIT_INDEX_FILE'", ''],
  ['GIT_OBJECT_DIRECTORY is kept', G, ", 'GIT_OBJECT_DIRECTORY'", ''],
  ['GIT_COMMON_DIR is kept', G, ", 'GIT_COMMON_DIR']", ']'],
  ['the global configuration of the user is read', G, "GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'),", ''],
  ['the empty global configuration is not created', G, "writeFileSync(path.join(root, 'gitconfig'), '');", ''],
  ['the system configuration is read', G, "GIT_CONFIG_NOSYSTEM: '1',", ''],
  ['the author name is the machine one', G, 'GIT_AUTHOR_NAME: IDENTITY.name,', ''],
  ['the author email is the machine one', G, 'GIT_AUTHOR_EMAIL: IDENTITY.email,', ''],
  ['the committer name is the machine one', G, 'GIT_COMMITTER_NAME: IDENTITY.name,', ''],
  ['the committer email is the machine one', G, 'GIT_COMMITTER_EMAIL: IDENTITY.email', ''],
  ['the exposed environment is the process one', G, '    repoDir,\n    env,\n', '    repoDir,\n    env: process.env,\n'],
  ['git runs with the process environment, not the sandbox one', G, 'runGit(args, { cwd, env })', 'runGit(args, { cwd })'],

  // --- the repository ---
  ['the initial branch is whatever git defaults to', G, "['init', '-q', '-b', 'main', repoDir]", "['init', '-q', repoDir]"],
  ['the repository is the root itself, so a plain directory is inside it', G, "path.join(root, 'repo')", 'root'],
  ['the root is not named for what it is', G, "'git-sandbox-'", "'sandbox-'"],
  ['git runs in the root by default, not in the repository', G, '{ cwd = repoDir } = {}', '{ cwd = root } = {}'],
  ['a plain directory is created inside the repository', G, 'mkdirSync(path.join(root, name));', 'mkdirSync(path.join(repoDir, name));'],

  // --- failures ---
  ['a failed git init is ignored', G, 'if (init.status !== 0) {', 'if (false) {'],
  ['a failed git init leaves the sandbox behind', G, 'removeTree(root);\n\n    throw', 'throw'],
  ['a failed git init does not say why', G, "init.error?.message ?? (init.stderr ?? '').split('\\n')[0].trim()", "''"],
  ['a failed git init is explained by the second line of its text', G, ".split('\\n')[0].trim() }", ".split('\\n')[1].trim() }"],
  ['a failed git init keeps the carriage return', G, ".split('\\n')[0].trim() }", ".split('\\n')[0] }"],
  ['a failed git init with no text throws a TypeError', G, "(init.stderr ?? '').split", '(init.stderr).split'],
  ['the error of a git that cannot start is dropped', G, 'init.error?.message ?? ', ''],
  ['a missing parent leaks the raw error', G, "throw bilingualError('parentMissing', { parent });", "throw new Error('ENOENT');"],

  // --- cleanup ---
  ['links are followed and emptied instead of unlinked', G, 'if (entry.isSymbolicLink()) {\n      unlinkSync(entryPath);\n      links += 1;\n    } else if (entry.isDirectory()) {', 'if (false) {\n      unlinkSync(entryPath);\n      links += 1;\n    } else if (entry.isDirectory() || entry.isSymbolicLink()) {'],
  ['links are unlinked but not counted', G, 'links += 1;', ''],
  ['links are counted twice', G, 'links += 1;', 'links += 2;'],
  ['links inside subdirectories are not counted', G, 'links += removeTree(entryPath);', 'removeTree(entryPath);'],
  ['subdirectories are not descended', G, '} else if (entry.isDirectory()) {', '} else if (false) {'],
  ['files are not removed', G, '} else {\n      unlinkSync(entryPath);\n    }', '} else {\n    }'],
  ['the emptied directory is not removed', G, 'rmdirSync(directory);', ''],
  ['entries are read as names, not as typed entries', G, '{ withFileTypes: true }', '{}'],
  ['a second cleanup throws', G, "lstatSync(root, { throwIfNoEntry: false }) === undefined ? 0 : removeTree(root)", 'removeTree(root)'],
  ['cleanup reports no link whatever it removed', G, '=== undefined ? 0 : removeTree(root)', '=== undefined ? 0 : (removeTree(root), 0)'],

  // --- the message table ---
  ['a thrown text loses its Spanish half', G, 'return new Error(`${fill(MESSAGES[id].en)} @es ${fill(MESSAGES[id].es)}`);', 'return new Error(fill(MESSAGES[id].en));'],
  ['placeholders are not filled', G, 'String(params[name])', "'{' + name + '}'"],
  ['the missing-parent message loses its accent', G, 'no se puede crear un sandbox en él.', 'no se puede crear un sandbox en el.'],
  ['the failed-init message loses its accent', G, 'git init falló en', 'git init fallo en']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['selftest-fixtures'],
  selftest: 'selftest-fixtures/git-sandbox.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
