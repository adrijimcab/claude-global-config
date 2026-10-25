#!/usr/bin/env node
/**
 * The decisions of the brief-audience guard, each broken once, that `selftest.mjs` must catch: which tools
 * carry text and which of them get the decider-tail check, the tail width, every decider phrase, every
 * tool-call tag, and how quotation (inline code, fences) hides a tag. The campaign runner and its rules
 * (green baseline first, exactly-once targets, parse-checked mutants) live in `../mutation-proof/run-mutants.mjs`.
 * A mutant is never deleted or softened to get a clean campaign: a survivor is a missing assertion.
 *
 * @es Las decisiones del guard de audiencia, rotas una a una, que `selftest.mjs` debe cazar: qué herramientas
 * llevan texto, cuáles revisan la cola, su anchura, cada frase al decisor, cada etiqueta de llamada y cómo
 * la cita oculta una etiqueta. Un mutante nunca se borra ni se ablanda: un superviviente es una aserción que falta.
 *
 * The hook shim `guard.mjs` is a deciding module too (it is dispatched): its mutants break what the harness
 * reads, the BOM strip, the fail-open of an unreadable payload, the deny envelope, the reason chosen by kind,
 * and the import-must-not-run rule. NOT mutated, by measurement: the `catch` around `inspectPayload` that fails
 * open on a malfunction of the decision, because no JSON payload makes `inspectPayload` throw, so no fixture can
 * reach it and a mutant there would be equivalent for every input this guard can receive.
 * @es El shim `guard.mjs` también decide (se despacha): sus mutantes rompen lo que lee el harness. No se muta,
 * por medición, el `catch` alrededor de `inspectPayload`: ningún payload JSON lo hace lanzar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';
import { DECIDER_PHRASES, MARKUP_TAGS } from './audience.mjs';

const AUD = 'brief-audience/audience.mjs';
const GUARD = 'brief-audience/guard.mjs';
const DENY = "{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'BRIEF-AUDIENCE REFUSED' } }";
const FIELDS = "fields: ['subject', 'description', 'activeForm']";
const MEMORY = "fields: ['title', 'content']";

/** One mutant per entry of a list the module keeps: the same list without that entry. @es Un mutante por entrada de una lista. */
const withoutEach = (label, list, text, without) => list.map((entry, at) => [`${label} ${entry} is no longer recognised`, AUD, text(list), without(list.filter((_, index) => index !== at))]);
const quoted = (list) => `[${list.map((entry) => `'${entry}'`).join(', ')}]`;

