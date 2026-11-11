#!/usr/bin/env node
/**
 * The decisions of session-processes, each broken once, that `selftest.mjs` must catch: which processes belong to the
 * session and how each is ended (`ownership.mjs`), the sweep over its ports (`sweep.mjs`), the single-process end
 * (`kill-process.mjs`), the table parser (`process-table.mjs`) and the hook (`end.mjs`). A survivor is a missing
 * assertion, never a mutant to soften; a mutant that only crashes the selftest counts as a survivor.
 * @es Las decisiones de session-processes, rotas una a una, que `selftest.mjs` debe cazar: qué procesos son de la
 * sesión y cómo se termina cada uno, el barrido sobre sus puertos, el fin de un solo proceso, el analizador de la tabla
 * y el hook. Un superviviente es una aserción que falta, nunca un mutante que ablandar; un mutante que solo hace caer
 * el selftest cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const O = 'session-processes/ownership.mjs';
const S = 'session-processes/sweep.mjs';
const K = 'session-processes/kill-process.mjs';
const T = 'session-processes/process-table.mjs';
const E = 'session-processes/end.mjs';

const MUTANTS = [
  // Which processes are the session's. @es Qué procesos son de la sesión.
  ['backslash separators are not normalised', O, String.raw`temp.split('\\').join('/').replace`, 'temp.replace'],
  ['a trailing separator makes another folder', O, String.raw`.replace(/\/+$/, '')`, ''],
  ['the case of a folder name matters', O, '.toLowerCase();', ';'],
  ['only the process TEMP is normalised, not the session one', O, 'comparable(row.temp) === comparable(sessionTemp)', 'comparable(row.temp) === sessionTemp'],
  ['a TEMP that only starts with the session folder is taken as the session', O, 'comparable(row.temp) === comparable(sessionTemp)', 'comparable(row.temp).startsWith(comparable(sessionTemp))'],
  ['a TEMP that is not a string is compared', O, "typeof row.temp === 'string' && ", ''],
  ['an empty TEMP matches an empty session folder', O, "row.temp !== '' && ", ''],
  // What is never ended. @es Lo que nunca se termina.
  ['the hook and its ancestors are not spared', O, '...lineageOf(rows, hookPid), ', ''],
  ['the descendants of the hook are not spared', O, ', ...descendantsOf(rows, hookPid).map((row) => row.pid)', ''],
  ['the spared processes are listed when they carry the session TEMP', O, 'carries(row, sessionTemp) && !spared.has(row.pid)', 'carries(row, sessionTemp)'],
  // How each is ended. @es Cómo se termina cada uno.
  ['a tree is ended whatever is below it', O, 'descendantsOf(rows, row.pid).every((below) => marked.has(below.pid))', 'descendantsOf(rows, row.pid).every(() => true)'],
  ['a tree is ended when only SOME of what is below is the session\'s', O, 'descendantsOf(rows, row.pid).every((below) => marked.has(below.pid))', 'descendantsOf(rows, row.pid).some((below) => marked.has(below.pid)) || descendantsOf(rows, row.pid).length === 0'],
  ['every marked process counts as a tree end', O, '.filter(endsAsTree)', '.filter(() => true)'],
  ['a process below a tree end is listed again', O, "const coveredAbove = [...lineageOf(rows, row.pid)].some((pid) => pid !== row.pid && treeEnders.has(pid) && !lineageOf(rows, pid).has(row.pid));", 'const coveredAbove = false;'],
  ['a tree end covers itself, so it is never listed', O, 'pid !== row.pid && treeEnders.has(pid)', 'treeEnders.has(pid)'],
  ['a marked process below an ordinary marked one is taken as covered', O, 'treeEnders.has(pid) && !lineageOf', 'marked.has(pid) && !lineageOf'],
  ['a parent cycle covers its members, so none is listed', O, ' && !lineageOf(rows, pid).has(row.pid)', ''],
  ['every entry is flagged as a tree', O, 'tree: treeEnders.has(row.pid)', 'tree: true'],
  ['the list is not ordered by pid', O, '.sort((left, right) => left.pid - right.pid)', ''],
  ['the name is not carried', O, 'name: row.name,', "name: '',"],
  // The sweep over its ports. @es El barrido sobre sus puertos.
  ['a tree entry is ended alone', S, 'target.tree ? killTree(target.pid) : killProcess(target.pid)', 'killProcess(target.pid)'],
  ['a single entry is ended as a tree', S, 'target.tree ? killTree(target.pid) : killProcess(target.pid)', 'killTree(target.pid)'],
  ['the outcome is always killed', S, 'outcome: ended.outcome', "outcome: 'killed'"],
  ['the failure detail is dropped', S, '...(ended.detail === undefined ? {} : { detail: ended.detail })', ''],
  ['the name is not reported', S, 'name: target.name,', "name: '',"],
  ['the tree flag is not reported', S, 'tree: target.tree,', 'tree: false,'],
  // The single-process end. @es El fin de un solo proceso.
  ['the process 1 is signalled', K, 'pid <= 1', 'pid < 1'],
  ['the caller can end itself', K, ' || pid === ownPid', ''],
  ['a fractional or NaN id is signalled', K, '!Number.isInteger(pid) || ', ''],
  ['a process already gone is a failure', K, "error?.code === 'ESRCH'", 'false'],
  ['the process is asked to stop instead of ended', K, "signal(pid, 'SIGKILL')", "signal(pid, 'SIGTERM')"],
  ['a thrown value that is not an Error loses its reason', K, 'error instanceof Error ? error.message : String(error)', 'error.message'],
  ['an ended process is reported as failed', K, "return { pid, outcome: 'killed' };", "return { pid, outcome: 'failed' };"],
  // The table. @es La tabla.
  ['a line whose pid is not a number is kept', T, String.raw`!/^\d+$/.test(pid) || `, ''],
  ['a line whose parent is not a number is kept', T, String.raw`!/^\d+$/.test(parentPid) || `, ''],
  ['a line with an extra column is kept', T, 'rest.length !== 1', 'rest.length < 1'],
  ['an unreadable environment reads as an empty TEMP', T, 'rest[0] === UNREADABLE ? undefined : rest[0]', 'rest[0]'],
  ['a CRLF ending is not accepted', T, String.raw`.split(/\r?\n/)`, String.raw`.split(/\n/)`],
  ['another platform answers an empty list', T, "if (platform !== 'win32') throw", 'if (false) throw'],
  ['a failing reader is read as an empty table', T, 'answer.status !== 0', 'false'],
  // The hook. @es El hook.
  ['a refused session id still sweeps', E, 'if (sessionTemp === undefined) return undefined;', ''],
  ['the payload session id is not read', E, 'tryParsePayload(raw)?.session_id', 'undefined'],
  ['the hook pid is not its own', E, 'hookPid = process.pid', 'hookPid = -1'],
  ['the temp root is not the shared one', E, 'root = realTempRoot()', "root = '/nonexistent-root'"],
  ['an ended process is not reported', E, 'record(lineFor(entry));', ';'],
  ['a failed end is reported as ended', E, "if (entry.outcome === 'failed') return", 'if (false) return'],
  ['a failed sweep is silent', E, '    record(`session-processes: the sweep failed', '    String(`session-processes: the sweep failed']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  // full-chain-lock/run.mjs runs as a child of the selftest, so its imports (bilingual-output among them) are outside
  // the static import closure and must be named here. @es run.mjs corre como hijo del selftest: sus imports
  // (bilingual-output entre ellos) quedan fuera del cierre estático de imports y se nombran aquí.
  paths: ['session-processes', 'session-temp', 'hook-io', 'process-control', 'process-reaper', 'full-chain-lock', 'hook-state', 'bilingual-output'],
  selftest: 'session-processes/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
