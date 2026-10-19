/**
 * Whether an interpreter invocation reads its SCRIPT from standard input. That is the one question this module
 * answers, over the argument words of one invocation; which text reaches that standard input is `detect.mjs`.
 *
 * WHY (2026-10-19, two blind judges): the first rule asked "is every argument an option or `-`", so
 * `python3 - arg`, `node -r ./hook.js -` and `node /dev/stdin` read as "not stdin" and their heredoc ran
 * unexamined. The decision now follows each interpreter's own command line: an interpreter reads its script
 * from standard input exactly when it gets NO script source argument. Walking the words left to right:
 *   - `-` or `/dev/stdin` is the script: standard input, and what follows are the script's arguments;
 *   - an inline-code or module option (`node -e`, `python -c`/`-m`, `bash -c`, `pwsh -Command x`) takes the
 *     script from elsewhere; `pwsh -Command -` and `pwsh -File -` read it from standard input;
 *   - an option that takes a value (`node -r ./x`, `python -W ignore`, `bash -o pipefail`) skips that value;
 *   - `bash -s` reads standard input whatever the arguments after it are;
 *   - after `--`, the next word is the script path, or standard input when there is none or it is `-`;
 *   - `deno run` and `bun run` are subcommands, any other first word of deno or bun takes the script elsewhere;
 *   - the first other word is the script path.
 * Running out of words is standard input. Interpreters are matched by BASE name, so `python3.12`, `perl5.36`
 * and `/usr/bin/node.exe` are what they are.
 *
 * @es Si una invocación de intérprete lee su SCRIPT de la entrada estándar. POR QUÉ: la primera regla
 * preguntaba «¿todo argumento es una opción o `-`?», así que `python3 - arg`, `node -r ./hook.js -` y `node
 * /dev/stdin` se leían como «no stdin» y su heredoc corría sin examinar. Ahora la decisión sigue la línea de
 * órdenes de cada intérprete: lee su script de la entrada estándar justo cuando NO recibe un argumento con el
 * script. `-` o `/dev/stdin` es el script; una opción de código inline o de módulo lo toma de otro sitio
 * (`pwsh -Command -` lo lee de stdin); una opción con valor salta ese valor; `bash -s` lee stdin; tras `--` la
 * siguiente palabra es la ruta del script; `deno run` y `bun run` son subórdenes; la primera otra palabra es la
 * ruta del script. Quedarse sin palabras es stdin. Los intérpretes se reconocen por nombre BASE.
 */

/**
 * Node options that take their value from the NEXT word (`node -r ./hook.js script.mjs`). Options written with
 * `=` carry their value inline and need no entry. Shared with the node evaluate-flag walk of `detect.mjs`.
 * @es Opciones de node cuyo valor es la palabra SIGUIENTE. Las escritas con `=` llevan el valor dentro. Se
 * comparten con el recorrido de flags de evaluación de node de `detect.mjs`.
 */
export const NODE_OPTIONS_TAKING_A_VALUE = new Set([
  '-r',
  '--require',
  '--import',
  '--loader',
  '--experimental-loader',
  '-C',
  '--conditions',
  '--input-type',
  '--env-file',
  '--title',
  '--stack-trace-limit',
  '--disable-warning',
  '--watch-path',
  '--test-name-pattern',
  '--inspect-port',
]);

/** The script words that mean standard input. @es Las palabras de script que significan entrada estándar. */
const STDIN_SCRIPTS = new Set(['-', '/dev/stdin']);

const NODE_LONG_VALUES = new Set([...NODE_OPTIONS_TAKING_A_VALUE].filter((option) => option.startsWith('--')));

/**
 * Every interpreter family: its base `names`, whether it is `shellLike` (its `>` is a redirection), and its
 * command line. Short options are read letter by letter: `code` letters take the script elsewhere, `stdin`
 * letters force standard input, `value` letters take a value (the rest of the word, or the next word), `rest`
 * letters swallow the rest of the word, `digits` letters swallow the digits after them. `codeLong` and
 * `valueLong` are the long options. `subcommand` names the one subcommand that keeps reading the command line.
 * @es Cada familia de intérpretes: sus `names` base, si es `shellLike` (su `>` es una redirección) y su línea de
 * órdenes, leída letra a letra para las opciones cortas y por nombre para las largas.
 */
