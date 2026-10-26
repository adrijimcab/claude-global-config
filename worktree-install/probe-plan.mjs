/**
 * The PROBE a project's own test runner must pass before a junctioned worktree is accepted for it: which
 * runner, which command, and which trivial spec file, derived from the project profile
 * (`project-profile/profile.mjs`, the one stack detector) and never from a second detection.
 *
 * WHY THE PROJECT'S REAL RUNNER, and not a Vitest assumption. The measured failure is Vite's: its dev server
 * refuses to serve a file whose realpath lies outside the project. Vitest is one Vite consumer; Angular's
 * `application` builder and its `@angular/build:unit-test` runner are others, and a Karma build reads files
 * through webpack instead. Which of them a junction breaks is a property of the runner the project really
 * uses, so the probe is that runner, invoked the way the project invokes it (`ng test` for an Angular
 * workspace, whatever builder its `test` target names), with coverage on, because coverage is what loaded the
 * module Vite refused.
 *
 * WHAT IT DOES NOT GUESS. A builder or runner this module has no measured invocation for gives NO probe, and
 * no probe means no junction: the own install needs no proof. A project with several runners and none chosen
 * (`vitest` beside `jest`) is ambiguous, never resolved by picking one.
 *
 * PURE: a profile in, a plan out. Running it is `probe-run.mjs`.
 *
 * @es La SONDA que el runner de tests del propio proyecto debe pasar antes de aceptar un worktree con
 * junction: qué runner, qué comando y qué spec trivial, derivados del perfil del proyecto (el único detector
 * de stack) y nunca de una segunda detección. El runner REAL del proyecto y no una suposición de Vitest: el
 * fallo medido es de Vite, y Vite lo usan Vitest, el builder `application` de Angular y su runner
 * `unit-test`; Karma lee por webpack. Qué rompe una junction depende del runner que el proyecto usa de
 * verdad, así que la sonda es ese runner, invocado como lo invoca el proyecto, con cobertura. Un builder o
 * runner sin invocación medida no da sonda, y sin sonda no hay junction. Varios runners sin elegido es
 * ambiguo, nunca se elige uno. PURO.
 */

/** The probe spec's base name; one name, so a leftover is recognisable. @es Nombre base del spec de la sonda. */
export const PROBE_BASENAME = 'worktree-install-probe';

/** The two probe sources: the green one passes, the red one must fail. @es Las dos fuentes de la sonda. */
export const PROBE_KINDS = Object.freeze(['red', 'green']);

/** A plan for `ng test` through the project's own `test` builder. @es Un plan para `ng test`. */
const ngPlan = (coverageFlag, file) => ({
  ok: true,
  runner: 'ng',
  package: '@angular/cli',
  bin: 'ng',
  args: ['test', '--watch=false', coverageFlag, `--include=${file}`],
  file,
  style: 'globals'
});

/**
 * The Angular plan for the builder the `test` target names, or why there is none. Each supported builder is
 * named by its suffix, so `@angular-devkit/build-angular:karma` and `@angular/build:karma` read the same.
 * @es El plan de Angular según el builder del target `test`, o por qué no lo hay.
 */
function angularPlan(builder, typescript) {
  if (typeof builder !== 'string') return { ok: false, reason: 'no-test-target' };

  // Angular compiles specs from `src/`, and only TypeScript ones: a `.mjs` probe would never be included.
  const file = `src/${PROBE_BASENAME}.spec.ts`;

  if (typescript === undefined) return { ok: false, reason: 'no-typescript', detail: builder };
  if (builder.endsWith(':karma')) return ngPlan('--code-coverage', file);
  if (builder.endsWith(':unit-test')) return ngPlan('--coverage', file);

  return { ok: false, reason: 'unmeasured-builder', detail: builder };
}

/**
 * The one runner a profile's runner list names: Jasmine beside Karma is Karma's assertion library, not a second
 * runner (the same reading as `gates-kit/toolchain-for.mjs`).
 * @es El único runner que nombra la lista del perfil; Jasmine junto a Karma no es un segundo runner.
 */
export function runnerOf(testRunners) {
  const list = Array.isArray(testRunners) ? testRunners.filter((id) => typeof id === 'string' && id !== '') : [];
  const real = list.includes('karma') ? list.filter((id) => id !== 'jasmine') : list;

  if (real.length === 0) return { ok: false, reason: 'no-test-runner' };
  if (real.length > 1) return { ok: false, reason: 'ambiguous-test-runner', detail: real.join('+') };

  return { ok: true, runner: real[0] };
}

/**
 * The probe plan for `profile`, or `{ ok: false, reason, detail? }` when no probe can be run.
 *
 * A plan is `{ runner, package, bin, args, file, style }`: `package`/`bin` name the executable as the
 * package's own `bin` entry (run with node, never a `.cmd` shim), `args` the arguments, `file` the probe spec
 * relative to the project root, `style` whether the spec uses globals or imports its API.
 * @es El plan de sonda para `profile`, o `{ ok: false, reason }` si no se puede sondear.
 */
export function probePlanFor(profile) {
  if (profile === undefined || profile === null) return { ok: false, reason: 'no-project' };

  if (profile.framework === 'angular') return angularPlan(profile.angular?.test, profile.typescript);

  const chosen = runnerOf(profile.testRunners);

  if (!chosen.ok) return chosen;

  const extension = profile.typescript === undefined ? 'mjs' : 'ts';
  const file = `${PROBE_BASENAME}.spec.${extension}`;

  if (chosen.runner === 'vitest') {
    return { ok: true, runner: 'vitest', package: 'vitest', bin: 'vitest', args: ['run', '--coverage.enabled=true', file], file, style: 'vitest-import' };
  }

  if (chosen.runner === 'jest') {
    return { ok: true, runner: 'jest', package: 'jest', bin: 'jest', args: ['--coverage', '--runTestsByPath', file], file, style: 'globals' };
  }

  return { ok: false, reason: 'unmeasured-runner', detail: chosen.runner };
}

/**
 * The identity of a plan for the verdict cache: a change of runner or command makes a recorded verdict about
 * another probe, so it is part of the key. `undefined` when there is no plan.
 * @es La identidad de un plan para la caché: cambiar de runner o comando invalida el veredicto.
 */
export function planKeyOf(plan) {
  return plan?.ok === true ? [plan.runner, plan.package, plan.bin, ...plan.args].join(' ') : `no-probe:${String(plan?.reason)}`;
}

/**
 * The probe spec's source: one assertion that holds (`green`) or that must fail (`red`).
 * @es La fuente del spec de la sonda: una aserción que se cumple (`green`) o que debe fallar (`red`).
 */
export function probeSource(plan, kind) {
  if (!PROBE_KINDS.includes(kind)) throw new Error(`unknown probe kind ${String(kind)} @es tipo de sonda desconocido ${String(kind)}`);

  const expected = kind === 'green' ? 2 : 3;
  const header = plan.style === 'vitest-import' ? "import { describe, expect, it } from 'vitest';\n\n" : '';

  return `${header}describe('worktree-install probe', () => {\n  it('runs through this worktree\\'s dependency tree', () => {\n    expect(1 + 1).toBe(${expected});\n  });\n});\n`;
}
