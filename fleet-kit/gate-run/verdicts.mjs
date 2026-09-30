/**
 * The verdict store: one JSON file per graded tree, and the judgement of whether a tree's verdict is a
 * complete, green run of the unit suite the repository CURRENTLY declares.
 *
 * A verdict is keyed by TREE, never by commit: a gate reads bytes, and the same bytes reached by a
 * rebase or a cherry-pick are the same graded content. A verdict recorded for a different suite command
 * (the config changed since) is not accepted: it graded something the repository no longer calls its
 * unit suite.
 *
 * @es El almacén de veredictos: un JSON por árbol calificado, y el juicio de si el veredicto de un árbol
 * es una corrida completa y verde de la suite que el repositorio declara HOY. Clave por ÁRBOL, nunca por
 * commit: un gate lee bytes. Un veredicto de otra suite no se acepta.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { repositoryStateDir } from '../lib/state.mjs';

export const STATES = Object.freeze({ GREEN: 'green', RED: 'red', ERROR: 'error' });

/** The directory holding a repository's verdicts. @es El directorio de veredictos de un repositorio. */
export const verdictDir = (mainCheckout, stateRoot) => path.join(repositoryStateDir(mainCheckout, stateRoot), 'verdicts');

/** The identity of a unit-suite declaration, compared literally. @es La identidad de una declaración de suite. */
export const suiteIdentity = (unitSuite) => `npm run ${unitSuite.npmScript} @ ${unitSuite.cwd === '' ? '.' : unitSuite.cwd}`;

/** Writes a verdict atomically: a reader never sees half a file. @es Escribe un veredicto de forma atómica. */
export function writeVerdict(mainCheckout, verdict, stateRoot) {
  const directory = verdictDir(mainCheckout, stateRoot);
  const file = path.join(directory, `${verdict.tree}.json`);
  const partial = `${file}.${process.pid}.partial`;

  mkdirSync(directory, { recursive: true });
  writeFileSync(partial, `${JSON.stringify(verdict, null, 2)}\n`);
  renameSync(partial, file);

  return file;
}

/** The verdict recorded for `tree`, or `undefined`. An unreadable file is a malfunction and throws. @es El veredicto de `tree`, o `undefined`. */
export function readVerdict(mainCheckout, tree, stateRoot) {
  const file = path.join(verdictDir(mainCheckout, stateRoot), `${tree}.json`);

  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

/**
 * Whether `verdict` proves `unitSuite` ran complete and green on its tree.
 * @returns `{ green: true }` or `{ green: false, why }`.
 * @es Si `verdict` prueba que `unitSuite` corrió completa y en verde sobre su árbol.
 */
export function judge(verdict, unitSuite) {
  if (verdict === undefined) return { green: false, why: 'no unit-suite run was ever recorded for this tree' };
  if (verdict.suite !== suiteIdentity(unitSuite)) return { green: false, why: `the recorded run graded "${verdict.suite}", not the declared "${suiteIdentity(unitSuite)}"` };
  if (verdict.state !== STATES.GREEN || verdict.exitCode !== 0) return { green: false, why: `the recorded run ended ${verdict.state} (exit ${String(verdict.exitCode)})${verdict.reason === undefined ? '' : `: ${verdict.reason}`}` };

  return { green: true };
}
