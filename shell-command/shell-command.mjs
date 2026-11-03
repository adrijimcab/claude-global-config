/**
 * The SIMPLE COMMANDS a shell line runs, with everything the shell treats as DATA kept out of them.
 *
 * WHY THIS EXISTS. Fleet guards tokenised a command by splitting on whitespace and then looked for a
 * token anywhere in the result (`toolchain-guard`: `npm` followed by `ci`; `worktree-tenancy`:
 * `git -C <path> <sub>`). That shape cannot tell a command from a MENTION of one:
 * `echo git cherry-pick abc` and `git commit -m "git cherry-pick abc"` carry the same tokens as the
 * pick itself. `toolchain-guard` answered by DELETING quoted spans, which also deletes a quoted path
 * the real command needs (`git -C "C:/a b" cherry-pick x`). The honest answer is the one a shell uses:
 * a word is a COMMAND only in command position, a quoted span is one word, a heredoc body and a comment
 * are not words at all, and `$(...)` / `bash -c "..."` run commands of their own.
 *
 * WHAT IT RETURNS. `simpleCommands(script, dialect)` yields, in execution order:
 *   { words, text, separator, depth, dialect, shell, start, quoting, redirections }
 *   - `words`        the command's words, quoting resolved, redirections and their targets removed;
 *   - `text`         the command's raw source slice, redirections included (for verbatim execution);
 *   - `separator`    the control operator that ended it (`&&`, `||`, `;`, `|`, `&`, `\n`, `(`, `)`, `end`);
 *   - `depth`        how many bash `(` subshells enclose it, so `(cd x); git ...` does not leak `cd x`;
 *   - `dialect`      the grammar the command was READ in: the line's own for its own commands, the nested
 *                    shell's for what `bash -c`, `powershell -Command` or `cmd /c` runs. A consumer reads a
 *                    command's words in THIS dialect, never in the line's: `del -WhatIf x` is a dry run of
 *                    PowerShell's `del` alias and a real deletion by cmd's `del`;
 *   - `shell`        the shell process that runs it, `{ dialect, script, parent, parentDepth }`, one frozen object
 *                    shared by every command of one script: the line's own (`parent` undefined) or a nested one
 *                    (a substitution, `bash -c`, ...), whose `parent` is the shell of the command that started
 *                    it and `parentDepth` that command's `depth`. What a nested shell does to its own state (a
 *                    `cd`) ends with it, which `cherry-pick-guard/working-directory.mjs` reads from here;
 *   - `start`        where `text` begins in `shell.script`;
 *   - `quoting`      per word (parallel to `words`), the source spans it was written in, `{ quote, start, end }`
 *                    with offsets into `shell.script` and `quote` one of `QUOTES`: which characters came from
 *                    single quotes, double quotes, bash `$'…'`, a substitution, or no quoting at all. Quote
 *                    delimiters belong to their span; a line continuation belongs to none;
 *   - `redirections` every redirection, `{ operator, target, quoting, start, end }`: `operator` its source
 *                    (`>`, `2>&`, `&>>`, `<<`), `target` the target word's value (`undefined` for a heredoc
 *                    or a target that never came) and `quoting` that word's spans.
 * Commands inside `$(...)`, backticks, `bash -c`, `powershell -Command` and `cmd /c` are emitted BEFORE
 * the command that contains them, because a substitution runs first.
 *
 * THE CONTRACT, stated once:
 *   - ONE ENTRY PER WRITTEN COMMAND. `simpleCommands` lists each command as written, exactly once.
 *   - THE EFFECTIVE PROGRAM comes from `resolveCommand(words)` on that entry (through `timeout`, `env`, ...).
 *     A command that carries its work as a STRING (`env -S '...'`, `iex '...'`, `Start-Process x
 *     -ArgumentList ...`) has no program of its own (`index` -1) and hands back that `script` and its `dialect`.
 *   - NESTED SCRIPTS come only through the nested-script path: `bash -c`, `powershell -Command`, `cmd /c`
 *     (read with the CMD dialect, where a backslash is literal), `$(...)`, backticks and the carried scripts
 *     above are listed before their container when `includeNested` is true (the default), and not at all
 *     when it is false. A launcher or runner never adds a second entry for its program by any other road.
 *   - A NESTED SCRIPT IS WHAT THE NESTED SHELL RECEIVES. It is built from the container's words after the line's
 *     own shell has expanded them, so a substitution the line runs itself (`bash -c "rm $(ls)"`) reaches it as
 *     `SUBSTITUTION_OUTPUT`, never as command text read a second time in another grammar.
 *
 * WHAT IT IS NOT, stated so nobody relies on it for more: a full shell grammar. Bash ANSI-C quoting (`$'…'`) IS
 * decoded, because bash decodes it before the command runs; parameter expansion and aliases are not evaluated; a word holding `$` (bash, PowerShell) or `%` (cmd `%VAR%`) stays literal, and
 * callers treat it as UNRESOLVABLE rather than guessing its value. `isUnresolvableWord(word)` is the ONE
 * shared answer to that question: a consumer that resolves a word as a path or a program asks it, and fails
 * closed when it says yes, instead of re-deriving the test. `cmd //c` (Git Bash spelling of `cmd /c`, since
 * MSYS rewrites a lone `/c` into a path) and `( )` command groups in the CMD dialect are modelled.
 *
 * NO REGEX (M5): a cursor with one named reader per lexical construct.
 *
 * @es Los COMANDOS SIMPLES que ejecuta una línea de shell, dejando FUERA todo lo que la shell trata como
 * DATO. Partir por espacios y buscar un token en cualquier sitio no distingue un comando de su MENCIÓN
 * (`echo git cherry-pick abc`), y borrar lo entrecomillado borra también la ruta que el comando real
 * necesita. La respuesta es la de la shell: una palabra es COMANDO solo en posición de comando, el
 * cuerpo de un heredoc y un comentario no son palabras, y `$(...)` / `bash -c "..."` corren comandos
 * propios. No es una gramática completa: una palabra con `$` (bash, PowerShell) o `%` (`%VAR%` de cmd) queda
 * literal y es NO RESOLUBLE. `isUnresolvableWord(word)` es la respuesta ÚNICA y compartida: el consumidor que
 * resuelve una palabra como ruta o programa la consulta y falla cerrado si dice que sí, sin rederivar la prueba.
 * Se modelan `cmd //c` (grafía de Git Bash de `cmd /c`, porque MSYS reescribe un `/c` suelto como ruta) y los
 * grupos `( )` del dialecto CMD.
 *
 * CADA ENTRADA dice en qué gramática se LEYÓ (`dialect`: la de la línea o la de la shell anidada; un consumidor lee
 * sus palabras en ESA, nunca en la de la línea), qué shell la corre (`shell`: la de la línea o una anidada, cuyo
 * `cd` muere con ella), con qué entrecomillado se escribió cada carácter de cada palabra (`quoting`: comillas
 * simples, dobles, `$'…'` de bash, sustitución o ninguno) y sus redirecciones con su destino (`redirections`).
 * EL CONTRATO: UNA ENTRADA POR COMANDO ESCRITO, una sola vez. El PROGRAMA EFECTIVO sale de `resolveCommand`
 * sobre esa entrada; un comando que lleva su trabajo como cadena (`env -S`, `iex`, `Start-Process`) no tiene
 * programa propio (`index` -1) y devuelve su `script` y su `dialect`. Los SCRIPTS ANIDADOS (`bash -c`,
 * `powershell -Command`, `cmd /c` con el dialecto CMD, donde la barra invertida es literal, `$(...)` y los
 * scripts anteriores) salen solo por la vía de anidados, antes de su contenedor, con `includeNested` activo. UN
 * SCRIPT ANIDADO ES LO QUE RECIBE LA SHELL ANIDADA: una sustitución que corre la propia línea le llega como
 * `SUBSTITUTION_OUTPUT`, nunca como texto de comando leído dos veces. El `$'…'` ANSI-C de bash SÍ se decodifica.
 */

