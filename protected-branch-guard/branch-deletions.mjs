/**
 * Which commands of a shell line DELETE (or rename away) a branch, and what each one names: the decision of the
 * protected-branch guard. Every command is read through the shared parser — git through
 * `shell-command/git-invocations.mjs` (global options, `-C`, launchers, `bash -c`, `$(...)`), `gh` through
 * `simpleCommands`/`resolveCommand` — so a deletion only MENTIONED (`echo`, a quoted message, a heredoc, a comment)
 * is data and never counted.
 *
 * THE FORMS, each with the names it deletes:
 *   - `git branch -d|-D|--delete <name>...` (a short cluster holding `d`/`D` too); `-r`/`--remotes` deletes
 *     remote-tracking refs, never a branch, and is left out;
 *   - `git branch -m|-M|--move <old> <new>` renames `<old>` away; with ONE name it renames the CURRENT branch of the
 *     directory it acts in, asked of git (`currentBranchOf`);
 *   - `git push <remote> --delete|-d <ref>...`, and a refspec with an empty source: `:<ref>`, `+:<ref>`;
 *     `--mirror` and `--prune` delete remote branches that the line does not name;
 *   - `git update-ref -d|--delete refs/heads/<name>`; `--stdin` reads its commands from input the line does not show;
 *   - `gh api -X|--method DELETE .../git/refs/heads/<name>`;
 *   - `gh pr merge|close --delete-branch` (`-d`), which deletes the pull request's head branch.
 *
 * WHICH NAMES ARE PROTECTED: the constant pair, and the repository's default branch (`default-branch.mjs`), asked
 * lazily — only for a deleted name outside the pair, once per directory and remote: the remote a push names, else
 * `origin`. A local deletion asks `origin` in the directory git acts in; a `gh` call asks `origin` of the line's cwd.
 *
 * WHAT CANNOT BE READ IS REFUSED, unlike the file-write lexer: a deletion whose name is a variable (`$B`, `%B%`), or
 * arrives on standard input (`... | xargs git branch -d`, `update-ref --stdin`), or is not on the line at all
 * (`--mirror`, `--prune`, the head branch of `gh pr merge --delete-branch`), may delete `main` as easily as anything else, and the cost of refusing it is one rewrite
 * with the names spelled out. That is an `unknowable` entry, never a guess.
 *
 * NOT MODELLED, stated: git aliases; the GraphQL `deleteRef` mutation through `gh api graphql`; a deletion made by a
 * child process (a script that runs git itself). The real layer is server-side branch protection.
 *
 * @es Qué comandos de una línea de shell BORRAN (o renombran) una rama y qué nombra cada uno: la decisión de la
 * guardia de ramas protegidas, leída con el parser compartido, así que una MENCIÓN es dato. LAS FORMAS: `git branch
 * -d/-D/--delete` (sin `-r`), `git branch -m/-M` (con un solo nombre renombra la rama ACTUAL, preguntada a git),
 * `git push --delete/-d`, `:<ref>`, `+:<ref>`, `--mirror`/`--prune`, `git update-ref -d` (y `--stdin`), y
 * `gh api -X DELETE .../git/refs/heads/<rama>` y `gh pr merge|close --delete-branch`. SE PROTEGEN el par constante y
 * la rama por defecto del repositorio, preguntada de forma perezosa (solo para un nombre fuera del par, una vez por
 * directorio y remoto). LO QUE NO SE PUEDE LEER SE RECHAZA: un nombre en una variable, por
 * stdin o ausente de la línea puede borrar `main` igual que cualquier otra; rechazarlo cuesta reescribir la línea con
 * los nombres. NO SE MODELA: alias de git, `deleteRef` por GraphQL, lo que haga un proceso hijo.
 */

import { spawnSync } from 'node:child_process';

import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { executableName, isUnresolvableWord, resolveCommand, simpleCommands } from '../shell-command/shell-command.mjs';
import { gitDefaultBranch } from './default-branch.mjs';
import { protectedBranchOf } from './protected-branches.mjs';

