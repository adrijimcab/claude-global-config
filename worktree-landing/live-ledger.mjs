/**
 * Reads the two sides of the live-ledger check: the ledger files the main checkout holds NOW in its working
 * tree (uncommitted lines included), and the same files as the worktree HEAD would land them. Which files are
 * ledgers is decided by the loop's own resolution (`../failure-capture/loop-context.mjs`, what capture.mjs
 * writes through), so a project with its own ledger or areas is covered the same way as the home. Only the
 * ledgers that live inside `main` can be shrunk by a landing into it; the others are not this landing's.
 * The tree side reads every resolved ledger path, so a lesson moved into a ledger file the main checkout does
 * not have yet still counts. A repository none of whose resolved ledgers exists in the main checkout is not governed.
 *
 * @es Lee los dos lados de la comprobación del ledger vivo: los ficheros de ledger que el checkout principal
 * tiene AHORA en su árbol de trabajo (con las líneas sin commitear) y los mismos ficheros como los aterrizaría
 * el HEAD del worktree. Qué ficheros son ledgers lo decide la resolución propia del bucle
 * (`../failure-capture/loop-context.mjs`, por donde escribe capture.mjs), así un proyecto con ledger o áreas
 * propias queda cubierto igual que el home. Solo los ledgers que viven dentro de `main` puede encogerlos un
 * aterrizaje en él. El lado del árbol lee toda ruta de ledger resuelta, así una lección movida a un fichero
 * que el principal aún no tiene también cuenta. Un repositorio ninguno de cuyos ledgers resueltos existe en
 * el principal no está gobernado.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { resolveLoopContext } from '../failure-capture/loop-context.mjs';
import { git } from './git.mjs';
import { keysOfLedgerTexts } from './ledger-retention.mjs';
import { Refusal } from './outcome.mjs';

/**
 * The ledger files inside `main`, as paths relative to it with forward slashes. The resolution runs as
 * capture.mjs runs it, for the home that would hold `main` as its `.claude`; an invalid project configuration
 * refuses (fail closed), naming the reason.
 * @es Los ficheros de ledger dentro de `main`, como rutas relativas con barras. La resolución corre como la
 * corre capture.mjs, para el home que tendría a `main` como su `.claude`; una configuración de proyecto
 * inválida rechaza (falla cerrado), con el motivo.
 */
function ledgerPathsInside(main) {
  // The loop resolves a project through real paths, so `main` is compared to them in its real spelling.
  // @es El bucle resuelve un proyecto por rutas reales, así que `main` se compara con ellas en su grafía real.
  const real = realpathSync.native(main);
  let ledgers;
  try {
    ({ ledgers } = resolveLoopContext({ directory: real, home: path.dirname(real) }));
  } catch (error) {
    throw new Refusal('ledger-configuration-unreadable', [
      `The ledgers of ${main} cannot be resolved, so a landing cannot be checked against them: ${error.message} @es No se pueden resolver los ledgers de ${main}, así que un aterrizaje no se puede comprobar contra ellos: ${error.message}`,
    ]);
  }
  // Every resolved file sits under the same drive as `main` (the home is its parent, a project root is one of its
  // ancestors), so a file outside it relates to it by a leading `..`. @es Todo fichero resuelto está en la misma
  // unidad que `main` (el home es su padre, la raíz de un proyecto uno de sus ancestros), así que uno fuera de él
  // se relaciona con un `..` inicial.
  return Object.values(ledgers)
    .map(({ file }) => path.relative(real, file))
    .filter((relative) => !relative.startsWith('..'))
    .map((relative) => relative.split(path.sep).join('/'));
}

/** The text of a file of the main checkout's working tree, or undefined when absent. @es El texto de un fichero del árbol de trabajo del principal, o undefined. */
function liveText(main, relative) {
  const file = path.join(main, ...relative.split('/'));
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

/** The text of a file as `head` holds it, or undefined when `head` does not have it. @es El texto de un fichero en `head`, o undefined si no lo tiene. */
function treeText(worktree, head, relative) {
  const shown = git(worktree, ['show', `${head}:${relative}`]);
  return shown.status === 0 ? shown.stdout : undefined;
}

/**
 * What the main checkout's live ledgers hold now and what the landed tree would hold.
 * @es Lo que tienen ahora los ledgers vivos del principal y lo que tendría el árbol aterrizado.
 * @param {{ worktree: string, main: string, head: string }} inputs
 * @returns {{ governed: boolean, files: string[], live: Map<string, number>, tree: Map<string, number> }}
 */
export function ledgersOf({ worktree, main, head }) {
  const files = ledgerPathsInside(main);
  return {
    governed: files.some((relative) => existsSync(path.join(main, ...relative.split('/')))),
    files,
    live: keysOfLedgerTexts(files.map((relative) => liveText(main, relative))),
    tree: keysOfLedgerTexts(files.map((relative) => treeText(worktree, head, relative))),
  };
}
