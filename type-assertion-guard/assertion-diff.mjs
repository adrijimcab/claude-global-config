/**
 * Decides whether an edit RAISES a file's value-level type assertion count, and — only when it does —
 * which of the "after" occurrences to name as newly added in the refusal.
 *
 * THE DECISION is a plain count comparison: `after.length > before.length`. Nothing else. This is what
 * makes "an assertion moved within the same edit" and "an assertion's inner text changed but the total
 * stayed the same" both ALLOWED — the owner's rule is about the file's assertion count never going up,
 * not about any single occurrence's identity.
 *
 * THE REPORT, once the count did go up, still benefits from naming the right ones: a bag-diff by exact
 * source text matches each "after" occurrence against an unconsumed "before" occurrence of the same
 * text first, and only what is left over — genuinely new text, never seen before this edit — is listed.
 * An assertion physically moved to a different line matches by text and reports nothing; the same text
 * appearing one extra time reports exactly the extra occurrence, at its real position.
 *
 * @es Decide si una edición SUBE el conteo de aserciones de tipo de un fichero, y solo cuando sube,
 * cuáles nombrar como nuevas. LA DECISIÓN es una comparación de conteos: `after.length > before.length`.
 * Nada más — así una aserción MOVIDA en la misma edición, o una cuyo texto interno cambió sin subir el
 * total, quedan PERMITIDAS. EL INFORME usa una diferencia de bolsas por texto exacto: empareja cada
 * aparición de "después" con una de "antes" aún no consumida; lo que sobra es lo genuinamente nuevo.
 */

/**
 * @param {import('./collect-assertions.mjs').AssertionRecord[]} beforeList
 * @param {import('./collect-assertions.mjs').AssertionRecord[]} afterList
 * @returns {import('./collect-assertions.mjs').AssertionRecord[]} The occurrences in `afterList` with no
 *   textually-identical unconsumed match in `beforeList`, in `afterList`'s order.
 */
export function unmatchedAfterAssertions(beforeList, afterList) {
  const remaining = new Map();

  for (const item of beforeList) remaining.set(item.text, (remaining.get(item.text) ?? 0) + 1);

  const unmatched = [];

  for (const item of afterList) {
    const available = remaining.get(item.text) ?? 0;

    if (available > 0) remaining.set(item.text, available - 1);
    else unmatched.push(item);
  }

  return unmatched;
}

/**
 * @returns {boolean} Whether the edit raises the file's total value-level assertion count — the ONLY
 *   question that decides refuse vs. allow.
 */
export function raisesAssertionCount(beforeList, afterList) {
  return afterList.length > beforeList.length;
}
