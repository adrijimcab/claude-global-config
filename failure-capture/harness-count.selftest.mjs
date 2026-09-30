#!/usr/bin/env node
/**
 * Proof of `harness-count.mjs`: how the harness counts an instruction file and what its limits are. Every
 * expectation is an exact number taken from a constructed text (or from the harness formula written out by
 * hand), never from the code under test. A wrong count here either hides an over-budget set (too low) or
 * raises a false alarm (too high).
 *
 * @es Prueba de `harness-count.mjs`: cómo cuenta el harness un fichero de instrucciones y cuáles son sus
 * límites. Cada expectativa es un número exacto sacado de un texto construido (o de la fórmula del harness
 * escrita a mano), nunca del código bajo prueba. Un recuento errado oculta un conjunto pasado de presupuesto
 * (si es bajo) o da una falsa alarma (si es alto).
 */

import { countedLength, countsTowardTotal, frontmatterOf, harnessLimits } from './harness-count.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (actual === expected) passed += 1;
  else failures.push(`${name} — expected ${String(expected)}, got ${String(actual)}`);
}

const COUNTS = [
  ['empty text counts nothing', '', 0],
  ['text without a comment counts all of it', 'abc\ndef\n', 8],
  ['a top-level one-line block is not counted', '# T\n<!-- hidden -->\nbody\n', 9],
  ['a top-level multi-line block is not counted', '<!--\nline\n-->\nafter', 5],
  ['an inline marker inside a list item is counted', '- [g] rule <!--fc:k#1-->\n', 25],
  ['a comment in the middle of a line is counted', 'text <!-- c --> more\n', 21],
  ['an indented comment is counted (upper bound)', '  <!-- c -->\n', 13],
  ['text after the closing mark on the same line is kept', '<!-- c --> tail\nx\n', 8],
  ['text after the closing mark on a later line is kept', '<!--\nx\n--> tail\nz\n', 8],
  ['a block that never closes is counted whole', '<!-- never closed\nbody\n', 23],
  ['blank lines after a block go with it', 'a\n<!-- c -->\n\n\nb\n', 4],
  ['two comments on the block line are both removed', '<!-- a --> x <!-- b -->\n', 4],
  ['two adjacent blocks are both removed', '<!-- a -->\n<!-- b -->\nz', 1],
  ['a block that leaves only spaces is dropped whole', '<!-- a -->   \nq', 1],
  ['a comment inside a backtick fence is counted', '```\n<!-- c -->\n```\n', 19],
  ['an unclosed fence runs to the end of the text', '```\n<!-- c -->\n', 15],
  ['a fence of the other character does not close it', '```\n~~~\n<!-- c -->\n```\n', 23],
  ['a shorter fence does not close a longer one', '````\n```\n<!-- c -->\n````\n', 25],
  ['a fence line with text after it does not close a fence', '```\n``` x\n<!-- c -->\n```\n', 25],
  ['two fence characters are not a fence', '``\n<!-- c -->\nq', 4],
  ['a comment indented one space is counted (upper bound)', ' <!-- c -->\n', 12],
  ['`<!-->` is a whole comment that is kept, and its block ends with its line', '<!-->\nx\n--> t\n', 14],
  ['`<!--->` is a whole comment that is kept, and its block ends with its line', '<!--->\nx\n--> t\n', 15],
  ['a comment whose body starts with a closing angle is removed whole', '<!--> x -->\n', 0],
  ['a comment opener with no closer after a removed comment stays', '<!-- a --> x <!-- b\n', 10],
  ['frontmatter is removed', '---\na: 1\n---\nbody\n', 5],
  ['frontmatter that never closes is counted whole', '---\na: 1\nbody\n', 14],
  ['an opener with text after it is not frontmatter', '--- x\na\n---\nb', 13],
  ['frontmatter must start the text', '\n---\na\n---\nb', 12],
  ['a bare opener is not frontmatter', '---   ', 6],
  ['three dashes alone are not frontmatter', '---', 3],
  ['blank lines after the closing mark go with the frontmatter', '---\na\n---\n\n\nb', 1],
  ['blank lines before the body of the frontmatter are part of it', '---\n\n\na\n---\nb', 1],
  ['the closing mark may sit at the end of a line of text', '---\na---\nb', 1],
  ['CRLF frontmatter is removed', '---\r\na\r\n---\r\nb', 1],
  ['a byte-order mark does not hide the frontmatter', '\uFEFF---\na\n---\nb', 1],
  ['a byte-order mark is kept when nothing is removed', '\uFEFFabc', 4],
  ['a byte-order mark is kept when the frontmatter never closes', '\uFEFF---\na\n', 7],
  ['a comment block after the frontmatter is removed too', '---\nx\n---\n<!-- c -->\nq', 1],
  ['a tilde fence protects a comment too', '~~~\n<!-- c -->\n~~~\n', 19],
  ['a fence indented four spaces is code, not a fence', '    ```\n<!-- c -->\n', 8],
  ['a fence indented three spaces is a fence', '   ```\n<!-- c -->\n', 18],
  ['a comment after a closed fence is removed again', '```\nx\n```\n<!-- c -->\nz', 11],
  ['CRLF text with a comment is counted without the CR', 'a\r\n<!-- c -->\r\nb\r\n', 4],
  ['a lone CR with a comment becomes a line break', 'a\r<!-- c -->\rb', 3],
  ['CRLF text without a comment keeps its CR', 'a\r\nb\r\n', 6],
];

