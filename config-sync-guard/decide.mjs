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
 *   - BLOCK: ahead of its remote by commits no live agent of ANOTHER session owns (`unpushed-commits.mjs`),
 *     or holding dirty paths NOT written by a live agent (`attribution.mjs`). Commits that other sessions'
 *     live agents own are ALLOWED WITH A NOTE: they are not this session's to push.
 *     @es BLOQUEO: adelantado por commits que ningún agente vivo de OTRA sesión posee, o con rutas sucias
 *     que ningún agente vivo escribió. Los commits de otras sesiones se permiten CON NOTA.
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
 * A FOURTH OUTCOME, added 2026-09-30: a dirty repo whose CURRENT fingerprint (`fingerprint.mjs` — ahead
 * count plus a content-addressed tree hash of the whole worktree) exactly matches a recorded dismissal
 * (`dismiss.mjs`) for that SAME repo name is `dismissed`: allowed, with a non-blocking note, never
 * silently. This closes the gap the original dismiss mechanism shipped with: it recorded only a reason,
 * with no scope, so a dismissal kept excusing a repo FOREVER — including after its content changed —
 * and the same two paths had to be re-dismissed on every turn of the same session. A fingerprint that
 * cannot be measured, or one that no longer matches (a new path, an edited byte, a different ahead
 * count), never counts as dismissed — it blocks like any other unrecognised dirty state.
 *
 * FAILS OPEN on `stop_hook_active` and on anything this module itself cannot measure — the same bound
 * every sibling Stop guard in this fleet holds.
 *
 * @es LA DECISIÓN: ¿puede terminar el turno mientras algún repo de respaldo declarado tiene commits sin
 * subir o cambios sin commitear no atribuibles a un agente vivo? CUATRO desenlaces por repo: BLOQUEO
 * (adelantado, o con rutas sucias no atribuibles y sin descarte vigente); PERMITIR CON NOTA (repo
 * ausente, `git` falló, o un descarte cuya huella coincide EXACTAMENTE con el estado actual — una
 * medición que no ocurrió NUNCA se lee como limpia); PERMITIR EN SILENCIO (limpio, o toda ruta sucia es
 * de un agente vivo). Un descarte queda acotado a la huella exacta contra la que se concedió
 * (`fingerprint.mjs`): cualquier cambio posterior — ruta nueva, byte editado, conteo de adelanto
 * distinto — produce una huella distinta y vuelve a bloquear.
 */

import { liveAgentWrites, liveOwnerOf } from './attribution.mjs';
import { readDismissals } from './dismiss.mjs';
import { measureFingerprint } from './fingerprint.mjs';
import { declaredRepos, repoExists } from './repos.mjs';
import { parseStatusPorcelain } from './status.mjs';
import { classifyCommits, readAheadCommits } from './unpushed-commits.mjs';
import path from 'node:path';

/**
 * The most recent dismissal in `dismissals` recorded for `repoName` whose `fingerprint` exactly equals
 * `fingerprint`, or `undefined`. Both `repo` and `fingerprint` must match — a fingerprint alone is not a
 * key, since two DIFFERENT declared repos could coincidentally measure the same tree hash (an empty
 * worktree, for instance).
 * @es El descarte más reciente en `dismissals` para `repoName` cuya `fingerprint` iguala EXACTAMENTE a
 * `fingerprint`, o `undefined`. Deben coincidir AMBOS, repo y huella — una huella sola no es una clave.
 */
function latestMatchingDismissal(repoName, fingerprint, dismissals) {
  let latest;

  for (const record of dismissals) {
    if (record?.repo !== repoName || record?.fingerprint !== fingerprint) continue;
    if (typeof record?.at !== 'string') continue;
    if (latest === undefined || record.at > latest.at) latest = record;
  }

  return latest;
}

/** `aaa1111 (agent-x), bbb2222 (agent-y)`: each foreign commit with the live agents that own it. @es Cada commit ajeno con los agentes vivos que lo poseen. */
function foreignCommitsText(commits) {
  return commits.map((commit) => `${commit.hash} (${commit.owners.join(', ')})`).join(', ');
}