/** Why a deletion's names cannot be read. @es Por qué no se pueden leer los nombres de un borrado. */
export const UNKNOWABLE = Object.freeze({ variable: 'variable', stdin: 'stdin', unnamed: 'unnamed', currentBranch: 'current-branch', headBranch: 'head-branch' });

/** The remote whose HEAD names the default branch when a command names none. @es El remoto cuya HEAD nombra la rama por defecto si el comando no nombra ninguno. */
const DEFAULT_REMOTE = 'origin';

const isOption = (word) => word.startsWith('-') && word !== '-';

/** A short-option cluster (`-dr`, `-D`), never a long option. @es Un grupo de opciones cortas, nunca una larga. */
const isShortCluster = (word) => word.startsWith('-') && !word.startsWith('--') && word.length > 1;

/** Whether `args` carry one of the `long` options, or a short cluster holding one of `letters`. @es Si `args` lleva una de las opciones. */
const hasOption = (args, long, letters) => args.some((word) => long.includes(word) || (isShortCluster(word) && [...word.slice(1)].some((letter) => letters.includes(letter))));

/** The operands of `args`: every non-option word, the values of `valueOptions` skipped, everything after `--`. @es Los operandos de `args`. */
function operandsOf(args, valueOptions = []) {
  const operands = [];

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (word === '--') return [...operands, ...args.slice(index + 1)];
    if (valueOptions.includes(word)) index += 1;
    else if (!isOption(word)) operands.push(word);
  }

  return operands;
}

/** One deleted name, or the reason it cannot be read. @es Un nombre borrado, o por qué no se puede leer. */
const named = (word) => (isUnresolvableWord(word) ? { unknowable: UNKNOWABLE.variable } : { name: word });

