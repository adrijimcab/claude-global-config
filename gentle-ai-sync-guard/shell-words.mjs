/**
 * Divide un script de shell en los COMANDOS SIMPLES que ejecuta, cada uno como su lista de palabras
 * ya sin comillas. Es la única pieza que distingue lo que se EJECUTA de lo que es DATO.
 *
 * Qué es dato y nunca produce un comando: el texto entre comillas, el cuerpo de un heredoc con
 * delimitador entrecomillado (`<<'EOF'`), un here-string de PowerShell `@'…'@`, los comentarios y el
 * destino de una redirección. Qué SÍ se ejecuta aunque viva dentro de un dato: una sustitución
 * `$(…)` o `` `…` `` dentro de comillas dobles o de un heredoc sin comillas, y una subexpresión `$(…)`
 * de PowerShell dentro de `"…"` o `@"…"@`. Esas se analizan como scripts propios y sus comandos se
 * suman a la lista. Después de cualquier dato el análisis se REANUDA, así que `echo "x" && cmd` sigue
 * viendo `cmd`.
 *
 * Sin expresiones regulares (M5): un escáner carácter a carácter, porque una regex que no casa se
 * salta el comando en silencio, que es exactamente el defecto que un guard no puede tener.
 */

export const DIALECTS = Object.freeze({ BASH: 'bash', POWERSHELL: 'powershell' });

const BLANKS = ' \t\r';
const DIGITS = '0123456789';
const BASH_SEPARATORS = ';&|()';
const POWERSHELL_SEPARATORS = ';|(){}';
const BASH_DOUBLE_QUOTE_ESCAPABLE = '$`"\\\n';
const MAX_DEPTH = 8;

/** Índice del `)` que cierra el `(` en `open`, respetando comillas y anidamiento; o el final. */
function matchingParen(text, open) {
  let depth = 1;
  let quote = null;
  for (let index = open + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      if (char === '\\' && quote === '"') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === '\\') index += 1;
    else if (char === '(') depth += 1;
    else if (char === ')' && --depth === 0) return index;
  }
  return text.length;
}

/** Índice del siguiente `` ` `` sin escapar a partir de `from`, o el final. */
function closingBacktick(text, from) {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === '`') return index;
  }
  return text.length;
}

class Lexer {
  constructor(text, dialect, depth) {
    this.text = text;
    this.dialect = dialect;
    this.depth = depth;
    this.index = 0;
    this.commands = [];
    this.words = [];
    this.word = null;
    this.wordQuoted = false;
    this.discardNextWord = false;
    this.expectHeredocDelimiter = null;
    this.pendingHeredocs = [];
  }

  get isBash() {
    return this.dialect === DIALECTS.BASH;
  }

  append(characters) {
    this.word = (this.word ?? '') + characters;
  }

  endWord() {
    if (this.word === null) return;
    if (this.expectHeredocDelimiter !== null) {
      this.pendingHeredocs.push({ delimiter: this.word, expands: !this.wordQuoted, stripTabs: this.expectHeredocDelimiter.stripTabs });
      this.expectHeredocDelimiter = null;
    } else if (this.discardNextWord) {
      this.discardNextWord = false;
    } else {
      this.words.push(this.word);
    }
    this.word = null;
    this.wordQuoted = false;
  }

  endCommand() {
    this.endWord();
    if (this.words.length > 0) this.commands.push(this.words);
    this.words = [];
    // Una redirección sin destino no puede comerse la primera palabra del comando SIGUIENTE: eso
    // escondería justamente el programa que hay que ver.
    this.discardNextWord = false;
    this.expectHeredocDelimiter = null;
  }

  /** Una sustitución de comandos: su contenido SE EJECUTA, así que se analiza como script propio. */
  substitute(inner) {
    if (this.depth < MAX_DEPTH) this.commands.push(...simpleCommandsAt(inner, this.dialect, this.depth + 1));
    this.append('');
  }

