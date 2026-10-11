#!/usr/bin/env node
/**
 * Proof that the agent-contract template checker DISCRIMINATES, and that every live template passes it.
 * Fixtures are built here from literal text (never from the checker's own constants), so a mutated constant
 * cannot move the fixture with it. State space: a correct template; each of the six G anchors missing, at the
 * wrong heading level, or worded differently; the full-chain line absent, duplicated, empty, a placeholder,
 * or mirrored by an `@es` line (which is not a second command); the findings-register line absent,
 * duplicated, empty, a placeholder, an absolute or climbing path, not a `.jsonl` file, or without its Spanish
 * mirror naming the same path; the scoped-versus-full sentence absent,
 * altered, or without its Spanish mirror; a G section without its `@es` line; discovery (a folder without its
 * contract file, a plain file that is not a template, an empty root); and the live `templates/` folder.
 * Every defect is reported ALONE, so a message cannot hide behind another one.
 *
 * @es Prueba de que el verificador de plantillas del contrato DISCRIMINA y de que toda plantilla real lo
 * pasa. Los fixtures se construyen aquí con texto literal (nunca con las constantes del verificador).
 * Espacio de estados: plantilla correcta; cada ancla G ausente, con otro nivel de título o con otro texto;
 * la línea de cadena completa ausente, duplicada, vacía, de relleno o espejada por una línea `@es` (que no
 * es un segundo comando); la línea del registro de hallazgos ausente, duplicada, vacía, de relleno, con ruta
 * absoluta o que sube de carpeta, que no sea un fichero `.jsonl` o sin su espejo español con la misma ruta;
 * la frase acotado-contra-completo ausente, alterada o sin espejo; una sección G sin
 * su línea `@es`; el descubrimiento (carpeta sin su fichero, fichero suelto, raíz vacía) y la carpeta real.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_REGISTER_PATH } from '../findings-register.mjs';
import { inspectDirectory, inspectTemplate } from './template-rules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SENTENCE = 'A worker runs only the gates that read what it touched; the full chain runs once, at the end, by the orchestrator.';
const SENTENCE_ES = 'Un worker corre solo los gates que leen lo que tocó; la cadena completa corre una sola vez, al final, por el orquestador.';
const HEADINGS = [
  ['G1', '## G1 Zero suppression'],
  ['G2', '## G2 Bilingual runtime text'],
  ['G3', '## G3 Scoped gates during work, full chain once at landing'],
  ['G4', '## G4 Out-of-scope repositories untouched'],
  ['G5', '## G5 Unit size and writers'],
  ['G6', '## G6 Closed items need evidence'],
];
const CHAIN = 'Full-chain command: `npm run build:ci-pr`';
const REGISTER = 'Findings register: `.claude/FINDINGS.jsonl`';
const REGISTER_ES = '@es Registro de hallazgos: `.claude/FINDINGS.jsonl`';

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** Problem ids of a text, with details, as `id` or `id:detail`. @es Problemas de un texto como `id` o `id:detalle`. */
function problemsOf(text) {
  try {
    return inspectTemplate(text).map((problem) => (problem.detail === undefined ? problem.id : `${problem.id}:${problem.detail}`));
  } catch (error) {
    return [`threw:${error.message}`]; // a throw is a failed assertion, never a crash of the selftest
  }
}

/** Runs the directory inspection; a throw yields one entry named `threw`. @es Inspecciona un directorio; un throw da una entrada `threw`. */
function inspectSafely(root) {
  try {
    return inspectDirectory(root);
  } catch (error) {
    return [{ name: 'threw', problems: [{ id: 'threw', detail: error.message }] }];
  }
}

