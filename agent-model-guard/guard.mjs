#!/usr/bin/env node
/**
 * `PreToolUse` guard on `Agent` (and the legacy `Task`): every delegation names its `model`, and `opus` is
 * allowed only for a role whose definition file (`<claude home>/agents/<subagent_type>.md`) declares
 * `model: opus` in its frontmatter. The rule is `rules/10-contracts.md`, orchestration directive, from the
 * owner's directive of 2026-10-18: whatever Sonnet or Haiku can do is done with them, in every session.
 *
 * WHAT IT DOES NOT DO: choosing haiku versus sonnet is a judgment no hook can make; it stays in the rule text,
 * and any non-opus model passes. `SendMessage` and every other tool pass: a resume continues a worker that was
 * already launched with its model.
 *
 * FAILS OPEN on every malfunction of its own (a guard able to wedge delegation is a larger hazard than the one
 * it closes): `main` swallows a throw and exits 0, and the dispatcher reports a throw of `evaluate` as a guard
 * problem, which is how this fleet journals it.
 *
 * @es Guard de `PreToolUse` sobre `Agent` (y el viejo `Task`): toda delegación nombra su `model`, y `opus` solo
 * se permite para un rol cuyo fichero de definición (`<home de claude>/agents/<subagent_type>.md`) declara
 * `model: opus` en su frontmatter. La regla es `rules/10-contracts.md`, directiva de orquestación, por la
 * directiva del dueño del 2026-10-18. NO hace: elegir haiku o sonnet es un juicio que ningún hook puede hacer;
 * cualquier modelo que no sea opus pasa. `SendMessage` y toda otra herramienta pasan. FALLA ABIERTO ante todo
 * fallo propio: `main` traga una excepción y sale con 0, y el dispatcher informa una excepción de `evaluate`
 * como problema de guard, que es como esta flota lo registra.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { noModelReason, opusReason } from './refusal-text.mjs';
import { declaresOpus, OPUS, opusRoles } from './role-model.mjs';

/** The tools this guard judges. @es Las herramientas que juzga este guard. */
const DELEGATION_TOOLS = ['Agent', 'Task'];

/** The hook output (deny) for a delegation payload, or `undefined`. @es La salida de hook (deny) para un payload de delegación, o `undefined`. */
const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

/**
 * The hook output (deny) for a raw payload that breaks the model rule, or `undefined`.
 * Exported so `~/.claude/hook-dispatch/dispatch.mjs` can run it in its own process.
 * @es La salida de hook (deny) para un payload crudo que rompe la regla del modelo, o `undefined`.
 */
export function evaluate(raw) {
  let payload;

  try {
    // A PowerShell-written payload can carry a UTF-8 BOM, which makes JSON.parse throw.
    // @es Un payload escrito por PowerShell puede llevar BOM UTF-8, que hace lanzar a JSON.parse.
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  const toolName = payload?.tool_name;

  if (!DELEGATION_TOOLS.includes(toolName)) return undefined;

  // A delegation without an input object is not a payload this guard understands: it passes.
  // @es Una delegación sin objeto de entrada no es un payload que este guard entienda: pasa.
  if (typeof payload.tool_input !== 'object' || payload.tool_input === null) return undefined;

  const { model, subagent_type: role } = payload.tool_input;

  if (typeof model !== 'string' || model.trim().length === 0) return deny(noModelReason({ toolName, roles: opusRoles() }));

  if (!model.toLowerCase().includes(OPUS) || declaresOpus(role)) return undefined;

  return deny(opusReason({ toolName, role, roles: opusRoles() }));
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  try {
    const output = evaluate(raw);

    if (output !== undefined) process.stdout.write(JSON.stringify(output));
  } catch {
    /* a malfunction of this guard allows the delegation */
  }

  process.exit(0);
}

// Only as the main process: imported by the dispatcher or a selftest, main() must not read their stdin.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
