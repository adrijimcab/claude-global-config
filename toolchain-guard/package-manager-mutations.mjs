/**
 * The package-manager MUTATIONS a shell line performs, each with the directory it runs in.
 *
 * WHY THE DIRECTORY IS PART OF THE ANSWER. `npm install` is this machine's SANCTIONED repair command —
 * it reconciles, it is measured, it is in the refusal text of the guard next door. The identical words,
 * run in an agent worktree whose `node_modules` is a junction farm, reify a DIFFERENT lockfile into the
 * MAIN checkout's tree. Measured 2026-09-17: such a run failed `EPERM rmdir …/@angular/compiler-cli`,
 * named only worktree paths in its own log, and still left the main checkout with `@angular/core`
 * empty, `@swc/core` gone and 675 abandoned npm staging directories. So the COMMAND cannot tell the
 * safe case from the catastrophe; only WHERE IT LANDS can, and a module that answered "does this line
 * install?" without saying where would hand its caller a question it cannot decide.
 *
 * PURE: a script, a dialect and a starting directory in, a list of mutation sites out. It touches no
 * filesystem — whether a directory is dangerous is `tree-tenancy.mjs`'s question, not this one's.
 *
 * WHAT COUNTS AS A MUTATION: a verb whose reify phase can DELETE before it writes. `install`, `ci`,
 * `add`, `update`, `dedupe`, `prune`, `uninstall`, `link`, `rebuild` and their aliases, `npm audit fix`,
 * and a bare `yarn`, which installs with no verb at all. Read-only verbs — `run`, `test`, `exec`,
 * `audit` on its own, `ls`, `view`, `publish` — do not count, and `npm run ci:lint` is why that boundary
 * is load-bearing: this repository runs it constantly.
 *
 * MEASURED AGAINST npm ONLY. The pnpm, yarn and bun verbs are in the table as a CLASS judgement — any
 * reify that deletes before it writes has the same hazard — but only the npm path has been reproduced
 * on this machine. Stated rather than implied, so nobody reads the table as eight measurements.
 *
 * WHERE THE SHELL PARSING COMES FROM. `shell-command.mjs` and `withWorkingDirectories`, not a second
 * tokeniser: a word is a command only in command position, a heredoc body is not a word, and a `cd`
 * decides where the next command runs. `withWorkingDirectories` is a fact about SHELLS rather than about
 * cherry-picks and eventually belongs beside `shell-command.mjs`; it is imported from where it currently
 * lives because `cherry-pick-guard/mutants.mjs` addresses it by path, and moving it would redden a
 * mutation harness for a change that is not about it.
 *
 * @es Las MUTACIONES de gestor de paquetes que ejecuta una línea, cada una con el directorio donde corre.
 * `npm install` es el comando de reparación SANCIONADO; las mismas palabras en un worktree con farm de
 * junctions reifican OTRO lockfile dentro del árbol PRINCIPAL. El comando no distingue el caso seguro de
 * la catástrofe: solo lo hace DÓNDE ATERRIZA. Módulo PURO, sin sistema de ficheros. Cuenta como mutación
 * el verbo cuya fase de reify puede BORRAR antes de escribir; `npm run` no cuenta, y ahí está el límite
 * que importa. Solo el camino de npm está MEDIDO; pnpm/yarn/bun están por juicio de CLASE, y se dice.
 */

import path from 'node:path';

