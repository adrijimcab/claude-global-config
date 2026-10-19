/**
 * The git invocations a shell line really runs, each with the facts of the line around it that worker-git-guard's
 * rules read: the environment the line gives it, and the `&&` chain it belongs to.
 *
 * WHAT IT ADDS to `shell-command/git-invocations.mjs` (which stays the one reader of git's global options):
 *   - `environment`: the variables the command itself sets (`GIT_INDEX_FILE=x git ...`, `env X=1 git ...`) and,
 *     in PowerShell, the `$env:NAME = value` assignments made earlier on the same line. A PowerShell name is kept
 *     in upper case, because PowerShell and Windows read it without case.
 *   - `chain`: commands joined only by `&&` share a number, so a rule can tell that a `git add` ran just before.
 *   - ALIASES DEFINED ON THE LINE, expanded (judge B, 2026-10-19): `git -c alias.ci="commit -a" ci` runs
 *     `git commit -a`, and `git -c alias.x="!git reset" x` runs `git reset` through a shell. The expansion keeps
 *     the alias's own arguments first and the typed ones after, as git does, and follows an alias to another alias
 *     up to a bound. A command a shell alias runs gets `directory: undefined`, because git starts it at the top of
 *     the worktree, which the line does not show.
 *
 * LEFT OUT, stated: aliases defined in git configuration files, which the line does not show; an alias whose name
 * is a subcommand this guard judges, because git always runs the builtin and never the alias; a name that shadows
 * another builtin is still expanded, which can only refuse more.
 *
 * THE ALIGNMENT. `gitInvocations` walks `simpleCommands` of the same line in the same order and keeps the commands
 * whose command word is the `git` executable; this module walks that list too and pairs the n-th such command with
 * the n-th invocation. A count that does not match throws, and the guard then fails open, as it does for every
 * malfunction of its own.
 *
 * @es Las invocaciones de git que una línea ejecuta de verdad, cada una con los datos de la línea que leen las
 * reglas del guard: el entorno que la línea le da (`GIT_INDEX_FILE=x git ...`, `env X=1 git ...` y, en PowerShell,
 * las asignaciones `$env:NOMBRE = valor` anteriores en la misma línea) y la cadena `&&` a la que pertenece. Los
 * ALIAS DEFINIDOS EN LA LÍNEA (`git -c alias.ci="commit -a" ci`, `git -c alias.x="!git reset" x`) se expanden:
 * primero los argumentos del alias y luego los escritos, siguiendo un alias a otro hasta un límite; un comando que
 * corre un alias de shell recibe `directory: undefined`, porque git lo arranca en la raíz del worktree. QUEDAN
 * FUERA los alias de los ficheros de configuración y los que se llaman como un subcomando que este guard juzga
 * (git ejecuta siempre el builtin). Un recuento que no cuadra lanza un error y el guard falla abierto.
 */

import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { commandWordIndex, executableName, simpleCommands } from '../shell-command/shell-command.mjs';

/** The subcommands this guard judges as builtins, which no alias can replace. @es Los subcomandos que juzga este guard, que ningún alias reemplaza. */
const JUDGED_BUILTINS = new Set(['add', 'reset', 'checkout', 'switch', 'restore', 'clean', 'commit', 'push', 'read-tree', 'checkout-index', 'update-index', 'update-ref', 'symbolic-ref']);

/** How deep an alias may lead to another before the expansion stops. @es Cuántos alias seguidos se expanden como máximo. */
const ALIAS_DEPTH = 8;

/** The prefix of a git configuration key that defines an alias. @es El prefijo de la clave que define un alias. */
const ALIAS_KEY = 'alias.';

/** The PowerShell spelling of an environment variable. @es La forma de PowerShell de una variable de entorno. */
const POWERSHELL_ENVIRONMENT = '$env:';

/** A bash word that is a `NAME=value` assignment. @es Una palabra bash que es una asignación `NOMBRE=valor`. */
const isAssignment = (word) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);

