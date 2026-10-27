#!/usr/bin/env node
/**
 * The ONE entry point that gives a linked worktree its dependencies: decide the strategy, prove a junction
 * before accepting it, and otherwise run the worktree's own install. A provisioner (b100-am-ui's
 * `.claude/fleet-env/environment.mjs`) calls the steps it needs; a repository without one runs `provision`.
 *
 *   node worktree-install.mjs decide    --main <checkout> [--worktree <worktree>]
 *   node worktree-install.mjs probe     --main <checkout> --worktree <worktree> [--timeout-ms <n>]
 *   node worktree-install.mjs install   --main <checkout> --worktree <worktree>
 *   node worktree-install.mjs provision --main <checkout> --worktree <worktree> [--timeout-ms <n>]
 *
 * Each prints one JSON object on stdout. Exit 0 when the step did what it says (`decide` always), 1 when it
 * did not (a probe that ran and refused the junction is still exit 0: it measured), 2 on a bad call.
 *
 * `probe` runs against the worktree AS IT IS: the caller has built the junction form first (`provision` builds
 * the kit's own, `link-farm.mjs`). Its verdict is recorded for the project's lockfile and probe, and the
 * decision that follows from it is printed.
 *
 * THE TIMEOUT IS A CEILING ON A HANG, NOT A MEASURED THRESHOLD. Its default (`DEFAULT_PROBE_TIMEOUT_MS`) is not
 * derived from a distribution of probe durations, and it does not need to be: reaching it is a TIMEOUT verdict,
 * which keeps the own install, the strategy that is correct by construction. Too short costs speed, never
 * correctness.
 *
 * @es El ÚNICO punto de entrada que da dependencias a un worktree enlazado: decide la estrategia, prueba una
 * junction antes de aceptarla y, si no, corre la instalación propia. Un aprovisionador llama los pasos que
 * necesita; un repositorio sin él corre `provision`. Cada paso imprime un JSON; sale 0 si hizo lo que dice,
 * 1 si no, 2 ante una llamada inválida. `probe` mide el worktree TAL CUAL (quien llama construyó antes la
 * forma junction). El timeout es un TOPE contra un cuelgue y no un umbral medido: alcanzarlo es un veredicto
 * TIMEOUT, que mantiene la instalación propia, así que quedarse corto cuesta velocidad, nunca corrección.
 */

import path from 'node:path';

import { runWhenMain } from '../hook-io/hook-io.mjs';
import { readProfile } from '../project-profile/profile.mjs';
import { linkFarm, unlinkFarm } from './link-farm.mjs';
import { ownInstall } from './own-install.mjs';
import { planKeyOf, probePlanFor } from './probe-plan.mjs';
import { runProbe } from './probe-run.mjs';
import { decideStrategy, INSTALL_STRATEGY, ownInstallFor } from './strategy.mjs';
import { defaultStoreFile, hashFile, identityOf, readRecorded, recordVerdict } from './verdict-store.mjs';

/** The ceiling of one probe run (see the header: a hang guard, not a threshold). @es Tope de una corrida. */
export const DEFAULT_PROBE_TIMEOUT_MS = 600_000;

/** The same path below another top: `<worktree>/<relative of inside, from main>`. @es La misma ruta bajo otra cima. */
const mapped = (inside, mainTop, worktreeTop) => path.join(worktreeTop, path.relative(mainTop, inside));

/**
 * Everything the steps decide from, read from the MAIN checkout: its profile, the probe plan, the project's
 * identity, the recorded verdict and the decision. `undefined` profile means no JS/TS project.
 * @es Todo aquello de lo que deciden los pasos, leído del checkout PRINCIPAL.
 */
