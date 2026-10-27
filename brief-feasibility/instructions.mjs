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
 *   1. an inline code span (`…`) that reads as an ORDER (`spanReadings`: it heads its clause, follows an order cue
 *      such as `run` or `then`, or continues a list an order opened), unless its CLAUSE carries a prohibition word;
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
 * ORDER OR MENTION (2026-10-27). A span that only NAMES a command ("I saved them with `git update-ref x`", "a brief
 * that asks for `git switch`", "(`git reset`, `git switch -C`)") is a MENTION. Measured before this rule on the 10
 * real fixture briefs and the 28 briefs of session 8dd13422: the worker-git face refused 3 briefs, 2 of them for a
 * mention; with it, 1 (the true order) and 0 mentions. Orders it now reads as mentions, measured on the same corpus: an
 * instrument ("correct it through `node x`"). Every reference stays readable to a face about what the worker
 * RESOLVES (`referencedCommands`).
 *
 * A CLAUSE SPANS A SOFT WRAP, AND AN ASIDE IS NOT A BOUNDARY (2026-10-27). Two orders of this session's briefs were
 * read as mentions: "Run the selftests … of every module that imports it (find\n  importers with rg), plus
 * `node mutation-proof/scope.mjs`" lost its cue twice, once to the line break and once to the parenthesis; and
 * "(`git ls-remote --tags` / `--heads` to find them; …)" is an order whose clause a parenthesis opens. So:
 *   - prose is read in UNITS: consecutive lines joined across every SOFT wrap, a line break not followed by a blank
 *     line, a list item, a fence or a heading (a heading is one line: it ends its unit too);
 *   - a clause a parenthesised ASIDE interrupts RESUMES after it: for a span after the aside, the aside is masked, so
 *     its words neither order nor forbid ("Do not run (see the log) `git push`" stays a prohibition). An aside after
 *     the span still ends the span's clause ("`git rebase x` on your branch (if any does not drop out, stop)" stays
 *     an order). A span INSIDE the aside reads the aside;
 *   - a span that heads a clause a parenthesis opens is an order when a PURPOSE clause follows it ("to find them",
 *     "para verlos"): `to`/`para` followed by a word that is no determiner. A list of examples
 *     ("(`git reset`, `git switch -C`)") carries none, and stays a mention.
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
 * en un span de código que se lee como ORDEN (encabeza su cláusula, sigue a una palabra de orden o continúa una lista
 * que abrió una orden) y cuya CLÁUSULA no lleva palabra de prohibición, en un bloque cercado cuya línea de
 * introducción no la lleva, o en una línea que EMPIEZA con un verbo imperativo. La cláusula (no la línea)
 * es el alcance porque un incidente real llevaba «does not» en otra cláusula de la misma línea. No
 * analiza el inglés: sus dos límites son estados nombrados del selftest. ORDEN O MENCIÓN (2026-10-27): un span que solo NOMBRA un comando es
 * MENCIÓN; medido sobre los 10 briefs reales y los 28 de la sesión 8dd13422, la cara worker-git pasó de rechazar 3
 * briefs (2 por una mención) a 1, la orden real. Lo que ahora se lee como mención siendo orden, medido: una orden entre
 * paréntesis, un instrumento («corrígelo con `node x`») y una frase partida en otra línea. LA CLÁUSULA CRUZA EL SALTO
 * BLANDO Y UN INCISO NO LA CORTA (2026-10-27): la prosa se lee en UNIDADES unidas por cada salto de línea no seguido de
 * línea en blanco, ítem de lista, cerca o encabezado; la cláusula que un inciso interrumpe se REANUDA tras él (para un
 * span posterior, el inciso ni ordena ni prohíbe; uno posterior al span sigue cerrando su cláusula); y un span que encabeza una cláusula abierta por un
 * paréntesis es orden si lo sigue una cláusula de PROPÓSITO («to find them», «para verlos»). Queda como mención el
 * instrumento. SIN REGEX.
 */

import { simpleCommands } from '../shell-command/shell-command.mjs';

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

