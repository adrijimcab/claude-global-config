/**
 * The git configuration a shell line gives one git invocation, read the way git reads it, and git's own reading of
 * a boolean value.
 *
 * THE ORDER, git's (`config.c`, `git_config_from_parameters`): `GIT_CONFIG_COUNT` with `GIT_CONFIG_KEY_<n>` and
 * `GIT_CONFIG_VALUE_<n>` first, then `GIT_CONFIG_PARAMETERS` (where git also hands its own `-c` settings to the
 * commands it runs, a `!` alias among them), then the invocation's own `-c <key>=<value>` and
 * `--config-env=<key>=<VARIABLE>` options. Later settings win. Keys are compared in lower case, as git does.
 *
 * `GIT_CONFIG_PARAMETERS` is read with git's quoting: each entry is single-quoted (`'` inside written `'\''`),
 * either `'key=value'` (old style) or `'key'='value'` (new style); `'key'` or `'key'=` alone is `true`.
 *
 * WHAT THE LINE HIDES. A value holding a shell expansion, or a `--config-env` variable the line does not set, is
 * `UNSEEN`. A hidden key, or a `GIT_CONFIG_PARAMETERS` that is hidden or does not parse, hides WHICH keys are set,
 * so the configuration holds `ANY_SETTING`, and a rule reading it fails closed.
 *
 * BOOLEANS (`gitBoolean`), git's rule (`git_parse_maybe_bool_text`, then `git_parse_int`): `true`/`yes`/`on` and
 * `false`/`no`/`off`/empty in any case, otherwise an integer in base 0 (`0x` hexadecimal, a leading `0` octal)
 * with an optional `k`/`m`/`g` unit, true when it is not zero. Anything else is invalid: git stops with "bad
 * boolean config value".
 *
 * @es La configuración de git que una línea da a una invocación, leída como la lee git: primero `GIT_CONFIG_COUNT`
 * con sus `KEY_n`/`VALUE_n`, luego `GIT_CONFIG_PARAMETERS` (con el entrecomillado de git: `'clave=valor'` o
 * `'clave'='valor'`), luego `-c` y `--config-env`; gana el último. Un valor con una expansión de la shell, o una
 * variable de `--config-env` que la línea no fija, es NO VISTO; una clave escondida o un `GIT_CONFIG_PARAMETERS`
 * escondido o mal formado esconde QUÉ claves se fijan (`ANY_SETTING`), y la regla que lo lee falla cerrada. Los
 * booleanos siguen la regla de git: `true`/`yes`/`on`, `false`/`no`/`off`/vacío, o un entero en base 0 con unidad
 * `k`/`m`/`g` opcional, verdadero si no es cero; otra cosa es inválida y git se detiene.
 */

/** The value of a configuration setting the line does not show. @es El valor de un ajuste que la línea no muestra. */
export const UNSEEN = Symbol('unseen');

/** The key that stands for every setting when the line hides which keys it sets. @es La clave que representa todo ajuste cuando la línea esconde cuáles fija. */
export const ANY_SETTING = Symbol('any-setting');

/** Whether a word holds an expansion a shell resolves at run time. @es Si una palabra lleva una expansión que la shell resuelve al correr. */
export const holdsExpansion = (word) => word.includes('$') || word.includes('`');

/** The boolean spellings git reads before it tries an integer. @es Las formas booleanas que git lee antes de probar un entero. */
const TRUE_WORDS = new Set(['true', 'yes', 'on']);
const FALSE_WORDS = new Set(['false', 'no', 'off', '']);

/** The units git accepts after an integer. @es Las unidades que git acepta tras un entero. */
const UNITS = new Set(['', 'k', 'm', 'g']);

/** Digits of each base. @es Los dígitos de cada base. */
const DIGITS = { 16: '0123456789abcdef', 8: '01234567', 10: '0123456789' };

/** Sets one `key=value` setting text, or `ANY_SETTING` when the key is hidden. @es Fija un ajuste `clave=valor`. */
function setSetting(config, text) {
  const equals = text.indexOf('=');
  const key = equals === -1 ? text : text.slice(0, equals);
  const value = equals === -1 ? 'true' : text.slice(equals + 1);

  if (holdsExpansion(key)) config.set(ANY_SETTING, UNSEEN);
  else config.set(key.toLowerCase(), holdsExpansion(value) ? UNSEEN : value);
}

/**
 * One single-quoted string of `GIT_CONFIG_PARAMETERS` starting at `at`, `'\''` read as a quote; `undefined` when
 * it is not one.
 * @es Una cadena entre comillas simples de `GIT_CONFIG_PARAMETERS`; `undefined` si no lo es.
 */