const MUTANTS = [
  // Which tools get which check / Qué herramientas reciben qué revisión
  ['an Agent brief loses the decider-tail check', AUD, "Agent: Object.freeze({ fields: ['prompt'], deciderTail: true })", "Agent: Object.freeze({ fields: ['prompt'], deciderTail: false })"],
  ['a Task brief loses the decider-tail check', AUD, "Task: Object.freeze({ fields: ['prompt'], deciderTail: true })", "Task: Object.freeze({ fields: ['prompt'], deciderTail: false })"],
  ['a SendMessage gains the decider-tail check the census rejected', AUD, "SendMessage: Object.freeze({ fields: ['message'], deciderTail: false })", "SendMessage: Object.freeze({ fields: ['message'], deciderTail: true })"],
  ...['TaskCreate', 'TaskUpdate'].flatMap((tool) =>
    ['subject', 'description', 'activeForm'].map((field) => [`${tool}.${field} is no longer read`, AUD, `${tool}: Object.freeze({ ${FIELDS}`, `${tool}: Object.freeze({ fields: ${quoted(['subject', 'description', 'activeForm'].filter((one) => one !== field))}`]),
  ),
  ...['mcp__plugin_engram_engram__mem_save', 'mcp__engram__mem_save'].flatMap((tool) =>
    ['title', 'content'].map((field) => [`${tool}.${field} is no longer read`, AUD, `${tool}: Object.freeze({ ${MEMORY}`, `${tool}: Object.freeze({ fields: ${quoted(['title', 'content'].filter((one) => one !== field))}`]),
  ),
  // The tail / La cola
  ['the tail is narrower than the measured leak', AUD, 'TAIL_CHARACTERS = 700;', 'TAIL_CHARACTERS = 500;'],
  ['the head of the brief is inspected instead of its tail', AUD, 'text.slice(-TAIL_CHARACTERS)', 'text.slice(0, TAIL_CHARACTERS)'],
  ['phrases are matched case-sensitively', AUD, 'text.slice(-TAIL_CHARACTERS).toLowerCase()', 'text.slice(-TAIL_CHARACTERS)'],
  ['the refusal claims the full tail width for a short brief', AUD, 'Math.min(TAIL_CHARACTERS, text.length)', 'TAIL_CHARACTERS'],
  // Every phrase and every tag is a decision / Cada frase y cada etiqueta es una decisión
  ...withoutEach('the decider phrase', DECIDER_PHRASES, (list) => list.map((phrase) => `  '${phrase}',`).join('\n'), (list) => list.map((phrase) => `  '${phrase}',`).join('\n')),
  ...withoutEach('the tag', MARKUP_TAGS, quoted, quoted),
  // Quotation / La cita
  ['a tilde fence no longer quotes', AUD, "const FENCES = ['```', '~~~'];", "const FENCES = ['```'];"],
  ['a backtick fence no longer quotes', AUD, "const FENCES = ['```', '~~~'];", "const FENCES = ['~~~'];"],
  ['an indented fence no longer quotes', AUD, 'line.trim().startsWith(fence)', 'line.startsWith(fence)'],
  ['a closed fence keeps quoting what follows it', AUD, 'insideFence = !insideFence;', 'insideFence = true;'],
  ['a fenced line is inspected like any other', AUD, 'if (insideFence) continue;', 'if (false) continue;'],
  // The hook shim: what the harness reads / El shim del hook: lo que lee el harness
  // Retired, pinned by hook-io's own mutants: the BOM strip ('the BOM is not stripped', 'the BOM test strips
  // any first character'), the decision value ('deny does not say deny') and the event ('deny names the wrong
  // event'). The mutants below keep the shim's own use of the port.
  // @es Retirados, fijados por los mutantes de hook-io: el BOM, el valor de la decisión y el evento.
  ['every payload reads as unreadable', GUARD, 'const payload = tryParsePayload(raw);', "const payload = tryParsePayload('');"],
  ['an unreadable payload blocks the call instead of failing open', GUARD, `if (payload === undefined) return undefined;`, `if (payload === undefined) return ${DENY};`],
  ['a brief the decision allows is refused all the same', GUARD, 'if (refusal === undefined) return undefined;', "if (refusal === undefined) refusal = { toolName: 'Agent', field: 'prompt', kind: 'markup', tag: '</parameter>', length: 1 };"],
  ['every refusal gives one reason, whatever it found', GUARD, "refusal.kind === 'markup' ? markupReason(refusal) : deciderReason(refusal)", "'BRIEF-AUDIENCE REFUSED this call.'"],
  ['a decider refusal gives the markup reason', GUARD, "refusal.kind === 'markup' ? markupReason(refusal) : deciderReason(refusal)", 'markupReason(refusal)'],
  ['the process prints nothing for a refusal', GUARD, 'runWhenMain(import.meta.url, hookMain(evaluate));', 'runWhenMain(import.meta.url, hookMain(() => undefined));'],
  ['importing the guard runs it as a process', GUARD, 'runWhenMain(import.meta.url, hookMain(evaluate));', 'hookMain(evaluate)();'],
  ['a backtick span quotes by its backtick count alone, parity ignored', AUD, 'backticksBefore % 2 === 1', 'backticksBefore > 0'],
  ['a span that never closes still quotes the tag after it', AUD, "&& line.indexOf('`', at + tag.length) !== -1", '&& true'],
  ['a quoted tag stops the scan of its line, hiding the same tag bare later', AUD, 'from = at + tag.length;', 'break;'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['brief-audience', 'hook-io', 'hook-payloads', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'brief-audience/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
