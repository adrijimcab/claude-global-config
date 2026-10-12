/**
 * Invariant: a hook that gentle-ai registers in `settings.json` runs OUR command instead, and gentle-ai's own command
 * is not registered beside it. The customization names the `event` (Stop, SessionStart, ...), the `upstream` command
 * gentle-ai registers and the `replacement` command that stands in for it.
 *
 * WHY A KIND OF ITS OWN. `gentle-ai sync` merges `settings.json` hooks append-only and registers its hook when NO entry
 * of the event carries its exact command (measured 2026-10-12, gentle-ai 4.0.0, a sync run in an emulated home whose
 * Stop and SessionStart entries already held a replacement: sync kept the replacement and appended its own entry, with
 * its own matcher and timeout, to both events). So a replacement edited into settings.json by hand is silently
 * doubled by the next sync: both commands run. Keeping the replacement means removing what sync appends.
 *
 * SYNC-SAFE, and why: sync only ADDS its entry; it never removes or edits ours. The next apply removes the added entry,
 * so no state of this invariant is a reason to refuse a sync.
 *
 *   held         the event holds no hook running `upstream` and exactly one running `replacement`
 *   broken       `upstream` is registered: with no `replacement` beside it, apply rewrites the first one in place (its
 *                matcher and timeout stay); with one beside it (a fresh sync), apply removes every `upstream` hook,
 *                and a group left with no hook goes with them
 *   refused      neither command is registered (apply invents no registration), `replacement` twice, or a
 *                settings.json that is missing or is not a JSON object
 *
 * The file is rewritten in the form gentle-ai writes it (`go-json.mjs`), keeping its line ending, so what changes is
 * what the customization changed.
 *
 * @es Invariante: un hook que gentle-ai registra en `settings.json` corre NUESTRO comando en su lugar, y el comando de
 * gentle-ai no queda registrado al lado. La personalización nombra el `event`, el comando `upstream` que registra
 * gentle-ai y el `replacement` que lo sustituye. POR QUÉ UN TIPO PROPIO: `gentle-ai sync` fusiona los hooks de
 * `settings.json` solo añadiendo y registra el suyo cuando NINGUNA entrada del evento lleva su comando exacto (medido
 * el 2026-10-12, gentle-ai 4.0.0, en un home emulado: conservó el reemplazo y añadió su entrada, con su matcher y su
 * timeout, a los dos eventos). Un reemplazo editado a mano lo duplica el siguiente sync: corren los dos comandos.
 * Conservarlo es quitar lo que sync añade. SEGURO ANTE SYNC: sync solo AÑADE su entrada; nunca quita ni edita la
 * nuestra. El fichero se reescribe en la forma en que lo escribe gentle-ai, con su final de línea.
 */
import path from 'node:path';
import { goJsonText } from '../go-json.mjs';
import { readTextOrNull, writeTextAtomic } from '../text-file.mjs';

/** The command of every hook of the event's groups, in order. @es El comando de cada hook de los grupos del evento, en orden. */
const commandsOf = (groups) => groups.flatMap((group) => (Array.isArray(group?.hooks) ? group.hooks.map((hook) => hook?.command) : []));

/** How many of `commands` are exactly `command`. @es Cuántos de `commands` son exactamente `command`. */
const countOf = (commands, command) => commands.filter((candidate) => candidate === command).length;

/**
 * The file's settings and its event's hook groups, or a refusal naming why neither is usable.
 * @es Los settings del fichero y los grupos de hooks de su evento, o un rechazo que nombra por qué no sirven.
 */
function read(customization, context) {
  const text = readTextOrNull(path.join(context.home, customization.file));
  if (text === null) return { refused: 'file does not exist @es el fichero no existe' };
  let settings;
  try {
    settings = JSON.parse(text);
  } catch {
    return { refused: 'the file is not valid JSON; fix it by hand @es el fichero no es JSON válido; corregirlo a mano' };
  }
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) return { refused: 'the file is not a JSON object @es el fichero no es un objeto JSON' };
  const groups = settings.hooks?.[customization.event];
  if (!Array.isArray(groups)) return { refused: `settings.hooks.${customization.event} is not a list of hook groups @es settings.hooks.${customization.event} no es una lista de grupos de hooks` };
  return { text, settings, groups };
}

