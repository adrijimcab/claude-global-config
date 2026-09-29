/**
 * The DECISION of the brief-audience guard: does text written into a brief or a durable record carry
 * something addressed to someone other than its reader — a question for the decider at a brief's end, or
 * the tool-call markup of the author's own unfinished call?
 *
 * TWO SIGNATURES, one root. Both are what an author produces when the prose meant for one audience is
 * captured inside a tool call meant for another, because a parameter block was still open:
 *
 *   1. A DECIDER QUESTION at the end of a brief — measured 2026-09-09: an sdd-tasks prompt ended with a
 *      status report to the owner and "¿Las lanzo, o las quieres ver primero?".
 *   2. TOOL-CALL MARKUP in the text — measured 2026-09-14: task #6's record (TaskCreate, session c45d798b,
 *      transcript line 15925) stores `…is itself debt.</parameter>` followed by a new line opening
 *      `<parameter name="activeForm">`, so the description swallowed the next parameter and the record has
 *      no activeForm at all. The first signature could not have caught it — it is not a question, and it
 *      did not arrive through Agent/Task, the only tools the guard covered.
 *
 * WHICH TOOLS AND WHICH SIGNATURE, decided by a census rather than by analogy — every tool_use in all 504
 * transcripts of this project, 1,744 distinct carrier calls, each hit READ (2026-09-14):
 *
 *   MARKUP, bare tags outside code — 108 hits, every one a real leak (a closing `</prompt>`, `</message>`,
 *   `</content>`, `</subject>` followed by the call's own closing tag; two even carried a fabricated tool
 *   result after it), 0 quotations refused:
 *     Agent 22 / 551 · SendMessage 16 / 308 · TaskCreate 8 / 137 · TaskUpdate 2 / 258 ·
 *     mcp__engram__mem_save 36 / 143 · mcp__plugin_engram_engram__mem_save 24 / 347
 *   So the markup signature applies to EVERY carrier: briefs and the durable records later sessions plan
 *   from alike.
 *
 *   DECIDER QUESTION in the tail — 1 hit, on SendMessage, and it is a FALSE POSITIVE: a resume telling a
 *   worker "amend or not — your call, but keep history clean", i.e. delegating a choice TO the worker.
 *   0 true positives on SendMessage and 0 on 551 Agent prompts in these transcripts. So the decider
 *   signature stays where its one measured incident was — Agent / Task — and is NOT extended to
 *   SendMessage, and the phrase "your call" is removed from the list: measured to address the worker.
 *
 *   Fields: Agent/Task `prompt`, SendMessage `message` (captured), TaskCreate/TaskUpdate `subject`,
 *   `description`, `activeForm` (the real calls' keys), mem_save `title`, `content` (captured).
 *
 * QUOTING IS DATA, NOT A LEAK. Writing ABOUT the incident means writing the tag — this guard's own
 * contract and every report on #6 do. A tag inside inline code (between backticks) or a fenced block is
 * a quotation and passes; a bare tag is the leak. Without that distinction the guard would refuse the
 * first message written about it — the face `guard-that-cannot-go-red` names for guards that forbid
 * writing about themselves.
 *
 * NO REGEX (M5): literal `includes`/`indexOf`/`startsWith` and a backtick count.
 *
 * @es La DECISIÓN del guard: ¿lleva un brief o un registro durable algo dirigido a quien no es su lector?
 * Dos firmas de una raíz: una PREGUNTA al decisor al final de un brief, y MARCADO de llamada de
 * herramienta en el texto (medido en el registro de #6, que llegó por TaskCreate). CENSO de 504
 * transcripciones: 108 fugas de marcado reales en las seis herramientas y 0 citas rechazadas, así que el
 * marcado se revisa en TODAS; la pregunta al decisor dio 1 falso positivo y 0 aciertos en SendMessage, así
 * que se queda en Agent/Task y «your call» sale de la lista. CITAR ES DATO: una etiqueta entre acentos
 * graves o en un bloque cercado pasa; una etiqueta desnuda es la fuga. SIN REGEX.
 */

/**
 * Where each tool carries text, and whether its TAIL is also checked for a decider question. Every
 * carrier is checked for bare tool-call markup. This map IS the covered set; the selftest checks it
 * against the registration declaration.
 * @es Dónde lleva texto cada herramienta y si su COLA se revisa también por una pregunta al decisor.
 */
export const CARRIERS = Object.freeze({
  Agent: Object.freeze({ fields: ['prompt'], deciderTail: true }),
  Task: Object.freeze({ fields: ['prompt'], deciderTail: true }),
  SendMessage: Object.freeze({ fields: ['message'], deciderTail: false }),
  TaskCreate: Object.freeze({ fields: ['subject', 'description', 'activeForm'], deciderTail: false }),
  TaskUpdate: Object.freeze({ fields: ['subject', 'description', 'activeForm'], deciderTail: false }),
  mcp__plugin_engram_engram__mem_save: Object.freeze({ fields: ['title', 'content'], deciderTail: false }),
  mcp__engram__mem_save: Object.freeze({ fields: ['title', 'content'], deciderTail: false }),
});