import { launcherNamed, unwrapLauncher } from './launchers.mjs';
import { powershellRunnerScript } from './powershell-runners.mjs';

/**
 * The dialects the harness offers as tools (BASH, POWERSHELL) plus CMD, which only ever appears as the script
 * of `cmd /c`. @es Los dialectos que el harness ofrece (BASH, POWERSHELL) más CMD, que solo aparece como el
 * script de `cmd /c`.
 */
export const DIALECTS = Object.freeze({ BASH: 'bash', POWERSHELL: 'powershell', CMD: 'cmd' });

/**
 * The quoting a span of a word was written in: no quoting (`BARE`, an escape included), `'…'` (`SINGLE`), `"…"`
 * (`DOUBLE`), bash ANSI-C `$'…'` (`ANSI`, whose backslashes bash reads as escapes) and a `$(…)` or backtick
 * substitution (`SUBSTITUTION`, whose text is another script). @es El entrecomillado de un tramo de palabra: ninguno
 * (`BARE`, escape incluido), simples, dobles, `$'…'` ANSI-C de bash (`ANSI`, cuyas barras invertidas bash lee como
 * escapes) y una sustitución `$(…)` o con comillas invertidas (`SUBSTITUTION`, cuyo texto es otro script).
 */
export const QUOTES = Object.freeze({
  BARE: 'bare',
  SINGLE: 'single',
  DOUBLE: 'double',
  ANSI: 'ansi',
  SUBSTITUTION: 'substitution'
});

/** The dialect of a harness tool, or `undefined` for a tool that runs no shell. @es El dialecto de una herramienta. */
export function dialectOfTool(toolName) {
  if (toolName === 'Bash') return DIALECTS.BASH;
  if (toolName === 'PowerShell') return DIALECTS.POWERSHELL;

  return undefined;
}

/**
 * The per-dialect lexical facts, longest operator first so `&&` is never read as two `&`.
 * PowerShell has no `&` separator: a leading `&` is its CALL operator, which stays a prefix word.
 * CMD: backslash is a path separator, `^` the escape (not inside `"`), `'` and `#` ordinary characters,
 * `$(` no substitution, `%VAR%` opaque text (see `isUnresolvableWord`); `&`, `&&`, `||` and `|` separate commands;
 * `( )` delimit a command GROUP (`commandGroups`, CMD only: bash and PowerShell list their parentheses as operators).
 * `commentMarker` starts a comment word; `singleQuotes` and `substitutions` say whether `'...'` and `$(...)`
 * mean anything; `escapeInDoubleQuotes` is `'listed'` (bash), `'always'` (PowerShell) or `'never'` (CMD).
 * @es Los hechos léxicos de cada dialecto; en PowerShell `&` es el operador de LLAMADA, no un separador. En
 * CMD la barra invertida es separador de ruta, `^` es el escape (no dentro de `"`), `'` y `#` son caracteres
 * normales, `$(` no sustituye y `%VAR%` es texto opaco (ver `isUnresolvableWord`); `( )` delimitan un GRUPO de
 * comandos (`commandGroups`, solo CMD: bash y PowerShell ya listan sus paréntesis como operadores).
 */
