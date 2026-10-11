/**
 * The bilingual texts of integrated-worktree-guard, in the house form (`bilingual-output/message.mjs`):
 * the refusal that names each removable worktree with its exact removal, and the non-blocking notice that
 * names stranded and skipped ones. Dynamic data enters only as `{placeholder}` parameters, so the Spanish
 * half cannot say something the English half does not, and a path or a branch name is printed as it is.
 *
 * NOTHING HERE REMOVES ANYTHING. The text carries the two commands the owner's rule names, in order, plus
 * the one precaution that rule's lesson adds: a link inside the worktree (a junction) is removed FIRST, with
 * a command that does not follow it, after checking its target is still there.
 *
 * @es Los textos bilingües de integrated-worktree-guard: el rechazo que nombra cada worktree removible con
 * su remoción exacta, y el aviso no bloqueante que nombra los varados y los omitidos. Los datos entran solo
 * como parámetros `{marcador}`. NADA aquí quita nada: el texto lleva los dos comandos de la regla del dueño,
 * en orden, y la precaución de su lección: un enlace dentro del worktree (una junction) se quita PRIMERO,
 * con un comando que no lo sigue, tras comprobar que su destino sigue ahí.
 */

import { render } from '../bilingual-output/message.mjs';

const SAMPLE_ENTRIES = 5;

/** A path spelled with forward slashes, which every shell this fleet runs accepts. @es Una ruta con barras normales, que acepta toda shell de la flota. */
const displayed = (somePath) => String(somePath).replaceAll('\\', '/');
const LANGUAGE_MARK = ' @es ';

/** The English and Spanish halves of a reason written in the house one-line form. @es Las mitades de una razón escrita en la forma de una línea. */
function halvesOfReason(reason) {
  const at = reason.indexOf(LANGUAGE_MARK);

  return at === -1 ? [reason, reason] : [reason.slice(0, at), reason.slice(at + LANGUAGE_MARK.length)];
}

/** The lines, in both languages, that name stranded and skipped worktrees. @es Las líneas, en ambos idiomas, que nombran varados y omitidos. */
function noteLines(stranded, skipped, params) {
  const en = [];
  const es = [];

  stranded.forEach((item, at) => {
    params[`strandedPath${at}`] = displayed(item.path);
    params[`strandedBranch${at}`] = item.branch;
    params[`strandedCount${at}`] = item.work.length;
    params[`strandedSample${at}`] = item.work.slice(0, SAMPLE_ENTRIES).join(', ');
    en.push(`STRANDED WORK, not removable: {strandedPath${at}} (branch {strandedBranch${at}}) holds {strandedCount${at}} entr${item.work.length === 1 ? 'y' : 'ies'} that exist nowhere else, e.g. {strandedSample${at}}. Commit it on its branch or discard it on purpose.`);
    es.push(`TRABAJO VARADO, no se puede quitar: {strandedPath${at}} (rama {strandedBranch${at}}) guarda {strandedCount${at}} entrada${item.work.length === 1 ? '' : 's'} que no existe${item.work.length === 1 ? '' : 'n'} en ningún otro lugar, p. ej. {strandedSample${at}}. Commitéalo en su rama o descártalo a propósito.`);
  });

  skipped.forEach((item, at) => {
    const [english, spanish] = halvesOfReason(item.reason);

    params[`skippedPath${at}`] = displayed(item.path);
    params[`skippedBranch${at}`] = item.branch ?? '(detached)';
    params[`skippedEnglish${at}`] = english;
    params[`skippedSpanish${at}`] = spanish;
    en.push(`NOT JUDGED: {skippedPath${at}} (branch {skippedBranch${at}}): {skippedEnglish${at}}`);
    es.push(`NO JUZGADO: {skippedPath${at}} (rama {skippedBranch${at}}): {skippedSpanish${at}}`);
  });

  return { en, es };
}

/**
 * The refusal for the removable worktrees, with the notes appended.
 * @param {Array<{ path: string, branch: string, base: string, links: string[], main: string }>} removable
 * @param {{ stranded: object[], skipped: object[] }} notes
 * @returns {string} English then ` @es ` Spanish.
 * @es El rechazo para los worktrees removibles, con las notas añadidas.
 */
export function refusalText(removable, { stranded = [], skipped = [] } = {}) {
  const params = {};
  const en = [
    'INTEGRATED-WORKTREE GUARD: this session worked in repositories whose linked worktrees below are integrated, hold nothing, and no live actor holds them. Remove them before the turn ends.',
    ''
  ];
  const es = [
    'INTEGRATED-WORKTREE GUARD: esta sesión trabajó en repos cuyos worktrees enlazados de abajo están integrados, no guardan nada y ningún actor vivo los tiene. Quítalos antes de terminar el turno.',
    ''
  ];

  removable.forEach((item, at) => {
    params[`path${at}`] = displayed(item.path);
    params[`branch${at}`] = item.branch;
    params[`base${at}`] = item.base;
    params[`main${at}`] = displayed(item.main);
    en.push(`  - {path${at}}  (branch {branch${at}}, every commit already in {base${at}} by patch-id)`);
    es.push(`  - {path${at}}  (rama {branch${at}}, cada commit ya está en {base${at}} por patch-id)`);

    if (item.links.length > 0) {
      params[`links${at}`] = item.links.join(', ');
      en.push(`    it holds link(s) {links${at}}: remove each FIRST with \`cmd /c rmdir "<link path>"\` (it does not follow the link) and confirm the target still exists.`);
      es.push(`    guarda enlace(s) {links${at}}: quita cada uno PRIMERO con \`cmd /c rmdir "<ruta del enlace>"\` (no sigue el enlace) y confirma que su destino sigue existiendo.`);
    }

    en.push(`    git -C "{main${at}}" worktree remove "{path${at}}"`, `    git -C "{main${at}}" branch -D "{branch${at}}"`);
    es.push(`    git -C "{main${at}}" worktree remove "{path${at}}"`, `    git -C "{main${at}}" branch -D "{branch${at}}"`);
  });

  const notes = noteLines(stranded, skipped, params);

  if (notes.en.length > 0) {
    en.push('', ...notes.en);
    es.push('', ...notes.es);
  }

  en.push('', 'Check no junction is followed before deleting anything. This guard removes nothing itself and fires once per set of worktrees.');
  es.push('', 'Comprueba que ninguna junction se siga antes de borrar nada. Este guard no quita nada por sí mismo y sale una vez por conjunto de worktrees.');

  return render({ en, es }, params);
}

/**
 * The non-blocking notice for stranded and skipped worktrees when nothing is removable.
 * @es El aviso no bloqueante para varados y omitidos cuando nada es removible.
 */
export function noticeText({ stranded = [], skipped = [] }) {
  const params = {};
  const { en, es } = noteLines(stranded, skipped, params);

  return render({ en: ['INTEGRATED-WORKTREE GUARD (no action blocks the turn):', ...en], es: ['INTEGRATED-WORKTREE GUARD (ninguna acción bloquea el turno):', ...es] }, params);
}
