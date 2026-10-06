#!/usr/bin/env node
/**
 * `PreToolUse` guard on delegation and resume — a brief must not instruct its worker to do what the
 * worker's own environment will refuse. The decision lives in `feasibility.mjs`; this file is the hook
 * shim: read the payload, decide, journal a refusal, and explain it.
 *
 * WHY THIS EXISTS. `instructed-a-worker-to-run-a-denied-command` recurred three times, every time the
 * orchestrator's and every time caught by the WORKER hitting the wall: a brief ordered `git rebase`,
 * which the permission layer denies; a brief told a worker already isolated in a worktree to
 * `git worktree add` another and work there, which stranded it; and briefs told worktree workers to run
 * `node .claude/diff-coverage/diff-coverage.mjs`, a gitignored path that exists only in the main
 * checkout. A rule in the contract did not stop the third occurrence, so this is the mechanism.
 *
 * WHERE THE BRIEF LIVES is not this guard's knowledge: `briefOf` in `brief-provenance/provenance.mjs`
 * owns which tool carries its text in which field, proven against RECORDED harness payloads. Its tools
 * are this guard's registration, declared in `guard.mjs.hook-registration.json`.
 *
 * FAILS OPEN on every malfunction of its own: a guard able to wedge delegation is a larger hazard than
 * the one it closes.
 *
 * @es Guard de `PreToolUse` sobre delegación y resume: un brief no debe ordenar a su worker lo que su
 * propio entorno rechazará. La decisión vive en `feasibility.mjs`; este fichero es el shim. Existe porque
 * la lección recurrió tres veces y siempre la cazó el WORKER al chocar. Dónde vive el brief lo decide
 * `briefOf` de `brief-provenance`. FALLA ABIERTO ante todo fallo propio.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { briefOf } from '../brief-provenance/provenance.mjs';
import { FACES, inspectFeasibility } from './feasibility.mjs';

/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('brief-feasibility');

/** What each face means, in one sentence the author can act on. @es Qué significa cada cara. */
const FACE_TITLES = {
  [FACES.DENIED_COMMAND]: 'DENIED COMMAND — the worker\'s permission settings refuse this command\n  @es COMANDO DENEGADO — los permisos del worker rechazan este comando',
  [FACES.WORKTREE_INSIDE_A_WORKTREE]: 'WORKTREE INSIDE A WORKTREE — the worker already runs in a linked worktree\n  @es WORKTREE DENTRO DE UN WORKTREE — el worker ya corre en un worktree enlazado',
  [FACES.RELATIVE_TOOLING_PATH]: 'RELATIVE TOOLING PATH — gitignored tooling does not exist in the worker\'s worktree\n  @es RUTA RELATIVA A TOOLING — el tooling gitignorado no existe en el worktree del worker'
};

function journal(entry) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(join(stateDirectory(), 'refusals.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* the journal is evidence, never a precondition: its failure must not change the decision */
  }
}

/** One block per finding: the face, the offending line, what goes wrong, and the working alternative. @es Un bloque por hallazgo. */
function describe({ face, lineNumber, line, detail, alternative }) {
  return [FACE_TITLES[face], `  line ${lineNumber}: ${line.trim()}`, `  why: ${detail}`, `  instead: ${alternative}`, ''];
}

function reason(refusal) {
  return [
    `BRIEF-FEASIBILITY REFUSED this ${refusal.surface} (${refusal.toolName}): it instructs the worker to do something its own environment will refuse or cannot resolve.`,
    '',
    ...refusal.findings.flatMap(describe),
    'HOW AN INSTRUCTION IS TOLD FROM A MENTION. A command counts as instructed when it sits in a code span',
    'whose clause carries no prohibition word (never, not, no, denied, refused, forbidden, nunca, …), in a',
    'fenced block not introduced by such a line, or on a line that begins with Run / Ejecuta. So to WARN a',
    'worker about a command, say it in the same clause: "`git rebase` is denied here". To ORDER a step,',
    'order one the worker can carry out, from where it runs.',
    '',
    'Why this is refused rather than suggested: each of these reached a worker as an order and was caught',
    'only when the worker hit the wall — a denied `git rebase`, a stranded worker told to `git worktree add`',
    'from inside its own worktree, and `node .claude/diff-coverage/diff-coverage.mjs` run where `.claude/`',
    'does not exist.',
    '',
    '@es BRIEF-FEASIBILITY rechazó este brief: ordena al worker algo que su propio entorno rechazará o no',
    '@es podrá resolver. Cada bloque de arriba nombra la cara, la línea y la alternativa que sí funciona.',
    '@es Un comando cuenta como ORDEN cuando está en un span de código cuya cláusula no lleva palabra de',
    '@es prohibición (never, not, no, denied, nunca, prohibido…), en un bloque cercado no introducido por',
    '@es una, o en una línea que empieza con Run / Ejecuta. Para AVISAR de un comando, dilo en la misma',
    '@es cláusula («`git rebase` is denied here»); para ORDENAR un paso, ordena uno que el worker pueda',
    '@es ejecutar desde donde corre.'
  ].join('\n');
}

/**
 * The hook output for a raw payload (deny when the brief instructs something infeasible), or
 * `undefined`. Exported so `~/.claude/hook-dispatch/dispatch.mjs` can run it in its own process.
 * @es La salida del hook para un payload crudo, o `undefined`. Exportada para el dispatcher.
 */
export function evaluate(raw) {
  let payload;

  try {
    // A PowerShell-written payload can carry a UTF-8 BOM, which makes JSON.parse throw.
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

    payload = JSON.parse(text);
  } catch {
    return undefined;
  }

  const brief = briefOf(payload);

  if (brief === undefined) return undefined;

  const refusal = inspectFeasibility(brief, payload);

  if (refusal === undefined) return undefined;

  journal({
    at: new Date().toISOString(),
    session: payload?.session_id,
    tool: refusal.toolName,
    location: refusal.location.evidence,
    findings: refusal.findings.map(({ face, lineNumber }) => ({ face, lineNumber }))
  });

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason(refusal)
    }
  };
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

    if (output !== undefined) console.log(JSON.stringify(output));
  } catch {
    /* a malfunction of this guard allows the delegation */
  }

  process.exit(0);
}

// Only as the main process. When the dispatcher or a selftest imports this module, main() must not
// run: it would read the importer's stdin and cut it short with process.exit(0).
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
