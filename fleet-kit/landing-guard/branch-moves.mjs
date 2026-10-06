/**
 * The branch moves a shell line REQUESTS, read from its own words before git is asked anything.
 *
 * THE QUESTION: "which git commands in this line would make a branch point somewhere new, and at what?"
 * This module answers only what the words can answer — the verb, the ref, the named revision. Whether
 * the ref is an integration branch, what a revision resolves to, and whether a move adds content are
 * facts about the repository, asked of git by `move-resolution.mjs`. A request is a CANDIDATE.
 *
 * THE VERBS. Every git verb that moves a branch ref:
 *   - the CHECKED-OUT branch: `commit`, `merge`, `pull` (of anything but its own upstream), `reset`
 *     (to a commit), `rebase`, `cherry-pick`, `revert`, `am`;
 *   - a NAMED branch from anywhere: `branch -f|-M|-m|-C|-c`, `checkout -B`, `switch -C`, `update-ref`;
 *   - a REMOTE branch: `push` (refspecs, `HEAD`, the bare default, `--all`, `--mirror`).
 * Unlike the b100 reference, `commit` and `cherry-pick` are here: no hook in these repositories guards
 * authoring on an integration branch, so nothing else would see them.
 *
 * NEVER A REQUEST: a MENTION (words in an echo, a quoted message, a heredoc — gone by construction of the
 * vendored tokenizer), and STEERING without moving: `--abort`, `--quit`, `--squash`, `--dry-run`,
 * `--no-commit`, deletions, a reset of paths.
 *
 * @es Los movimientos de rama que PIDE una línea, leídos de sus palabras antes de preguntar nada a git.
 * Una petición es una CANDIDATA. A diferencia de la referencia b100, `commit` y `cherry-pick` están aquí:
 * ningún hook de estos repositorios guarda la autoría sobre una rama de integración. Las MENCIONES y el
 * pilotaje sin movimiento nunca son peticiones.
 */

import { gitInvocations } from '../../shell-command/git-invocations.mjs';

const HEADS = 'refs/heads/';

/** A branch spelt as a ref or a short name, reduced to the short name. @es Un nombre de rama, reducido al corto. */
export const shortBranch = (name) => (name.startsWith(HEADS) ? name.slice(HEADS.length) : name);

/**
 * A verb's words split the way git's option parser reads them.
 * @returns `{ flags: Set, positionals: string[], dashDash: boolean }`.
 * @es Las palabras de un verbo separadas como las lee git.
 */
export function parseArguments(args, optionsWithValue = new Set()) {
  const flags = new Set();
  const positionals = [];
  let dashDash = false;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (dashDash || word === '-' || !word.startsWith('-')) positionals.push(word);
    else if (word === '--') dashDash = true;
    else if (word.startsWith('--') && word.includes('=')) flags.add(word.slice(0, word.indexOf('=')));
    else {
      flags.add(word);
      if (optionsWithValue.has(word)) index += 1;
    }
  }

  return { flags, positionals, dashDash };
}

const hasAny = (flags, names) => names.some((name) => flags.has(name));

export const CURRENT = Object.freeze({ kind: 'current' });
export const local = (branch) => ({ kind: 'local', branch: shortBranch(branch) });
export const remote = (remoteName, branch) => ({ kind: 'remote', remote: remoteName, branch: shortBranch(branch) });
export const toRev = (rev) => ({ kind: 'rev', rev });
export const produced = (why) => ({ kind: 'produced', why });

