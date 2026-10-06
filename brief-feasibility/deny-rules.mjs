/**
 * The permission DENY rules that will refuse a worker's shell commands, and whether a command matches one.
 *
 * WHICH FILES, and why these four. A worker inherits the user settings (`~/.claude/settings.json`,
 * `~/.claude/settings.local.json`) and the project settings of the MAIN checkout it was spawned from
 * (`<root>/.claude/settings.json`, `<root>/.claude/settings.local.json`). The project files are read from
 * the main checkout even for a worker in a linked worktree, because `.claude/` is gitignored and a
 * worktree carries no copy; measured evidence that the main checkout's list reaches worktree workers:
 * three workers reported `git rebase` refused on 2026-08-03 (lessons ledger,
 * `instructed-a-worker-to-run-a-denied-command`), and `git rebase` is denied only in
 * `b100-am-ui/.claude/settings.local.json`. Managed (enterprise) settings are not read: none exist here.
 *
 * WHAT A RULE MATCHES, mirroring the permission system rather than improving on it. `Bash(git rebase:*)`
 * is a PREFIX of the command string, so it refuses `git rebase develop` and does not refuse
 * `git -C x rebase develop`; a guard stricter than the permission layer would refuse briefs the worker
 * could in fact carry out. A pattern with no wildcard matches exactly. A `*` anywhere else is a form
 * this module does not model, and such a rule is skipped rather than guessed at. Both `Bash(…)` and
 * `PowerShell(…)` rules apply, because a brief does not say which shell the worker will reach for.
 * I have not verified whether the harness requires a word boundary after a `:*` prefix; this matcher
 * does not, which errs toward refusing.
 *
 * FAILS OPEN per file: an absent or unparseable settings file contributes no rules.
 *
 * @es Las reglas DENY de permisos que rechazarán los comandos de un worker, y si un comando casa con una.
 * Se leen los ajustes de usuario y los del checkout PRINCIPAL (un worktree no lleva copia de `.claude/`).
 * La coincidencia imita al sistema de permisos, sin mejorarlo: `:*` es un PREFIJO de la cadena. Un `*` en
 * otra posición no se modela y la regla se salta. Falla abierto por fichero.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { commandWordIndex } from '../shell-command/shell-command.mjs';

/** The permission tools whose rules govern a shell command. @es Las herramientas cuyas reglas gobiernan un comando de shell. */
const SHELL_TOOLS = ['Bash', 'PowerShell'];

/** The settings files that apply to a worker spawned from `projectRoot`. @es Los ficheros de ajustes que aplican a un worker. */
export function settingsFiles(projectRoot, home = homedir()) {
  return [
    join(home, '.claude', 'settings.json'),
    join(home, '.claude', 'settings.local.json'),
    join(projectRoot, '.claude', 'settings.json'),
    join(projectRoot, '.claude', 'settings.local.json')
  ];
}

/** One rule string (`Bash(git rebase:*)`) as `{ raw, words, prefix }`, or `undefined` when it is not a modelled shell rule. @es Una regla como `{ raw, words, prefix }`. */
export function parseRule(raw) {
  const open = raw.indexOf('(');

  if (open === -1 || !raw.endsWith(')') || !SHELL_TOOLS.includes(raw.slice(0, open))) return undefined;

  const pattern = raw.slice(open + 1, -1);
  const prefix = pattern.endsWith(':*') || pattern.endsWith(' *');
  const body = (prefix ? pattern.slice(0, -2) : pattern).trim();

  if (body.length === 0 || body.includes('*')) return undefined;

  return { raw, words: body.split(' ').filter((word) => word.length > 0), prefix };
}

/** The deny rules of one settings file, each tagged with its source. @es Las reglas deny de un fichero. */
function rulesOf(file) {
  try {
    const deny = JSON.parse(readFileSync(file, 'utf8'))?.permissions?.deny;

    return Array.isArray(deny) ? deny.flatMap((raw) => {
      const rule = typeof raw === 'string' ? parseRule(raw) : undefined;

      return rule === undefined ? [] : [{ ...rule, source: file }];
    }) : [];
  } catch {
    return [];
  }
}

/** Every modelled deny rule that applies to a worker spawned from `projectRoot`. @es Toda regla deny que aplica al worker. */
export function denyRules(projectRoot, home = homedir()) {
  return settingsFiles(projectRoot, home).flatMap(rulesOf);
}

/** The first deny rule `words` falls under, or `undefined`. @es La primera regla deny que casa con `words`. */
export function matchingRule(words, rules) {
  const at = commandWordIndex(words);

  if (at === -1) return undefined;

  const command = words.slice(at).join(' ');

  return rules.find((rule) => {
    const body = rule.words.join(' ');

    return rule.prefix ? command.startsWith(body) : command === body;
  });
}
