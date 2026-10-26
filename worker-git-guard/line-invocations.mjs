/**
 * The git invocations a shell line really runs, each with the facts of the line around it that worker-git-guard's
 * rules read: the environment the line gives it, the git configuration the line sets, the `&&` chain it belongs
 * to, the commands that ran before it, and whether the line touches a git selector variable it cannot model.
 *
 * WHAT IT ADDS to `shell-command/git-invocations.mjs` (which stays the one reader of git's global options):
 *   - `environment`: the variables the command itself sets (`GIT_INDEX_FILE=x git ...`, `env X=1 git ...`), and
 *     those the modelled top-level assignments set earlier on the line (`selector-touches.mjs`: bash `export` and
 *     `unset`, PowerShell `$env:NAME = value` and `Remove-Item Env:NAME`). A PowerShell name is kept in upper case,
 *     because PowerShell and Windows read it without case.
 *   - `config`: the git configuration the LINE gives it (`line-config.mjs`, git's order and quoting).
 *   - `selectorTouch`: the text of the first command of the line that touches a selector variable outside the
 *     modelled forms, on every invocation of that line; a rule refuses such a line as unresolvable.
 *   - `separator`: the operator that ended the git command; in PowerShell a `(` there starts an argument that is
 *     a command of its own, whose value the line does not show.
 *   - `chain`: commands joined only by `&&` share a number, so a rule can tell that a `git add` ran just before.
 *   - `before`: every command of the line that ran before this one (`{ words, text, gitSubcommand, gitArgs }`, the
 *     last two set only for a git command).
 *   - ALIASES SET ON THE LINE, expanded (judge B, 2026-10-19): `git -c alias.ci="commit -a" ci` runs `git commit
 *     -a`, and `git -c alias.x="!git reset" x` runs `git reset` through a shell. The expansion keeps the alias's
 *     own arguments first and the typed ones after, as git does, recomputes the configuration with the options the
 *     body carries (a `!` body's git inherits the parent's settings, as git hands them on), and follows an alias to
 *     another up to a bound. A command a shell alias runs gets `directory: undefined`, because git starts it at the
 *     top of the worktree. An alias whose body the line does not show (an unset `--config-env` variable, or a body
 *     holding any shell expansion, `!$X` included) is reported with `unseenAlias: true`.
 *
 * LEFT OUT, stated: configuration and aliases from git's configuration FILES, which the line does not show; an
 * alias whose name is a subcommand this guard judges, because git always runs the builtin and never the alias; a
 * name that shadows another builtin is still expanded, which can only refuse more.
 *
 * THE ALIGNMENT. `gitInvocations` walks `simpleCommands` of the same line in the same order and keeps the commands
 * whose command word is the `git` executable; this module walks that list too and pairs the n-th such command with
 * the n-th invocation. A count that does not match throws, and the guard then fails open, as it does for every
 * malfunction of its own.
 *
 * @es Las invocaciones de git que una línea ejecuta de verdad, cada una con los datos de la línea que leen las
 * reglas del guard: el entorno (prefijos `X=1 git`, `env`, y las asignaciones modeladas del nivel superior), la
 * configuración de git que fija la LÍNEA (`line-config.mjs`), el primer comando que toca una variable selectora
 * fuera de las formas modeladas (`selectorTouch`), el separador que cerró el comando git, la cadena `&&`, los
 * comandos que corrieron antes, y los ALIAS DEFINIDOS EN LA LÍNEA expandidos, con la configuración recalculada con
 * las opciones del cuerpo (un alias cuyo cuerpo la línea no muestra o lleva una expansión se marca `unseenAlias`).
 * QUEDAN FUERA la configuración y los alias de los ficheros de configuración y los alias con nombre de un
 * subcomando que este guard juzga. Un recuento que no cuadra lanza un error y el guard falla abierto.
 */

