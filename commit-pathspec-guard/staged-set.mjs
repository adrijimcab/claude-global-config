/**
 * THE DECISIONS behind committing exactly what is staged: which paths the caller declared, whether the
 * index holds exactly those, and which `git commit` arguments are safe to forward. Pure: no git, no disk.
 *
 * WHY THIS EXISTS. `commit-pathspec-guard` refuses a bare `git commit` in a declared backup repo because
 * the index is shared and a bare commit sweeps in whatever another actor staged. Its only allowed form,
 * `commit -- <paths>`, commits the WORKTREE content of those paths and ignores the index for them, so when
 * one file holds my staged hunk and another live session's unstaged hunk, `-- <path>` commits BOTH hunks
 * and there was no allowed way to commit only mine. The safe way to commit index content is to make the
 * caller DECLARE the paths it expects to commit and to verify, at the moment of commit, that the index
 * holds exactly those: an undeclared staged path is precisely what the guard exists to keep out.
 *
 * THE RULE KEPT: a commit may never sweep another actor's staged paths it did not declare. The declaration
 * is the caller's claim; the equality check is the proof, and it runs against the index, never against what
 * the caller remembers staging.
 *
 * @es LAS DECISIONES para commitear exactamente lo que está en stage: qué rutas declaró quien llama, si
 * el índice contiene exactamente esas y qué argumentos de `git commit` se pueden reenviar. Pura: sin git
 * ni disco. POR QUÉ EXISTE: `commit -- <rutas>` commitea el contenido del ÁRBOL DE TRABAJO e ignora el
 * índice para esas rutas, así que cuando un fichero tiene mi hunk en stage y el hunk sin stage de otra
 * sesión viva no había forma permitida de commitear solo el mío. La forma segura de commitear contenido
 * del índice es que quien llama DECLARE las rutas esperadas y verificar, en el momento del commit, que el
 * índice contiene exactamente esas. REGLA CONSERVADA: un commit nunca arrastra rutas en stage de otro
 * actor que no declaró.
 */

/** Commit flags that take the NEXT word as their value and are safe to forward. @es Flags reenviables cuyo valor es la palabra siguiente. */
const FORWARDED_FLAGS_WITH_VALUE = new Set(['-m', '--message', '-F', '--file']);

/** Prefix of the forwarded `--flag=value` spellings. @es Prefijos de las formas `--flag=valor` reenviables. */
const FORWARDED_INLINE_PREFIXES = ['--message=', '--file='];

/**
 * A path as git prints it in `diff --name-only`: forward slashes, no leading `./`.
 * @es Una ruta como la imprime git: barras normales y sin `./` inicial.
 */
export function normalizeRepoPath(candidate) {
  const slashed = String(candidate).split('\\').join('/');

  return slashed.startsWith('./') ? slashed.slice(2) : slashed;
}

/**
 * Splits `commit-staged.mjs` argv into the declaration and the commit arguments.
 *
 * Shape: `--repo <name> --expect <path> [--expect <path>...] -- <commit args>`. Everything before the
 * first `--` belongs to this tool; everything after is handed to `git commit` once it has passed
 * `commitArgumentsProblem`. A missing repo or an EMPTY declaration is a refusal, not a default: declaring
 * nothing is exactly the bare commit the guard forbids.
 *
 * @returns `{ repoName, expected, commitArguments }` or `{ problem }`.
 * @es Parte el argv en la declaración y los argumentos del commit. Declarar NADA es el commit a secas
 * que la guardia prohíbe: se rechaza, no se asume un valor por defecto.
 */
export function parseCommitStagedArguments(argv) {
  const separatorAt = argv.indexOf('--');
  const own = separatorAt === -1 ? argv : argv.slice(0, separatorAt);
  const commitArguments = separatorAt === -1 ? [] : argv.slice(separatorAt + 1);
  const expected = [];
  let repoName;

  for (let index = 0; index < own.length; index += 2) {
    const flag = own[index];
    const value = own[index + 1];

    if (value === undefined || value.startsWith('--')) return { problem: `${flag} needs a value. @es ${flag} necesita un valor.` };

    if (flag === '--repo') repoName = value;
    else if (flag === '--expect') expected.push(normalizeRepoPath(value));
    else return { problem: `unknown option ${flag}. @es opción desconocida ${flag}.` };
  }

  if (repoName === undefined) return { problem: 'name the backup repository with --repo. @es indica el repositorio de respaldo con --repo.' };

  if (expected.length === 0) {
    return { problem: 'declare at least one --expect <path>: declaring nothing is the bare commit the guard forbids. @es declara al menos un --expect <ruta>: no declarar nada es el commit a secas que la guardia prohíbe.' };
  }

  return { repoName, expected, commitArguments };
}

