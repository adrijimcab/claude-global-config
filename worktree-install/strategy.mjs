/**
 * HOW a linked worktree gets its dependencies: its OWN install (the default, correct by construction) or a
 * junction to the main checkout's tree (an optimisation, accepted per project only once a probe has PROVEN it).
 *
 * WHY THE DEFAULT IS THE OWN INSTALL, measured. A junctioned `node_modules` makes every package's realpath lie
 * OUTSIDE the worktree, and a Vite dev server refuses to serve a file whose realpath is outside its allow list.
 * On b100-am-ui that turned a green suite red: 5899 of 5899 specs passed and `test:all` still exited 1 with
 * "Failed to fetch dynamically imported module …/@vitest/coverage-v8/browser"; the same tree with the
 * worktree's own `npm ci` landed. Reproduced on 2026-10-26 with real Vite 7.3.7 (`fixtures/serve-probe.mjs`):
 * from a junctioned worktree `@vitest/coverage-v8/browser` resolves to `<main>/node_modules/…/browser.js` and
 * the dev server answers 403; from the worktree's own install it resolves inside the worktree and answers 200.
 * An own install is the tree every runner assumes, so it needs no proof; the junction does.
 *
 * WHAT THIS DECIDES, in one sentence: given the identity of the project as it is now (its lockfile's hash and
 * the probe its runner implies) and the verdict recorded for it, which strategy a new worktree gets. It is pure.
 *
 *   - no lockfile                  -> own install, nothing to probe (no reproducible identity to cache against)
 *   - the worktree locks another tree than the main checkout -> own install (a junction would hand it the
 *                                     main checkout's packages for a lockfile that asks for others)
 *   - no verdict for this project  -> own install, PROBE (the junction is unproven)
 *   - lockfile or runner changed   -> own install, PROBE (the recorded verdict is about another tree)
 *   - verdict PASS                 -> junction
 *   - any other verdict            -> own install (a failed, timed-out or unrunnable probe is never a pass)
 *
 * HARD-LINK COPIES ARE NOT A THIRD STRATEGY, deliberately. A hard link shares the inode, so a package manager
 * or a postinstall that rewrites a file IN PLACE in the worktree rewrites the main checkout's copy too: the
 * isolation would be the junction's hazard with a less visible shape.
 *
 * @es CÓMO recibe sus dependencias un worktree enlazado: su PROPIA instalación (por defecto, correcta por
 * construcción) o una junction al árbol del checkout principal (una optimización que se acepta por proyecto
 * solo cuando una sonda la ha PROBADO). Medido: con `node_modules` enlazado, el realpath de cada paquete queda
 * FUERA del worktree y el servidor de Vite se niega a servirlo; en b100-am-ui 5899 de 5899 specs pasaban y
 * `test:all` salía con 1 («Failed to fetch dynamically imported module …/@vitest/coverage-v8/browser»), y el
 * mismo árbol con su propio `npm ci` aterrizó. Reproducido el 2026-10-26 con Vite 7.3.7 real: 403 desde la
 * junction, 200 desde la instalación propia. Esto decide, de forma pura, qué estrategia recibe un worktree
 * según la identidad actual del proyecto (hash del lockfile y sonda que implica su runner) y el veredicto
 * registrado. Las copias por hard link NO son una tercera estrategia: comparten inodo, así que reescribir un
 * fichero en el worktree reescribe el del checkout principal.
 */

/** The two strategies. @es Las dos estrategias. */
export const INSTALL_STRATEGY = Object.freeze({ OWN: 'own-install', JUNCTION: 'junction' });

/**
 * What a probe run can conclude. Only PASS accepts the junction.
 * @es Lo que puede concluir una sonda. Solo PASS acepta la junction.
 */
export const PROBE_VERDICT = Object.freeze({
  /** The red probe failed and the green one passed: the runner really ran the probe, through the junction. @es La roja falló y la verde pasó. */
  PASS: 'pass',
  /** The runner ran the probe and the green probe still failed through the junction. @es La verde falló a través de la junction. */
  FAIL: 'fail',
  /** The runner could not be started, or a red probe passed (so the probe never really ran). @es No se pudo medir. */
  COULD_NOT_RUN: 'could-not-run',
  /** A run hit its ceiling. A hang is not a pass. @es Una corrida agotó su tope. */
  TIMEOUT: 'timeout',
  /** The project's runner implies no probe this module knows how to run. @es El runner no admite sonda conocida. */
  NO_PROBE: 'no-probe'
});

