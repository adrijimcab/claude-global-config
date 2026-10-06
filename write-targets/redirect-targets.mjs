/**
 * The file each OUTPUT redirection in one already-isolated shell command targets.
 *
 * WHY THIS EXISTS RATHER THAN READING IT OFF `simpleCommands`. `shell-command.mjs`'s `simpleCommands`
 * (the shared parser every guard on this machine reuses) DISCARDS a redirection's target word on
 * purpose: none of its existing consumers need it, so the target word is read past and thrown away
 * (`targetPending` skips pushing it into `words`). This module is scoped ONLY to recovering that one
 * discarded fact, from the exact TEXT `simpleCommands` already isolated for one simple command — no
 * operators, no heredoc bodies remain inside it, only words, quoting and redirections of ONE command —
 * without touching the shared file every other guard on this machine depends on. It lives in
 * `.claude/write-targets/`, the single owner of "which files does a tool call write", so the golden guard
 * and the isolation boundary read one lexer.
 *
 * SCOPE, STATED. This is NOT a second shell grammar: it tracks quotes (so a `>` inside `'…'`/`"…"` is
 * never mistaken for a redirection) and skips `$(...)`/backtick substitutions as opaque balanced spans
 * (their OWN redirections are already covered separately, because `simpleCommands` yields a substitution's
 * inner script as its own command). A quote character appearing unbalanced INSIDE a substitution can
 * desynchronise the balance count — the same class of approximation `raw-picks.mjs` states for git
 * aliases: not modelled, because a redirection target is a file path, and file paths embedding a nested
 * command substitution are not a real-world shape this guard needs to chase.
 *
 * ONLY OUTPUT redirections are recognised (`>`, `>>`, `>|`, `>&`, `&>`, `&>>`): a file is READ, never
 * written, by an input redirection, so `<`/`<<`/`<<<` are deliberately excluded.
 *
 * @es El fichero que cada redirección de SALIDA de un comando ya aislado nombra como destino.
 * `simpleCommands` (el analizador compartido) DESCARTA a propósito la palabra objetivo de una
 * redirección; este módulo recupera exactamente ese dato, sobre el TEXTO que `simpleCommands` ya aisló
 * para un comando — sin tocar el fichero compartido. Vive en `.claude/write-targets/`, el dueño único de «qué ficheros
 * escribe una llamada de herramienta», así el guard de goldens y la frontera de aislamiento leen un solo lexer. NO es una segunda gramática de shell: rastrea comillas y salta `$(...)`/
 * backticks como bloques opacos balanceados (sus propias redirecciones ya las cubre `simpleCommands`
 * por separado). Solo reconoce redirecciones de SALIDA — un fichero se LEE, nunca se ESCRIBE, con una de
 * ENTRADA.
 */

const ESCAPE_CHARACTER = Object.freeze({ bash: '\\', powershell: '`' });
const DOUBLED_QUOTES_ESCAPE = Object.freeze({ bash: false, powershell: true });

// Longest-first, so `>>` is never read as two `>` and `&>>` is never read as `&>` followed by `>`.
const OUTPUT_REDIRECTIONS = Object.freeze(['&>>', '&>', '>>', '>|', '>&', '>']);

const BLANK_CHARACTERS = ' \t\r';
const WORD_BREAK_CHARACTERS = ' \t\r\n;&|<>(){}';

function isBlank(character) {
  return BLANK_CHARACTERS.includes(character);
}

/** A descriptor number or the close marker `-` — what follows `>&` when it is not a file. @es Un número de descriptor o `-`. */
function isDescriptorWord(word) {
  return word === '-' || (word.length > 0 && [...word].every((character) => '0123456789'.includes(character)));
}

function isWordBreak(character) {
  return character === undefined || WORD_BREAK_CHARACTERS.includes(character);
}

/** A cursor over one command's isolated text, with the small set of reads this scanner needs. @es Un cursor sobre el texto de un comando. */
class Cursor {
  constructor(text) {
    this.text = text;
    this.index = 0;
  }

  get done() {
    return this.index >= this.text.length;
  }

  peek(offset = 0) {
    return this.text.charAt(this.index + offset) || undefined;
  }

  startsWith(needle) {
    return this.text.startsWith(needle, this.index);
  }

  take(count = 1) {
    const taken = this.text.slice(this.index, this.index + count);

    this.index += count;

    return taken;
  }

  /** Skips a balanced `open`/`close` span, starting exactly at `open`. Never fails to terminate: an
   * unbalanced span simply runs to the end of the text. @es Salta un tramo balanceado; uno sin cerrar
   * llega hasta el final del texto. */
  skipBalanced(open, close) {
    let depth = 0;

    do {
      if (this.startsWith(open)) {
        depth += 1;
        this.take(open.length);
        continue;
      }

      if (this.startsWith(close)) {
        depth -= 1;
        this.take(close.length);
        continue;
      }

      if (this.done) return;

      this.take();
    } while (depth > 0);
  }
}

