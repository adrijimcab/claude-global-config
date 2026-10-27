/**
 * The DECISION of the brief-feasibility guard: does a brief instruct its worker to do something the
 * worker's own environment will refuse or cannot resolve?
 *
 * Five faces, the first three each a measured incident of `instructed-a-worker-to-run-a-denied-command`:
 *   - `denied-command` — an instructed command falls under a permission DENY rule that applies to the
 *     worker (a brief ordered `git rebase`, which `b100-am-ui/.claude/settings.local.json` denies);
 *   - `worktree-inside-a-worktree` — a worker that already runs in a linked worktree is told to create
 *     another (`git worktree add`) or to call `EnterWorktree`: the worktree-isolation guard then refuses
 *     every shell call, and `ExitWorktree` is refused to subagents, so the worker is stranded;
 *   - `relative-tooling-path` — a worker in a linked worktree is told to use a `.claude/…` file by a
 *     RELATIVE path, where that file is gitignored and exists only in the main checkout.
 *   - `worker-git-refused` — an instructed git command `worker-git-guard` refuses to every delegated worker
 *     (`git switch`, `git checkout -- <path>`), asked of the guard's own decision (`worker-git.mjs`);
 *   - `shell-less-role` — an `Agent` brief tells a role whose definition reaches no shell tool to run git or npm
 *     (`shell-less-role.mjs`).
 * Each finding carries the line, the face and the working alternative, so the refusal can say all three.
 *
 * It decides FEASIBILITY, never wisdom: a brief that orders something permitted but unwise passes.
 *
 * @es La DECISIÓN del guard: ¿ordena el brief algo que el entorno del worker rechazará o no podrá
 * resolver? Cinco caras: un comando que casa con una regla DENY, crear o entrar en otro worktree desde un
 * worktree, una ruta RELATIVA a tooling gitignorado que solo existe en el checkout principal, un comando git
 * que `worker-git-guard` rechaza a todo worker (preguntado a su propia decisión), y git o npm ordenados a un rol
 * cuya definición no alcanza ningún shell. Decide FACTIBILIDAD, nunca sensatez.
 */

import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

import { commandWordIndex, executableName } from '../shell-command/shell-command.mjs';

import { denyRules, matchingRule } from './deny-rules.mjs';
import { instructedCommands, instructedMentions, referencedCommands } from './instructions.mjs';
import { shellLessRoleRefusals } from './shell-less-role.mjs';
import { workerGitRefusals } from './worker-git.mjs';
import { workerLocation } from './worker-location.mjs';

export const FACES = Object.freeze({
  DENIED_COMMAND: 'denied-command',
  WORKTREE_INSIDE_A_WORKTREE: 'worktree-inside-a-worktree',
  RELATIVE_TOOLING_PATH: 'relative-tooling-path',
  WORKER_GIT_REFUSED: 'worker-git-refused',
  SHELL_LESS_ROLE: 'shell-less-role'
});

/** The harness tool a brief may tell a worker to call to change its worktree. @es La herramienta del harness que cambia de worktree. */
const ENTER_WORKTREE = 'EnterWorktree';

/** Relative spellings of the gitignored tooling directory. @es Grafías relativas del directorio de tooling. */
const RELATIVE_TOOLING_PREFIXES = ['.claude/', './.claude/', '.claude\\', '.\\.claude\\'];

/**
 * The permitted route for the commands the deny lists of this fleet refuse most, keyed by the rule's
 * first two words. A rule with no entry gets the general alternative.
 * @es La ruta permitida para los comandos que más rechazan las listas deny de esta flota.
 */
const ALTERNATIVES = new Map([
  ['git rebase', 'create a branch from the target with `git switch -c <new-branch> <target>` and `git cherry-pick` the commits onto it'],
  ['git push', 'leave the push to the orchestrator or the owner, and have the worker report its branch and commits'],
  ['git reset', 'have the worker make a new commit, or branch afresh from the target with `git switch -c`'],
  ['git restore', 'have the worker commit or report the change; discarding work is the orchestrator\'s decision'],
  ['git checkout', 'have the worker commit or report the change; discarding work is the orchestrator\'s decision'],
  ['git clean', 'have the worker list the untracked files in its report; deleting them is the orchestrator\'s decision'],
  ['rm -rf', 'have the worker list what should go; the orchestrator deletes it'],
  ['rm -fr', 'have the worker list what should go; the orchestrator deletes it']
]);

const GENERAL_ALTERNATIVE = 'do that step yourself as orchestrator, or state the command as the prohibition it is and name a route the settings permit';

/** The alternative for a matched rule. @es La alternativa para una regla casada. */
function alternativeFor(rule) {
  return ALTERNATIVES.get(rule.words.slice(0, 2).join(' ')) ?? GENERAL_ALTERNATIVE;
}

