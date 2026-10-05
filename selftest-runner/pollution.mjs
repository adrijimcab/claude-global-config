#!/usr/bin/env node
/**
 * Proves a run did not pollute the real environment: it reads the real state directories, the main
 * checkout's `git status` and the temp root before and after the run and turns RED, naming each path, on any
 * difference. `node pollution.mjs [--home <dir>] [--checkout <dir>] [--temp <dir>] -- <command> [args]`
 * measures around one command; `measureRun` does the same around a function. Exit 0 GREEN, 1 RED, 2 not
 * measured (which says nothing about the code). A lead list of source files calling `homedir()` annotates
 * findings and never decides one.
 *
 * @es Prueba que una corrida no contaminó el entorno real: lee los directorios de estado reales, el `git
 * status` del checkout principal y la raíz temporal antes y después de la corrida y se pone ROJO, nombrando
 * cada ruta, ante cualquier diferencia. Salida 0 VERDE, 1 ROJO, 2 no medido (no dice nada del código). Una
 * lista de pistas de ficheros que llaman a `homedir()` anota hallazgos y nunca decide uno.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { claudeHome } from '../hook-state/locations.mjs';
import { annotate, locateHomedirUses } from './pollution-candidates.mjs';
import { MESSAGES } from './pollution-messages.mjs';
import { SnapshotError, snapshotOf } from './pollution-snapshot.mjs';

const EXIT_GREEN = 0;
const EXIT_RED = 1;
const EXIT_NOT_MEASURED = 2;
const OPTIONS = { '--home': 'home', '--checkout': 'checkout', '--temp': 'tempDir' };

/** Compares one area's maps, reporting the kinds of difference that area counts. @es Compara los mapas de un área, informando los tipos de diferencia que cuenta. */
function differences(area, before, after, kinds) {
  const found = [];

  for (const [changed, signature] of after) {
    if (!before.has(changed)) found.push({ area, path: changed, change: 'added' });
    else if (before.get(changed) !== signature) found.push({ area, path: changed, change: 'changed' });
  }

  for (const changed of before.keys()) if (!after.has(changed)) found.push({ area, path: changed, change: 'removed' });

  return found.filter(({ change }) => kinds.includes(change));
}

/**
 * Every path that differs between two snapshots. The temp root counts only additions: an entry the run
 * removed was not left behind by it.
 * @es Cada ruta que difiere entre dos instantáneas. La raíz temporal solo cuenta altas: una entrada que la corrida quitó no la dejó ella.
 */
export function compareSnapshots(before, after) {
  return [
    ...differences('state', before.state, after.state, ['added', 'changed', 'removed']),
    ...differences('checkout', before.checkout, after.checkout, ['added', 'changed', 'removed']),
    ...differences('temp', before.temp, after.temp, ['added'])
  ].sort((left, right) => `${left.area}/${left.path}`.localeCompare(`${right.area}/${right.path}`));
}

/**
 * Snapshots, runs `run`, snapshots again. A throwing run propagates: nothing was measured.
 * @es Instantánea, corre `run`, otra instantánea. Si `run` lanza, se propaga: no se midió nada.
 * @returns `{ result, changes, stateDirs }`. @es El resultado de `run`, los cambios y los directorios vigilados.
 */
export function measureRun(run, options) {
  const before = snapshotOf(options);
  const result = run();
  const changes = compareSnapshots(before, snapshotOf(options));
  const uses = changes.length === 0 ? [] : (options.locate ?? locateHomedirUses)({ root: options.home, env: options.env });

  return { result, changes: annotate(changes, uses), stateDirs: before.stateDirs };
}

/** Parses `[options] -- command...`; null when it cannot be run. @es Interpreta `[opciones] -- comando...`; null si no se puede correr. */
function parse(argv) {
  const split = argv.indexOf('--');
  const command = argv.slice(split + 1);
  const options = {};

  if (split === -1 || command.length === 0) return null;

  for (let at = 0; at < split; at += 2) {
    if (!Object.hasOwn(OPTIONS, argv[at]) || at + 1 === split) return null;

    options[OPTIONS[argv[at]]] = argv[at + 1];
  }

  return { options, command };
}

/** Prints the outcome and returns the exit code. @es Imprime el resultado y devuelve el código de salida. */
function report(speaker, { changes, stateDirs }, options) {
  speaker.say('population', { count: stateDirs.length, home: options.home });

  for (const change of changes) {
    speaker.say(`change-${change.change}`, { area: change.area, path: change.path });

    if (change.candidate) speaker.say('candidate', { mechanism: change.path.split('/')[0] });
  }

  speaker.say(changes.length === 0 ? 'green' : 'red', { count: changes.length });

  return changes.length === 0 ? EXIT_GREEN : EXIT_RED;
}

/**
 * The command line: runs the command between the snapshots, prints through the speaker, returns the exit code.
 * @es La línea de comandos: corre el comando entre las instantáneas, imprime por el speaker y devuelve el código de salida.
 */
export function main(argv, { sink = console, env = process.env } = {}) {
  const speaker = makeSpeaker(MESSAGES, sink);
  const parsed = parse(argv);

  if (parsed === null) {
    speaker.complain('usage');

    return EXIT_NOT_MEASURED;
  }

  const options = { home: claudeHome(), ...parsed.options, env };

  try {
    const outcome = measureRun(() => spawnSync(parsed.command[0], parsed.command.slice(1), { stdio: 'inherit', windowsHide: true }), options);

    if (outcome.result.error) {
      speaker.complain('not-measured', { reason: outcome.result.error.message });

      return EXIT_NOT_MEASURED;
    }

    if (outcome.result.status !== 0) speaker.say('command-exit', { status: outcome.result.status });

    return report(speaker, outcome, options);
  } catch (error) {
    if (!(error instanceof SnapshotError)) throw error;

    speaker.dataError(error.message);

    return EXIT_NOT_MEASURED;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
