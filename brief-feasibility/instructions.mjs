/**
 * The shell commands a brief INSTRUCTS its reader to run — as opposed to the commands it merely
 * MENTIONS, which is most of them.
 *
 * WHY THE DISTINCTION IS THE WHOLE PROBLEM. A careful brief names forbidden commands precisely in order
 * to forbid them: "`git rebase` is denied here, so branch off develop and cherry-pick". A guard that
 * refused every brief containing `git rebase` would refuse the brief that is doing the right thing, and
 * would be switched off inside the hour. Measured on the session that produced this guard: 7 of the 8
 * real briefs carrying `git rebase` inside a code span stated it as a prohibition or a description, and
 * the brief that COMMISSIONED this guard describes all three of its faces in code spans.
 *
 * THE DETERMINISTIC RULE. A command is instructed when it sits in one of three places:
 *   1. an inline code span (`…`), unless its CLAUSE carries a prohibition word;
 *   2. a fenced code block, unless the prose line that introduces the fence carries one;
 *   3. a line that BEGINS with an imperative verb (`Run …`, `Ejecuta …`) and carries no code span.
 * The CLAUSE of a span is the prose on its line between the nearest clause boundary before it and the
 * nearest after it (`.`, `;`, `:`, `(`, `)`, `!`, `?` — never the comma, because "`git rebase`, which is
 * in the permissions deny list" puts its prohibition after one). The clause, not the line, is the scope
 * because a real incident read "`git rebase 3fdb3380` on your own branch (… if any does not, stop …)":
 * the line carries "not", and the instruction is real.
 *
 * TWO REFINEMENTS, each a measured false refusal of the live guard (2026-09-30):
 *   - A LIST INTRODUCED BY A COLON is governed by the clause that introduces it. "These are denied or
 *     forbidden here: changing worktree, `git rebase`, and a plain `npm install` in your worktree." was
 *     refused as an order to rebase: the colon ended the clause, and the prohibition before it was lost.
 *     So a span whose clause opens right after a `:` also reads the clause before that colon. A list
 *     introduced by an imperative ("Run: `git rebase develop`") carries no prohibition there, and stays
 *     an order.
 *   - QUOTED TEXT IS DATA. The orchestrator's report QUOTING that sentence between double quotes was
 *     refused too — the guard forbidding anyone to write about it (`guard-that-cannot-go-red`, "the guard
 *     that forbids writing about itself"). A span inside "…", “…” or «…» is a quotation, never an order,
 *     and quoted words never govern a clause either. The scan resumes after the closing quote.
 *
 * WHAT IT DOES NOT DO, stated so nobody relies on it for more: it does not parse English. A prohibition
 * phrased without any of the listed words ("rather than `git rebase`") reads as an instruction, and an
 * instruction whose own clause happens to contain "no" reads as a prohibition. Both are named states in
 * the selftest, so a change in either direction is seen.
 *
 * NO REGEX (M5): `indexOf`, `slice`, `startsWith` and set membership on literals.
 *
 * @es Los comandos de shell que un brief ORDENA ejecutar, frente a los que solo MENCIONA. Un brief
 * cuidadoso nombra los comandos prohibidos justamente para prohibirlos, así que rechazar todo brief que
 * contenga `git rebase` rechazaría al que lo hace bien. REGLA DETERMINISTA: se ordena un comando que está
 * en un span de código cuya CLÁUSULA no lleva palabra de prohibición, en un bloque cercado cuya línea de
 * introducción no la lleva, o en una línea que EMPIEZA con un verbo imperativo. La cláusula (no la línea)
 * es el alcance porque un incidente real llevaba «does not» en otra cláusula de la misma línea. No
 * analiza el inglés: sus dos límites son estados nombrados del selftest. SIN REGEX.
 */

import { simpleCommands } from '../fleet-kit/vendor/shell-command/shell-command.mjs';

/**
 * Words that turn their clause into a prohibition or a description of a refusal, in both languages the
 * briefs of this fleet are written in. Matched as whole lower-cased words.
 * @es Palabras que convierten su cláusula en prohibición o en descripción de un rechazo.
 */
export const PROHIBITION_WORDS = new Set([
  'never', 'not', 'no', 'cannot', 'denied', 'deny', 'denies', 'refused', 'refuse', 'refuses', 'forbidden',
  'forbid', 'prohibited', 'banned', 'avoid', 'blocked',
  'nunca', 'jamás', 'jamas', 'prohibido', 'prohibida', 'denegado', 'denegada', 'rechazado', 'rechazada', 'evita', 'evitá'
]);