import { nativeSpelling, withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { commandWordIndex, executableName, simpleCommands } from '../shell-command/shell-command.mjs';

/**
 * The npm verbs that INSTALL packages (named ones, or the lockfile's), as opposed to the other mutating
 * verbs. Owned here, beside the table that extends it, so the install aliases are listed once: the
 * pruning decision reads this set and a second copy would drift. The aliases are in full for the same
 * reason as below — `isntall` is a real npm alias.
 * @es Los verbos de npm que INSTALAN paquetes. Se declaran aquí, junto a la tabla que los extiende, para
 * listar los alias una sola vez: la decisión de poda lee este conjunto y una segunda copia divergiría.
 */
export const NPM_INSTALL_VERBS = Object.freeze(
  new Set(['install', 'i', 'in', 'ins', 'inst', 'insta', 'instal', 'isnt', 'isnta', 'isntal', 'isntall', 'add'])
);

/**
 * Per manager, the verbs whose reify phase can delete. npm's install aliases are listed in full rather
 * than sampled: an unlisted alias is a SILENT MISS, and npm really does answer to `isntall`.
 * @es Por gestor, los verbos cuyo reify puede borrar. Los alias de `npm install` van completos: un alias
 * que falte es un fallo SILENCIOSO, y npm responde de verdad a `isntall`.
 */
const MUTATING_VERBS = Object.freeze({
  npm: new Set([
    ...NPM_INSTALL_VERBS,
    'ci', 'clean-install', 'install-clean', 'isntall-clean',
    'update', 'up', 'upgrade', 'udpate',
    'dedupe', 'ddp', 'find-dupes', 'prune',
    'uninstall', 'unlink', 'remove', 'rm', 'r', 'un',
    'link', 'ln', 'rebuild', 'rb'
  ]),
  pnpm: new Set([
    'install', 'i', 'add', 'update', 'up', 'upgrade', 'remove', 'rm', 'un', 'uninstall',
    'prune', 'dedupe', 'link', 'ln', 'unlink', 'rebuild', 'rb', 'import', 'fetch'
  ]),
  yarn: new Set([
    'install', 'add', 'remove', 'up', 'upgrade', 'upgrade-interactive', 'dedupe',
    'link', 'unlink', 'import', 'rebuild', 'install-state'
  ]),
  bun: new Set(['install', 'i', 'add', 'a', 'remove', 'rm', 'update', 'link', 'unlink'])
});

/**
 * Flags that CHANGE where the mutation lands. They are the whole reason this module reads flags at all:
 * `npm install --prefix <dir>` runs in one tree and reifies into another, which is this guard's subject
 * spelled as an option instead of as a `cd`.
 * @es Flags que CAMBIAN dónde aterriza la mutación — el mismo asunto de este guard escrito como opción.
 */
const DIRECTORY_FLAGS = ['--prefix', '-C', '--dir', '--cwd'];

/**
 * Flags that consume the NEXT word, so its value is never mistaken for the verb.
 *
 * Not exhaustive, and the consequence is stated rather than hidden: an unlisted value-taking flag makes
 * the verb unreadable (`npm --some-flag value install` reads `value` as the verb), the line matches
 * nothing, and the call is ALLOWED. That is the fail-open direction this guard chooses everywhere.
 * @es Flags que consumen la palabra SIGUIENTE. La lista no es exhaustiva: una que falte hace ilegible el
 * verbo y la llamada se PERMITE, que es la dirección de fallo elegida en todo este guard.
 */
const VALUE_FLAGS = new Set([
  ...DIRECTORY_FLAGS,
  '-w', '--workspace', '--filter', '-F', '--registry', '--tag', '--omit', '--include',
  '--loglevel', '--cache', '--userconfig', '--globalconfig', '--strategy', '--install-strategy',
  '--before', '--save-prefix', '--legacy-peer-deps-mode', '--foreground-scripts-timeout'
]);

/**
 * Flags con los que el gestor resuelve y escribe SOLO el lockfile, sin reificar `node_modules`. Con
 * uno de ellos la invocación no borra nada en ningún árbol, así que no es una mutación en el sentido
 * de este módulo. Es además lo que el contrato manda usar en un worktree para sincronizar el lockfile:
 * rechazarlo empujaría a quitar el flag. `npm` está MEDIDO; `pnpm --lockfile-only` va por juicio de
 * CLASE, como el resto de la tabla de pnpm. La forma `=false` APAGA el flag y no cuenta.
 */
const LOCKFILE_ONLY_FLAGS = Object.freeze({ npm: ['--package-lock-only'], pnpm: ['--lockfile-only'] });

/** Si las palabras encienden un flag de solo-lockfile para `manager`. @es Ver `LOCKFILE_ONLY_FLAGS`. */
function writesOnlyTheLockfile(manager, words) {
  const flags = LOCKFILE_ONLY_FLAGS[manager] ?? [];

  return words.some((word) => flags.some((flag) => word === flag || word === `${flag}=true`));
}

/** True when a word's value depends on an expansion this module does not perform. @es Verdadero si la palabra depende de una expansión. */
const isUnresolvable = (word) => word === undefined || word.includes('$') || word.includes('%');

/** A word that is an option rather than an operand. A bare `-` is an operand. @es Palabra que es opción, no operando. */
const isFlag = (word) => word.startsWith('-') && word !== '-';

/**
 * The operands and the landing override of the words after the manager.
 * @es Los operandos y el override de aterrizaje de las palabras tras el gestor.
 */
function readArguments(words) {
  const operands = [];
  let override;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];

    if (!isFlag(word)) {
      operands.push(word);
      continue;
    }

    const fused = DIRECTORY_FLAGS.find((flag) => word.startsWith(`${flag}=`));

    if (fused !== undefined) {
      override = word.slice(fused.length + 1);
      continue;
    }

    if (!VALUE_FLAGS.has(word)) continue;

    if (DIRECTORY_FLAGS.includes(word)) override = words[index + 1];

    index += 1;
  }

  return { operands, override };
}

