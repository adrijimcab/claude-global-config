/**
 * The ledger of dirty paths no live session made, written the first time one is seen.
 *
 * WHY A LEDGER AND NOT A BLOCK. The owner's rule is that whoever MADE a change commits and pushes it the
 * same turn. A path no live transcript explains has no maker anyone can reach: a tool process outside any
 * session, a background job, a session that has ended. Blocking would trap whichever unrelated session
 * ends a turn next, and the only exit it has is a dismissal that the next landing invalidates (measured
 * 2026-10-01: three consecutive blocked turn endings). So the guard does not block: it says so in a note
 * on EVERY turn (`decide.mjs`), where the owner sees it, and it records the path here once, so the finding
 * outlives the chat and the backlog can be fed from it. The block is reserved for the maker, as soon as a
 * live session's shell call or write explains the path. THE STATED LIMIT: the ledger is a first-seen
 * record, never a to-do list the guard clears; a path stays listed until someone commits it.
 *
 * @es El registro de rutas sucias que ninguna sesión viva hizo, escrito la primera vez que se ven. La regla
 * del dueño liga al AUTOR: commitea y sube lo suyo el mismo turno. Una ruta que ningún transcript vivo
 * explica no tiene autor alcanzable (un proceso fuera de sesión, un trabajo en segundo plano, una sesión
 * terminada). Bloquear atraparía a la siguiente sesión ajena que cierre un turno, y su única salida es un
 * descarte que el siguiente aterrizaje invalida (medido el 2026-10-01: tres cierres seguidos bloqueados).
 * Así que NO bloquea: lo dice en una nota en CADA turno, donde el dueño la ve, y lo registra aquí una vez,
 * para que el hallazgo sobreviva al chat. El bloqueo queda para el autor, en cuanto el shell o una
 * escritura de una sesión viva explique la ruta. LÍMITE DECLARADO: es un registro de primera vista, no
 * una lista que la guardia limpie; la ruta sigue listada hasta que alguien la commitee.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LEDGER = path.join(HERE, 'state', 'pending.jsonl');

/** The `repo|path` keys already recorded in `ledger`; an unreadable ledger knows none. @es Las claves `repo|path` ya registradas. */
function recordedKeys(ledger, read) {
  const keys = new Set();

  try {
    for (const line of read(ledger).split('\n')) {
      try {
        const record = JSON.parse(line);

        keys.add(`${record.repo}|${record.path}`);
      } catch {
        continue;
      }
    }
  } catch {
    return keys;
  }

  return keys;
}

/**
 * Records each `{ repo, path }` of `entries` not yet in the ledger, with the time and the session that saw
 * it; returns the ones written. A ledger that cannot be written loses evidence, never a decision.
 * @es Registra cada `{ repo, path }` de `entries` que aún no esté, con la hora y la sesión; devuelve las
 * escritas. Un registro que no se puede escribir pierde evidencia, nunca una decisión.
 */
export function recordUnexplained(entries, session, { ledger = DEFAULT_LEDGER, read = (file) => readFileSync(file, 'utf8'), now = () => new Date() } = {}) {
  const known = recordedKeys(ledger, read);
  const fresh = entries.filter((entry) => !known.has(`${entry.repo}|${entry.path}`));

  if (fresh.length === 0) return [];

  try {
    mkdirSync(path.dirname(ledger), { recursive: true });
    appendFileSync(ledger, fresh.map((entry) => `${JSON.stringify({ at: now().toISOString(), session, ...entry })}\n`).join(''), 'utf8');
  } catch {
    return [];
  }

  return fresh;
}
