/**
 * The DECISION of the brief-provenance guard: where each claim-bearing tool carries its brief, and
 * whether that brief declares what was measured apart from what is a guess.
 *
 * Separated from `guard.mjs` so the decision is a pure function a selftest can import — the hook shim
 * must keep running its `main` unconditionally, because a "run only when invoked directly" test that
 * compares paths is drive-letter fragile on Windows, and a guard whose `main` silently never ran would
 * allow every delegation while looking installed.
 *
 * NO REGEX (M5): a pattern that fails to match SKIPS silently, which is the very defect class this
 * loop exists to close. Every test is `startsWith`, `includes`, `===` or `trim` on a literal.
 *
 * @es La DECISIÓN del guard: dónde lleva su brief cada herramienta que puede afirmar algo, y si ese
 * brief declara lo medido aparte de lo supuesto. Separada de `guard.mjs` para que un selftest pueda
 * importarla: el shim debe ejecutar su `main` sin condición, porque comparar rutas para decidir si se
 * invocó directamente es frágil en Windows y un guard cuyo `main` no corriera permitiría todo con
 * aspecto de instalado. SIN REGEX (M5).
 */

/** The two marker words, matched literally. @es Las dos palabras marcadoras, casadas literalmente. */
export const MEASURED_WORD = 'MEASURED';
export const HYPOTHESIS_WORD = 'HYPOTHESIS';

/**
 * Rejects a marker that is merely the PREFIX of a longer word, so `MEASUREDLY:` cannot satisfy
 * `MEASURED`. Literal character-set membership, not a regex word boundary (M5).
 * @es Rechaza un marcador que solo es PREFIJO de otra palabra. Pertenencia literal a un conjunto de
 * caracteres, no un límite de palabra de regex (M5).
 */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Leading characters that are LAYOUT rather than content: indentation, list bullets, headings,
 * blockquotes. A brief written as a markdown list — `- MEASURED: …` — is declaring exactly as much as
 * one written flat. It opens no hole, because prose begins with a WORD: `as the MEASURED: value shows`
 * still starts with `as` and is still refused.
 * @es Caracteres iniciales que son MAQUETACIÓN, no contenido. Un brief escrito como lista markdown
 * declara lo mismo que uno plano, y no abre agujero: la prosa empieza por una PALABRA.
 */
const LIST_MARKUP = '-*+#>';

// Whitespace is decided by `trim()` rather than by a literal string of blank characters, so a
// non-breaking space pasted into this source — or a `\r` — can never become the invisible reason a
// correct brief is refused.
// @es Lo blanco lo decide `trim()`, no una constante llena de espacios.
const isLead = (char) => LIST_MARKUP.includes(char) || char.trim() === '';

/** The line without its leading layout; exported so every brief-line guard strips layout the same way. @es La línea sin su maquetación inicial; exportada para que todo guard de líneas de brief la quite igual. */
export function stripLead(line) {
  let index = 0;

  while (index < line.length && isLead(line.charAt(index))) index += 1;

  return line.slice(index);
}

/**
 * Where the marker has to BE, and why this is not the check that shipped first.
 *
 * The original test was `prompt.includes('MEASURED:')` — the colon glued to the word, anywhere in the
 * brief. That is a PROXY. The property the guard needs is that the brief carries a provenance
 * DECLARATION: a line whose subject is the marker. It cost three refused delegations in one session,
 * all written by an author adding the qualifier a careful person writes — `MEASURED (by me, on develop
 * just now):` — where the colon lands after the parenthetical.
 *
 * So the check requires the marker word to HEAD its own line, and that line to carry a colon. It is
 * STRICTER on position (`…as the MEASURED: value shows…` is refused), no LOOSER on identity (the letter
 * check refuses `MEASUREDLY:`), and tolerant only of what sits between the word and its colon.
 *
 * @es DÓNDE debe estar el marcador. La comprobación original exigía el dos puntos PEGADO a la palabra
 * en cualquier parte: un PROXY. La propiedad real es una línea cuyo sujeto es el marcador. Es MÁS
 * estricta en posición e identidad, y tolerante solo con lo que hay entre la palabra y el dos puntos.
 */
function classifyMarker(brief, word) {
  let headsALine = false;

  // Literal line scan. `trim()` also strips the `\r` of a CRLF brief, which is the norm on this machine.
  for (const rawLine of brief.split('\n')) {
    const line = stripLead(rawLine);

    if (!line.startsWith(word)) continue;

    const rest = line.slice(word.length);

    if (rest.length > 0 && LETTERS.includes(rest.charAt(0))) continue;

    headsALine = true;

    if (rest.includes(':')) return 'present';
  }

  if (headsALine) return 'no-colon';

  return brief.includes(word) ? 'buried' : 'absent';
}

