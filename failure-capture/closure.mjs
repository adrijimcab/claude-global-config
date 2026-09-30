/**
 * What may CLOSE a recurring lesson — the half of `promote` that decides whether a repeat has been made
 * impossible, rather than merely written down.
 *
 * THE RULING THIS ENCODES. The owner's standing directive (`~/.claude/CLAUDE.md`, "STOP THE LINE ON THE
 * SECOND OCCURRENCE") holds that promotion into contract text no longer closes an incident: closing
 * requires a mechanism that makes the repeat impossible, or a written reason why no mechanism is
 * possible. It was ruled on measurement — `measurement-failure-is-not-a-zero` recurred an EIGHTH time
 * with its rule already promoted into both contract files and anchored in the parity gate — and task
 * #127 asked for exactly this decision about the loop's escalation. So a closure is one of two things,
 * never neither and never both:
 *
 *   --mechanism <path>       a guard or gate that EXISTS, whose `selftest.mjs` beside it is RUN here and
 *                            seen to exit 0, and whose file or selftest names the lesson key, so the link
 *                            between the lesson and what now enforces it is inspectable on disk.
 *   --no-mechanism "<why>"   the reason no mechanism is possible, recorded VERBATIM in the incident log
 *                            and in the ledger stub, where the next reader can contest it.
 *
 * WHY THE SELFTEST IS A SIBLING, and never a path the caller supplies. A caller-chosen proof could be
 * any script that exits 0. The fleet keeps each guard's discrimination proof beside it, so the proof is
 * DERIVED from the mechanism, not asserted about it. Two spellings are derived, in this order, because
 * the fleet really uses both: `<module>.selftest.mjs` beside a mechanism that shares its directory with
 * other mechanisms (`fleet-env/reap.mjs` -> `fleet-env/reap.selftest.mjs`), and `selftest.mjs` for a
 * mechanism that owns its directory (`cherry-pick-guard/guard.mjs`). Where the module-named proof
 * EXISTS it is THE proof and there is no fallback: otherwise a red one could be closed over by the
 * directory's, which is proof-shopping — the same defect as choosing your own selftest, reached from
 * inside. The cost is stated: a guard whose proof is named neither way cannot close a lesson until it
 * ships one.
 *
 * WHY THE KEY MUST APPEAR. Without it, any green selftest in the fleet would close any lesson — a
 * mechanism unrelated to the repeat it is cited against. The same literal-token check `promote` already
 * applies to contract files, applied to the mechanism.
 *
 * NO REGEX (M5): `includes`, `startsWith`, `===` and `trim` on literals.
 *
 * @es Qué puede CERRAR una lección recurrente: la mitad de `promote` que decide si la repetición se ha
 * vuelto imposible y no sólo se ha escrito. La directiva de parar la línea dictaminó, con medición, que
 * promover a texto de contrato ya no cierra un incidente; cerrar exige un mecanismo que haga imposible la
 * repetición o un motivo escrito de por qué no cabe ninguno. Un cierre es una de dos cosas, nunca ninguna
 * y nunca ambas: `--mechanism <ruta>` (existe, su `selftest.mjs` hermano se EJECUTA y sale 0, y nombra la
 * clave) o `--no-mechanism "<motivo>"` (registrado LITERAL). El selftest es el HERMANO y no una ruta del
 * llamante, porque una prueba elegida por quien llama podría ser cualquier script que salga 0.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** The flag naming a mechanism. @es La bandera que nombra un mecanismo. */
export const MECHANISM_FLAG = '--mechanism';

/** The flag recording why no mechanism is possible. @es La bandera que registra por qué no cabe mecanismo. */
export const NO_MECHANISM_FLAG = '--no-mechanism';

/** The shortest reason accepted — the same floor `dismiss` applies, for the same reason. @es El motivo más corto aceptado. */
export const MINIMUM_REASON_LENGTH = 25;

/** How long a mechanism's selftest may run before the attempt is abandoned as unmeasured. @es Cuánto puede tardar el selftest. */
const SELFTEST_TIMEOUT_MS = 600_000;

/** The proof file every fleet guard keeps beside itself. @es El fichero de prueba que cada guard guarda a su lado. */
const SELFTEST_NAME = 'selftest.mjs';

/** The refusal text naming both ways to close, used wherever a closure is missing or malformed. @es La negativa que nombra las dos formas de cerrar. */
function bothOptions() {
  return [
    `Close it with ONE of:`,
    `  ${MECHANISM_FLAG} <path>        a guard/gate that makes the repeat impossible; its ${SELFTEST_NAME} is run and must pass,`,
    '                                and the guard or its selftest must name the lesson key',
    `  ${NO_MECHANISM_FLAG} "<reason>"  why no mechanism is possible (${MINIMUM_REASON_LENGTH}+ chars), recorded verbatim`,
  ];
}

/**
 * The closure the arguments ask for: `{ kind: 'mechanism', path }`, `{ kind: 'no-mechanism', reason }`,
 * or `{ kind: 'refused', problems }` naming what is wrong and both ways to fix it.
 * @es El cierre que piden los argumentos, o una negativa que nombra el problema y las dos salidas.
 */