import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { commandWordIndex, executableName, simpleCommands } from '../shell-command/shell-command.mjs';
import { configOf, UNSEEN } from './line-config.mjs';
import { isAssignment, modeledAssignment, selectorTouch } from './selector-touches.mjs';

export { ANY_SETTING, UNSEEN } from './line-config.mjs';

/** The subcommands this guard judges as builtins, which no alias can replace. @es Los subcomandos que juzga este guard, que ningún alias reemplaza. */
const JUDGED_BUILTINS = new Set(['add', 'reset', 'checkout', 'switch', 'restore', 'clean', 'commit', 'push', 'read-tree', 'checkout-index', 'update-index', 'update-ref', 'symbolic-ref']);

/** How deep an alias may lead to another before the expansion stops. @es Cuántos alias seguidos se expanden como máximo. */
const ALIAS_DEPTH = 8;

/** The prefix of a git configuration key that defines an alias. @es El prefijo de la clave que define un alias. */
const ALIAS_KEY = 'alias.';

/** A `NAME=value` assignment split in two. @es Una asignación partida en dos. */
const splitAssignment = (word) => [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)];

/** The aliases a configuration defines, by lower-case name. @es Los alias que define una configuración. */
function aliasesOf(config) {
  const aliases = new Map();

  for (const [key, value] of config) if (typeof key === 'string' && key.startsWith(ALIAS_KEY)) aliases.set(key.slice(ALIAS_KEY.length), value);

  return aliases;
}

/** A word quoted for bash, so a typed argument stays one word. @es Una palabra entrecomillada para bash. */
const bashQuoted = (word) => `'${word.split("'").join("'\\''")}'`;

/**
 * Whether an alias body is hidden from the line: `line-config.mjs` gives every value holding a shell expansion, and
 * every unset `--config-env` variable, as `UNSEEN`.
 * @es Si el cuerpo de un alias no se ve en la línea: `line-config.mjs` da como NO VISTO todo valor con una expansión.
 */
const isUnseenBody = (body) => body === UNSEEN;

/**
 * What an invocation runs once the aliases of the line are expanded: itself when its subcommand is no alias.
 * @es Lo que ejecuta una invocación con los alias de la línea expandidos: ella misma si su subcomando no es un alias.
 */
function expanded(invocation, aliases, depth) {
  const name = invocation.subcommand?.toLowerCase();

  if (depth >= ALIAS_DEPTH || name === undefined || JUDGED_BUILTINS.has(name) || !aliases.has(name)) return [invocation];

  const body = aliases.get(name);

  if (isUnseenBody(body)) return [{ ...invocation, unseenAlias: true }];

  const start = typeof invocation.directory === 'string' ? invocation.directory : process.cwd();

  if (body.startsWith('!')) {
    const script = [body.slice(1), ...invocation.args.map(bashQuoted)].join(' ');

    return gitInvocations(script, 'bash', start).flatMap((inner) => {
      const config = configOf(inner.gitOptions, invocation.environment, invocation.config);

      return expanded({ ...invocation, ...inner, config, directory: undefined, text: invocation.text }, aliasesOf(config), depth + 1);
    });
  }

  const [inner] = gitInvocations(`git ${body}`, 'bash', start);

  if (inner === undefined) return [invocation];

  const gitOptions = [...invocation.gitOptions, ...inner.gitOptions];
  const config = configOf(gitOptions, invocation.environment);
  const replaced = { ...invocation, subcommand: inner.subcommand, args: [...inner.args, ...invocation.args], gitOptions, config };

  return expanded(replaced, aliasesOf(config), depth + 1);
}

/** Applies a modelled top-level assignment to the line's environment. @es Aplica una asignación modelada al entorno de la línea. */
function record(assignments, environment) {
  for (const entry of assignments) {
    if (entry.set !== undefined) environment.set(...entry.set);
    else environment.delete(entry.unset);
  }
}

