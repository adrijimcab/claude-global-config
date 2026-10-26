/**
 * Whether a script text CALLS something that writes a file: the write calls of node, python and .NET, a python
 * `open(…)` whose mode writes, and a PowerShell writing cmdlet. That is the one question this module answers;
 * where the text comes from, and the shell syntax of a shell script (its redirections, `tee`, `cp`, `sed -i`),
 * are `detect.mjs`, which owns the shell tokenizer.
 *
 * WHY (2026-10-18, a delegated writer): source written through `node - <<'EOF' … fs.writeFileSync(…) … EOF`
 * lost a backslash and an apostrophe on the way, and nothing refused it. The Write and Edit tools never go
 * through a shell; a script that writes a file from a shell-fed script does.
 *
 * HOW A CALL IS READ (2026-10-19, two blind judges): a marker counts only as a CALL SITE, `name(` or `.name(`
 * with nothing but blanks between the name and the parenthesis and no identifier character glued before it, so
 * a word inside a message (`console.log('use writeFile')`) or a longer name (`myWriteFile(`) is not a write. A
 * PowerShell cmdlet counts only as a command word (any case). A python `open(` is read with balanced brackets
 * and quotes, so `open(os.path.join(a, 'b'), 'w')` finds its mode, and the mode is read by position or by
 * name: the second argument of `open(…)` and of a known module function (`gzip`, `bz2`, `lzma`, `tarfile`, `io`,
 * `codecs`, `fs`, `fs.promises`); for any other receiver (a Path chain, an alias) the first and the second, so a
 * receiver that cannot be read fails closed. A mode counts by its access part (before `:` or `|`) and only when it
 * is made of mode characters. A script that references a filesystem module (`fs`, `node:fs`, `os`, `shutil`,
 * `pathlib`) is also judged by method names (`rename`, `cp`, `copyFile`, `writeFile`, …) on any receiver.
 *
 * @es Si un texto de script LLAMA a algo que escribe un fichero: las llamadas de escritura de node, python y
 * .NET, un `open(…)` de python con modo de escritura y un cmdlet de PowerShell que escribe. La sintaxis de shell
 * de un script de shell (redirecciones, `tee`, `cp`, `sed -i`) la juzga `detect.mjs`, dueño del tokenizador. CÓMO
 * SE LEE UNA LLAMADA: un marcador cuenta solo como LLAMADA, `nombre(` o `.nombre(`, sin carácter de identificador
 * pegado delante, así una palabra dentro de un mensaje o un nombre más largo no es una escritura. Un cmdlet de
 * PowerShell cuenta solo como palabra de orden. Un `open(` de python se lee con paréntesis y comillas
 * equilibrados, y el modo por posición o por nombre: el segundo argumento de `open(…)` y de una función de módulo
 * conocida (`gzip`, `bz2`, `lzma`, `tarfile`, `io`, `codecs`, `fs`, `fs.promises`); para cualquier otro receptor
 * (una cadena de Path, un alias) el primero y el segundo, así un receptor ilegible falla cerrado. Un modo cuenta por
 * su parte de acceso (antes de `:` o `|`) y solo si está hecho de caracteres de modo. Un script que hace referencia a
 * un módulo de ficheros (`fs`, `node:fs`, `os`, `shutil`, `pathlib`) se juzga además por nombres de método
 * (`rename`, `cp`, `copyFile`, `writeFile`, …) sobre cualquier receptor.
 */

/**
 * Calls that write a file, matched as call sites; a trailing `*` is any continuation of the name
 * (`shutil.copy*` is `copy`, `copy2`, `copyfile`, `copytree`).
 * @es Llamadas que escriben un fichero, como llamadas; un `*` final es cualquier continuación del nombre.
 */
export const CALL_MARKERS = [
  'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream', 'writeSync', 'fs.write',
  'copyFileSync', 'copyFile', 'renameSync', 'fs.rename', 'cpSync', 'fs.cp', 'write_text', 'write_bytes', 'shutil.copy*',
  'shutil.move', 'os.replace', 'os.rename', 'Deno.writeTextFile', 'Bun.write', 'WriteAllText', 'WriteAllLines', 'AppendAllText'
];

/** PowerShell cmdlets that write a file, matched as command words in any case. @es Cmdlets de PowerShell que escriben un fichero. */
export const CMDLET_MARKERS = ['Set-Content', 'Add-Content', 'Out-File', 'Copy-Item', 'Tee-Object'];

