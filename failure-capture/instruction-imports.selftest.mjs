#!/usr/bin/env node
/**
 * Proof of `instruction-imports.mjs`: which files an instruction text imports with `@path`. Every expected path
 * is written out by hand from the importer's and the home's locations; no file is read. A wrong answer here
 * either misses a file the harness loads (the budget under-counts) or invents one it does not.
 *
 * @es Prueba de `instruction-imports.mjs`: qué ficheros importa un texto de instrucciones con `@ruta`. Cada ruta
 * esperada se escribe a mano desde la ubicación del importador y del home; no se lee ningún fichero. Un error
 * aquí omite un fichero que el harness carga (el presupuesto cuenta de menos) o inventa uno que no carga.
 */

import path from 'node:path';

import { importTargets } from './instruction-imports.mjs';

let passed = 0;
const failures = [];

const IMPORTER = path.resolve('/w/proj/CLAUDE.md');
const HOME = path.resolve('/h');
const at = (...parts) => path.resolve(...parts);

const CASES = [
  ['an import at the start of the text', '@other.md', [at('/w/proj/other.md')]],
  ['an import after a space', 'see @other.md now', [at('/w/proj/other.md')]],
  ['an @ glued to a word is not an import', 'mail me@other.md', []],
  ['a home import', '@~/docs/x.md', [at('/h/docs/x.md')]],
  ['a dot-slash import', '@./sub/y.md', [at('/w/proj/sub/y.md')]],
  ['a parent import', '@../up.md', [at('/w/up.md')]],
  ['an absolute import', '@/abs/z.md', [at('/abs/z.md')]],
  ['a lone slash is not an import', '@/', []],
  ['a second @ in the path is not allowed', '@@x.md', []],
  ['a fragment alone is not an import', '@#frag', []],
  ['a fragment after the path is cut', '@file.md#sec', [at('/w/proj/file.md')]],
  ['an escaped space stays in the path', 'with @my\\ file.md', [at('/w/proj/my file.md')]],
  ['a lone backslash ends the path', '@a\\b.md', [at('/w/proj/a')]],
  ['a fence line with an info string is not scanned', '``` @info.md\nx\n```', []],
  ['a backtick glued to an @ makes it no import', 'a `@c.md', []],
  ['a span closes only on a run of the same length', 'x `a`` @g.md ` y', []],
  ['a span skips a longer run inside it', 'x ``a``` @f.md `` y', []],
  ['a span does not close on a longer run, so its text is scanned', 'x ``a @s.md ``` y', [at('/w/proj/s.md')]],
  ['a longer opener does not close on a shorter run', 'x ``a` @p.md ` y', []],
  ['a percent sign cannot start a path', '@%x.md', []],
  ['a parenthesis cannot start a path', '@(x).md', []],
  ['a dash can start a path', '@-dash.md', [at('/w/proj/-dash.md')]],
  ['an inline code span is not scanned', 'use `see @inline.md` here', []],
  ['a double-backtick span holding a backtick is not scanned', 'x ``a ` @b.md `` y', []],
  ['an unclosed backtick is literal text', 'a ` @c.md', [at('/w/proj/c.md')]],
  ['text after a closed span is scanned', '`x` @d.md', [at('/w/proj/d.md')]],
  ['a fenced block is not scanned, the text after it is', '```\n@fenced.md\n```\n@after.md', [at('/w/proj/after.md')]],
  ['a tilde fence is not scanned', '~~~\n@fenced.md\n~~~\n', []],
  ['imports come once each, in order of first appearance', '@b.md @a.md @b.md', [at('/w/proj/b.md'), at('/w/proj/a.md')]],
  ['a non-text extension is not an import', '@image.png @x.PNG', []],
  ['a path without extension is an import', '@noext', [at('/w/proj/noext')]],
  ['an upper-case text extension is an import', '@UPPER.MD', [at('/w/proj/UPPER.MD')]],
  ['a trailing dot makes the extension a bare dot, which is not text', 'see @a.md.', []],
  ['an import in a top-level comment block is not scanned', '<!-- @hidden.md -->\n@shown.md', [at('/w/proj/shown.md')]],
  ['an import in the frontmatter is not scanned', '---\nk: @fm.md\n---\n@b.md', [at('/w/proj/b.md')]],
  ['no import', 'plain text', []],
  ['an empty text', '', []],
];

for (const [name, text, expected] of CASES) {
  // A throw is a value the check compares, so a broken module fails this case instead of aborting the selftest.
  // @es Un lanzamiento es un valor que el check compara, así un módulo roto falla este caso y no aborta el selftest.
  let actual;

  try {
    actual = importTargets(text, IMPORTER, HOME);
  } catch (error) {
    actual = `threw ${error instanceof Error ? error.message : String(error)}`;
  }

  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture instruction imports selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
