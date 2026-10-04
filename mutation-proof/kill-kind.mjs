/**
 * Decides HOW a failed selftest run went red: because a check it carries reported a wrong decision
 * (ASSERTION), or because the mutated code threw and the selftest never got to check anything (CRASH).
 *
 * A crash proves the mutated line was reached, not that a check decides it, so the two are different
 * evidence and the runner reports them apart. The signals, each measured on Node 22:
 * - an UNCAUGHT throw ends the process with a `Node.js v<version>` trailer on stderr, which a selftest that
 *   catches and reports a failure never prints;
 * - a stack-frame line (`    at ...`) on stderr is a trace even without the trailer;
 * - a non-zero exit that printed nothing reported no check at all;
 * - an uncaught `AssertionError` is the exception: `node:assert` IS the check, so it stays an ASSERTION.
 *
 * @es Decide CÓMO se puso rojo un selftest: porque un check reportó una decisión errónea (ASERCIÓN), o
 * porque el código mutado lanzó y el selftest nunca llegó a comprobar nada (CRASH). Un crash prueba que se
 * alcanzó la línea, no que un check la decida; por eso se informan aparte. Señales: el pie `Node.js v<versión>`
 * de un throw sin capturar, una línea de traza `    at ...` en stderr, y una salida no cero sin ninguna
 * salida. Un `AssertionError` sin capturar sigue siendo ASERCIÓN: `node:assert` ES el check.
 */

const FATAL_TRAILER = /^Node\.js v\d/m;
const STACK_FRAME = /^\s+at \S/m;
const ASSERTION_ERROR = /^AssertionError\b/m;
const THROWN_ERROR_LINE = /^(?:[A-Z][A-Za-z]*)?Error\b.*$/m;

/**
 * @param run A `spawnSync` result of a selftest.
 * @returns `{ kind: 'none' }` for an exit 0, `{ kind: 'assertion' }`, or `{ kind: 'crash', firstLine }`
 *   where `firstLine` names the thrown error (or says that nothing was printed).
 * @es `none` si salió con 0, `assertion`, o `crash` con la primera línea del error lanzado.
 */
export function classifyKill(run) {
  if (run.status === 0) return { kind: 'none' };

  const stdout = run.stdout ?? '';
  const stderr = run.stderr ?? '';

  if (stdout.trim().length === 0 && stderr.trim().length === 0) return { kind: 'crash', firstLine: 'no output: the selftest reported no check before exiting @es sin salida: el selftest no reportó ningún check' };
  if (ASSERTION_ERROR.test(stderr)) return { kind: 'assertion' };
  if (!FATAL_TRAILER.test(stderr) && !STACK_FRAME.test(stderr)) return { kind: 'assertion' };

  return { kind: 'crash', firstLine: thrownLineOf(stderr) };
}

/** The line that names the error, not the source excerpt Node prints above it. @es La línea que nombra el error. */
function thrownLineOf(stderr) {
  const named = stderr.match(THROWN_ERROR_LINE);

  if (named !== null) return named[0].trimEnd();

  return stderr.split('\n').find((line) => line.trim().length > 0)?.trimEnd() ?? '';
}