  /** Recorre un texto expandible (cuerpo de heredoc o here-string) buscando solo sustituciones. */
  scanExpansions(body) {
    for (let index = 0; index < body.length; index += 1) {
      const char = body[index];
      if (this.isBash && char === '\\') index += 1;
      else if (!this.isBash && char === '`') index += 1;
      else if (char === '$' && body[index + 1] === '(') {
        const close = matchingParen(body, index + 1);
        this.substitute(body.slice(index + 2, close));
        index = close;
      } else if (this.isBash && char === '`') {
        const close = closingBacktick(body, index + 1);
        this.substitute(body.slice(index + 1, close));
        index = close;
      }
    }
  }

  skipComment() {
    const newline = this.text.indexOf('\n', this.index);
    this.index = newline < 0 ? this.text.length : newline;
  }

  readSingleQuoted() {
    const close = this.text.indexOf("'", this.index + 1);
    const end = close < 0 ? this.text.length : close;
    this.append(this.text.slice(this.index + 1, end));
    this.wordQuoted = true;
    // El `''` de PowerShell (apóstrofo literal) no necesita trato aparte: la comilla siguiente vuelve
    // a entrar aquí y la palabra continúa. Se pierde el apóstrofo, lo que no cambia qué programa corre.
    this.index = end + 1;
  }

  readDoubleQuoted() {
    this.wordQuoted = true;
    let index = this.index + 1;
    while (index < this.text.length && this.text[index] !== '"') {
      const char = this.text[index];
      const next = this.text[index + 1];
      if (this.isBash && char === '\\' && next !== undefined && BASH_DOUBLE_QUOTE_ESCAPABLE.includes(next)) {
        // Dentro de "…" bash solo escapa $ ` " \ y el salto de línea (que desaparece).
        if (next !== '\n') this.append(next);
        index += 2;
      } else if (!this.isBash && char === '`') {
        this.append(next ?? '');
        index += 2;
      } else if (char === '$' && next === '(') {
        const close = matchingParen(this.text, index + 1);
        this.substitute(this.text.slice(index + 2, close));
        index = close + 1;
      } else if (this.isBash && char === '`') {
        const close = closingBacktick(this.text, index + 1);
        this.substitute(this.text.slice(index + 1, close));
        index = close + 1;
      } else {
        this.append(char);
        index += 1;
      }
    }
    this.append('');
    this.index = index + 1;
  }

  /**
   * `>`, `>>`, `2>&1`, `&>`, `<`, `<<EOF`, `<<<palabra`: el destino es dato, nunca un argumento.
   * La sustitución de proceso `<(…)` / `>(…)` no necesita rama propia: el `(` que sigue es un
   * separador, `endCommand` anula el descarte pendiente y su contenido se analiza como comandos.
   */
  readRedirection() {
    if (this.word !== null && [...this.word].every((char) => DIGITS.includes(char) || char === '*')) this.word = null;
    this.endWord();
    const text = this.text;
    if (this.isBash && text.startsWith('<<<', this.index)) {
      this.index += 3;
      this.discardNextWord = true;
      return;
    }
    if (this.isBash && text.startsWith('<<', this.index)) {
      this.index += 2;
      const stripTabs = text[this.index] === '-';
      if (stripTabs) this.index += 1;
      this.expectHeredocDelimiter = { stripTabs };
      return;
    }
    while ('<>&|'.includes(text[this.index] ?? 'x') && !(text[this.index] === '&' && text[this.index + 1] === '&')) this.index += 1;
    this.discardNextWord = true;
  }

  /** Tras un salto de línea, consume los cuerpos de heredoc pendientes y reanuda después de ellos. */
  consumeHeredocBodies() {
    for (const heredoc of this.pendingHeredocs) {
      const bodyStart = this.index;
      let terminated = false;
      while (this.index < this.text.length && !terminated) {
        const newline = this.text.indexOf('\n', this.index);
        const lineEnd = newline < 0 ? this.text.length : newline;
        let line = this.text.slice(this.index, lineEnd);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (heredoc.stripTabs) while (line.startsWith('\t')) line = line.slice(1);
        if (line === heredoc.delimiter) {
          if (heredoc.expands) this.scanExpansions(this.text.slice(bodyStart, this.index));
          terminated = true;
        }
        this.index = lineEnd + 1;
      }
      if (!terminated && heredoc.expands) this.scanExpansions(this.text.slice(bodyStart));
    }
    this.pendingHeredocs = [];
  }

