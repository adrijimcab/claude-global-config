/**
 * The three Stop judges the gate runs, each with the rubric it owns in its own folder (`../premise-judge/prompt.mjs`,
 * `../voice-judge/prompt.mjs`, `../pending-judge/prompt.mjs`, the single source of every rubric), its marker, its
 * mechanism and its timeouts, and the exact command `settings.json` wires for it.
 *
 * LOADED BY NAME, ON DEMAND. `loadJudge(name)` imports only the modules of that judge. Each judge runs in its own
 * hook process (`run.mjs <name>`), so a judge whose module chain cannot load (a syntax error, a missing file) is that
 * judge's malfunction only: the other judges never import it and still run.
 *
 * @es Los tres jueces de Stop que corre la compuerta, cada uno con la rúbrica que es de su carpeta (la única fuente
 * de cada rúbrica), su marca, su mecanismo, sus timeouts y el comando exacto que `settings.json` cablea. SE CARGAN
 * POR NOMBRE, A DEMANDA: `loadJudge(name)` importa solo los módulos de ese juez. Cada juez corre en su propio
 * proceso de hook, así que un juez cuya cadena de módulos no carga es un fallo solo de ese juez: los demás nunca
 * la importan y siguen corriendo.
 *
 * EACH JUDGE HAS A MODE, from `modes.json`: `live` (its blocks hold the turn) or `shadow` (it is asked and its
 * verdicts are recorded, but a block is recorded as `shadow-block` and never printed, `gate.mjs`). The file is the
 * owner's decision, written by hand, one entry per judge; a judge whose mode is missing or unknown, or a file that
 * cannot be read, is that judge's load failure, so it is logged as a malfunction and never guessed.
 * @es CADA JUEZ TIENE UN MODO, de `modes.json`: `live` (sus bloqueos retienen el turno) o `shadow` (se le pregunta y
 * se registran sus veredictos, pero un bloqueo se registra como `shadow-block` y nunca se imprime). El fichero es la
 * decisión del dueño, escrita a mano, una entrada por juez; un juez sin modo o con un modo desconocido, o un fichero
 * ilegible, es un fallo de carga de ese juez: se registra como fallo y nunca se adivina.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The seconds of the hook timeout kept free after the model call gives up, so the gate can still log and pass.
 * @es Los segundos del timeout del hook que quedan libres tras rendirse la llamada al modelo.
 */
const HEADROOM_SECONDS = 5;

const judge = (name, mechanism, marker, prompt, timeoutSeconds, extra = {}) => ({ name, mechanism, marker, prompt, timeoutSeconds, askTimeoutMs: (timeoutSeconds - HEADROOM_SECONDS) * 1000, ...extra });

/** The judges' names, in wiring order. @es Los nombres de los jueces, en el orden del cableado. */
export const JUDGE_NAMES = Object.freeze(['premise', 'voice', 'pending']);

/**
 * How a judge's module is imported: relative to this file. A seam, so a selftest can break one judge's chain.
 * @es Cómo se importa un módulo de un juez: relativo a este fichero. Un punto de inyección para romper una cadena.
 */
export const importJudgeModule = (specifier) => import(specifier);

/** The modes a judge may run in. @es Los modos en que puede correr un juez. */
export const MODES = Object.freeze(['live', 'shadow']);

/** Where the owner's modes live. @es Donde viven los modos del dueño. */
export const MODES_PATH = fileURLToPath(new URL('./modes.json', import.meta.url));

/** The modes record on disk; throws when it cannot be read. @es El registro de modos en disco; lanza si no se puede leer. */
export const readModes = () => JSON.parse(readFileSync(MODES_PATH, 'utf8'));

/** The mode `modes` gives the judge `name`; throws for a missing or unknown one. @es El modo que `modes` da al juez `name`. */
export function modeOf(name, modes) {
  const mode = modes !== null && typeof modes === 'object' && Object.hasOwn(modes, name) ? modes[name] : undefined;

  if (!MODES.includes(mode)) {
    throw new Error(`the ${name} judge has no valid mode in modes.json (got ${JSON.stringify(mode)}, known: ${MODES.join(', ')}) @es el juez ${name} no tiene un modo válido en modes.json (vino ${JSON.stringify(mode)}, conocidos: ${MODES.join(', ')})`);
  }

  return mode;
}

/** Each judge built from its own modules only. @es Cada juez construido solo con sus propios módulos. */
const LOADERS = {
  premise: async (load) => {
    const { MARKER, PROMPT, TIMEOUT_SECONDS } = await load('../premise-judge/prompt.mjs');

    return judge('premise', 'premise-judge', MARKER, PROMPT, TIMEOUT_SECONDS);
  },
  voice: async (load) => {
    const { MARKER, PROMPT, TIMEOUT_SECONDS } = await load('../voice-judge/prompt.mjs');

    return judge('voice', 'voice-judge', MARKER, PROMPT, TIMEOUT_SECONDS);
  },
  // Asked only when the lexical prefilter finds a marker, the turn saved nothing and was not dismissed; its turn
  // window moves on every stop, and an unavailable model falls back to the lexical block.
  // @es Se consulta solo si el prefiltro léxico halla un marcador, el turno no guardó nada y no fue descartado; su
  // ventana se mueve en toda parada, y un modelo no disponible cae al bloqueo léxico.
  pending: async (load) => {
    const [{ MARKER, PROMPT, TIMEOUT_SECONDS }, { prefilter }, { appendix }, { unavailableBlock }, { advanceTurnWindow }] = await Promise.all([
      load('../pending-judge/prompt.mjs'),
      load('../pending-judge/prefilter.mjs'),
      load('../pending-judge/appendix.mjs'),
      load('../pending-judge/fallback.mjs'),
      load('../backlog-guard/turn-window.mjs'),
    ]);

    return judge('pending', 'pending-judge', MARKER, PROMPT, TIMEOUT_SECONDS, { prefilter, appendix, fallback: unavailableBlock, observe: advanceTurnWindow });
  },
};

/**
 * The judge `name` with its mode, or `undefined` for a name that is no judge; rejects when the judge's modules cannot
 * load or its mode cannot be read. `importModule` and `modes` are seams for the selftest.
 * @es El juez `name` con su modo, o `undefined` si el nombre no es de un juez; rechaza si sus módulos no cargan o
 * su modo no se puede leer. `importModule` y `modes` son puntos de inyección del selftest.
 */
export async function loadJudge(name, { importModule = importJudgeModule, modes = readModes } = {}) {
  if (!Object.hasOwn(LOADERS, name)) return undefined;

  const loaded = await LOADERS[name](importModule);

  return { ...loaded, mode: modeOf(name, modes()) };
}

/**
 * Every judge by name, for the selftests that check the wiring; `options` go to each `loadJudge`.
 * @es Todos los jueces por nombre, para los selftests del cableado; `options` va a cada `loadJudge`.
 */
export async function loadJudges(options = {}) {
  return Object.fromEntries(await Promise.all(JUDGE_NAMES.map(async (name) => [name, await loadJudge(name, options)])));
}

/** The command `settings.json` wires for the judge `name`. @es El comando que `settings.json` cablea para `name`. */
export const hookCommand = (name) => `node "$HOME/.claude/judge-gate/run.mjs" ${name}`;
