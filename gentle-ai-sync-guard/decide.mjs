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
 *
 * Sync-safe results never block. A result marked `syncSafe` belongs to a customization that sync can
 * only undo, never erase (sync regenerates its canonical text and the overlay apply re-places it), so
 * refusing the sync for it would protect nothing. The verdict is taken from the other results; an exit
 * code of 1 or 2 that no result explains is a malfunction and is refused as one.
 * @es Los resultados seguros ante sync nunca bloquean. Un resultado marcado `syncSafe` pertenece a una
 * personalización que sync solo puede deshacer, nunca borrar (sync regenera su texto canónico y el
 * apply del overlay la vuelve a colocar), así que rechazar el sync por ella no protegería nada. El
 * veredicto sale de los demás resultados; una salida 1 o 2 que ningún resultado explica es una falla y
 * se rechaza como tal.
 */
import { DIALECTS } from './shell-words.mjs';
import { syncInvocations } from './sync-invocations.mjs';

const OVERLAY = '$HOME/.claude/gentle-ai-overlay';
const APPLY_COMMAND = `node "${OVERLAY}/apply.mjs"`;
const CHECK_COMMAND = `node "${OVERLAY}/check.mjs"`;
const HEADER = 'GENTLE-AI-SYNC-GUARD REFUSED `gentle-ai sync`';
const HEADER_ES = 'GENTLE-AI-SYNC-GUARD RECHAZÓ `gentle-ai sync`';

const ALLOW = Object.freeze({ decision: 'allow' });

export const dialectOfTool = (toolName) => (toolName === 'PowerShell' ? DIALECTS.POWERSHELL : DIALECTS.BASH);

const listed = (results, status) => results.filter((result) => result.status === status).map((result) => `  - ${result.id}: ${result.detail}`);

function fixes(results) {
  const broken = results.filter((result) => result.status === 'broken');
  const reapplicable = broken.some((result) => result.reapplicable);
  const remedies = [...new Set(broken.filter((result) => !result.reapplicable).map((result) => result.remedy).filter(Boolean))];
  return [
    ...(reapplicable ? [`  - Restore the reapplicable ones: ${APPLY_COMMAND} @es Restaurar las reaplicables: ${APPLY_COMMAND}`] : []),
    ...remedies.map((remedy) => `  - ${remedy}`),
  ];
}

// Every refusal line is English first, then its Spanish half marked `@es` on the same line.
// @es Cada línea del rechazo va en inglés primero y luego su mitad en español marcada `@es`, en la misma línea.

function brokenReason(results) {
  return [
    `${HEADER}: local customizations of gentle-ai-managed files are BROKEN, and sync would erase or overwrite them. @es ${HEADER_ES}: las personalizaciones locales de ficheros gestionados por gentle-ai están ROTAS, y sync las borraría o sobrescribiría.`,
    '',
    'Broken: @es Rotas:',
    ...listed(results, 'broken'),
    ...(results.some((result) => result.status === 'unverifiable') ? ['', 'Also could not be verified: @es Tampoco se pudieron verificar:', ...listed(results, 'unverifiable')] : []),
    '',
    'Fix first: @es Arreglar primero:',
    ...fixes(results),
    '',
    `Then re-check (${CHECK_COMMAND}) and sync again. \`gentle-ai sync --dry-run\` is always allowed. @es Después volver a comprobar (${CHECK_COMMAND}) y sincronizar de nuevo. \`gentle-ai sync --dry-run\` siempre se permite.`,
  ].join('\n');
}

function unverifiableReason(results) {
  return [
    `${HEADER}: the overlay could NOT VERIFY some customizations, and an unverified state is refused like a broken one — sync would overwrite exactly what nobody was able to check. @es ${HEADER_ES}: el overlay NO PUDO VERIFICAR algunas personalizaciones, y un estado sin verificar se rechaza igual que uno roto: sync sobrescribiría justo lo que nadie pudo comprobar.`,
    '',
    'Could not be verified: @es No se pudieron verificar:',
    ...listed(results, 'unverifiable'),
    '',
    `Make the check able to answer (for instance, reinstall gentle-ai with \`go install\` so its source is in the Go module cache), re-run ${CHECK_COMMAND}, then sync. \`gentle-ai sync --dry-run\` is always allowed. @es Lograr que el check pueda responder (por ejemplo, reinstalar gentle-ai con \`go install\` para que su código esté en la caché de módulos de Go), volver a ejecutar ${CHECK_COMMAND} y luego sincronizar. \`gentle-ai sync --dry-run\` siempre se permite.`,
  ].join('\n');
}

const failureReason = (failure) =>
  [
    `${HEADER}: the overlay check could not run (${failure}), so nothing proves the customizations are intact. @es ${HEADER_ES}: el check del overlay no pudo ejecutarse (${failure}), así que nada prueba que las personalizaciones estén intactas.`,
    `Run ${CHECK_COMMAND} by hand and fix what stops it. \`gentle-ai sync --dry-run\` is always allowed. @es Ejecutar ${CHECK_COMMAND} a mano y arreglar lo que lo detiene. \`gentle-ai sync --dry-run\` siempre se permite.`,
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
  if (drift.exitCode !== 1 && drift.exitCode !== 2) return deny(failureReason(`unexpected exit code ${drift.exitCode}`));
  if (!drift.results.some((result) => result.status !== 'held')) return deny(failureReason(`exit code ${drift.exitCode} with every result held @es salida ${drift.exitCode} con todos los resultados en held`));
  const blocking = drift.results.filter((result) => result.syncSafe !== true);
  if (blocking.some((result) => result.status === 'broken')) return deny(brokenReason(blocking));
  if (blocking.some((result) => result.status === 'unverifiable')) return deny(unverifiableReason(blocking));
  return ALLOW;
}
