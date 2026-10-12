/**
 * Decides whether a dependency-cruiser config FORBIDS a dependency, by evaluating the config's own `forbidden`
 * rules against a probe: a `from` path and a `to` path. A rule forbids the probe when its severity is `error`
 * and both its `from` and its `to` match, where a side matches when its `path` regexes (a string or a list)
 * match and its `pathNot` regexes do not. Reading rule NAMES would let any rule claim the name; evaluating the
 * regexes asks what the rule actually forbids.
 *
 * @es Decide si una config de dependency-cruiser PROHÍBE una dependencia, evaluando las reglas `forbidden` de la
 * propia config contra una sonda: una ruta `from` y una ruta `to`. Una regla prohíbe la sonda cuando su severidad
 * es `error` y casan su `from` y su `to`; un lado casa cuando casan sus regex `path` (cadena o lista) y no casan
 * las `pathNot`. Leer los NOMBRES de regla dejaría que cualquier regla use el nombre; evaluar las regex pregunta
 * qué prohíbe de verdad.
 */

/** The regexes of a `path` or `pathNot` value, as a list. @es Las regex de un valor `path` o `pathNot`, como lista. */
function patterns(value) {
  if (value === undefined) return [];

  return (Array.isArray(value) ? value : [value]).map((source) => new RegExp(source));
}

/** True when the side `spec` of a rule matches `target`. @es Verdadero si el lado `spec` de una regla casa con `target`. */
function sideMatches(spec, target) {
  if (spec === undefined) return true;

  const positive = patterns(spec.path);
  const negative = patterns(spec.pathNot);

  return (positive.length === 0 || positive.some((pattern) => pattern.test(target))) && !negative.some((pattern) => pattern.test(target));
}

/** True when some rule of `config` forbids the dependency from `probe.from` to `probe.to`. @es Verdadero si alguna regla de `config` prohíbe la dependencia. */
export function forbids(config, probe) {
  return (config?.forbidden ?? []).some((rule) => rule.severity === 'error' && sideMatches(rule.from, probe.from) && sideMatches(rule.to, probe.to));
}

/** True when some rule of `config` forbids every module from being part of a cycle, at error. @es Verdadero si alguna regla prohíbe los ciclos, en error. */
export function forbidsCycles(config) {
  return (config?.forbidden ?? []).some((rule) => rule.severity === 'error' && rule.to?.circular === true && (rule.from === undefined || Object.keys(rule.from).length === 0));
}
