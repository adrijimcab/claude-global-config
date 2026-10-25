/**
 * The bilingual texts of `commit-index-guard`: the notice after a commit that left paths stale, and the
 * refusal of a commit that would sweep them in. Both name every path and give the exact next step, and neither
 * ever suggests discarding anything: the rewrite a hook made after the commit is work, not noise.
 *
 * MEASURED INCIDENT (three times, the third in the table-filter worktree, `b-rules.facade.ts`): after
 * `git commit -m ... -- <paths>` succeeded, the repository's own pre-commit hook (`lint-staged`: `eslint --fix`,
 * `prettier`) rewrote the working files; `git status --porcelain` then showed `MM` on the committed paths, and
 * the NEXT commit swept the stale staged variant in.
 *
 * @es Los textos bilingües de `commit-index-guard`: el aviso tras un commit que dejó rutas desactualizadas y la
 * negativa a un commit que las arrastraría. Ambos nombran cada ruta y dan el siguiente paso exacto, y ninguno
 * sugiere descartar nada: la reescritura que hizo un hook tras el commit es trabajo, no ruido. INCIDENTE MEDIDO
 * (tres veces): tras un `git commit -- <rutas>` exitoso, el hook pre-commit del propio repositorio reescribió
 * los ficheros y `git status` mostró `MM` en las rutas commiteadas; el SIGUIENTE commit arrastró la variante
 * vieja que estaba en stage.
 */

/** The characters a path may hold and still need no quoting. @es Los caracteres que una ruta puede llevar sin necesitar comillas. */
const PLAIN_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_./@%+=:,-';

/** A path as one shell word, safe in Bash and in PowerShell: single quotes unless it is plain. @es Una ruta como una palabra de shell. */
export function shellWord(candidate) {
  if (candidate.length > 0 && [...candidate].every((character) => PLAIN_CHARACTERS.includes(character))) return candidate;

  return `'${candidate.split("'").join("'\\''")}'`;
}

const words = (entries) => entries.map((entry) => shellWord(entry.path)).join(' ');

/** What one status code says, in both languages: `{ en, es }`. @es Qué dice un código de estado, en los dos idiomas. */
export function describeCode({ code }) {
  if (code[0] !== ' ' && code[1] !== ' ') return { en: 'the index holds a variant that is neither HEAD nor the worktree', es: 'el índice guarda una variante que no es ni HEAD ni el árbol de trabajo' };
  if (code[0] !== ' ') return { en: 'the staged content differs from HEAD', es: 'el contenido en stage difiere de HEAD' };

  return { en: 'the worktree differs from the index', es: 'el árbol de trabajo difiere del índice' };
}

const english = (entries) => entries.map((entry) => `  - ${entry.path} [${entry.code}]: ${describeCode(entry).en}`);

const listingEs = (entries) => entries.map((entry) => `  - ${entry.path} [${entry.code}]: ${describeCode(entry).es}`);

/**
 * The notice after a commit whose named paths are not in step with the index or HEAD.
 * @param entries `[{ path, code }]`, paths relative to the repository root.
 * @es El aviso tras un commit cuyas rutas nombradas no están al día con el índice o HEAD.
 */
export function noticeText(entries) {
  return [
    'COMMIT-INDEX GUARD: the commit succeeded, but a hook (lint-staged: eslint --fix, prettier) rewrote these',
    'files AFTER it, so the index no longer matches what was committed:',
    ...english(entries),
    '',
    'NEXT STEP, pick one (nothing here is to be discarded; do NOT restore, checkout or reset these paths):',
    `  1. review the rewrite:  git diff -- ${words(entries)}   (and git diff --cached -- ... for the staged side)`,
    `  2. commit it as its own change:  git commit -m "<type(scope): description>" -- ${words(entries)}`,
    `  3. or stage it before the next commit:  git add -- ${words(entries)}`,
    'Until then a commit with no pathspec is refused in this repository: it would sweep the stale staged variant in.',
    '',
    '@es COMMIT-INDEX GUARD: el commit salió bien, pero un hook (lint-staged: eslint --fix, prettier) reescribió',
    'estos ficheros DESPUÉS, así que el índice ya no coincide con lo que se commiteó:',
    ...listingEs(entries),
    '',
    'SIGUIENTE PASO, elige uno (aquí no se descarta nada; NO uses restore, checkout ni reset sobre estas rutas):',
    `  1. revisar la reescritura:  git diff -- ${words(entries)}   (y git diff --cached -- ... para el lado en stage)`,
    `  2. commitearla como un cambio propio:  git commit -m "<tipo(ámbito): descripción>" -- ${words(entries)}`,
    `  3. o ponerla en stage antes del próximo commit:  git add -- ${words(entries)}`,
    'Mientras tanto, un commit sin pathspec se rechaza en este repositorio: arrastraría la variante vieja en stage.'
  ].join('\n');
}

/**
 * The refusal of a commit that names no pathspec while recorded paths are still stale.
 * @es La negativa a un commit sin pathspec mientras las rutas registradas siguen desactualizadas.
 */
export function refusalText(entries) {
  return [
    'COMMIT-INDEX GUARD REFUSED this commit: it names no pathspec, so it commits the WHOLE index, and the index',
    'still holds a stale variant of these paths (a hook rewrote them after an earlier commit):',
    ...english(entries),
    '',
    'WHY. Measured three times: that variant was swept into the next commit. Nothing is lost by stopping here.',
    'USE ONE OF THESE, naming the stale paths or settling them first:',
    `  1. commit them as their own change:  git commit -m "<type(scope): description>" -- ${words(entries)}`,
    `  2. stage the current content, then commit:  git add -- ${words(entries)}`,
    '  3. commit only the paths you mean:  git commit -m "<type(scope): description>" -- <paths>',
    'Do NOT restore, checkout or reset these paths: that would throw the hook\'s rewrite away.',
    '',
    '@es COMMIT-INDEX GUARD RECHAZÓ este commit: no nombra pathspec, así que commitea TODO el índice, y el índice',
    'aún guarda una variante vieja de estas rutas (un hook las reescribió tras un commit anterior):',
    ...listingEs(entries),
    '',
    'POR QUÉ. Medido tres veces: esa variante se coló en el siguiente commit. Detenerse aquí no pierde nada.',
    'USA UNA DE ESTAS, nombrando las rutas desactualizadas o resolviéndolas antes:',
    `  1. commitearlas como un cambio propio:  git commit -m "<tipo(ámbito): descripción>" -- ${words(entries)}`,
    `  2. poner en stage el contenido actual y luego commitear:  git add -- ${words(entries)}`,
    '  3. commitear solo las rutas que quieres:  git commit -m "<tipo(ámbito): descripción>" -- <rutas>',
    'NO uses restore, checkout ni reset sobre estas rutas: tiraría la reescritura del hook.'
  ].join('\n');
}
