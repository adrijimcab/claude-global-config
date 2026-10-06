#!/usr/bin/env node
/**
 * Proof of the tiering verdict: whether a proposed "after" of a loaded rule file conserves its "before". Every
 * fixture is constructed here and every expectation is worked out by hand, never read from the code under
 * test. The states the decisions range over: a removed line archived whole, not archived, archived with a
 * lost tilde, archived only as part of a longer line, archived across two evidence files; a blank line
 * removed; an added line that is a whole slice, a join of long slices, a join through a fixed label, an
 * invented word, a join of slices one character under the minimum; a RULE sentence kept, re-wrapped, cut; an
 * anchor kept, indented, never present; CRLF anywhere; the evidence pointer failure-capture writes, with its
 * evidence file present, absent, in another directory, followed by more text, under a key that is not one.
 *
 * @es Prueba del veredicto de escalonado: si un "después" propuesto de un fichero de reglas cargado conserva
 * su "antes". Cada fixture se construye aquí y cada expectativa se calcula a mano. Los estados: una línea
 * quitada archivada entera, sin archivar, archivada con una tilde perdida, archivada solo dentro de una línea
 * más larga, repartida en dos ficheros de evidencia; una línea en blanco quitada; una línea añadida que es un
 * trozo entero, una unión de trozos largos, una unión mediante etiqueta fija, una palabra inventada, una unión
 * de trozos un carácter por debajo del mínimo; una frase RULE conservada, re-envuelta, cortada; un ancla
 * conservada, sangrada, nunca presente; CRLF en cualquier sitio; el puntero a la evidencia que escribe
 * failure-capture, con su fichero de evidencia presente, ausente, en otro directorio, seguido de más texto, bajo
 * una clave que no lo es.
 */

import { tieredLine } from '../failure-capture/ledger-line.mjs';

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
check('a whole slice passes', uncoveredText('the lazy dog.', SOURCE, new Set()),undefined);
check('a whole slice shorter than the minimum fails when it is no whole original line', uncoveredText('fox', SOURCE, new Set()), 'fox');
check('a short line that is a whole original line passes', uncoveredText('  fox', SOURCE, new Set(['fox'])), undefined);
check('a join of two long slices passes', uncoveredText('The quick brown fox RULE: never feed the fox', SOURCE, new Set()),undefined);
check('an invented word fails and is named', uncoveredText('The quick brown fox never sleeps', SOURCE, new Set()),'never sleeps');
check('a join of short words fails', uncoveredText('lazy fox', SOURCE, new Set()),'lazy fox');
check('the label Mechanism: may join', uncoveredText('Mechanism: the lazy dog.', SOURCE, new Set()),undefined);
check('the label Evidence: may join', uncoveredText('Evidence: the lazy dog.', SOURCE, new Set()),undefined);
check('any other label fails', uncoveredText('Proof: the lazy dog.', SOURCE, new Set()),'Proof: the lazy dog.');

const EDGE = folded('ABCDEFGHIJKL zz MNOPQRSTUVWX');

check('two slices of exactly the minimum join', uncoveredText('ABCDEFGHIJKLMNOPQRSTUVWX', EDGE, new Set()),undefined);
check('a slice one under the minimum does not join', uncoveredText('ABCDEFGHIJKMNOPQRSTUVWX', EDGE, new Set()),'ABCDEFGHIJKMNOPQRSTUVWX');
check('a join is found where the longest first slice would overshoot', uncoveredText('abcdefghijklmnopqrstuvwxyz0', folded('abcdefghijklmnop | nopqrstuvwxyz0'), new Set()), undefined);

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

const SHORT_BEFORE = 'We never guess about the tree here.\n  green).';
const shortVerdict = (after, evidence) => kinds(tieringVerdict({ before: SHORT_BEFORE, after, evidence, anchors: [] }));

check('an added short word taken from inside a line is invented', shortVerdict(`${SHORT_BEFORE}\nnever`, []), ['invented']);
check('a short original line re-indented is conserved', shortVerdict('We never guess about the tree here.\n    green).', archive('  green).')), []);

