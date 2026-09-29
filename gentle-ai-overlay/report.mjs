/**
 * How results are shown and what they mean as an exit code, shared by check, apply and the hook.
 *
 * Exit codes: 0 every invariant held; 1 at least one broken; 2 none broken but at least one could
 * not be verified. Unverifiable is never folded into 0: a check that could not look did not pass.
 */
import path from 'node:path';

const LABEL = { held: 'HELD        ', broken: 'BROKEN      ', unverifiable: 'UNVERIFIABLE' };

export const OVERLAY_DIR = '$HOME/.claude/gentle-ai-overlay';
export const APPLY_COMMAND = `node "${OVERLAY_DIR}/apply.mjs"`;
export const CHECK_COMMAND = `node "${OVERLAY_DIR}/check.mjs"`;

const location = (result) => (result.file === undefined ? '' : ` (~/${result.file.split(path.sep).join('/')})`);

export const formatResult = (result) => `${LABEL[result.status]} ${result.id}${location(result)} — ${result.detail}`;

export function exitCodeFor(results) {
  if (results.some((result) => result.status === 'broken')) return 1;
  if (results.some((result) => result.status === 'unverifiable')) return 2;
  return 0;
}

/** The advisory for a session that starts with drift, naming exactly what to run or do by hand. */
export function driftAdvisory(results) {
  const drifted = results.filter((result) => result.status !== 'held');
  const restorable = drifted.some((result) => result.status === 'broken' && result.reapplicable);
  const remedies = [...new Set(drifted.filter((result) => result.status === 'broken' && !result.reapplicable).map((result) => result.remedy))];
  return [
    `[gentle-ai overlay] ${drifted.length} local customization(s) of what gentle-ai manages are not intact:`,
    ...drifted.map((result) => `  ${formatResult(result)}`),
    ...(restorable ? [`Restore the reapplicable ones with: ${APPLY_COMMAND}`] : []),
    ...remedies,
    `Re-check with: ${CHECK_COMMAND}`,
  ].join('\n');
}
