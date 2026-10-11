/**
 * Which commits of a range THIS session made, told from the session's own transcript.
 *
 * WHY. The engram guard asked "did HEAD move?" and so blocked a session for commits another session made
 * on a shared branch (2026-10-11: four sessions, twice each, forced to write an engram record about work
 * they never did). The obligation to record belongs to whoever made the work. A commit is this session's
 * when one of ITS OWN shell calls ran a command that creates commits (`git commit`, `cherry-pick`,
 * `merge`, `revert`, `am`, `rebase`, or a wrapper: `backup-repo.mjs commit`, `land.mjs`), the call did not
 * fail, and the commit's committer time lies inside that call's window (`shell-windows.mjs`, the same
 * time attribution config-sync-guard uses). A failed call created nothing, so it claims nothing; a
 * fetch or fast-forward brings in commits whose committer time predates every window, so it claims
 * nothing either. THE STATED LIMIT: a peer commit made at the very instant of one of this session's
 * commit calls is attributed to this session (the same limit as any time window).
 *
 * @es Qué commits de un rango hizo ESTA sesión, según su propio transcript. La obligación de registrar es
 * de quien hizo el trabajo: un commit es de la sesión cuando una de SUS llamadas de shell corrió un comando
 * que crea commits (o un envoltorio), la llamada no falló y la hora del commit cae dentro de su ventana
 * (`shell-windows.mjs`, la misma atribución por hora de config-sync-guard). Una llamada fallida no creó nada
 * y un fetch o fast-forward trae commits anteriores a toda ventana: ninguno reclama nada. LÍMITE DECLARADO:
 * un commit ajeno hecho en el mismo instante de una llamada de commit de esta sesión se le atribuye.
 */

import { shellCallsIn, withinWindow } from '../config-sync-guard/shell-windows.mjs';

/** Git verbs that create commits. @es Verbos de git que crean commits. */
const COMMIT_VERBS = new Set(['commit', 'cherry-pick', 'merge', 'revert', 'am', 'rebase']);

/** Wrapper scripts that create commits whatever their arguments. @es Scripts envoltorio que crean commits. */
const COMMIT_WRAPPERS = ['land.mjs'];

/** Global git options that take the next token as their value. @es Opciones globales de git con valor propio. */
const OPTIONS_WITH_VALUE = new Set(['-C', '-c']);

const SEPARATORS = new Set([' ', '\t', '\n', '\r', ';', '&', '|', '(', ')', '"', "'", '`']);

/** `command` split into plain tokens at whitespace, quotes and shell operators — no regex (M5). @es `command` en tokens simples, sin regex (M5). */
function tokensOf(command) {
  const tokens = [];
  let current = '';

  for (const char of command) {
    if (SEPARATORS.has(char)) {
      if (current !== '') tokens.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  return current === '' ? tokens : [...tokens, current];
}

/** The git verb that follows the `git` token at `index`, skipping global options, or `undefined`. @es El verbo de git tras el token `git` en `index`, saltando opciones globales. */
function verbAfter(tokens, index) {
  for (let at = index + 1; at < tokens.length; at += 1) {
    if (OPTIONS_WITH_VALUE.has(tokens[at])) at += 1;
    else if (!tokens[at].startsWith('-')) return tokens[at];
  }

  return undefined;
}

/** Whether `command` runs something that creates commits. @es Si `command` corre algo que crea commits. */
export function createsCommits(command) {
  const tokens = tokensOf(command);
  const baseName = (token) => token.replaceAll('\\', '/').split('/').at(-1);

  return tokens.some((token, index) => {
    const name = baseName(token);

    if (name === 'git' || name === 'git.exe') return COMMIT_VERBS.has(verbAfter(tokens, index));
    if (name === 'backup-repo.mjs') return tokens[index + 1] === 'commit';

    return COMMIT_WRAPPERS.includes(name);
  });
}

/**
 * The commits of `commits` (`[{ committedAtMs, ... }]`) that this session made, judged from the JSONL
 * `transcriptTail` it wrote while the range was created.
 * @es Los commits de `commits` que esta sesión hizo, juzgados por el transcript que escribió mientras se creaba el rango.
 */
export function commitsMadeBySession(commits, transcriptTail) {
  const windows = shellCallsIn(transcriptTail).filter((call) => !call.failed && createsCommits(call.command));

  return commits.filter((commit) => withinWindow(windows, commit.committedAtMs));
}
