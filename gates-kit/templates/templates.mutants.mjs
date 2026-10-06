#!/usr/bin/env node
/**
 * The decisions of the agent-contract template checker, each broken once, that `templates.selftest.mjs` must
 * catch. The runner and its rules (green baseline, exactly-once target, parse check) live in
 * `../../mutation-proof/run-mutants.mjs`; crash-only kills count as survivors (`crashKills: 'fail'`). Each
 * row names the decision it removes, not the line it edits.
 *
 * Known equivalents, not mutated because no observable behavior differs: widening `[^`<>]*` to `+` (an empty
 * command is refused either way, by the pattern or by the blank check) and dropping the leading `^` of the
 * chain pattern (the line is already selected by its prefix).
 *
 * @es Las decisiones del verificador de plantillas del contrato de agente, rotas una a una, que
 * `templates.selftest.mjs` debe cazar. Una muerte solo por crash cuenta como superviviente. Equivalentes
 * conocidos, sin mutante porque no cambian nada observable: cambiar `*` por `+` en el patrón del comando
 * (un comando vacío se rechaza igual) y quitar el `^` inicial del patrón de la cadena (la línea ya se
 * selecciona por su prefijo).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../../mutation-proof/run-mutants.mjs';

const R = 'gates-kit/templates/template-rules.mjs';
const HEADINGS = [
  ['G1', '## G1 Zero suppression'],
  ['G2', '## G2 Bilingual runtime text'],
  ['G3', '## G3 Scoped gates during work, full chain once at landing'],
  ['G4', '## G4 Out-of-scope repositories untouched'],
  ['G5', '## G5 Unit size and writers'],
  ['G6', '## G6 Closed items need evidence'],
];

const MUTANTS = [
  ...HEADINGS.flatMap(([id, heading]) => [
    [`the ${id} heading is reworded`, R, `['${id}', '${heading}']`, `['${id}', '${heading} (draft)']`],
    [`the ${id} anchor is reported under another id`, R, `['${id}', '${heading}']`, `['G0', '${heading}']`],
  ]),
  ['trailing spaces on a heading break the anchor', R, 'line.trimEnd() === heading', 'line === heading'],
  ['a missing anchor is not reported', R, 'if (at === -1) problems.push', 'if (false) problems.push'],
  ['a section without its @es mirror is accepted', R, '!sectionAfter(lines, at).some((line) => line.startsWith(MIRROR_MARKER))', 'false'],
  ['the mirror check runs without looking at the section', R, 'sectionAfter(lines, at).some((line) => line.startsWith(MIRROR_MARKER))', 'lines.some((line) => line.startsWith(MIRROR_MARKER))'],
  ['a section runs to the end of the text', R, "const next = rest.findIndex((line) => line.startsWith('## '));", 'const next = -1;'],
  ['the last section drops its final line', R, 'return next === -1 ? rest : rest.slice(0, next);', 'return rest.slice(0, next);'],
  ['a section includes its own heading', R, 'lines.slice(start + 1)', 'lines.slice(start)'],
  ['the mirror marker loses its trailing space', R, "const MIRROR_MARKER = '@es ';", "const MIRROR_MARKER = '@es';"],
  ['an anchor with no mirror is checked even when the anchor is missing', R, 'else if (!sectionAfter', 'if (!sectionAfter'],
  ['the chain check is skipped', R, 'problems.push(...chainProblems(lines));', ''],
  ['a chain line is found anywhere in a line', R, 'lines.filter((line) => line.startsWith(CHAIN_PREFIX))', 'lines.filter((line) => line.includes(CHAIN_PREFIX))'],
  ['a missing chain line is not reported', R, 'if (chain.length === 0) return', 'if (false) return'],
  ['two chain lines are accepted', R, 'if (chain.length > 1) return', 'if (chain.length > 2) return'],
  ['one chain line counts as many', R, 'if (chain.length > 1) return', 'if (chain.length >= 1) return'],
  ['a placeholder command is accepted', R, 'command: `([^`<>]*)`$/', 'command: `([^`]*)`$/'],
  ['text after the command is accepted', R, 'command: `([^`<>]*)`$/', 'command: `([^`<>]*)`/'],
  ['a command without backticks is accepted', R, 'command: `([^`<>]*)`$/', 'command: `?([^`<>]*)`?$/'],
  ['trailing spaces after the command break the line', R, 'CHAIN_LINE.exec(chain[0].trimEnd())', 'CHAIN_LINE.exec(chain[0])'],
  ['a blank command is accepted', R, "match === null || match[1].trim() === ''", 'match === null'],
  ['a non-matching line is accepted as a command', R, "match === null || match[1].trim() === ''", "match !== null && match[1].trim() === ''"],
  ['the full-chain prefix is reworded', R, "const CHAIN_PREFIX = 'Full-chain command:';", "const CHAIN_PREFIX = 'Full chain command:';"],
  ['the scoped sentence is not required', R, 'if (!lines.some((line) => line.includes(SCOPED_SENTENCE)))', 'if (false)'],
  ['the scoped sentence is reworded', R, 'at the end, by the orchestrator.\';\n\n/** Its', 'at the end, by an orchestrator.\';\n\n/** Its'],
  ['the Spanish sentence is not required', R, "if (!lines.some((line) => line.startsWith(MIRROR_MARKER) && line.includes(SCOPED_SENTENCE_ES)))", 'if (false)'],
  ['the Spanish sentence loses its accent', R, 'lo que tocó;', 'lo que toco;'],
  ['the Spanish sentence needs no marker', R, 'line.startsWith(MIRROR_MARKER) && line.includes(SCOPED_SENTENCE_ES)', 'line.includes(SCOPED_SENTENCE_ES)'],
  ['the sentence problem is reported under the Spanish id', R, "{ id: 'missing-sentence' }", "{ id: 'missing-sentence-es' }"],
  ['the register check is skipped', R, 'problems.push(...registerProblems(lines));', ''],
  ['the register prefix is reworded', R, "const REGISTER_PREFIX = 'Findings register:';", "const REGISTER_PREFIX = 'Findings Register:';"],
  ['a register line is found anywhere in a line', R, 'lines.filter((line) => line.startsWith(REGISTER_PREFIX))', 'lines.filter((line) => line.includes(REGISTER_PREFIX))'],
  ['a missing register line is not reported', R, 'if (written.length === 0) return', 'if (false) return'],
  ['two register lines are accepted', R, 'if (written.length > 1) return', 'if (written.length > 2) return'],
  ['one register line counts as many', R, 'if (written.length > 1) return', 'if (written.length >= 1) return'],
  ['trailing spaces after the register path break the line', R, 'REGISTER_LINE.exec(written[0].trimEnd())', 'REGISTER_LINE.exec(written[0])'],
  ['text after the register path is accepted', R, '/^Findings register: `([^`]*)`$/', '/^Findings register: `([^`<>]*)`/'],
  ['a register path without backticks is accepted', R, '/^Findings register: `([^`]*)`$/', '/^Findings register: `?([^`<>]*)`?$/'],
  ['a malformed register path is accepted', R, 'if (match === null || !isRegisterPath(match[1])) return', 'if (match === null) return'],
  ['the register path is not read as a path', R, 'REGISTER_PATH.test(written) && ', ''],
  ['the register path segments are not checked', R, " && written.split('/').every((segment) => segment !== '.' && segment !== '..')", ''],
  ['a climbing register path is accepted', R, "segment !== '.' && segment !== '..'", "segment !== '.'"],
  ['a current-folder register path is accepted', R, "segment !== '.' && segment !== '..'", "segment !== '..'"],
  ['another extension is accepted', R, '*\\.jsonl$/;', '*\\.json[l]?$/;'],
  ['an absolute register path is accepted', R, '/^[\\w.-]+(?:', '/^\\/?[\\w.-]+(?:'],
  ['a colon is allowed in a register path', R, '/^[\\w.-]+(?:\\/[\\w.-]+)*\\.jsonl$/', '/^[\\w.:-]+(?:\\/[\\w.:-]+)*\\.jsonl$/'],
  ['a space is allowed in a register path', R, '/^[\\w.-]+(?:\\/[\\w.-]+)*\\.jsonl$/', '/^[\\w. -]+(?:\\/[\\w. -]+)*\\.jsonl$/'],
  ['a backslash is allowed in a register path', R, '/^[\\w.-]+(?:\\/[\\w.-]+)*\\.jsonl$/', '/^[\\w.\\\\-]+(?:\\/[\\w.\\\\-]+)*\\.jsonl$/'],
  ['the Spanish register line is not required', R, "? [] : [{ id: 'missing-register-es' }]", '? [] : []'],
  ['the Spanish register line may name another path', R, 'line.trimEnd() === `${MIRROR_MARKER}Registro de hallazgos: \\`${match[1]}\\``', "line.startsWith(`${MIRROR_MARKER}Registro de hallazgos:`)"],
  ['the Spanish register line needs no marker', R, '`${MIRROR_MARKER}Registro de hallazgos:', '`Registro de hallazgos:'],
  ['trailing spaces break the Spanish register line', R, 'line.trimEnd() === `${MIRROR_MARKER}Registro', 'line === `${MIRROR_MARKER}Registro'],
  ['the Spanish register line is worded loosely', R, '`${MIRROR_MARKER}Registro de hallazgos: ', '`${MIRROR_MARKER}Registro: '],
  ['the register problem is reported under the Spanish id', R, "{ id: 'missing-register' }", "{ id: 'missing-register-es' }"],
  ['a plain file counts as a template', R, 'filter((entry) => entry.isDirectory())', 'filter(() => true)'],
  ['a folder is read by another file name', R, "const CONTRACT_FILE = 'AGENT-CONTRACT.md';", "const CONTRACT_FILE = 'AGENT-CONTRACT';"],
  ['a folder without its file is read as correct', R, 'existsSync(file) ? inspectTemplate(readFileSync(file, \'utf8\')) : [{ id: \'missing-file\' }]', 'existsSync(file) ? inspectTemplate(readFileSync(file, \'utf8\')) : []'],
  ['a folder without its file reports another id', R, "[{ id: 'missing-file' }]", "[{ id: 'no-file' }]"],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof', 'bilingual-output'], selftest: 'gates-kit/templates/templates.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
