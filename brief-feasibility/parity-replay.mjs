/**
 * A command worker-git-guard refused, written into a delegation brief and judged by brief-feasibility, for the
 * parity proof (`worker-git.selftest.mjs`, through `decision-recorder.mjs`). Two placements: a fenced block (any
 * one-line command) and an inline code span (a command with no backtick, which a span cannot hold).
 *
 * The user home it reads is one that does not exist, so no settings file adds a deny rule: the answer is the
 * worker-git face alone.
 *
 * @es Un comando que worker-git-guard rechazó, escrito en un brief de delegación y juzgado por brief-feasibility, para
 * la prueba de paridad. Dos colocaciones: un bloque cercado y un span de código en línea (si no lleva comillas
 * invertidas). El home que lee no existe, así que ningún fichero de ajustes añade una regla deny.
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { briefOf } from '../brief-provenance/provenance.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { FACES, inspectFeasibility } from './feasibility.mjs';

/** A user home that holds no settings. @es Un home de usuario sin ajustes. */
const NO_HOME = join(tmpdir(), 'brief-feasibility-parity-replay-no-home');

/** Whether brief-feasibility refuses `text`, sent from `cwd`, on the worker-git face. @es Si brief-feasibility rechaza `text` por la cara worker-git. */
function refusedOnWorkerGit(text, cwd) {
  const payload = { ...payloadFor('Agent', text, { sessionId: 'parity-replay' }), cwd };
  const refusal = inspectFeasibility(briefOf(payload), payload, { processCwd: cwd, home: NO_HOME });

  return (refusal?.findings ?? []).some((finding) => finding.face === FACES.WORKER_GIT_REFUSED);
}

/**
 * `{ fenced, span }`: whether the command is refused in a fenced block and in an inline span (`null` when it holds a
 * backtick and cannot be put in one).
 * @es Si el comando se rechaza en un bloque cercado y en un span en línea (`null` si lleva una comilla invertida).
 */
export function replayInBrief(script, cwd) {
  return {
    fenced: refusedOnWorkerGit(`Do this step:\n\`\`\`\n${script}\n\`\`\``, cwd),
    span: script.includes('`') ? null : refusedOnWorkerGit(`Then: \`${script}\`.`, cwd)
  };
}
