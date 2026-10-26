#!/usr/bin/env node
/**
 * Runs any command and prints a short verdict instead of its output: one verdict word with the real exit
 * code, the log path, and a capped excerpt of the failure. The full log stays on disk under a run directory.
 *
 *   node ~/.claude/gate-summary/run.mjs [--cwd <dir>] [--excerpt <n>] [--timeout <s>] [--state <dir>] -- <command> [args...]
 *
 * Exit code: the command's own; 124 when it was killed; 127 when it could not start; 2 for bad usage, or when
 * its run directory cannot be opened (nothing ran: not measured).
 * @es Corre cualquier orden e imprime un veredicto corto en lugar de su salida: una palabra de veredicto con
 * el código de salida real, la ruta del log y un extracto acotado del fallo. El log completo queda en disco.
 * Sale con 2 ante un mal uso o si no puede abrir su directorio de corrida (no corrió nada: no medido).
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { markerLines, tail } from './markers.mjs';
import { say } from './messages.mjs';
import { parseOptions } from './options.mjs';
import { openRun } from './run-directory.mjs';
import { runCommand } from './run-command.mjs';
import { classify, exitCodeOf, VERDICTS } from './verdict.mjs';

/** The lines printed after the verdict line, by verdict. @es Las líneas tras la del veredicto, según el veredicto. */
function details(verdict, outcome, log, markers, limit) {
  if (verdict === VERDICTS.KILLED) return [say('killed')];
  if (verdict === VERDICTS.NOT_RUN) return [say('notRun', { reason: outcome.error })];

  const lines = verdict === VERDICTS.GREEN ? [] : markers.length > 0 ? markers : log.split(/\r?\n/);
  const shown = tail(lines, limit);
  const head = verdict === VERDICTS.MARKS ? [say('marks', { count: markers.length })] : [];

  return shown.length === 0 ? head : [...head, say('excerpt', { shown: shown.length, total: lines.length }), ...shown];
}

/** Runs the command `args` names and returns this process's exit code. @es Ejecuta la orden que nombra `args` y devuelve el código de salida. */
export function main(args, write = (line) => process.stdout.write(`${line}\n`)) {
  const options = parseOptions(args);

  if (options.problem !== undefined) {
    write(options.problem === '--' ? say('usage') : `${say('badOption', { option: options.problem })}\n${say('usage')}`);

    return 2;
  }

  let run;

  try {
    run = openRun(path.resolve(options.state));
  } catch (error) {
    // Nothing ran, so this is "not measured", never a verdict about the command. @es No corrió nada: «no medido», nunca un veredicto.
    write(say('noRunDirectory', { state: path.resolve(options.state), reason: error.code ?? error.message }));

    return 2;
  }

  const outcome = runCommand({ argv: options.argv, cwd: path.resolve(options.cwd), logFile: run.logFile, timeoutSeconds: options.timeout });
  const log = readFileSync(run.logFile, 'utf8');
  const markers = markerLines(log);
  const verdict = classify(outcome, markers.length);
  const exit = exitCodeOf(verdict, outcome);

  appendFileSync(run.logFile, `\nEXIT=${exit}\n`);
  write(`${verdict} EXIT=${exit} RUN=${run.runId}\nLOG=${run.logFile}`);

  for (const line of details(verdict, outcome, log, markers, options.excerpt)) write(line);

  return exit;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2));