/** Python `open` modes that write, append or create. @es Modos de `open` de python que escriben, añaden o crean. */
const WRITING_MODE_LETTERS = 'wax+';

/** The characters a mode or `fs` flags literal is made of. @es Los caracteres de un literal de modo o de flags de `fs`. */
const MODE_CHARACTERS = 'rwaxbts+';

/** Where tarfile and the compression modules start the compression part of a mode. @es Donde empieza la parte de compresión de un modo. */
const COMPRESSION_SEPARATORS = ':|';

/** Modules whose `open` takes the path first and the mode (or `fs` flags) second. @es Módulos cuyo `open` toma la ruta primero y el modo segundo. */
const PATH_FIRST_MODULES = new Set(['gzip', 'bz2', 'lzma', 'tarfile', 'io', 'codecs', 'fs', 'fs.promises']);

/** JS module specifiers of the file system. @es Especificadores JS del sistema de ficheros. */
const JS_FILESYSTEM_MODULES = ['fs', 'fs/promises', 'node:fs', 'node:fs/promises'];

/** The quotes a JS specifier is written in. @es Las comillas de un especificador JS. */
const SPECIFIER_QUOTES = ["'", '"', '`'];

/** Python modules of the file system. @es Módulos de python del sistema de ficheros. */
const PYTHON_FILESYSTEM_MODULES = new Set(['os', 'shutil', 'pathlib']);

/**
 * Methods that write a file, judged on any receiver once a filesystem module is referenced. Only the names that are
 * no bare call marker already: `copyFile`, `writeFile`, `appendFile`, `write_text`, `write_bytes` and the sync forms
 * are judged on any receiver in every script.
 * @es Métodos que escriben un fichero, juzgados sobre cualquier receptor una vez referenciado un módulo de ficheros.
 * Solo los nombres que no son ya un marcador de llamada desnudo: los demás se juzgan sobre cualquier receptor siempre.
 */
export const FILESYSTEM_METHODS = ['rename', 'cp'];

/** Characters that may sit before a cmdlet word. @es Caracteres que pueden ir delante de una palabra de cmdlet. */
const BEFORE_A_COMMAND_WORD = ' \t\r\n|;({=&';

/** Characters that may follow a cmdlet word. @es Caracteres que pueden seguir a una palabra de cmdlet. */
const AFTER_A_COMMAND_WORD = ' \t\r\n|;)}';

const OPEN_NAME = 'open';

const isIdentifierCharacter = (character) =>
  character !== undefined && ((character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || character === '_');

/** Skips blanks from `at`. @es Salta blancos desde `at`. */
function afterBlanks(text, at) {
  let index = at;

  while (text[index] === ' ' || text[index] === '\t') index += 1;

  return index;
}

/**
 * Every call site of `name` in `text`: the index of the name and of its opening parenthesis. `prefix` lets the
 * name run on with identifier characters.
 * @es Cada llamada de `name` en `text`: el índice del nombre y de su paréntesis de apertura.
 */
function callSites(text, name, prefix) {
  const sites = [];

  for (let from = text.indexOf(name); from !== -1; from = text.indexOf(name, from + 1)) {
    if (isIdentifierCharacter(text[from - 1])) continue;

    let end = from + name.length;

    // A longer name (`writeFileSync` for `writeFile`) never reaches a `(` right after the marker, so it is no site.
    // @es Un nombre más largo nunca llega a un `(` justo tras el marcador, así que no es una llamada.
    if (prefix) while (isIdentifierCharacter(text[end])) end += 1;

    const open = afterBlanks(text, end);

    if (text[open] === '(') sites.push({ at: from, open });
  }

  return sites;
}

/** The first call marker called in `text`, or `undefined`. @es El primer marcador de llamada llamado en `text`, o `undefined`. */
function calledMarker(text) {
  return CALL_MARKERS.find((marker) => (marker.endsWith('*') ? callSites(text, marker.slice(0, -1), true) : callSites(text, marker, false)).length > 0);
}

/**
 * `text` with the inside of every one-line quoted run blanked, so a word inside a message is never a command word.
 * A quote with no partner on its line is left as it is, so it blanks nothing after it.
 * @es `text` con el interior de cada tramo entre comillas de una línea en blanco; una comilla sin pareja en su
 * línea se deja como está, así no blanquea nada de lo que sigue.
 */
function withoutQuotedText(text) {
  let result = '';

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const newline = text.indexOf('\n', index);
    const lineEnd = newline === -1 ? text.length : newline;
    const close = character === "'" || character === '"' ? text.indexOf(character, index + 1) : -1;

    if (close === -1 || close > lineEnd) {
      result += character;
      continue;
    }

    result += `${character}${' '.repeat(close - index - 1)}${character}`;
    index = close;
  }

  return result;
}