/**
 * Every command of the line with `previous`, the separator before it in the line's own shell. Own-shell commands
 * come in the same order in both walks of the parser, so they are paired in order; a command inside a substitution
 * or `bash -c` gets none, because its text is a word of the command that contains it (`selector-touches.mjs`).
 * @es Cada comando de la línea con `previous`, el separador anterior en la shell propia; un comando dentro de una
 * sustitución no lleva ninguno, porque su texto es una palabra del comando que lo contiene.
 */
function commandsInContext(script, dialect) {
  const own = simpleCommands(script, dialect, { includeNested: false });
  let next = 0;
  let previous;

  return simpleCommands(script, dialect).map((command) => {
    const candidate = own[next];
    const isOwn = candidate !== undefined && candidate.text === command.text && candidate.separator === command.separator && candidate.depth === command.depth;

    if (!isOwn) return command;

    next += 1;

    const placed = { ...command, previous };

    previous = command.separator;

    return placed;
  });
}

/** The variables a `--config-env` of the line reads. @es Las variables que lee un `--config-env` de la línea. */
function configEnvironmentNames(invocations) {
  const found = [];

  for (const { gitOptions } of invocations) {
    for (let index = 0; index < gitOptions.length; index += 1) {
      const reference = gitOptions[index] === '--config-env' ? gitOptions[index + 1] : gitOptions[index].startsWith('--config-env=') ? gitOptions[index].slice('--config-env='.length) : undefined;

      if (reference?.includes('=')) found.push(reference.slice(reference.indexOf('=') + 1));
    }
  }

  return found;
}

/**
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @returns {Array<{ subcommand?: string, args: string[], gitOptions: string[], directory?: string, text: string, environment: Map<string, string>, config: Map<string | symbol, string | symbol>, chain: number, separator: string, selectorTouch?: string, before: Array<{ words: string[], text: string, gitSubcommand?: string, gitArgs?: string[] }>, unseenAlias?: boolean }>}
 *   The invocations of `gitInvocations`, aliases expanded, each with its line context.
 * @es Las invocaciones de `gitInvocations`, con los alias expandidos y su contexto en la línea.
 */
export function lineInvocations(script, dialect, cwd) {
  const invocations = gitInvocations(script, dialect, cwd);
  const commands = commandsInContext(script, dialect);
  const touch = selectorTouch(commands, dialect, configEnvironmentNames(invocations));
  const lineEnvironment = new Map();
  const found = [];
  const before = [];
  let next = 0;
  let chain = 0;
  let previousSeparator;

  for (const command of commands) {
    if (previousSeparator !== undefined && previousSeparator !== '&&') chain += 1;

    previousSeparator = command.separator;

    const at = commandWordIndex(command.words);
    // An assignment outside the top level that names a selector is a touch (`selectorTouch`), which refuses the line.
    // @es Una asignación fuera del nivel superior que nombra una selectora es un toque, que rechaza la línea.
    const assignments = modeledAssignment(command.words, dialect);

    if (assignments !== undefined) record(assignments, lineEnvironment);

    let gitSubcommand;
    let gitArgs;

    if (at !== -1 && executableName(command.words[at]) === 'git') {
      const invocation = invocations[next];

      if (invocation === undefined) throw new Error('the git invocations of the line do not match its commands @es las invocaciones de git de la línea no cuadran con sus comandos');

      gitSubcommand = invocation.subcommand;
      gitArgs = invocation.args;
      next += 1;

      const environment = new Map(lineEnvironment);

      for (const word of command.words.slice(0, at).filter(isAssignment)) environment.set(...splitAssignment(word));

      const config = configOf(invocation.gitOptions, environment);

      found.push(...expanded({ ...invocation, environment, config, chain, separator: command.separator, selectorTouch: touch, before: [...before] }, aliasesOf(config), 0));
    }

    before.push({ words: command.words, text: command.text, gitSubcommand, gitArgs });
  }

  if (next !== invocations.length) throw new Error('the git invocations of the line do not match its commands @es las invocaciones de git de la línea no cuadran con sus comandos');

  return found;
}
