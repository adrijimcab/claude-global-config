/**
 * Which program a command line really runs: the word past the launchers that only start another program
 * (`env`, `command`, `exec`, `time`, `timeout N`, `nice`, `npx`) and their own options. That is the one
 * question this module answers, over the words the tokenizer of `detect.mjs` produced.
 *
 * WHY (2026-10-19, two blind judges): `env node - <<'EOF'` and `timeout 5 python3 - <<'EOF'` run the same
 * interpreter as `node -` and `python3 -`, so a rule that reads only the first word misses them.
 *
 * Each launcher lists the options that take a value (the next word is that value, never the program) and,
 * for `timeout`, the duration word that comes before the program. A launcher that runs no program
 * (`command -v node` only looks it up) has none. An unknown option is skipped as a flag: if it took a value,
 * the value is read as the program, which can only MISS an interpreter, never invent one.
 *
 * @es Qué programa ejecuta de verdad una línea de órdenes: la palabra tras los lanzadores que solo arrancan
 * otro programa (`env`, `command`, `exec`, `time`, `timeout N`, `nice`, `npx`) y sus opciones. POR QUÉ: `env
 * node - <<'EOF'` ejecuta el mismo intérprete que `node -`, y una regla que solo lee la primera palabra no lo
 * ve. Cada lanzador lista las opciones que toman valor y, para `timeout`, la duración previa al programa. Un
 * lanzador que no ejecuta nada (`command -v node`) no tiene programa. Una opción desconocida se salta como
 * flag: si tomaba valor, ese valor se lee como programa, lo que solo puede OMITIR un intérprete, nunca inventarlo.
 */

const BACKSLASH = '\\';

/**
 * The launchers: `values`, options whose value is the next word; `positionals`, words before the program;
 * `noProgram`, options after which nothing runs; `assignments`, whether `NAME=value` words are skipped.
 * @es Los lanzadores: `values`, opciones cuyo valor es la palabra siguiente; `positionals`, palabras antes
 * del programa; `noProgram`, opciones tras las que no se ejecuta nada; `assignments`, si se saltan `NOMBRE=valor`.
 */
export const LAUNCHERS = {
  env: { values: new Set(['-u', '--unset', '-C', '--chdir', '-S', '--split-string']), positionals: 0, noProgram: new Set(), assignments: true },
  command: { values: new Set(), positionals: 0, noProgram: new Set(['-v', '-V']), assignments: false },
  exec: { values: new Set(['-a']), positionals: 0, noProgram: new Set(), assignments: false },
  time: { values: new Set(['-f', '--format', '-o', '--output']), positionals: 0, noProgram: new Set(), assignments: false },
  timeout: { values: new Set(['-s', '--signal', '-k', '--kill-after']), positionals: 1, noProgram: new Set(), assignments: false },
  nice: { values: new Set(['-n', '--adjustment']), positionals: 0, noProgram: new Set(), assignments: false },
  npx: { values: new Set(['-p', '--package']), positionals: 0, noProgram: new Set(['-c', '--call']), assignments: false }
};

/** The trailing path segment of a program word, lowercased and without a `.exe` tail. @es Último segmento de ruta del programa, en minúsculas y sin `.exe`. */
export function programName(raw) {
  let start = 0;

  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === '/' || raw[index] === BACKSLASH) start = index + 1;
  }

  const name = raw.slice(start).toLowerCase();

  return name.endsWith('.exe') ? name.slice(0, -4) : name;
}

/** `FOO=bar` — an environment assignment. @es Una asignación de entorno. */
export function isEnvironmentAssignment(token) {
  if (token.quoted) return false;

  const equals = token.raw.indexOf('=');

  if (equals <= 0) return false;

  for (let index = 0; index < equals; index += 1) {
    const character = token.raw[index];
    const isWordCharacter =
      (character >= 'a' && character <= 'z') ||
      (character >= 'A' && character <= 'Z') ||
      (character >= '0' && character <= '9') ||
      character === '_';

    if (!isWordCharacter) return false;
  }

  return true;
}

/** Whether a word is an option of a launcher (`-x`, `--long`, `-10` for nice). @es Si una palabra es una opción de un lanzador. */
const isOption = (token) => !token.quoted && token.raw.length > 1 && token.raw[0] === '-';

/**
 * The index in `words` of the program the words at `position` run, past every launcher; `-1` when a launcher
 * runs nothing or no program word is left.
 * @es El índice en `words` del programa que ejecutan las palabras desde `position`, tras todo lanzador; `-1`
 * si un lanzador no ejecuta nada o no queda palabra de programa.
 */
export function programIndex(words, position) {
  let at = position;

  while (at < words.length && isEnvironmentAssignment(words[at])) at += 1;

  while (at < words.length) {
    const name = programName(words[at].raw);

    if (!Object.hasOwn(LAUNCHERS, name)) return at;

    const launcher = LAUNCHERS[name];

    at += 1;

    let positionals = launcher.positionals;

    while (at < words.length) {
      const word = words[at];

      // `--` is skipped like any flag, so `timeout -- 5 node` still counts its duration.
      // @es `--` se salta como cualquier flag, así `timeout -- 5 node` sigue contando su duración.
      if (isOption(word)) {
        const option = word.raw.includes('=') ? word.raw.slice(0, word.raw.indexOf('=')) : word.raw;

        if (launcher.noProgram.has(option)) return -1;

        at += launcher.values.has(option) && !word.raw.includes('=') ? 2 : 1;
        continue;
      }

      if (launcher.assignments && isEnvironmentAssignment(word)) {
        at += 1;
        continue;
      }

      if (positionals > 0) {
        positionals -= 1;
        at += 1;
        continue;
      }

      break;
    }
  }

  return -1;
}