/** The first writing cmdlet used as a command word in `text`, or `undefined`. @es El primer cmdlet que escribe usado como palabra de orden. */
function usedCmdlet(text) {
  const lower = withoutQuotedText(text).toLowerCase();

  return CMDLET_MARKERS.find((cmdlet) => {
    const wanted = cmdlet.toLowerCase();

    for (let from = lower.indexOf(wanted); from !== -1; from = lower.indexOf(wanted, from + 1)) {
      const before = from === 0 || BEFORE_A_COMMAND_WORD.includes(lower[from - 1]);
      const after = from + wanted.length === lower.length || AFTER_A_COMMAND_WORD.includes(lower[from + wanted.length]);

      if (before && after) return true;
    }

    return false;
  });
}

/**
 * The top-level arguments of the call whose `(` is at `open`, each trimmed: brackets and quotes are balanced,
 * so a comma inside `os.path.join(a, 'b')` or `'a,b'` does not split an argument.
 * @es Los argumentos de primer nivel de la llamada cuyo `(` está en `open`: corchetes y comillas equilibrados.
 */
export function callArguments(text, open) {
  const parts = [];
  let depth = 0;
  let current = '';

  for (let index = open + 1; index < text.length; index += 1) {
    const character = text[index];

    if (character === "'" || character === '"') {
      let close = index + 1;

      while (close < text.length && text[close] !== character) close += text[close] === '\\' ? 2 : 1;

      current += text.slice(index, close + 1);
      index = close;
      continue;
    }

    if (character === '(' || character === '[' || character === '{') depth += 1;

    if (character === ')' || character === ']' || character === '}') {
      if (depth === 0) break;

      depth -= 1;
    }

    if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim().length > 0) parts.push(current.trim());

  return parts;
}

/** The text of a string literal argument, without its quotes, or `undefined`. @es El texto de un argumento literal de cadena, o `undefined`. */
function literalOf(argument) {
  const quote = argument?.[0];

  return (quote === "'" || quote === '"') && argument.length >= 2 && argument.endsWith(quote) ? argument.slice(1, -1) : undefined;
}

/** Whether an argument is a keyword argument (`mode='w'`), not a positional one. @es Si un argumento es con nombre. */
const keywordOf = (argument) => {
  const equals = argument.indexOf('=');

  return equals > 0 && argument[equals + 1] !== '=' && [...argument.slice(0, equals).trim()].every(isIdentifierCharacter) ? argument.slice(0, equals).trim() : undefined;
};

/** Whether a character may sit in a dotted name (`fs.promises`). @es Si un carácter puede ir en un nombre con puntos. */
const isNameCharacter = (character) => isIdentifierCharacter(character) || character === '.';

/** The start of the dotted name that ends just before `end`. @es El inicio del nombre con puntos que acaba justo antes de `end`. */
function nameStart(text, end) {
  let start = end;

  while (isNameCharacter(text[start - 1])) start -= 1;

  return start;
}

/**
 * The mode literals that decide the `open(` call at `site`: the `mode=` argument, else by position:
 *   - a plain `open(` and a known module function (`gzip`, `bz2`, `lzma`, `tarfile`, `io`, `codecs`, `fs`,
 *     `fs.promises`): the second positional argument (the mode, or `fs`'s flags);
 *   - any other receiver (`Path(x).resolve().open('w')`, `(base / 'f').open('w')`, an alias `fsp.open(p, 'w')`):
 *     the first AND the second, because the receiver cannot be read, so a writing mode in either fails closed.
 * @es Los literales de modo que deciden la llamada `open(` en `site`: el argumento `mode=`, si no por posición: el
 * segundo para `open(` y para una función de módulo conocida; para cualquier otro receptor, el primero Y el segundo,
 * porque el receptor no se puede leer, así que un modo de escritura en cualquiera de los dos falla cerrado.
 */