/**
 * Words that make a code span an ORDER when they stand before it in its own clause, or in the clause a colon opens
 * its list with ("Run in both: `a`, `b`"): a verb that directs the reader to EXECUTE something (`run`, `use`,
 * `verify`), or a step of a sequence (`then`, `finally`), in both languages of the briefs. A verb whose object is
 * the command as text ("find the briefs containing `x`", "detects `git reset`") is deliberately absent. Matched as
 * whole lower-cased words. MEASURED 2026-10-27 on the 10 real fixture briefs and the 28 briefs of session 8dd13422:
 * with this set the worker-git face refuses 1 brief (a true order) and no mention.
 * @es Palabras que convierten un span de código en ORDEN cuando están antes de él en su cláusula, o en la cláusula
 * que abre su lista con dos puntos: un verbo que manda EJECUTAR algo o un paso de una secuencia, en los dos idiomas.
 * Un verbo cuyo objeto es el comando como texto («busca los briefs que contienen `x`») falta a propósito. Medido el
 * 2026-10-27 sobre los 10 briefs reales y los 28 de la sesión 8dd13422: la cara worker-git rechaza 1 brief (una orden
 * real) y ninguna mención.
 */
export const ORDER_CUES = new Set([
  'run', 'rerun', 'execute', 'use', 'do', 'invoke', 'call', 'launch', 'start', 'finish', 'verify', 'apply', 'then', 'finally',
  'ejecuta', 'ejecutá', 'corre', 'corré', 'usa', 'usá', 'haz', 'hacé', 'lanza', 'lanzá', 'empieza', 'empezá', 'termina', 'terminá', 'verifica', 'verificá', 'aplica', 'aplicá', 'luego', 'después', 'finalmente'
]);

/** Characters that end a clause. The comma is deliberately absent. @es Caracteres que cierran una cláusula; la coma no. */
const CLAUSE_BOUNDARIES = '.;:()!?';

/**
 * Words that open a PURPOSE clause after a span inside parentheses ("(`git ls-remote` to find them)"), when the word
 * after them is no `DETERMINERS` word. @es Palabras que abren una cláusula de PROPÓSITO tras un span entre paréntesis.
 */
export const PURPOSE_MARKERS = new Set(['to', 'para']);

/**
 * Words after a purpose marker that show a noun phrase, not a verb: "(`git reset` to the last commit)" names a target.
 * @es Palabras tras un marcador de propósito que muestran un sintagma nominal, no un verbo.
 */
export const DETERMINERS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'its', 'their', 'your', 'our', 'my', 'his', 'her',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'su', 'sus', 'este', 'esta', 'ese', 'esa'
]);

/** Markers that open a bulleted list item. @es Marcas que abren un ítem de lista con viñeta. */
const BULLETS = ['- ', '* ', '+ '];

/** What follows the digits of a numbered list item. @es Lo que sigue a los dígitos de un ítem numerado. */
const NUMBERED = ['. ', ') '];

const HEADING = '#';

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

/**
 * The parenthesised asides of a masked line, parentheses included: each `(` to the next `)`. An unclosed one is no
 * aside. @es Los incisos entre paréntesis de una línea enmascarada, cada `(` hasta el siguiente `)`.
 */
function asideRanges(masked) {
  const ranges = [];
  let start = masked.indexOf('(');

  while (start !== -1) {
    const end = masked.indexOf(')', start + 1);

    if (end === -1) break;

    ranges.push({ start, end });
    start = masked.indexOf('(', end + 1);
  }

  return ranges;
}

/**
 * The prose a span at `index` is read in: the line with every aside that CLOSES before the span masked, so the clause
 * an aside interrupted RESUMES after it ("Run the selftests (find importers with rg), plus `node x`"), and that
 * aside's words neither order nor forbid it. The aside that HOLDS the span is not masked, so its `(` still opens the
 * span's clause; and an aside AFTER the span still ends that clause, as before: measured 2026-10-27 on the 33 briefs of
 * session 8dd13422, masking it too let an unrelated "— never …" after the aside forbid 5 references
 * ("`node capture.mjs supersede` (read its usage) — never hand-edit a ledger").
 * @es La prosa en la que se lee un span: la línea con cada inciso que CIERRA antes del span enmascarado, para que la
 * cláusula que interrumpió se REANUDE tras él sin que sus palabras ordenen ni prohíban. El inciso que CONTIENE el span
 * no se enmascara (su `(` sigue abriendo la cláusula), y uno POSTERIOR sigue cerrándola: enmascararlo dejaba que un
 * «— never …» ajeno prohibiera 5 referencias de los 33 briefs de la sesión.
 */
export const governingProse = (prose, index) => maskRanges(prose, asideRanges(prose).filter(({ end }) => end < index));

/**
 * True when the words after a span, to the end of its clause, open a purpose clause: a `PURPOSE_MARKERS` word followed
 * by one that is no determiner ("to find them", never "to the last commit"). Spans and list separators between are no
 * words. @es Verdadero si las palabras tras un span abren una cláusula de propósito.
 */
