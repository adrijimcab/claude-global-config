/**
 * The two Stop judges the gate runs, each with the rubric it owns in its own folder (`../premise-judge/prompt.mjs`,
 * `../voice-judge/prompt.mjs`, the single source of every rubric), its marker, its mechanism and its timeouts,
 * and the exact command `settings.json` wires for it.
 *
 * @es Los dos jueces de Stop que corre la compuerta, cada uno con la rúbrica que es de su carpeta (la única
 * fuente de cada rúbrica), su marca, su mecanismo, sus timeouts y el comando exacto que `settings.json` cablea.
 */

import { MARKER as PREMISE_MARKER, PROMPT as PREMISE_PROMPT, TIMEOUT_SECONDS as PREMISE_TIMEOUT } from '../premise-judge/prompt.mjs';
import { MARKER as VOICE_MARKER, PROMPT as VOICE_PROMPT, TIMEOUT_SECONDS as VOICE_TIMEOUT } from '../voice-judge/prompt.mjs';

/**
 * The seconds of the hook timeout kept free after the model call gives up, so the gate can still log and pass.
 * @es Los segundos del timeout del hook que quedan libres tras rendirse la llamada al modelo.
 */
const HEADROOM_SECONDS = 5;

const judge = (name, mechanism, marker, prompt, timeoutSeconds) => ({ name, mechanism, marker, prompt, timeoutSeconds, askTimeoutMs: (timeoutSeconds - HEADROOM_SECONDS) * 1000 });

/** The judges by name. @es Los jueces por nombre. */
export const JUDGES = {
  premise: judge('premise', 'premise-judge', PREMISE_MARKER, PREMISE_PROMPT, PREMISE_TIMEOUT),
  voice: judge('voice', 'voice-judge', VOICE_MARKER, VOICE_PROMPT, VOICE_TIMEOUT),
};

/** The command `settings.json` wires for the judge `name`. @es El comando que `settings.json` cablea para `name`. */
export const hookCommand = (name) => `node "$HOME/.claude/judge-gate/run.mjs" ${name}`;