/** The aliases a git invocation defines with `-c alias.<name>=<value>`, later ones winning. @es Los alias que define con `-c`. */
function aliasesOf(gitOptions) {
  const aliases = new Map();

  for (let index = 0; index + 1 < gitOptions.length; index += 1) {
    const setting = gitOptions[index + 1];
    const equals = setting.indexOf('=');

    if (gitOptions[index] === '-c' && equals !== -1 && setting.toLowerCase().startsWith(ALIAS_KEY)) {
      aliases.set(setting.slice(ALIAS_KEY.length, equals).toLowerCase(), setting.slice(equals + 1));
    }
  }

  return aliases;
}

/** A word quoted for bash, so a typed argument stays one word. @es Una palabra entrecomillada para bash. */
const bashQuoted = (word) => `'${word.split("'").join("'\\''")}'`;

/**
 * What an invocation runs once the aliases of the line are expanded: itself when its subcommand is no alias.
 * @es Lo que ejecuta una invocación con los alias de la línea expandidos: ella misma si su subcomando no es un alias.
 */
function expanded(invocation, aliases, depth) {
  const name = invocation.subcommand?.toLowerCase();

  if (depth >= ALIAS_DEPTH || name === undefined || JUDGED_BUILTINS.has(name) || !aliases.has(name)) return [invocation];

  const body = aliases.get(name);
  const start = typeof invocation.directory === 'string' ? invocation.directory : process.cwd();

  if (body.startsWith('!')) {
    const script = [body.slice(1), ...invocation.args.map(bashQuoted)].join(' ');

    return gitInvocations(script, 'bash', start).flatMap((inner) => expanded({ ...invocation, ...inner, directory: undefined, text: invocation.text }, aliases, depth + 1));
  }

  const [inner] = gitInvocations(`git ${body}`, 'bash', start);

  if (inner === undefined) return [invocation];

  const replaced = { ...invocation, subcommand: inner.subcommand, args: [...inner.args, ...invocation.args], gitOptions: [...invocation.gitOptions, ...inner.gitOptions] };

  return expanded(replaced, aliases, depth + 1);
}

/** Records a PowerShell `$env:NAME = value` (or `$env:NAME=value`) assignment. @es Anota una asignación `$env:` de PowerShell. */
function recordPowerShellAssignment(words, environment) {
  const [first = '', second, third] = words;

  if (!first.toLowerCase().startsWith(POWERSHELL_ENVIRONMENT)) return;

  const fused = first.indexOf('=');
  const name = (fused === -1 ? first : first.slice(0, fused)).slice(POWERSHELL_ENVIRONMENT.length).toUpperCase();
  const value = fused === -1 ? (second === '=' ? third : undefined) : first.slice(fused + 1);

  if (value !== undefined) environment.set(name, value);
}

/**
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @returns {Array<{ subcommand?: string, args: string[], gitOptions: string[], directory?: string, text: string, environment: Map<string, string>, chain: number }>}
 *   The invocations of `gitInvocations`, aliases expanded, each with its environment and chain number.
 * @es Las invocaciones de `gitInvocations`, con los alias expandidos y su entorno y número de cadena.
 */
export function lineInvocations(script, dialect, cwd) {
  const invocations = gitInvocations(script, dialect, cwd);
  const lineEnvironment = new Map();
  const found = [];
  let next = 0;
  let chain = 0;
  let previousSeparator;

  for (const command of simpleCommands(script, dialect)) {
    if (previousSeparator !== undefined && previousSeparator !== '&&') chain += 1;

    previousSeparator = command.separator;

    const at = commandWordIndex(command.words);

    if (dialect === 'powershell') recordPowerShellAssignment(command.words, lineEnvironment);
    if (at === -1 || executableName(command.words[at]) !== 'git') continue;

    const invocation = invocations[next];

    if (invocation === undefined) throw new Error('the git invocations of the line do not match its commands');

    next += 1;

    const environment = new Map(lineEnvironment);

    for (const word of command.words.slice(0, at).filter(isAssignment)) environment.set(word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1));

    found.push(...expanded({ ...invocation, environment, chain }, aliasesOf(invocation.gitOptions), 0));
  }

  if (next !== invocations.length) throw new Error('the git invocations of the line do not match its commands');

  return found;
}
