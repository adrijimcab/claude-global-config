/**
 * Which writes of one `PreToolUse` call land INSIDE the tree a running full chain measures — the decision of
 * `write-guard.mjs` (lesson `tree-written-during-its-full-chain`).
 *
 * WHAT A CHAIN SEES. The selftest runner's escape verdict (`selftest-runner/sandbox-verdict.mjs`) compares
 * `git status --porcelain` of the tree under test before and after each selftest (`selftest-runner/tree-status.mjs`:
 * status code, size and mtime of every listed path), and a project chain builds and tests the files of its tree.
 * So three kinds of call change what a chain measures, and all three are counted:
 *   - a file write through an edit tool (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`);
 *   - a file write through a shell line, as the shared lexer reads it (`write-targets/tool-call-writes.mjs`:
 *     redirections, `sed -i`, `tee`, `cp`/`mv`, the PowerShell content and copy cmdlets);
 *   - a git command that changes what `git status` lists (`add`, `commit`, `reset`, `checkout`...), read through the
 *     shared parser (`shell-command/git-invocations.mjs`) and acting in the directory `-C` and the line's `cd`s give
 *     it (`company-remote/invocation-directory.mjs`). A `git add` moves a path from ` M` to `M `, a `git commit`
 *     removes it from the listing: each is a `changed`/`removed` escape for whichever selftest is running.
 *
 * WHAT IS NOT INSIDE. A path in a NESTED git tree under the measured one (a worktree under `.claude/worktrees/`, a
 * repository checked out inside) belongs to another tree: the chain's `git status` does not list it, and refusing it
 * would freeze every worker whose worktree lives under the main checkout while a chain runs there. A nested tree is
 * recognised by a `.git` entry (directory or worktree file) in a directory between the target and the measured tree.
 *
 * NOT COUNTED, stated: a write made by a child process (`node script.mjs`, `npm run x`), which no lexer can see; a
 * target the lexer reports as unresolvable (a variable, an unknowable `cd`), allowed as both other callers of the
 * lexer allow it; `git --work-tree=<dir>`, whose acting tree is not followed. And `TEMP/claude`, which the captured
 * rule also names: MEASURED, no detector of the selftest runner reads it — each selftest gets a PRIVATE temp
 * (`selftest-runner/sandbox.mjs`, `<tmpdir>/selftest-sandbox-XXXX/temp`), and the verdict reads only the sandbox
 * home, that private temp and the tree. Refusing writes there would block every session's scratch for no measured
 * effect. So, by the verdict's own code, only the tree writes of 2026-10-26 (the edit and the commit of
 * checklists/master-backlog.md) could turn a selftest red; which write reddened which of the three was not recorded.
 *
 * @es Qué escrituras de una llamada `PreToolUse` caen DENTRO del árbol que mide una cadena completa en marcha: la
 * decisión de `write-guard.mjs`. QUÉ VE UNA CADENA: el veredicto de fugas del runner compara el `git status` del
 * árbol antes y después de cada selftest, y una cadena de proyecto construye y prueba los ficheros de su árbol. Por eso
 * cuentan tres clases de llamada: la escritura de una herramienta de edición, la escritura de una línea de shell según
 * el lexer compartido, y un comando git que cambia lo que lista `git status` (`add`, `commit`, `reset`...), en el
 * directorio donde actúa. NO ESTÁ DENTRO una ruta de un árbol git ANIDADO (un worktree bajo `.claude/worktrees/`):
 * el `git status` de la cadena no la lista, y rechazarla congelaría a todo worker cuyo worktree vive bajo el checkout
 * principal. NO SE CUENTA, dicho: lo que escribe un proceso hijo, un destino no resoluble, `--work-tree`, y
 * `TEMP/claude`: MEDIDO, ningún detector del runner lo lee (cada selftest tiene su temporal PRIVADO); por el
 * propio código del veredicto, solo las escrituras en el árbol del 2026-10-26 (la edición y el commit) pudieron poner
 * rojo un selftest; qué escritura puso rojo a cuál de los tres no quedó registrado.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { callDirectory, toolCallWrites } from '../write-targets/tool-call-writes.mjs';
import { isWithin } from '../worker-git-guard/repository-layout.mjs';

/**
 * The git subcommands that change what `git status` lists in the tree they act in: they write the index, the
 * working files, or move HEAD. Every other subcommand (`status`, `log`, `diff`, `show`, `fetch`, `rev-parse`...)
 * only reads the tree and passes. `stash list` and `stash show` read only too.
 * @es Los subcomandos de git que cambian lo que lista `git status` en el árbol donde actúan; el resto solo lee.
 */
const STATUS_CHANGING = new Set(['add', 'am', 'apply', 'checkout', 'cherry-pick', 'clean', 'commit', 'merge', 'mv', 'pull', 'rebase', 'reset', 'restore', 'revert', 'rm', 'stash', 'switch']);

/** Stash verbs that only read. @es Verbos de stash que solo leen. */
const STASH_READS = new Set(['list', 'show']);

/** Whether a git invocation changes what `git status` lists. @es Si una invocación de git cambia lo que lista `git status`. */
const changesStatus = ({ subcommand, args }) => STATUS_CHANGING.has(subcommand) && !(subcommand === 'stash' && STASH_READS.has(args[0]));

/**
 * The status-changing git commands of a shell call, as write targets: the directory each one acts in.
 * @es Los comandos git que cambian el estado, como destinos de escritura: el directorio donde actúa cada uno.
 */
function gitStatusWrites(payload) {
  const dialect = dialectOfTool(payload?.tool_name);
  const script = payload?.tool_input?.command;

  if (dialect === undefined || typeof script !== 'string') return [];

  return gitInvocations(script, dialect, callDirectory(payload))
    .filter(changesStatus)
    .map((invocation) => ({ path: invocationDirectory(invocation), via: `git ${invocation.subcommand}` }));
}

/**
 * Whether `target` lies in a git tree NESTED under `tree`: a directory between them (the target included, `tree`
 * excluded) holds a `.git` entry.
 * @es Si `target` está en un árbol git ANIDADO bajo `tree`: un directorio entre ambos (incluido el destino, excluido
 * `tree`) tiene una entrada `.git`.
 */
function inNestedTree(tree, target, exists) {
  for (let directory = target; isWithin(tree, directory) && path.relative(tree, directory) !== ''; directory = path.dirname(directory)) {
    if (exists(path.join(directory, '.git'))) return true;
  }

  return false;
}

/**
 * @param {object} payload A parsed `PreToolUse` payload.
 * @param {string} tree The absolute tree a running chain measures.
 * @param {{ exists?: (file: string) => boolean }} [seams] Replaces the file-system probe (a test seam).
 * @returns {Array<{ path: string, via: string }>} Every write of the call that lands inside `tree`: the file writes in
 *   call order, then the status-changing git commands in call order.
 * @es Cada escritura de la llamada que cae dentro de `tree`: las de ficheros en orden y luego los comandos git en orden.
 */
export function writesIntoTree(payload, tree, { exists = existsSync } = {}) {
  return [...toolCallWrites(payload), ...gitStatusWrites(payload)]
    .filter((write) => typeof write.path === 'string')
    .filter((write) => isWithin(tree, write.path) && !inNestedTree(tree, write.path, exists))
    .map(({ path: target, via }) => ({ path: target, via }));
}
