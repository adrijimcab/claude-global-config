#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash and PowerShell — worker-git-guard. Refuses the git commands that discard work,
 * move HEAD or skip the commit hooks when the caller is a delegated SUBAGENT; the main session always passes.
 *
 * MEASURED INCIDENTS (other sessions' reports, engram #1543 items 25, 25b, 31). A b100 worker ran the denied
 * `git checkout -- <path>` once and `git reset --soft <sha>` twice; another ran `git reset -q` to unstage
 * although its brief denied every reset form; a Discovery worker ran `git commit -q --no-verify -m "wip: ..."`
 * so commitlint and pre-commit were skipped. ROOT CAUSE: a permission prefix list drifts per shell and
 * matches text, not meaning. This guard parses the invocation instead.
 *
 * WHO IS A WORKER. `hook-caller/identify-caller.mjs`, the one definition the fleet shares.
 * WHAT IS REFUSED. Decided by `forbidden-invocations.mjs` over the parsed command, so a command that is only
 * mentioned (echo, commit message, heredoc) is data and passes. Stash is `worker-stash-guard`'s.
 *
 * A SECOND QUESTION, asked only of a commit the lexical rules allow: does its `-- <paths>` cover an UNTRACKED
 * file, which git leaves out of the commit in silence? `untracked-pathspec.mjs` asks git once; this file only
 * composes the two decisions and journals (`state/unchecked.jsonl`) every commit it could not check.
 *
 * FAILS OPEN on every malfunction of its own: a guard that cannot decide must not silence a safe command.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Rechaza los comandos de git que descartan trabajo, mueven
 * HEAD u omiten los hooks de commit cuando quien llama es un SUBAGENTE delegado; la sesión principal siempre
 * pasa. INCIDENTES MEDIDOS (informes de otras sesiones, engram #1543 ítems 25, 25b, 31). CAUSA RAÍZ: una lista
 * de prefijos permitidos deriva por shell y compara texto, no significado; este guard analiza la invocación.
 * Quién es worker lo decide `hook-caller/identify-caller.mjs`; qué se rechaza, `forbidden-invocations.mjs`.
 * SEGUNDA PREGUNTA, solo para un commit que las reglas léxicas permiten: ¿su `-- <rutas>` cubre un fichero SIN
 * SEGUIMIENTO, que git deja fuera del commit en silencio? `untracked-pathspec.mjs` pregunta a git una vez; este
 * fichero solo compone las dos decisiones y anota (`state/unchecked.jsonl`) cada commit que no pudo comprobar. Falla ABIERTO.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { stateDir } from '../hook-state/locations.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { forbiddenInvocations } from './forbidden-invocations.mjs';
import { refusalText } from './refusal.mjs';
import { listUntracked, untrackedUnderCommits } from './untracked-pathspec.mjs';

/** How many untracked paths a refusal lists before it counts the rest. @es Cuántas rutas sin seguimiento lista una negativa antes de contar el resto. */
const LISTED_PATHS = 10;

/**
 * The journal of the commits this guard could not check: evidence, never a precondition of the decision. A deny is
 * not written here, because the dispatcher already records it in `journal.jsonl`, whose format this file must not mix.
 * @es El journal de los commits que este guard no pudo comprobar: evidencia, nunca precondición de la decisión. Un
 * rechazo no se escribe aquí: el dispatcher ya lo anota en `journal.jsonl`, cuyo formato este fichero no debe mezclar.
 */
function journal(entry) {
  try {
    const directory = stateDir('worker-git-guard');

    mkdirSync(directory, { recursive: true });
    appendFileSync(path.join(directory, 'unchecked.jsonl'),`${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition */
  }
}

/** A path as a shell word: quoted only when it holds whitespace. @es Una ruta como palabra de shell: entrecomillada solo si lleva espacios. */
const shellWord = (file) => (/\s/.test(file) ? `"${file}"` : file);

/**
 * The deny output for a commit whose pathspec covers untracked files, or `undefined` to let it run. A git that
 * could not answer is journaled as `unchecked` and allows the command: a broken git must never block a worker.
 * @es La salida de rechazo para un commit cuyo pathspec cubre ficheros sin seguimiento, o `undefined`. Un git que
 * no pudo responder se anota como `unchecked` y deja correr el comando.
 */
function untrackedRefusal(payload, command, dialect, cwd, list) {
  let found;

  try {
    found = untrackedUnderCommits(command, dialect, cwd, list);
  } catch (error) {
    journal({ verdict: 'unchecked', session: payload.session_id, cwd, reason: error instanceof Error ? error.message.split('\n')[0] : String(error) });

    return undefined;
  }

  for (const miss of found.unchecked) journal({ verdict: 'unchecked', session: payload.session_id, cwd: miss.directory ?? cwd, command: miss.text, reason: miss.reason });

  if (found.offender === undefined) return undefined;

  const { text, files } = found.offender;
  const listed = files.slice(0, LISTED_PATHS).map(shellWord);

  return refusalText('commitUntracked', text, { paths: listed.join(' '), total: files.length });
}

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to let the command run. `decision` and
 * `list` (the git port of `untracked-pathspec.mjs`) are injectable so a selftest can make them fail.
 * @es La salida de hook para un payload crudo, o `undefined` para dejar correr el comando. `decision` y `list` son inyectables.
 */
export function evaluate(raw, decision = forbiddenInvocations, list = listUntracked) {
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string') return undefined;
  if (!isSubagentCaller(payload)) return undefined;

  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
  let offenders;

  try {
    offenders = decision(command, dialect, cwd);
  } catch {
    return undefined; // fail open: a malfunction of the decision must never block a command
  }

  const reason = offenders.length === 0 ? untrackedRefusal(payload, command, dialect, cwd, list) : refusalText(offenders[0].family, offenders[0].text);

  if (reason === undefined) return undefined;

  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