/** Verbs that make a line an instruction when they open it. @es Verbos que convierten una línea en orden cuando la abren. */
export const IMPERATIVE_VERBS = ['run', 'execute', 'ejecuta', 'ejecutá', 'corre', 'corré'];

/** Characters that end a clause. The comma is deliberately absent. @es Caracteres que cierran una cláusula; la coma no. */
const CLAUSE_BOUNDARIES = '.;:()!?';

const BACKTICK = '`';
const FENCE = '```';

/** Stands in for a code span's or a quotation's characters, so they never read as prose. @es Ocupa el lugar de un span o una cita. */
const MASK = '\u0000';

/** Quotation marks, as opening and closing pairs. The apostrophe is absent: it is punctuation. @es Comillas, en pares; el apóstrofo no. */
const QUOTE_PAIRS = [['"', '"'], ['“', '”'], ['«', '»']];

const isLetter = (character) => character.toLowerCase() !== character.toUpperCase();

/** The lower-cased words of a piece of prose, with `n't` read as `not`. @es Las palabras de una prosa, con `n't` leído como `not`. */
function proseWords(prose) {
  const expanded = prose.toLowerCase().split("n't").join(' not').split('n’t').join(' not');

  return [...expanded].map((character) => (isLetter(character) ? character : ' ')).join('').split(' ').filter((word) => word.length > 0);
}

/** True when a piece of prose carries a prohibition word. @es Verdadero si la prosa lleva una palabra de prohibición. */
export function isProhibition(prose) {
  return proseWords(prose).some((word) => PROHIBITION_WORDS.has(word));
}

/** The inline code spans of a line: `{ start, end, content }`, `end` at the closing backtick. @es Los spans de código de una línea. */
function codeSpans(line) {
  const spans = [];
  let open = line.indexOf(BACKTICK);

  while (open !== -1) {
    const close = line.indexOf(BACKTICK, open + 1);

    if (close === -1) break;

    spans.push({ start: open, end: close, content: line.slice(open + 1, close) });
    open = line.indexOf(BACKTICK, close + 1);
  }

  return spans;
}

/** The line with every `{ start, end }` range masked. @es La línea con cada rango enmascarado. */
function maskRanges(line, ranges) {
  let masked = line;

  for (const { start, end } of ranges) masked = `${masked.slice(0, start)}${MASK.repeat(end - start + 1)}${masked.slice(end + 1)}`;

  return masked;
}

/**
 * The quoted stretches of a line, marks included, read on a line whose code spans are already masked —
 * so a quote INSIDE a span (`git commit -m "x"`) opens nothing. An unclosed mark quotes nothing.
 * @es Los tramos entre comillas de una línea, leídos con los spans ya enmascarados; una comilla sin cierre no cita nada.
 */
function quotedRanges(spanMasked) {
  return QUOTE_PAIRS.flatMap(([open, close]) => {
    const ranges = [];
    let start = spanMasked.indexOf(open);

    while (start !== -1) {
      const end = spanMasked.indexOf(close, start + 1);

      if (end === -1) break;

      ranges.push({ start, end });
      start = spanMasked.indexOf(open, end + 1);
    }

    return ranges;
  });
}

/** True when `index` falls inside one of `ranges`. @es Verdadero si `index` cae dentro de un rango. */
const isInside = (ranges, index) => ranges.some(({ start, end }) => start < index && index < end);

/**
 * How one line reads: `spanMasked` hides code spans, `prose` also hides quotations, and `quotes` are
 * the quoted stretches. Clauses are read from `prose`, so neither a command nor a quoted word governs one.
 * @es Cómo se lee una línea: sin spans, sin citas, y dónde están las citas.
 */
function readLine(line, spans) {
  const spanMasked = maskRanges(line, spans);
  const quotes = quotedRanges(spanMasked);

  return { quotes, prose: maskRanges(spanMasked, quotes) };
}

/** Where the clause holding `index` begins on a masked line. @es Dónde empieza la cláusula que contiene `index`. */
function clauseStart(masked, index) {
  let from = index;

  while (from > 0 && !CLAUSE_BOUNDARIES.includes(masked.charAt(from - 1))) from -= 1;

  return from;
}