function modesOf(text, site) {
  const parts = callArguments(text, site.open);
  const named = parts.find((part) => keywordOf(part) === 'mode');

  if (named !== undefined) return [literalOf(named.slice(named.indexOf('=') + 1).trim())];

  const positional = parts.filter((part) => keywordOf(part) === undefined);
  const dot = site.at - 1;
  const known = text[dot] !== '.' || PATH_FIRST_MODULES.has(text.slice(nameStart(text, dot), dot));

  return (known ? [positional[1]] : [positional[0], positional[1]]).map(literalOf);
}

/**
 * Whether a literal is a mode that writes. Only its access part counts: tarfile and the compression modules put a
 * compression after `:` or `|` (`'r:xz'` reads, `'w|gz'` writes). The access part must be made of mode characters
 * only, so a path such as `'cache'` or `'x.png'` is no mode.
 * @es Si un literal es un modo que escribe. Solo cuenta su parte de acceso: tarfile y los módulos de compresión ponen
 * la compresión tras `:` o `|`. La parte de acceso debe ser solo caracteres de modo, así una ruta no es un modo.
 */
function writesWith(mode) {
  const cut = [...mode].findIndex((character) => COMPRESSION_SEPARATORS.includes(character));
  const access = cut === -1 ? mode : mode.slice(0, cut);

  return [...access].every((character) => MODE_CHARACTERS.includes(character)) && [...access].some((character) => WRITING_MODE_LETTERS.includes(character));
}

/** Whether the script calls an `open` in a mode that writes. @es Si el script llama a un `open` con un modo que escribe. */
function opensForWriting(text) {
  return callSites(text, OPEN_NAME, false).some((site) => modesOf(text, site).some((mode) => mode !== undefined && writesWith(mode)));
}

/** The first word of `text`, up to a blank. @es La primera palabra de `text`, hasta un blanco. */
function firstWord(text) {
  const end = [...text].findIndex((character) => character === ' ' || character === '\t');

  return end === -1 ? text : text.slice(0, end);
}

/** The top-level modules a python `import` or `from` line names (`import os.path, sys` is `os`, `sys`). @es Los módulos que nombra una línea `import` o `from`. */
function importedModules(line) {
  const keyword = firstWord(line);
  const rest = line.slice(keyword.length).trim();

  if (keyword === 'from') return [firstWord(rest).split('.')[0]];
  if (keyword === 'import') return rest.split(',').map((part) => firstWord(part.trim()).split('.')[0]);

  return [];
}

/**
 * Whether the script references a filesystem module: a JS specifier (`'fs'`, `'fs/promises'`, `'node:fs'`,
 * `'node:fs/promises'`, in any quote) or a python import of `os`, `shutil` or `pathlib`.
 * @es Si el script hace referencia a un módulo del sistema de ficheros: un especificador JS o un import de python.
 */
function referencesFilesystemModule(text) {
  if (JS_FILESYSTEM_MODULES.some((name) => SPECIFIER_QUOTES.some((quote) => text.includes(`${quote}${name}${quote}`)))) return true;

  return text.split('\n').some((line) => importedModules(line.trim()).some((name) => PYTHON_FILESYSTEM_MODULES.has(name)));
}

/**
 * The first filesystem method called in a script that references a filesystem module, on ANY receiver or none, so
 * `fsp.rename(`, `promises.cp(` and a destructured `rename(` all count; `undefined` when the script references no
 * such module or calls none of the methods.
 * @es El primer método de ficheros llamado en un script que hace referencia a un módulo de ficheros, sobre CUALQUIER
 * receptor o ninguno, así cuentan un alias y un `rename(` desestructurado.
 */
function calledFilesystemMethod(text) {
  return referencesFilesystemModule(text) ? FILESYSTEM_METHODS.find((name) => callSites(text, name, false).length > 0) : undefined;
}

/**
 * The reason a script calls something that writes a file, or `undefined` when it calls nothing that does.
 * @es La razón por la que un script llama a algo que escribe un fichero, o `undefined`.
 */
export function writeEvidence(text) {
  const marker = calledMarker(text);

  if (marker !== undefined) return `calls ${marker}`;

  const method = calledFilesystemMethod(text);

  if (method !== undefined) return `calls ${method} of a filesystem module`;

  const cmdlet = usedCmdlet(text);

  if (cmdlet !== undefined) return `calls ${cmdlet}`;
  if (opensForWriting(text)) return "opens a file with a mode that writes (open(…, 'w'))";

  return undefined;
}
