/**
 * WHAT the move from gentle-ai 2.9.1 (SDD) to v4.0.0 (ODD) changes in a home, and nothing about how: pure data
 * and pure functions, no I/O. `migrate-v4.mjs` acts on it.
 *
 * Measured 2026-10-11 by syncing v4.0.0 into an emulated copy of the owner's home: v4.0.0 RETIRES the SDD
 * phases but its sync does not delete their files (that cleanup is unreleased upstream work), keeps the
 * `gentle-ai sdd-preflight-hook` entry in settings.json although v4 no longer ships that subcommand, and
 * preserves the eight review and judgment-day agents byte for byte ("existing bytes are unknown or modified")
 * until they are deleted, after which it re-renders them and records their ownership. So the move deletes
 * exactly the retired paths below (the list engram #1379 names), removes that hook entry, and re-renders the
 * eight agents through one sync.
 *
 * @es QUÉ cambia en un home el paso de gentle-ai 2.9.1 (SDD) a v4.0.0 (ODD), y nada del cómo: datos y funciones
 * puras, sin E/S. Medido el 2026-10-11 sincronizando v4.0.0 en una copia emulada del home del dueño: v4.0.0
 * RETIRA las fases SDD pero su sync no borra sus ficheros, conserva la entrada `gentle-ai sdd-preflight-hook`
 * de settings.json aunque v4 ya no trae ese subcomando, y preserva byte a byte los ocho agentes de revisión y
 * judgment-day hasta que se borran, tras lo cual los vuelve a generar y registra su propiedad. Así que el paso
 * borra exactamente las rutas retiradas de abajo (la lista que nombra engram #1379), quita esa entrada de hook
 * y vuelve a generar los ocho agentes con un sync.
 */

/** The gentle-ai version each direction of the move requires. @es La versión de gentle-ai que exige cada sentido del paso. */
export const MIGRATE_VERSION = '4.0.0';
export const ROLLBACK_VERSION = '2.9.1';

const SDD_PHASES = ['apply', 'archive', 'design', 'explore', 'init', 'onboard', 'propose', 'research', 'spec', 'tasks', 'verify'];
const SDD_COMMANDS = ['apply', 'archive', 'continue', 'explore', 'ff', 'init', 'new', 'onboard', 'research', 'status', 'verify'];
const SHARED_SDD_FILES = ['sdd-orchestrator-sections.md', 'sdd-orchestrator-workflow.md', 'sdd-phase-common.md', 'sdd-status-contract.md', 'openspec-convention.md'];

/** The SDD files v4 no longer installs, relative to the home; a `/` ending marks a directory. @es Los ficheros SDD que v4 ya no instala, relativos al home; un `/` final marca un directorio. */
export const RETIRED_PATHS = [
  ...SDD_PHASES.map((phase) => `.claude/agents/sdd-${phase}.md`),
  ...SDD_PHASES.map((phase) => `.claude/skills/sdd-${phase}/`),
  ...SHARED_SDD_FILES.map((name) => `.claude/skills/_shared/${name}`),
  ...SDD_COMMANDS.map((command) => `.claude/commands/gentle-sdd-${command}.md`),
];

/** The agents v4 preserves until they are deleted, then re-renders and owns. @es Los agentes que v4 preserva hasta que se borran, y luego regenera y adopta. */
export const RE_RENDERED_AGENTS = ['jd-fix-agent', 'jd-judge-a', 'jd-judge-b', 'review-readability', 'review-refuter', 'review-reliability', 'review-resilience', 'review-risk'].map(
  (name) => `.claude/agents/${name}.md`,
);

export const SETTINGS_PATH = '.claude/settings.json';

/** Every path the move removes before its sync, retired first. @es Toda ruta que el paso quita antes de su sync, las retiradas primero. */
export const PATHS_REMOVED_BEFORE_SYNC = [...RETIRED_PATHS, ...RE_RENDERED_AGENTS];

const PREFLIGHT_COMMAND = 'gentle-ai sdd-preflight-hook';

/** Whether one hook runs the retired SDD preflight. @es Si un hook corre el preflight SDD retirado. */
const runsPreflight = (hook) => typeof hook?.command === 'string' && hook.command.trim().startsWith(PREFLIGHT_COMMAND);

/**
 * `settings` without the retired preflight hook: a hook entry loses that hook, and an entry left with no hook is
 * dropped. Everything else is returned as it was, in the same order. `removed` counts the hooks taken out.
 * @es `settings` sin el hook de preflight retirado: una entrada pierde ese hook y una entrada sin hooks se quita.
 * Todo lo demás se devuelve igual y en el mismo orden. `removed` cuenta los hooks quitados.
 * @returns {{ settings: object, removed: number }}
 */
export function withoutPreflightHook(settings) {
  let removed = 0;
  const hooks = settings?.hooks;
  if (hooks === undefined || hooks === null || typeof hooks !== 'object') return { settings, removed };
  const events = Object.fromEntries(
    Object.entries(hooks).map(([event, entries]) => {
      if (!Array.isArray(entries)) return [event, entries];
      const kept = entries
        .map((entry) => {
          if (!Array.isArray(entry?.hooks)) return entry;
          const remaining = entry.hooks.filter((hook) => !runsPreflight(hook));
          removed += entry.hooks.length - remaining.length;
          return remaining.length === entry.hooks.length ? entry : { ...entry, hooks: remaining };
        })
        .filter((entry) => !Array.isArray(entry?.hooks) || entry.hooks.length > 0);
      return [event, kept];
    }),
  );
  return { settings: { ...settings, hooks: events }, removed };
}

/** Whether `settings` still runs the retired preflight hook anywhere. @es Si `settings` todavía corre el hook retirado en algún sitio. */
export const runsRetiredPreflight = (settings) => withoutPreflightHook(settings).removed > 0;

/** The version `gentle-ai --version` printed (`gentle-ai 4.0.0`), or undefined. @es La versión que imprimió `gentle-ai --version`, o undefined. */
export function versionOf(output) {
  const words = String(output ?? '').trim().split(' ').filter((word) => word.length > 0);
  return words.length === 2 && words[0] === 'gentle-ai' ? words[1] : undefined;
}
