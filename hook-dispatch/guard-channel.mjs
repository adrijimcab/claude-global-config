/**
 * The channel on which the dispatcher announces which guard is running: `announceGuard('start' | 'end',
 * name)` publishes `{ phase, guard }` on the `node:diagnostics_channel` named `GUARD_CHANNEL`. Nothing is
 * published while nobody listens, so a real hook pays one property read per guard. Its only listener is the
 * profiling preload (`spawn-profile.mjs`), which attributes time and child processes to the guard running.
 *
 * @es El canal por el que el dispatcher anuncia qué guardia corre: `announceGuard('start' | 'end', name)`
 * publica `{ phase, guard }` en el `node:diagnostics_channel` llamado `GUARD_CHANNEL`. Sin oyentes no se
 * publica nada, así que un hook real paga una lectura de propiedad por guardia. Su único oyente es la precarga
 * de perfilado (`spawn-profile.mjs`), que atribuye tiempo y procesos hijos a la guardia que corre.
 */

import { channel } from 'node:diagnostics_channel';

/** The channel's name. @es El nombre del canal. */
export const GUARD_CHANNEL = 'hook-dispatch:guard';

const guardChannel = channel(GUARD_CHANNEL);

/** Publishes that `guard` reached `phase`, only when someone listens. @es Publica que `guard` llegó a `phase`, solo si alguien escucha. */
export function announceGuard(phase, guard) {
  if (guardChannel.hasSubscribers) guardChannel.publish({ phase, guard });
}
