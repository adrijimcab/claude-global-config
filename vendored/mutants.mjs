#!/usr/bin/env node
/**
 * The decisions of `vendored.mjs` (the `sync` and `check` command line over the vendored modules), of
 * `provenance.mjs` (the findings `check` prints) and of `duplicates.mjs`, each broken once, that `selftest.mjs`
 * must catch. The runner lives in `../mutation-proof/run-mutants.mjs` and
 * mutates a COPY. The list of vendored paths is DATA, not a decision, so it is not mutated: the selftest
 * reads it from the module under test, and a second copy of it there would only detect change.
 * @es Las decisiones de `vendored.mjs` (la línea de órdenes `sync`/`check`), de `provenance.mjs` y de
 * `duplicates.mjs`, rotas una a una, que
 * `selftest.mjs` debe cazar. La lista de rutas vendorizadas es DATO, no decisión, así que no se muta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const VENDORED = 'vendored/vendored.mjs';
const DUPLICATES = 'vendored/duplicates.mjs';
const PROVENANCE = 'vendored/provenance.mjs';

const MUTANTS = [
  // --- WHERE: which roots the command line copies between.
  ['the copies land beside the script instead of under the install root', VENDORED, "const TARGET_ROOT = path.resolve(HERE, '..');", 'const TARGET_ROOT = HERE;'],
  ['the reference fleet is looked up in the wrong folders', VENDORED, "Object.freeze(['Desktop', 'Projects', 'b100-am-ui', '.claude'])", "Object.freeze(['Projects', 'Desktop', 'b100-am-ui', '.claude'])"],
  ['the provenance record is written to another file', VENDORED, 'path.join(HERE, RECORD_FILE_NAME)', "path.join(HERE, 'PROVENANCE.txt')"],

  // --- SYNC: what it copies and what it records.
  ['sync copies nothing', VENDORED, 'copyFileSync(path.join(SOURCE_ROOT, relative), target);', "writeFileSync(target, '');"],
  ['sync does not create the folder of a nested module', VENDORED, '    mkdirSync(path.dirname(target), { recursive: true });\n', ''],
  ['sync records a made-up hash', VENDORED, 'return { path: relative, sha256: sha256Of(target) };', "return { path: relative, sha256: 'x' };"],
  ['sync records the wrong source root', VENDORED, 'JSON.stringify({ sourceRoot: SOURCE_ROOT_RECORDED,', 'JSON.stringify({ sourceRoot: SOURCE_ROOT,'],
  ['sync stops reporting in Spanish', VENDORED, ' @es ${files.length} módulo(s) vendorizado(s) desde ${SOURCE_ROOT}', ''],

  // --- CHECK: which findings fail it.
  ['check compares the copies against themselves instead of the reference fleet', VENDORED, '{ vendorRoot: TARGET_ROOT, sourceRoot: SOURCE_ROOT }', '{ vendorRoot: TARGET_ROOT, sourceRoot: TARGET_ROOT }'],
  ['check never fails', VENDORED, 'return failures.length === 0 ? 0 : 1;', 'return 0;'],
  ['check prints failures before the notes', VENDORED, '[...notes, ...failures]', '[...failures, ...notes]'],
  ['check stops reporting in Spanish', VENDORED, ' @es procedencia: ${record.files.length} módulo(s) vendorizado(s), ${failures.length} fallo(s)', ''],

  // --- PROVENANCE: the hash, and what each state of a vendored module means.
  ['the hash is SHA-1', PROVENANCE, "createHash('sha256')", "createHash('sha1')"],
  ['the hash is printed as base64', PROVENANCE, ".digest('hex')", ".digest('base64')"],
  ['a missing copy is not reported', PROVENANCE, 'if (!existsSync(vendored)) failures.push(', 'if (false) failures.push('],
  ['an edited copy is read as untouched', PROVENANCE, 'else if (sha256Of(vendored) !== sha256) failures.push(', 'else if (sha256Of(vendored) === sha256) failures.push('],
  ['an absent source is a failure-free silence', PROVENANCE, 'if (!existsSync(source)) notes.push(', 'if (existsSync(source)) notes.push('],
  ['a source that moved on is read as unchanged', PROVENANCE, 'else if (sha256Of(source) !== sha256) failures.push(', 'else if (sha256Of(source) === sha256) failures.push('],
  ['the missing-copy line stops being bilingual', PROVENANCE, ' @es FALTA EN EL KIT', ''],
  ['the edited-copy line stops being bilingual', PROVENANCE, ' @es EDITADO EN EL KIT', ''],
  ['the absent-source line stops being bilingual', PROVENANCE, ' @es fuente ausente', ''],
  ['the moved-source line stops being bilingual', PROVENANCE, ' @es la fuente avanzó: correr vendored/vendored.mjs sync y luego los selftests', ''],
  ['the moved-source line stops naming the re-sync', PROVENANCE, ' — run vendored/vendored.mjs sync, then the selftests', ''],

  // --- UNDECLARED DUPLICATES: what `check` reports besides the declared modules.
  ['check reports no duplicate', VENDORED, 'failures.push(finding)', 'void finding'],
  ['check treats nothing as declared: every vendored module is a duplicate', VENDORED, 'declared: VENDORED })', 'declared: [] })'],
  ['check looks for duplicates against itself instead of the reference fleet', VENDORED, 'installRoot: TARGET_ROOT, sourceRoot: SOURCE_ROOT, declared', 'installRoot: TARGET_ROOT, sourceRoot: TARGET_ROOT, declared'],
  ['the duplicate finding stops saying what to do', DUPLICATES, ' — declare it vendored or make the copies diverge on purpose', ''],
  ['the duplicate finding stops being bilingual', DUPLICATES, ' @es DUPLICADO SIN PROCEDENCIA: declararlo vendorizado o hacer que las copias diverjan a propósito', ''],
  ['an absent reference fleet is walked and crashes', DUPLICATES, 'if (!existsSync(sourceRoot)) return [];', ''],
  ['modules of every extension count as duplicates', DUPLICATES, 'relative.endsWith(MODULE_EXTENSION) && !declared', '!declared'],
  ['a declared module is a duplicate too', DUPLICATES, ' && !declared.includes(relative)', ''],
  ['a module missing from the install is read as a copy', DUPLICATES, 'existsSync(path.join(installRoot, relative)) && sha256Of', 'sha256Of'],
  ['copies that diverge are duplicates too: the bytes are never compared', DUPLICATES, ' && sha256Of(path.join(installRoot, relative)) === sha256Of(path.join(sourceRoot, relative))', ''],
  ['only copies that DIFFER are reported', DUPLICATES, 'sha256Of(path.join(installRoot, relative)) === sha256Of', 'sha256Of(path.join(installRoot, relative)) !== sha256Of'],
  ['what another record pins is a duplicate too', DUPLICATES, "    .filter((relative) => !isPinnedElsewhere(installRoot, relative))\n", ''],
  ['a record pins relative to the install root instead of its own folder', DUPLICATES, "parts.slice(depth).join('/'))) return true;", 'relative)) return true;'],
  ['a record is read only at the install root', DUPLICATES, 'depth < parts.length - 1', 'depth < 1'],
  ['a record in the folder of the module itself is not read', DUPLICATES, 'let depth = 0; depth < parts.length - 1', 'let depth = 0; depth < parts.length - 2'],
  ['a record is read from the wrong folder: the module\'s own path', DUPLICATES, "recordPins(root, parts.slice(0, depth).join('/'),", "recordPins(root, parts.slice(0, depth + 1).join('/'),"],
  ['a record that cannot be read crashes the check', DUPLICATES, '    return files.some((entry) => entry?.path === rest);\n  } catch {\n    return false;\n  }', '    return files.some((entry) => entry?.path === rest);\n  } catch (error) {\n    throw error;\n  }'],
  ['an entry without a path crashes the check', DUPLICATES, 'entry?.path === rest', 'entry.path === rest'],
  ['the findings are not sorted', DUPLICATES, "    .sort();\n", ';\n'],
  ['the record is looked for under another name', DUPLICATES, "export const RECORD_FILE_NAME = 'PROVENANCE.json';", "export const RECORD_FILE_NAME = 'PROVENANCE.txt';"],

  // --- THE REFERENCE FLEET IS READ THROUGH ITS GIT INDEX, never by walking its directory.
  ['the reference fleet is no longer listed', DUPLICATES, 'walk = trackedFiles }', 'walk = () => [] }'],
  ['the node_modules folder is read', DUPLICATES, "new Set(['node_modules', 'worktrees'])", "new Set(['worktrees'])"],
  ['the worktrees folder is read', DUPLICATES, "new Set(['node_modules', 'worktrees'])", "new Set(['node_modules'])"],
  ['a file inside an unread folder still counts', DUPLICATES, ' && !isInsideUnwalkedFolder(relative)', ''],
  ['a tracked entry that is not a regular file on disk still counts', DUPLICATES, ' && isRegularFile(path.join(sourceRoot, relative))', ''],
  ['a link or folder is read as a regular file', DUPLICATES, 'return lstatSync(file).isFile();', 'return true;'],
  ['a tree that cannot be listed is read as having no duplicates', DUPLICATES, 'return [`DUPLICATES NOT CHECKED  ${error.message}`];', 'return [];'],
  ['the unlisted-tree finding loses its name', DUPLICATES, 'DUPLICATES NOT CHECKED  ', ''],
  ['the findings are not turned into their lines', DUPLICATES, '.map(duplicateFinding);', '.map(String);'],

  // --- THE COMMAND LINE: how it is dispatched.
  ['sync is never recognised', VENDORED, "if (command === 'sync') return sync();", "if (command === 'syncx') return sync();"],
  ['check is never recognised', VENDORED, "if (command === 'check') return check();", "if (command === 'checkx') return check();"],
  ['an unknown command exits 0', VENDORED, '  return 2;\n}', '  return 0;\n}'],
  ['the usage line stops being bilingual', VENDORED, ' @es uso: vendored.mjs check | sync', ''],
  ['importing the module runs a command', VENDORED, 'path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))', 'true'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['vendored', 'hook-state'],
  selftest: 'vendored/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