export const FAMILIES = [
  { family: 'node', names: ['node', 'nodejs', 'tsx'], shellLike: false, code: 'ep', value: 'rC', codeLong: new Set(['--eval', '--print']), valueLong: NODE_LONG_VALUES },
  { family: 'python', names: ['python', 'py'], shellLike: false, code: 'cm', value: 'WXQ' },
  { family: 'perl', names: ['perl'], shellLike: false, code: 'eE', value: 'I', rest: 'iMmdDxV', digits: 'l0C' },
  { family: 'ruby', names: ['ruby'], shellLike: false, code: 'e', value: 'rICE' },
  { family: 'deno', names: ['deno'], shellLike: false, value: 'c', valueLong: new Set(['--config', '--import-map', '--location', '--seed', '--cert', '--lock', '--env-file']), subcommand: 'run' },
  { family: 'bun', names: ['bun'], shellLike: false, code: 'ep', value: 'r', codeLong: new Set(['--eval', '--print']), valueLong: new Set(['--preload', '--cwd', '--env-file', '--config']), subcommand: 'run' },
  { family: 'shell', names: ['sh', 'bash', 'zsh', 'dash'], shellLike: true, plusOptions: true, code: 'c', stdin: 's', value: 'oO', valueLong: new Set(['--rcfile', '--init-file']) },
  { family: 'powershell', names: ['pwsh', 'powershell'], shellLike: true, powershell: true }
];

const isDigit = (character) => character >= '0' && character <= '9';

/**
 * The family of a program name (`programName` of `launchers.mjs`): a base name, or a base name followed by a
 * version (`python3`, `python3.12`, `perl5.36`); `undefined` for any other program.
 * @es La familia de un nombre de programa: un nombre base, o uno seguido de una versión; `undefined` si no lo es.
 */
export function familyOf(name) {
  return FAMILIES.find(({ names }) =>
    names.some((base) => name === base || (name.startsWith(base) && [...name.slice(base.length)].every((character) => isDigit(character) || character === '.')))
  );
}

/** PowerShell options that name the script: their value is the script, `-` meaning standard input. @es Opciones de PowerShell que nombran el script. */
const POWERSHELL_SCRIPT_OPTIONS = new Set(['command', 'c', 'encodedcommand', 'e', 'ec', 'file', 'f']);

/** PowerShell options that take a value. @es Opciones de PowerShell que toman un valor. */
const POWERSHELL_VALUE_OPTIONS = new Set(['executionpolicy', 'ep', 'ex', 'workingdirectory', 'wd', 'configurationname', 'config', 'outputformat', 'of', 'o', 'inputformat', 'if', 'in', 'windowstyle', 'w', 'version', 'v', 'settingsfile', 'settings', 'custompipename', 'psconsolefile']);

/** What one option word means: `{ code, stdin, value }`. @es Qué significa una palabra de opción. */
function optionMeaning(family, raw, next) {
  if (family.powershell) {
    const name = raw.slice(1).toLowerCase();

    if (POWERSHELL_SCRIPT_OPTIONS.has(name)) return next !== undefined && STDIN_SCRIPTS.has(next.raw) ? { stdin: true, value: true } : { code: true };

    return { value: POWERSHELL_VALUE_OPTIONS.has(name) };
  }

  if (raw.startsWith('--')) {
    const name = raw.includes('=') ? raw.slice(0, raw.indexOf('=')) : raw;

    return { code: family.codeLong?.has(name) === true, value: family.valueLong?.has(name) === true && !raw.includes('=') };
  }

  const meaning = { code: false, stdin: false, value: false };
  const letters = raw.slice(1);

  for (let index = 0; index < letters.length; index += 1) {
    const letter = letters[index];

    if ((family.code ?? '').includes(letter)) return { ...meaning, code: true };
    if ((family.stdin ?? '').includes(letter)) meaning.stdin = true;
    if ((family.value ?? '').includes(letter)) return { ...meaning, value: index === letters.length - 1 };
    if ((family.rest ?? '').includes(letter)) return meaning;
    if ((family.digits ?? '').includes(letter)) while (isDigit(letters[index + 1])) index += 1;
  }

  return meaning;
}

/** Whether a word is an option of `family`. @es Si una palabra es una opción de `family`. */
const isOption = (family, token) => !token.quoted && token.raw.length > 1 && (token.raw[0] === '-' || (family.plusOptions === true && token.raw[0] === '+'));

/**
 * Whether the interpreter of `family`, given the argument `words` (here-string words are standard input data,
 * never arguments), reads its script from standard input.
 * @es Si el intérprete de `family`, con las palabras argumento `words` (las de here-string son datos de stdin,
 * nunca argumentos), lee su script de la entrada estándar.
 */
export function readsScriptFromStdin(family, words) {
  const argumentsOnly = words.filter((word) => !word.hereString);
  let subcommandPending = family.subcommand !== undefined;
  let stdinForced = false;

  for (let index = 0; index < argumentsOnly.length; index += 1) {
    const word = argumentsOnly[index];

    if (STDIN_SCRIPTS.has(word.raw)) return true;

    if (!word.quoted && word.raw === '--') {
      const next = argumentsOnly[index + 1];

      return stdinForced || next === undefined || STDIN_SCRIPTS.has(next.raw);
    }

    if (isOption(family, word)) {
      const meaning = optionMeaning(family, word.raw, argumentsOnly[index + 1]);

      if (meaning.code) return false;
      if (meaning.stdin) stdinForced = true;
      if (meaning.value) index += 1;
      continue;
    }

    if (subcommandPending && word.raw === family.subcommand) {
      subcommandPending = false;
      continue;
    }

    return stdinForced;
  }

  return true;
}