const GRAMMAR = Object.freeze({
  [DIALECTS.BASH]: {
    escape: '\\',
    operators: ['&&', '||', ';;', '|&', ';', '|', '&', '(', ')', '\n'],
    redirections: ['&>>', '&>', '<<<', '<<-', '<<', '<>', '<&', '>>', '>&', '>|', '<', '>'],
    doubledQuoteEscapes: false,
    commentMarker: '#',
    singleQuotes: true,
    substitutions: true,
    escapeInDoubleQuotes: 'listed'
  },
  [DIALECTS.POWERSHELL]: {
    escape: '`',
    operators: ['&&', '||', ';', '|', '{', '}', '(', ')', '\n'],
    redirections: ['>>', '>', '<'],
    doubledQuoteEscapes: true,
    commentMarker: '#',
    singleQuotes: true,
    substitutions: true,
    escapeInDoubleQuotes: 'always'
  },
  [DIALECTS.CMD]: {
    escape: '^',
    operators: ['&&', '||', '|', '&', '\n'],
    redirections: ['>>', '>', '<'],
    doubledQuoteEscapes: false,
    commentMarker: undefined,
    singleQuotes: false,
    substitutions: false,
    escapeInDoubleQuotes: 'never',
    commandGroups: true
  }
});

/**
 * The ONE answer to "does this word's value depend on an expansion the lexer never evaluates?". A word holding
 * `$` (bash and PowerShell variables and substitutions) or `%` (cmd `%VAR%`, `%1`, `%~dp0`) stays literal text
 * here, so a consumer that resolves it as a path or a program would read the unexpanded spelling
 * (`%TEMP%\x.tmp` as a relative path). Such a word, an empty word and a non-string are UNRESOLVABLE: the
 * consumer fails closed. The test is deliberately dialect-blind and conservative: `%` in a bash word
 * (`date +%s`) is also reported, which only ever costs a refusal, never a missed one.
 * @es LA respuesta única a «¿el valor de esta palabra depende de una expansión que el lexer nunca evalúa?».
 * Una palabra con `$` (variables y sustituciones de bash y PowerShell) o `%` (`%VAR%`, `%1`, `%~dp0` de cmd)
 * queda como texto literal: un consumidor que la resuelva como ruta o programa leería la grafía sin expandir.
 * Esa palabra, una vacía y un valor que no es cadena son NO RESOLUBLES: el consumidor falla cerrado. Es
 * conservadora y no depende del dialecto: un `%` en bash también se informa, lo que solo cuesta un rechazo.
 */
export function isUnresolvableWord(word) {
  return typeof word !== 'string' || word.length === 0 || word.includes('$') || word.includes('%');
}

const BLANKS = ' \t\r';

/**
 * The one-letter escapes of bash `$'…'` and what each stands for; an escape bash does not know keeps its
 * backslash. @es Los escapes de una letra de `$'…'` en bash; uno que bash no conoce conserva su barra invertida.
 */
const ANSI_ESCAPES = Object.freeze({
  a: '\u0007',
  b: '\b',
  e: '\u001B',
  E: '\u001B',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '?': '?'
});
/** How many hex digits each numeric `$'…'` escape reads at most. @es Cuántas cifras hexadecimales lee como máximo cada escape numérico. */
const ANSI_HEX_WIDTHS = Object.freeze({ x: 2, u: 4, U: 8 });
const OCTAL_DIGITS = '01234567';
const HEX_DIGITS = '0123456789abcdefABCDEF';
const WORD_BREAKERS = ' \t\r\n;&|<>()';
/** The CMD words whose header may be followed by a `( ... )` group. @es Las palabras de CMD cuya cabecera admite un grupo `( ... )`. */
const GROUP_HEADERS = ['if', 'else', 'for'];
const FILE_DESCRIPTOR_CHARACTERS = '0123456789*';

/**
 * Words that PRECEDE a command without being it: keywords, the PowerShell call/dot-source operators,
 * and wrappers that run their argument as the command.
 * @es Palabras que PRECEDEN a un comando sin serlo.
 */
const COMMAND_PREFIXES = new Set([
  '&',
  '.',
  '!',
  '{',
  '}',
  'if',
  'elif',
  'then',
  'else',
  'do',
  'while',
  'until'
]);

/** Executables that run a script string of their own. @es Ejecutables que corren un script propio. */
const NESTED_SHELLS = [
  { names: ['bash', 'sh', 'zsh', 'dash'], flags: ['-c'], dialect: DIALECTS.BASH },
  { names: ['powershell', 'pwsh'], flags: ['-command', '-c'], dialect: DIALECTS.POWERSHELL },
  // `//c` and `//k` are how Git Bash spells the switches: MSYS rewrites a lone `/c` into a path and passes a doubled slash through as `/c`.
  { names: ['cmd'], flags: ['/c', '/k', '//c', '//k'], dialect: DIALECTS.CMD }
];

/** The executable a word names, without directory, extension or case: `C:\Git\cmd\git.EXE` is `git`. @es El ejecutable que nombra una palabra. */
export function executableName(word) {
  const base = word.split('\\').join('/').split('/').at(-1).toLowerCase();
  const extension = ['.exe', '.cmd', '.bat', '.ps1'].find((candidate) => base.endsWith(candidate));

  return extension === undefined ? base : base.slice(0, -extension.length);
}

const NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

