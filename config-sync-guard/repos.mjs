/**
 * The two backup repositories the owner declared this mechanism must never let drift
 * (`~/.claude/rules/00-owner-mandates.md`, "Config de agentes versionada y subida en el momento"):
 * every modification of agents/rules/hooks/gates gets committed AND pushed the same turn it is made,
 * for BOTH the global `~/.claude` config and this project's `.claude/` tooling backup.
 *
 * WHY THESE TWO ARE HARDCODED, deliberately, not discovered. This mechanism does not generalise to "any
 * git repo the current session happens to be in" — it enforces a specific owner rule about TWO named,
 * personal backup repositories that must stay in sync regardless of which project a session is
 * currently working in. A discovered/dynamic repo list would silently stop checking the intended repos
 * the day a session's cwd is neither of them, which is the opposite of what a delivery gate must do.
 *
 * TWO DIFFERENT INVOCATION SHAPES, because the repos themselves are wired differently:
 *   - `~/.claude` is an ORDINARY git working tree (`git -C ~/.claude <args>`);
 *   - `b100-am-ui/.claude`'s backup git dir lives OUTSIDE the project tree (moved there after a nested
 *     `.claude/.git` broke four tools — see `backup-repo.mjs`'s own docblock), so it is reached ONLY
 *     through that wrapper (`node .claude/backup-repo.mjs <args>`, which the wrapper's own docblock
 *     states "adds nothing to the arguments and passes git's exit code through unchanged").
 *
 * @es Los dos repositorios de respaldo que el dueño declaró que este mecanismo nunca debe dejar
 * desincronizar: toda modificación de agentes/reglas/hooks/gates se commitea Y sube en el MISMO turno,
 * tanto para la config global `~/.claude` como para el respaldo de tooling `.claude/` de este proyecto.
 * Fijos a propósito, no descubiertos: este mecanismo no generaliza a "cualquier repo git de la sesión
 * actual" — hace cumplir una regla del dueño sobre DOS repos de respaldo personales nombrados, sin
 * importar en qué proyecto esté trabajando la sesión actual. Dos formas de invocación distintas, porque
 * los repos están cableados distinto (ver arriba).
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { LANDING_ROUTE } from './land-advice.mjs';

/** The project whose own `.claude/` tooling backup this mechanism also watches. @es El proyecto cuyo respaldo de tooling `.claude/` también vigila este mecanismo. */
const B100_PROJECT_ROOT = 'C:\\Users\\adrian.jimenez\\Desktop\\Projects\\b100-am-ui';

/**
 * `b100-am-ui/.claude`'s backup git dir, DUPLICATED here rather than imported from `backup-repo.mjs`
 * (which declares the same value as `BACKUP_GIT_DIR`). MEASURED: `backup-repo.mjs` has no "only as
 * main" guard — it unconditionally spawns a real `git` command against `process.argv.slice(2)` at
 * module load, outside any `import.meta.url` check — so importing it from here would run an arbitrary
 * git invocation using THIS process's own argv the instant `repos.mjs` loads. Read straight from disk
 * on 2026-09-30 to confirm before choosing this duplication over an import.
 * @es Git dir de respaldo de `b100-am-ui/.claude`, DUPLICADO aquí en vez de importado de
 * `backup-repo.mjs`: ese fichero no tiene guarda de "solo como principal" — ejecuta git de verdad al
 * cargar el módulo — así que importarlo dispararía un comando git arbitrario con el argv de este
 * proceso. Confirmado leyendo el fichero en disco antes de elegir esta duplicación sobre un import.
 */
const B100_BACKUP_GIT_DIR = path.join(homedir(), '.claude-backups', 'b100-am-ui-claude-tooling.git');

/**
 * Runs `command args…` in `cwd` and returns `{ ok, stdout, stderr }` — never throws. A failed spawn or
 * a non-zero exit both come back as `ok: false`, so a caller never has to catch anything to tell
 * "measured and clean" from "could not measure".
 * @es Corre `command args…` en `cwd` y devuelve `{ ok, stdout, stderr }` — nunca lanza.
 */
function runCommand(command, args, cwd) {
  try {
    const stdout = execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    return { ok: false, stdout: String(error?.stdout ?? ''), stderr: String(error?.stderr ?? error?.message ?? error) };
  }
}

/**
 * The two declared backup repos, as `{ name, worktree, gitDir, run, gitPrefix, pushCommand }`.
 * `run(args)` is the ONE seam a selftest replaces for status/log/commit/push-shaped commands;
 * `deliveryRoute` is how its master is reached, declared here and nowhere else: `commit` (a direct
 * pathspec commit, the project tooling backups) or `landing` (only through `worktree-landing/land.mjs`,
 * which is `~/.claude`). @es `deliveryRoute` es cómo se alcanza su master, declarado solo aquí: `commit`
 * (commit directo con pathspec) o `landing` (solo por `worktree-landing/land.mjs`, que es `~/.claude`).
 * `gitPrefix` (the repo's own git invocation, which `commit-advice.mjs` builds the pathspec commit on) and
 * `pushCommand` are the copy-pasteable commands a block message names; `gitDir`
 * is the explicit `--git-dir` `fingerprint.mjs` qualifies its own git calls with (never `run`, and never
 * plain `git -C <worktree>` — see `fingerprint.mjs`'s own docblock for why).
 * @es Los dos repos de respaldo declarados. `run(args)` es el ÚNICO seam que un selftest reemplaza para
 * comandos con forma de status/commit/push; `gitDir` es el `--git-dir` explícito que usa `fingerprint.mjs`.
 */
export function declaredRepos() {
  const globalClaude = path.join(homedir(), '.claude');
  const b100Claude = path.join(B100_PROJECT_ROOT, '.claude');

  return [
    {
      name: '~/.claude',
      worktree: globalClaude,
      gitDir: path.join(globalClaude, '.git'),
      run: (args) => runCommand('git', ['-C', globalClaude, ...args], globalClaude),
      gitPrefix: 'git -C ~/.claude',
      deliveryRoute: LANDING_ROUTE,
      pushCommand: 'git -C ~/.claude push origin master'
    },
    {
      name: 'b100-am-ui/.claude',
      worktree: b100Claude,
      gitDir: B100_BACKUP_GIT_DIR,
      run: (args) => runCommand(process.execPath, [path.join(b100Claude, 'backup-repo.mjs'), ...args], b100Claude),
      gitPrefix: 'node .claude/backup-repo.mjs',
      deliveryRoute: 'commit',
      pushCommand: 'node .claude/backup-repo.mjs push origin master'
    }
  ];
}

/** Whether `repo`'s worktree directory exists at all — the cheapest, first check. @es Si el directorio de worktree de `repo` existe.*/
export function repoExists(repo) {
  return existsSync(repo.worktree);
}