/**
 * The verb this invocation performs, or `undefined` when it performs no mutating one.
 *
 * A bare `yarn` installs — no verb, the full reify — and leaving it out would miss the one spelling a
 * yarn user types most. `npm audit fix` and `pnpm audit --fix` mutate while plain `audit` only reports,
 * so the pair is read rather than the verb alone.
 * @es El verbo que ejecuta esta invocación. `yarn` a secas INSTALA, y `audit fix` muta mientras `audit`
 * solo informa, así que se lee la pareja y no el verbo suelto.
 */
function mutatingVerb(manager, operands, hasFixFlag) {
  const [first, second] = operands.map((operand) => operand.toLowerCase());

  if (first === undefined) return manager === 'yarn' ? 'install' : undefined;
  if (MUTATING_VERBS[manager].has(first)) return first;
  if (first === 'audit' && (second === 'fix' || hasFixFlag)) return 'audit fix';

  return undefined;
}

/**
 * Every package-manager mutation `script` performs.
 *
 * @param script The shell line exactly as the tool received it.
 * @param dialect `bash` or `powershell`.
 * @param cwd The directory the line starts in.
 * @param platform Injectable for the Git Bash path translation; defaults to this process's.
 * @returns `[{ manager, verb, directory, unresolvable }]` — `directory` is `undefined` when the line's
 *   own `cd` cannot be followed, and `unresolvable` names why when a landing flag depends on a variable.
 * @es Cada mutación de gestor de paquetes que ejecuta `script`, con su directorio.
 */
export function packageManagerMutations(script, dialect, cwd, platform = process.platform) {
  const found = [];

  for (const { command, directory } of withWorkingDirectories(simpleCommands(script, dialect), cwd, dialect, platform)) {
    const at = commandWordIndex(command.words);

    if (at === -1) continue;

    const manager = executableName(command.words[at]);

    if (MUTATING_VERBS[manager] === undefined) continue;

    const rest = command.words.slice(at + 1);
    const { operands, override } = readArguments(rest);
    const verb = mutatingVerb(manager, operands, rest.includes('--fix'));

    if (verb === undefined || writesOnlyTheLockfile(manager, rest)) continue;

    // What the line names, so a decision about WHICH packages it installs reads it from here and never
    // re-tokenises. `packages` is every operand after the verb; `words` is everything after the manager.
    // @es Lo que nombra la línea: `packages` son los operandos tras el verbo; `words`, todo tras el gestor.
    const named = { packages: operands.slice(1), words: rest };

    if (override === undefined) {
      found.push({ manager, verb, ...named, directory, unresolvable: undefined });
      continue;
    }

    if (isUnresolvable(override)) {
      found.push({ manager, verb, ...named, directory: undefined, unresolvable: `the landing flag value \`${override ?? ''}\` depends on a variable` });
      continue;
    }

    found.push({
      manager,
      verb,
      ...named,
      directory: directory === undefined ? undefined : path.resolve(directory, nativeSpelling(override, platform)),
      unresolvable: undefined
    });
  }

  return found;
}
