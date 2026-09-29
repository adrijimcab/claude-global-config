/**
 * La decisión del guard, PURA: dado el comando y una forma de consultar la deriva del overlay,
 * permite o rechaza. No hace I/O propio; quien la llama inyecta `checkDrift` (el CLI usa el
 * `check.mjs` real, el selftest un doble). Así un despachador por evento puede cargarla en proceso.
 *
 * Qué rechaza: un comando que ejecuta `gentle-ai sync` (sin `--dry-run`) mientras el overlay NO
 * está entero. Salida 1 del check = algo roto; salida 2 = algo que no se pudo verificar, y eso
 * también se rechaza, porque sync borraría justo lo que nadie pudo comprobar. Si el check ni
 * siquiera corre, tampoco hay prueba de que sea seguro: se rechaza diciendo por qué.
 *
 * El check solo se consulta cuando hay un sync real que decidir; cualquier otro comando pasa sin
 * costo. `--dry-run` siempre pasa: no escribe nada.
 */
import { DIALECTS } from './shell-words.mjs';
import { syncInvocations } from './sync-invocations.mjs';

const OVERLAY = '$HOME/.claude/gentle-ai-overlay';
const APPLY_COMMAND = `node "${OVERLAY}/apply.mjs"`;
const CHECK_COMMAND = `node "${OVERLAY}/check.mjs"`;
const HEADER = 'GENTLE-AI-SYNC-GUARD REFUSED `gentle-ai sync`';

const ALLOW = Object.freeze({ decision: 'allow' });

export const dialectOfTool = (toolName) => (toolName === 'PowerShell' ? DIALECTS.POWERSHELL : DIALECTS.BASH);

const listed = (results, status) => results.filter((result) => result.status === status).map((result) => `  - ${result.id}: ${result.detail}`);

function fixes(results) {
  const broken = results.filter((result) => result.status === 'broken');
  const reapplicable = broken.some((result) => result.reapplicable);
  const remedies = [...new Set(broken.filter((result) => !result.reapplicable).map((result) => result.remedy).filter(Boolean))];
  return [...(reapplicable ? [`  - Restore the reapplicable ones: ${APPLY_COMMAND}`] : []), ...remedies.map((remedy) => `  - ${remedy}`)];
}

function brokenReason(results) {
  return [
    `${HEADER}: local customizations of gentle-ai-managed files are BROKEN, and sync would erase or overwrite them.`,
    '',
    'Broken:',
    ...listed(results, 'broken'),
    ...(results.some((result) => result.status === 'unverifiable') ? ['', 'Also could not be verified:', ...listed(results, 'unverifiable')] : []),
    '',
    'Fix first:',
    ...fixes(results),
    '',
    `Then re-check (${CHECK_COMMAND}) and sync again. \`gentle-ai sync --dry-run\` is always allowed.`,
  ].join('\n');
}

function unverifiableReason(results) {
  return [
    `${HEADER}: the overlay could NOT VERIFY some customizations, and an unverified state is refused like a broken one —`,
    'sync would overwrite exactly what nobody was able to check.',
    '',
    'Could not be verified:',
    ...listed(results, 'unverifiable'),
    '',
    `Make the check able to answer (for instance, reinstall gentle-ai with \`go install\` so its source is in the Go module cache), re-run ${CHECK_COMMAND}, then sync. \`gentle-ai sync --dry-run\` is always allowed.`,
  ].join('\n');
}

const failureReason = (failure) =>
  [
    `${HEADER}: the overlay check could not run (${failure}), so nothing proves the customizations are intact.`,
    `Run ${CHECK_COMMAND} by hand and fix what stops it. \`gentle-ai sync --dry-run\` is always allowed.`,
  ].join('\n');

const deny = (reason) => ({ decision: 'deny', reason });

/**
 * @param {{ command?: unknown, toolName?: string }} input
 * @param {{ checkDrift: () => ({ exitCode: number, results: object[] } | { failure: string }) }} deps
 * @returns {{ decision: 'allow' } | { decision: 'deny', reason: string }}
 */
export function decide({ command, toolName }, { checkDrift }) {
  if (typeof command !== 'string') return ALLOW;
  const realSyncs = syncInvocations(command, dialectOfTool(toolName)).filter((invocation) => !invocation.dryRun);
  if (realSyncs.length === 0) return ALLOW;
  const drift = checkDrift();
  if (drift.failure !== undefined) return deny(failureReason(drift.failure));
  if (drift.exitCode === 0) return ALLOW;
  if (drift.exitCode === 1) return deny(brokenReason(drift.results));
  if (drift.exitCode === 2) return deny(unverifiableReason(drift.results));
  return deny(failureReason(`unexpected exit code ${drift.exitCode}`));
}