/**
 * The strategy for a project whose current identity is `identity`, given the verdict `recorded` for it.
 *
 * @param identity `{ projectKey, lockfileHash, planKey }` of the project now, or `undefined` when it has no
 *   lockfile.
 * @param recorded The recorded verdict `{ projectKey, lockfileHash, planKey, verdict }`, or `undefined`.
 * @param worktreeLockfileHash The hash of the WORKTREE's own lockfile, when a worktree is being decided for;
 *   `undefined` asks about the project alone.
 * @returns `{ strategy, reason, needsProbe }`.
 * @es La estrategia de un proyecto cuya identidad actual es `identity`, dado su veredicto registrado.
 */
export function decideStrategy(identity, recorded, worktreeLockfileHash) {
  if (identity === undefined) return { strategy: INSTALL_STRATEGY.OWN, reason: 'no-lockfile', needsProbe: false };

  if (worktreeLockfileHash !== undefined && worktreeLockfileHash !== identity.lockfileHash) {
    return { strategy: INSTALL_STRATEGY.OWN, reason: 'worktree-lockfile-differs', needsProbe: false };
  }

  if (recorded === undefined || recorded.projectKey !== identity.projectKey) {
    return { strategy: INSTALL_STRATEGY.OWN, reason: 'unproven', needsProbe: true };
  }

  if (recorded.lockfileHash !== identity.lockfileHash) return { strategy: INSTALL_STRATEGY.OWN, reason: 'lockfile-changed', needsProbe: true };

  if (recorded.planKey !== identity.planKey) return { strategy: INSTALL_STRATEGY.OWN, reason: 'runner-changed', needsProbe: true };

  if (recorded.verdict === PROBE_VERDICT.PASS) return { strategy: INSTALL_STRATEGY.JUNCTION, reason: 'proven', needsProbe: false };

  return { strategy: INSTALL_STRATEGY.OWN, reason: `probe-${String(recorded.verdict)}`, needsProbe: false };
}

/**
 * The verdict of one probe from its two runs: the RED probe (an assertion that must fail) and the GREEN one.
 *
 * THE RED RUN IS WHAT MAKES THE GREEN ONE MEAN SOMETHING. A runner configured with `passWithNoTests`, or one
 * whose include globs never match the probe file, exits 0 without having run it; that zero would read exactly
 * like a pass. Requiring the red probe to FAIL first proves the runner executes the probe file, so the green
 * probe's exit 0 is a measurement and not an absence (`measurement-failure-is-not-a-zero`).
 *
 * Each run is `{ status, signal, error, timedOut }` as `probe-run.mjs` reports it.
 * @es El veredicto de una sonda a partir de sus dos corridas: la ROJA (una aserción que debe fallar) y la
 * VERDE. La roja es lo que hace que la verde signifique algo: un runner con `passWithNoTests`, o cuyos globs no
 * incluyen la sonda, sale con 0 sin ejecutarla, y ese cero parecería un aprobado.
 */
export function classifyProbe(red, green) {
  const runs = [red, green];

  if (runs.some((run) => run === undefined || run.error !== undefined)) return PROBE_VERDICT.COULD_NOT_RUN;
  if (runs.some((run) => run.timedOut === true)) return PROBE_VERDICT.TIMEOUT;
  if (runs.some((run) => run.signal !== null && run.signal !== undefined)) return PROBE_VERDICT.COULD_NOT_RUN;
  if (red.status === 0) return PROBE_VERDICT.COULD_NOT_RUN;
  if (typeof red.status !== 'number') return PROBE_VERDICT.COULD_NOT_RUN;

  return green.status === 0 ? PROBE_VERDICT.PASS : PROBE_VERDICT.FAIL;
}

/**
 * The command of the worktree's own install for a profile's package manager, or why there is none here.
 *
 * Only npm is MEASURED (`npm ci` landed the tree the junction broke), so only npm is run automatically; the
 * other managers return their frozen-lockfile command as advice. `ci` and not `install`: the own install must
 * reproduce the lockfile exactly, which is the point of not sharing a tree, and it must never rewrite it.
 * @es El comando de la instalación propia según el gestor del perfil, o por qué no la hay aquí. Solo npm está
 * MEDIDO, así que solo npm se ejecuta; los demás devuelven su comando como consejo. `ci` y no `install`: debe
 * reproducir el lockfile exacto y no reescribirlo nunca.
 */
export function ownInstallFor(profile) {
  const manager = profile?.packageManager;

  if (manager === 'npm') return { ok: true, manager, args: ['ci', '--no-audit', '--no-fund'] };

  const advice = { pnpm: 'pnpm install --frozen-lockfile', yarn: 'yarn install --immutable', bun: 'bun install --frozen-lockfile' }[manager];

  if (advice === undefined) return { ok: false, reason: 'no-package-manager', manager };

  return { ok: false, reason: 'unmeasured-manager', manager, advice };
}
