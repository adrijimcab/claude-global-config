/**
 * The Wilson score interval of a proportion: how far a rate measured on `n` cases can be from the rate the cases
 * were drawn from. A judge's rates are measured on few cases (a packet of ten replies, a day of stops), where the
 * plain `k/n` says nothing about its own uncertainty and the normal interval leaves [0, 1] at k = 0 or k = n; the
 * Wilson interval stays inside it and is the one `../voice-judge/DECISION.md` fixes its rule on.
 *
 * @es El intervalo de Wilson de una proporción: cuánto puede distar una tasa medida en `n` casos de la tasa de la
 * que salieron. Las tasas de un juez se miden en pocos casos (un paquete de diez respuestas, un día de paradas),
 * donde el simple `k/n` no dice nada de su incertidumbre y el intervalo normal se sale de [0, 1] en k = 0 o k = n;
 * el de Wilson queda dentro, y es sobre el que `../voice-judge/DECISION.md` fija su regla.
 */

/** The two-sided 95% normal quantile. @es El cuantil normal bilateral del 95%. */
export const Z95 = 1.959963984540054;

/**
 * The Wilson interval of `k` successes in `n` cases at quantile `z`: `{ rate, low, high }`, or `undefined` when
 * `n` is not a positive integer or `k` is not an integer between 0 and `n` (no cases is no measurement, never 0%).
 * @es El intervalo de Wilson de `k` éxitos en `n` casos con el cuantil `z`, o `undefined` cuando `n` no es un entero
 * positivo o `k` no es un entero entre 0 y `n` (sin casos no hay medición, nunca un 0%).
 */
export function wilson(k, n, z = Z95) {
  if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(k) || k < 0 || k > n) return undefined;

  const rate = k / n;
  const z2 = z * z;
  const centre = rate + z2 / (2 * n);
  const spread = z * Math.sqrt((rate * (1 - rate)) / n + z2 / (4 * n * n));
  const scale = 1 + z2 / n;

  return { rate, low: Math.max(0, (centre - spread) / scale), high: Math.min(1, (centre + spread) / scale) };
}

/** A share in [0, 1] as a percentage with one decimal. @es Una proporción en [0, 1] como porcentaje con un decimal. */
export const percentOf = (share) => `${(100 * share).toFixed(1)}%`;

/**
 * `k/n` with its rate and Wilson interval, as the reports print it: `3/10 = 30.0% (Wilson 95% 10.8%-60.3%)`, or
 * `0/0 (not measured)` with no cases. @es `k/n` con su tasa e intervalo de Wilson, o `0/0 (no medido)` sin casos.
 */
export function describeRate(k, n) {
  const interval = wilson(k, n);

  if (interval === undefined) return { en: `${k}/${n} (not measured)`, es: `${k}/${n} (no medido)` };

  const shown = `${k}/${n} = ${percentOf(interval.rate)} (Wilson 95% ${percentOf(interval.low)}-${percentOf(interval.high)})`;

  return { en: shown, es: shown };
}