/** True for a bash `NAME=value` environment prefix. @es Verdadero para un prefijo `NOMBRE=valor`. */
function isAssignment(word) {
  const name = word.slice(0, Math.max(0, word.indexOf('=')));

  return (
    name.length > 0 &&
    !'0123456789'.includes(name.charAt(0)) &&
    [...name].every((character) => NAME_CHARACTERS.includes(character))
  );
}

/**
 * Index of the word in command position, or -1 when the command is only prefixes and assignments. A
 * launcher (`timeout 60 git ...`, `env -i git ...`, `exec git`) is not the command: the program it runs is,
 * so it is unwrapped, recursively (`launchers.mjs` owns the table). A launcher with nothing to launch is -1.
 * @es Índice de la palabra en posición de comando. Un lanzador no es el comando: lo es el programa que lanza
 * (`launchers.mjs` guarda la tabla), recursivamente.
 */
export function commandWordIndex(words) {
  return resolveCommand(words).index;
}

/**
 * The command a word list runs: `index` of its program word (-1 when none) and, when the command is carried
 * as one string (`env -S 'git reset'`, `iex '...'`, `Start-Process node -ArgumentList bin/www`), that `script`
 * and the `dialect` it is written in. A command that carries a script has NO program of its own (-1): the
 * program is the one the script runs, which `simpleCommands` lists as a nested command, so the written
 * command and the program behind it are never both "the program". @es El comando que corre la lista de
 * palabras. Un comando que lleva un script no tiene programa propio (-1): el programa es el del script, que
 * `simpleCommands` lista como comando anidado.
 */
export function resolveCommand(words) {
  let at = words.findIndex(
    (word) => !COMMAND_PREFIXES.has(word.toLowerCase()) && !isAssignment(word)
  );

  while (at !== -1) {
    const name = executableName(words[at]);
    const runnerScript = powershellRunnerScript(name, words.slice(at + 1));

    if (runnerScript !== undefined)
      return { index: -1, script: runnerScript, dialect: DIALECTS.POWERSHELL };

    if (launcherNamed(name) === undefined) return { index: at };

    const unwrapped = unwrapLauncher(words, at, name, isAssignment);

    // An unwrap either advances past the launcher, finds no program (-1), carries a script (-1) or runs
    // nothing (`command -v`, the same index): only an advance goes round again, so the loop always ends.
    if (unwrapped.index <= at)
      return unwrapped.script === undefined ? unwrapped : { ...unwrapped, dialect: DIALECTS.BASH };

    at = unwrapped.index;
  }

  return { index: at };
}

/** A cursor over one source string. @es Un cursor sobre una cadena. */
class Cursor {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  get done() {
    return this.index >= this.source.length;
  }

  peek() {
    return this.source.charAt(this.index);
  }

  startsWith(text) {
    return this.source.startsWith(text, this.index);
  }

  take(count = 1) {
    const taken = this.source.slice(this.index, this.index + count);

    this.index += count;

    return taken;
  }

  /** Consumes the rest of the current line, newline included, and returns it without the newline. @es Consume el resto de la línea. */
  line() {
    const newline = this.source.indexOf('\n', this.index);
    const end = newline === -1 ? this.source.length : newline;
    const text = this.source.slice(this.index, end);

    this.index = newline === -1 ? end : end + 1;

    return text;
  }

  /** Consumes up to (not including) the next newline. @es Consume hasta el siguiente salto de línea. */
  toEndOfLine() {
    const newline = this.source.indexOf('\n', this.index);

    this.index = newline === -1 ? this.source.length : newline;
  }
}

/**
 * Lexes one script into word, operator and redirection tokens. Each `read*` method consumes exactly
 * one construct, so `next()` reads as the list of constructs a shell knows. Heredoc bodies are skipped
 * DURING the scan, when the line that opened them ends: a body tokenised first and removed afterwards
 * would let an apostrophe inside it open a quote that swallows the real command after the delimiter.
 * @es Analiza un script en tokens. Los cuerpos de heredoc se saltan DURANTE el escaneo: tokenizarlos y
 * retirarlos después dejaría que un apóstrofo abriera una comilla que se tragara el comando real.
 */
class Lexer {
  constructor(source, dialect) {
    this.cursor = new Cursor(source);
    this.grammar = GRAMMAR[dialect];
    this.dialect = dialect;
    this.tokens = [];
    this.word = undefined;
    this.pendingHeredocs = [];
    this.groupDepth = 0;
  }

  tokenize() {
    while (!this.cursor.done) this.next();

    this.endWord();

    return this.tokens;
  }

  next() {
    const { cursor, grammar } = this;

    if (this.word === undefined && this.readCommentOrHereString()) return;

    const redirection = grammar.redirections.find((operator) => cursor.startsWith(operator));

    if (redirection !== undefined) return this.readRedirection(redirection);

    const operator =
      grammar.operators.find((candidate) => cursor.startsWith(candidate)) ?? this.groupOperator();

    if (operator !== undefined) return this.readOperator(operator);

    if (BLANKS.includes(cursor.peek())) {
      this.endWord();
      cursor.take();
      return;
    }

    this.startWord();

    const start = cursor.index;
    const valueStart = this.word.value.length;

    if (cursor.startsWith(`${grammar.escape}\n`)) return void cursor.take(2);

    if (cursor.startsWith(grammar.escape)) {
      this.appendEscaped();
      return this.mark(QUOTES.BARE, start, cursor.index, valueStart);
    }

    if (this.dialect === DIALECTS.BASH && cursor.startsWith("$'")) {
      this.readAnsiQuoted();
      return this.mark(QUOTES.ANSI, start, cursor.index, valueStart);
    }

    if (grammar.singleQuotes && cursor.startsWith("'")) {
      this.readSingleQuoted();
      return this.mark(QUOTES.SINGLE, start, cursor.index, valueStart);
    }

    if (cursor.startsWith('"')) return this.readDoubleQuoted();

    if (grammar.substitutions && cursor.startsWith('$(')) {
      this.readSubstitution();
      return this.mark(QUOTES.SUBSTITUTION, start, cursor.index, valueStart);
    }

    if (this.dialect === DIALECTS.BASH && cursor.startsWith('`')) {
      this.readBacktick();
      return this.mark(QUOTES.SUBSTITUTION, start, cursor.index, valueStart);
    }

    this.word.value += cursor.take();
    this.mark(QUOTES.BARE, start, cursor.index, valueStart);
  }