/** Builds a correct template; `edit` receives the line list and may change it. @es Construye una plantilla correcta. */
function template(edit = (lines) => lines) {
  const lines = ['# Agent Contract template', '', REGISTER, REGISTER_ES, ''];

  for (const [id, heading] of HEADINGS) {
    lines.push(heading, `English text of ${id}.`, `@es Texto en español de ${id}.`, '');
    if (id === 'G3') lines.push(CHAIN, '@es Comando de la cadena completa: `npm run build:ci-pr`', SENTENCE, `@es ${SENTENCE_ES}`, '');
  }

  return edit(lines).join('\n');
}

/** Removes every line equal to `line`. @es Quita las líneas iguales a `line`. */
const without = (line) => (lines) => lines.filter((candidate) => candidate !== line);

/** Replaces every line equal to `from`. @es Reemplaza las líneas iguales a `from`. */
const replace = (from, to) => (lines) => lines.map((candidate) => (candidate === from ? to : candidate));

check('a correct template has no problem', problemsOf(template()).length === 0);
check('CRLF line endings are read the same', problemsOf(template().replaceAll('\n', '\r\n')).length === 0);

for (const [id, heading] of HEADINGS) {
  check(`${id} missing is the only problem`, problemsOf(template(without(heading))).join() === `missing-anchor:${id}`);
  check(`${id} at heading level three is missing`, problemsOf(template(replace(heading, `#${heading}`))).join() === `missing-anchor:${id}`);
  check(`${id} with other wording is missing`, problemsOf(template(replace(heading, `${heading} and more`))).join() === `missing-anchor:${id}`);
  check(`${id} tolerates trailing spaces`, problemsOf(template(replace(heading, `${heading}  `))).length === 0);
  // G3 also holds the Spanish mirrors of the chain and of the sentence, so its own mirror is the one removed
  // here and the others are removed with it; the sentence mirror then reports as its own problem.
  const stripped = (lines) => replace(`@es Texto en español de ${id}.`, 'Spanish text without the marker.')(id === 'G3' ? lines.filter((line) => !line.startsWith('@es Comando') && line !== `@es ${SENTENCE_ES}`) : lines);
  const expected = id === 'G3' ? 'missing-es-mirror:G3,missing-sentence-es' : `missing-es-mirror:${id}`;

  check(`${id} without its @es line is reported`, problemsOf(template(stripped)).join() === expected);
  check(`${id} keeps its mirror when only the English text changes`, problemsOf(template(replace(`English text of ${id}.`, 'Other English text.'))).length === 0);
}

check('the last section runs to the end of the text', problemsOf(template((lines) => lines.map((line) => (line === '@es Texto en español de G6.' ? '' : line)).concat(['@es stray mirror after the last section']))).join() === '');
check('a section ends at the next second-level heading', problemsOf(template((lines) => lines.map((line) => (line === '@es Texto en español de G1.' ? '' : line)).map((line) => (line === '## G2 Bilingual runtime text' ? `${line}\n@es mirror placed under G2` : line)))).join() === 'missing-es-mirror:G1');

check('a line starting with @estimated is not a mirror', problemsOf(template(replace('@es Texto en español de G2.', '@estimated cost of G2.'))).join() === 'missing-es-mirror:G2');

check('the chain line missing is the only problem', problemsOf(template(without(CHAIN))).join() === 'missing-chain');
check('two chain lines are refused', problemsOf(template(replace(CHAIN, `${CHAIN}\nFull-chain command: \`npm test\``))).join() === 'multiple-chain');
check('an empty command is malformed', problemsOf(template(replace(CHAIN, 'Full-chain command: ``'))).join() === 'malformed-chain');
check('a blank command is malformed', problemsOf(template(replace(CHAIN, 'Full-chain command: ` `'))).join() === 'malformed-chain');
check('a command without backticks is malformed', problemsOf(template(replace(CHAIN, 'Full-chain command: npm run build:ci-pr'))).join() === 'malformed-chain');
check('a placeholder command is malformed', problemsOf(template(replace(CHAIN, 'Full-chain command: `<the chain>`'))).join() === 'malformed-chain');
check('text after the command is malformed', problemsOf(template(replace(CHAIN, `${CHAIN} and more`))).join() === 'malformed-chain');
check('trailing spaces after the command are tolerated', problemsOf(template(replace(CHAIN, `${CHAIN}   `))).length === 0);
check('a chain-looking line that is not at column zero is no chain', problemsOf(template(replace(CHAIN, ` ${CHAIN}`))).join() === 'missing-chain');
check('a chained command with && is accepted', problemsOf(template(replace(CHAIN, 'Full-chain command: `npm run lint && npm test`'))).length === 0);

