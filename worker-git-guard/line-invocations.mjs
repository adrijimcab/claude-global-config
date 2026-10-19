/**
 * The git invocations a shell line really runs, each with the facts of the line around it that worker-git-guard's
 * rules read: the environment the line gives it, the git configuration the line sets, the `&&` chain it belongs
 * to, and the commands that ran before it.
 *
 * WHAT IT ADDS to `shell-command/git-invocations.mjs` (which stays the one reader of git's global options):
 *   - `environment`: the variables the command itself sets (`GIT_INDEX_FILE=x git ...`, `env X=1 git ...`), and
 *     those set earlier on the same line: bash `export NAME=value` (undone by `unset NAME`) and PowerShell
 *     `$env:NAME = value` (undone by `= $null`, `= ''`, or `Remove-Item Env:NAME`). A PowerShell name is kept in
 *     upper case, because PowerShell and Windows read it without case.
 *   - `config`: the git configuration the LINE sets, in git's order: `GIT_CONFIG_COUNT` with
 *     `GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>` from the environment, then each `-c <key>=<value>` and
 *     `--config-env=<key>=<VARIABLE>` (whose value is read from the line's environment, and is UNSEEN when the
 *     line does not set that variable). Keys are lower case, as git compares them. A key with no `=` is `true`.
 *   - `chain`: commands joined only by `&&` share a number, so a rule can tell that a `git add` ran just before.
 *   - `before`: every command of the line that ran before this one (`{ words, text, gitSubcommand }`, the last
 *     set only for a git command).
 *   - ALIASES SET ON THE LINE, expanded (judge B, 2026-10-19): `git -c alias.ci="commit -a" ci` runs `git commit
 *     -a`, and `git -c alias.x="!git reset" x` runs `git reset` through a shell. The expansion keeps the alias's
 *     own arguments first and the typed ones after, as git does, and follows an alias to another alias up to a
 *     bound. A command a shell alias runs gets `directory: undefined`, because git starts it at the top of the
 *     worktree, which the line does not show. An alias whose body the line does not show (an unset
 *     `--config-env` variable, or a body that is one shell expansion) is reported with `unseenAlias: true`.
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
 * reglas del guard: el entorno (prefijos `X=1 git`, `env`, `export`/`unset` de bash y `$env:` de PowerShell, que
 * `= $null`, `= ''` o `Remove-Item Env:X` deshacen), la configuración de git que fija la LÍNEA (`GIT_CONFIG_COUNT`
 * con sus `KEY_n`/`VALUE_n`, luego `-c` y `--config-env`, cuyo valor se lee del entorno de la línea y es NO VISTO
 * si la línea no fija esa variable), la cadena `&&`, los comandos que corrieron antes, y los ALIAS DEFINIDOS EN LA
 * LÍNEA expandidos (un alias cuyo cuerpo la línea no muestra se marca `unseenAlias`). QUEDAN FUERA la configuración y
 * los alias de los ficheros de configuración y los alias con nombre de un subcomando que este guard juzga (git
 * ejecuta siempre el builtin). Un recuento que no cuadra lanza un error y el guard falla abierto.
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

/** The PowerShell drive spelling of an environment variable (`Env:NAME`). @es La forma de unidad de PowerShell (`Env:NOMBRE`). */
const POWERSHELL_DRIVE = 'env:';

/** PowerShell commands that remove an item, an environment variable among them. @es Comandos de PowerShell que borran un elemento. */
const POWERSHELL_REMOVERS = new Set(['remove-item', 'ri', 'rm', 'del', 'erase', 'rd', 'rmdir', 'clear-item', 'cli']);

/** The value of a configuration setting the line does not show. @es El valor de un ajuste que la línea no muestra. */
export const UNSEEN = Symbol('unseen');

/** A bash word that is a `NAME=value` assignment. @es Una palabra bash que es una asignación `NOMBRE=valor`. */
const isAssignment = (word) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);

/** A `NAME=value` assignment split in two. @es Una asignación partida en dos. */
const splitAssignment = (word) => [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)];

/** A `key=value` configuration setting, its key lower-cased, `true` when there is no `=`. @es Un ajuste `clave=valor`. */
function setting(text) {
  const equals = text.indexOf('=');

  return equals === -1 ? [text.toLowerCase(), 'true'] : [text.slice(0, equals).toLowerCase(), text.slice(equals + 1)];
}

/**
 * The configuration the line gives one git invocation: `GIT_CONFIG_*` from its environment first, then its `-c` and
 * `--config-env` options in order, later ones winning.
 * @es La configuración que la línea da a una invocación: `GIT_CONFIG_*` del entorno y luego `-c`/`--config-env`.
 */
function configOf(gitOptions, environment) {
  const config = new Map();
  const count = Number.parseInt(environment.get('GIT_CONFIG_COUNT') ?? '0', 10);

  for (let index = 0; index < count; index += 1) {
    const key = environment.get(`GIT_CONFIG_KEY_${index}`);

    if (key !== undefined) config.set(key.toLowerCase(), environment.get(`GIT_CONFIG_VALUE_${index}`) ?? '');
  }

  for (let index = 0; index < gitOptions.length; index += 1) {
    const option = gitOptions[index];

    if (option === '-c' && index + 1 < gitOptions.length) config.set(...setting(gitOptions[index + 1]));

    const reference = option === '--config-env' ? gitOptions[index + 1] : option.startsWith('--config-env=') ? option.slice('--config-env='.length) : undefined;

    if (reference !== undefined && reference.includes('=')) {
      const [key, variable] = setting(reference);

      config.set(key, environment.has(variable) ? environment.get(variable) : UNSEEN);
    }
  }

  return config;
}

