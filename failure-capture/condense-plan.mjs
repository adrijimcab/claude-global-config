/**
 * What each line of a ledger would become when condensed, and why a line stays as it is: a keyed lesson line
 * of ANY scope (`[global]` or a project's own) becomes its tiered form, a `[promoted]` line its minimal stub,
 * and a marker-less lesson line is shortened only under a key the operator supplied in a key map, never a key
 * inferred and never a marker invented for it. The scope decides nothing but the label the line keeps, so a
 * project ledger is condensed by the same path as the home one. Pure: lines in, plan out; nothing here reads
 * or writes a file.
 *
 * @es Qué pasaría con cada línea de un ledger al condensarlo y por qué una línea se queda como está: una
 * línea de lección con clave de CUALQUIER alcance (`[global]` o el propio de un proyecto) pasa a su forma con
 * niveles, una `[promoted]` a su muñón mínimo, y una de lección sin marcador se acorta solo con una clave que
 * aportó el operador en un mapa de claves, nunca una inferida ni un marcador inventado. El alcance solo decide
 * la etiqueta que la línea conserva, así que un ledger de proyecto se condensa por el mismo camino que el del
 * home. Pura: líneas dentro, plan fuera; nada aquí lee ni escribe ficheros.
 */

import { isTiered, isValidKey, minimalStub, parseEntry, pointerKeyOf, readMarker, refuse, splitRule, tieredLine } from './ledger-line.mjs';

/** The shortest key-map prefix accepted: long enough to name one line, not a class of lines. @es El prefijo más corto admitido: nombra una línea, no una clase. */
export const MIN_PREFIX_LENGTH = 30;

const MECHANISM_LEAD = 'closed by mechanism ';

/** The scope of a promoted stub; every other scope names a lesson. @es El alcance de un muñón promovido; cualquier otro alcance nombra una lección. */
const PROMOTED_SCOPE = 'promoted';

/** A line that stays as it is, with the bilingual reason of a refusal. @es Una línea que se queda como está, con el motivo bilingüe de una negativa. */
const leave = (refusal) => ({ reason: refusal.problem });

/** The mechanism path a fat promoted line names, or `undefined` when it names none. @es La ruta del mecanismo que nombra una línea promovida, o `undefined`. */
function mechanismOf(body) {
  const at = body.indexOf(MECHANISM_LEAD);

  if (at === -1) return undefined;

  const start = at + MECHANISM_LEAD.length;
  const end = body.indexOf(' ', start);

  return body.slice(start, end === -1 ? body.length : end);
}

/**
 * The plan for one line: `{ key, shortened }`, `{ reason }` when it stays and a person must know why, or
 * `undefined` when it is not this command's business (not an entry, already short).
 * @param operatorKey the key-map key for this line, when it has one.
 * @es El plan de una línea: `{ key, shortened }`, `{ reason }` si se queda y hay que saber por qué, o `undefined` si no es asunto de este comando.
 */
export function planLine(line, operatorKey) {
  if (!line.startsWith('- [')) return undefined;

  const entry = parseEntry(line);

  if (!entry.ok) return leave(entry);
  if (isTiered(line)) return undefined;

  const key = entry.marker === undefined ? operatorKey : readMarker(entry.marker).key;

  if (key === undefined) return { ...leave(refuse('the line has no marker and no key-map entry names a key for it.', 'la línea no tiene marcador y ninguna entrada del mapa de claves le da clave.')), needsKey: true };

  const split = entry.scope === PROMOTED_SCOPE ? { ok: true } : splitRule(entry.body);
  const built = !split.ok ? split : entry.scope === PROMOTED_SCOPE ? minimalStub({ date: entry.date, mechanism: mechanismOf(entry.body), marker: entry.marker }) : tieredLine({ scope: entry.scope, date: entry.date, tally: split.tally, rule: split.rule, key, marker: entry.marker });

  return built.ok ? { key, shortened: built.line } : leave(built);
}

/** Whether `line` is a lesson entry of any scope that carries no marker and is not yet short: the only kind a key map may name. @es Si `line` es una entrada de lección de cualquier alcance sin marcador y aún no corta: lo único que un mapa de claves puede nombrar. */
function isMarkerlessLesson(line) {
  const entry = parseEntry(line);

  return entry.ok && entry.scope !== PROMOTED_SCOPE && entry.marker === undefined && !isTiered(line);
}

