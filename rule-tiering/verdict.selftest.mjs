#!/usr/bin/env node
/**
 * Proof of the tiering verdict: whether a proposed "after" of a loaded rule file conserves its "before". Every
 * fixture is constructed here and every expectation is worked out by hand, never read from the code under
 * test. The states the decisions range over: a removed line archived whole, not archived, archived with a
 * lost tilde, archived only as part of a longer line, archived across two evidence files; a blank line
 * removed; an added line that is a whole slice, a join of long slices, a join through a fixed label, an
 * invented word, a join of slices one character under the minimum; a RULE sentence kept, re-wrapped, cut; an
 * anchor kept, indented, never present; CRLF anywhere.
 *
 * @es Prueba del veredicto de escalonado: si un "después" propuesto de un fichero de reglas cargado conserva
 * su "antes". Cada fixture se construye aquí y cada expectativa se calcula a mano. Los estados: una línea
 * quitada archivada entera, sin archivar, archivada con una tilde perdida, archivada solo dentro de una línea
 * más larga, repartida en dos ficheros de evidencia; una línea en blanco quitada; una línea añadida que es un
 * trozo entero, una unión de trozos largos, una unión mediante etiqueta fija, una palabra inventada, una unión
 * de trozos un carácter por debajo del mínimo; una frase RULE conservada, re-envuelta, cortada; un ancla
 * conservada, sangrada, nunca presente; CRLF en cualquier sitio.
 */

import { folded, linesOf } from './instruction-text.mjs';
import { ruleSentences } from './rule-sentences.mjs';
import { MIN_SLICE, uncoveredText } from './slice-join.mjs';
import { tieringVerdict } from './tiering-verdict.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- instruction text
check('CRLF and a lone CR split like LF', linesOf('a\r\nb\rc\nd'), ['a', 'b', 'c', 'd']);
check('whitespace folds to single spaces and is trimmed', folded('  a \n\t b  '), 'a b');

// --- the RULE recogniser
const RULE_TEXT = [
  '- **`k`** — Statement. RULE: first rule ends here. Narrative after.',
  '  - **FACE.** RULE, operational: run `a. b` first. More.',
  '**RULE: bold rule, kept whole.** Tail.',
  'RULES: not one. rule: not one. PRERULE: not one. The RULE to not repeat is a template.',
  'RULE: spans a',
  '  wrapped line? Yes.',
  'RULE: keep v1.2 pinned. Tail.',
  'RULE: stop now! Tail. 9RULE: not one.',
  'Last RULE: has no terminator'
].join('\n');

check('RULE sentences: openers, word boundary, backtick dots, inner dots, every terminator, bold end, wrapped lines, unterminated tail', ruleSentences(RULE_TEXT), [
  'RULE: first rule ends here.',
  'RULE, operational: run `a. b` first.',
  'RULE: bold rule, kept whole.',
  'RULE: spans a wrapped line?',
  'RULE: keep v1.2 pinned.',
  'RULE: stop now!',
  'RULE: has no terminator'
]);

// --- slices
const SOURCE = folded('The quick brown fox jumps over\nthe lazy dog. RULE: never feed the fox after dark.');

check('the minimum slice is 12 characters', MIN_SLICE, 12);
check('a whole slice passes', uncoveredText('the lazy dog.', SOURCE), undefined);
check('a whole slice shorter than the minimum passes', uncoveredText('fox', SOURCE), undefined);
check('a join of two long slices passes', uncoveredText('The quick brown fox RULE: never feed the fox', SOURCE), undefined);
check('an invented word fails and is named', uncoveredText('The quick brown fox never sleeps', SOURCE), 'never sleeps');
check('a join of short words fails', uncoveredText('lazy fox', SOURCE), 'lazy fox');
check('the label Mechanism: may join', uncoveredText('Mechanism: the lazy dog.', SOURCE), undefined);
check('the label Evidence: may join', uncoveredText('Evidence: the lazy dog.', SOURCE), undefined);
check('any other label fails', uncoveredText('Proof: the lazy dog.', SOURCE), 'Proof: the lazy dog.');

const EDGE = folded('ABCDEFGHIJKL zz MNOPQRSTUVWX');

check('two slices of exactly the minimum join', uncoveredText('ABCDEFGHIJKLMNOPQRSTUVWX', EDGE), undefined);
check('a slice one under the minimum does not join', uncoveredText('ABCDEFGHIJKMNOPQRSTUVWX', EDGE), 'ABCDEFGHIJKMNOPQRSTUVWX');
check('a join is found where the longest first slice would overshoot', uncoveredText('abcdefghijklmnopqrstuvwxyz0', folded('abcdefghijklmnop | nopqrstuvwxyz0')), undefined);

