#!/usr/bin/env node
/**
 * `Stop` hook — odd-mirror-guard. The orchestrator may not end a turn while an ODD feature document
 * (`odd/tasks/<feature>.md` in the project root) has no engram mirror (`odd/<feature>/tasks`) or has a mirror
 * older than the file. "The document is in engram" becomes a checked fact instead of a habit.
 *
 * WHY. ODD documents are never versioned in git (owner decision 2026-10-12): the working file and its engram
 * mirror are the only copies. Measured that day in Discovery: 4 documents, 2 mirrors. Prose did not keep this.
 *
 * WHAT IT DECIDES.
 *   - Fires on `Stop` for the orchestrator only; a subagent caller, a `SubagentStop` and a stop already inside
 *     a refusal pass.
 *   - Refuses, bilingually, naming each feature whose mirror is MISSING or STALE (`mirror-verdict.mjs`).
 *   - AT MOST ONCE per session and set of findings (`../integrated-worktree-guard/noticed-sets.mjs`).
 *   - FAILS OPEN on a malfunction of its own (unreadable store, directory or payload) and records it in
 *     `state/observed.jsonl`: an unreadable store is never read as an up-to-date mirror, only as "not measured".
 *
 * @es Hook `Stop`. El orquestador no puede terminar un turno si un documento de feature ODD
 * (`odd/tasks/<feature>.md` en la raíz del proyecto) no tiene espejo en engram (`odd/<feature>/tasks`) o este es
 * más viejo que el fichero. Existe porque los documentos ODD no se versionan (decisión del dueño 2026-10-12) y
 * el fichero más su espejo son las únicas copias. Solo en `Stop` del orquestador; rechaza en los dos idiomas
 * nombrando cada feature con espejo AUSENTE o DESACTUALIZADO; como mucho una vez por sesión y conjunto. FALLA
 * ABIERTO ante una avería propia y la anota: un almacén ilegible nunca se lee como espejo al día.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { stateDir as stateDirOf } from '../hook-state/locations.mjs';
import { alreadyShown, markShown } from '../integrated-worktree-guard/noticed-sets.mjs';
import { featureDocuments } from './feature-documents.mjs';
import { judgeMirrors, mirrorTopicKey } from './mirror-verdict.mjs';
import { refusalText } from './report.mjs';

export { mirrorTopicKey };

/** Where the guard keeps what each session was shown and its own evidence. @es Dónde guarda lo mostrado y su evidencia. */
export const defaultStateDir = () => stateDirOf('odd-mirror-guard');

/** Countable evidence that the guard ran, and of anything that went wrong inside it. @es Evidencia contable de cada ejecución. */
function note(stateDir, record) {
  try {
    mkdirSync(stateDir, { recursive: true });
    appendFileSync(path.join(stateDir, 'observed.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition */
  }
}

/** The project whose documents are read: the one the harness names, else the session's cwd. @es El proyecto cuyos documentos se leen. */
const projectOf = (payload) => process.env.CLAUDE_PROJECT_DIR ?? (typeof payload?.cwd === 'string' ? payload.cwd : process.cwd());

/** One identity for a set of findings, order-independent; a rewritten file is a new finding. @es Una identidad para un conjunto de hallazgos. */
const fingerprintOf = (findings) => findings.map((finding) => `${finding.kind}|${finding.feature}|${finding.documentSeconds}`).sort().join('\n');

/**
 * Decides one `Stop` event. Returns the hook output, or `undefined` to allow silently.
 * @es Decide un evento `Stop`. Devuelve la salida del hook, o `undefined` para dejar pasar.
 */
export function decide(payload, { projectRoot = projectOf(payload), databasePath, stateDir = defaultStateDir(), now = Date.now() } = {}) {
  if (payload?.stop_hook_active === true) return undefined;
  if (isSubagentCaller(payload) || payload?.hook_event_name === 'SubagentStop') return undefined;

  const listed = featureDocuments(projectRoot);

  if (listed.error !== undefined) {
    note(stateDir, { event: 'malfunction', stage: 'list-documents', projectRoot, error: listed.error });
    return undefined;
  }

  const { findings, unmeasured } = judgeMirrors(projectRoot, listed.documents, { databasePath });

  for (const item of unmeasured) note(stateDir, { event: 'malfunction', stage: 'read-mirror', feature: item.feature, error: item.reason });

  if (findings.length === 0) {
    note(stateDir, { event: 'clean', documents: listed.documents.length });
    return undefined;
  }

  const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : 'unknown';
  const fingerprint = fingerprintOf(findings);

  if (alreadyShown(stateDir, sessionId, fingerprint)) {
    note(stateDir, { event: 'already-shown', session: sessionId });
    return undefined;
  }

  // Recorded BEFORE refusing; a failure to record allows, because a refusal that repeats wedges the session.
  // @es Se registra ANTES de rechazar; si no se puede, deja pasar: un rechazo que se repite atasca la sesión.
  if (!markShown(stateDir, sessionId, fingerprint, now)) {
    note(stateDir, { event: 'malfunction', stage: 'record-shown' });
    return undefined;
  }

  note(stateDir, { event: 'block', session: sessionId, features: findings.map((finding) => `${finding.kind}:${finding.feature}`) });

  return { decision: 'block', reason: refusalText(findings) };
}

/**
 * The hook output for a raw `Stop` payload, or `undefined` if the turn may end. Exported so the dispatcher can
 * run it in its own process. A failure of its own allows and is recorded.
 * @es La salida de hook para un payload `Stop` crudo, o `undefined`. Un fallo propio deja pasar y queda anotado.
 */
export function evaluate(raw) {
  try {
    return decide(JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw));
  } catch (error) {
    note(defaultStateDir(), { event: 'malfunction', stage: 'payload', error: error instanceof Error ? error.message : String(error), rawLength: raw.length });

    return undefined;
  }
}

function run() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  const output = evaluate(raw);

  if (output !== undefined) process.stdout.write(JSON.stringify(output));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) run();
