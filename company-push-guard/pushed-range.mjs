/**
 * The range a `git push` would send, and the findings inside it. The range is every commit reachable from
 * what is pushed (`HEAD`, a refspec source, `--all`, `--tags`, `--mirror`) that is NOT reachable from any
 * remote-tracking ref of the company remotes concerned (`--not --remotes=<remote>`): for an existing
 * branch that is exactly "local ref vs its remote-tracking ref", and for a NEW branch it is the commits the
 * remote does not have yet, so it needs no guess about the remote's default branch. A remote with no
 * tracking refs at all means the whole history is pushed, and the whole history is judged.
 *
 * Judged per commit: the message, the paths it adds or modifies and its added lines (merge commits carry
 * no diff of their own; their constituent commits are in the range). A deletion refspec (`:branch`) sends
 * no commit and is skipped.
 *
 * @es El rango que subiría un `git push` y los hallazgos dentro. Son los commits alcanzables desde lo que
 * se sube (`HEAD`, el origen de un refspec, `--all`, `--tags`, `--mirror`) que NO son alcanzables desde
 * ninguna ref de seguimiento de los remotos de empresa implicados (`--not --remotes=<remoto>`): en una
 * rama existente equivale a «ref local contra su ref de seguimiento»; en una rama NUEVA son los commits que
 * el remoto aún no tiene, sin adivinar su rama por defecto. Se juzga por commit: mensaje, rutas añadidas o
 * modificadas y líneas añadidas. Un refspec de borrado no envía commits y se omite.
 */

import { addedLines, pathsByCommit } from '../company-scan/diff-added.mjs';
import { scanPaths, scanText } from '../company-scan/findings.mjs';
import { runGit } from '../company-remote/remotes.mjs';

/** Flags that keep a diff to added content only, with no external drivers. @es Banderas que dejan solo el contenido añadido. */
const DIFF_FLAGS = ['-U0', '--no-color', '--no-ext-diff', '--no-textconv'];

/** The revision arguments one refspec contributes, or `[]`. @es Los argumentos de revisión de un refspec. */
function sourceOf(dir, refspec) {
  const source = (refspec.startsWith('+') ? refspec.slice(1) : refspec).split(':')[0];

  // `:branch` deletes a branch and sends no commit: its empty source does not resolve, so it adds nothing.
  if (source.includes('*')) return [`--glob=${source}`];

  return runGit(dir, ['rev-parse', '--verify', '-q', `${source}^{commit}`]).ok ? [source] : [];
}

/**
 * The revision arguments of everything the push sends, before the exclusion of what the remote has.
 * @es Los argumentos de revisión de todo lo que envía el push.
 */
export function pushedRevisions(dir, parsed) {
  if (parsed.deleting) return [];
  if (parsed.mirror) return ['--all'];

  const revisions = parsed.refspecs.flatMap((refspec) => sourceOf(dir, refspec));

  if (parsed.all) revisions.push('--branches');
  if (parsed.tags) revisions.push('--tags');

  const selectsNothingElse = parsed.refspecs.length === 0 && !parsed.all && !parsed.tags;

  if (selectsNothingElse && runGit(dir, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']).ok) revisions.push('HEAD');

  return revisions;
}

/** Findings in the messages, paths and added lines of the range. @es Hallazgos en mensajes, rutas y líneas añadidas del rango. */
export function rangeFindings(dir, revisions, remoteNames, names) {
  const range = [...revisions, '--not', ...remoteNames.map((name) => `--remotes=${name}`), '--'];
  const short = (commit) => (commit ?? '').slice(0, 8);
  const messages = runGit(dir, ['log', '--format=%x00%H%x01%B', ...range]).stdout.split('\u0000').filter((entry) => entry.length > 0);
  const found = messages.flatMap((entry) => {
    const [commit, message = ''] = entry.split('\u0001');

    return scanText(message, names, `commit ${short(commit)} message`);
  });

  for (const entry of addedLines(runGit(dir, ['log', '-p', ...DIFF_FLAGS, '--format=%x00%H', ...range]).stdout)) {
    found.push(...scanText(entry.text, names, `${entry.path}:${entry.line} (${short(entry.commit)})`));
  }

  for (const entry of pathsByCommit(runGit(dir, ['log', '--name-only', '--diff-filter=ACMRT', '--format=%x00%H', ...range]).stdout)) {
    found.push(...scanPaths([entry.path], names).map((finding) => ({ ...finding, where: `${entry.path} (${short(entry.commit)})` })));
  }

  return found;
}