// --- the verdict
const NARRATIVE = '  Narrative line that will move out to evidence.';
const TILDE = '  Another narrative line, with tilde: está.';
const KEY_TWO = '- **`key-two`** — Second statement. RULE: never invent a word.';
const BEFORE = ['# Title', '', '- **`key-one`** — Statement one keeps. RULE: always archive before you cut.', NARRATIVE, TILDE, KEY_TWO].join('\n');
const KEPT = ['# Title', '- **`key-one`** — Statement one keeps. RULE: always archive before you cut.'];
const ANCHORS = ['# Title', '- **`key-one`**', '- **`key-two`**', '- **`absent-key`**'];
const archive = (...lines) => [{ name: 'key.md', text: `# evidence\n\n${lines.join('\n')}\n` }];
const kinds = (deficits) => deficits.map((deficit) => deficit.kind);
const verdictOf = (afterLines, evidence) => tieringVerdict({ before: BEFORE, after: afterLines.join('\n'), evidence, anchors: ANCHORS });

check('everything removed archived, blank line dropped: conserved', kinds(verdictOf([...KEPT, KEY_TWO], archive(NARRATIVE, TILDE))), []);
check('a removed line that is not archived is a deficit', kinds(verdictOf([...KEPT, KEY_TWO], archive(NARRATIVE))), ['unarchived']);
check('the deficit names the line', verdictOf([...KEPT, KEY_TWO], archive(NARRATIVE))[0]?.line, TILDE);
check('an archived copy with a lost tilde does not count', kinds(verdictOf([...KEPT, KEY_TWO], archive(NARRATIVE, TILDE.replace('á', 'a')))), ['unarchived']);
check('a line archived only inside a longer line does not count', kinds(verdictOf([...KEPT, KEY_TWO], archive(NARRATIVE, `${TILDE} More.`))), ['unarchived']);
check('lines archived across two evidence files count', kinds(verdictOf([...KEPT, KEY_TWO], [...archive(NARRATIVE), ...archive(TILDE)])), []);

check('an added line with an invented sentence is a deficit', kinds(verdictOf([...KEPT, KEY_TWO, '  Totally invented sentence here.'], archive(NARRATIVE, TILDE))), ['invented']);
check('an added join of long slices is conserved', kinds(verdictOf([...KEPT, KEY_TWO, '  Narrative line that will move out to evidence. with tilde: está.'], archive(NARRATIVE, TILDE))), []);

check('a cut RULE sentence is a deficit', kinds(verdictOf([...KEPT, '- **`key-two`** — Second statement. RULE: never invent'], archive(NARRATIVE, TILDE, KEY_TWO))), ['rule-lost']);
check('a RULE sentence re-wrapped over two lines is conserved', kinds(verdictOf([...KEPT, '- **`key-two`** — Second statement. RULE: never', '  invent a word.'], archive(NARRATIVE, TILDE, KEY_TWO))), []);

check('an anchor moved off the line start is a deficit', kinds(verdictOf([...KEPT, `  ${KEY_TWO}`], archive(NARRATIVE, TILDE, KEY_TWO))), ['anchor-lost']);
check('an anchor removed with its line is a deficit', kinds(verdictOf(KEPT, archive(NARRATIVE, TILDE, KEY_TWO))), ['rule-lost', 'anchor-lost']);

const crlf = (text) => text.split('\n').join('\r\n');

check('CRLF in before, after and evidence changes nothing', kinds(tieringVerdict({ before: crlf(BEFORE), after: crlf([...KEPT, KEY_TWO].join('\n')), evidence: [{ name: 'e.md', text: crlf(`${NARRATIVE}\n${TILDE}\n`) }], anchors: ANCHORS })), []);
check('every deficit message is bilingual', verdictOf(KEPT, []).every((deficit) => deficit.message.includes(' @es ')), true);
check('a removed, unarchived, anchored RULE line reports all three', kinds(verdictOf(KEPT, [])), ['unarchived', 'unarchived', 'unarchived', 'rule-lost', 'anchor-lost']);

process.stdout.write(`rule-tiering verdict selftest: ${passed} passed, ${failures.length} failed\n`);
for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.exit(failures.length === 0 ? 0 : 1);