export function readClosure(args) {
  const mechanism = args?.mechanism;
  const reason = args?.['no-mechanism'];

  if (mechanism === undefined && reason === undefined) {
    return { kind: 'refused', problems: ['a recurring lesson cannot be closed on contract text alone (owner directive: STOP THE LINE ON THE SECOND OCCURRENCE)', ...bothOptions()] };
  }

  if (mechanism !== undefined && reason !== undefined) {
    return { kind: 'refused', problems: [`give ${MECHANISM_FLAG} or ${NO_MECHANISM_FLAG}, not both: a lesson is closed by a mechanism OR by a reason none is possible`, ...bothOptions()] };
  }

  if (mechanism !== undefined) {
    if (typeof mechanism !== 'string' || mechanism.trim().length === 0) return { kind: 'refused', problems: [`${MECHANISM_FLAG} needs a path`, ...bothOptions()] };

    return { kind: 'mechanism', path: mechanism.trim() };
  }

  if (typeof reason !== 'string' || reason.trim().length < MINIMUM_REASON_LENGTH) {
    return { kind: 'refused', problems: [`${NO_MECHANISM_FLAG} needs a reason of ${MINIMUM_REASON_LENGTH}+ characters saying WHY no mechanism is possible`, ...bothOptions()] };
  }

  // Verbatim means verbatim, so the reason is never reflowed — and a ledger entry is ONE line whose
  // trailing marker is how the loop finds it again, so a line break would orphan the lesson instead.
  // @es Literal es literal, así que el motivo no se reformatea; y una entrada del ledger es UNA línea cuyo
  // marcador final es como el loop la encuentra, así que un salto de línea la dejaría huérfana.
  if (reason.includes('\n') || reason.includes('\r')) return { kind: 'refused', problems: [`${NO_MECHANISM_FLAG} must be one line: it is written verbatim into a one-line ledger entry`, ...bothOptions()] };

  return { kind: 'no-mechanism', reason };
}

/** `~/…` against `home`, anything else against `repoRoot`. @es `~/…` contra `home`, lo demás contra `repoRoot`. */
function resolveMechanism(mechanismPath, { repoRoot, home }) {
  const posix = mechanismPath.split('\\').join('/');

  if (posix.startsWith('~/')) return path.join(home, ...posix.slice(2).split('/'));

  return path.isAbsolute(mechanismPath) ? mechanismPath : path.join(repoRoot, ...posix.split('/'));
}

/**
 * Whether the named mechanism really closes `key`: it exists, its sibling selftest exists, the selftest
 * RUNS and exits 0, and the mechanism or its selftest names the key. Returns `{ ok: true, selftest,
 * selftestExit }` or `{ ok: false, problem }`. A selftest killed or unable to start is a measurement
 * that did not happen, never a pass and never a verdict about the mechanism.
 * @es Si el mecanismo nombrado cierra de verdad `key`: existe, tiene selftest hermano, éste CORRE y sale
 * 0, y el mecanismo o su selftest nombran la clave. Un selftest matado o que no arranca es una medición
 * que no ocurrió: nunca un pase.
 */
export function verifyMechanism({ mechanismPath, key, repoRoot, home }) {
  const absolute = resolveMechanism(mechanismPath, { repoRoot, home });

  if (!existsSync(absolute)) return { ok: false, problem: `the mechanism ${mechanismPath} does not exist (resolved to ${absolute})` };

  const isDirectory = statSync(absolute).isDirectory();
  const directory = isDirectory ? absolute : path.dirname(absolute);
  const moduleNamed = isDirectory ? undefined : path.join(directory, `${path.basename(absolute, path.extname(absolute))}.${SELFTEST_NAME}`);
  const selftest = moduleNamed !== undefined && existsSync(moduleNamed) ? moduleNamed : path.join(directory, SELFTEST_NAME);

  if (!existsSync(selftest)) return { ok: false, problem: `the mechanism ${mechanismPath} has no selftest beside it (${moduleNamed ?? path.join(directory, SELFTEST_NAME)} or ${path.join(directory, SELFTEST_NAME)}), so nothing shows it decides correctly` };

  const named = [absolute, selftest].some((file) => statSync(file).isFile() && readFileSync(file, 'utf8').includes(key));

  if (!named) return { ok: false, problem: `the mechanism ${mechanismPath} never names "${key}" in its source or its selftest, so nothing ties it to this lesson` };

  try {
    execFileSync(process.execPath, [selftest], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: SELFTEST_TIMEOUT_MS });
  } catch (error) {
    const status = typeof error?.status === 'number' ? error.status : undefined;
    const output = `${error?.stdout ?? ''}${error?.stderr ?? ''}`.trim().split('\n').slice(-5).join(' | ');

    if (status === undefined) return { ok: false, problem: `the selftest of ${mechanismPath} did not finish (${error instanceof Error ? error.message : String(error)}) — a killed run is not a verdict, and not a pass` };

    return { ok: false, problem: `the selftest of ${mechanismPath} exited ${status}: ${output}` };
  }

  return { ok: true, selftest, selftestExit: 0 };
}

/** The durable record of a closure, appended to the incident log. @es El registro durable de un cierre. */
export function closureRecord({ key, closure, verification, target, tokenCount }) {
  // `tokenCount` is how many times the contract text named this key AT THIS CLOSURE. It is what makes
  // the next promotion able to tell "the text grew to cover the new face" from "the same paragraph is
  // being re-promoted over a lesson it already failed to prevent"
  // (`promotion-to-contract-read-as-prevention`). @es Cuántas veces nombraba el texto a esta clave EN
  // ESTE CIERRE: es lo que permite distinguir un texto que creció de uno que se repromociona igual.
  const base = { kind: 'promotion', key, target, tokenCount, date: new Date().toISOString().slice(0, 10), at: new Date().toISOString() };

  return closure.kind === 'mechanism'
    ? { ...base, closure: { mechanism: closure.path, selftestExit: verification.selftestExit } }
    : { ...base, closure: { noMechanism: closure.reason } };
}

/** How the ledger stub states the closure, in one clause. @es Cómo el muñón del ledger enuncia el cierre. */
export function closureClause(closure) {
  return closure.kind === 'mechanism'
    ? `closed by mechanism ${closure.path} (selftest run, exit 0)`
    : `no mechanism is possible: ${closure.reason}`;
}
