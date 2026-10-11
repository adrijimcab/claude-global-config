/**
 * THE DECISION — does this shell command run a `git commit` into a COMPANY repository whose message,
 * staged paths or staged added lines name a listed tool? The company repositories must carry no trace of
 * the owner's AI tooling; the control lives only here, in the owner's private `~/.claude`.
 *
 * WHICH REPOSITORY. Each `git commit` invocation is resolved through the line's `cd`s and `-C`
 * (`company-remote/invocation-directory.mjs`); the repository is a company one when ANY remote URL has a
 * company host (`company-remote/remotes.mjs`). A repository with only personal remotes, or none, is never
 * judged. WHAT IS JUDGED: the message words (`-m`, `-F` file, `-F -` heredoc body, reused commit, author,
 * trailer), the paths of the committed content and its added lines (`git diff --cached`, or against HEAD
 * for `-a` / an explicit pathspec). A mention of a commit inside `echo` or a heredoc is DATA, never a
 * command (the shared shell parser keeps it out).
 *
 * FAILS CLOSED on the configuration (no usable list: every commit is refused, `company-config`), and OPEN
 * on a malfunction of its own (a git that cannot run, an unreadable message file): a guard that cannot
 * decide must not silence a safe command.
 *
 * @es LA DECISIÓN: ¿ejecuta este comando un `git commit` en un repositorio de EMPRESA cuyo mensaje, rutas
 * en stage o líneas añadidas nombran una herramienta de la lista? Los repos de empresa no pueden llevar
 * rastro del tooling de IA del dueño; el control vive solo aquí, en el `~/.claude` privado. El repo se
 * resuelve por `cd`/`-C`; es de empresa si ALGUNA URL de remoto tiene host de empresa; uno solo con
 * remotos personales, o sin ninguno, nunca se juzga. Falla CERRADO ante la configuración y ABIERTO ante un
 * fallo propio.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { companyConfig } from '../company-config/config.mjs';
import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { companyRemoteNames, runGit } from '../company-remote/remotes.mjs';
import { addedLines } from '../company-scan/diff-added.mjs';
import { scanAdded, scanPaths, scanText } from '../company-scan/findings.mjs';
import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { parseCommitArguments } from './commit-arguments.mjs';

/** Flags that keep a diff to added content only, with no external drivers. @es Banderas que dejan solo el contenido añadido. */
const DIFF_FLAGS = ['-U0', '--no-color', '--no-ext-diff', '--no-textconv'];

/** The message sources of one commit, as findings. @es Los hallazgos de las fuentes de mensaje de un commit. */
function messageFindings(parsed, { dir, command, invocationText, names }) {
  const findings = parsed.texts.flatMap(({ label, text }) => scanText(text, names, label));

  for (const file of parsed.files) {
    if (file === '-' || file === '/dev/stdin') {
      const at = command.indexOf(invocationText);

      findings.push(...scanText(command.slice(at + invocationText.length), names, 'commit message (stdin)'));
      continue;
    }

    try {
      findings.push(...scanText(readFileSync(path.resolve(dir, file), 'utf8'), names, `commit message file ${file}`));
    } catch {
      // An unreadable message file is git's own error to report; this guard cannot judge it.
    }
  }

  for (const revision of parsed.reuse) findings.push(...scanText(runGit(dir, ['log', '-1', '--format=%B', revision]).stdout, names, `reused message of ${revision}`));

  return findings;
}

/** The paths and added lines of the content this commit would record, as findings. @es Los hallazgos del contenido que registraría el commit. */
function contentFindings(parsed, dir, names) {
  const scope = parsed.paths.length > 0 ? ['--', ...parsed.paths] : [];
  let base = parsed.all || parsed.only || parsed.paths.length > 0 ? 'HEAD' : '--cached';
  let diff = runGit(dir, ['diff', base, ...DIFF_FLAGS, ...scope]);

  if (!diff.ok && base === 'HEAD') {
    base = '--cached'; // a repository with no commit yet has no HEAD to compare with
    diff = runGit(dir, ['diff', base, ...DIFF_FLAGS, ...scope]);
  }

  const listing = runGit(dir, ['diff', base, '--name-only', '--diff-filter=ACMRT', ...scope]);

  return [...scanPaths(listing.stdout.split('\n').filter((line) => line.length > 0), names), ...scanAdded(addedLines(diff.stdout), names)];
}

/**
 * @returns `undefined` when the command may run; `{ problem }` when the configuration is unusable and the
 *   line commits; otherwise `{ dir, findings }` for the first company commit that names a tool.
 * @es `undefined` si puede correr; `{ problem }` si la configuración no sirve y la línea commitea; si no,
 *   `{ dir, findings }` del primer commit de empresa que nombra una herramienta.
 */
export function judgeCommit(payload) {
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string' || command.length === 0) return undefined;

  const cwd = typeof payload?.cwd === 'string' ? payload.cwd : process.cwd();
  const commits = gitInvocations(command, dialect, cwd).filter((invocation) => invocation.subcommand === 'commit');

  if (commits.length === 0) return undefined;

  const config = companyConfig();

  if (config.problem !== undefined) return { problem: config.problem };

  for (const invocation of commits) {
    const dir = invocationDirectory(invocation);

    if (dir === undefined || companyRemoteNames(dir, config.hosts).length === 0) continue;

    const parsed = parseCommitArguments(invocation.args);
    const findings = [...messageFindings(parsed, { dir, command, invocationText: invocation.text, names: config.names }), ...contentFindings(parsed, dir, config.names)];

    if (findings.length > 0) return { dir, findings };
  }

  return undefined;
}