/**
 * One repo's classification: `{ repo, state }` where `state` is `'missing'`, `'unmeasurable'`, `'clean'`,
 * `'foreign'` (only another session's live agents' commits are ahead: allowed with a note), `'dismissed'`
 * or `'dirty'`. The last three carry `aheadCount`, `unownedAhead` (commits ahead that no other session's
 * live agent owns), `unownedCommits`, `foreignCommits` and `unattributed` (dirty paths no live agent
 * wrote); `'dismissed'` also carries `dismissal`, the matching record.
 * @es Clasificación de un repo: `state` es `'missing'`, `'unmeasurable'`, `'clean'`, `'foreign'` (solo hay
 * commits de agentes vivos de otra sesión: se permite con nota), `'dismissed'` o `'dirty'`.
 */
function classifyOneRepo(repo, { liveAgents, sessionId, fingerprintOf, dismissals }) {
  if (!repoExists(repo)) return { repo, state: 'missing' };

  const status = repo.run(['status', '--porcelain=v1', '--branch']);

  if (!status.ok) return { repo, state: 'unmeasurable', reason: status.stderr || 'git exited non-zero with no stderr' };

  const { aheadCount, dirtyPaths } = parseStatusPorcelain(status.stdout);
  const unattributed = dirtyPaths
    .filter((relativePath) => liveOwnerOf(relativePath, liveAgents) === undefined)
    .map((relativePath) => path.join(repo.worktree, relativePath));
  const { foreign, unowned } = classifyCommits(aheadCount > 0 ? readAheadCommits(repo) : [], liveAgents, sessionId);
  const unownedAhead = Math.max(0, aheadCount - foreign.length);
  const finding = { repo, aheadCount, unownedAhead, unownedCommits: unowned, foreignCommits: foreign, unattributed };

  if (unownedAhead === 0 && unattributed.length === 0) return foreign.length === 0 ? { repo, state: 'clean' } : { ...finding, state: 'foreign' };

  const fingerprint = fingerprintOf(repo);
  const dismissal = fingerprint === undefined ? undefined : latestMatchingDismissal(repo.name, fingerprint, dismissals);

  if (dismissal !== undefined) return { ...finding, state: 'dismissed', dismissal };

  return { ...finding, state: 'dirty' };
}

/**
 * The decision over a parsed Stop payload. Returns `undefined` (allow silently),
 * `{ kind: 'note', notes }` (allow, with a non-blocking message), or `{ kind: 'block', dirtyRepos }`
 * (block). Every dependency is injectable so the whole state space is exercisable without a live fleet
 * or a real git repo.
 * @es La decisión sobre un payload `Stop` ya parseado. `undefined` (permite en silencio), `{kind:'note'}`
 * (permite con mensaje), o `{kind:'block'}` (bloquea). Toda dependencia es inyectable.
 */
export function decide(payload, { repos = declaredRepos(), now = Date.now(), liveAgents, fingerprintOf = measureFingerprint, dismissals } = {}) {
  if (payload?.stop_hook_active === true) return undefined;

  const context = { liveAgents: liveAgents ?? liveAgentWrites(now), sessionId: payload?.session_id, fingerprintOf, dismissals: dismissals ?? readDismissals() };
  const classified = repos.map((repo) => classifyOneRepo(repo, context));

  const dirtyRepos = classified.filter((entry) => entry.state === 'dirty');

  if (dirtyRepos.length > 0) return { kind: 'block', dirtyRepos };

  const notes = classified
    .filter((entry) => entry.state !== 'clean')
    .map((entry) => {
      if (entry.state === 'missing') return `config-sync-guard: ${entry.repo.name} not found at ${entry.repo.worktree} (skipped, not treated as clean)`;
      if (entry.state === 'unmeasurable') return `config-sync-guard: ${entry.repo.name} — git status failed (${entry.reason}); cannot verify, NOT treated as clean`;
      if (entry.state === 'foreign') return `config-sync-guard: ${entry.repo.name} — ${foreignCommitsText(entry.foreignCommits)} belong to live agents of another session; left unpushed here`;

      return `config-sync-guard: ${entry.repo.name} — dismissed at ${entry.dismissal.at}: ${entry.dismissal.reason}`;
    });

  return notes.length > 0 ? { kind: 'note', notes } : undefined;
}