function opensPurpose(prose, end) {
  let to = end + 1;

  while (to < prose.length && !CLAUSE_BOUNDARIES.includes(prose.charAt(to))) to += 1;

  const [marker, next] = proseWords(prose.slice(end + 1, to));

  return PURPOSE_MARKERS.has(marker) && next !== undefined && !DETERMINERS.has(next);
}

/**
 * How each code span of a line reads, ORDER or MENTION, decided on the prose of the line (`spans` in line order). A
 * span is an order when:
 *   - the span before it in its clause is an order (a list: "Verify: `a`, `b` and `c`" are all orders);
 *   - otherwise, an `ORDER_CUES` word stands before it in its clause, or in the clause a colon opens it with;
 *   - otherwise, it HEADS its clause (nothing but layout, punctuation or earlier spans before it: "`git rebase x` on
 *     your branch", "Undo it: `git checkout -- a`"), unless that clause was opened by a parenthesis, which makes it
 *     an aside or a list of examples ("detects ref-moving commands (`git reset`, `git switch -C`)") — except when a
 *     PURPOSE clause follows it there ("(`git ls-remote --tags` to find them)").
 * Each span is read in its `governingProse`: an aside around it is masked away, an aside holding it is its world.
 * Anything else is a MENTION: a command the brief describes ("I saved them with `git update-ref x`", "a brief that
 * asks for `git switch`"). Quoted spans are left out before this is asked, and read nothing.
 * @es Cómo se lee cada span de una línea, ORDEN o MENCIÓN. Es orden si un span anterior de su cláusula ya se leyó (una
 * lista), si una palabra de `ORDER_CUES` está antes de él en su cláusula o en la que la abre con dos puntos, o si
 * ENCABEZA su cláusula, salvo que la abra un paréntesis (un inciso o una lista de ejemplos) sin cláusula de propósito
 * detrás. Lo demás es MENCIÓN: un comando que el brief describe. Cada span se lee en su `governingProse`.
 * @returns {Map<number, boolean>} span start to `true` for an order. @es inicio del span a `true` si es orden.
 */
export function spanReadings(prose, spans) {
  const readings = new Map();
  let previous;

  for (const { start, end } of spans) {
    const text = governingProse(prose, start);
    const from = clauseStart(text, start);
    const own = proseWords(text.slice(from, start));
    const lead = from > 0 && text.charAt(from - 1) === ':' ? proseWords(text.slice(clauseStart(text, from - 1), from - 1)) : [];
    const continuesAnOrder = previous !== undefined && previous.from === from && previous.order;
    const heads = own.length === 0 && (text.charAt(from - 1) !== '(' || opensPurpose(text, end));
    const order = continuesAnOrder || [...own, ...lead].some((word) => ORDER_CUES.has(word)) || heads;

    readings.set(start, order);
    previous = { from, order };
  }

  return readings;
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

/** True when a trimmed line opens a list item. @es Verdadero si una línea recortada abre un ítem de lista. */
function opensListItem(trimmed) {
  if (BULLETS.some((bullet) => trimmed.startsWith(bullet))) return true;

  const digits = [...trimmed].findIndex((character) => !'0123456789'.includes(character));

  return digits > 0 && NUMBERED.some((marker) => trimmed.slice(digits).startsWith(marker));
}

/**
 * The brief as the blocks it is read in, in order: `{ kind: 'fence' }` for a fence line, `{ kind: 'fenced', lineNumber,
 * line }` for a line inside a fence, and `{ kind: 'prose', text, lines }` for a UNIT of prose: consecutive lines joined
 * by one space across every SOFT wrap, a line break not followed by a blank line, a list item, a fence or a heading. A
 * heading is one line, so it ends its unit too. `lines` are `{ offset, lineNumber, line }`: where each physical line
 * begins in `text`. @es El brief como los bloques en que se lee: líneas de cerca, líneas cercadas y UNIDADES de prosa,
 * líneas unidas por un espacio a través de cada salto BLANDO (no seguido de línea en blanco, ítem de lista, cerca o
 * encabezado).
 */
export function blocksOf(text) {
  const blocks = [];
  let unit;
  let fenced = false;
  const close = () => {
    if (unit !== undefined) blocks.push(unit);

    unit = undefined;
  };

  text.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const lineNumber = index + 1;

    if (trimmed.startsWith(FENCE)) {
      close();
      blocks.push({ kind: 'fence', lineNumber, line });
      fenced = !fenced;

      return;
    }

    if (fenced) {
      blocks.push({ kind: 'fenced', lineNumber, line });

      return;
    }

    if (trimmed.length === 0) {
      close();

      return;
    }

    if (unit === undefined || opensListItem(trimmed) || trimmed.startsWith(HEADING)) {
      close();
      unit = { kind: 'prose', text: line, lines: [{ offset: 0, lineNumber, line }] };
    } else {
      unit.lines.push({ offset: unit.text.length + 1, lineNumber, line });
      unit.text = `${unit.text} ${trimmed}`;
    }

    if (trimmed.startsWith(HEADING)) close();
  });
  close();

  return blocks;
}

