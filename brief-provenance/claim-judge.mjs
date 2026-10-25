/**
 * The CLAIM JUDGE of the dependency-claim face: one haiku question, asked through the judge-gate model path
 * (`../judge-gate/model.mjs` `askModel`, `../judge-gate/verdict.mjs` `readVerdict`), and only for the claim units
 * the lexical prefilter (`dependency-claim.mjs`) could not decide. The question: does a unit assert how a named
 * dependency BEHAVES at runtime without citing where that was read? A run receipt, a version read or prose that
 * uses the name as an ordinary word is no such claim.
 *
 * WHY A MODEL. Every phrase-based answer to that question was bypassed by one token: "… and they exit 0", a
 * backticked claim, a version beside package.json. Telling a behaviour claim from a receipt is meaning, which a
 * scan cannot hold and a model can, at about one haiku call per delegation that names a dependency.
 *
 * FAILS OPEN, NEVER SILENT. A model error, a timeout or an answer that is no rubric verdict decides nothing: the
 * caller allows the brief and journals the reason as undecided.
 *
 * @es El JUEZ DE AFIRMACIONES de la cara de dependencias: una pregunta a haiku por la vía de modelo de
 * judge-gate, solo para las unidades que el prefiltro léxico no pudo decidir. La pregunta: ¿afirma la unidad
 * cómo SE COMPORTA en ejecución una dependencia nombrada sin citar dónde se leyó? Un recibo de ejecución, una
 * versión leída o prosa que usa el nombre como palabra corriente no lo es. POR QUÉ UN MODELO: cada respuesta por
 * frases se esquivó con un token. FALLA ABIERTO SIN CALLAR: un error, un timeout o una respuesta que no es
 * veredicto no deciden; quien llama permite y registra el motivo como no decidido.
 */

import { askModel } from '../judge-gate/model.mjs';
import { readVerdict } from '../judge-gate/verdict.mjs';

/** The marker every block reason starts with. @es La marca con que empieza todo motivo de bloqueo. */
export const MARKER = 'DEPENDENCY-CLAIM:';

/** How long the model may take, inside the hook's own budget. @es Cuánto puede tardar el modelo, dentro del presupuesto del hook. */
export const ASK_TIMEOUT_MS = 30000;

/** The rubric. `$CLAIMS` is replaced by the numbered claim units. @es La rúbrica; `$CLAIMS` se sustituye por las unidades numeradas. */
export const PROMPT = [
  'dependency-claim rubric v1.',
  'A delegation brief marks claims as MEASURED: facts its author says were measured. Each claim below names a third-party package the project depends on (listed after it).',
  'Question: does ANY claim assert how a named package BEHAVES at runtime (what it does, closes, retries, ignores, handles, returns, sends) without citing where that was read (a file:line of its source)?',
  '',
  'Rules:',
  '1. A behaviour claim with no source citation fails, whatever it carries beside it: an exit code, a command in backticks, a version or the word package.json do not make a behaviour claim measured.',
  '2. Not a behaviour claim, so it passes: the receipt of a run (a command and its exit code or output counts), a version or range read from a manifest, a count or a file list, and prose where the package name is an ordinary word ("we ignore the generated folder").',
  '3. A claim in any language is judged the same way.',
  '4. When unsure whether a claim asserts behaviour, answer {"ok": true}.',
  '',
  'Examples that FAIL:',
  '- "MEASURED: Playwright closes its children on SIGTERM" (playwright)',
  '- "MEASURED: Playwright closes its children on SIGTERM and they exit 0" (playwright)',
  '- "MEASURED: `playwright` closes its children on SIGTERM" (playwright)',
  '- "MEASURED: playwright 1.58.0 in package.json closes its children on SIGTERM" (playwright)',
  '- "MEASURED: Playwright cierra sus procesos hijos al recibir SIGTERM" (playwright)',
  'Examples that PASS:',
  '- "MEASURED: npx eslint src exit 0" (eslint)',
  '- "MEASURED: typescript ~5.8.0 in package.json" (typescript)',
  '- "MEASURED: `npx vitest run src/x.spec.ts` terminó con código 0, 14 tests pasaron" (vitest)',
  '',
  'Claims:',
  '$CLAIMS',
  '',
  'Answer with the JSON object only: {"ok": true}, or {"ok": false, "reason": "<reason>"}. The reason starts with DEPENDENCY-CLAIM: then quotes the failing claim and names the behaviour it asserts.'
].join('\n');

/** The rubric with `candidates` numbered in. @es La rúbrica con las candidatas numeradas. */
export function promptFor(candidates) {
  const claims = candidates.map(({ unit, packages }, index) => `${index + 1}. ${unit} (${packages.join(', ')})`).join('\n');

  return PROMPT.replace('$CLAIMS', () => claims);
}

/** The default question: the judge-gate model path with this face's timeout. @es La pregunta por defecto: la vía de modelo de judge-gate. */
export const defaultAsk = (prompt) => askModel(prompt, { timeoutMs: ASK_TIMEOUT_MS });

/**
 * Asks the judge about `candidates` through `ask`.
 *
 * @returns `{ kind: 'pass' }`, `{ kind: 'block', reason }` or `{ kind: 'undecided', why }` — never throws.
 * @es Pregunta al juez por las candidatas; devuelve pase, bloqueo o no decidido, nunca lanza.
 */
export async function judgeCandidates(candidates, ask = defaultAsk) {
  let answer;

  try {
    ({ answer } = await ask(promptFor(candidates)));
  } catch (error) {
    return { kind: 'undecided', why: `the claim judge could not be asked: ${error instanceof Error ? error.message : String(error)}` };
  }

  const verdict = readVerdict(String(answer), MARKER);

  return verdict.kind === 'malfunction' ? { kind: 'undecided', why: `the claim judge gave no verdict: ${verdict.why}` } : verdict;
}
