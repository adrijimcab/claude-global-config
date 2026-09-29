#!/usr/bin/env node
/**
 * Campaña de mutantes: cada uno revierte UNA decisión del guard y `selftest.mjs` tiene que ponerse en
 * rojo. Un sobreviviente es un selftest que seguiría verde con esa rotura (`guard-that-cannot-go-red`).
 *
 * Usa el runner compartido de la flota (`mutation-proof/run-mutants.mjs` del checkout de b100-am-ui,
 * solo LECTURA): exige línea base verde sin mutar, objetivo presente exactamente una vez y mutante que
 * parsea. No se duplica acá; si el runner no está, la campaña sale con 2 = NO MEDIDO, nunca con un
 * veredicto.
 *
 * Mutantes deliberadamente AUSENTES, con su motivo:
 *   - Quitar el `slice(1)` de `tailLines`: equivalente. El fragmento cortado nunca es JSON válido y
 *     `turnTextsFromLines` ya lo salta; ningún selftest puede distinguirlo porque ningún uso tampoco.
 *   - Vaciar entradas sueltas de las listas de palabras: cada lista tiene decenas de marcadores
 *     redundantes a propósito; quitar uno no cambia ningún veredicto razonable.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = 'C:/Users/adrian.jimenez/Desktop/Projects/b100-am-ui/.claude/mutation-proof/run-mutants.mjs';
const EXIT_NOT_MEASURED = 2;

const G = 'owner-language-guard';

const MUTANTS = [
  // decide.mjs
  ['la re-entrada (stop_hook_active) vuelve a bloquear', `${G}/decide.mjs`, 'if (stopHookActive === true) return { block: false };', 'if (false) return { block: false };'],
  ['un solo marcador inglés alcanza para bloquear', `${G}/decide.mjs`, 'export const MIN_ENGLISH_MARKERS = 2;', 'export const MIN_ENGLISH_MARKERS = 1;'],
  ['hacen falta tres marcadores ingleses', `${G}/decide.mjs`, 'export const MIN_ENGLISH_MARKERS = 2;', 'export const MIN_ENGLISH_MARKERS = 3;'],
  ['la proporción baja a 0,3', `${G}/decide.mjs`, 'export const ENGLISH_SHARE = 0.6;', 'export const ENGLISH_SHARE = 0.3;'],
  ['la proporción sube a 0,9', `${G}/decide.mjs`, 'export const ENGLISH_SHARE = 0.6;', 'export const ENGLISH_SHARE = 0.9;'],
  ['la proporción deja de exigirse', `${G}/decide.mjs`, '&& english >= ENGLISH_SHARE * (english + spanish)', ''],

  // prose.mjs
  ['el código entre ``` se juzga como prosa', `${G}/prose.mjs`, 'insideFence = !insideFence;', 'insideFence = false;'],
  ['las citas en bloque (>) se juzgan como prosa', `${G}/prose.mjs`, "if (trimmed.startsWith('>')) continue;", "if (false) continue;"],
  ['las comillas latinas no se descartan', `${G}/prose.mjs`, "  ['«', '»'],\n", ''],
  ['las comillas tipográficas no se descartan', `${G}/prose.mjs`, "  ['“', '”'],\n", ''],
  ['las comillas rectas no se descartan', `${G}/prose.mjs`, "  ['\"', '\"']\n", "  ['#', '#']\n"],
  ['el código en línea no se descarta', `${G}/prose.mjs`, "  ['`', '`'],\n", ''],
  ['los apóstrofos tipográficos no se normalizan', `${G}/prose.mjs`, "(APOSTROPHES.has(ch) ? \"'\" : ch)", 'ch'],

  // language.mjs
  ['las tildes y la ñ dejan de contar como español', `${G}/language.mjs`, 'SPANISH_MARKERS.has(word) || hasSpanishLetter(word)', 'SPANISH_MARKERS.has(word)'],
  ['los verbos de progreso dejan de contar como inglés', `${G}/language.mjs`, "  'checking', 'running', 'launching', 'looking', 'reading', 'fixing', 'verifying', 'integrating', 'waiting',\n", ''],

  // turn.mjs
  ['un tool_result corta el turno', `${G}/turn.mjs`, " && !isToolResultEntry(entry.message?.content)", ''],
  ['un prompt de subagente corta el turno', `${G}/turn.mjs`, "entry?.type === 'user' && entry.isSidechain !== true", "entry?.type === 'user'"],
  ['el tráfico de subagentes se juzga', `${G}/turn.mjs`, "if (entry?.type !== 'assistant' || entry.isSidechain === true || isSynthetic(entry)) return [];", "if (entry?.type !== 'assistant' || isSynthetic(entry)) return [];"],
  ['el modelo <synthetic> se juzga', `${G}/turn.mjs`, "entry.message?.model === '<synthetic>' || ", ''],
  ['isApiErrorMessage se juzga', `${G}/turn.mjs`, " || entry.isApiErrorMessage === true", ''],
  ['cualquier bloque con texto se juzga', `${G}/turn.mjs`, "block?.type === 'text' && ", ''],
  ['la ventana nunca se agranda', `${G}/turn.mjs`, 'if (result.complete || window >= size || window >= MAX_WINDOW) return result;', 'return result;'],

  // evaluate.mjs
  ['se juzga cualquier evento, no solo Stop', `${G}/evaluate.mjs`, 'if (payload.hook_event_name !== GUARDED_EVENT) return { verdict: { block: false }, problems };', ''],
  ['evaluate ignora stop_hook_active', `${G}/evaluate.mjs`, 'if (payload.stop_hook_active === true) return { verdict: { block: false }, problems };', ''],
  ['el último mensaje nunca se suma', `${G}/evaluate.mjs`, "if (texts.join('\\n').includes(lastMessage.trim())) return texts;", 'return texts;'],
  ['un payload sin evento no se registra', `${G}/evaluate.mjs`, "problems: ['el payload no trae hook_event_name']", 'problems: []'],

  // guard.mjs
  ['el CLI bloquea siempre', `${G}/guard.mjs`, 'if (!verdict.block) return undefined;', 'if (false) return undefined;'],
  ['el CLI no registra el payload ilegible', `${G}/guard.mjs`, 'log(`payload ilegible, se deja pasar:', 'String(`payload ilegible, se deja pasar:'],
  ['el CLI no imprime el bloqueo', `${G}/guard.mjs`, 'if (output !== undefined) process.stdout.write(JSON.stringify(output));', ''],
  ['el CLI no corre como proceso principal', `${G}/guard.mjs`, 'if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {', 'if (false) {']
];

if (!existsSync(RUNNER)) {
  console.error(`NO MEDIDO — no está el runner compartido en ${RUNNER}`);
  process.exit(EXIT_NOT_MEASURED);
}

const { runMutants } = await import(pathToFileURL(RUNNER).href);

const survivors = runMutants({
  fleetRoot: path.resolve(import.meta.dirname, '..'),
  paths: [G],
  selftest: `${G}/selftest.mjs`,
  mutants: MUTANTS,
  timeoutMs: 120_000
});

process.exit(survivors === 0 ? 0 : 1);
