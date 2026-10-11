/**
 * THE DECISION — does this shell command run a `git push` to a COMPANY remote whose pushed range names a
 * listed tool, or that bypasses the push hooks with `--no-verify`? The company repositories must carry no
 * trace of the owner's AI tooling, and the control lives only in the owner's private `~/.claude`.
 *
 * WHICH REMOTE. The repository word of the push (a remote name, or a raw URL / path; with none, the
 * branch's push remote, `remote.pushDefault`, the branch's remote, then `origin`) is resolved to URLs through
 * `git remote -v`; it is a company remote when ANY of its URLs has a company host. A raw URL is judged by its
 * own host. A push to a personal remote is never judged. WHAT IS JUDGED: `--no-verify` is refused outright;
 * otherwise the pushed range (`pushed-range.mjs`) is scanned for listed names in commit messages, added
 * paths and added lines. A mention of a push inside `echo` or a heredoc is DATA, never a command.
 *
 * FAILS CLOSED on the configuration (no usable list: every push is refused) and OPEN on a malfunction of
 * its own (a git that cannot run): a guard that cannot decide must not silence a safe command.
 *
 * @es LA DECISIÓN: ¿ejecuta este comando un `git push` a un remoto de EMPRESA cuyo rango subido nombra una
 * herramienta de la lista, o que se salta los hooks con `--no-verify`? El remoto se resuelve a sus URL con
 * `git remote -v` y es de empresa si ALGUNA URL tiene host de empresa; una URL cruda se juzga por su host;
 * un push a un remoto personal nunca se juzga. `--no-verify` se rechaza sin más; si no, se escanea el rango
 * subido (mensajes, rutas y líneas añadidas). Falla CERRADO ante la configuración y ABIERTO ante un fallo
 * propio.
 */

import { companyConfig } from '../company-config/config.mjs';
import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { companyRemoteNames, isCompanyUrl, remoteUrls, runGit } from '../company-remote/remotes.mjs';
import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { parsePushArguments } from './push-arguments.mjs';
import { pushedRevisions, rangeFindings } from './pushed-range.mjs';

/** The value of a git setting in `dir`, or `undefined`. @es El valor de un ajuste de git en `dir`. */
function setting(dir, key) {
  const result = runGit(dir, ['config', '--get', key]);
  const value = result.stdout.trim();

  return result.ok && value.length > 0 ? value : undefined;
}

/** The remote a push with no repository word goes to. @es El remoto al que va un push sin palabra de repositorio. */
function defaultRemote(dir) {
  const branch = runGit(dir, ['symbolic-ref', '--short', '-q', 'HEAD']).stdout.trim();

  const ofBranch = (key) => (branch.length > 0 ? setting(dir, `branch.${branch}.${key}`) : undefined);

  return ofBranch('pushRemote') ?? setting(dir, 'remote.pushDefault') ?? ofBranch('remote') ?? 'origin';
}

/**
 * Whether the push goes to a company remote, and the remotes whose tracking refs say what is already there.
 * @es Si el push va a un remoto de empresa, y los remotos cuyas refs de seguimiento dicen qué hay ya.
 */
function destinationOf(dir, parsed, hosts) {
  const word = parsed.repository ?? defaultRemote(dir);
  const urls = remoteUrls(dir);
  const named = urls.filter((remote) => remote.name === word);

  if (named.length > 0) return { company: named.some((remote) => isCompanyUrl(remote.url, hosts)), known: [word] };

  const sameUrl = urls.filter((remote) => remote.url === word).map((remote) => remote.name);

  return { company: isCompanyUrl(word, hosts), known: sameUrl.length > 0 ? sameUrl : companyRemoteNames(dir, hosts) };
}

/**
 * @returns `undefined` when the command may run; `{ problem }` when the configuration is unusable and the
 *   line pushes; `{ dir, noVerify: true }` for a company push that bypasses hooks; otherwise
 *   `{ dir, findings }` for the first company push whose range names a tool.
 * @es `undefined` si puede correr; `{ problem }` con configuración inservible; `{ dir, noVerify: true }`
 *   para un push de empresa que se salta los hooks; si no, `{ dir, findings }`.
 */
export function judgePush(payload) {
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string' || command.length === 0) return undefined;

  const cwd = typeof payload?.cwd === 'string' ? payload.cwd : process.cwd();
  const pushes = gitInvocations(command, dialect, cwd).filter((invocation) => invocation.subcommand === 'push');

  if (pushes.length === 0) return undefined;

  const config = companyConfig();

  if (config.problem !== undefined) return { problem: config.problem };

  for (const invocation of pushes) {
    const dir = invocationDirectory(invocation) ?? cwd; // an unfollowable `cd` falls back to where the line started

    const parsed = parsePushArguments(invocation.args);
    const destination = destinationOf(dir, parsed, config.hosts);

    if (!destination.company) continue;
    if (parsed.noVerify) return { dir, noVerify: true };

    const findings = rangeFindings(dir, pushedRevisions(dir, parsed), destination.known, config.names);

    if (findings.length > 0) return { dir, findings };
  }

  return undefined;
}