/** The first refusal of a key-map entry, or `undefined` when it names exactly one line under a fresh key. @es La primera negativa de una entrada del mapa, o `undefined` si nombra una sola línea con clave nueva. */
function entryRefusal({ entry, copies, takenKeys, matches }) {
  return [
    typeof entry?.line === 'string' && entry.line.length >= MIN_PREFIX_LENGTH ? undefined : refuse(`the prefix must be a text of at least ${String(MIN_PREFIX_LENGTH)} characters.`, `el prefijo debe ser un texto de al menos ${String(MIN_PREFIX_LENGTH)} caracteres.`),
    isValidKey(entry?.key) ? undefined : refuse('the key must be lowercase kebab-case, 4-60 chars.', 'la clave debe ser kebab-case en minúsculas, 4-60 caracteres.'),
    copies === 1 ? undefined : refuse('the key appears in more than one key-map entry.', 'la clave aparece en más de una entrada del mapa de claves.'),
    takenKeys.has(entry?.key) ? refuse('the key is already carried by a marker.', 'la clave ya la lleva un marcador.') : undefined,
    matches > 0 ? undefined : refuse('the prefix matches no marker-less line (ABSENT).', 'el prefijo no coincide con ninguna línea sin marcador (ABSENT).'),
    matches === 1 ? undefined : refuse(`the prefix matches ${String(matches)} marker-less lines (AMBIGUOUS).`, `el prefijo coincide con ${String(matches)} líneas sin marcador (AMBIGUOUS).`),
  ].find((problem) => problem !== undefined);
}

/**
 * Resolves a key map against the marker-less lesson lines of every ledger, whatever their scope. An entry
 * whose key a tiered line already points to was applied by an earlier run and is skipped, so the same map
 * can be run again.
 * @returns `{ keyAt: Map<"scope:index", key>, problems }`, each problem one bilingual sentence.
 * @es Resuelve un mapa de claves contra las líneas de lección sin marcador de cada ledger, sea cual sea su alcance. Una entrada cuya clave ya señala una línea con niveles se aplicó antes y se salta.
 */
function resolveKeyMap({ ledgers, keyMap, takenKeys }) {
  const lines = ledgers.flatMap((ledger) => (ledger.lines ?? []).map((line, index) => ({ at: `${ledger.scope}:${String(index)}`, line })));
  const markerless = lines.filter(({ line }) => isMarkerlessLesson(line));
  const applied = new Set(lines.map(({ line }) => pointerKeyOf(line)).filter((key) => key !== undefined));
  const keyAt = new Map();
  const problems = [];

  keyMap.forEach((entry, number) => {
    if (applied.has(entry?.key)) return;

    const matching = typeof entry?.line === 'string' ? markerless.filter(({ line }) => line.startsWith(entry.line)) : [];
    const refusal = entryRefusal({ entry, copies: keyMap.filter((other) => other?.key === entry?.key).length, takenKeys, matches: matching.length });

    if (refusal === undefined) keyAt.set(matching[0].at, entry.key);
    else problems.push(`key-map entry ${String(number + 1)}: ${refusal.problem}`);
  });

  return { keyAt, problems };
}

/**
 * Plans every ledger: `plans` is `[{ ledger, items }]`, each item `{ index, original, key, shortened }` or
 * `{ index, original, reason }`; `problems` are the key-map entries that named nothing usable.
 * @es Planifica cada ledger; `problems` son las entradas del mapa de claves que no nombraron nada utilizable.
 */
export function planLedgers({ ledgers, keyMap }) {
  const takenKeys = new Set(ledgers.flatMap((ledger) => (ledger.lines ?? []).map((line) => readMarker(line)?.key).filter((key) => key !== undefined)));
  const { keyAt, problems } = resolveKeyMap({ ledgers, keyMap, takenKeys });
  const plans = ledgers.map((ledger) => ({
    ledger,
    items: (ledger.lines ?? []).flatMap((original, index) => {
      const plan = planLine(original, keyAt.get(`${ledger.scope}:${String(index)}`));

      return plan === undefined ? [] : [{ index, original, ...plan }];
    }),
  }));

  return { plans, problems };
}