const MESSAGE_OPTIONS = new Set(['-m', '-F', '--file', '-C', '-c', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--author', '--date', '--cleanup', '-t', '--template']);
const MERGE_OPTIONS = new Set(['-m', '-F', '--file', '-s', '--strategy', '-X', '--strategy-option', '--into-name', '--cleanup']);
const PICK_OPTIONS = new Set(['-m', '--mainline', '-s', '--strategy', '-X', '--strategy-option', '--cleanup']);
const REBASE_OPTIONS = new Set(['--onto', '-s', '--strategy', '-X', '--strategy-option', '-x', '--exec']);
const PUSH_OPTIONS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
const PULL_OPTIONS = new Set(['-s', '--strategy', '-X', '--strategy-option', '--depth', '-j', '--jobs']);
const CONTENT_MADE_HERE = 'the content is produced by the command itself, so no run can have graded it beforehand';

function commitRequests(args) {
  const { flags } = parseArguments(args, MESSAGE_OPTIONS);

  return flags.has('--dry-run') ? [] : [{ ref: CURRENT, target: produced(`git commit: ${CONTENT_MADE_HERE}`) }];
}

function mergeRequests(args) {
  const { flags, positionals } = parseArguments(args, MERGE_OPTIONS);

  if (hasAny(flags, ['--abort', '--quit', '--squash'])) return [];
  if (flags.has('--continue')) return [{ ref: CURRENT, target: produced(`git merge --continue: ${CONTENT_MADE_HERE}`) }];
  if (positionals.length > 1) return [{ ref: CURRENT, target: produced('an octopus merge produces a tree git computes only while merging') }];

  return [{ ref: CURRENT, target: { kind: 'merge', rev: positionals[0] ?? '@{upstream}', noFf: flags.has('--no-ff'), ffOnly: flags.has('--ff-only') } }];
}

/** A `pull` of the branch's own upstream syncs to what the shared remote already holds; anything else integrates. @es Un `pull` de su propio upstream sincroniza; otro, integra. */
function pullRequests(args) {
  const { positionals } = parseArguments(args, PULL_OPTIONS);
  const sources = positionals.slice(1).map((refspec) => shortBranch((refspec.startsWith('+') ? refspec.slice(1) : refspec).split(':')[0]));

  return [{ ref: CURRENT, target: { kind: 'pull', sources } }];
}

const RESET_MODES = ['--soft', '--hard', '--keep', '--merge', '--mixed'];

/** `reset` moves the branch only with a mode, or with exactly one revision and no paths. @es `reset` mueve la rama solo con modo, o con exactamente una revisión. */
function resetRequests(args) {
  const { flags, positionals, dashDash } = parseArguments(args);
  const withMode = hasAny(flags, RESET_MODES);

  if (dashDash || (!withMode && positionals.length !== 1) || (withMode && positionals.length > 1)) return [];

  return [{ ref: CURRENT, target: { kind: 'reset', rev: positionals[0] ?? 'HEAD' } }];
}

/** `cherry-pick`, `revert`, `am`: steering flags move nothing, anything else commits new content. @es Las banderas de pilotaje no mueven; lo demás commitea contenido nuevo. */
const commitsContent = (verb, steering, options = new Set()) => (args) => {
  const { flags } = parseArguments(args, options);

  return hasAny(flags, steering) ? [] : [{ ref: CURRENT, target: produced(`git ${verb}: ${CONTENT_MADE_HERE}`) }];
};

function rebaseRequests(args) {
  const { flags, positionals } = parseArguments(args, REBASE_OPTIONS);

  if (hasAny(flags, ['--abort', '--quit', '--edit-todo', '--show-current-patch'])) return [];

  return [{ ref: positionals[1] === undefined ? CURRENT : local(positionals[1]), target: produced(`git rebase: ${CONTENT_MADE_HERE}`) }];
}

function branchRequests(args) {
  const { flags, positionals } = parseArguments(args, new Set(['-u', '--set-upstream-to']));

  if (hasAny(flags, ['-f', '--force']) && positionals.length > 0) return [{ ref: local(positionals[0]), target: toRev(positionals[1] ?? 'HEAD') }];
  if (!hasAny(flags, ['-M', '-m', '-C', '-c', '--move', '--copy'])) return [];
  if (positionals.length === 1) return [{ ref: local(positionals[0]), target: toRev('HEAD') }];
  if (positionals.length === 2) return [{ ref: local(positionals[1]), target: toRev(`${HEADS}${shortBranch(positionals[0])}`) }];

  return [];
}

/** `checkout -B` / `switch -C`: force-create or reset a named branch. @es Crea o reinicia a la fuerza una rama nombrada. */
const forceCreate = (forceFlags) => (args) => {
  const { positionals } = parseArguments(args);
  const at = args.findIndex((word) => forceFlags.includes(word));

  if (at === -1 || at + 1 >= args.length) return [];

  const branch = args[at + 1];
  const start = positionals.find((word) => word !== branch);

  return [{ ref: local(branch), target: toRev(start ?? 'HEAD') }];
};

function updateRefRequests(args) {
  const { flags, positionals } = parseArguments(args, new Set(['-m']));

  if (hasAny(flags, ['-d', '--delete'])) return [];
  if (flags.has('--stdin')) return [{ ref: { kind: 'unknown' }, target: produced('update-ref --stdin: the line does not show which refs move') }];

  const [ref, value] = positionals;

  if (ref === 'HEAD' && !flags.has('--no-deref') && value !== undefined) return [{ ref: CURRENT, target: toRev(value) }];
  if (ref !== undefined && ref.startsWith(HEADS) && value !== undefined) return [{ ref: local(ref), target: toRev(value) }];

  return [];
}

/** One push refspec as `{ source, destination }`, or `undefined` for a deletion. @es Un refspec de push. */
function pushRefspec(refspec) {
  const spec = refspec.startsWith('+') ? refspec.slice(1) : refspec;
  const colon = spec.indexOf(':');

  if (colon === -1) return { source: spec, destination: spec };
  if (colon === 0) return undefined;

  return { source: spec.slice(0, colon), destination: spec.slice(colon + 1) };
}

function pushRequests(args) {
  const { flags, positionals } = parseArguments(args, PUSH_OPTIONS);

  if (hasAny(flags, ['--dry-run', '-n', '--delete', '-d'])) return [];

  const remoteName = positionals[0];

  // Every local branch goes to its namesake: resolution expands this over the repository's own
  // integration branches, which only the repository's config knows.
  if (hasAny(flags, ['--all', '--branches', '--mirror'])) return [{ ref: { kind: 'remote-every', remote: remoteName }, target: { kind: 'namesake' } }];
  if (positionals.length <= 1) return [{ ref: remote(remoteName, 'HEAD'), target: toRev('HEAD') }];

  return positionals
    .slice(1)
    .map(pushRefspec)
    .filter((refspec) => refspec !== undefined)
    .map(({ source, destination }) => ({ ref: remote(remoteName, destination), target: toRev(source) }));
}

const VERBS = {
  commit: commitRequests,
  merge: mergeRequests,
  pull: pullRequests,
  reset: resetRequests,
  'cherry-pick': commitsContent('cherry-pick', ['--abort', '--quit', '-n', '--no-commit'], PICK_OPTIONS),
  revert: commitsContent('revert', ['--abort', '--quit', '-n', '--no-commit'], PICK_OPTIONS),
  am: commitsContent('am', ['--abort', '--quit', '--show-current-patch']),
  rebase: rebaseRequests,
  branch: branchRequests,
  checkout: forceCreate(['-B']),
  switch: forceCreate(['-C', '--force-create']),
  'update-ref': updateRefRequests,
  push: pushRequests
};

/**
 * Every requested branch move in `script`, in execution order, each carrying the invocation it came from.
 * @returns `[{ invocation, ref, target }]`.
 * @es Cada movimiento de rama pedido en `script`, en orden de ejecución.
 */
export function requestedMoves(script, dialect, cwd, platform = process.platform) {
  return gitInvocations(script, dialect, cwd, platform).flatMap((invocation) => {
    const verb = VERBS[invocation.subcommand];

    return verb === undefined ? [] : verb(invocation.args).map((request) => ({ invocation, ...request }));
  });
}
