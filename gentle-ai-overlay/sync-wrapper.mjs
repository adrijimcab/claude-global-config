/**
 * THE way to run `gentle-ai sync`: the real sync, then every re-applicable customization put back, then
 * the check, with an exit code that says whether anything is left drifting.
 *
 * WHY. `gentle-ai sync` rewrites the managed regions from its own assets and undoes what the owner pruned
 * or replaced there (see customizations.mjs). Run raw, it leaves that to the next apply; through this
 * wrapper the undo and the verdict happen in the same command.
 *
 * THE WRAPPER IS ITS OWN GATE. The real sync is this process's child, so no PreToolUse hook (the sync guard)
 * ever sees it: the guard judges only a command line that runs `gentle-ai sync` itself, and this line runs
 * `node .../sync.mjs`. Without a gate here the wrapper would be the way around the guard. So before a real
 * sync it takes the guard's own verdict (`driftVerdict`, the one decision both share): a customization that
 * sync would ERASE and is broken or unverifiable refuses the sync, exactly as it refuses a raw one. A
 * `--dry-run` writes nothing, so it skips the gate and the apply, and still reports the check.
 *
 * Arguments are passed to `gentle-ai sync` as an argument vector, untouched. The exit code is the sync's own
 * when it failed, else the check's verdict (0 held, 1 broken, 2 unverifiable; see report.mjs).
 *
 * @es LA forma de correr `gentle-ai sync`: el sync real, luego cada personalización reaplicable devuelta a
 * su sitio, luego el check, con un código de salida que dice si algo queda desviado. `gentle-ai sync`
 * reescribe las regiones gestionadas desde sus assets y deshace lo que el dueño podó o reemplazó allí; por
 * este envoltorio, deshacerlo y el veredicto ocurren en el mismo comando. EL ENVOLTORIO ES SU PROPIA
 * COMPUERTA: el sync real es hijo de este proceso, así que ningún hook PreToolUse (el guard de sync) lo ve;
 * el guard solo juzga una línea que ejecuta `gentle-ai sync` y esta línea ejecuta `node .../sync.mjs`. Sin
 * compuerta aquí, el envoltorio sería el modo de saltarse el guard; por eso, antes de un sync real toma el
 * veredicto del propio guard (`driftVerdict`, la decisión que ambos comparten). Un `--dry-run` no escribe
 * nada: se salta la compuerta y el apply, e igual informa el check. Los argumentos van a `gentle-ai sync`
 * como vector de argumentos, intactos. La salida es la del sync si falló; si no, el veredicto del check.
 */
import { driftVerdict } from '../gentle-ai-sync-guard/decide.mjs';
import { isDryRun } from '../gentle-ai-sync-guard/sync-invocations.mjs';
import { syncGentleAi } from './gentle-ai-cli.mjs';
import { applyAll, evaluateAll } from './invariants.mjs';
import { exitCodeFor, formatOutcome, formatResult } from './report.mjs';

const PREFIX = '[gentle-ai overlay sync]';

/**
 * @param {{ args: string[], customizations: object[], context: object, stdio?: 'inherit' | 'pipe', log?: (line: string) => void }} input
 * @returns {number} the exit code
 */
export function syncThroughOverlay({ args, customizations, context, stdio = 'inherit', log = console.log }) {
  const say = (english, spanish) => log(`${PREFIX} ${english} @es ${spanish}`);
  const dryRun = isDryRun(args);
  const shown = `gentle-ai sync${args.map((arg) => ` ${arg}`).join('')}`;

  if (!dryRun) {
    const before = evaluateAll(customizations, context);
    const verdict = driftVerdict({ exitCode: exitCodeFor(before), results: before });
    if (verdict.decision === 'deny') {
      say('REFUSED to run `gentle-ai sync`: the sync guard would refuse it too.', 'RECHAZÓ correr `gentle-ai sync`: el guard de sync también lo rechazaría.');
      log(verdict.reason);
      return 1;
    }
  }

  say(`running \`${shown}\`.`, `ejecutando \`${shown}\`.`);
  const sync = syncGentleAi(context, args, stdio);
  if (!sync.started) {
    say(`\`gentle-ai sync\` could not run (${sync.reason}); nothing was applied.`, `\`gentle-ai sync\` no pudo ejecutarse (${sync.reason}); no se aplicó nada.`);
    return 1;
  }
  if (sync.status !== 0) {
    const note = sync.note === undefined ? '' : ` (${sync.note})`;
    say(`\`gentle-ai sync\` exited ${sync.status}${note}; checking what it left.`, `\`gentle-ai sync\` salió con ${sync.status}${note}; comprobando lo que dejó.`);
  }

  if (!dryRun) applyAll(customizations, context).forEach((outcome) => log(formatOutcome(outcome)));
  const results = evaluateAll(customizations, context);
  results.forEach((result) => log(formatResult(result)));
  const drifting = results.filter((result) => result.status !== 'held').length;
  if (drifting === 0) say('every customization holds.', 'todas las personalizaciones se mantienen.');
  else say(`${drifting} customization(s) left drifting; the exit code says so.`, `${drifting} personalización(es) quedan desviadas; el código de salida lo indica.`);
  return sync.status !== 0 ? sync.status : exitCodeFor(results);
}