/** Reads one quoted span, honouring the dialect's own escape/doubling rules, and returns its VALUE
 * (quotes and escapes resolved). @es Lee un tramo entrecomillado y devuelve su VALOR resuelto. */
function readQuoted(cursor, quote, dialect) {
  const escape = ESCAPE_CHARACTER[dialect];
  const doubles = DOUBLED_QUOTES_ESCAPE[dialect];

  cursor.take(); // the opening quote

  let value = '';

  while (!cursor.done) {
    if (doubles && cursor.startsWith(`${quote}${quote}`)) {
      value += quote;
      cursor.take(2);
      continue;
    }

    if (quote === '"' && cursor.peek() === escape && !doubles && '$`"\\\n'.includes(cursor.peek(1) ?? '')) {
      value += cursor.peek(1);
      cursor.take(2);
      continue;
    }

    if (quote === '"' && cursor.peek() === escape && doubles) {
      value += cursor.peek(1) ?? '';
      cursor.take(2);
      continue;
    }

    if (cursor.peek() === quote) {
      cursor.take();
      return value;
    }

    value += cursor.take();
  }

  return value; // Unterminated quote: best effort, same fail-open spirit as the rest of this guard.
}

/** Skips whatever substitution form starts at the cursor (`$(...)` or a backtick span), as an opaque
 * block. @es Salta la sustitución que empieza en el cursor, como bloque opaco. */
function skipSubstitution(cursor) {
  if (cursor.startsWith('$(')) return void cursor.skipBalanced('$(', ')');

  cursor.take(); // the opening backtick
  while (!cursor.done && cursor.peek() !== '`') cursor.take();
  if (!cursor.done) cursor.take();
}

/** Reads one redirection target word: quotes resolved, substitutions marked `unresolvable`. @es Lee una
 * palabra objetivo de redirección. */
function readTargetWord(cursor, dialect) {
  let value = '';
  let unresolvable;

  while (!cursor.done && !isWordBreak(cursor.peek())) {
    if (cursor.peek() === "'" || cursor.peek() === '"') {
      value += readQuoted(cursor, cursor.peek(), dialect);
      continue;
    }

    if (cursor.peek() === ESCAPE_CHARACTER[dialect] && cursor.peek(1) !== undefined) {
      value += cursor.peek(1);
      cursor.take(2);
      continue;
    }

    if (dialect === 'bash' && (cursor.startsWith('$(') || cursor.peek() === '`')) {
      unresolvable ??= cursor.startsWith('$(') ? 'a $(...) command substitution' : 'a backtick command substitution';
      skipSubstitution(cursor);
      continue;
    }

    if (cursor.peek() === '$') {
      unresolvable ??= 'a shell variable';
      value += cursor.take();
      continue;
    }

    value += cursor.take();
  }

  return { value, unresolvable };
}

/**
 * Every OUTPUT redirection target in `text` — one already-isolated simple command's raw source, as
 * `simpleCommands` (`shell-command.mjs`) slices it.
 *
 * @param text One command's raw text, exactly as `simpleCommands(...)[n].text` gives it.
 * @param dialect `'bash'` or `'powershell'` (`shell-command.mjs`'s `DIALECTS`).
 * @returns `[{ target } | { unresolvable }]`, one per redirection found, in execution order.
 * @es Cada destino de redirección de SALIDA en `text`, en orden de ejecución.
 */
export function outputRedirectionTargets(text, dialect) {
  if (typeof text !== 'string' || text.length === 0) return [];

  const cursor = new Cursor(text);
  const targets = [];

  while (!cursor.done) {
    if (cursor.peek() === "'" || cursor.peek() === '"') {
      readQuoted(cursor, cursor.peek(), dialect);
      continue;
    }

    if (dialect === 'bash' && (cursor.startsWith('$(') || cursor.peek() === '`')) {
      skipSubstitution(cursor);
      continue;
    }

    const operator = OUTPUT_REDIRECTIONS.find((candidate) => cursor.startsWith(candidate));

    if (operator === undefined) {
      cursor.take();
      continue;
    }

    cursor.take(operator.length);
    while (isBlank(cursor.peek())) cursor.take();

    if (isWordBreak(cursor.peek())) continue; // a malformed/empty target names nothing to report

    const { value, unresolvable } = readTargetWord(cursor, dialect);

    // `2>&1` / `>&2` / `>&-` DUPLICATE or CLOSE a file descriptor: the word after `>&` is a descriptor, not a
    // file. Reading it as a path made every `cmd 2>&1` look like a write to a file named `1` (measured: a
    // worker's read-only `rg … 2>&1` was refused after a `cd` into a directory its policy did not cover).
    // @es `2>&1` / `>&2` / `>&-` DUPLICAN o CIERRAN un descriptor: la palabra tras `>&` no es un fichero.
    if (operator === '>&' && isDescriptorWord(value)) continue;

    targets.push(unresolvable === undefined ? { target: value } : { unresolvable: `the redirection target depends on ${unresolvable}` });
  }

  return targets;
}
