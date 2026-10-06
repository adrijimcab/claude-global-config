#!/usr/bin/env node
/**
 * The per-repository findings register: where a gap an agent finds, in the repository or in one it may not
 * edit, is written down with its evidence instead of being routed around, and where it stays until it is
 * closed with evidence. The contract templates (`templates/<stack>/AGENT-CONTRACT.md`) name its path; G4 says a
 * gap found out of scope "becomes a finding with its evidence, never an edit", G6 says a closed item needs
 * "the command, its real exit code, the path or the measurement", and a claim without a receipt "is a
 * hypothesis and is marked as one". This module is that rule made checkable.
 *
 * Format: `.claude/FINDINGS.jsonl` (`DEFAULT_REGISTER_PATH`), one JSON object per line, append-only, schema
 * version 1. A line is a `finding` (`v`, `kind`, `id`, `at`, `scope`, `source`, `basis`, `summary`,
 * `evidence`) or a `closure` of an earlier one (`v`, `kind`, `id`, `at`, `summary`, `evidence`). `id` is
 * `F-` and eight hex digits derived from the scope and the English summary, so a finding is never recorded
 * twice and never silently rewritten; `at` is a calendar day; `scope` is the repository or path the gap lives
 * in; `source` is the gate, tool or review that produced it; `basis` is `measured` or `hypothesis`;
 * `summary` is `{ en, es }` on one line each, the Spanish never a copy of the English; `evidence` is a list of
 * receipts, each exactly one of `{ command, exitCode }`, `{ path }` or `{ measurement }`. A measured finding
 * and every closure need at least one receipt; a hypothesis may have none. No other key is accepted.
 *
 * Decisions: the register is NOT an exception registry. Nothing reads it to skip, tolerate or baseline a
 * failure, an open finding never turns a gate green, and the closed schema has no key that could say
 * "ignore". It only grows; a finding leaves the open list by a closure that carries its own receipt, never by
 * an edit. Appending validates the whole register first, so a corrupt register is repaired, not extended, and
 * a refused record writes nothing. The date is the writer's clock, not an input: nobody backdates a record.
 *
 * Usage: `node findings-register.mjs list|validate|add|close [--file <path>] ...`. `list` prints the open
 * findings; `validate` checks every line; `add` takes `--scope --source --basis measured|hypothesis --en --es`
 * and receipts as `--cmd <command> --exit <code>`, `--path <p>` and `--measurement <m>` (the last two may
 * repeat); `close` takes `--id --en --es` and at least one receipt. Without `--file` the register is
 * `.claude/FINDINGS.jsonl` under the current folder. Exit 0 done; 1 the register or the record has a problem;
 * 2 the call is wrong. Every printed line is English first, then `@es` Spanish.
 *
 * @es El registro de hallazgos de cada repositorio: donde una carencia que un agente encuentra, en el repo o en
 * uno que no puede editar, se anota con su evidencia en vez de rodearse, y donde se queda hasta cerrarse con
 * evidencia. Las plantillas de contrato nombran su ruta; G4 dice que una carencia fuera de alcance "se
 * convierte en un hallazgo con su evidencia, nunca en una edición", G6 que un ítem cerrado necesita "el
 * comando, su código de salida real, la ruta o la medición", y que una afirmación sin recibo "es una hipótesis
 * y se marca como tal". Este módulo es esa regla hecha comprobable.
 *
 * Formato: `.claude/FINDINGS.jsonl`, un objeto JSON por línea, solo se añade, versión 1 del esquema. Una línea
 * es un `finding` o un `closure` de uno anterior. `id` es `F-` y ocho dígitos hex derivados del scope y del
 * resumen en inglés, así un hallazgo no se anota dos veces ni se reescribe en silencio; `at` es un día de
 * calendario; `basis` es `measured` o `hypothesis`; `summary` es `{ en, es }` en una línea cada uno, el
 * español nunca una copia del inglés; `evidence` es una lista de recibos, cada uno exactamente un
 * `{ command, exitCode }`, un `{ path }` o un `{ measurement }`. Un hallazgo medido y todo cierre necesitan al
 * menos un recibo; una hipótesis puede no tener ninguno. No se acepta ninguna otra clave.
 *
 * Decisiones: el registro NO es un registro de excepciones. Nada lo lee para saltarse, tolerar o fijar como
 * línea base un fallo, un hallazgo abierto nunca pone un gate en verde, y el esquema cerrado no tiene ninguna
 * clave que pueda decir "ignorar". Solo crece; un hallazgo sale de la lista de abiertos por un cierre con su
 * propio recibo, nunca por una edición. Añadir valida primero todo el registro: uno corrupto se repara, no se
 * extiende, y un registro rechazado no escribe nada. La fecha es el reloj de quien escribe, no un dato de
 * entrada: nadie pone fecha atrasada. Salida 0 hecho; 1 el registro o el registro nuevo tiene un problema; 2
 * la llamada es incorrecta. Cada línea impresa va primero en inglés y luego en español tras `@es`.
 */

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { makeSpeaker } from '../bilingual-output/speaker.mjs';