  /**
   * The `(` or `)` at the cursor when it is a command GROUP delimiter, in a dialect whose grammar models groups
   * (CMD), else `undefined`. cmd.exe reads `(` as special only where a command may start: at the head of a
   * command, or after an `if` / `else` / `for ... do` header, never inside the `in (...)` set of a `for` or
   * in the middle of an argument (`echo (a)` prints its parentheses). `)` is special only while a group is open.
   * @es El `(` o `)` del cursor cuando delimita un GRUPO de comandos, en un dialecto que los modela (CMD). cmd.exe
   * trata `(` como especial solo donde puede empezar un comando: al inicio, o tras la cabecera de `if` / `else` /
   * `for ... do`, nunca en el conjunto `in (...)` de un `for` ni en mitad de un argumento (`echo (a)` imprime los
   * paréntesis). `)` es especial solo mientras haya un grupo abierto.
   */
  groupOperator() {
    if (!this.grammar.commandGroups) return undefined;

    if (this.cursor.startsWith(')') && this.groupDepth > 0) {
      this.groupDepth -= 1;
      return ')';
    }

    if (this.cursor.startsWith('(') && this.word === undefined && this.opensGroup()) {
      this.groupDepth += 1;
      return '(';
    }

    return undefined;
  }

  /** Whether a command could start here: nothing precedes it, or an `if` / `else` / `for` header is complete. @es Si aquí puede empezar un comando. */
  opensGroup() {
    const lastOperator = this.tokens.findLastIndex((token) => token.kind === 'operator');
    const header = this.commandWordsSince(lastOperator + 1);

    if (header.length === 0) return true;

    return GROUP_HEADERS.includes(header[0]) && header.at(-1) !== 'in';
  }

  /** The lowercased words of the command being read, redirections and their targets left out. @es Las palabras del comando en curso, en minúsculas, sin redirecciones ni sus destinos. */
  commandWordsSince(from) {
    const words = [];
    let skipTarget = false;

    for (const token of this.tokens.slice(from)) {
      if (token.kind === 'redirection') {
        skipTarget = token.consumesTarget;
        continue;
      }

      if (skipTarget) {
        skipTarget = false;
        continue;
      }

      words.push(token.value.toLowerCase());
    }

    return words;
  }

  startWord() {
    this.word ??= {
      kind: 'word',
      value: '',
      start: this.cursor.index,
      end: this.cursor.index,
      nested: [],
      data: false,
      spans: []
    };
  }

  /**
   * Records that the source from `start` to `end` belongs to the current word in `quote`, and produced its value
   * from `valueStart` to where the value now ends: one span per run of one quoting.
   * @es Anota que el fuente de `start` a `end` pertenece a la palabra en curso con `quote` y produjo su valor desde
   * `valueStart` hasta donde acaba ahora: un tramo por cada racha de un mismo entrecomillado.
   */
  mark(quote, start, end, valueStart) {
    const last = this.word.spans.at(-1);
    const valueEnd = this.word.value.length;

    if (last !== undefined && last.quote === quote && last.end === start) Object.assign(last, { end, valueEnd });
    else this.word.spans.push({ quote, start, end, valueStart, valueEnd });
  }

  endWord() {
    if (this.word === undefined) return;

    this.word.end = this.cursor.index;
    this.tokens.push(this.word);
    this.word = undefined;
  }

  /** `#` comments, PowerShell `<# #>` blocks and `@' '@` here-strings — all data. @es Comentarios y here-strings: dato. */
  readCommentOrHereString() {
    const { cursor, grammar } = this;

    if (grammar.commentMarker !== undefined && cursor.startsWith(grammar.commentMarker)) {
      cursor.toEndOfLine();
      return true;
    }

    if (this.dialect !== DIALECTS.POWERSHELL) return false;

    if (cursor.startsWith('<#')) {
      const close = cursor.source.indexOf('#>', cursor.index);

      cursor.index = close === -1 ? cursor.source.length : close + 2;
      return true;
    }

    const afterOpener = cursor.source.slice(cursor.index + 2);
    const opensLine = afterOpener.startsWith('\n') || afterOpener.startsWith('\r\n');
    const opener = ["@'", '@"'].find((candidate) => opensLine && cursor.startsWith(candidate));

    if (opener === undefined) return false;

    const closer = `${opener.charAt(1)}@`;
    const start = cursor.index;

    cursor.line();
    while (!cursor.done && !cursor.startsWith(closer)) cursor.line();
    cursor.take(closer.length);
    this.tokens.push({ kind: 'word', value: '', start, end: cursor.index, nested: [], data: true });

    return true;
  }