  /** Here-string de PowerShell: `@'` o `@"` al final de la línea, cerrado por `'@` / `"@` a inicio de línea. */
  readHereString(quote) {
    const opener = this.text.indexOf('\n', this.index);
    const closer = this.text.indexOf(`\n${quote}@`, opener);
    const end = closer < 0 ? this.text.length : closer;
    if (quote === '"') this.scanExpansions(this.text.slice(opener + 1, end));
    this.append('');
    this.wordQuoted = true;
    this.index = closer < 0 ? this.text.length : closer + 3;
  }

  /** La comilla de un here-string que abre en la posición actual, o null si no abre ninguno. */
  hereStringQuote() {
    const quote = this.text[this.index + 1];
    if (this.word !== null || (quote !== "'" && quote !== '"')) return null;
    const newline = this.text.indexOf('\n', this.index);
    const rest = this.text.slice(this.index + 2, newline < 0 ? this.text.length : newline);
    return [...rest].every((char) => BLANKS.includes(char)) ? quote : null;
  }

  stepBash(char, next) {
    if (char === '\\') {
      if (next !== '\n') this.append(next ?? '');
      this.index += 2;
    } else if (char === "'") this.readSingleQuoted();
    else if (char === '"') this.readDoubleQuoted();
    else if (char === '`') {
      const close = closingBacktick(this.text, this.index + 1);
      this.substitute(this.text.slice(this.index + 1, close));
      this.index = close + 1;
    } else if (char === '<' || char === '>' || (char === '&' && next === '>')) this.readRedirection();
    else if (BASH_SEPARATORS.includes(char)) {
      this.endCommand();
      this.index += 1;
    } else return false;
    return true;
  }

  stepPowerShell(char, next) {
    if (char === '`') {
      if (next !== '\n') this.append(next ?? '');
      this.index += 2;
    } else if (char === '<' && next === '#') {
      const close = this.text.indexOf('#>', this.index + 2);
      this.index = close < 0 ? this.text.length : close + 2;
    } else if (char === '@' && this.hereStringQuote() !== null) this.readHereString(this.hereStringQuote());
    else if (char === "'") this.readSingleQuoted();
    else if (char === '"') this.readDoubleQuoted();
    else if (char === '>' || char === '<') this.readRedirection();
    else if (char === '&' && next === '&') {
      this.endCommand();
      this.index += 2;
    } else if (char === '&' || POWERSHELL_SEPARATORS.includes(char)) {
      // `&` cierra el comando anterior: sea operador de llamada (`& cmd`) o de fondo (`cmd &`), la
      // palabra que sigue es la que nombra el programa, así que ambos casos se tratan igual.
      this.endCommand();
      this.index += 1;
    } else return false;
    return true;
  }

  run() {
    while (this.index < this.text.length) {
      const char = this.text[this.index];
      const next = this.text[this.index + 1];
      if (char === '\n') {
        this.endCommand();
        this.index += 1;
        this.consumeHeredocBodies();
      } else if (BLANKS.includes(char)) {
        this.endWord();
        this.index += 1;
      } else if (char === '#' && this.word === null) this.skipComment();
      else if (char === '$' && next === '(') {
        const close = matchingParen(this.text, this.index + 1);
        this.substitute(this.text.slice(this.index + 2, close));
        this.index = close + 1;
      } else if (!(this.isBash ? this.stepBash(char, next) : this.stepPowerShell(char, next))) {
        this.append(char);
        this.index += 1;
      }
    }
    this.endCommand();
    return this.commands;
  }
}

function simpleCommandsAt(script, dialect, depth) {
  return new Lexer(script, dialect, depth).run();
}

/**
 * Los comandos simples que `script` ejecuta, incluidos los de sus sustituciones.
 * @param {string} script
 * @param {'bash'|'powershell'} dialect
 * @returns {string[][]}
 */
export const simpleCommands = (script, dialect = DIALECTS.BASH) => simpleCommandsAt(script, dialect, 0);