/** Where a repository keeps its register, named by every contract template. @es Dónde guarda un repo su registro. */
export const DEFAULT_REGISTER_PATH = '.claude/FINDINGS.jsonl';

const SCHEMA_VERSION = 1;
const BASES = new Set(['measured', 'hypothesis']);
const ID_FORMAT = /^F-[0-9a-f]{8}$/;

/** The keys of each kind of line, in the order a line is written. @es Las claves de cada tipo de línea, en el orden en que se escriben. */
const KEYS = {
  finding: ['v', 'kind', 'id', 'at', 'scope', 'source', 'basis', 'summary', 'evidence'],
  closure: ['v', 'kind', 'id', 'at', 'summary', 'evidence'],
};

/** Every runtime message: `{ en, es }`. @es Todos los mensajes: `{ en, es }`. */
export const MESSAGES = {
  'problem.invalid-json': { en: 'line {line}: not valid JSON', es: 'línea {line}: no es JSON válido' },
  'problem.not-object': { en: 'line {line}: not a JSON object', es: 'línea {line}: no es un objeto JSON' },
  'problem.bad-version': { en: 'line {line}: the schema version is not 1', es: 'línea {line}: la versión del esquema no es 1' },
  'problem.bad-kind': { en: 'line {line}: the kind is neither finding nor closure', es: 'línea {line}: el tipo no es finding ni closure' },
  'problem.unknown-key': { en: 'line {line}: unknown key {detail}', es: 'línea {line}: clave desconocida {detail}' },
  'problem.bad-id': { en: 'line {line}: the id is not F- and eight lowercase hex digits', es: 'línea {line}: el id no es F- y ocho dígitos hex en minúscula' },
  'problem.id-mismatch': { en: 'line {line}: the id is not the one derived from the scope and the English summary', es: 'línea {line}: el id no es el derivado del scope y del resumen en inglés' },
  'problem.bad-date': { en: 'line {line}: the date is not a calendar day as YYYY-MM-DD', es: 'línea {line}: la fecha no es un día de calendario como AAAA-MM-DD' },
  'problem.missing-scope': { en: 'line {line}: the scope is empty or missing', es: 'línea {line}: el scope está vacío o falta' },
  'problem.missing-source': { en: 'line {line}: the source is empty or missing', es: 'línea {line}: el source está vacío o falta' },
  'problem.bad-basis': { en: 'line {line}: the basis is neither measured nor hypothesis', es: 'línea {line}: la basis no es measured ni hypothesis' },
  'problem.summary-not-bilingual': { en: 'line {line}: the summary lacks a language, copies one into the other, or names other placeholders in each', es: 'línea {line}: al resumen le falta un idioma, copia uno en otro o nombra marcadores distintos en cada uno' },
  'problem.summary-multiline': { en: 'line {line}: the summary is on several lines', es: 'línea {line}: el resumen ocupa varias líneas' },
  'problem.missing-evidence': { en: 'line {line}: a measured finding and a closure need at least one receipt', es: 'línea {line}: un hallazgo medido y un cierre necesitan al menos un recibo' },
  'problem.bad-evidence': { en: 'line {line}: the evidence is not a list', es: 'línea {line}: la evidencia no es una lista' },
  'problem.bad-receipt': { en: 'line {line}: receipt {detail} is not a command with its exit code, a path or a measurement', es: 'línea {line}: el recibo {detail} no es un comando con su código de salida, una ruta ni una medición' },
  'problem.duplicate-id': { en: 'line {line}: finding {detail} is already recorded', es: 'línea {line}: el hallazgo {detail} ya está anotado' },
  'problem.orphan-closure': { en: 'line {line}: the closure names no finding recorded before it', es: 'línea {line}: el cierre no nombra ningún hallazgo anotado antes' },
  'problem.already-closed': { en: 'line {line}: finding {detail} is already closed', es: 'línea {line}: el hallazgo {detail} ya está cerrado' },
  'problem.closure-before-finding': { en: 'line {line}: the closure is dated before its finding', es: 'línea {line}: el cierre está fechado antes que su hallazgo' },
  'register.missing-list': { en: 'no register at {file}: 0 open finding(s)', es: 'no hay registro en {file}: 0 hallazgo(s) abierto(s)' },
  'register.missing-validate': { en: 'no register at {file}: nothing to validate', es: 'no hay registro en {file}: nada que validar' },
  'list.count': { en: '{count} open finding(s) in {file}', es: '{count} hallazgo(s) abierto(s) en {file}' },
  'validate.ok': { en: 'the register {file} is valid ({count} record(s))', es: 'el registro {file} es válido ({count} registro(s))' },
  'validate.invalid': { en: '{file}: {count} problem(s)', es: '{file}: {count} problema(s)' },
  'add.ok': { en: 'recorded finding {id} in {file}', es: 'hallazgo {id} anotado en {file}' },
  'close.ok': { en: 'closed finding {id} in {file}', es: 'hallazgo {id} cerrado en {file}' },
  'write.refused': { en: 'refused, nothing was written to {file}: {count} problem(s)', es: 'rechazado, no se escribió nada en {file}: {count} problema(s)' },
  'cli.usage': { en: 'unknown or incomplete input {detail}; usage: findings-register.mjs <list|validate|add|close> [--file <path>], add and close take their fields as flags (see the header of the file)', es: 'entrada desconocida o incompleta {detail}; uso: findings-register.mjs <list|validate|add|close> [--file <ruta>], add y close reciben sus campos como flags (ver la cabecera del fichero)' },
};

