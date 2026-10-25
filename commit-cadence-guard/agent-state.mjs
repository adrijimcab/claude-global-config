/**
 * The per-agent state of the commit-cadence guard: one small JSON file per agent under the mechanism's state
 * directory (`agents/<id>.json`), resolved only through the hook-state port. It holds what must survive between
 * two tool calls of the same agent: when the agent first appeared, the worktree it was found working in, and the
 * last git measurement (when, and when its oldest held change started), so git is asked at most once per window.
 *
 * Reads never throw (an unreadable or corrupt file is a fresh agent, which can only make the guard more lenient);
 * writes go through a temporary file and a rename so a reader never sees half a file. `rotate.mjs` archives the
 * directory while no session lives.
 *
 * @es El estado por agente de la guardia: un JSON pequeño por agente bajo el directorio de estado del mecanismo,
 * resuelto solo por el puerto de hook-state. Guarda lo que debe sobrevivir entre dos llamadas del mismo agente:
 * cuándo apareció, el worktree donde se lo encontró y la última medición de git, así git se consulta una vez por
 * ventana como máximo. Leer nunca lanza (un fichero ilegible es un agente nuevo, que solo hace a la guardia más
 * permisiva); escribir pasa por un temporal y un rename. `rotate.mjs` archiva el directorio sin sesiones vivas.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { tryParsePayload } from '../hook-io/hook-io.mjs';
import { stateDir } from '../hook-state/locations.mjs';

/** The mechanism's state directory, through the hook-state port. @es El directorio de estado del mecanismo, por el puerto de hook-state. */
export const mechanismStateDir = () => stateDir('commit-cadence-guard');

const AGENTS_FOLDER = 'agents';

const isKeyCharacter = (character) => (character >= '0' && character <= '9') || (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || character === '-' || character === '_';

/**
 * The key an agent id is stored under, or `undefined` when the id is not a plain name (it could climb out of the
 * directory). @es La clave bajo la que se guarda un id de agente, o `undefined` si no es un nombre simple.
 */
export function stateKey(agentId) {
  if (typeof agentId !== 'string' || agentId === '' || agentId.length > 128) return undefined;

  return [...agentId].every(isKeyCharacter) ? agentId : undefined;
}

const fileFor = (key) => path.join(mechanismStateDir(), AGENTS_FOLDER, `${key}.json`);

/** The stored state of an agent, or `undefined`. @es El estado guardado de un agente, o `undefined`. */
export function readAgentState(key) {
  try {
    const state = tryParsePayload(readFileSync(fileFor(key), 'utf8'));

    return state !== null && typeof state === 'object' ? state : undefined;
  } catch {
    return undefined;
  }
}

/** Stores the state of an agent; throws on a write failure, the caller journals it. @es Guarda el estado; lanza si falla la escritura. */
export function writeAgentState(key, state) {
  const target = fileFor(key);
  const temporary = `${target}.${process.pid}.tmp`;

  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(temporary, JSON.stringify(state), 'utf8');
  renameSync(temporary, target);
}