export function situationOf(mainTop, { storeFile = defaultStoreFile(), worktreeTop } = {}) {
  const profile = readProfile(mainTop);

  if (profile === undefined) return { profile, decision: { strategy: INSTALL_STRATEGY.OWN, reason: 'no-project', needsProbe: false } };

  const plan = probePlanFor(profile);
  const identity = identityOf(profile, planKeyOf(plan));
  const recorded = identity === undefined ? undefined : readRecorded(storeFile, identity.projectKey);
  // A worktree with NO lockfile of its own is not a match: `?? 'absent'` keeps it from reading as "not asked".
  const worktreeLockfileHash = worktreeTop === undefined || identity === undefined ? undefined : hashFile(mapped(identity.lockfile, mainTop, worktreeTop)) ?? 'absent';

  return { profile, plan, identity, recorded, decision: decideStrategy(identity, recorded, worktreeLockfileHash), install: ownInstallFor(profile) };
}

/**
 * Runs the probe in the worktree as it is, records the verdict, and returns the situation after it.
 * @es Corre la sonda en el worktree tal cual, registra el veredicto y devuelve la situación resultante.
 */
export function probeAndRecord({ mainTop, worktreeTop, storeFile = defaultStoreFile(), timeoutMs = DEFAULT_PROBE_TIMEOUT_MS, spawn }) {
  const before = situationOf(mainTop, { storeFile, worktreeTop });

  // Never measured from a worktree that locks another tree: its specs could fail for packages the main tree
  // lacks, and that verdict would then be recorded against the main checkout's lockfile.
  if (before.identity === undefined || before.decision.reason === 'worktree-lockfile-differs') return { ...before, probe: undefined };

  const probe = runProbe({ projectRoot: mapped(before.profile.root, mainTop, worktreeTop), plan: before.plan, timeoutMs, ...(spawn === undefined ? {} : { spawn }) });
  const { projectKey, lockfileHash, planKey } = before.identity;

  recordVerdict(storeFile, {
    projectKey,
    lockfileHash,
    planKey,
    verdict: probe.verdict,
    reason: probe.reason,
    red: probe.red === undefined ? undefined : { status: probe.red.status, error: probe.red.error, timedOut: probe.red.timedOut },
    green: probe.green === undefined ? undefined : { status: probe.green.status, error: probe.green.error, timedOut: probe.green.timedOut, tail: probe.green.tail },
    measuredIn: worktreeTop,
    measuredAt: new Date().toISOString()
  });

  return { ...situationOf(mainTop, { storeFile, worktreeTop }), probe };
}

/**
 * The own install in the worktree, in the directory that holds the project's lockfile.
 * @es La instalación propia en el worktree, en el directorio del lockfile del proyecto.
 */
export function installOwn({ mainTop, worktreeTop, situation = situationOf(mainTop, { worktreeTop }), spawn, cli, env }) {
  if (situation.identity === undefined) return { ok: false, reason: situation.profile === undefined ? 'no JS/TS project' : 'the project has no lockfile, so nothing reproducible can be installed' };

  const lockfile = mapped(situation.identity.lockfile, mainTop, worktreeTop);

  return ownInstall({ installDir: path.dirname(lockfile), lockfile, command: situation.install, ...(spawn === undefined ? {} : { spawn }), ...(cli === undefined ? {} : { cli }), ...(env === undefined ? {} : { env }) });
}

/**
 * The whole provisioning for a repository with no provisioner of its own: decide; when unproven, build the
 * kit's junction form, probe it, and keep it only on a PASS; otherwise remove it and install.
 * @es El aprovisionamiento completo para un repositorio sin aprovisionador propio.
 */
