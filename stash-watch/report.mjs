/**
 * Renders a stash inventory as the text a reader needs to triage it: per entry, its ref and commit, its
 * age, the branch it was made on, its message, and every file it holds with its line counts.
 *
 * It lists files ONE BY ONE and never summarises them as a count, because the whole lesson of #129 is
 * that the label misleads and the content decides: "6 files" says nothing; `.husky/pre-push +42 -18`
 * says the stash touches a load-bearing hook.
 *
 * @es Presenta un inventario de stashes con lo necesario para triarlo: ref y commit, edad, rama, mensaje
 * y cada fichero con sus líneas. Lista fichero a fichero y nunca un recuento, porque la lección de #129
 * es que la etiqueta engaña y el contenido decide.
 */

const DAY_MS = 86_400_000;

/** `+12 -3`, or `binary` when git could not count lines. @es `+12 -3`, o `binary`. */
function lineCounts(change) {
  return change.added === undefined ? 'binary' : `+${change.added} -${change.deleted}`;
}

/** Whole days since `createdAt`, as a phrase. @es Días completos desde la creación. */
function age(createdAt, now) {
  const days = Math.floor((now - createdAt.getTime()) / DAY_MS);

  return days === 0 ? 'made today' : `${days} day${days === 1 ? '' : 's'} old`;
}

/**
 * The lines describing each stash.
 * @param stashes Records from `stashInventory`.
 * @param now Epoch milliseconds the ages are measured against.
 * @es Las líneas que describen cada stash.
 */
export function describeStashes(stashes, now = Date.now()) {
  const lines = [];

  for (const stash of stashes) {
    lines.push(`  ${stash.ref}  ${stash.sha.slice(0, 8)}  ${stash.createdAt.toISOString().slice(0, 10)} (${age(stash.createdAt, now)})`);
    lines.push(`    made on: ${stash.branch ?? '(branch not recorded)'}`);
    lines.push(`    message: ${stash.message}`);

    if (stash.tracked.length === 0 && stash.untracked.length === 0) lines.push('    holds: no file changes (an empty stash)');

    for (const change of stash.tracked) lines.push(`    holds: ${change.path}  ${lineCounts(change)}`);

    for (const file of stash.untracked) lines.push(`    holds: ${file}  (untracked file)`);
  }

  return lines;
}