  readRedirection(operator) {
    const { cursor } = this;
    const fused =
      this.word !== undefined &&
      this.word.value.length > 0 &&
      [...this.word.value].every((character) => FILE_DESCRIPTOR_CHARACTERS.includes(character));
    const start = fused ? this.word.start : cursor.index;

    if (fused) this.word = undefined;

    this.endWord();
    cursor.take(operator.length);

    if (cursor.startsWith('&')) cursor.take();

    const operatorEnd = cursor.index;
    const isHeredoc = operator === '<<' || operator === '<<-';

    if (isHeredoc)
      this.pendingHeredocs.push({ delimiter: this.readDelimiter(), stripTabs: operator === '<<-' });

    this.tokens.push({
      kind: 'redirection',
      value: operator,
      start,
      end: cursor.index,
      operatorEnd,
      consumesTarget: !isHeredoc
    });
  }

  /** The delimiter word after `<<`, unquoted. @es La palabra delimitadora tras `<<`, sin comillas. */
  readDelimiter() {
    const { cursor } = this;

    while (BLANKS.includes(cursor.peek()) && !cursor.done) cursor.take();

    const quote = cursor.peek();

    if (quote === "'" || quote === '"') {
      cursor.take();
      const close = cursor.source.indexOf(quote, cursor.index);
      const delimiter = cursor.take((close === -1 ? cursor.source.length : close) - cursor.index);

      cursor.take();
      return delimiter;
    }

    let delimiter = '';

    while (!cursor.done && !WORD_BREAKERS.includes(cursor.peek())) delimiter += cursor.take();

    return delimiter;
  }

  readOperator(operator) {
    const { cursor } = this;

    this.endWord();

    const start = cursor.index;

    cursor.take(operator.length);
    this.tokens.push({ kind: 'operator', value: operator, start, end: cursor.index });

    if (operator === '\n') this.skipHeredocBodies();
  }

  /** Skips every heredoc body opened on the line that just ended — its lines are data. @es Salta los cuerpos de heredoc: son dato. */
  skipHeredocBodies() {
    const { cursor } = this;

    for (const heredoc of this.pendingHeredocs.splice(0)) {
      while (!cursor.done) {
        const line = cursor.line();
        const candidate = heredoc.stripTabs ? line.trimStart() : line;

        if (candidate.trimEnd() === heredoc.delimiter) break;
      }
    }
  }

  appendEscaped() {
    this.cursor.take();
    this.word.value += this.cursor.take();
  }

  readSingleQuoted() {
    const { cursor, grammar } = this;

    cursor.take();

    while (!cursor.done) {
      if (grammar.doubledQuoteEscapes && cursor.startsWith("''")) {
        cursor.take(2);
        this.word.value += "'";
        continue;
      }

      const character = cursor.take();

      if (character === "'") return;

      this.word.value += character;
    }
  }

  /**
   * Bash ANSI-C quoting, `$'…'`: the text between the quotes with its backslash escapes decoded, the way bash
   * decodes them before the command receives the word (`$'C:\\x'` is `C:\x`, `$'a\tb'` holds a tab).
   * @es El entrecomillado ANSI-C de bash, `$'…'`: el texto entre comillas con sus escapes de barra invertida
   * decodificados, como los decodifica bash antes de que el comando reciba la palabra.
   */
  readAnsiQuoted() {
    const { cursor } = this;

    cursor.take(2);

    while (!cursor.done) {
      const character = cursor.take();

      if (character === "'") return;

      this.word.value += character === '\\' && !cursor.done ? this.ansiEscape() : character;
    }
  }

  /** The character one `$'…'` escape stands for; the backslash is already consumed. @es El carácter de un escape de `$'…'`. */
  ansiEscape() {
    const { cursor } = this;
    const letter = cursor.take();

    if (Object.hasOwn(ANSI_ESCAPES, letter)) return ANSI_ESCAPES[letter];
    if (OCTAL_DIGITS.includes(letter)) return String.fromCodePoint(Number.parseInt(letter + this.digits(OCTAL_DIGITS, 2), 8));
    if (letter === 'c' && !cursor.done) return String.fromCodePoint(cursor.take().codePointAt(0) % 32);

    const width = ANSI_HEX_WIDTHS[letter];
    const hex = width === undefined ? '' : this.digits(HEX_DIGITS, width);

    return hex.length > 0 ? String.fromCodePoint(Number.parseInt(hex, 16)) : `\\${letter}`;
  }

  /** Up to `limit` characters of `alphabet` at the cursor, consumed. @es Hasta `limit` caracteres de `alphabet`, consumidos. */
  digits(alphabet, limit) {
    let taken = '';

    while (taken.length < limit && !this.cursor.done && alphabet.includes(this.cursor.peek())) taken += this.cursor.take();

    return taken;
  }

  readDoubleQuoted() {
    const { cursor, grammar } = this;
    let runStart = cursor.index;
    let runValueStart = this.word.value.length;

    cursor.take();

    while (!cursor.done) {
      if (grammar.doubledQuoteEscapes && cursor.startsWith('""')) {
        cursor.take(2);
        this.word.value += '"';
        continue;
      }

      if (this.escapesInsideDoubleQuotes()) {
        this.appendEscaped();
        continue;
      }

      const opensBacktick = this.dialect === DIALECTS.BASH && cursor.startsWith('`');

      if ((grammar.substitutions && cursor.startsWith('$(')) || opensBacktick) {
        const substitutionStart = cursor.index;
        const substitutionValueStart = this.word.value.length;

        if (substitutionStart > runStart) this.mark(QUOTES.DOUBLE, runStart, substitutionStart, runValueStart);
        if (opensBacktick) this.readBacktick();
        else this.readSubstitution();
        this.mark(QUOTES.SUBSTITUTION, substitutionStart, cursor.index, substitutionValueStart);
        runStart = cursor.index;
        runValueStart = this.word.value.length;
        continue;
      }

      const character = cursor.take();

      if (character === '"') break;

      this.word.value += character;
    }

    if (cursor.index > runStart) this.mark(QUOTES.DOUBLE, runStart, cursor.index, runValueStart);
  }

