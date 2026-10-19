/**
 * The instructions that follow a pending judge's block, fixed in code: record the item, or dismiss it with a
 * written reason. The model names the item (`prompt.mjs`); this text says what to do about it, so the command and
 * the session id are exact and not a model's recollection.
 *
 * @es Las instrucciones que siguen al bloqueo del juez de pendientes, fijas en código: registrar el ítem o
 * descartarlo con un motivo escrito. El modelo nombra el ítem; este texto dice qué hacer, con el comando y el id
 * de sesión exactos.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findCandidate } from '../backlog-guard/announcement.mjs';

const DISMISS_CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backlog-guard', 'dismiss.mjs');

/**
 * The block text for the hook input `payload`.
 * @es El texto del bloqueo para la entrada `payload`.
 */
export function appendix(payload) {
  const session = typeof payload?.session_id === 'string' && payload.session_id !== '' ? payload.session_id : 'unknown';
  const marker = findCandidate(payload?.last_assistant_message) ?? 'pending-judge';

  return [
    'Your final message leaves the item above for later and this turn saved nothing to the master backlog.',
    '@es Tu mensaje final deja el ítem de arriba para después y este turno no guardó nada en el backlog maestro.',
    '',
    'Do exactly ONE of these, then stop again:',
    '@es Hacé exactamente UNA de estas, y terminá de nuevo:',
    '',
    '  A) RECORD IT. Read the CURRENT master backlog first, then write the FULL revision back with the item added:',
    '     mem_save with topic_key "backlog/<milestone>-master", or mem_update on the master observation id,',
    '     or commit the versioned document: git commit -- <repo>/checklists/master-backlog.md',
    '     (also via node .../backup-repo.mjs commit … -- checklists/master-backlog.md).',
    '  @es A) REGISTRALO. Leé primero el backlog maestro ACTUAL y reescribí la revisión COMPLETA con el ítem sumado:',
    '  @es    mem_save con topic_key "backlog/<hito>-master", o mem_update sobre el id de la observación maestra,',
    '  @es    o commiteá el documento versionado: git commit -- <repo>/checklists/master-backlog.md',
    '  @es    (también con node .../backup-repo.mjs commit … -- checklists/master-backlog.md).',
    '',
    '  B) DISMISS IT, with a reason that is written down:',
    '  @es B) DESCARTALO, con un motivo que queda escrito:',
    `       node "${DISMISS_CLI}" --session ${session} --marker "${marker}" --reason "why this is not a pending item here"`,
    '',
    'This judge blocks at most twice per turn. @es Este juez bloquea como mucho dos veces por turno.',
  ].join('\n');
}