const crlf = (text) => text.split('\n').join('\r\n');

check('CRLF in before, after and evidence changes nothing', kinds(tieringVerdict({ before: crlf(BEFORE), after: crlf([...KEPT, KEY_TWO].join('\n')), evidence: [{ name: 'e.md', text: crlf(`${NARRATIVE}\n${TILDE}\n`) }], anchors: ANCHORS })), []);
check('every deficit message is bilingual', verdictOf(KEPT, []).every((deficit) => deficit.message.includes(' @es ')), true);
check('a removed, unarchived, anchored RULE line reports all three', kinds(verdictOf(KEPT, [])), ['unarchived', 'unarchived', 'unarchived', 'rule-lost', 'anchor-lost']);

// --- the evidence pointer failure-capture writes (the builder is the one the tool itself uses)
const LEDGER_LINE = '- [global] 2026-06-30 — (×4) La lección de la señal: corregir el año → causa → RULE: nunca uses ñ sin verificar la tilde. <!--fc:signal-lesson#4-->';
const TIERED_LINE = tieredLine({ scope: 'global', date: '2026-06-30', tally: '(×4)', rule: 'nunca uses ñ sin verificar la tilde.', key: 'signal-lesson', marker: '<!--fc:signal-lesson#4-->' }).line;
const pointerVerdict = (after, evidence) => kinds(tieringVerdict({ before: `# Ledger\n${LEDGER_LINE}`, after: `# Ledger\n${after}`, evidence, anchors: [] }));
const SIGNAL_EVIDENCE = [{ name: 'signal-lesson.md', text: `# e\n${LEDGER_LINE}\n` }];

check('the tiered line failure-capture writes is conserved when the evidence file it points to holds the original', pointerVerdict(TIERED_LINE, SIGNAL_EVIDENCE), []);
check('...a pointer to an evidence file that is not in the evidence set is invented', pointerVerdict(TIERED_LINE, [{ name: 'other.md', text: `${LEDGER_LINE}\n` }]), ['invented']);
check('...a pointer into another directory is invented', pointerVerdict(TIERED_LINE.replace('lessons/evidence/', 'evidence/'), SIGNAL_EVIDENCE), ['invented']);
check('...a pointer followed by more text is invented', pointerVerdict(TIERED_LINE.replace('.md <!--', '.md and more words nobody wrote <!--'), SIGNAL_EVIDENCE), ['invented']);
check('...a pointer under a key that is not a key is invented, even with a file of that name', pointerVerdict(TIERED_LINE.replace('signal-lesson.md', 'Bad_Key.md'), [{ name: 'Bad_Key.md', text: `${LEDGER_LINE}\n` }]), ['invented']);

// --- a pointer to a file of the evidence set, by its path from the repository (a moved section names where it went)
const MOVED = [{ ...archive(NARRATIVE, TILDE)[0], path: 'rules/key.md' }];
const movedVerdict = (pointer, evidence = MOVED) => kinds(verdictOf([...KEPT, KEY_TWO, pointer], evidence));

check('an Evidence: pointer to the repository path of a file of the evidence set is conserved', movedVerdict('Evidence: rules/key.md'), []);
check('...a pointer to a path that is not in the evidence set is invented', movedVerdict('Evidence: rules/other.md'), ['invented']);
check('...a pointer followed by more text is invented', movedVerdict('Evidence: rules/key.md and a few words nobody wrote'), ['invented']);
check('...a pointer with no label is invented', movedVerdict('rules/key.md'), ['invented']);
check('...an evidence file with no path in the repository (a directory outside it) cannot be pointed to', movedVerdict('Evidence: rules/key.md', archive(NARRATIVE, TILDE)), ['invented']);

process.stdout.write(`rule-tiering verdict selftest: ${passed} passed, ${failures.length} failed\n`);
for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.exit(failures.length === 0 ? 0 : 1);
