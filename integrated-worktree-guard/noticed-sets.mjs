/**
 * Which SETS a session has already been shown, so a refusal fires at most once per turn-set.
 *
 * A set is identified by a fingerprint string (the worktrees and their tips). The file maps a session id to
 * the last fingerprint it was shown; the same set in the same session passes, a NEW set changes the
 * fingerprint and is shown again, and a NEW session has seen nothing. The refusal is therefore cleared by
 * being SEEN, not by an action, which is the same honest scope `stash-watch` states.
 *
 * Remembering is done BEFORE the refusal and its failure allows: without the record the refusal could not
 * stay at once-per-set, and one that repeats every turn wedges the session. At most 100 sessions are kept so
 * the file stays bounded.
 *
 * @es Qué CONJUNTOS ya se le mostraron a una sesión, para que el rechazo salga como mucho una vez por
 * conjunto. El conjunto se identifica con una huella; el mismo conjunto en la misma sesión pasa, uno NUEVO
 * cambia la huella y se muestra de nuevo, y una sesión NUEVA no ha visto nada. Se registra ANTES de rechazar
 * y, si no se puede registrar, deja pasar. Se guardan como mucho 100 sesiones.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REMEMBERED_SESSIONS = 100;
const noticedFile = (stateDir) => path.join(stateDir, 'noticed.json');

function readNoticed(stateDir) {
  try {
    return JSON.parse(readFileSync(noticedFile(stateDir), 'utf8'));
  } catch {
    return {};
  }
}

/** Whether `sessionId` was already shown exactly `fingerprint`. @es Si a `sessionId` ya se le mostró exactamente `fingerprint`. */
export function alreadyShown(stateDir, sessionId, fingerprint) {
  return readNoticed(stateDir)[sessionId]?.seen === fingerprint;
}

/**
 * Records that `sessionId` is being shown `fingerprint`. Returns whether it could be recorded.
 * @es Registra que a `sessionId` se le muestra `fingerprint`. Devuelve si se pudo registrar.
 */
export function markShown(stateDir, sessionId, fingerprint, now = Date.now()) {
  const entries = Object.entries({ ...readNoticed(stateDir), [sessionId]: { seen: fingerprint, at: now } })
    .filter(([, entry]) => typeof entry?.seen === 'string')
    .sort(([, a], [, b]) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .slice(0, REMEMBERED_SESSIONS);

  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(noticedFile(stateDir), JSON.stringify(Object.fromEntries(entries)), 'utf8');

    return true;
  } catch {
    return false;
  }
}
