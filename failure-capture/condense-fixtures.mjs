/**
 * The constructed ledger lines the `condense` proofs share: one of each kind a ledger holds, and the short
 * form each must become. Text only; nothing here reads the real ledger.
 *
 * @es Las líneas de ledger construidas que comparten las pruebas de `condense`: una de cada tipo que hay en
 * un ledger y la forma corta en que debe convertirse. Solo texto: nada aquí lee el ledger real.
 */

import { minimalStub, tieredLine } from './ledger-line.mjs';

export const KEYED = '- [global] 2026-06-30 — (×4) La lección de la señal: corregir el año → causa → RULE: nunca uses ñ sin verificar la tilde. <!--fc:signal-lesson#4-->';
export const TWO_LABELS = '- [global] 2026-07-01 — first -> RULE: a -> RULE: b <!--fc:two-labels#1-->';
export const FAT_MECHANISM = '- [promoted] 2026-09-29 — guard-key: now a binding rule in a file; closed by mechanism .claude/check/check.mjs (selftest run, exit 0); full history in x <!--fc:guard-key#3-->';
export const FAT_NONE = '- [promoted] 2026-09-30 — soft-key: now a binding rule in a file; no mechanism is possible: nobody can tell; full history in x <!--fc:soft-key#2-->';
/** A fat promoted line that lost its marker: nothing can shorten it, and a key map must not name it. @es Una línea promovida gruesa sin marcador: nada puede acortarla y un mapa de claves no debe nombrarla. */
export const PROMOTED_MARKERLESS = FAT_MECHANISM.slice(0, FAT_MECHANISM.indexOf(' <!--fc:'));
export const MARKERLESS = '- [global] 2026-06-09 — Conflated memory with hooks, which are deterministic -> RULE: enforce it by hook injection.';
/** Shares its first 40 characters with `MARKERLESS`, so a prefix of that length is ambiguous. @es Comparte los 40 primeros caracteres con `MARKERLESS`: un prefijo de esa longitud es ambiguo. */
export const TWIN = `${MARKERLESS.slice(0, 40)}something entirely different -> RULE: another rule for another lesson.`;
export const PROJECT_LINE = '- [b100-am-ui] 2026-09-01 — a project lesson -> RULE: is shortened like any other lesson. <!--fc:project-one#1-->';
/** A marker-less line of a project ledger: it takes a key only from the operator, as a marker-less global line does. @es Una línea sin marcador de un ledger de proyecto: solo recibe clave del operador, como una global sin marcador. */
export const PROJECT_MARKERLESS = '- [b100-am-ui] 2026-09-02 — A project lesson written before markers existed -> RULE: key it by hand, never by guess.';
/** A marker-less line that is already short: what an earlier run with a key map leaves behind. @es Una línea sin marcador ya corta: lo que deja una ejecución previa con mapa de claves. */
export const TIERED_BARE = tieredLine({ scope: 'global', date: '2026-06-10', rule: 'a rule that is already short and bare.', key: 'bare-one' }).line;

export const HOOKS_KEY = 'hooks-not-memory';
export const SHORT_KEYED = tieredLine({ scope: 'global', date: '2026-06-30', tally: '(×4)', rule: 'nunca uses ñ sin verificar la tilde.', key: 'signal-lesson', marker: '<!--fc:signal-lesson#4-->' }).line;
export const SHORT_MARKERLESS = tieredLine({ scope: 'global', date: '2026-06-09', rule: 'enforce it by hook injection.', key: HOOKS_KEY }).line;
export const PROJECT_KEY = 'project-by-hand';
export const SHORT_PROJECT = tieredLine({ scope: 'b100-am-ui', date: '2026-09-01', rule: 'is shortened like any other lesson.', key: 'project-one', marker: '<!--fc:project-one#1-->' }).line;
export const SHORT_PROJECT_MARKERLESS = tieredLine({ scope: 'b100-am-ui', date: '2026-09-02', rule: 'key it by hand, never by guess.', key: PROJECT_KEY }).line;
export const STUB_MECHANISM = minimalStub({ date: '2026-09-29', mechanism: '.claude/check/check.mjs', marker: '<!--fc:guard-key#3-->' }).line;
export const STUB_NONE = minimalStub({ date: '2026-09-30', marker: '<!--fc:soft-key#2-->' }).line;
