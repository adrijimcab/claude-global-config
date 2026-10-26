/**
 * The windows of the commit-cadence guard, read from `config.json` beside it with a default for every key. A
 * missing file, a non-number, a value that is not positive, or a notice window that is not shorter than the
 * refusal window falls back to the defaults, never to a half-valid mix: a guard that mis-reads its own
 * configuration must not wedge a worker.
 *
 * @es Las ventanas de la guardia de cadencia de commits, leídas de `config.json` con un valor por defecto para
 * cada clave. Un fichero ausente, un valor que no es número positivo, o un aviso que no es más corto que la
 * negativa vuelven a los valores por defecto, nunca a una mezcla a medias: una guardia que lee mal su propia
 * configuración no debe atascar a un worker.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tryParsePayload } from '../hook-io/hook-io.mjs';

/** The defaults, in the units the file uses. @es Los valores por defecto, en las unidades del fichero. */
export const DEFAULTS = Object.freeze({ noticeMinutes: 15, refuseMinutes: 30, remeasureSeconds: 60 });

/** The configuration file next to this module. @es El fichero de configuración junto a este módulo. */
export const CONFIG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'config.json');

const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1000;

const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * The windows in milliseconds: `{ noticeMs, refuseMs, remeasureMs }`.
 * @es Las ventanas en milisegundos.
 */
export function loadConfig(file = CONFIG_FILE) {
  let declared;

  try {
    declared = tryParsePayload(readFileSync(file, 'utf8'));
  } catch {
    declared = undefined;
  }

  const pick = (key) => (positive(declared?.[key]) ? declared[key] : DEFAULTS[key]);
  const windowsAgree = positive(declared?.noticeMinutes) && positive(declared?.refuseMinutes) && declared.noticeMinutes < declared.refuseMinutes;
  const noticeMinutes = windowsAgree ? declared.noticeMinutes : DEFAULTS.noticeMinutes;
  const refuseMinutes = windowsAgree ? declared.refuseMinutes : DEFAULTS.refuseMinutes;

  return { noticeMs: noticeMinutes * MS_PER_MINUTE, refuseMs: refuseMinutes * MS_PER_MINUTE, remeasureMs: pick('remeasureSeconds') * MS_PER_SECOND };
}
