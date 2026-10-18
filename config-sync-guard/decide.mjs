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
 *     or holding dirty paths THIS session made (`path-ownership.mjs`: it wrote them, or they changed during
 *     one of its shell calls). What other sessions made is ALLOWED WITH A NOTE, and so is a dirty path no
 *     live transcript explains: nobody live can be told to commit it, so blocking would only trap
 *     whoever ends a turn next (the owner's rule binds the MAKER, and none is known).
 *     @es BLOQUEO: adelantado por commits que ningún agente vivo de OTRA sesión posee, o con rutas sucias
 *     que ESTA sesión hizo (las escribió o cambiaron durante un shell suyo). Lo de otras sesiones se permite
 *     CON NOTA, y también una ruta que ningún transcript vivo explica: nadie vivo puede commitearla, así
 *     que bloquear solo atraparía a quien cierre el siguiente turno (la regla liga al AUTOR, y no se conoce).
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

import { liveAgentWrites } from './attribution.mjs';
import { authorsAt, readAuthoredWrites } from './authored-writes.mjs';
import { readDismissals } from './dismiss.mjs';
import { measureFingerprint } from './fingerprint.mjs';
import { claimsOn, finishedWorkersOf, ownershipVerdict } from './path-ownership.mjs';
import { latestChangeMs } from './path-mtime.mjs';
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
 * The non-blocking note of a `'noted'` repo: whose commits are left unpushed here, and which paths no live
 * session made (so nobody live can be told to commit them).
 * @es La nota no bloqueante de un repo `'noted'`: de quién son los commits que quedan sin subir aquí, y
 * qué rutas no hizo ninguna sesión viva (nadie vivo puede commitearlas).
 */
function notedText({ repo, foreignCommits, unexplained }) {
  const parts = [];

  if (foreignCommits.length > 0) parts.push(`${foreignCommitsText(foreignCommits)} belong to live agents of another session; left unpushed here`);
  if (unexplained.length > 0) parts.push(`${String(unexplained.length)} uncommitted path(s) no live session made (not blocking; commit with an explicit pathspec once verified): ${pathsText(unexplained)}`);

  return `config-sync-guard: ${repo.name} — ${parts.join('; ')}`;
}

/** `a, b, c … and N more`: the first `shown` paths of `paths`. @es Las primeras `shown` rutas de `paths`. */
function pathsText(paths, shown = 8) {
  return paths.length > shown ? `${paths.slice(0, shown).join(', ')} … and ${String(paths.length - shown)} more` : paths.join(', ');
}

/**
 * Each dirty path of `repo` as `{ absolute, verdict }`: what it means for this session (`path-ownership.mjs`).
 * @es Cada ruta sucia de `repo` como `{ absolute, verdict }`: qué significa para esta sesión.
 */
function judgedPaths(repo, dirtyPaths, { liveAgents, sessionId, mtimeOf, authoredWrites }) {
  return dirtyPaths.map((relativePath) => {
    const absolute = path.join(repo.worktree, relativePath);
    const mtimeMs = mtimeOf(absolute);
    const claims = claimsOn(absolute, mtimeMs, liveAgents, authorsAt(authoredWrites, absolute, mtimeMs), repo.worktree);

    return { absolute, verdict: ownershipVerdict(claims, sessionId), workers: finishedWorkersOf(claims, sessionId) };
  });
}

/**
 * One repo's classification: `{ repo, state }` where `state` is `'missing'`, `'unmeasurable'`, `'clean'`,
 * `'noted'` (nothing this session must commit or push, but other sessions' commits are ahead and/or paths
 * no live transcript explains: allowed with a note), `'dismissed'` or `'dirty'`. The last three carry
 * `aheadCount`, `unownedAhead` (commits ahead that no other session's live agent owns), `unownedCommits`,
 * `foreignCommits`, `ownPaths` (dirty paths this session made, or its finished workers did),
 * `workerOutput` (those of `ownPaths` that finished workers made: `[{ path, workers }]`) and `unexplained`
 * (dirty paths nobody live made); `'dismissed'` also carries `dismissal`, the matching record.
 * @es Clasificación de un repo: `state` es `'missing'`, `'unmeasurable'`, `'clean'`, `'noted'` (nada que
 * esta sesión deba commitear ni subir, pero hay commits de otras sesiones y/o rutas que ningún transcript
 * vivo explica: se permite con nota), `'dismissed'` o `'dirty'`.
 */
function classifyOneRepo(repo, { liveAgents, sessionId, mtimeOf, fingerprintOf, dismissals, authoredWrites }) {
  if (!repoExists(repo)) return { repo, state: 'missing' };

  const status = repo.run(['status', '--porcelain=v1', '--branch']);

  if (!status.ok) return { repo, state: 'unmeasurable', reason: status.stderr || 'git exited non-zero with no stderr' };

  const { aheadCount, dirtyPaths } = parseStatusPorcelain(status.stdout);
  const judged = judgedPaths(repo, dirtyPaths, { liveAgents, sessionId, mtimeOf, authoredWrites });
  const ownPaths = judged.filter((entry) => entry.verdict === 'maker').map((entry) => entry.absolute);
  const workerOutput = judged.filter((entry) => entry.verdict === 'maker' && entry.workers.length > 0).map((entry) => ({ path: entry.absolute, workers: entry.workers }));
  const unexplained = judged.filter((entry) => entry.verdict === 'unexplained').map((entry) => entry.absolute);
  const { foreign, unowned } = classifyCommits(aheadCount > 0 ? readAheadCommits(repo) : [], liveAgents, sessionId);
  const unownedAhead = Math.max(0, aheadCount - foreign.length);
  const finding = { repo, aheadCount, unownedAhead, unownedCommits: unowned, foreignCommits: foreign, ownPaths, workerOutput, unexplained };

  if (unownedAhead === 0 && ownPaths.length === 0) return foreign.length === 0 && unexplained.length === 0 ? { repo, state: 'clean' } : { ...finding, state: 'noted' };

  const fingerprint = fingerprintOf(repo);
  const dismissal = fingerprint === undefined ? undefined : latestMatchingDismissal(repo.name, fingerprint, dismissals);

  if (dismissal !== undefined) return { ...finding, state: 'dismissed', dismissal };

  return { ...finding, state: 'dirty' };
}

/**
 * The decision over a parsed Stop payload. Returns `undefined` (allow silently),
 * `{ kind: 'note', notes, unexplained }` (allow, with a non-blocking message; `unexplained` lists the
 * `{ repo, path }` no live session made, for the ledger), or `{ kind: 'block', dirtyRepos }` (block). Every dependency is injectable so the whole state space is exercisable without a live fleet
 * or a real git repo.
 * @es La decisión sobre un payload `Stop` ya parseado. `undefined` (permite en silencio), `{kind:'note'}`
 * (permite con mensaje), o `{kind:'block'}` (bloquea). Toda dependencia es inyectable.
 */
export function decide(payload, { repos = declaredRepos(), now = Date.now(), liveAgents, mtimeOf = latestChangeMs, fingerprintOf = measureFingerprint, dismissals, authoredWrites } = {}) {
  if (payload?.stop_hook_active === true) return undefined;

  const context = { liveAgents: liveAgents ?? liveAgentWrites(now), sessionId: payload?.session_id, mtimeOf, fingerprintOf, dismissals: dismissals ?? readDismissals(), authoredWrites: authoredWrites ?? readAuthoredWrites() };
  const classified = repos.map((repo) => classifyOneRepo(repo, context));

  const dirtyRepos = classified.filter((entry) => entry.state === 'dirty');

  if (dirtyRepos.length > 0) return { kind: 'block', dirtyRepos };

  const notes = classified
    .filter((entry) => entry.state !== 'clean')
    .map((entry) => {
      if (entry.state === 'missing') return `config-sync-guard: ${entry.repo.name} not found at ${entry.repo.worktree} (skipped, not treated as clean)`;
      if (entry.state === 'unmeasurable') return `config-sync-guard: ${entry.repo.name} — git status failed (${entry.reason}); cannot verify, NOT treated as clean`;
      if (entry.state === 'noted') return notedText(entry);

      return `config-sync-guard: ${entry.repo.name} — dismissed at ${entry.dismissal.at}: ${entry.dismissal.reason}`;
    });

  const unexplained = classified.flatMap((entry) => (entry.state === 'noted' ? entry.unexplained.map((absolute) => ({ repo: entry.repo.name, path: absolute })) : []));

  return notes.length > 0 ? { kind: 'note', notes, unexplained } : undefined;
}