/** The id of a finding: `F-` and eight hex digits of the hash of its scope and English summary. @es El id de un hallazgo. */
export function deriveId(scope, summaryEnglish) {
  return `F-${createHash('sha256').update(`${scope}\n${summaryEnglish}`).digest('hex').slice(0, 8)}`;
}

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Whether `value` is a calendar day written exactly as `YYYY-MM-DD`: it is read as a date and written back, and
 * only the same text passes, so a month 13, a February 30, a missing zero or a time of day all fail.
 * @es Si `value` es un día de calendario escrito exactamente `AAAA-MM-DD`: se lee como fecha y se escribe de
 * vuelta, y solo pasa el mismo texto.
 */
function isDate(value) {
  const date = new Date(value);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Whether a receipt is NOT exactly one of the three shapes. @es Si un recibo NO es exactamente una de las tres formas. */
function isBadReceipt(receipt) {
  if (receipt === null || typeof receipt !== 'object') return true;

  const shape = Object.keys(receipt).sort().join();

  if (shape === 'command,exitCode') return !(isText(receipt.command) && Number.isInteger(receipt.exitCode));
  if (shape === 'path') return !isText(receipt.path);
  if (shape === 'measurement') return !isText(receipt.measurement);

  return true;
}

/** Problems of a summary. @es Problemas de un resumen. */
function summaryProblems(summary) {
  const text = summary !== null && typeof summary === 'object' ? summary : {};

  if (typeof text.en !== 'string' || typeof text.es !== 'string' || messageProblems({ summary }).length > 0) return [{ id: 'summary-not-bilingual' }];
  if (/[\r\n]/.test(text.en + text.es)) return [{ id: 'summary-multiline' }];

  return [];
}

/** Problems of the evidence of a record that needs it or not. @es Problemas de la evidencia. */
function evidenceProblems(record, needsReceipt) {
  const { evidence } = record;

  if (evidence === undefined) return needsReceipt ? [{ id: 'missing-evidence' }] : [];
  if (!Array.isArray(evidence)) return [{ id: 'bad-evidence' }];

  const bad = evidence.flatMap((receipt, index) => (isBadReceipt(receipt) ? [{ id: 'bad-receipt', detail: String(index) }] : []));

  return needsReceipt && evidence.length === 0 ? [{ id: 'missing-evidence' }] : bad;
}

/** Problems of one parsed line taken alone. @es Problemas de una línea leída, sola. */
function recordProblems(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return [{ id: 'not-object' }];

  const problems = [];
  const keys = KEYS[record.kind];

  if (record.v !== SCHEMA_VERSION) problems.push({ id: 'bad-version' });
  if (keys === undefined || !Object.hasOwn(KEYS, record.kind)) return [...problems, { id: 'bad-kind' }];

  for (const key of Object.keys(record)) if (!keys.includes(key)) problems.push({ id: 'unknown-key', detail: key });

  const isFinding = record.kind === 'finding';

  if (typeof record.id !== 'string' || !ID_FORMAT.test(record.id)) problems.push({ id: 'bad-id' });
  else if (isFinding && typeof record.scope === 'string' && typeof record.summary?.en === 'string' && record.id !== deriveId(record.scope, record.summary.en)) problems.push({ id: 'id-mismatch' });

  if (!isDate(record.at)) problems.push({ id: 'bad-date' });

  if (isFinding) {
    if (!isText(record.scope)) problems.push({ id: 'missing-scope' });
    if (!isText(record.source)) problems.push({ id: 'missing-source' });
    if (!BASES.has(record.basis)) problems.push({ id: 'bad-basis' });
  }

  problems.push(...summaryProblems(record.summary));
  problems.push(...evidenceProblems(record, !isFinding || record.basis === 'measured'));

  return problems;
}

/**
 * Reads the text of a register: `{ entries: [{ line, record }], problems: [{ line, id }] }`. A line that is not
 * JSON is a problem and is not an entry; a blank line is skipped but still counts for the numbering.
 * @es Lee el texto de un registro. Una línea que no es JSON es un problema y no una entrada; una línea en
 * blanco se salta pero cuenta en la numeración.
 */
export function readRegister(text) {
  const entries = [];
  const problems = [];

  text.split('\n').forEach((content, index) => {
    const line = index + 1;

    if (content.trim() === '') return;

    try {
      entries.push({ line, record: JSON.parse(content) });
    } catch {
      problems.push({ line, id: 'invalid-json' });
    }
  });

  return { entries, problems };
}

/**
 * Every problem of a register text, in line order, each `{ line, id, detail? }`: the rules of each line and the
 * rules across lines (a duplicate id, a closure with no finding before it, a second closure, a closure dated
 * before its finding). Empty when the register is valid.
 * @es Todos los problemas de un registro, por orden de línea: las reglas de cada línea y las reglas entre
 * líneas. Vacío cuando el registro es válido.
 */
export function validate(text) {
  const { entries, problems } = readRegister(text);
  const findings = new Map();
  const closed = new Set();

  for (const { line, record } of entries) {
    problems.push(...recordProblems(record).map((problem) => ({ line, ...problem })));

    if (record === null || typeof record !== 'object' || typeof record.id !== 'string' || !ID_FORMAT.test(record.id)) continue;

    if (record.kind === 'finding') {
      if (findings.has(record.id)) problems.push({ line, id: 'duplicate-id', detail: record.id });
      else findings.set(record.id, record);
    } else if (record.kind === 'closure') {
      if (!findings.has(record.id)) problems.push({ line, id: 'orphan-closure' });
      else if (closed.has(record.id)) problems.push({ line, id: 'already-closed', detail: record.id });
      else {
        closed.add(record.id);

        if (isDate(record.at) && isDate(findings.get(record.id).at) && record.at < findings.get(record.id).at) problems.push({ line, id: 'closure-before-finding' });
      }
    }
  }

  return problems.sort((left, right) => left.line - right.line);
}

/** The findings no closure names, in the order they were recorded. @es Los hallazgos que ningún cierre nombra, en orden. */
export function openFindings(entries) {
  const closedIds = new Set(entries.filter(({ record }) => record?.kind === 'closure').map(({ record }) => record.id));

  return entries.filter(({ record }) => record?.kind === 'finding' && !closedIds.has(record.id)).map(({ record }) => record);
}

/** One open finding as a listing row, ending in the summary in the house bilingual form. @es Un hallazgo abierto como fila de listado. */
export function rowOf(record) {
  return `${record.id} ${record.at} [${record.basis}] ${record.scope} (${record.source}): ${record.summary.en} @es ${record.summary.es}`;
}

/** The record with its keys in the order a line is written; keys the schema does not know follow. @es El registro con sus claves en orden. */
function inWritingOrder(record) {
  const known = KEYS[record.kind] ?? [];

  return Object.fromEntries([...known.filter((key) => key in record).map((key) => [key, record[key]]), ...Object.entries(record).filter(([key]) => !known.includes(key))]);
}

/** Today as `YYYY-MM-DD`. @es Hoy como `AAAA-MM-DD`. */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Appends one record to the register at `file` and returns `{ ok: true, record }`, or `{ ok: false, problems }`
 * with nothing written. `input` holds the content of a `finding` (`scope`, `source`, `basis`, `summary`,
 * `evidence`) or of a `closure` (`id`, `summary`, `evidence`); the version, the date (`now()`, the writer's
 * clock) and a finding's id are set here and cannot be given. The whole register, with the new line, must be
 * valid, so a corrupt register is not extended and a duplicate or an orphan closure is refused.
 * @es Añade un registro al registro de `file`. La versión, la fecha y el id de un hallazgo los fija esta
 * función y no se pueden dar. Todo el registro, con la línea nueva, debe ser válido: uno corrupto no se
 * extiende, y un duplicado o un cierre huérfano se rechaza.
 */
export function append(file, input, { now = today } = {}) {
  const record = { ...input, v: SCHEMA_VERSION, at: now() };

  if (record.kind === 'finding') record.id = deriveId(String(record.scope), String(record.summary?.en));

  const line = JSON.stringify(inWritingOrder(record));
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const base = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`;
  const problems = validate(`${base}${line}\n`);

  if (problems.length > 0) return { ok: false, problems };

  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${base === existing ? '' : '\n'}${line}\n`);

  return { ok: true, record: JSON.parse(line) };
}

