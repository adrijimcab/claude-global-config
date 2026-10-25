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
 * name: the second argument of `open(…)` and of a module function (`gzip`, `bz2`, `lzma`, `tarfile`, `io`,
 * `codecs`, `fs`, `fs.promises`), the first of a pathlib Path (`Path(p).open('w')`, or a name assigned a Path on
 * an earlier line); any other `.open(` method (`Image.open`) is no file-mode open and is not judged.
 *
 * @es Si un texto de script LLAMA a algo que escribe un fichero: las llamadas de escritura de node, python y
 * .NET, un `open(…)` de python con modo de escritura y un cmdlet de PowerShell que escribe. La sintaxis de shell
 * de un script de shell (redirecciones, `tee`, `cp`, `sed -i`) la juzga `detect.mjs`, dueño del tokenizador. CÓMO
 * SE LEE UNA LLAMADA: un marcador cuenta solo como LLAMADA, `nombre(` o `.nombre(`, sin carácter de identificador
 * pegado delante, así una palabra dentro de un mensaje o un nombre más largo no es una escritura. Un cmdlet de
 * PowerShell cuenta solo como palabra de orden. Un `open(` de python se lee con paréntesis y comillas
 * equilibrados, y el modo por posición o por nombre: el segundo argumento de `open(…)` y de una función de módulo
 * (`gzip`, `bz2`, `lzma`, `tarfile`, `io`, `codecs`, `fs`, `fs.promises`), el primero de un Path de pathlib
 * (`Path(p).open('w')`, o un nombre al que se asignó un Path en una línea anterior); cualquier otro método
 * `.open(` (`Image.open`) no es un `open` con modo de fichero y no se juzga.
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

/** Modules whose `open` takes the path first and the mode (or `fs` flags) second. @es Módulos cuyo `open` toma la ruta primero y el modo segundo. */
const PATH_FIRST_MODULES = new Set(['gzip', 'bz2', 'lzma', 'tarfile', 'io', 'codecs', 'fs', 'fs.promises']);

/** The pathlib classes whose `open` takes the mode first. @es Las clases de pathlib cuyo `open` toma el modo primero. */
const PATH_CLASSES = new Set(['Path', 'pathlib.Path']);

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
 * The receiver of the method `open(` at `site`: `{ name, call }`, the dotted name before `.open`, or, when the
 * receiver is a call (`Path(p).open`), the dotted name of the callee with `call` set.
 * @es El receptor del método `open(` en `site`: el nombre con puntos antes de `.open` o, si el receptor es una
 * llamada (`Path(p).open`), el nombre del llamado con `call` activo.
 */
function receiverOf(text, site) {
  const dot = site.at - 1;

  if (text[dot - 1] !== ')') return { name: text.slice(nameStart(text, dot), dot), call: false };

  let depth = 0;
  let open = dot - 1;

  for (; open >= 0; open -= 1) {
    if (text[open] === ')') depth += 1;
    if (text[open] === '(') depth -= 1;
    if (depth === 0) break;
  }

  return { name: text.slice(nameStart(text, open), open), call: true };
}

/** Whether `name` was assigned a pathlib Path on a line before `before` (`p = Path('x')`). @es Si a `name` se le asignó un Path en una línea anterior. */
function assignedPath(text, name, before) {
  const lineStart = text.lastIndexOf('\n', before) + 1;

  return text.slice(0, lineStart).split('\n').some((line) => {
    const trimmed = line.trim();
    const rest = trimmed.slice(name.length).trimStart();

    return trimmed.startsWith(name) && rest.startsWith('=') && [...PATH_CLASSES].some((path) => rest.slice(1).trimStart().startsWith(`${path}(`));
  });
}

/**
 * The mode of the `open(` call at `site`, by `mode=` or by position, or `undefined` when it is not judged:
 *   - a plain `open(` and a module function (`gzip`, `bz2`, `lzma`, `tarfile`, `io`, `codecs`, `fs`,
 *     `fs.promises`): the second positional argument (the mode, or `fs`'s flags);
 *   - a pathlib Path (`Path(…).open`, `pathlib.Path(…).open`, a name assigned a Path on an earlier line): the first;
 *   - any other method (`Image.open`, `obj.open`): not judged, it is no file-mode open we know.
 * @es El modo de la llamada `open(` en `site`, por `mode=` o por posición, o `undefined` si no se juzga: el segundo
 * argumento para `open(` y las funciones de módulo; el primero para un Path de pathlib; cualquier otro método no se juzga.
 */
function modeOf(text, site) {
  const parts = callArguments(text, site.open);
  const named = parts.find((part) => keywordOf(part) === 'mode');
  const positional = parts.filter((part) => keywordOf(part) === undefined);
  let index = 1;

  if (text[site.at - 1] === '.') {
    const receiver = receiverOf(text, site);
    const path = receiver.call ? PATH_CLASSES.has(receiver.name) : assignedPath(text, receiver.name, site.at);

    if (path) index = 0;
    else if (receiver.call || !PATH_FIRST_MODULES.has(receiver.name)) return undefined;
  }

  return named !== undefined ? literalOf(named.slice(named.indexOf('=') + 1).trim()) : literalOf(positional[index]);
}

/** Whether the script calls python's `open` in a mode that writes. @es Si el script llama al `open` de python con un modo que escribe. */
function opensForWriting(text) {
  return callSites(text, OPEN_NAME, false).some((site) => {
    const mode = modeOf(text, site);

    return mode !== undefined && [...mode].some((letter) => WRITING_MODE_LETTERS.includes(letter));
  });
}

/**
 * The reason a script calls something that writes a file, or `undefined` when it calls nothing that does.
 * @es La razón por la que un script llama a algo que escribe un fichero, o `undefined`.
 */
export function writeEvidence(text) {
  const marker = calledMarker(text);

  if (marker !== undefined) return `calls ${marker}`;

  const cmdlet = usedCmdlet(text);

  if (cmdlet !== undefined) return `calls ${cmdlet}`;
  if (opensForWriting(text)) return "opens a file with a mode that writes (open(…, 'w'))";

  return undefined;
}