/** The aliases a configuration defines, by lower-case name. @es Los alias que define una configuración. */
function aliasesOf(config) {
  const aliases = new Map();

  for (const [key, value] of config) if (key.startsWith(ALIAS_KEY)) aliases.set(key.slice(ALIAS_KEY.length), value);

  return aliases;
}

/** A word quoted for bash, so a typed argument stays one word. @es Una palabra entrecomillada para bash. */
const bashQuoted = (word) => `'${word.split("'").join("'\\''")}'`;

/** Whether an alias body is hidden from the line: unset, or one shell expansion. @es Si el cuerpo de un alias no se ve en la línea. */
const isUnseenBody = (body) => body === UNSEEN || body.startsWith('$');

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

    return gitInvocations(script, 'bash', start).flatMap((inner) => expanded({ ...invocation, ...inner, directory: undefined, text: invocation.text }, aliases, depth + 1));
  }

  const [inner] = gitInvocations(`git ${body}`, 'bash', start);

  if (inner === undefined) return [invocation];

  const replaced = { ...invocation, subcommand: inner.subcommand, args: [...inner.args, ...invocation.args], gitOptions: [...invocation.gitOptions, ...inner.gitOptions] };

  return expanded(replaced, aliases, depth + 1);
}

/** Records the PowerShell `$env:` assignments and removals of one command. @es Anota las asignaciones y borrados `$env:` de un comando. */
function recordPowerShellEnvironment(words, environment) {
  const [first = '', second, third] = words;
  const command = first.toLowerCase();

  if (POWERSHELL_REMOVERS.has(command)) {
    for (const word of words.slice(1).filter((candidate) => candidate.toLowerCase().startsWith(POWERSHELL_DRIVE))) {
      environment.delete(word.slice(POWERSHELL_DRIVE.length).split('\\').join('').split('/').join('').toUpperCase());
    }

    return;
  }

  if (!command.startsWith(POWERSHELL_ENVIRONMENT)) return;

  const fused = first.indexOf('=');
  const name = (fused === -1 ? first : first.slice(0, fused)).slice(POWERSHELL_ENVIRONMENT.length).toUpperCase();
  const value = fused === -1 ? (second === '=' ? third : undefined) : first.slice(fused + 1);

  if (value === undefined) return;
  if (value.length === 0 || value.toLowerCase() === '$null') environment.delete(name);
  else environment.set(name, value);
}

/** Records the bash `export` and `unset` of one command. @es Anota los `export` y `unset` de bash de un comando. */
function recordBashEnvironment(words, at, environment) {
  if (words[at] === 'export') for (const word of words.slice(at + 1).filter(isAssignment)) environment.set(...splitAssignment(word));
  if (words[at] === 'unset') for (const word of words.slice(at + 1).filter((candidate) => !candidate.startsWith('-'))) environment.delete(word);
}

/**
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @returns {Array<{ subcommand?: string, args: string[], gitOptions: string[], directory?: string, text: string, environment: Map<string, string>, config: Map<string, string | symbol>, chain: number, before: Array<{ words: string[], text: string, gitSubcommand?: string }>, unseenAlias?: boolean }>}
 *   The invocations of `gitInvocations`, aliases expanded, each with its line context.
 * @es Las invocaciones de `gitInvocations`, con los alias expandidos y su contexto en la línea.
 */
export function lineInvocations(script, dialect, cwd) {
  const invocations = gitInvocations(script, dialect, cwd);
  const lineEnvironment = new Map();
  const found = [];
  const before = [];
  let next = 0;
  let chain = 0;
  let previousSeparator;

  for (const command of simpleCommands(script, dialect)) {
    if (previousSeparator !== undefined && previousSeparator !== '&&') chain += 1;

    previousSeparator = command.separator;

    const at = commandWordIndex(command.words);

    if (dialect === 'powershell') recordPowerShellEnvironment(command.words, lineEnvironment);
    if (dialect === 'bash' && at !== -1) recordBashEnvironment(command.words, at, lineEnvironment);

    let gitSubcommand;

    if (at !== -1 && executableName(command.words[at]) === 'git') {
      const invocation = invocations[next];

      gitSubcommand = invocation?.subcommand;

      if (invocation === undefined) throw new Error('the git invocations of the line do not match its commands');

      next += 1;

      const environment = new Map(lineEnvironment);

      for (const word of command.words.slice(0, at).filter(isAssignment)) environment.set(...splitAssignment(word));

      const config = configOf(invocation.gitOptions, environment);

      found.push(...expanded({ ...invocation, environment, config, chain, before: [...before] }, aliasesOf(config), 0));
    }

    before.push({ words: command.words, text: command.text, gitSubcommand });
  }

  if (next !== invocations.length) throw new Error('the git invocations of the line do not match its commands');

  return found;
}