  /**
   * Whether the escape character at the cursor escapes something inside double quotes. PowerShell's
   * backtick always does; bash's backslash only before `$`, a backtick, `"`, `\` or a newline, so
   * `"C:\x"` keeps its backslash; cmd's `^` never does.
   * @es Si el carácter de escape escapa algo dentro de comillas dobles: en bash solo ante `$`, `` ` ``, `"`, `\` o salto; en cmd nunca.
   */
  escapesInsideDoubleQuotes() {
    const { cursor, grammar } = this;

    if (!cursor.startsWith(grammar.escape)) return false;
    if (grammar.escapeInDoubleQuotes === 'never') return false;
    if (grammar.escapeInDoubleQuotes === 'always') return true;

    const escaped = cursor.source.charAt(cursor.index + 1);

    return escaped.length > 0 && '$`"\\\n'.includes(escaped);
  }

  /** A balanced `$(...)`: its body runs as commands, and stays in the word as literal text. @es Un `$(...)` equilibrado. */
  readSubstitution() {
    const { cursor } = this;

    cursor.take(2);

    let depth = 1;
    let body = '';
    let quote;

    while (!cursor.done) {
      const character = cursor.take();

      if (quote === undefined && (character === "'" || character === '"')) quote = character;
      else if (character === quote) quote = undefined;
      else if (quote === undefined && character === '(') depth += 1;
      else if (quote === undefined && character === ')') depth -= 1;

      if (depth === 0) break;

      body += character;
    }

    this.word.nested.push({ script: body, dialect: this.dialect });
    this.word.value += `$(${body})`;
  }

  readBacktick() {
    const { cursor } = this;

    cursor.take();

    const close = cursor.source.indexOf('`', cursor.index);
    const body = cursor.take((close === -1 ? cursor.source.length : close) - cursor.index);

    cursor.take();
    this.word.nested.push({ script: body, dialect: this.dialect });
    this.word.value += `\`${body}\``;
  }
}

/**
 * Scripts de Node que ejecutan como UNA línea de shell lo que va tras un separador. Son shells anidadas
 * con otra forma.
 *
 * `fleet-env/capture.mjs` es la herramienta que el contrato de agentes manda usar para medir un
 * comando, así que es el envoltorio que más aparece en esta flota. Hasta el 2026-09-29 el parser veía
 * ahí el comando `node` y nada más, y cada guardia que decide sobre comandos quedaba ciega a lo que iba
 * envuelto. Medido: un worker corrió `node …/capture.mjs npm-install -- "npm install"` dentro de un farm
 * de junctions, y el guard del toolchain lo permitió. El árbol principal quedó sin `@angular/core`.
 * capture.mjs lanza la línea con `shell: true` (cmd.exe en Windows, /bin/sh en el resto), así que se lee
 * con la gramática bash, igual que `cmd /c` en la tabla de arriba.
 */
const SCRIPT_WRAPPERS = [
  { runner: 'node', script: 'capture.mjs', separator: '--', dialect: DIALECTS.BASH }
];

/** El script que corre un envoltorio de `SCRIPT_WRAPPERS`, si `words` es uno. @es Ver `SCRIPT_WRAPPERS`. */
function wrappedScript(words, at) {
  const runner = executableName(words[at]);
  const wrapper = SCRIPT_WRAPPERS.find(
    (candidate) =>
      candidate.runner === runner && candidate.script === executableName(words[at + 1] ?? '')
  );

  if (wrapper === undefined) return undefined;

  const separatorAt = words.indexOf(wrapper.separator, at + 2);

  if (separatorAt === -1 || separatorAt + 1 >= words.length) return undefined;

  return { script: words.slice(separatorAt + 1).join(' '), dialect: wrapper.dialect };
}

/**
 * The script string the words after a shell's `-c` / `/c` flag make. cmd.exe re-parses the command line it
 * receives, so when SEVERAL words follow, a word holding a blank was quoted and goes back in double quotes
 * (`cmd /c rd "C:\a b"`); a single word is already the whole script (`cmd /c "rd C:\a b"`).
 * @es El script que forman las palabras tras la bandera `-c` / `/c`. cmd.exe vuelve a analizar la línea que
 * recibe: con VARIAS palabras, la que contiene un blanco estaba entrecomillada y vuelve a sus comillas dobles.
 */
function scriptOfWords(words, dialect) {
  if (dialect !== DIALECTS.CMD || words.length === 1) return words.join(' ');

  return words
    .map((word) => ([...BLANKS].some((blank) => word.includes(blank)) ? `"${word}"` : word))
    .join(' ');
}

/** The script a nested-shell invocation runs, if `words` is one. @es El script que ejecuta una shell anidada. */
function nestedShellScript(words) {
  const { index: at, script: carriedScript, dialect: carriedDialect } = resolveCommand(words);

  if (carriedScript !== undefined) return { script: carriedScript, dialect: carriedDialect };

  if (at === -1) return undefined;

  const wrapped = wrappedScript(words, at);

  if (wrapped !== undefined) return wrapped;

  const name = executableName(words[at]);
  const shell = NESTED_SHELLS.find((candidate) => candidate.names.includes(name));

  if (shell === undefined) return undefined;

  const flagAt = words.findIndex(
    (word, index) => index > at && shell.flags.includes(word.toLowerCase())
  );

  if (flagAt === -1 || flagAt + 1 >= words.length) return undefined;

  return { script: scriptOfWords(words.slice(flagAt + 1), shell.dialect), dialect: shell.dialect };
}