function quotedAt(text, at) {
  if (text.charAt(at) !== "'") return undefined;

  let value = '';
  let cursor = at + 1;

  while (cursor < text.length) {
    const close = text.indexOf("'", cursor);

    if (close === -1) return undefined;

    value += text.slice(cursor, close);
    cursor = close + 1;

    if (text.charAt(cursor) !== '\\' || text.charAt(cursor + 2) !== "'") return { value, end: cursor };

    value += text.charAt(cursor + 1);
    cursor += 3;
  }

  return undefined;
}

/**
 * The settings of a `GIT_CONFIG_PARAMETERS` value as `key=value` texts, or `undefined` when it does not parse.
 * @es Los ajustes de un `GIT_CONFIG_PARAMETERS` como textos `clave=valor`, o `undefined` si no se puede leer.
 */
export function parametersOf(text) {
  const settings = [];
  let at = 0;

  for (;;) {
    while (/\s/.test(text.charAt(at))) at += 1;

    if (at >= text.length) return settings;

    const key = quotedAt(text, at);

    if (key === undefined) return undefined;

    at = key.end;

    if (text.charAt(at) !== '=') {
      settings.push(key.value);
      continue;
    }

    at += 1;

    const value = quotedAt(text, at);

    if (value === undefined) {
      settings.push(key.value);
      continue;
    }

    settings.push(`${key.value}=${value.value}`);
    at = value.end;
  }
}

/**
 * The configuration the line gives one git invocation, added onto `inherited` (what a parent git hands a `!` alias).
 * @param {string[]} gitOptions The invocation's git global options.
 * @param {Map<string, string>} environment The environment the line gives it.
 * @param {Map<string | symbol, string | symbol>} [inherited] Settings that hold before these.
 * @returns {Map<string | symbol, string | symbol>} Keys in lower case; values a string or `UNSEEN`.
 * @es La configuración que la línea da a una invocación, sobre `inherited`.
 */
export function configOf(gitOptions, environment, inherited = new Map()) {
  const config = new Map(inherited);
  const count = environment.get('GIT_CONFIG_COUNT');

  if (count !== undefined && holdsExpansion(count)) config.set(ANY_SETTING, UNSEEN);

  for (let index = 0; index < Number.parseInt(count ?? '0', 10); index += 1) {
    const key = environment.get(`GIT_CONFIG_KEY_${index}`);

    if (key !== undefined) setSetting(config, `${key}=${environment.get(`GIT_CONFIG_VALUE_${index}`) ?? ''}`);
  }

  const parameters = environment.get('GIT_CONFIG_PARAMETERS');

  if (parameters !== undefined) {
    const settings = parametersOf(parameters);

    if (settings === undefined) config.set(ANY_SETTING, UNSEEN);
    else for (const text of settings) setSetting(config, text);
  }

  for (let index = 0; index < gitOptions.length; index += 1) {
    const option = gitOptions[index];

    if (option === '-c' && index + 1 < gitOptions.length) setSetting(config, gitOptions[index + 1]);

    const reference = option === '--config-env' ? gitOptions[index + 1] : option.startsWith('--config-env=') ? option.slice('--config-env='.length) : undefined;

    if (reference !== undefined && reference.includes('=')) {
      const equals = reference.indexOf('=');
      const key = reference.slice(0, equals);
      const value = environment.get(reference.slice(equals + 1));

      if (holdsExpansion(key)) config.set(ANY_SETTING, UNSEEN);
      else config.set(key.toLowerCase(), value === undefined || holdsExpansion(value) ? UNSEEN : value);
    }
  }

  return config;
}

/** An integer in git's base 0 with its unit, as `zero` or not; `undefined` when git would reject it. @es Un entero en base 0 de git. */
function integerIsZero(text) {
  let rest = text.trimStart();

  if (rest.startsWith('+') || rest.startsWith('-')) rest = rest.slice(1);

  const lower = rest.toLowerCase();
  const base = lower.startsWith('0x') ? 16 : lower.startsWith('0') ? 8 : 10;
  const body = base === 16 ? lower.slice(2) : lower;
  let length = 0;

  while (length < body.length && DIGITS[base].includes(body.charAt(length))) length += 1;

  if (length === 0 || !UNITS.has(body.slice(length))) return undefined;

  return [...body.slice(0, length)].every((digit) => digit === '0');
}

/**
 * A configuration value read as git reads a boolean.
 * @param {string} value The setting's value.
 * @returns {boolean | undefined} The boolean, or `undefined` when git rejects the value.
 * @es Un valor de configuración leído como booleano según git; `undefined` si git lo rechaza.
 */
export function gitBoolean(value) {
  const lower = value.toLowerCase();

  if (TRUE_WORDS.has(lower)) return true;
  if (FALSE_WORDS.has(lower)) return false;

  const zero = integerIsZero(value);

  return zero === undefined ? undefined : !zero;
}
