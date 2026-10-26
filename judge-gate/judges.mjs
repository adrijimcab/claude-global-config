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
 */

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
 * The judge `name`, or `undefined` for a name that is no judge; rejects when the judge's modules cannot load.
 * @es El juez `name`, o `undefined` si el nombre no es de un juez; rechaza si sus módulos no cargan.
 */
export async function loadJudge(name, { importModule = importJudgeModule } = {}) {
  return Object.hasOwn(LOADERS, name) ? LOADERS[name](importModule) : undefined;
}

/** Every judge by name, for the selftests that check the wiring. @es Todos los jueces por nombre, para los selftests del cableado. */
export async function loadJudges() {
  return Object.fromEntries(await Promise.all(JUDGE_NAMES.map(async (name) => [name, await loadJudge(name)])));
}

/** The command `settings.json` wires for the judge `name`. @es El comando que `settings.json` cablea para `name`. */
export const hookCommand = (name) => `node "$HOME/.claude/judge-gate/run.mjs" ${name}`;
