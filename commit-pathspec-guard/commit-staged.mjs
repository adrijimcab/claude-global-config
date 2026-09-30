#!/usr/bin/env node
/**
 * Commits exactly what is STAGED in a declared backup repo, after proving the index holds only the paths
 * the caller declared.
 *
 *   node ~/.claude/commit-pathspec-guard/commit-staged.mjs --repo "<declared repo name>" \
 *        --expect <path> [--expect <path> ...] -- -m "type(scope): description"
 *
 * The declared repos are `~/.claude` and `b100-am-ui/.claude` (`config-sync-guard/repos.mjs`). Paths are
 * relative to the repo's worktree, exactly as `git diff --cached --name-only` prints them.
 *
 * WHEN TO USE IT. `git commit -- <paths>` commits the WORKTREE content of the paths and ignores the index
 * for them, which is wrong when a file holds a staged hunk of yours and an unstaged hunk of another live
 * session. This commits the INDEX, so only the staged hunk goes in. A bare `git commit` does the same and
 * is refused by the guard because it sweeps whatever any actor staged; here the sweep is impossible
 * because the declaration is checked against the index at the moment of commit and any difference refuses.
 *
 * WHAT IT CHECKS, in order, each refusing before anything is written:
 *   1. the commit arguments are only a message (`staged-set.mjs`: `-a`, `--only`, `--amend`, a pathspec are not);
 *   2. the index could be listed, and equals the declared paths exactly (extra OR missing refuses);
 *   3. after `git commit`, the new commit holds exactly the declared paths. This last check closes the
 *      window between steps 2 and the commit: if another actor stages a path in it, the commit exists but
 *      the tool exits non-zero and names the extra paths. It does NOT reset on its own (destroying a
 *      commit is a decision for the caller); nothing has been pushed, so nothing has left the machine.
 *
 * TRADEOFFS, stated. (a) Equality is per PATH: another actor's staged hunk inside a path you declared is
 * indistinguishable from yours and is committed with it. (b) It never pushes. (c) It only serves the two
 * declared repos: it is a commit path for shared indexes, not a general `git commit`.
 *
 * @es Commitea exactamente lo que está en STAGE en un repo de respaldo declarado, tras probar que el
 * índice contiene solo las rutas que quien llama declaró. Cuándo usarlo: `git commit -- <rutas>` commitea
 * el contenido del ÁRBOL DE TRABAJO e ignora el índice, lo que es incorrecto cuando un fichero tiene un
 * hunk tuyo en stage y otro sin stage de otra sesión viva. Esto commitea el ÍNDICE. Un `git commit` a
 * secas hace lo mismo y la guardia lo rechaza porque arrastra lo que cualquier actor tenga en stage; aquí
 * el arrastre es imposible porque la declaración se comprueba contra el índice al commitear. Compromisos:
 * (a) la igualdad es por RUTA, (b) nunca hace push, (c) solo sirve a los dos repos declarados.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { declaredRepos } from '../config-sync-guard/repos.mjs';

import { commitArgumentsProblem, compareStagedSet, parseCommitStagedArguments } from './staged-set.mjs';

/** Names listed by a `-z` git command, without the trailing empty entry. @es Nombres de un comando git con `-z`. */
const namesOf = (stdout) => stdout.split('\0').filter((name) => name.length > 0);

/** The git arguments that list names from the index or from a commit, NUL-separated and unquoted. @es Argumentos de git que listan nombres. */
const LIST_INDEX = ['-c', 'core.quotePath=false', 'diff', '--cached', '--name-only', '--no-renames', '-z'];
const LIST_HEAD_COMMIT = ['-c', 'core.quotePath=false', 'show', '--name-only', '--no-renames', '--format=', '-z', 'HEAD'];

/** A bilingual refusal that committed nothing. @es Un rechazo bilingüe que no commiteó nada. */
const refuse = (reason) => ({ status: 1, committed: false, message: `commit-staged REFUSED, nothing was committed: ${reason}` });

/**
 * Runs the whole check-then-commit-then-verify sequence against `repo`.
 * @param options.repo A declared repo (`{ name, run }`); `run(args)` returns `{ ok, stdout, stderr }`.
 * @param options.expected The paths the caller declared.
 * @param options.commitArguments The arguments to forward to `git commit`.
 * @returns `{ status, committed, message }`; `status` 0 only when the commit exists AND holds exactly `expected`.
 * @es Ejecuta la secuencia comprobar, commitear y verificar contra `repo`. `status` 0 solo si el commit
 * existe Y contiene exactamente `expected`.
 */
export function commitStaged({ repo, expected, commitArguments }) {
  const argumentsProblem = commitArgumentsProblem(commitArguments);

  if (argumentsProblem !== undefined) return refuse(argumentsProblem);

  const listing = repo.run(LIST_INDEX);
  const comparison = compareStagedSet(listing.ok ? namesOf(listing.stdout) : undefined, expected);

  if (!comparison.ok) return refuse(comparison.reason);

  const commit = repo.run(['commit', ...commitArguments]);

  if (!commit.ok) return { status: 1, committed: false, message: `git commit failed, nothing was committed: ${commit.stderr.trim()}. @es git commit falló, no se commiteó nada.` };

  const committed = repo.run(LIST_HEAD_COMMIT);
  const afterwards = compareStagedSet(committed.ok ? namesOf(committed.stdout) : undefined, expected);

  if (!afterwards.ok) {
    return {
      status: 1,
      committed: true,
      message: `COMMITTED, BUT THE COMMIT DOES NOT HOLD EXACTLY WHAT YOU DECLARED: ${afterwards.reason} Another actor staged in the gap between the check and the commit. Nothing was pushed; inspect HEAD before doing anything else. @es SE COMMITEÓ, PERO EL COMMIT NO CONTIENE EXACTAMENTE LO DECLARADO. Otro actor añadió algo en stage entre la comprobación y el commit. No se hizo push; inspecciona HEAD antes de nada.`
    };
  }

  return { status: 0, committed: true, message: `committed exactly ${expected.length} declared path(s): ${expected.join(', ')}. @es commiteadas exactamente ${expected.length} ruta(s) declarada(s).` };
}

/** CLI: argv -> declared repo -> `commitStaged`. @es CLI: argv -> repo declarado -> `commitStaged`. */
function main(argv) {
  const parsed = parseCommitStagedArguments(argv);

  if (parsed.problem !== undefined) return refuse(parsed.problem);

  const repo = declaredRepos().find((candidate) => candidate.name === parsed.repoName);

  if (repo === undefined) {
    return refuse(`--repo must be one of the declared backup repos (${declaredRepos().map((candidate) => candidate.name).join(', ')}), not "${parsed.repoName}". @es --repo debe ser uno de los repos de respaldo declarados.`);
  }

  return commitStaged({ repo, expected: parsed.expected, commitArguments: parsed.commitArguments });
}

// Only as the main process: importing this module (a selftest, a dispatcher) must never commit anything.
// @es Solo como proceso principal: importar este módulo nunca debe commitear.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = main(process.argv.slice(2));

  (result.status === 0 ? console.log : console.error)(result.message);
  process.exit(result.status);
}