export function provision({ mainTop, worktreeTop, storeFile = defaultStoreFile(), timeoutMs = DEFAULT_PROBE_TIMEOUT_MS, spawn, cli, env }) {
  let situation = situationOf(mainTop, { storeFile, worktreeTop });

  if (situation.profile === undefined) return { ok: false, strategy: undefined, reason: 'no JS/TS project' };

  const mainProject = situation.profile.root;
  const worktreeProject = mapped(mainProject, mainTop, worktreeTop);
  const steps = [];

  if (situation.decision.needsProbe || situation.decision.strategy === INSTALL_STRATEGY.JUNCTION) {
    const farm = linkFarm({ mainTop, mainProject, worktreeTop, worktreeProject });

    if (farm.refused !== undefined) return { ok: false, strategy: undefined, reason: farm.refused, decision: situation.decision };

    steps.push(`junction form: ${String(farm.created)} entries linked`);

    if (situation.decision.needsProbe) {
      situation = probeAndRecord({ mainTop, worktreeTop, storeFile, timeoutMs, spawn });
      steps.push(`probe: ${situation.probe?.verdict ?? 'not run'}`);
    }

    if (situation.decision.strategy === INSTALL_STRATEGY.JUNCTION) return { ok: true, strategy: INSTALL_STRATEGY.JUNCTION, decision: situation.decision, steps };

    const removed = unlinkFarm(worktreeProject);

    if (!removed.removed) return { ok: false, strategy: undefined, reason: `the junction form could not be removed: ${removed.kept.join(', ')} are not links`, decision: situation.decision, steps };

    steps.push('junction form removed');
  }

  const installed = installOwn({ mainTop, worktreeTop, situation, spawn, cli, env });

  return { ok: installed.ok, strategy: INSTALL_STRATEGY.OWN, decision: situation.decision, steps, install: installed };
}

/** `--name value` pairs of `argv`, or `undefined` when one is malformed. @es Los pares `--nombre valor`. */
function optionsOf(argv) {
  const options = {};

  for (let at = 0; at < argv.length; at += 2) {
    const [name, value] = [argv[at], argv[at + 1]];

    if (!name.startsWith('--') || value === undefined || value.startsWith('--')) return undefined;

    options[name.slice(2)] = value;
  }

  return options;
}

const USAGE = 'Usage: node worktree-install.mjs <decide|probe|install|provision> --main <checkout> [--worktree <worktree>] [--timeout-ms <n>] @es Uso: node worktree-install.mjs <decide|probe|install|provision> --main <checkout> [--worktree <worktree>] [--timeout-ms <n>]';

/**
 * The CLI; returns the exit code and writes one JSON object (or the usage line).
 * @es La CLI; devuelve el código de salida y escribe un objeto JSON (o el uso).
 */
export function runCli(argv, { write = (line) => process.stdout.write(`${line}\n`), storeFile = defaultStoreFile(), env } = {}) {
  const [step, ...rest] = argv;
  const options = optionsOf(rest);
  const known = new Set(['main', 'worktree', 'timeout-ms']);
  const timeoutMs = options?.['timeout-ms'] === undefined ? DEFAULT_PROBE_TIMEOUT_MS : Number(options['timeout-ms']);
  const needsWorktree = step !== 'decide';

  if (!['decide', 'probe', 'install', 'provision'].includes(step) || options === undefined || Object.keys(options).some((name) => !known.has(name)) || options.main === undefined || (needsWorktree && options.worktree === undefined) || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    write(USAGE);

    return 2;
  }

  const mainTop = path.resolve(options.main);
  const worktreeTop = options.worktree === undefined ? undefined : path.resolve(options.worktree);
  const print = (value) => write(JSON.stringify(value, null, 2));

  if (step === 'decide') {
    const { decision, plan, identity, install } = situationOf(mainTop, { storeFile, worktreeTop });

    print({ decision, plan, identity, install });

    return 0;
  }

  if (step === 'probe') {
    const { decision, probe } = probeAndRecord({ mainTop, worktreeTop, storeFile, timeoutMs });

    print({ decision, probe });

    return probe === undefined ? 1 : 0;
  }

  if (step === 'install') {
    const installed = installOwn({ mainTop, worktreeTop, situation: situationOf(mainTop, { storeFile, worktreeTop }), env });

    print(installed);

    return installed.ok ? 0 : 1;
  }

  const provisioned = provision({ mainTop, worktreeTop, storeFile, timeoutMs, env });

  print(provisioned);

  return provisioned.ok ? 0 : 1;
}

runWhenMain(import.meta.url, () => {
  process.exitCode = runCli(process.argv.slice(2));
});