/**
 * How much of a brief's end is inspected for a decider question. A leak is a whole trailing block; a
 * brief's own closing instructions live in roughly this much text.
 * @es Cuánto del final de un brief se inspecciona.
 */
export const TAIL_CHARACTERS = 700;

/** Phrases that address a DECIDER rather than a worker, lowercased literals. @es Frases dirigidas a quien DECIDE. */
export const DECIDER_PHRASES = Object.freeze([
  '¿las lanzo',
  '¿lo lanzo',
  '¿las quieres',
  '¿lo quieres',
  '¿quieres que',
  '¿te parece',
  '¿sigo con',
  '¿procedo',
  '¿lo hago',
  'dime si',
  'dime qué prefieres',
  'tú decides',
  'es tuyo decidir',
  'shall i launch',
  'shall i proceed',
  'do you want me to',
  'would you prefer',
  'let me know if you',
  'up to you',
]);

/** The tool-call markup whose bare presence means a parameter block was still open. @es El marcado de llamada cuya presencia desnuda indica un bloque abierto. */
export const MARKUP_TAGS = Object.freeze(['</parameter>', '<parameter name=', '</invoke>', '<invoke name=']);

const FENCES = ['```', '~~~'];

/**
 * The first BARE tool-call tag in `text` — outside fenced blocks and outside inline code — as
 * `{ tag, index }`, or `undefined`. A tag inside backticks or a fence is a quotation, not a leak.
 * @es La primera etiqueta DESNUDA — fuera de bloques cercados y de código en línea —, o `undefined`.
 */
export function markupLeak(text) {
  if (typeof text !== 'string') return undefined;

  let offset = 0;
  let insideFence = false;

  for (const line of text.split('\n')) {
    const lineStart = offset;

    offset += line.length + 1;

    if (FENCES.some((fence) => line.trim().startsWith(fence))) {
      insideFence = !insideFence;
      continue;
    }

    if (insideFence) continue;

    for (const tag of MARKUP_TAGS) {
      let from = 0;

      for (;;) {
        const at = line.indexOf(tag, from);

        if (at === -1) break;

        // Inside inline code only when a span is OPEN before the tag and CLOSED after it: a stray backtick
        // that never closes quotes nothing, and must not hide a tag that follows it.
        // @es Dentro de código en línea sólo si un tramo está ABIERTO antes y CERRADO después.
        const backticksBefore = [...line.slice(0, at)].filter((character) => character === '`').length;
        const quoted = backticksBefore % 2 === 1 && line.indexOf('`', at + tag.length) !== -1;

        if (!quoted) return { tag, index: lineStart + at };

        from = at + tag.length;
      }
    }
  }

  return undefined;
}

/** The decider phrases in the last {@link TAIL_CHARACTERS} of `text`. @es Las frases al decisor en la cola de `text`. */
export function deciderPhrases(text) {
  const tail = text.slice(-TAIL_CHARACTERS).toLowerCase();

  return DECIDER_PHRASES.filter((phrase) => tail.includes(phrase));
}

/**
 * The refusal a payload earns, or `undefined`: `{ toolName, field, kind: 'markup', tag }` or
 * `{ toolName, field, kind: 'decider', found }`. Fields are checked in their declared order; markup
 * outranks a decider question because it proves the call itself was malformed.
 * @es La negativa que merece un payload, o `undefined`. El marcado manda sobre la pregunta al decisor
 * porque prueba que la propia llamada estaba mal formada.
 */
export function inspectPayload(payload) {
  const toolName = payload?.tool_name;

  if (typeof toolName !== 'string' || !Object.hasOwn(CARRIERS, toolName)) return undefined;

  const carrier = CARRIERS[toolName];
  const input = payload?.tool_input ?? {};

  for (const field of carrier.fields) {
    const text = input[field];

    if (typeof text !== 'string' || text.trim().length === 0) continue;

    const leak = markupLeak(text);

    if (leak !== undefined) return { toolName, field, kind: 'markup', tag: leak.tag, length: text.length };
  }

  if (!carrier.deciderTail) return undefined;

  for (const field of carrier.fields) {
    const text = input[field];

    if (typeof text !== 'string' || text.trim().length === 0) continue;

    const found = deciderPhrases(text);

    if (found.length > 0) return { toolName, field, kind: 'decider', found, tailLength: Math.min(TAIL_CHARACTERS, text.length), length: text.length };
  }

  return undefined;
}
