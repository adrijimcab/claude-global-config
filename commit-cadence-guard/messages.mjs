/**
 * The two texts of the commit-cadence guard: the NOTICE at the first window and the REFUSAL at the second. Each is
 * English first, then the neutral-Spanish mirror marked `@es`, and each names the age, the paths and the exact
 * command that fixes it.
 *
 * @es Los dos textos de la guardia de cadencia de commits: el AVISO de la primera ventana y la NEGATIVA de la
 * segunda. Cada uno va en inglés y luego su espejo en español neutro marcado `@es`, y cada uno nombra la edad,
 * las rutas y el comando exacto que lo arregla.
 */

import { ALLOWED_GIT_SUBCOMMANDS } from './refusal-allowance.mjs';

/** The most paths a message lists before it says how many more there are. @es El máximo de rutas que lista un mensaje. */
const MAX_LISTED = 8;

const MS_PER_MINUTE = 60_000;

const minutesOf = (ms) => Math.floor(ms / MS_PER_MINUTE);

function listing(held, now) {
  const shown = held.slice(0, MAX_LISTED).map((one) => `  - ${one.path} (${minutesOf(now - one.sinceMs)} min)`);
  const hidden = held.length - shown.length;

  return hidden > 0 ? [...shown, `  - ... +${hidden} more / +${hidden} más`] : shown;
}

const commitCommand = (held) => `git commit -m "<msg>" -- ${held.slice(0, MAX_LISTED).map((one) => one.path).join(' ')}`;

/**
 * The notice that goes in as context before the agent's call.
 * @es El aviso que entra como contexto antes de la llamada del agente.
 */
export function noticeText({ held, now, config }) {
  const age = minutesOf(now - held[0].sinceMs);

  return [
    `COMMIT-CADENCE NOTICE: you have held uncommitted work for ${age} minutes (notice at ${minutesOf(config.noticeMs)}, tool calls are refused at ${minutesOf(config.refuseMs)}).`,
    ...listing(held, now),
    `Commit now (git add any new file first): ${commitCommand(held)}`,
    'WHY. Work held only in a working directory is lost when the agent stops and is invisible to anything that reads the branch.',
    '',
    `@es AVISO DE CADENCIA DE COMMITS: llevas ${age} minutos con trabajo sin commitear (aviso a los ${minutesOf(config.noticeMs)}, se rechazan las llamadas a los ${minutesOf(config.refuseMs)}).`,
    ...listing(held, now),
    `Commitea ahora (primero git add de cada archivo nuevo): ${commitCommand(held)}`,
    'POR QUÉ. El trabajo que solo vive en el directorio de trabajo se pierde cuando el agente para y es invisible para todo lo que lee la rama.'
  ].join('\n');
}

/**
 * The refusal that denies a call, saying exactly how to unblock.
 * @es La negativa que rechaza una llamada, diciendo exactamente cómo desbloquear.
 */
export function refusalText({ held, now, config, toolName }) {
  const age = minutesOf(now - held[0].sinceMs);
  const allowed = ALLOWED_GIT_SUBCOMMANDS.join(', ');

  return [
    `COMMIT-CADENCE GUARD REFUSED ${toolName}: you have held uncommitted work for ${age} minutes (limit ${minutesOf(config.refuseMs)}).`,
    ...listing(held, now),
    'TO UNBLOCK: commit, then carry on. The age resets the moment a commit lands.',
    `  git add <each new file>`,
    `  ${commitCommand(held)}`,
    `Still allowed while this holds: Read, Grep, Glob, and shell lines made only of cd and git ${allowed}. If the commit itself keeps failing (a red gate that needs edits), report that blocker with SubagentHandback instead of working around it.`,
    '',
    `@es COMMIT-CADENCE GUARD RECHAZÓ ${toolName}: llevas ${age} minutos con trabajo sin commitear (límite ${minutesOf(config.refuseMs)}).`,
    ...listing(held, now),
    'PARA DESBLOQUEAR: commitea y sigue. La edad se reinicia en cuanto aterriza un commit.',
    '  git add <cada archivo nuevo>',
    `  ${commitCommand(held)}`,
    `Sigue permitido mientras rige: Read, Grep, Glob y líneas de shell hechas solo de cd y git ${allowed}. Si el propio commit sigue fallando (un gate rojo que pide ediciones), informa ese bloqueo con SubagentHandback en vez de rodearlo.`
  ].join('\n');
}
