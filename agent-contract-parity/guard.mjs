#!/usr/bin/env node
/**
 * `PreToolUse` guard on delegation: the project's two contracts must carry the same rules before a worker is
 * sent out under them. The decision lives in `parity.mjs`; this file is the hook shim: read the payload, find
 * the project, ask for the verdict and refuse on drift.
 *
 * ONE ENGINE, MANY PROJECTS. Each project opts in with `.claude/agent-contract/anchors.json`
 * (`anchors-file.mjs`); a project without it is not checked. The engine used to live inside one project with
 * its fifty anchors written into the code, and matched with `includes`, so `M1` was carried by `M10`.
 *
 * REFUSES on the positive condition only: drift between two readable contracts, or a declaration that exists
 * but cannot be used (a silent skip of a broken declaration is the defect the check exists to prevent). Absent
 * declaration, an unreadable side and any malfunction of its own allow the delegation: a guard that wedges the
 * fleet when it breaks is a larger hazard than the drift it closes.
 *
 * @es Guard de `PreToolUse` sobre delegación: los dos contratos del proyecto deben llevar las mismas reglas
 * antes de enviar un worker bajo ellos. La decisión vive en `parity.mjs`; este fichero es el shim. UN MOTOR,
 * MUCHOS PROYECTOS: cada proyecto entra con `.claude/agent-contract/anchors.json`; sin él no se comprueba.
 * RECHAZA solo ante la condición positiva: deriva entre dos contratos legibles, o una declaración que existe
 * pero no sirve. Declaración ausente, un lado ilegible y cualquier fallo propio permiten la delegación.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANCHORS_FILE } from './anchors-file.mjs';
import { contractParity } from './parity.mjs';
import { projectRootFor } from './project-root.mjs';
import { refusalReason } from './refusal-text.mjs';

/**
 * The hook output (deny) for a raw payload whose project's contracts drifted or whose declaration is broken,
 * or `undefined`. Exported so `~/.claude/hook-dispatch/dispatch.mjs` can run it in its own process.
 * @es La salida de hook (deny) para un payload crudo, o `undefined`. Exportada para el dispatcher.
 */
export function evaluate(raw) {
  try {
    const payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    const root = projectRootFor(payload, ANCHORS_FILE);

    if (root === undefined) return undefined;

    const reason = refusalReason(contractParity(root));

    if (reason === undefined) return undefined;

    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
  } catch {
    return undefined;
  }
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  const output = evaluate(raw);

  if (output !== undefined) process.stdout.write(JSON.stringify(output));

  process.exit(0);
}

// Only as the main process: imported by the dispatcher or a selftest, main() must not read their stdin.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