/** The flags each command accepts; `repeats` may appear more than once. @es Los flags de cada comando. */
const COMMANDS = {
  list: ['--file'],
  validate: ['--file'],
  add: ['--file', '--scope', '--source', '--basis', '--en', '--es', '--cmd', '--exit', '--path', '--measurement'],
  close: ['--file', '--id', '--en', '--es', '--cmd', '--exit', '--path', '--measurement'],
};
const REPEATS = new Set(['--path', '--measurement']);

/** Parses the flags of a command: `{ flags }` or `{ error }` naming the offending input. @es Lee los flags de un comando. */
function parseFlags(command, tokens) {
  const flags = {};

  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];

    if (!COMMANDS[command].includes(flag) || value === undefined) return { error: flag };
    if (REPEATS.has(flag)) flags[flag] = [...(flags[flag] ?? []), value];
    else if (Object.hasOwn(flags, flag)) return { error: flag };
    else flags[flag] = value;
  }

  if ((flags['--cmd'] === undefined) !== (flags['--exit'] === undefined)) return { error: flags['--cmd'] === undefined ? '--exit' : '--cmd' };

  return { flags };
}

/** The receipts a command was given, in the order command, paths, measurements. @es Los recibos dados a un comando. */
function receiptsOf(flags) {
  return [...(flags['--cmd'] === undefined ? [] : [{ command: flags['--cmd'], exitCode: Number(flags['--exit']) }]), ...(flags['--path'] ?? []).map((value) => ({ path: value })), ...(flags['--measurement'] ?? []).map((value) => ({ measurement: value }))];
}