/**
 * Where the event stands: `held`, or the groups after the swap (`next`) with a `change` naming it, or a refusal.
 * @es Dónde está el evento: `held`, o los grupos tras el cambio (`next`) con un `change` que lo nombra, o un rechazo.
 */
function stateOf(customization, context) {
  const file = read(customization, context);
  if (file.refused !== undefined) return { refused: file.refused };
  const commands = commandsOf(file.groups);
  const upstream = countOf(commands, customization.upstream);
  const replacement = countOf(commands, customization.replacement);
  if (upstream === 0 && replacement === 1) return { form: 'held' };
  if (replacement > 1) return { refused: `the replacement is registered ${replacement} times on ${customization.event}; fix the file by hand @es el reemplazo está registrado ${replacement} veces en ${customization.event}; corregir el fichero a mano` };
  if (upstream === 0) return { refused: `neither the upstream command nor the replacement is registered on ${customization.event}, so upstream may have changed its command; review it and update \`upstream\` @es ni el comando de upstream ni el reemplazo están registrados en ${customization.event}, quizá upstream cambió su comando; revisarlo y actualizar \`upstream\`` };
  return { form: 'replaceable', file, change: replacement === 0 ? 'rewrite' : 'remove' };
}

/** The groups with the swap done: the first upstream hook rewritten in place or, with the replacement present, every upstream hook removed. @es Los grupos con el cambio hecho. */
function swapped(customization, groups, change) {
  let rewritten = change === 'remove';
  const next = groups.map((group) =>
    Array.isArray(group?.hooks)
      ? {
          ...group,
          hooks: group.hooks.flatMap((hook) => {
            if (hook?.command !== customization.upstream) return [hook];
            if (rewritten) return [];
            rewritten = true;
            return [{ ...hook, command: customization.replacement }];
          }),
        }
      : group,
  );
  return next.filter((group, index) => !(Array.isArray(groups[index]?.hooks) && groups[index].hooks.length > 0 && group.hooks.length === 0));
}

export const hookCommandReplacement = {
  syncSafe: true,
  remedy: 'Run the overlay apply to put our hook command back; when gentle-ai changed its command, edit settings.json by hand and update `upstream` in customizations.mjs. @es Ejecutar el apply del overlay para devolver nuestro comando de hook; si gentle-ai cambió el suyo, editar settings.json a mano y actualizar `upstream` en customizations.mjs.',

  evaluate(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { status: 'broken', detail: state.refused };
    if (state.form === 'held') return { status: 'held', detail: `${customization.event} runs our hook command only @es ${customization.event} corre solo nuestro comando de hook` };
    return { status: 'broken', detail: `gentle-ai's hook command is registered on ${customization.event}; apply ${state.change === 'rewrite' ? 'rewrites it to ours' : 'removes it, ours is already there'} @es el comando de hook de gentle-ai está registrado en ${customization.event}; apply ${state.change === 'rewrite' ? 'lo cambia por el nuestro' : 'lo quita, el nuestro ya está'}` };
  },

  plan(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { outcome: 'refused', detail: state.refused };
    if (state.form === 'held') return { outcome: 'unchanged', detail: 'our hook command is in place @es nuestro comando de hook está en su sitio' };
    return { outcome: state.change === 'rewrite' ? 'would-replace' : 'would-remove', detail: `${customization.event} would run our hook command only @es ${customization.event} correría solo nuestro comando de hook` };
  },

  apply(customization, context) {
    const state = stateOf(customization, context);
    if (state.refused !== undefined) return { outcome: 'refused', detail: state.refused };
    if (state.form === 'held') return { outcome: 'unchanged', detail: 'our hook command is in place @es nuestro comando de hook está en su sitio' };
    const { text, settings, groups } = state.file;
    const next = { ...settings, hooks: { ...settings.hooks, [customization.event]: swapped(customization, groups, state.change) } };
    writeTextAtomic(path.join(context.home, customization.file), goJsonText(next, { eol: text.includes('\r\n') ? '\r\n' : '\n', trailingNewline: text.endsWith('\n') }));
    return { outcome: 'applied', detail: `${customization.event} now runs our hook command only @es ${customization.event} ahora corre solo nuestro comando de hook` };
  },
};
