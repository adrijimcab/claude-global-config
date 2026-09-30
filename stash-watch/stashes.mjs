/**
 * Reads a repository's stash stack into records a reader can judge: which entry, when it was made, on
 * which branch, under what message, and WHAT IT HOLDS — tracked files with their line counts, plus any
 * untracked files it carried.
 *
 * WHY A STASH NEEDS READING RATHER THAN COUNTING. Task #129 measured it twice: a stash's message is a
 * label its author wrote, not evidence. `ac84-baseline-probe` read like a throwaway measurement and held
 * 257 insertions across two new modules, their specs and both git hooks. So the record carries the
 * content, never the label alone.
 *
 * WHY THE STACK IS ONE PER CLONE, NOT ONE PER WORKTREE. `refs/stash` lives in the COMMON git directory,
 * so every linked worktree reads and writes the same stack. A stash made inside an agent's worktree
 * outlives that worktree, which is exactly how `ac84-baseline-probe` ended up in limbo. That is also why
 * this does not live in the worktree lifecycle tooling: the object it reads has no worktree.
 *
 * `measured: false` IS NOT "NO STASHES". A git command that failed returns a reason, and every caller
 * must treat it as "could not tell", because a failed measurement that reads like an empty stack is the
 * defect this fleet has built the most guards against.
 *
 * NO REGEX (M5): every parse is a split on a separator git itself emits, or `startsWith` on a literal.
 *
 * @es Lee la pila de stashes de un repo como registros que se pueden juzgar: qué entrada, cuándo, en qué
 * rama, con qué mensaje y QUÉ CONTIENE (ficheros con sus líneas, y los no seguidos que llevara). El
 * mensaje de un stash es una etiqueta, no evidencia (#129 lo midió dos veces), así que el registro lleva
 * el contenido. La pila es UNA por clon: `refs/stash` vive en el directorio git COMÚN y todo worktree
 * enlazado la comparte, por eso un stash sobrevive al worktree que lo creó. `measured: false` NO es
 * «sin stashes»: quien llama debe leerlo como «no se pudo saber». SIN REGEX (M5).
 */

import { execFileSync } from 'node:child_process';

/** Separates the fields of one `git stash list` entry; git emits it for `%x1f`. @es Separa campos de una entrada. */
const FIELD = '\u001F';

/** Ends one `git stash list` entry; git emits it for `%x1e`. @es Termina una entrada. */
const RECORD = '\u001E';

/** The reflog-subject prefixes git writes for a stash, longest first so `WIP on ` is not read as `On `. @es Prefijos del asunto que git escribe para un stash. */
const SUBJECT_PREFIXES = ['WIP on ', 'On '];

function git(repoRoot, args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
}

/** Whether `rev` names a commit, asked without treating git's refusal as a malfunction. @es Si `rev` nombra un commit. */
function resolves(repoRoot, rev) {
  try {
    git(repoRoot, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Splits a stash's reflog subject into the branch it was made on and the message.
 * `On develop: counter resync` → `{ branch: 'develop', message: 'counter resync' }`;
 * `WIP on main: 1a2b3c4 subject` → `{ branch: 'main', message: '1a2b3c4 subject' }`.
 * A branch name cannot contain `:` (git check-ref-format), so the first `: ` ends it.
 * @es Separa rama y mensaje del asunto del reflog. Un nombre de rama no puede llevar `:`.
 */
export function parseSubject(subject) {
  const prefix = SUBJECT_PREFIXES.find((candidate) => subject.startsWith(candidate));

  if (prefix === undefined) return { branch: undefined, message: subject };

  const rest = subject.slice(prefix.length);
  const end = rest.indexOf(': ');

  if (end === -1) return { branch: undefined, message: subject };

  return { branch: rest.slice(0, end), message: rest.slice(end + 2) };
}

/**
 * The tracked changes a stash holds, against the commit it was made on. `-z` keeps every path
 * byte-exact (no quoting of non-ASCII names), and `--no-renames` keeps one path per entry.
 * @es Los cambios seguidos que guarda un stash frente al commit donde se hizo.
 */
function trackedChanges(repoRoot, sha) {
  const raw = git(repoRoot, ['diff', '--numstat', '-z', '--no-renames', `${sha}^1`, sha]);

  return raw
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [added, deleted, ...rest] = entry.split('\t');
      const binary = added === '-' && deleted === '-';

      return { path: rest.join('\t'), added: binary ? undefined : Number(added), deleted: binary ? undefined : Number(deleted) };
    });
}

/** The untracked files a stash carried (`git stash push -u`), which live in its THIRD parent. @es Los no seguidos que llevaba, en su TERCER padre. */
function untrackedFiles(repoRoot, sha) {
  if (!resolves(repoRoot, `${sha}^3`)) return [];

  return git(repoRoot, ['ls-tree', '-r', '-z', '--name-only', `${sha}^3`])
    .split('\0')
    .filter((entry) => entry.length > 0);
}

/**
 * Every stash on the stack of the repository at `repoRoot`, newest first.
 * @returns `{ measured: true, stashes }` or `{ measured: false, reason }`.
 * @es Todos los stashes de la pila, del más nuevo al más viejo.
 */
export function stashInventory(repoRoot) {
  let listing;

  try {
    // `%x1f` / `%x1e` make git emit the FIELD / RECORD bytes above.
    listing = git(repoRoot, ['stash', 'list', '--format=%gd%x1f%H%x1f%ct%x1f%gs%x1e']);
  } catch (error) {
    return { measured: false, reason: `git stash list failed in ${repoRoot}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}` };
  }

  const stashes = [];

  try {
    for (const entry of listing.split(RECORD)) {
      const trimmed = entry.trim();

      if (trimmed.length === 0) continue;

      const [ref, sha, seconds, subject] = trimmed.split(FIELD);

      stashes.push({
        ref,
        sha,
        createdAt: new Date(Number(seconds) * 1000),
        ...parseSubject(subject ?? ''),
        tracked: trackedChanges(repoRoot, sha),
        untracked: untrackedFiles(repoRoot, sha),
      });
    }
  } catch (error) {
    return { measured: false, reason: `reading a stash's content failed in ${repoRoot}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}` };
  }

  return { measured: true, stashes };
}