/** The physical line of a unit that holds `index`. @es La línea física de una unidad que contiene `index`. */
const lineAt = (unit, index) => unit.lines.findLast(({ offset }) => offset <= index);

/**
 * Every command the brief REFERS to outside a quotation and a prohibition: `{ lineNumber, line, via, order, script,
 * commands }`, where `order` says whether the brief directs the worker to run it (`spanReadings`; a fenced block and
 * an imperative line are always orders) and `commands` are the tokenizer's simple commands (`words`, `text`). A face
 * about what the worker will RUN reads `instructedCommands`; a face about what the worker will RESOLVE, such as a
 * relative path, reads every reference, since a path the brief only names ("the contract in `.claude/X` binds you")
 * is still one the worker opens.
 * @es Cada comando al que el brief SE REFIERE fuera de una cita y de una prohibición, con `order` si el brief manda
 * ejecutarlo. Una cara sobre lo que el worker EJECUTARÁ lee `instructedCommands`; una sobre lo que RESOLVERÁ, como una
 * ruta relativa, lee toda referencia, porque una ruta que el brief solo nombra es igual una que el worker abre.
 */
export function referencedCommands(text) {
  const instructions = [];
  let fenceIntroducedByProhibition;
  let lastProse = '';

  for (const block of blocksOf(text)) {
    if (block.kind === 'fence') {
      fenceIntroducedByProhibition = fenceIntroducedByProhibition === undefined ? isProhibition(lastProse) : undefined;

      continue;
    }

    if (block.kind === 'fenced') {
      const { lineNumber, line } = block;

      if (!fenceIntroducedByProhibition && line.trim().length > 0) instructions.push({ lineNumber, line, via: 'fenced block', order: true, script: line, commands: commandsOf(line) });

      continue;
    }

    lastProse = block.text;

    const spans = codeSpans(block.text);

    if (spans.length === 0) {
      const command = imperativeCommand(block.text);
      const { lineNumber, line } = block.lines[0];

      if (command !== undefined && command.length > 0) instructions.push({ lineNumber, line, via: 'imperative line', order: true, script: command, commands: commandsOf(command) });

      continue;
    }

    const { quotes, prose } = readLine(block.text, spans);
    const unquoted = spans.filter((span) => !isInside(quotes, span.start));
    const orders = spanReadings(prose, unquoted);

    for (const span of unquoted) {
      if (isProhibition(clauseAround(governingProse(prose, span.start), span.start, span.end))) continue;

      const { lineNumber, line } = lineAt(block, span.start);

      instructions.push({ lineNumber, line, via: 'code span', order: orders.get(span.start), script: span.content, commands: commandsOf(span.content) });
    }
  }

  return instructions;
}

/**
 * Every place the brief ORDERS a command: the references that are orders (`referencedCommands`).
 * @es Cada lugar donde el brief ORDENA un comando: las referencias que son órdenes.
 */
export const instructedCommands = (text) => referencedCommands(text).filter((reference) => reference.order);

/**
 * Every line on which `word` appears — in a code span or in prose, never inside a quotation — in a clause
 * with no prohibition: a tool the brief tells its reader to CALL, such as `EnterWorktree`. The clause is read in
 * its prose unit (`blocksOf`), so a prohibition wrapped onto the line before still governs it; a unit yields one
 * mention at most. `{ lineNumber, line }`.
 * @es Cada línea donde `word` aparece en una cláusula sin prohibición: una herramienta que el brief manda LLAMAR. La
 * cláusula se lee en su unidad de prosa, así que una prohibición partida en la línea anterior la sigue gobernando.
 */
export function instructedMentions(text, word) {
  const mentions = [];

  for (const unit of blocksOf(text).filter((block) => block.kind === 'prose')) {
    const { quotes, prose } = readLine(unit.text, codeSpans(unit.text));
    let at = unit.text.indexOf(word);

    while (at !== -1) {
      if (!isInside(quotes, at) && !isProhibition(clauseAround(governingProse(prose, at), at, at + word.length - 1))) {
        const { lineNumber, line } = lineAt(unit, at);

        mentions.push({ lineNumber, line });
        break;
      }

      at = unit.text.indexOf(word, at + word.length);
    }
  }

  return mentions;
}
