/**
 * A scratch machine with the 2026-09-17 incident's topology, built for the selftest's SURFACE cases.
 *
 * WHY IT IS BUILT AND NOT READ. The surface cases used to name the real `plugin-eslint` and
 * `plugin-stylelint` checkouts and assert that the hook AGREED with whatever `tenancyOf` measured there.
 * Agreement never reddens, but it cannot discriminate either: measured 2026-09-22 on a sandbox copy, with
 * those two checkouts holding their own trees (or absent, as on any other machine) the selftest stayed
 * 70/70 over a guard mutated to never emit its refusal — the kill existed only while this machine's
 * plugins happened to be junction farms. A proof whose power depends on live state is the fourth face of
 * `guard-that-cannot-go-red`, reached from the side that cannot go red rather than the side that reddens.
 *
 * WHAT IS BUILT. Under one temporary root: `main`, whose `node_modules` is its own tree; `plugin-eslint`
 * and `plugin-stylelint`, per-entry junction FARMS into `main/node_modules` (the incident); and
 * `linked-checkout`, whose `node_modules` is itself a junction into it (the other foreign shape). Each is
 * a real git repository with an empty `core.excludesFile`, so it is a checkout in the same sense the
 * incident's were and nothing of the host leaks in — although tenancy is read from the filesystem alone
 * and never consults git. `verify` re-measures every tenancy with the real probe, so a fixture that
 * failed to build is a named failure rather than a silent allow.
 *
 * SAFE TO REMOVE BY CONSTRUCTION. Every junction target lies inside the same root, so no removal can
 * reach a tree outside it; `dispose` unlinks the junctions first all the same, so nothing is ever deleted
 * THROUGH one — the operation that destroyed this machine's shared tree twice.
 *
 * @es Una máquina de prueba con la topología del incidente del 2026-09-17, CONSTRUIDA para los casos de
 * SURFACE. Antes se leían los plugins reales y se exigía acuerdo: nunca enrojecía, pero tampoco
 * discriminaba (medido: 70/70 sobre un guard mutado cuando los plugins tenían árbol propio). Todos los
 * destinos de junction viven bajo la misma raíz, y `dispose` desenlaza los junctions antes de borrar.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { TENANCY, tenancyOf } from '../toolchain-guard/tree-tenancy.mjs';

/** The packages every tree holds: enough for a farm to be a farm. @es Los paquetes de cada árbol. */
const PACKAGES = ['typescript', 'jiti'];

const forward = (target) => target.split(path.sep).join('/');

/** A real git repository with no host excludes. @es Un repositorio git real sin exclusiones del host. */
function checkout(directory, noExcludes) {
  mkdirSync(directory, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: directory, stdio: 'ignore' });
  execFileSync('git', ['config', 'core.excludesFile', noExcludes], { cwd: directory, stdio: 'ignore' });
}

/**
 * Builds the machine.
 * @returns `{ main, pluginEslint, pluginStylelint, linkedCheckout, expected, verify, dispose }` — paths in
 *   forward-slash spelling, as a brief writes them; `expected` maps each to the tenancy it was built with.
 * @es Construye la máquina y devuelve sus rutas, la tenencia esperada de cada una, `verify` y `dispose`.
 */
export function buildIncidentMachine() {
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'brief-tenancy-machine-')));
  const noExcludes = path.join(root, 'no-excludes');
  const at = (name) => path.join(root, name);
  const junctions = [];
  const junction = (target, link) => {
    symlinkSync(target, link, 'junction');
    junctions.push(link);
  };

  writeFileSync(noExcludes, '');

  checkout(at('main'), noExcludes);
  for (const name of PACKAGES) mkdirSync(path.join(at('main'), 'node_modules', name), { recursive: true });

  for (const plugin of ['plugin-eslint', 'plugin-stylelint']) {
    checkout(at(plugin), noExcludes);
    mkdirSync(path.join(at(plugin), 'node_modules'));
    for (const name of PACKAGES) junction(path.join(at('main'), 'node_modules', name), path.join(at(plugin), 'node_modules', name));
  }

  checkout(at('linked-checkout'), noExcludes);
  junction(path.join(at('main'), 'node_modules'), path.join(at('linked-checkout'), 'node_modules'));

  const machine = {
    main: forward(at('main')),
    pluginEslint: forward(at('plugin-eslint')),
    pluginStylelint: forward(at('plugin-stylelint')),
    linkedCheckout: forward(at('linked-checkout'))
  };
  const expected = {
    [machine.main]: TENANCY.OWN,
    [machine.pluginEslint]: TENANCY.FARM,
    [machine.pluginStylelint]: TENANCY.FARM,
    [machine.linkedCheckout]: TENANCY.LINKED
  };

  return {
    ...machine,
    expected,
    /** Every checkout whose REAL tenancy is not what it was built as, e.g. `plugin-eslint: own`. */
    verify: () =>
      Object.entries(expected)
        .map(([checkoutPath, state]) => ({ checkoutPath, state, measured: tenancyOf(checkoutPath).state }))
        .filter(({ state, measured }) => state !== measured)
        .map(({ checkoutPath, state, measured }) => `${path.basename(checkoutPath)}: built as ${state}, measured ${measured}`),
    dispose() {
      for (const link of junctions) unlinkSync(link);
      rmSync(root, { recursive: true, force: true });
    }
  };
}
