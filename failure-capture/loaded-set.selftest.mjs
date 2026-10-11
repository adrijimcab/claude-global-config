#!/usr/bin/env node
/**
 * Proof of `loaded-set.mjs`: which instruction files the harness loads for a home and a project root, in
 * which order, with which lengths. Every tree is constructed here in a temporary directory and walked with a
 * `ceiling` so it never climbs into the real home; every expected path, length and order is written out by
 * hand. A wrong set means the budget is measured on files the harness does not load, or misses ones it does.
 *
 * @es Prueba de `loaded-set.mjs`: qué ficheros de instrucciones carga el harness para un home y una raíz de
 * proyecto, en qué orden y con qué largos. Cada árbol se construye aquí en un directorio temporal y se recorre
 * con un `ceiling` para no subir nunca al home real; cada ruta, largo y orden esperado se escribe a mano. Un
 * conjunto errado mide el presupuesto sobre ficheros que el harness no carga, o pierde los que sí.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadedSet } from './loaded-set.mjs';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'loaded-set-selftest-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
let passed = 0;
let worlds = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** A temporary tree made of `{ 'relative/path': text }`; answers its root. @es Un árbol temporal hecho de `{ 'ruta': texto }`; responde su raíz. */
function world(files) {
  worlds += 1;

  const root = path.join(scratch, `w${worlds}`);

  for (const [relative, text] of Object.entries(files)) {
    const full = path.join(root, relative);

    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }

  return { root, home: path.join(root, 'home') };
}

const relativeTo = (root, file) => path.relative(root, file).split(path.sep).join('/');
const listing = (root, result) => result.files.map((file) => [relativeTo(root, file.path), file.raw, file.counted]);
const names = (root, result) => result.files.map((file) => relativeTo(root, file.path));

// --- the full order, on one tree: user files, user rules, then each directory from the ceiling down
{
  const { root, home } = world({
    'home/.claude/CLAUDE.md': 'UC\n@~/.claude/extra.md\n',
    'home/.claude/extra.md': 'EX\n',
    'home/.claude/rules/b.md': 'B\n',
    'home/.claude/rules/a.md': 'A\n',
    'home/.claude/rules/sub/c.md': 'C\n',
    'home/.claude/rules/note.txt': 'T\n',
    'home/.claude/rules/empty.md': '  \n',
    'home/.claude/rules/scoped.md': '---\npaths: src/**\n---\nS\n',
    'CLAUDE.md': 'OUT\n',
    'top/CLAUDE.md': 'T0\n',
    'top/mid/.claude/CLAUDE.md': 'M1\n',
    'top/mid/proj/CLAUDE.md': '<!-- c -->\nP0\n',
    'top/mid/proj/.claude/CLAUDE.md': 'P1\n',
    'top/mid/proj/.claude/rules/r.md': 'R\n',
    'top/mid/proj/CLAUDE.local.md': 'L\n',
  });
  const result = loadedSet({ home, projectRoot: path.join(root, 'top/mid/proj'), ceiling: path.join(root, 'top') });

  check('the loaded set, in order, with raw and counted lengths', listing(root, result), [
    ['home/.claude/CLAUDE.md', 23, 23],
    ['home/.claude/extra.md', 3, 3],
    ['home/.claude/rules/a.md', 2, 2],
    ['home/.claude/rules/b.md', 2, 2],
    ['home/.claude/rules/sub/c.md', 2, 2],
    ['top/CLAUDE.md', 3, 3],
    ['top/mid/.claude/CLAUDE.md', 3, 3],
    ['top/mid/proj/CLAUDE.md', 14, 3],
    ['top/mid/proj/.claude/CLAUDE.md', 3, 3],
    ['top/mid/proj/.claude/rules/r.md', 2, 2],
    ['top/mid/proj/CLAUDE.local.md', 2, 2],
  ]);
  check('the raw total', result.rawTotal, 59);
  check('the counted total', result.countedTotal, 48);
  check('nothing is reported missing when only optional files are absent', result.missing, []);
}

// --- rules that name paths are not loaded at session start, every other rule shape is
{
  const { root, home } = world({
    'home/.claude/rules/scoped-inline.md': '---\npaths: src/**\n---\nx\n',
    'home/.claude/rules/scoped-list.md': '---\npaths:\n  - src/**\n  - docs\n---\nx\n',
    'home/.claude/rules/star-only.md': '---\npaths: "**"\n---\nx\n',
    'home/.claude/rules/star-list.md': "---\npaths:\n  - '**'\n---\nx\n",
    'home/.claude/rules/empty-paths.md': '---\npaths:\n---\nx\n',
    'home/.claude/rules/mixed.md': "---\npaths: '**', lib\n---\nx\n",
    'home/.claude/rules/rootglob.md': '---\npaths: /**\n---\nx\n',
    'home/.claude/rules/other-key.md': '---\ndescription: paths: a\n---\nx\n',
    'home/.claude/rules/nested-key.md': '---\nmeta:\n  paths: a\n---\nx\n',
    'home/.claude/rules/no-frontmatter.md': 'x\n',
    'home/.claude/rules/list-elsewhere.md': '---\ntags:\n  - a\n---\nx\n',
    'home/.claude/rules/list-after.md': "---\npaths:\n  - '**'\ntags:\n  - a\n---\nx\n",
    'home/.claude/rules/unterminated.md': "---\npaths: '***\n---\nx\n",
    'proj/CLAUDE.md': '---\npaths: a\n---\nx\n',
  });
  const result = loadedSet({ home, projectRoot: path.join(root, 'proj'), ceiling: root });

  check('only path-scoped rules are left out; a scoped CLAUDE.md is still loaded', names(root, result), [
    'home/.claude/rules/empty-paths.md',
    'home/.claude/rules/list-after.md',
    'home/.claude/rules/list-elsewhere.md',
    'home/.claude/rules/nested-key.md',
    'home/.claude/rules/no-frontmatter.md',
    'home/.claude/rules/other-key.md',
    'home/.claude/rules/rootglob.md',
    'home/.claude/rules/star-list.md',
    'home/.claude/rules/star-only.md',
    'proj/CLAUDE.md',
  ]);
}

