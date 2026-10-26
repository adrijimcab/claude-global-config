#!/usr/bin/env node
/**
 * The decisions of the gate summary, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del resumen de gates, rotas una a una; las debe cazar `selftest.mjs`. El runner y sus
 * reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const VERDICT = 'gate-summary/verdict.mjs';
const MARKERS = 'gate-summary/markers.mjs';
const RUN = 'gate-summary/run.mjs';
const OPTIONS = 'gate-summary/options.mjs';
const DIRECTORY = 'gate-summary/run-directory.mjs';
const COMMAND = 'gate-summary/run-command.mjs';
const MESSAGES = 'gate-summary/messages.mjs';

const MUTANTS = [
  // --- WHICH VERDICT
  ['a missing command is graded RED instead of NOT-RUN', VERDICT, 'if (outcome.error !== undefined) return VERDICTS.NOT_RUN;', 'if (outcome.error !== undefined) return VERDICTS.RED;'],
  ['a timeout is graded RED instead of KILLED', VERDICT, 'if (outcome.timedOut || outcome.status === null) return VERDICTS.KILLED;', 'if (outcome.timedOut || outcome.status === null) return VERDICTS.RED;'],
  ['a command with no exit code is graded as a pass', VERDICT, 'outcome.timedOut || outcome.status === null', 'outcome.timedOut'],
  ['a non-zero exit is graded GREEN', VERDICT, 'if (outcome.status !== 0) return VERDICTS.RED;', 'if (outcome.status !== 0) return VERDICTS.GREEN;'],
  ['error markers never downgrade a green', VERDICT, 'markerCount > 0 ? VERDICTS.MARKS : VERDICTS.GREEN', 'VERDICTS.GREEN'],
  ['a single marker line is not enough to downgrade', VERDICT, 'markerCount > 0 ?', 'markerCount > 1 ?'],
  ['a kill returns the command\'s null status instead of 124', VERDICT, 'verdict === VERDICTS.KILLED ? EXIT_KILLED : outcome.status', 'outcome.status'],
  ['a missing command returns 0', VERDICT, 'if (verdict === VERDICTS.NOT_RUN) return EXIT_NOT_RUN;', 'if (verdict === VERDICTS.NOT_RUN) return 0;'],

  // --- WHAT IS A MARKER
  ['a clean "0 errors" count is a marker', MARKERS, 'MARKER.test(line) && !CLEAN_COUNT.test(line)', 'MARKER.test(line)'],
  ['a typed error name (TypeError) is not a marker', MARKERS, '\\b\\w*(error|exception)s?\\b', '\\b(error|exception)s?\\b'],
  ['an identifier that contains "error" is a marker', MARKERS, '\\b\\w*(error|exception)s?\\b', '\\w*(error|exception)s?\\w*'],
  ['npm ERR! is not a marker', MARKERS, '|ERR!/i', '/i'],
  ['the excerpt keeps the start of the log instead of the end', MARKERS, 'lines.slice(-limit)', 'lines.slice(0, limit)'],
  ['an excerpt of 0 lines prints the whole log', MARKERS, '(limit > 0 ? lines.slice(-limit) : [])', 'lines.slice(-limit)'],
  ['a long line is not cut', MARKERS, 'line.length > LINE_WIDTH ?', 'false ?'],

  // --- WHAT IS PRINTED AND RETURNED
  ['the summary returns 0 whatever the command did', RUN, 'return exit;', 'return 0;'],
  ['the log does not record EXIT=', RUN, "appendFileSync(run.logFile, `\\nEXIT=${exit}\\n`);", ''],
  ['a green run prints an excerpt', RUN, 'verdict === VERDICTS.GREEN ? []', 'false ? []'],
  ['a red run with markers excerpts the whole log, not the markers', RUN, 'markers.length > 0 ? markers : log.split', 'false ? markers : log.split'],
  ['a kill prints nothing about it', RUN, 'if (verdict === VERDICTS.KILLED) return [say(\'killed\')];', 'if (verdict === VERDICTS.KILLED) return [];'],
  ['the log path is not printed', RUN, '\\nLOG=${run.logFile}', ''],
  ['bad usage exits 0', RUN, '    return 2;', '    return 0;'],

  // --- WHERE THE LOG GOES
  ['every run shares one directory', DIRECTORY, 'const runId = idOf();', "const runId = 'fixed';"],
  ['two runs of one process can share an id', DIRECTORY, '-${randomBytes(3).toString(\'hex\')}`', '`'],
  ['the run directory is created non-exclusively', DIRECTORY, '  mkdirSync(directory);', '  mkdirSync(directory, { recursive: true });'],
  ['the command runs through a shell', COMMAND, 'windowsHide: true,', 'windowsHide: true, shell: true,'],
  ['the timeout is ignored', COMMAND, 'timeout: timeoutSeconds > 0 ? timeoutSeconds * 1000 : undefined', 'timeout: undefined'],
  ['the command runs in the wrong directory', COMMAND, '{ cwd, stdio:', '{ stdio:'],
  ['stderr is not captured in the log', COMMAND, "stdio: ['ignore', descriptor, descriptor]", "stdio: ['ignore', descriptor, 'ignore']"],
  ['npm is not resolved to node plus its CLI', COMMAND, "(command === 'npm' || command === 'npx') && existsSync(cli)", 'false'],

  // --- THE COMMAND LINE
  ['a missing -- is accepted', OPTIONS, "if (separator === -1 || separator === args.length - 1) return { problem: '--' };", 'if (separator === -1) return { problem: \'--\' };'],
  ['an empty command after -- is accepted', OPTIONS, 'separator === args.length - 1', 'false'],
  ['an unknown option is accepted', OPTIONS, '!(NUMERIC.has(name) || TEXT.has(name))', 'false'],
  ['a non-numeric excerpt is accepted', OPTIONS, "if (NUMERIC.has(name) && !(Number.isInteger(Number(value)) && Number(value) >= 0)) return { problem: name };", ''],
  ['the command loses its own flags', OPTIONS, 'args.slice(separator + 1)', 'args.slice(separator + 1).filter((word) => !word.startsWith(\'-\'))'],
  ['the default excerpt is empty', OPTIONS, 'excerpt: 20,', 'excerpt: 0,'],
  ['the default state bypasses the state-location module', DIRECTORY, "export const defaultState = () => stateDir('gate-summary');", "export const defaultState = () => path.join(process.cwd(), '.gate-summary-state');"],
  ['the default state is resolved once, at import, not when asked', OPTIONS, "import { defaultState } from './run-directory.mjs';", "import { defaultState as resolveState } from './run-directory.mjs';\nconst FROZEN_STATE = resolveState();\nconst defaultState = () => FROZEN_STATE;"],

  // --- BILINGUAL
  ['the notRun message loses its Spanish half', MESSAGES, "es: 'no se pudo iniciar la orden ({reason}); no dice nada del código.'", "es: 'no se pudo iniciar la orden; no dice nada del código.'"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['gate-summary', 'bilingual-output', 'mutation-proof', 'hook-state'],
  selftest: 'gate-summary/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