/**
 * What a substitution the line's own shell expanded stands for in the words a command RECEIVES: output nobody can
 * know before it runs. It holds a `$`, so it is unresolvable in every dialect (`isUnresolvableWord`), and it is
 * no command text a nested shell could read. @es Lo que representa, en las palabras que RECIBE un comando, una
 * sustitución que expandió la propia shell de la línea: una salida que nadie conoce antes de correr. Lleva `$`,
 * así que es no resoluble en todo dialecto, y no es texto de comando que una shell anidada pueda leer.
 */
export const SUBSTITUTION_OUTPUT = '$SUBSTITUTION_OUTPUT';

/**
 * The words as the program receives them: the text of every substitution the line's shell runs itself (`$(...)`,
 * backticks, a PowerShell `"$(...)"`) replaced by `SUBSTITUTION_OUTPUT`. The substitution's own commands are
 * listed once, as the line's nested commands; reading its text again inside the script of `bash -c "$(x)"` would
 * list them a second time, in a shell that never sees them. @es Las palabras tal como las recibe el programa: el
 * texto de cada sustitución que corre la propia shell de la línea se sustituye por `SUBSTITUTION_OUTPUT`. Sus
 * comandos se listan una vez, como anidados de la línea; leer su texto otra vez dentro del script de `bash -c "$(x)"`
 * los listaría por segunda vez, en una shell que nunca los ve.
 */
function receivedWords(words, quoting) {
  return words.map((word, index) =>
    quoting[index]
      .map((span) => (span.quote === QUOTES.SUBSTITUTION ? SUBSTITUTION_OUTPUT : word.slice(span.valueStart, span.valueEnd)))
      .join('')
  );
}

function emptyCommand() {
  return { words: [], quoting: [], redirections: [], nested: [], start: undefined, end: undefined };
}

/**
 * Every simple command `script` runs, in execution order. See the module header for the shape.
 *
 * `includeNested: false` keeps only the commands that run in THE LINE'S OWN SHELL: what `$(...)`, backticks,
 * `bash -c`, `powershell -Command` and `cmd /c` run is a child process or a substitution, so it cannot
 * change the directory (or any other state) of the shell that ran the line.
 * @es Cada comando simple que ejecuta `script`, en orden de ejecución. `includeNested: false` deja solo los
 * comandos que corren en la shell PROPIA de la línea: lo que ejecutan `$(...)`, las comillas invertidas,
 * `bash -c`, `powershell -Command` y `cmd /c` es un proceso hijo o una sustitución, y no cambia el
 * directorio de la shell que corrió la línea.
 */
export function simpleCommands(script, dialect = DIALECTS.BASH, { includeNested = true } = {}) {
  if (typeof script !== 'string' || GRAMMAR[dialect] === undefined) return [];

  return commandsOfShell(Object.freeze({ dialect, script, parent: undefined, parentDepth: 0 }), includeNested);
}

/**
 * The commands one shell runs: its own, each preceded by the commands of the shells it starts, each of those
 * read in ITS dialect and tagged with its own `shell`. @es Los comandos que corre una shell: los suyos, cada uno
 * precedido por los de las shells que arranca, leídos en SU dialecto y con su propio `shell`.
 */
function commandsOfShell(shell, includeNested) {
  const { dialect, script } = shell;
  const tokens = new Lexer(script, dialect).tokenize();
  const commands = [];
  let depth = 0;
  let current = emptyCommand();
  let pendingRedirection;

  const nestedShell = (nested) =>
    commandsOfShell(Object.freeze({ dialect: nested.dialect, script: nested.script, parent: shell, parentDepth: depth }), true);

  const flush = (separator) => {
    if (includeNested) {
      for (const nested of current.nested) commands.push(...nestedShell(nested));

      const inner = nestedShellScript(receivedWords(current.words, current.quoting));

      if (inner !== undefined) commands.push(...nestedShell(inner));
    }

    if (current.words.length > 0)
      commands.push({
        words: current.words,
        text: script.slice(current.start, current.end),
        separator,
        depth,
        dialect,
        shell,
        start: current.start,
        quoting: current.quoting,
        redirections: current.redirections
      });

    current = emptyCommand();
    pendingRedirection = undefined;
  };

  for (const token of tokens) {
    if (token.kind === 'operator') {
      flush(token.value);
      if (dialect === DIALECTS.BASH && token.value === '(') depth += 1;
      if (dialect === DIALECTS.BASH && token.value === ')') depth = Math.max(0, depth - 1);
      continue;
    }

    current.start ??= token.start;
    current.end = token.end;

    if (token.kind === 'redirection') {
      const redirection = { operator: script.slice(token.start, token.operatorEnd), target: undefined, quoting: [], start: token.start, end: token.end };

      current.redirections.push(redirection);
      pendingRedirection = token.consumesTarget ? redirection : undefined;
      continue;
    }

    current.nested.push(...token.nested);

    if (token.data) {
      pendingRedirection = undefined;
      continue;
    }

    if (pendingRedirection !== undefined) {
      Object.assign(pendingRedirection, { target: token.value, quoting: token.spans, end: token.end });
      pendingRedirection = undefined;
      continue;
    }

    current.words.push(token.value);
    current.quoting.push(token.spans);
  }

  flush('end');

  return commands;
}
