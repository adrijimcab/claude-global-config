/**
 * Every sentence `migrate-v4.mjs` prints, in both languages: the command prints through `bilingual-output/speaker.mjs`
 * and holds no `console.*` of its own, so no line of it can be English only.
 *
 * @es Cada frase que imprime `migrate-v4.mjs`, en los dos idiomas: el comando imprime a través de
 * `bilingual-output/speaker.mjs` y no tiene ningún `console.*` propio, así que ninguna línea suya puede ir solo en inglés.
 */
export const MIGRATE_V4_MESSAGES = {
  usage: {
    en: [
      'usage: node migrate-v4.mjs [--home <dir>] [--gentle-ai <exe>] [--apply]',
      '       node migrate-v4.mjs --rollback <backup dir> [--home <dir>] [--gentle-ai <exe>] [--apply]',
      'Without --apply nothing is written: the plan is printed.',
    ],
    es: [
      'uso: node migrate-v4.mjs [--home <dir>] [--gentle-ai <exe>] [--apply]',
      '     node migrate-v4.mjs --rollback <dir de respaldo> [--home <dir>] [--gentle-ai <exe>] [--apply]',
      'Sin --apply no se escribe nada: se imprime el plan.',
    ],
  },
  'refused.flag': { en: 'REFUSED: {flag} needs a value', es: 'RECHAZADO: {flag} necesita un valor' },
  'refused.version': {
    en: 'REFUSED: this step needs gentle-ai {expected}, and `{command} --version` answered "{actual}". Install it first.',
    es: 'RECHAZADO: este paso necesita gentle-ai {expected}, y `{command} --version` respondió "{actual}". Instálalo primero.',
  },
  'plan.header.migrate': { en: 'DRY RUN — nothing is written. The migration to gentle-ai {version} would:', es: 'SIMULACIÓN: no se escribe nada. La migración a gentle-ai {version} haría:' },
  'plan.header.rollback': { en: 'DRY RUN — nothing is written. The rollback to gentle-ai {version} would:', es: 'SIMULACIÓN: no se escribe nada. La vuelta atrás a gentle-ai {version} haría:' },
  'plan.backup': { en: '  1. save every path it changes, and the whole ~/.gentle-ai, into {dir}', es: '  1. guardar cada ruta que cambia, y todo ~/.gentle-ai, en {dir}' },
  'plan.remove': { en: '  2. remove {present} of {total} paths present (retired SDD files and the 8 agents v4 re-renders)', es: '  2. quitar {present} de {total} rutas presentes (ficheros SDD retirados y los 8 agentes que v4 regenera)' },
  'plan.hook': { en: '  3. remove {count} retired preflight hook(s) from settings.json', es: '  3. quitar {count} hook(s) de preflight retirado(s) de settings.json' },
  'plan.sync': { en: '  4. sync through the overlay: {command}', es: '  4. sincronizar a través del overlay: {command}' },
  'plan.verify': { en: '  5. verify: overlay check, no retired path left, no preflight hook, agents re-rendered, sync dry run', es: '  5. verificar: check del overlay, ninguna ruta retirada, ningún hook de preflight, agentes regenerados, simulación de sync' },
  'plan.rollback': {
    en: '  1. run `gentle-ai restore {snapshot} --yes`, then put back the {count} saved paths of {dir} (the whole ~/.gentle-ai among them)',
    es: '  1. correr `gentle-ai restore {snapshot} --yes` y luego devolver las {count} rutas guardadas de {dir} (todo ~/.gentle-ai entre ellas)',
  },
  'step.saved': { en: 'saved {count} paths into {dir}', es: 'guardadas {count} rutas en {dir}' },
  'step.removed': { en: 'removed {count} paths', es: 'quitadas {count} rutas' },
  'step.hook': { en: 'removed {count} retired preflight hook(s) from settings.json', es: 'quitados {count} hook(s) de preflight retirado(s) de settings.json' },
  'step.sync.failed': {
    en: 'the overlay sync exited {status}; nothing after it ran. Roll back with: node migrate-v4.mjs --rollback "{dir}" --apply (after installing gentle-ai {version})',
    es: 'el sync del overlay salió con {status}; no corrió nada después. Volver atrás con: node migrate-v4.mjs --rollback "{dir}" --apply (tras instalar gentle-ai {version})',
  },
  'step.snapshot': { en: 'pinned the snapshot this sync took, {id}, into the backup', es: 'fijada en el respaldo la instantánea que tomó este sync, {id}' },
  'step.snapshot.none': { en: 'the sync took no new snapshot; the rollback will rely on the saved paths only', es: 'el sync no tomó una instantánea nueva; la vuelta atrás dependerá solo de las rutas guardadas' },
  'check.overlay': { en: 'the overlay check exits 0', es: 'el check del overlay sale con 0' },
  'check.retired': { en: 'no retired SDD path is left', es: 'no queda ninguna ruta SDD retirada' },
  'check.hook': { en: 'settings.json runs no retired preflight hook', es: 'settings.json no corre ningún hook de preflight retirado' },
  'check.agents': { en: 'the 8 review and judgment-day agents exist again', es: 'los 8 agentes de revisión y judgment-day existen de nuevo' },
  'check.dryRun': { en: 'a `gentle-ai sync --dry-run` exits 0', es: 'un `gentle-ai sync --dry-run` sale con 0' },
  'verify.done': { en: 'MIGRATED to gentle-ai {version}. Backup and rollback point: {dir}', es: 'MIGRADO a gentle-ai {version}. Respaldo y punto de vuelta atrás: {dir}' },
  'verify.failed': {
    en: 'MIGRATION NOT VERIFIED: {failed} check(s) failed. Roll back with: node migrate-v4.mjs --rollback "{dir}" --apply (after installing gentle-ai {version})',
    es: 'MIGRACIÓN SIN VERIFICAR: fallaron {failed} comprobación(es). Volver atrás con: node migrate-v4.mjs --rollback "{dir}" --apply (tras instalar gentle-ai {version})',
  },
  'rollback.restore.failed': { en: '`gentle-ai restore {snapshot}` exited {status}; the saved paths were NOT put back', es: '`gentle-ai restore {snapshot}` salió con {status}; las rutas guardadas NO se devolvieron' },
  'rollback.done': { en: 'ROLLED BACK: snapshot {snapshot} restored and {count} saved paths put back from {dir}', es: 'VUELTA ATRÁS HECHA: instantánea {snapshot} restaurada y {count} rutas guardadas devueltas desde {dir}' },
};
