/**
 * The payload a hook receives on stdin, parsed once for everything the dispatcher reads from it. A UTF-8
 * BOM (PowerShell pipes add one) is stripped; text that is not JSON gives `undefined`, never a throw: a
 * payload the dispatcher cannot read must not stop the guards from deciding.
 *
 * @es El payload que un hook recibe por stdin, parseado una vez para todo lo que el dispatcher lee de él. Se
 * quita un BOM UTF-8 (PowerShell lo añade); un texto que no es JSON da `undefined`, nunca lanza: un payload
 * que el dispatcher no sabe leer no debe impedir que las guardias decidan.
 */

/** The parsed payload, or `undefined` when `raw` is not JSON. @es El payload parseado, o `undefined` si `raw` no es JSON. */
export function parsePayload(raw) {
  try {
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }
}
