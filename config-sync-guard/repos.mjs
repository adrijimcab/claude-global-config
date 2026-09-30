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

/** The project whose own `.claude/` tooling backup this mechanism also watches. @es El proyecto cuyo respaldo de tooling `.claude/` también vigila este mecanismo. */
const B100_PROJECT_ROOT = 'C:\\Users\\adrian.jimenez\\Desktop\\Projects\\b100-am-ui';

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
 * The two declared backup repos, as `{ name, worktree, run, commitCommand, pushCommand }`. `run(args)`
 * is the ONE seam a selftest replaces; `commitCommand`/`pushCommand` are the exact, copy-pasteable
 * commands a block message names.
 * @es Los dos repos de respaldo declarados. `run(args)` es el ÚNICO seam que un selftest reemplaza.
 */
export function declaredRepos() {
  const globalClaude = path.join(homedir(), '.claude');
  const b100Claude = path.join(B100_PROJECT_ROOT, '.claude');

  return [
    {
      name: '~/.claude',
      worktree: globalClaude,
      run: (args) => runCommand('git', ['-C', globalClaude, ...args], globalClaude),
      commitCommand: 'git -C ~/.claude add -A && git -C ~/.claude commit -m "type(scope): description"',
      pushCommand: 'git -C ~/.claude push origin master'
    },
    {
      name: 'b100-am-ui/.claude',
      worktree: b100Claude,
      run: (args) => runCommand(process.execPath, [path.join(b100Claude, 'backup-repo.mjs'), ...args], b100Claude),
      commitCommand: 'node .claude/backup-repo.mjs add -A && node .claude/backup-repo.mjs commit -m "type(scope): description"',
      pushCommand: 'node .claude/backup-repo.mjs push origin master'
    }
  ];
}

/** Whether `repo`'s worktree directory exists at all — the cheapest, first check. @es Si el directorio de worktree de `repo` existe.*/
export function repoExists(repo) {
  return existsSync(repo.worktree);
}