/**
 * The prose that governs `[start, end]` on a masked line: its own clause, and — when that clause opens a
 * list right after a colon — the clause that introduces the list ("These are denied: a, b").
 * @es La prosa que gobierna `[start, end]`: su cláusula y, si abre una lista tras dos puntos, la que la introduce.
 */
export function clauseAround(masked, start, end) {
  const from = clauseStart(masked, start);
  let to = end + 1;

  while (to < masked.length && !CLAUSE_BOUNDARIES.includes(masked.charAt(to))) to += 1;

  const own = `${masked.slice(from, start)} ${masked.slice(end + 1, to)}`;

  if (from === 0 || masked.charAt(from - 1) !== ':') return own;

  return `${masked.slice(clauseStart(masked, from - 1), from - 1)} ${own}`;
}

/** The line without leading layout: whitespace, list bullets, numbering, headings, quotes. @es La línea sin maquetación inicial. */
function withoutLead(line) {
  let index = 0;

  while (index < line.length && ('-*+#>'.includes(line.charAt(index)) || line.charAt(index).trim() === '' || '0123456789'.includes(line.charAt(index)))) index += 1;

  // A numbered item's own dot (`1. Run …`) is layout too, once the digits before it are.
  return line.slice(index).startsWith('. ') ? line.slice(index + 2) : line.slice(index);
}

/** The command after an opening imperative verb, or `undefined`. @es El comando tras un verbo imperativo inicial. */
function imperativeCommand(line) {
  const lead = withoutLead(line);
  const verb = IMPERATIVE_VERBS.find((candidate) => lead.toLowerCase().startsWith(`${candidate} `));

  return verb === undefined ? undefined : lead.slice(verb.length + 1).trim();
}

/** The simple commands of a script, or none when the tokenizer cannot read it. @es Los comandos simples de un script. */
function commandsOf(script) {
  try {
    return [...simpleCommands(script)].filter((command) => command.words.length > 0);
  } catch {
    return [];
  }
}

/**
 * Every place the brief instructs a command: `{ lineNumber, line, via, script, commands }`, where
 * `commands` are the tokenizer's simple commands (`words`, `text`).
 * @es Cada lugar donde el brief ordena un comando, con sus comandos simples ya tokenizados.
 */
export function instructedCommands(text) {
  const instructions = [];
  const lines = text.split('\n').map((line) => line.trimEnd());
  let fenceIntroducedByProhibition;
  let lastProse = '';

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (line.trim().startsWith(FENCE)) {
      fenceIntroducedByProhibition = fenceIntroducedByProhibition === undefined ? isProhibition(lastProse) : undefined;

      return;
    }

    if (fenceIntroducedByProhibition !== undefined) {
      if (!fenceIntroducedByProhibition && line.trim().length > 0) instructions.push({ lineNumber, line, via: 'fenced block', script: line, commands: commandsOf(line) });

      return;
    }

    if (line.trim().length > 0) lastProse = line;

    const spans = codeSpans(line);

    if (spans.length === 0) {
      const command = imperativeCommand(line);

      if (command !== undefined && command.length > 0) instructions.push({ lineNumber, line, via: 'imperative line', script: command, commands: commandsOf(command) });

      return;
    }

    const { quotes, prose } = readLine(line, spans);

    for (const span of spans) {
      if (isInside(quotes, span.start) || isProhibition(clauseAround(prose, span.start, span.end))) continue;

      instructions.push({ lineNumber, line, via: 'code span', script: span.content, commands: commandsOf(span.content) });
    }
  });

  return instructions;
}

/**
 * Every line on which `word` appears — in a code span or in prose, never inside a quotation — in a clause
 * with no prohibition: a tool the brief tells its reader to CALL, such as `EnterWorktree`.
 * `{ lineNumber, line }`.
 * @es Cada línea donde `word` aparece en una cláusula sin prohibición: una herramienta que el brief manda LLAMAR.
 */
export function instructedMentions(text, word) {
  const mentions = [];

  text.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    const { quotes, prose } = readLine(line, codeSpans(line));
    let at = line.indexOf(word);

    while (at !== -1) {
      if (!isInside(quotes, at) && !isProhibition(clauseAround(prose, at, at + word.length - 1))) {
        mentions.push({ lineNumber: index + 1, line });

        return;
      }

      at = line.indexOf(word, at + word.length);
    }
  });

  return mentions;
}
