#!/usr/bin/env node
/**
 * The decisions of the findings register, each broken once, that `findings-register.selftest.mjs` must catch.
 * The runner and its rules (green baseline, exactly-once target, parse check) live in
 * `../mutation-proof/run-mutants.mjs`; crash-only kills count as survivors (`crashKills: 'fail'`). Each row
 * names the decision it removes, not the line it edits.
 *
 * @es Las decisiones del registro de hallazgos, rotas una a una, que `findings-register.selftest.mjs` debe
 * cazar. Una muerte solo por crash cuenta como superviviente. Cada fila nombra la decisión que quita.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const R = 'gates-kit/findings-register.mjs';

const MUTANTS = [
  // The schema of one line.
  ['the schema version is not read', R, 'if (record.v !== SCHEMA_VERSION) problems.push', 'if (false) problems.push'],
  ['the schema version is 2', R, 'const SCHEMA_VERSION = 1;', 'const SCHEMA_VERSION = 2;'],
  ['a measured basis is refused', R, "new Set(['measured', 'hypothesis'])", "new Set(['hypothesis'])"],
  ['a hypothesis basis is refused', R, "new Set(['measured', 'hypothesis'])", "new Set(['measured'])"],
  ['any basis is accepted', R, '!BASES.has(record.basis)', 'false'],
  ['a line that is not an object is read', R, "if (record === null || typeof record !== 'object' || Array.isArray(record)) return [{ id: 'not-object' }];", ''],
  ['an array is an object', R, "if (record === null || typeof record !== 'object' || Array.isArray(record)) return [{ id: 'not-object' }];", "if (record === null || typeof record !== 'object') return [{ id: 'not-object' }];"],
  ['an unknown kind is read as a finding', R, "if (keys === undefined || !Object.hasOwn(KEYS, record.kind)) return [...problems, { id: 'bad-kind' }];", ''],
  ['a kind named like an object property is a kind', R, '|| !Object.hasOwn(KEYS, record.kind)', ''],
  ['an unknown key is accepted', R, 'if (!keys.includes(key)) problems.push', 'if (false) problems.push'],
  ['a closure may carry the keys of a finding', R, '  closure: [\'v\', \'kind\', \'id\', \'at\', \'summary\', \'evidence\'],', '  closure: [\'v\', \'kind\', \'id\', \'at\', \'scope\', \'source\', \'basis\', \'summary\', \'evidence\'],'],
  ['an id is not format-checked', R, "if (typeof record.id !== 'string' || !ID_FORMAT.test(record.id)) problems.push", 'if (false) problems.push'],
  ['an id may lack its prefix', R, '/^F-[0-9a-f]{8}$/', '/^(?:F-)?[0-9a-f]{8}$/'],
  ['an id may be shorter', R, '[0-9a-f]{8}$/', '[0-9a-f]{1,8}$/'],
  ['an id may be followed by text', R, '[0-9a-f]{8}$/', '[0-9a-f]{8}/'],
  ['an id may be uppercase', R, '/^F-[0-9a-f]{8}$/', '/^F-[0-9a-fA-F]{8}$/'],
  ['an id that is not the derived one is accepted', R, 'record.id !== deriveId(record.scope, record.summary.en)', 'false'],
  ['the id of a closure is held to the derived rule', R, 'else if (isFinding && typeof record.scope', 'else if (typeof record.scope'],
  ['the id hash is another algorithm', R, "createHash('sha256')", "createHash('md5')"],
  ['the id hash drops the scope separator', R, '`${scope}\\n${summaryEnglish}`', '`${scope}${summaryEnglish}`'],
  ['the id keeps seven digits', R, '.digest(\'hex\').slice(0, 8)', ".digest('hex').slice(0, 7)"],
  ['the id ignores the scope', R, '`${scope}\\n${summaryEnglish}`', '`${summaryEnglish}`'],
  ['the id ignores the summary', R, '`${scope}\\n${summaryEnglish}`', '`${scope}`'],
  ['a date is not checked', R, 'if (!isDate(record.at)) problems.push', 'if (false) problems.push'],
  ['a date is not compared with its own text', R, 'date.toISOString().slice(0, 10) === value', 'true'],
  ['a date that cannot be read is written back', R, '!Number.isNaN(date.getTime()) && ', ''],
  ['a blank scope is accepted', R, "typeof value === 'string' && value.trim() !== ''", "typeof value === 'string' && value !== ''"],
  ['a scope that is not text is accepted', R, "typeof value === 'string' && value.trim() !== ''", "value.trim() !== ''"],
  ['an empty scope is accepted', R, 'if (!isText(record.scope)) problems.push', 'if (false) problems.push'],
  ['an empty source is accepted', R, 'if (!isText(record.source)) problems.push', 'if (false) problems.push'],

  // The summary.
  ['a summary missing a language is accepted', R, "if (typeof text.en !== 'string' || typeof text.es !== 'string' || messageProblems({ summary }).length > 0)", 'if (false)'],
  ['a summary that is not an object is read as one', R, "const text = summary !== null && typeof summary === 'object' ? summary : {};", 'const text = summary;'],
  ['a summary copied between languages is accepted', R, ' || messageProblems({ summary }).length > 0', ''],
  ['a summary with a non-string half is passed to the house check', R, "typeof text.en !== 'string' || typeof text.es !== 'string' || ", ''],
  ['a summary on several lines is accepted', R, "if (/[\\r\\n]/.test(text.en + text.es)) return [{ id: 'summary-multiline' }];", ''],
  ['a carriage return is no line break', R, '/[\\r\\n]/', '/[\\n]/'],
  ['a line break in the Spanish half is not read', R, 'text.en + text.es', 'text.en'],

  // The evidence.
  ['a missing evidence key is accepted', R, "if (evidence === undefined) return needsReceipt ? [{ id: 'missing-evidence' }] : [];", 'if (evidence === undefined) return [];'],
  ['a missing evidence key is refused even for a hypothesis', R, "if (evidence === undefined) return needsReceipt ? [{ id: 'missing-evidence' }] : [];", "if (evidence === undefined) return [{ id: 'missing-evidence' }];"],
  ['evidence that is not a list is accepted', R, "if (!Array.isArray(evidence)) return [{ id: 'bad-evidence' }];", ''],
  ['an empty list satisfies a measured finding', R, 'needsReceipt && evidence.length === 0', 'false'],
  ['an empty list is refused for a hypothesis', R, 'needsReceipt && evidence.length === 0', 'evidence.length === 0'],
  ['a bad receipt is not numbered', R, "detail: String(index)", 'detail: undefined'],
  ['a bad receipt is not reported', R, '(isBadReceipt(receipt) ? [{ id: \'bad-receipt\', detail: String(index) }] : [])', '[]'],
  ['a closure needs no receipt', R, 'evidenceProblems(record, !isFinding || record.basis === \'measured\')', 'evidenceProblems(record, isFinding && record.basis === \'measured\')'],
  ['a measured finding needs no receipt', R, "!isFinding || record.basis === 'measured'", '!isFinding'],
  ['every finding needs a receipt', R, "!isFinding || record.basis === 'measured'", 'true'],
  ['a receipt that is null is read', R, "if (receipt === null || typeof receipt !== 'object') return true;", ''],
  ['a receipt of another shape is accepted', R, '  return true;\n}\n\n/** Problems of a summary.', '  return false;\n}\n\n/** Problems of a summary.'],
  ['an exit code that is a fraction is accepted', R, 'Number.isInteger(receipt.exitCode)', "typeof receipt.exitCode === 'number'"],
  ['an exit code that is text is accepted', R, 'Number.isInteger(receipt.exitCode)', 'Number.isInteger(Number(receipt.exitCode))'],
  ['a command may be empty', R, '(isText(receipt.command) && ', '('],
  ['a path may be empty', R, "return !isText(receipt.path);", 'return false;'],
  ['a measurement may be empty', R, "return !isText(receipt.measurement);", 'return false;'],
  ['a receipt may mix shapes', R, "Object.keys(receipt).sort().join()", "Object.keys(receipt).join()"],
  ['a receipt may carry an extra key', R, "if (shape === 'path') return", "if (shape.startsWith('path')) return"],

  // The rules across lines.
  ['a duplicate finding is accepted', R, "if (findings.has(record.id)) problems.push({ line, id: 'duplicate-id', detail: record.id });\n      else findings.set(record.id, record);", 'findings.set(record.id, record);'],
  ['a closure with no finding is accepted', R, "if (!findings.has(record.id)) problems.push({ line, id: 'orphan-closure' });", "if (false) problems.push({ line, id: 'orphan-closure' });"],
  ['a second closure is accepted', R, "else if (closed.has(record.id)) problems.push({ line, id: 'already-closed', detail: record.id });", "else if (false) problems.push({ line, id: 'already-closed', detail: record.id });"],
  ['a closure dated before its finding is accepted', R, 'record.at < findings.get(record.id).at', 'false'],
  ['a closure dated the same day is refused', R, 'record.at < findings.get(record.id).at', 'record.at <= findings.get(record.id).at'],
  ['a closure is compared with a date that is not one', R, "isDate(record.at) && isDate(findings.get(record.id).at) && ", ''],
  ['a finding with a malformed id is registered', R, "|| typeof record.id !== 'string' || !ID_FORMAT.test(record.id)) continue;", ') continue;'],
  ['a closure is registered as a finding', R, "if (record.kind === 'finding') {\n      if (findings.has", "if (record.kind !== 'closure') {\n      if (findings.has"],
  ['problems are not put in line order', R, 'problems.sort((left, right) => left.line - right.line)', 'problems'],
  ['a closure of a later finding counts', R, "findings.set(record.id, record);", "findings.set(record.id, record); findings.set('F-00000000', record);"],

  // Reading and listing.
  ['a blank line is read as JSON', R, "if (content.trim() === '') return;", ''],
  ['lines are numbered from zero', R, 'const line = index + 1;', 'const line = index;'],
  ['an invalid line is not reported', R, "problems.push({ line, id: 'invalid-json' });", ''],
  ['an invalid line becomes an entry', R, "problems.push({ line, id: 'invalid-json' });", "entries.push({ line, record: null });"],
  ['a closed finding stays open', R, "entries.filter(({ record }) => record?.kind === 'closure')", 'entries.filter(() => false)'],
  ['a closure counts as an open finding', R, "record?.kind === 'finding' && !closedIds.has(record.id)", '!closedIds.has(record.id)'],
  ['every closure closes every finding', R, '!closedIds.has(record.id)', 'closedIds.size === 0'],
  ['a finding is listed with its closure kind unchecked', R, "entries.filter(({ record }) => record?.kind === 'closure').map(({ record }) => record.id)", 'entries.map(({ record }) => record.id)'],
  ['a row drops the source', R, ' (${record.source}):', ':'],
  ['a row drops the Spanish half', R, ' @es ${record.summary.es}`;', '`;'],
  ['a row is not in the house form', R, '${record.summary.en} @es ${record.summary.es}', '${record.summary.en} ${record.summary.es}'],

  // Appending.
  ['the caller can set the version', R, 'const record = { ...input, v: SCHEMA_VERSION, at: now() };', 'const record = { v: SCHEMA_VERSION, at: now(), ...input };'],
  ['the caller can set the date', R, 'const record = { ...input, v: SCHEMA_VERSION, at: now() };', 'const record = { at: now(), ...input, v: SCHEMA_VERSION };'],
  ['the caller can choose the id of a finding', R, "if (record.kind === 'finding') record.id = deriveId(String(record.scope), String(record.summary?.en));", ''],
  ['the id of a closure is derived', R, "if (record.kind === 'finding') record.id", "if (record.kind !== 'x') record.id"],
  ['the date is read in another form', R, 'new Date().toISOString().slice(0, 10)', 'new Date().toISOString()'],
  ['a refused record is written anyway', R, 'if (problems.length > 0) return { ok: false, problems };', ''],
  ['the register is not validated with the new line', R, 'validate(`${base}${line}\\n`)', 'validate(`${line}\\n`)'],
  ['the register is validated without the new line', R, 'validate(`${base}${line}\\n`)', 'validate(base)'],
  ['the folder is not created', R, 'mkdirSync(path.dirname(file), { recursive: true });', ''],
  ['a missing final newline is not repaired', R, "existing === '' || existing.endsWith('\\n') ? existing : `${existing}\\n`", 'existing'],
  ['a repaired newline is not written', R, "`${base === existing ? '' : '\\n'}${line}\\n`", '`${line}\\n`'],
  ['a line is written without its newline', R, "`${base === existing ? '' : '\\n'}${line}\\n`", "`${base === existing ? '' : '\\n'}${line}`"],
  ['the keys are not written in schema order', R, 'known.filter((key) => key in record).map((key) => [key, record[key]])', '[]'],
  ['the keys the schema does not know are dropped', R, ', ...Object.entries(record).filter(([key]) => !known.includes(key))', ''],
  ['an existing register is overwritten, not extended', R, 'appendFileSync(file,', 'writeFileSync(file,'],

  // The command line.
  ['the default register is not under the folder', R, 'path.resolve(cwd, flags[\'--file\'] ?? DEFAULT_REGISTER_PATH)', 'path.resolve(flags[\'--file\'] ?? DEFAULT_REGISTER_PATH)'],
  ['the default register is somewhere else', R, "export const DEFAULT_REGISTER_PATH = '.claude/FINDINGS.jsonl';", "export const DEFAULT_REGISTER_PATH = 'FINDINGS.jsonl';"],
  ['--file is ignored', R, "flags['--file'] ?? DEFAULT_REGISTER_PATH", 'DEFAULT_REGISTER_PATH'],
  ['a missing command is not a usage error', R, 'if (!Object.hasOwn(COMMANDS, command)) {', 'if (false) {'],
  ['a usage error exits 1', R, "speaker.complain('cli.usage', { detail: command ?? 'command' });\n\n    return 2;", "speaker.complain('cli.usage', { detail: command ?? 'command' });\n\n    return 1;"],
  ['a flag error exits 1', R, "speaker.complain('cli.usage', { detail: error });\n\n    return 2;", "speaker.complain('cli.usage', { detail: error });\n\n    return 1;"],
  ['a flag of another command is accepted', R, '!COMMANDS[command].includes(flag)', 'false'],
  ['a flag without its value is accepted', R, '|| value === undefined) return { error: flag };', ') return { error: flag };'],
  ['a repeated flag is accepted', R, 'else if (Object.hasOwn(flags, flag)) return { error: flag };', ''],
  ['--path cannot repeat', R, "new Set(['--path', '--measurement'])", "new Set(['--measurement'])"],
  ['--measurement cannot repeat', R, "new Set(['--path', '--measurement'])", "new Set(['--path'])"],
  ['a command without its exit code is accepted', R, "(flags['--cmd'] === undefined) !== (flags['--exit'] === undefined)", 'false'],
  ['the offending half of a receipt is not named', R, "flags['--cmd'] === undefined ? '--exit' : '--cmd'", "'--cmd'"],
  ['the receipts lose their order', R, "...(flags['--path'] ?? []).map((value) => ({ path: value })), ...(flags['--measurement'] ?? []).map((value) => ({ measurement: value }))]", "...(flags['--measurement'] ?? []).map((value) => ({ measurement: value })), ...(flags['--path'] ?? []).map((value) => ({ path: value }))]"],
  ['the exit code is passed as text', R, "exitCode: Number(flags['--exit'])", "exitCode: flags['--exit']"],
  ['a refused write exits 0', R, "speaker.complain('write.refused', { file, count: result.problems.length });\n\n      return 1;", "speaker.complain('write.refused', { file, count: result.problems.length });\n\n      return 0;"],
  ['a refused write does not name its problems', R, '      printProblems(result.problems);\n', ''],
  ['add and close say the same thing', R, 'speaker.say(`${command}.ok`', "speaker.say('add.ok'"],
  ['a missing register is an error for list', R, "speaker.say(command === 'list' ? 'register.missing-list' : 'register.missing-validate', { file });\n\n    return 0;", "speaker.say('register.missing-list', { file });\n\n    return 1;"],
  ['a missing register is named as a list one for validate', R, "command === 'list' ? 'register.missing-list' : 'register.missing-validate'", "'register.missing-list'"],
  ['an invalid register is listed anyway', R, 'if (problems.length > 0) {\n    printProblems(problems);', 'if (false) {\n    printProblems(problems);'],
  ['an invalid register exits 0', R, "speaker.complain('validate.invalid', { file, count: problems.length });\n\n    return 1;", "speaker.complain('validate.invalid', { file, count: problems.length });\n\n    return 0;"],
  ['validate lists the findings too', R, "if (command === 'validate') {", "if (command === 'x') {"],
  ['list prints no count', R, "speaker.say('list.count', { count: open.length, file });", ''],
  ['list prints every finding, closed ones too', R, 'const open = openFindings(entries);', 'const open = entries.map(({ record }) => record).filter((record) => record.kind === \'finding\');'],
  ['a problem line has no number', R, "{ line, detail: detail ?? '' }", "{ line: '', detail: detail ?? '' }"],
  ['close sends a finding', R, ": { kind: 'closure', id: flags['--id'], ...content }", ": { kind: 'finding', id: flags['--id'], ...content }"],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof', 'bilingual-output'], selftest: 'gates-kit/findings-register.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