for (const [name, text, expected] of COUNTS) check(name, countedLength(text), expected);

const FRONTMATTER = [
  ['the removed frontmatter is returned whole', '---\na: 1\n---\nbody\n', '---\na: 1\n---\n'],
  ['the blanks after the closing mark belong to it', '---\na\n---\n\n\nb', '---\na\n---\n\n\n'],
  ['a byte-order mark is not part of the frontmatter', '﻿---\na\n---\nb', '---\na\n---\n'],
  ['text without frontmatter has none', 'body\n', ''],
  ['frontmatter that never closes is none', '---\na: 1\n', ''],
];

for (const [name, text, expected] of FRONTMATTER) check(name, frontmatterOf(text), expected);

const LIMITS = [
  ['200k context at 3 chars per token', { contextTokens: 200_000, charsPerToken: 3 }, { perFile: 40_000, total: 120_000 }],
  ['200k context at 4 chars per token', { contextTokens: 200_000, charsPerToken: 4 }, { perFile: 40_000, total: 120_000 }],
  ['1M context at 3 chars per token', { contextTokens: 1_000_000, charsPerToken: 3 }, { perFile: 150_000, total: 150_000 }],
  ['1M context at 4 chars per token', { contextTokens: 1_000_000, charsPerToken: 4 }, { perFile: 200_000, total: 200_000 }],
  ['a size between the two rounds to the nearest char', { contextTokens: 333_333, charsPerToken: 3 }, { perFile: 50_000, total: 120_000 }],
  ['the per-file limit can sit above the total floor', { contextTokens: 500_000, charsPerToken: 3 }, { perFile: 75_000, total: 120_000 }],
  ['no context size falls back to 200k', { charsPerToken: 3 }, { perFile: 40_000, total: 120_000 }],
  ['a zero context size falls back to 200k', { contextTokens: 0, charsPerToken: 3 }, { perFile: 40_000, total: 120_000 }],
  ['a NaN context size falls back to 200k', { contextTokens: Number.NaN, charsPerToken: 3 }, { perFile: 40_000, total: 120_000 }],
  ['an infinite context size falls back to 200k', { contextTokens: Number.POSITIVE_INFINITY, charsPerToken: 3 }, { perFile: 40_000, total: 120_000 }],
  ['the 200k fallback is applied, not just its floor', { contextTokens: 0, charsPerToken: 5 }, { perFile: 50_000, total: 120_000 }],
  ['a fraction below one half rounds down', { contextTokens: 400_002, charsPerToken: 3 }, { perFile: 60_000, total: 120_000 }],
  ['no chars per token falls back to 3', { contextTokens: 1_000_000 }, { perFile: 150_000, total: 150_000 }],
];

for (const [name, input, expected] of LIMITS) {
  const actual = harnessLimits(input);

  check(`${name}: per file`, actual.perFile, expected.perFile);
  check(`${name}: total`, actual.total, expected.total);
}

const small = harnessLimits({ contextTokens: 200_000, charsPerToken: 3 });

check('a file exactly at the per-file limit counts toward the total', countsTowardTotal(40_000, small), true);
check('a file one char over the per-file limit is left out of the total', countsTowardTotal(40_001, small), false);
check('a file one char under the per-file limit counts toward the total', countsTowardTotal(39_999, small), true);

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture harness count selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