check('the sentence missing is the only problem', problemsOf(template(without(SENTENCE))).join() === 'missing-sentence');
check('an altered sentence is missing', problemsOf(template(replace(SENTENCE, SENTENCE.replace(', at the end,', '')))).join() === 'missing-sentence');
check('the sentence may share its line with other text', problemsOf(template(replace(SENTENCE, `Rule. ${SENTENCE} More.`))).length === 0);
check('the Spanish sentence missing is the only problem', problemsOf(template(without(`@es ${SENTENCE_ES}`))).join() === 'missing-sentence-es');
check('the Spanish sentence without its accents is refused', problemsOf(template(replace(`@es ${SENTENCE_ES}`, `@es ${SENTENCE_ES.replace('tocó', 'toco')}`))).join() === 'missing-sentence-es');
check('the Spanish sentence without the @es marker is refused', problemsOf(template(replace(`@es ${SENTENCE_ES}`, SENTENCE_ES))).join() === 'missing-sentence-es');

check('the register line missing is the only problem', problemsOf(template(without(REGISTER))).join() === 'missing-register');
check('the Spanish register line missing is the only problem', problemsOf(template(without(REGISTER_ES))).join() === 'missing-register-es');
check('a Spanish register line naming another path is refused', problemsOf(template(replace(REGISTER_ES, '@es Registro de hallazgos: `.claude/OTHER.jsonl`'))).join() === 'missing-register-es');
check('a Spanish register line without the marker is refused', problemsOf(template(replace(REGISTER_ES, 'Registro de hallazgos: `.claude/FINDINGS.jsonl`'))).join() === 'missing-register-es');
check('a Spanish register line worded differently is refused', problemsOf(template(replace(REGISTER_ES, '@es Registro de los hallazgos: `.claude/FINDINGS.jsonl`'))).join() === 'missing-register-es');
check('two register lines are refused', problemsOf(template(replace(REGISTER, `${REGISTER}\nFindings register: \`.claude/OTHER.jsonl\``))).join() === 'multiple-register');
check('a register line that is not at column zero is no register line', problemsOf(template(replace(REGISTER, ` ${REGISTER}`))).join() === 'missing-register');
check('trailing spaces after the register path are tolerated', problemsOf(template(replace(REGISTER, `${REGISTER}   `))).length === 0);
check('another repository path is accepted', problemsOf(template((lines) => replace(REGISTER, 'Findings register: `docs/team.findings.jsonl`')(replace(REGISTER_ES, '@es Registro de hallazgos: `docs/team.findings.jsonl`')(lines)))).length === 0);

for (const [label, written] of [
  ['an empty path', ''],
  ['a blank path', ' '],
  ['no backticks', '.claude/FINDINGS.jsonl'],
  ['a placeholder', '<where the register lives>'],
  ['an absolute path', '/etc/FINDINGS.jsonl'],
  ['a path that climbs', '../FINDINGS.jsonl'],
  ['a path that climbs in the middle', '.claude/../FINDINGS.jsonl'],
  ['a current-folder segment', './FINDINGS.jsonl'],
  ['a Windows separator', '.claude\\FINDINGS.jsonl'],
  ['a drive letter', 'C:/FINDINGS.jsonl'],
  ['another extension', '.claude/FINDINGS.json'],
  ['a folder', '.claude/'],
  ['a space inside', '.claude/MY FINDINGS.jsonl'],
  ['text after the path', '.claude/FINDINGS.jsonl` and more'],
]) {
  const line = label === 'no backticks' ? `Findings register: ${written}` : label === 'text after the path' ? `Findings register: \`${written}` : `Findings register: \`${written}\``;

  check(`${label} is a malformed register line`, problemsOf(template(replace(REGISTER, line))).join() === 'malformed-register');
}

