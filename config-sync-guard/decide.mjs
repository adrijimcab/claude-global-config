/**
 * THE DECISION — may this turn end while either declared backup repo has unpushed commits or
 * uncommitted work not attributable to a currently-live agent?
 *
 * Owner directive, verbatim: «Todas las modificaciones de agents, claude reglas hooks gates, a parte de
 * implementarlas, se dejan subidas al repo directamente» (`~/.claude/rules/00-owner-mandates.md`,
 * "Config de agentes versionada y subida en el momento"). Measured the day this rule was written: both
 * declared repos had ALREADY drifted — 3 uncommitted in `~/.claude`, 2 unpushed commits plus 14 dirty in
 * `b100-am-ui/.claude`, 7 of those 14 belonging to a LIVE agent's own in-progress work.
 *
 * THREE OUTCOMES per repo, never conflated:
 *   - BLOCK: ahead of its remote, or holding dirty paths NOT attributable to a live agent.
 *   - ALLOW WITH A NOTE: the repo is missing, or `git` itself failed to answer — a measurement that did
 *     not happen is NEVER read as "clean" (`measurement-failure-is-not-a-zero`), but it is also not
 *     something this turn can fix by committing, so it surfaces as a non-blocking `systemMessage`
 *     rather than trapping a turn over a repo the owner may not even have on this machine.
 *   - ALLOW SILENTLY: clean, or every dirty path belongs to a live agent's own recent writes.
 *
 * A dirty path counts as "mine" (blocking) unless `attribution.mjs` can show a currently-live agent
 * wrote it — the safe direction: an unattributable path (a shell-command edit, a rename, an unreadable
 * transcript) blocks rather than being silently excused.
 *
 * FAILS OPEN on `stop_hook_active` and on anything this module itself cannot measure — the same bound
 * every sibling Stop guard in this fleet holds.
 *
 * @es LA DECISIÓN: ¿puede terminar el turno mientras algún repo de respaldo declarado tiene commits sin
 * subir o cambios sin commitear no atribuibles a un agente vivo? TRES desenlaces por repo: BLOQUEO
 * (adelantado, o con rutas sucias no atribuibles); PERMITIR CON NOTA (repo ausente, o `git` falló — una
 * medición que no ocurrió NUNCA se lee como limpia, pero tampoco es algo que este turno pueda arreglar
 * commiteando); PERMITIR EN SILENCIO (limpio, o toda ruta sucia es de un agente vivo). Una ruta sucia
 * cuenta como "mía" salvo que se pueda mostrar que un agente vivo la escribió — la dirección SEGURA.
 */

import { liveOwnerOf, liveTranscriptTexts } from './attribution.mjs';
import { declaredRepos, repoExists } from './repos.mjs';
import { parseStatusPorcelain } from './status.mjs';
import path from 'node:path';

/**
 * One repo's classification: `{ repo, state }` where `state` is `'missing'`, `'unmeasurable'`,
 * `'clean'`, or `'dirty'` (carrying `aheadCount` and `unattributed`, the dirty paths no live agent
 * claims).
 * @es Clasificación de un repo: `state` es `'missing'`, `'unmeasurable'`, `'clean'`, o `'dirty'`.
 */
function classifyOneRepo(repo, liveTexts) {
  if (!repoExists(repo)) return { repo, state: 'missing' };

  const status = repo.run(['status', '--porcelain=v1', '--branch']);

  if (!status.ok) return { repo, state: 'unmeasurable', reason: status.stderr || 'git exited non-zero with no stderr' };

  const { aheadCount, dirtyPaths } = parseStatusPorcelain(status.stdout);
  const unattributed = dirtyPaths
    .filter((relativePath) => liveOwnerOf(relativePath, liveTexts) === undefined)
    .map((relativePath) => path.join(repo.worktree, relativePath));

  if (aheadCount === 0 && unattributed.length === 0) return { repo, state: 'clean' };

  return { repo, state: 'dirty', aheadCount, unattributed };
}

/**
 * The decision over a parsed Stop payload. Returns `undefined` (allow silently),
 * `{ kind: 'note', notes }` (allow, with a non-blocking message), or `{ kind: 'block', dirtyRepos }`
 * (block). Every dependency is injectable so the whole state space is exercisable without a live fleet
 * or a real git repo.
 * @es La decisión sobre un payload `Stop` ya parseado. `undefined` (permite en silencio), `{kind:'note'}`
 * (permite con mensaje), o `{kind:'block'}` (bloquea). Toda dependencia es inyectable.
 */
export function decide(payload, { repos = declaredRepos(), now = Date.now(), liveTexts } = {}) {
  if (payload?.stop_hook_active === true) return undefined;

  const texts = liveTexts ?? liveTranscriptTexts(now);
  const classified = repos.map((repo) => classifyOneRepo(repo, texts));

  const dirtyRepos = classified.filter((entry) => entry.state === 'dirty');

  if (dirtyRepos.length > 0) return { kind: 'block', dirtyRepos };

  const notes = classified
    .filter((entry) => entry.state === 'missing' || entry.state === 'unmeasurable')
    .map((entry) =>
      entry.state === 'missing'
        ? `config-sync-guard: ${entry.repo.name} not found at ${entry.repo.worktree} (skipped, not treated as clean)`
        : `config-sync-guard: ${entry.repo.name} — git status failed (${entry.reason}); cannot verify, NOT treated as clean`
    );

  return notes.length > 0 ? { kind: 'note', notes } : undefined;
}
