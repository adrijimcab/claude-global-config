/**
 * Which files a mutants campaign MUTATES, read from the campaign itself and not guessed from its text.
 *
 * A campaign names its mutants as `[label, file, original, replacement]`, usually through constants
 * (`const S = 'baseline-record/summary.mjs'`), sometimes through a wrapper (`runCampaign`) that adds its own
 * folder, so no reading of the source can say which files they land on. The `paths` of a campaign do not say
 * it either: they are the folders COPIED into each sandbox so the selftest can run, and `mutation-proof` alone
 * is copied by about half of them. The only honest answer is the one the campaign computes when it runs.
 *
 * So the planner RUNS the campaign in a child process with the mutants runner swapped, at module resolution,
 * for a stand-in that writes its options (the root and the files of every mutant) to a file and returns 0
 * without mutating anything. The swap catches ANY copy of the runner (`mutation-proof/`, `fleet-kit/vendor/`,
 * a wrapper's import), so no runner is edited and none is run. A campaign that cannot be planned is a PROBLEM
 * the caller must show, never an empty plan: an unplanned campaign would read as "mutates nothing".
 *
 * ONE FILE, TWO ROLES. Imported normally it is this API. Started as `--import` of the child, and only then
 * (`PLAN_FILE_ENV` is set), it registers its own `resolve` hook; the hook runs in a worker where the same file
 * is evaluated again, so the registration is guarded by `isMainThread`.
 *
 * Copied byte for byte between `b100-am-ui/.claude/mutation-proof/` (the owner) and `~/.claude/mutation-proof/`.
 *
 * @es Qué ficheros MUTA una campaña de mutantes, leído de la campaña misma y no adivinado de su texto. Los
 * `paths` no lo dicen: son las carpetas COPIADAS al sandbox para que corra el selftest, y la mitad copia
 * `mutation-proof`. La única respuesta honesta es la que la campaña calcula al correr. El planificador CORRE la
 * campaña en un hijo con el corredor sustituido, al resolver módulos, por un doble que escribe sus opciones en un
 * fichero y devuelve 0 sin mutar nada; no edita ni ejecuta ningún corredor. Una campaña que no se puede
 * planificar es un PROBLEMA que el llamador debe mostrar, nunca un plan vacío. UN FICHERO, DOS PAPELES: importado
 * es la API; arrancado con `--import` del hijo (solo si `PLAN_FILE_ENV` existe) registra su propio hook.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';

/** The file the runner is called in every copy of the repositories. @es El nombre del corredor en todas las copias. */
const RUNNER_FILE = 'run-mutants.mjs';

/** The environment variable that tells the child where to write its plan. @es La variable que dice al hijo dónde escribir su plan. */
const PLAN_FILE_ENV = 'MUTATION_PROOF_PLAN_FILE';

/** What a campaign may print on stderr while it is planned; its stdout is discarded, the plan travels in a file. @es Lo que una campaña puede escribir en stderr; su stdout se descarta. */
const STDERR_LIMIT_BYTES = 16 * 1024 * 1024;

/** How long one campaign may take to plan: building its constants takes well under a second. @es Cuánto puede tardar en planificarse una campaña. */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * True for a mutants campaign by NAME: `mutants.mjs`, `<name>.mutants.mjs` and `<name>-mutants.mjs` (the
 * repositories hold all three). The runner shares the last spelling and is the one file that is not a campaign.
 * @param {string} file a path with `/` separators
 * @es Verdadero para una campaña de mutantes por NOMBRE; el corredor comparte la última grafía y no es campaña.
 */
export function isCampaignFile(file) {
  const name = path.posix.basename(file);

  if (name === RUNNER_FILE) return false;

  return name === 'mutants.mjs' || name.endsWith('.mutants.mjs') || name.endsWith('-mutants.mjs');
}

/** The module that stands in for the runner: it records the plan of each call and mutates nothing. @es El módulo que sustituye al corredor. */
function standInSource() {
  return `import { appendFileSync } from 'node:fs';
export function runMutants(options) {
  appendFileSync(process.env[${JSON.stringify(PLAN_FILE_ENV)}], JSON.stringify({ fleetRoot: options.fleetRoot, files: options.mutants.map((mutant) => mutant[1]) }) + '\\n');
  return 0;
}
`;
}

/** Resolution hook: whatever import names the runner, in whichever copy, gets the stand-in. @es Hook de resolución: cualquier import del corredor recibe el doble. */
export async function resolve(specifier, context, nextResolve) {
  if (path.posix.basename(specifier) === RUNNER_FILE) return { url: `data:text/javascript,${encodeURIComponent(standInSource())}`, shortCircuit: true };

  return nextResolve(specifier, context);
}

if (process.env[PLAN_FILE_ENV] !== undefined && isMainThread) register(import.meta.url);

/** The first non-empty line of a child's stderr that says what went wrong. @es La primera línea de stderr que dice qué falló. */
function firstErrorLine(stderr) {
  const lines = stderr.split('\n').filter((line) => line.trim().length > 0);

  return lines.find((line) => /^[A-Za-z]*Error\b/.test(line.trim())) ?? lines[0] ?? 'no error output';
}

/** What the child wrote, one plan per call of the runner. @es Lo que escribió el hijo, un plan por llamada al corredor. */
function plansWritten(planFile) {
  if (!existsSync(planFile)) return [];

  return readFileSync(planFile, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

/**
 * Plans one campaign.
 * @param {{ root: string, campaign: string, timeoutMs?: number }} options `campaign` is relative to `root`
 * @returns {{ targets: string[], problems: string[] }} the files the campaign mutates, relative to `root`, sorted
 *   and unique; or why that could not be measured. @es Los ficheros que muta la campaña, o por qué no se pudo medir.
 */
export function planCampaign({ root, campaign, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const directory = mkdtempSync(path.join(tmpdir(), 'mutation-plan-'));
  const planFile = path.join(directory, 'plan.jsonl');

  try {
    const child = spawnSync(process.execPath, ['--import', pathToFileURL(fileURLToPath(import.meta.url)).href, path.join(root, campaign)], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
      maxBuffer: STDERR_LIMIT_BYTES,
      env: { ...process.env, [PLAN_FILE_ENV]: planFile },
      timeout: timeoutMs
    });

    if (child.error?.code === 'ETIMEDOUT') return { targets: [], problems: [`timed out after ${Math.round(timeoutMs / 1000)}s while planning @es agotó el tiempo al planificar`] };
    if (child.status !== 0) return { targets: [], problems: [`exit ${child.status} while planning: ${child.error?.message ?? firstErrorLine(child.stderr)}`] };

    const plans = plansWritten(planFile);

    if (plans.length === 0) return { targets: [], problems: ['the runner was never called, so the campaign names no mutant @es nunca llamó al corredor'] };

    const targets = plans.flatMap((plan) => plan.files.map((file) => path.relative(root, path.resolve(plan.fleetRoot, file)).split(path.sep).join('/')));

    return { targets: [...new Set(targets)].toSorted(), problems: [] };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