/** True for a `git … worktree add` command; git's global options may sit between. @es Verdadero para `git … worktree add`. */
function isWorktreeAdd(words) {
  const at = commandWordIndex(words);
  const subcommand = words.indexOf('worktree', at + 1);

  return at !== -1 && executableName(words[at]) === 'git' && subcommand !== -1 && words.at(subcommand + 1) === 'add';
}

/** True when `relativePath` names a FILE in `mainCheckout` that git ignores there. @es Verdadero si la ruta nombra un fichero ignorado por git. */
function isGitignoredFile(mainCheckout, relativePath) {
  try {
    if (!statSync(join(mainCheckout, relativePath)).isFile()) return false;
  } catch {
    return false;
  }

  // `git check-ignore` owns the ignore semantics; exit 0 = ignored, 1 = not, anything else = unknown,
  // which fails open like every other malfunction of this guard.
  const result = spawnSync('git', ['-C', mainCheckout, 'check-ignore', '-q', '--', relativePath], { encoding: 'utf8', timeout: 5000 });

  return result.status === 0;
}

/** Denied-command findings. @es Hallazgos de comando denegado. */
function deniedCommands(instructions, rules) {
  return instructions.flatMap(({ lineNumber, line, commands }) => commands.flatMap(({ words, text }) => {
    const rule = matchingRule(words, rules);

    return rule === undefined ? [] : [{ face: FACES.DENIED_COMMAND, lineNumber, line, detail: `\`${text.trim()}\` falls under the deny rule ${rule.raw} (${rule.source})`, alternative: alternativeFor(rule) }];
  }));
}

/** Worktree-inside-a-worktree findings. @es Hallazgos de worktree dentro de un worktree. */
function nestedWorktrees(instructions, text, location) {
  const alternative = 'let the worker stay in the worktree it already has: `git switch -c <new-branch> <base>` there, then `git cherry-pick` its commits onto that branch';
  const adds = instructions.flatMap(({ lineNumber, line, commands }) => commands.filter(({ words }) => isWorktreeAdd(words)).map(({ text: command }) => ({ face: FACES.WORKTREE_INSIDE_A_WORKTREE, lineNumber, line, detail: `\`${command.trim()}\` creates a worktree while ${location.evidence}; the worktree-isolation guard then refuses the worker's shell calls, and ExitWorktree is refused to subagents`, alternative })));
  const enters = instructedMentions(text, ENTER_WORKTREE).map(({ lineNumber, line }) => ({ face: FACES.WORKTREE_INSIDE_A_WORKTREE, lineNumber, line, detail: `${ENTER_WORKTREE} moves a worker that already runs in a linked worktree (${location.evidence}); ExitWorktree is refused to subagents, so it cannot come back`, alternative }));

  return [...adds, ...enters];
}

/** Relative-tooling-path findings, over every command the brief refers to, ordered or named. @es Hallazgos de ruta relativa a tooling, sobre todo comando al que se refiere el brief, ordenado o nombrado. */
function relativeToolingPaths(references, location) {
  return references.flatMap(({ lineNumber, line, commands }) => commands.flatMap(({ words }) => words.flatMap((word) => {
    const prefix = RELATIVE_TOOLING_PREFIXES.find((candidate) => word.startsWith(candidate));

    if (prefix === undefined) return [];

    const relativePath = word.startsWith('.claude') ? word : word.slice(2);

    if (!isGitignoredFile(location.mainCheckout, relativePath)) return [];

    const absolute = join(location.mainCheckout, relativePath);

    return [{ face: FACES.RELATIVE_TOOLING_PATH, lineNumber, line, detail: `\`${word}\` is gitignored and exists only in the main checkout, so it resolves to nothing in the worker's worktree (${location.evidence})`, alternative: `use the absolute path: ${absolute}` }];
  })));
}

/**
 * Every infeasible instruction in `brief` (from `briefOf`), or `undefined` when there is none.
 * @es Toda instrucción infactible del brief, o `undefined` si no hay ninguna.
 */
export function inspectFeasibility(brief, payload, { processCwd = process.cwd(), home } = {}) {
  const instructions = instructedCommands(brief.text);
  const location = workerLocation(payload, brief.text, processCwd);
  const findings = [
    ...deniedCommands(instructions, denyRules(location.mainCheckout, home)),
    ...workerGitRefusals(instructions, location.mainCheckout).map((finding) => ({ face: FACES.WORKER_GIT_REFUSED, ...finding })),
    ...shellLessRoleRefusals(instructions, payload, location.mainCheckout, home === undefined ? undefined : join(home, '.claude')).map((finding) => ({ face: FACES.SHELL_LESS_ROLE, ...finding })),
    ...(location.linkedWorktree ? [...nestedWorktrees(instructions, brief.text, location), ...relativeToolingPaths(referencedCommands(brief.text), location)] : [])
  ];

  return findings.length === 0 ? undefined : { findings, toolName: brief.toolName, surface: brief.surface, location };
}