// --- a project under the home: the home's files are loaded once
{
  const { root, home } = world({ 'home/.claude/CLAUDE.md': 'U\n', 'home/.claude/rules/a.md': 'A\n', 'home/CLAUDE.md': 'H\n', 'home/proj/CLAUDE.md': 'P\n' });
  const result = loadedSet({ home, projectRoot: path.join(root, 'home/proj'), ceiling: root });

  check('the home files reached again as ancestors are not listed twice', names(root, result), ['home/.claude/CLAUDE.md', 'home/.claude/rules/a.md', 'home/CLAUDE.md', 'home/proj/CLAUDE.md']);
}

// --- imports: cycle, dedupe against a top-level file, relative resolution, missing, empty
{
  const { root, home } = world({
    'home/.keep': '',
    'proj/CLAUDE.md': '@x.md\n@.claude/CLAUDE.md\n',
    'proj/x.md': '@y.md\n',
    'proj/y.md': '@x.md @CLAUDE.md\n',
    'proj/.claude/CLAUDE.md': 'P1\n',
  });
  const result = loadedSet({ home, projectRoot: path.join(root, 'proj'), ceiling: root });

  check('a cycle and a file reached twice are each listed once, at the first import', names(root, result), ['proj/CLAUDE.md', 'proj/x.md', 'proj/y.md', 'proj/.claude/CLAUDE.md']);
  check('a cycle reports nothing missing', result.missing, []);
}

{
  const { root, home } = world({ 'proj/CLAUDE.md': '@gone.md @here.md @sub/i.md\n', 'proj/here.md': 'h\n', 'proj/sub/i.md': '@j.md\n', 'proj/sub/j.md': 'j\n' });
  const result = loadedSet({ home, projectRoot: path.join(root, 'proj'), ceiling: root });

  check('a missing import does not stop the others, and an import resolves against its own file', names(root, result), ['proj/CLAUDE.md', 'proj/here.md', 'proj/sub/i.md', 'proj/sub/j.md']);
  check('a missing import is reported with its importer', result.missing.map((gap) => [relativeTo(root, gap.file), relativeTo(root, gap.importedBy)]), [['proj/gone.md', 'proj/CLAUDE.md']]);
}

{
  const { root, home } = world({ 'proj/CLAUDE.md': '@e.md @f.md\n', 'proj/e.md': '<!-- @g.md -->\n', 'proj/f.md': 'f\n', 'proj/g.md': 'g\n' });
  const result = loadedSet({ home, projectRoot: path.join(root, 'proj'), ceiling: root });

  check('a file with no content is neither listed nor followed', names(root, result), ['proj/CLAUDE.md', 'proj/f.md']);
}

// --- depth: the top file and four levels of imports
{
  const chain = { 'proj/CLAUDE.md': '@d1.md\n' };

  for (let level = 1; level <= 6; level += 1) chain[`proj/d${level}.md`] = level < 6 ? `@d${level + 1}.md\n` : 'end\n';

  const { root, home } = world(chain);
  const result = loadedSet({ home, projectRoot: path.join(root, 'proj'), ceiling: root });

  check('the chain stops after four levels of imports', names(root, result), ['proj/CLAUDE.md', 'proj/d1.md', 'proj/d2.md', 'proj/d3.md', 'proj/d4.md']);
  check('a file past the depth limit is not reported missing', result.missing, []);
}

// --- listing order: code-unit order, not the filesystem's (NTFS lists `a.md` before `B.md`)
{
  const { root, home } = world({ 'home/.claude/rules/B.md': 'b\n', 'home/.claude/rules/a.md': 'a\n' });
  const result = loadedSet({ home, projectRoot: path.join(root, 'proj'), ceiling: root });

  check('rules are listed in code-unit order', names(root, result), ['home/.claude/rules/B.md', 'home/.claude/rules/a.md']);
}

// --- the same path in two cases is one file where the filesystem ignores case, two elsewhere
{
  const { root, home } = world({ 'proj/CLAUDE.md': '@x.md @X.md\n', 'proj/x.md': 'x\n' });
  const result = loadedSet({ home, projectRoot: path.join(root, 'proj'), ceiling: root });

  check('a path spelled in two cases is one file on Windows', [result.files.length, result.missing.length], process.platform === 'win32' ? [2, 0] : [2, 1]);
}

// --- nothing at all
{
  const { root, home } = world({ 'proj/.keep': '' });
  const result = loadedSet({ home, projectRoot: path.join(root, 'proj'), ceiling: root });

  check('an empty world has no files, no gaps and zero totals', [result.files, result.missing, result.rawTotal, result.countedTotal], [[], [], 0, 0]);
}

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture loaded set selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