check('an empty text reports every part', problemsOf('').length === 6 + 4 && problemsOf('')[0] === 'missing-anchor:G1');

/** The problem ids of the entry named `name`, or `absent` when no such entry exists. @es Los ids de problema de la entrada `name`, o `absent`. */
function idsOf(entries, name) {
  const entry = entries.find((candidate) => candidate.name === name);

  return entry === undefined ? 'absent' : entry.problems.map((problem) => problem.id).join();
}

const roots = [];
// Every root is removed on every exit, a throw included: a selftest leaves nothing behind it. @es Toda raíz se
// elimina en toda salida, también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** A fresh temporary templates root. @es Una raíz temporal de plantillas. */
function freshRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'templates-selftest-'));

  roots.push(root);

  return root;
}

/** Writes `<root>/<name>/AGENT-CONTRACT.md`. @es Escribe la plantilla de una carpeta. */
function put(root, name, text) {
  mkdirSync(path.join(root, name), { recursive: true });
  writeFileSync(path.join(root, name, 'AGENT-CONTRACT.md'), text);
}

const root = freshRoot();

put(root, 'beta', template());
put(root, 'alpha', template(without(CHAIN)));
mkdirSync(path.join(root, 'gamma'));
writeFileSync(path.join(root, 'README.md'), 'a plain file is not a template\n');

const found = inspectSafely(root);

check('discovery returns one entry per folder', found.map((entry) => entry.name).sort().join() === 'alpha,beta,gamma');
check('a plain file is not a template', found.every((entry) => entry.name !== 'README.md'));
check('a correct folder has no problem', idsOf(found, 'beta') === '');
check('a defective folder carries its problem', idsOf(found, 'alpha') === 'missing-chain');
check('a folder without its contract file is a problem', idsOf(found, 'gamma') === 'missing-file');
check('an empty root has no templates', inspectSafely(freshRoot()).length === 0);
check('the contract file is read by the exact name AGENT-CONTRACT.md', (() => {
  const other = freshRoot();

  mkdirSync(path.join(other, 'x'));
  writeFileSync(path.join(other, 'x', 'agent-contract.txt'), template());

  return idsOf(inspectSafely(other), 'x') === 'missing-file';
})());

const live = inspectSafely(HERE);

check('the register path of the kit is the one the contracts name', DEFAULT_REGISTER_PATH === '.claude/FINDINGS.jsonl');

for (const stack of ['angular-app', 'angular-lib', 'nest-api', 'node-lib-vitest']) {
  const entry = live.find((candidate) => candidate.name === stack);

  check(`the live ${stack} template exists`, entry !== undefined);
  check(`the live ${stack} template has no problem${entry === undefined ? '' : ` (${entry.problems.map((problem) => `${problem.id}${problem.detail ?? ''}`).join(',')})`}`, entry !== undefined && entry.problems.length === 0);
}

for (const stack of ['angular-app', 'angular-lib', 'nest-api', 'node-lib-vitest']) {
  const text = readFileSync(path.join(HERE, stack, 'AGENT-CONTRACT.md'), 'utf8');

  check(`the live ${stack} template names the register path the module writes to`, text.includes(`\nFindings register: \`${DEFAULT_REGISTER_PATH}\`\n`) && text.includes(`\n@es Registro de hallazgos: \`${DEFAULT_REGISTER_PATH}\`\n`));
}

check('every discovered live template has no problem', live.length > 0 && live.every((entry) => entry.problems.length === 0));

if (failures.length > 0) {
  console.error(`gates-kit templates selftest FAILED @es el selftest de plantillas de gates-kit FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`gates-kit templates selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);
