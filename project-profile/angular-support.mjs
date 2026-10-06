/**
 * The support window of each Angular major and what it means for a project on a given day: `active`, `lts`,
 * `near-eol` (support ends within `NEAR_EOL_DAYS`) or `eol`. A project on an unsupported major gets no
 * security patches, so the session must know it from its first line, once, without being nagged on every turn.
 *
 * Data, measured 2026-10-06 from angular/angular `adev/src/content/reference/releases.md` on the 20.3.x, 21.2.x
 * and 22.2.x branches (v19 LTS ended 2026-05-19; v20 LTS ends 2026-11-28, the 21/22 branches' value, which
 * supersedes the 20 branch's 2026-11-21; v21 LTS and v22 active end 2027-06, given to the month only, so the
 * last day of the month is used; v22 LTS ends 2028-06; v21 active ended 2026-06-03). The active end of v19 and
 * v20 is taken as the next major's release day (2025-05-28, 2025-11-19, `npm view @angular/core time`); both
 * lie in the past, so they never change a status measured today. A major newer than this table is `unknown`, never
 * assumed supported. Update the table when a major ships: angular.dev/reference/releases.
 *
 * @es La ventana de soporte de cada major de Angular y lo que significa para un proyecto en un día dado:
 * `active`, `lts`, `near-eol` (el soporte acaba dentro de `NEAR_EOL_DAYS`) o `eol`. Un proyecto en un major sin
 * soporte no recibe parches de seguridad, así que la sesión debe saberlo desde su primera línea, una vez, sin
 * insistir en cada turno. Datos medidos el 2026-10-06 en `releases.md` de las ramas 20.3.x, 21.2.x y 22.2.x
 * (v19: LTS terminó el 2026-05-19; v20: LTS termina el 2026-11-28, valor de las ramas 21/22 que reemplaza al
 * 2026-11-21 de la rama 20; v21 LTS y v22 activo terminan en 2027-06, dado solo por mes, así que se usa el
 * último día; v22 LTS termina en 2028-06; el activo de v21 terminó el 2026-06-03). El fin del soporte activo de
 * v19 y v20 se toma como el día de salida del major siguiente; ambos están en el pasado, así que no cambian un
 * estado medido hoy. Un major más nuevo que la tabla es `unknown`, nunca se supone con
 * soporte. Actualizar la tabla cuando sale un major.
 */

/** Days before the end of support at which a major counts as near its end. @es Días antes del fin de soporte en que un major cuenta como cerca del fin. */
export const NEAR_EOL_DAYS = 90;

/** Per major: the last day of active support and the last day of LTS (ISO dates). @es Por major: último día de soporte activo y último día de LTS. */
export const SUPPORT = Object.freeze({
  19: Object.freeze({ activeUntil: '2025-05-28', ltsUntil: '2026-05-19' }),
  20: Object.freeze({ activeUntil: '2025-11-19', ltsUntil: '2026-11-28' }),
  21: Object.freeze({ activeUntil: '2026-06-03', ltsUntil: '2027-06-30' }),
  22: Object.freeze({ activeUntil: '2027-06-30', ltsUntil: '2028-06-30' }),
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to` (ISO dates). @es Días completos de `from` a `to`. */
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * The support status of `major` on `today` (an ISO date): `{ status, until }`, where `until` is the date the
 * current phase ends (for `eol`, the date support ended).
 * @es El estado de soporte de `major` en `today`: `{ status, until }`.
 */
export function supportOf(major, today) {
  const window = SUPPORT[major];

  if (window === undefined) return { status: major < 19 ? 'eol' : 'unknown', until: undefined };
  if (today > window.ltsUntil) return { status: 'eol', until: window.ltsUntil };
  if (daysBetween(today, window.ltsUntil) <= NEAR_EOL_DAYS) return { status: 'near-eol', until: window.ltsUntil };

  return today > window.activeUntil ? { status: 'lts', until: window.ltsUntil } : { status: 'active', until: window.activeUntil };
}