/**
 * The first reason a `git commit` argument list must NOT be forwarded, or `undefined`.
 *
 * Only a message (`-m`/`--message`/`-F`/`--file`, in any of their spellings) is forwarded. Every other flag
 * is refused, and the ones that matter are named by the reason: `-a`/`--all` sweeps the whole worktree,
 * `--only`/`-o`/`-i`/`--include` and a `--` pathspec commit WORKTREE content instead of the index, and
 * `--amend` rewrites a commit this tool never inspected. A clustered short flag (`-am`) is a flag the
 * whitelist does not know, so it is refused too rather than parsed for a hidden `a`.
 *
 * @es La primera razón para NO reenviar los argumentos de `git commit`, o `undefined`. Solo se reenvía el
 * mensaje; todo lo demás se rechaza, y el motivo nombra lo que importa.
 */
export function commitArgumentsProblem(commitArguments) {
  if (commitArguments.length === 0) return 'the commit needs a message (-m "..."). @es el commit necesita un mensaje (-m "...").';

  for (let index = 0; index < commitArguments.length; index += 1) {
    const argument = commitArguments[index];

    if (FORWARDED_FLAGS_WITH_VALUE.has(argument)) {
      if (commitArguments[index + 1] === undefined) return `${argument} needs a value. @es ${argument} necesita un valor.`;

      index += 1;
      continue;
    }

    if (FORWARDED_INLINE_PREFIXES.some((prefix) => argument.startsWith(prefix))) continue;

    return `\`${argument}\` is not forwarded: only a message is, because -a/--all, --only, --include, --amend and a \`--\` pathspec all change WHAT is committed. @es \`${argument}\` no se reenvía: solo el mensaje, porque -a/--all, --only, --include, --amend y un pathspec tras \`--\` cambian QUÉ se commitea.`;
  }

  return undefined;
}

/**
 * Compares the index with the declaration, as SETS of normalized paths (order and repeats are irrelevant).
 *
 * `staged === undefined` means the listing FAILED: that is a refusal of its own, never an empty set. An
 * empty set that really is empty also refuses (nothing to commit), but for a different, named reason.
 *
 * @returns `{ ok: true }` or `{ ok: false, reason, unexpected, missing }`: `unexpected` are staged paths
 * nobody declared (another actor's), `missing` are declared paths that are not staged.
 * @es Compara el índice con la declaración, como CONJUNTOS. `staged === undefined` es un listado FALLIDO:
 * un rechazo propio, nunca un conjunto vacío. `unexpected` = en stage sin declarar (de otro actor);
 * `missing` = declaradas pero no en stage.
 */
export function compareStagedSet(staged, expected) {
  if (staged === undefined) {
    return { ok: false, reason: 'the staged set could not be measured (git failed). Not knowing is not "nothing else is staged". @es no se pudo medir el índice (git falló). No saber no es «no hay nada más en stage».', unexpected: [], missing: [] };
  }

  const stagedSet = new Set(staged.map(normalizeRepoPath));
  const expectedSet = new Set(expected.map(normalizeRepoPath));
  const unexpected = [...stagedSet].filter((path) => !expectedSet.has(path));
  const missing = [...expectedSet].filter((path) => !stagedSet.has(path));

  if (stagedSet.size === 0) return { ok: false, reason: 'nothing is staged, so there is nothing to commit. @es no hay nada en stage: no hay nada que commitear.', unexpected, missing };

  if (unexpected.length === 0 && missing.length === 0) return { ok: true };

  const parts = [];

  if (unexpected.length > 0) parts.push(`${unexpected.length} staged path(s) you did NOT declare (another actor's?): ${unexpected.join(', ')}. @es ${unexpected.length} ruta(s) en stage que NO declaraste (¿de otro actor?): ${unexpected.join(', ')}.`);

  if (missing.length > 0) parts.push(`${missing.length} declared path(s) that are not staged: ${missing.join(', ')}. @es ${missing.length} ruta(s) declaradas que no están en stage: ${missing.join(', ')}.`);

  return { ok: false, reason: parts.join(' '), unexpected, missing };
}