/**
 * Runs the command line over `argv` and returns the exit code. `cwd` anchors the default register, `now` is the
 * writer's clock and `sink` replaces the console (`log` and `error`).
 * @es Corre la línea de comandos y devuelve el código de salida. `cwd` ancla el registro por defecto, `now` es
 * el reloj de quien escribe y `sink` sustituye la consola.
 */
export function main(argv, { cwd = process.cwd(), now = today, sink = console } = {}) {
  const speaker = makeSpeaker(MESSAGES, sink);
  const [command, ...tokens] = argv;

  if (!Object.hasOwn(COMMANDS, command)) {
    speaker.complain('cli.usage', { detail: command ?? 'command' });

    return 2;
  }

  const { flags, error } = parseFlags(command, tokens);

  if (error !== undefined) {
    speaker.complain('cli.usage', { detail: error });

    return 2;
  }

  const file = path.resolve(cwd, flags['--file'] ?? DEFAULT_REGISTER_PATH);
  const printProblems = (problems) => problems.forEach(({ line, id, detail }) => speaker.complain(`problem.${id}`, { line, detail: detail ?? '' }));

  if (command === 'add' || command === 'close') {
    const content = { summary: { en: flags['--en'], es: flags['--es'] }, evidence: receiptsOf(flags) };
    const input = command === 'add' ? { kind: 'finding', scope: flags['--scope'], source: flags['--source'], basis: flags['--basis'], ...content } : { kind: 'closure', id: flags['--id'], ...content };
    const result = append(file, input, { now });

    if (!result.ok) {
      printProblems(result.problems);
      speaker.complain('write.refused', { file, count: result.problems.length });

      return 1;
    }

    speaker.say(`${command}.ok`, { id: result.record.id, file });

    return 0;
  }

  if (!existsSync(file)) {
    speaker.say(command === 'list' ? 'register.missing-list' : 'register.missing-validate', { file });

    return 0;
  }

  const text = readFileSync(file, 'utf8');
  const problems = validate(text);

  if (problems.length > 0) {
    printProblems(problems);
    speaker.complain('validate.invalid', { file, count: problems.length });

    return 1;
  }

  const { entries } = readRegister(text);

  if (command === 'validate') {
    speaker.say('validate.ok', { file, count: entries.length });

    return 0;
  }

  const open = openFindings(entries);

  for (const record of open) speaker.data(rowOf(record));
  speaker.say('list.count', { count: open.length, file });

  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
