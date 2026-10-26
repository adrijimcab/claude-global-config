/**
 * The PowerShell cmdlets that run a command given as DATA: `Invoke-Expression` / `iex` run a string as a
 * script, and `Start-Process` runs a program with an argument list. The words they carry are commands in
 * disguise, so a guard that only looked at the cmdlet name never saw the `git` inside.
 *
 * ONE RESPONSIBILITY: turn the words after such a cmdlet into the one-line script it runs, so the lexer can
 * read it like any other line.
 *
 * NOT MODELLED, stated: an expression that is not a literal string (`iex (Get-Content x)`), because its
 * value is not in the line.
 *
 * @es Los cmdlets de PowerShell que ejecutan un comando dado como DATO: `Invoke-Expression` / `iex` corren
 * una cadena y `Start-Process` un programa con su lista de argumentos. Devuelven el script de una línea que
 * ejecutan para que el analizador lo lea como cualquier otra. No se modelan expresiones que no son cadenas literales.
 */

/** Cmdlets that run their string argument as a script. @es Cmdlets que corren su cadena como script. */
const EXPRESSION_RUNNERS = ['iex', 'invoke-expression'];

/** Cmdlets that run a program with arguments. @es Cmdlets que corren un programa con argumentos. */
const PROCESS_STARTERS = ['start-process', 'saps'];

/** `Start-Process` parameters that name the program. @es Parámetros que nombran el programa. */
const FILE_PARAMETERS = ['-filepath'];

/** `Start-Process` parameters that carry the argument list. @es Parámetros que llevan la lista de argumentos. */
const ARGUMENT_PARAMETERS = ['-argumentlist', '-args'];

/** `Start-Process` switches, which take no value. @es Interruptores de `Start-Process`, sin valor. */
const PROCESS_SWITCHES = ['-wait', '-passthru', '-nonewwindow', '-usenewenvironment', '-loaduserprofile', '-whatif', '-confirm'];

/** A word quoted so the lexer reads it back as one word. @es Una palabra entrecomillada para que el analizador la lea entera. */
const quoted = (word) => `'${word.split("'").join("''")}'`;

/** `iex '<script>'`: the string is the script; an explicit `-Command` name is dropped. @es El script de `iex`. */
function expressionScript(args) {
  const rest = args[0]?.toLowerCase() === '-command' ? args.slice(1) : args;

  return rest.join(' ');
}

/** `Start-Process <file> [-ArgumentList a,b]`: the program followed by its arguments. @es El script de `Start-Process`. */
function processScript(args) {
  const positionals = [];
  let file;
  let argumentList;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index].toLowerCase();

    if (FILE_PARAMETERS.includes(word)) file = args[(index += 1)];
    else if (ARGUMENT_PARAMETERS.includes(word)) argumentList = args[(index += 1)];
    else if (PROCESS_SWITCHES.includes(word)) continue;
    else if (word.startsWith('-')) index += 1;
    else positionals.push(args[index]);
  }

  file ??= positionals.shift();
  argumentList ??= positionals.shift();

  if (file === undefined) return undefined;

  return `${quoted(file)} ${(argumentList ?? '').split(',').join(' ')}`;
}

/**
 * The script a PowerShell runner cmdlet runs, or `undefined` when `name` is not one or it runs nothing.
 * @param {string} name The cmdlet's executable name, lowercased.
 * @param {string[]} args The words after the cmdlet.
 * @es El script que corre un cmdlet ejecutor de PowerShell, o `undefined`.
 */
export function powershellRunnerScript(name, args) {
  if (EXPRESSION_RUNNERS.includes(name)) return args.length === 0 ? undefined : expressionScript(args);
  if (PROCESS_STARTERS.includes(name)) return processScript(args);

  return undefined;
}
