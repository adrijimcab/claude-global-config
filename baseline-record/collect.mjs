/**
 * Collects the baseline record: the raw size of the always-loaded sets, the per-guard journal lines, the hook
 * registry counts, the git tip of each in-scope repo, the `git status --porcelain` of every product repo and
 * of the discovery `.claude/` (the before-image for the "this change added no path" check), and the P3b Stop
 * latency measured by `replay.mjs latency`. Everything only READS, and no mutation aggregate is run or
 * recorded (B5). Each figure carries the command that produced it and its exit code; a piece that could not
 * be measured says so (`measured: false`) and `problemsOf` names it, so a record is never complete by silence.
 *
 * @es Recolecta el registro base: el tamaño bruto de los conjuntos siempre cargados, las líneas de journal por
 * guardia, los conteos del registro de hooks, la punta de git de cada repo en alcance, el `git status
 * --porcelain` de cada repo de producto y del `.claude/` de discovery (la imagen previa para la comprobación
 * «este cambio no añadió ninguna ruta») y la latencia de Stop P3b medida con `replay.mjs latency`. Todo SOLO
 * LEE, y no se ejecuta ni se registra ningún agregado de mutación (B5). Cada cifra lleva su comando y su
 * código de salida; lo que no se pudo medir lo dice (`measured: false`) y `problemsOf` lo nombra.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { measureBudgets } from './budget.mjs';
import { journalCounts, registryCounts } from './counts.mjs';
import { dirInventory, gitTip, porcelainOf, productRepos } from './repos.mjs';

/** The Stop latency section: `replay.mjs latency` on the manifest, its command and exit code verbatim. @es La sección de latencia de Stop: `replay.mjs latency` sobre el manifiesto, con su comando y salida. */
function runStopLatency({ replay, manifest, runs, projectsRoot, cwd, repos, timeoutMs }) {
  const args = [replay, 'latency', '--manifest', manifest, '--runs', String(runs), '--projects-root', projectsRoot, '--cwd', cwd, ...repos.flatMap((repo) => ['--repo', `${repo.name}|${repo.worktree}|${repo.gitDir}`])];
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true, timeout: timeoutMs });
  let result;

  try {
    result = JSON.parse(run.stdout ?? '');
  } catch {
    result = undefined;
  }

  return { command: `node ${args.join(' ')}`, exitCode: run.status, measured: run.status === 0 && result !== undefined, result };
}

/** The whole baseline record of one machine. @es El registro base entero de una máquina. */
export function buildRecord({ home, fleet, projectsRoot, b100, discovery, backupGitDir, capture, replay, runs, tmp, now, latencyTimeoutMs }) {
  const scope = [{ name: '~/.claude', worktree: home, gitDir: path.join(home, '.git') }, { name: 'b100-am-ui/.claude', worktree: path.join(b100, '.claude'), gitDir: backupGitDir }];

  return {
    schema: 'baseline-record/v1',
    recordedAt: now(),
    budget: measureBudgets({ capture, project: b100, tmp }),
    journals: journalCounts(home),
    registry: registryCounts(home),
    tips: scope.map(gitTip),
    productRepos: productRepos(projectsRoot).map((repo) => porcelainOf(repo)),
    discoveryClaude: { porcelain: porcelainOf({ name: 'di_1700002_discovery_fe/.claude/', dir: discovery, pathspec: '.claude/' }), inventory: dirInventory(path.join(discovery, '.claude')) },
    stopLatency: runStopLatency({ replay, manifest: path.join(fleet, 'hook-dispatch', 'manifests', 'stop.json'), runs, projectsRoot: path.join(home, 'projects'), cwd: home, repos: scope, timeoutMs: latencyTimeoutMs })
  };
}

/** The pieces of `record` that were not measured, in section order; empty means complete. @es Las piezas de `record` no medidas, en orden de sección; vacío significa completo. */
export function problemsOf(record) {
  return [
    ...(record.budget.global.measured ? [] : ['budget-global']),
    ...(record.budget.project.measured ? [] : ['budget-project']),
    ...(record.registry.settings === 'unreadable' ? ['registry-settings'] : []),
    ...record.tips.filter((tip) => tip.tip === undefined).map((tip) => `tip:${tip.name}`),
    ...record.productRepos.filter((repo) => !repo.measured).map((repo) => `repo:${repo.name}`),
    ...(record.discoveryClaude.porcelain.measured ? [] : ['discovery-status']),
    ...(record.stopLatency.measured ? [] : ['stop-latency'])
  ];
}