/** The current branch of `directory`, or `undefined` (detached, or not a repository). @es La rama actual de `directory`, o `undefined`. */
function gitCurrentBranch(directory) {
  const run = spawnSync('git', ['-C', directory, 'symbolic-ref', '--short', '-q', 'HEAD'], { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  const branch = run.status === 0 ? run.stdout.trim() : '';

  return branch === '' ? undefined : branch;
}

const branchDeletes = (args) => !hasOption(args, ['--remotes'], ['r']) && hasOption(args, ['--delete'], ['d', 'D']);
const branchMoves = (args) => !hasOption(args, ['--remotes'], ['r']) && hasOption(args, ['--move'], ['m', 'M']);

/** `git branch`: what a delete or a rename takes away. @es `git branch`: lo que quita un borrado o un renombrado. */
function branchCommandNames(invocation, currentBranchOf) {
  const { args } = invocation;
  const operands = operandsOf(args);

  if (branchDeletes(args)) return operands.map(named);
  if (!branchMoves(args)) return [];
  if (operands.length >= 2) return [named(operands[0])];
  if (operands.length === 0) return [];

  const directory = invocationDirectory(invocation);

  if (directory === undefined) return [{ unknowable: UNKNOWABLE.currentBranch }];

  const current = currentBranchOf(directory);

  return current === undefined ? [] : [{ name: current }];
}

/** `git push` options whose value is a SEPARATE word. @es Opciones de `git push` con valor separado. */
const PUSH_VALUE_OPTIONS = ['-o', '--push-option', '--receive-pack', '--exec', '--repo'];

const pushPrunes = (args) => hasOption(args, ['--mirror', '--prune'], []);
const pushDeletes = (args) => hasOption(args, ['--delete'], ['d']);

/** The refspecs of a push: its operands after the remote, or all of them when `--repo` names it. @es Los refspecs de un push. */
function refspecsOf(args) {
  const operands = operandsOf(args, PUSH_VALUE_OPTIONS);

  return args.includes('--repo') || args.some((word) => word.startsWith('--repo=')) ? operands : operands.slice(1);
}

/** The destination a refspec with an EMPTY source deletes (`:dst`, `+:dst`), or `undefined`. @es El destino que borra un refspec de origen vacío. */
function emptySourceDestination(refspec) {
  const spec = refspec.startsWith('+') ? refspec.slice(1) : refspec;

  return spec.startsWith(':') ? spec.slice(1) : undefined;
}

/** The remote a push goes to: `--repo`, else its first operand; `origin` when neither can be read. @es El remoto de un push. */
function pushRemote(args) {
  const fused = args.find((word) => word.startsWith('--repo='));
  const given = fused === undefined ? (args.includes('--repo') ? args[args.indexOf('--repo') + 1] : operandsOf(args, PUSH_VALUE_OPTIONS)[0]) : fused.slice('--repo='.length);

  return given === undefined || isUnresolvableWord(given) ? DEFAULT_REMOTE : given;
}

/** `git push`: the remote branches it deletes, each with the remote whose default branch is protected too. @es `git push`: las ramas remotas que borra. */
function pushNames({ args }) {
  if (pushPrunes(args)) return [{ unknowable: UNKNOWABLE.unnamed }];

  const remote = pushRemote(args);
  const deleted = pushDeletes(args) ? refspecsOf(args) : refspecsOf(args).map(emptySourceDestination).filter((destination) => destination !== undefined);

  return deleted.map((ref) => ({ ...named(ref), remote }));
}

const updateRefDeletes = (args) => args.includes('-d') || args.includes('--delete');

/** `git update-ref`: the ref it deletes. @es `git update-ref`: la referencia que borra. */
function updateRefNames({ args }) {
  if (args.includes('--stdin')) return [{ unknowable: UNKNOWABLE.stdin }];
  if (!updateRefDeletes(args)) return [];

  const [ref] = operandsOf(args, ['-m']);

  return ref === undefined ? [] : [named(ref)];
}

/**
 * Per git subcommand: the names it deletes, and whether its OPTIONS alone make it a deletion — the question asked of a
 * command `xargs` launches, whose names arrive on standard input and are not on the line.
 * @es Por subcomando de git: los nombres que borra, y si sus OPCIONES solas lo hacen un borrado (lo que se pregunta a un
 * comando que lanza `xargs`, cuyos nombres llegan por stdin).
 */
const GIT_DELETERS = new Map([
  ['branch', { namesOf: branchCommandNames, deletes: (args) => branchDeletes(args) || branchMoves(args) }],
  ['push', { namesOf: pushNames, deletes: (args) => pushPrunes(args) || pushDeletes(args) || refspecsOf(args).some((refspec) => emptySourceDestination(refspec) !== undefined) }],
  ['update-ref', { namesOf: updateRefNames, deletes: (args) => args.includes('--stdin') || updateRefDeletes(args) }]
]);

/** The `gh api` options that take a SEPARATE value word. @es Las opciones de `gh api` con valor separado. */
const GH_API_VALUE_OPTIONS = ['-X', '--method', '-H', '--header', '-f', '--raw-field', '-F', '--field', '--input', '-q', '--jq', '-t', '--template', '--cache', '-p', '--preview', '--hostname'];

/** The HTTP method a `gh api` call uses, as written (GET when none is named). @es El método HTTP de una llamada `gh api`. */
function ghMethod(args) {
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (word === '-X' || word === '--method') return args[index + 1] ?? 'GET';
    if (word.startsWith('--method=')) return word.slice('--method='.length);
    if (word.startsWith('-X') && word.length > 2) return word.slice(2);
  }

  return 'GET';
}

/** The marker of a branch ref in a REST endpoint. @es La marca de una referencia de rama en un endpoint REST. */
const REST_HEADS = 'git/refs/heads/';

/** `gh api -X DELETE`: the branch its endpoint names. @es `gh api -X DELETE`: la rama que nombra su endpoint. */
function ghApiNames(args) {
  const method = ghMethod(args);

  if (isUnresolvableWord(method)) return [{ unknowable: UNKNOWABLE.variable }];
  if (method.toUpperCase() !== 'DELETE') return [];

  const [endpoint] = operandsOf(args, GH_API_VALUE_OPTIONS);

  if (endpoint === undefined) return [];

  const at = endpoint.indexOf(REST_HEADS);

  if (at === -1) return isUnresolvableWord(endpoint) ? [{ unknowable: UNKNOWABLE.variable }] : [];

  return [named(endpoint.slice(at + REST_HEADS.length).split('?')[0])];
}

/** The `gh pr` verbs that can delete the pull request's head branch. @es Los verbos de `gh pr` que pueden borrar la rama de origen del PR. */
const GH_PR_BRANCH_DELETERS = new Set(['merge', 'close']);

/**
 * `gh pr merge|close --delete-branch` (`-d`): it deletes the pull request's HEAD branch, which the line does
 * not name — a release pull request from `develop` loses `develop` that way.
 * @es `gh pr merge|close --delete-branch`: borra la rama de ORIGEN del PR, que la línea no nombra; un PR de release
 * desde `develop` pierde `develop` así.
 */
function ghPrNames(args) {
  if (!GH_PR_BRANCH_DELETERS.has(args[0])) return [];

  const deletes = hasOption(args.slice(1), ['--delete-branch'], ['d']);

  return deletes ? [{ unknowable: UNKNOWABLE.headBranch }] : [];
}

/** Per `gh` command group, the names it deletes. @es Por grupo de comandos de `gh`, los nombres que borra. */
const GH_DELETERS = new Map([
  ['api', ghApiNames],
  ['pr', ghPrNames]
]);

/** Whether `xargs` launches the program at `at`: the parser unwraps it, so it sits before the program word. @es Si `xargs` lanza el programa. */
const launchedByXargs = (words, at) => words.slice(0, at).some((word) => executableName(word) === 'xargs');

/**
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @param {{ currentBranchOf?: Function, defaultBranchOf?: (directory: string|undefined, remote: string) => (string|undefined) }} [seams]
 *   Replace the two git questions: the current branch of a directory, and the default branch of a repository's remote
 *   (asked only for a deleted name outside the constant pair, once per directory and remote).
 * @returns {Array<{ text: string, branch?: string, unknowable?: string }>} Every deletion of a protected branch, or
 *   of a branch whose name cannot be read, in the order the line runs them (git first, then gh).
 * @es Cada borrado de una rama protegida, o de una rama cuyo nombre no se puede leer.
 */
export function protectedBranchDeletions(script, dialect, cwd, { currentBranchOf = gitCurrentBranch, defaultBranchOf = gitDefaultBranch } = {}) {
  const commands = simpleCommands(script, dialect);
  const fedByXargs = new Set(commands.filter(({ words }) => launchedByXargs(words, resolveCommand(words).index)).map(({ text }) => text));
  const found = [];

  for (const invocation of gitInvocations(script, dialect, cwd)) {
    const deleter = GIT_DELETERS.get(invocation.subcommand);

    if (deleter === undefined) continue;

    if (fedByXargs.has(invocation.text) && deleter.deletes(invocation.args)) found.push({ text: invocation.text, unknowable: UNKNOWABLE.stdin });
    else found.push(...deleter.namesOf(invocation, currentBranchOf).map((entry) => ({ text: invocation.text, directory: invocationDirectory(invocation), ...entry })));
  }

  for (const { words, text } of commands) {
    const at = resolveCommand(words).index;

    const deleter = at === -1 || executableName(words[at]) !== 'gh' ? undefined : GH_DELETERS.get(words[at + 1]);

    if (deleter !== undefined) found.push(...deleter(words.slice(at + 2)).map((entry) => ({ text, directory: cwd, ...entry })));
  }

  const defaults = new Map();
  const defaultOf = (directory, remote) => {
    const key = JSON.stringify([directory, remote]);

    if (!defaults.has(key)) defaults.set(key, defaultBranchOf(directory, remote));

    return defaults.get(key);
  };

  return found
    .map(({ text, name, unknowable, directory, remote = DEFAULT_REMOTE }) => (name === undefined ? { text, unknowable } : { text, branch: protectedBranchOf(name, () => defaultOf(directory, remote)) }))
    .filter((entry) => entry.unknowable !== undefined || entry.branch !== undefined);
}
