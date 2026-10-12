/**
 * The pointer a starting worker receives, from its `SubagentStart` payload: find the project, find its contract
 * files, say so, and add the route rule. Always returns text, because the route rule applies to every worker
 * whether or not its project declares a contract.
 *
 * The payload fields used are the ones measured from a real `SubagentStart` (`fixtures/subagent-start.json`):
 * `cwd`, plus `CLAUDE_PROJECT_DIR` from the environment. `agent_type` and `agent_id` are not needed: the
 * pointer is the same for a fresh worker, a resumed one and an `Explore` agent, which is the point.
 *
 * @es El puntero que recibe un worker al arrancar, a partir de su payload `SubagentStart`: encuentra el
 * proyecto, encuentra sus ficheros de contrato, lo dice y agrega la regla de ruta. Siempre devuelve texto,
 * porque la regla de ruta rige para todo worker declare o no su proyecto un contrato. Se usan los campos
 * medidos de un `SubagentStart` real (`fixtures/subagent-start.json`): `cwd`, y `CLAUDE_PROJECT_DIR` del
 * entorno. `agent_type` y `agent_id` no hacen falta: el puntero es igual para un worker nuevo, uno
 * reanudado y un agente `Explore`, que es el punto.
 */

import path from 'node:path';

import { ANCHORS_FILE } from '../agent-contract-parity/anchors-file.mjs';
import { projectRootFor, searchStarts } from '../agent-contract-parity/project-root.mjs';
import { CLAUDE_MD_CANDIDATES, contractLocations } from './contract-locations.mjs';
import { pointerText } from './pointer-text.mjs';

/** The markers that identify a project root, strongest first. @es Los marcadores que identifican la raíz de un proyecto, el más fuerte primero. */
const ROOT_MARKERS = [ANCHORS_FILE, ...CLAUDE_MD_CANDIDATES];

/**
 * @param {object} payload the `SubagentStart` payload / el payload `SubagentStart`
 * @param {Record<string, string | undefined>} env
 * @returns {string} the text to deliver as `additionalContext` / el texto a entregar como `additionalContext`
 */
export function workerPointer(payload, env = process.env) {
  for (const marker of ROOT_MARKERS) {
    const root = projectRootFor(payload, marker, env);

    if (root === undefined) continue;

    const { files } = contractLocations(root);

    if (files.length > 0) return pointerText({ files });
  }

  return pointerText({ files: [], directory: searchStarts(payload, env)[0] ?? path.resolve('.') });
}
