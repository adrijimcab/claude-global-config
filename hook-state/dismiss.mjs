#!/usr/bin/env node
/**
 * Records the outcome of a block of a hook mechanism in its v2 journal, and answers whether a block is lifted.
 * `--mechanism <m> --block <id> --reason <text>` appends one `dismissal` for that block (recorded once);
 * adding `--false-positive` appends a `false-positive-report` instead. Only a dismissal lifts a block: a
 * false-positive report is information about the guard and the block stays in force. Every printed line is
 * a bilingual message of `message-table.mjs`; a refusal exits 2 and writes nothing.
 *
 * @es Registra en el journal v2 de un mecanismo de hooks el desenlace de un bloqueo y responde si un bloqueo
 * está levantado. `--mechanism <m> --block <id> --reason <texto>` añade un `dismissal` de ese bloqueo (se
 * registra una sola vez); con `--false-positive` añade un `false-positive-report`. Solo un descarte levanta un
 * bloqueo: un informe de falso positivo es información sobre el guard y el bloqueo sigue vigente. Cada línea
 * impresa es un mensaje bilingüe de `message-table.mjs`; un rechazo sale con 2 y no escribe nada.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { appendRecord, digestInput, journalPath } from './journal.mjs';
import { assertMechanism } from './locations.mjs';
import { MESSAGE_TABLE, bilingual } from './message-table.mjs';

/** A refusal of the command's own input: exit 2, nothing written. @es Un rechazo de la entrada del comando: sale con 2, sin escribir nada. */
class Refusal extends Error {}

const VALUE_OPTIONS = ['--mechanism', '--block', '--reason'];
const FALSE_POSITIVE = '--false-positive';

/**
 * The journal records of `mechanism`: a torn line and a line that is not an object are skipped, an absent
 * journal holds none.
 * @es Los registros del journal de `mechanism`: una línea cortada o que no es objeto se omite; un journal ausente no tiene ninguno.
 */
function readRecords(mechanism) {
  let text;

  try {
    text = readFileSync(journalPath(mechanism), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];

    throw error;
  }

  return text.split('\n').flatMap((line) => {
    try {
      const parsed = JSON.parse(line);

      return typeof parsed === 'object' && parsed !== null ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

/**
 * Whether block `blockId` of `mechanism` is lifted: true only when the journal holds a dismissal of it. A
 * decision or a false-positive report never lifts a block.
 * @es Si el bloqueo `blockId` de `mechanism` está levantado: solo cuando el journal tiene un descarte suyo. Una decisión o un informe de falso positivo nunca levanta un bloqueo.
 */
export const isLifted = (mechanism, blockId) => readRecords(mechanism).some((record) => record.kind === 'dismissal' && record.blockId === blockId);

/**
 * Appends the outcome of a block and returns the record: a `dismissal`, or a `false-positive-report` when
 * `falsePositive` is set. A second dismissal of a lifted block throws and writes nothing.
 * @es Añade el desenlace de un bloqueo y devuelve el registro: un `dismissal`, o un `false-positive-report` si `falsePositive`. Un segundo descarte de un bloqueo levantado lanza y no escribe nada.
 */
export function recordOutcome(mechanism, { blockId, reason, falsePositive }, { now = Date.now() } = {}) {
  if (!falsePositive && isLifted(mechanism, blockId)) throw new Refusal(bilingual('already-dismissed', { blockId, mechanism }));

  return appendRecord(mechanism, { kind: falsePositive ? 'false-positive-report' : 'dismissal', blockId, inputDigest: digestInput(blockId), reason }, { now });
}

/** A value option's value: the next token unless it is missing or is itself an option. @es El valor de una opción: el token siguiente salvo que falte o sea otra opción. */
export const valueAfter = (argv, index) => (argv[index + 1] === undefined || argv[index + 1].startsWith('--') ? undefined : argv[index + 1]);

/**
 * The options of a command line; throws a Refusal for an unknown token, for a required option that is
 * missing, empty or blank, and for a mechanism name that is not a plain name.
 * @es Las opciones de una línea de comandos; lanza un Refusal ante un token desconocido, una opción obligatoria ausente, vacía o en blanco, o un nombre de mecanismo que no es simple.
 */
function parseOptions(argv) {
  const values = {};
  let falsePositive = false;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === FALSE_POSITIVE) {
      falsePositive = true;
    } else if (VALUE_OPTIONS.includes(argv[index])) {
      values[argv[index]] = valueAfter(argv, index);
      index += values[argv[index]] === undefined ? 0 : 1;
    } else {
      throw new Refusal(bilingual('unknown-option', { option: argv[index] }));
    }
  }

  for (const option of VALUE_OPTIONS) {
    if ((values[option] ?? '').trim() === '') throw new Refusal(bilingual('missing-argument', { option }));
  }

  try {
    assertMechanism(values['--mechanism']);
  } catch (error) {
    throw new Refusal(error.message);
  }

  return { mechanism: values['--mechanism'], blockId: values['--block'], reason: values['--reason'], falsePositive };
}

/**
 * Runs the command on `argv` and returns its exit code: 0 recorded, 2 refused, 1 failed to write.
 * @es Corre el comando sobre `argv` y devuelve su código de salida: 0 registrado, 2 rechazado, 1 no se pudo escribir.
 */
export function main(argv, { sink = console, now = Date.now() } = {}) {
  const speaker = makeSpeaker(MESSAGE_TABLE, sink);

  try {
    const { mechanism, ...outcome } = parseOptions(argv);

    recordOutcome(mechanism, outcome, { now });
    speaker.say(outcome.falsePositive ? 'false-positive-recorded' : 'dismissed', { blockId: outcome.blockId, mechanism });

    return 0;
  } catch (error) {
    if (error instanceof Refusal) {
      speaker.dataError(error.message);

      return 2;
    }

    speaker.complain('write-failed', { detail: error.message });

    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