/**
 * The tools whose payload can carry a CLAIM, the `tool_input` field that carries it, and the noun a
 * refusal uses for that surface. This map IS the claim-bearing set: a tool cannot be added to the
 * decision without saying where its brief lives, and `selftest.mjs` proves each field against a
 * RECORDED payload and each tool against `guard.mjs.hook-registration.json`.
 *
 * WHY THE FIELD IS PER TOOL, measured 2026-09-14. The previous guard read `tool_input.prompt` for every
 * tool. `SendMessage` has no `prompt`: a payload captured from the live harness carries the text in
 * `tool_input.message` (in full — 2870 of 2870 characters on a long capture) and a 50-character preview
 * in `tool_input.content`. So every resume was read as "no brief" and allowed, while this module claimed
 * to cover it. `content` is never read: a preview cannot show a marker placed after its 49th character.
 *
 * WHY `SendMessage` IS HERE AT ALL, measured over 230 real resume messages from 199 transcripts
 * (`.claude/brief-provenance-study/`): a resume is not a "carry on" (median 2038 characters, shortest
 * 330), 16 of the 118 recent ones already declare and pass untouched, and the 2026-09-08 resume that
 * attributed the author's own inference to another worker's measurement carries no marker line at all.
 * What this does NOT do: catch a claim written in the BODY — with the two marker lines prepended, 6 of
 * 6 brief incidents pass. It closes a REACH gap; it is not a detector.
 *
 * @es Las herramientas cuyo payload puede llevar una AFIRMACIÓN, el campo de `tool_input` que la lleva
 * y el sustantivo del rechazo. Este mapa ES el conjunto: no se añade una herramienta sin decir dónde vive
 * su brief. POR QUÉ EL CAMPO VA POR HERRAMIENTA (medido el 2026-09-14): el guard anterior leía `prompt`
 * siempre, y `SendMessage` no lo tiene — el payload capturado lleva el texto entero en `message` y una
 * vista previa de 50 caracteres en `content` —, así que todo resume se permitía mientras este módulo
 * decía cubrirlo. `content` jamás se lee. POR QUÉ `SendMessage` está aquí: medido sobre 230 resumes
 * reales; no caza afirmaciones en el CUERPO, cierra un hueco de ALCANCE.
 */
export const BRIEF_CARRIERS = Object.freeze({
  Agent: Object.freeze({ field: 'prompt', surface: 'delegation' }),
  Task: Object.freeze({ field: 'prompt', surface: 'delegation' }),
  SendMessage: Object.freeze({ field: 'message', surface: 'message' }),
});

/**
 * The brief a payload carries, or `undefined` when the tool bears no claim or carries no text.
 * @es El brief que lleva un payload, o `undefined` si la herramienta no afirma nada o no lleva texto.
 */
export function briefOf(payload) {
  const toolName = payload?.tool_name;

  if (typeof toolName !== 'string' || !Object.hasOwn(BRIEF_CARRIERS, toolName)) return undefined;

  const { field, surface } = BRIEF_CARRIERS[toolName];
  const text = payload?.tool_input?.[field];

  if (typeof text !== 'string' || text.trim().length === 0) return undefined;

  return { toolName, surface, text };
}

/**
 * THERE IS NO LENGTH THRESHOLD, and its absence is the design. The first version had one, at 1500
 * characters, justified by a claim nobody measured; replaying the ACTUAL #115 brief returned ALLOWED at
 * 1086 characters. Length is not the variable — whether the brief ASSERTS anything is, and only its
 * author knows that, so the control asks on every call and the escape is one line
 * (`MEASURED: none — exploratory task.`).
 *
 * Each failing marker is carried with the STATE it failed in, never as a bare "missing": a control that
 * decides correctly but explains poorly gets routed around.
 *
 * @es NO HAY UMBRAL DE LONGITUD, y su ausencia es el diseño: el umbral de 1500 se justificó con un dato
 * sin medir y el brief real de #115 pasaba con 1086. Cada marcador que falla viaja con su ESTADO.
 */
export function inspectBrief(brief) {
  const failures = [];

  for (const word of [MEASURED_WORD, HYPOTHESIS_WORD]) {
    const state = classifyMarker(brief.text, word);

    if (state !== 'present') failures.push({ word, state });
  }

  return failures.length === 0 ? undefined : { failures, length: brief.text.length, toolName: brief.toolName, surface: brief.surface };
}
