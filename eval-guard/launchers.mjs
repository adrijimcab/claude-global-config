/**
 * Which program a command line really runs: the word past the launchers that only start another program
 * (`env`, `command`, `exec`, `time`, `timeout N`, `nice`, `npx`, `nohup`, `sudo`, `xargs`, `stdbuf`, `uv run`,
 * `poetry run`) and their own options; `env -S 'node -'` splits its string into the command line itself. That is
 * the one question this module answers, over the words the tokenizer of `detect.mjs` produced.
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
 * otro programa (`env`, `command`, `exec`, `time`, `timeout N`, `nice`, `npx`, `nohup`, `sudo`, `xargs`, `stdbuf`,
 * `uv run`, `poetry run`) y sus opciones; `env -S 'node -'` parte su cadena en la propia línea. POR QUÉ: `env
 * node - <<'EOF'` ejecuta el mismo intérprete que `node -`, y una regla que solo lee la primera palabra no lo
 * ve. Cada lanzador lista las opciones que toman valor y, para `timeout`, la duración previa al programa. Un
 * lanzador que no ejecuta nada (`command -v node`) no tiene programa. Una opción desconocida se salta como
 * flag: si tomaba valor, ese valor se lee como programa, lo que solo puede OMITIR un intérprete, nunca inventarlo.
 */

const BACKSLASH = '\\';

/**
 * One launcher: `values`, options whose value is the next word; `positionals`, words before the program;
 * `noProgram`, options after which nothing runs; `assignments`, whether `NAME=value` words are skipped; `split`,
 * options whose value is itself a command line (`env -S 'node -'`); `subcommand`, the word that must follow the
 * launcher for it to run a program (`uv run`, `poetry run`).
 * @es Un lanzador: `values`, opciones cuyo valor es la palabra siguiente; `positionals`, palabras antes del
 * programa; `noProgram`, opciones tras las que no se ejecuta nada; `assignments`, si se saltan `NOMBRE=valor`;
 * `split`, opciones cuyo valor es a su vez una línea de órdenes; `subcommand`, la palabra que debe seguir al
 * lanzador para que ejecute un programa.
 */
const launcher = ({ values = [], positionals = 0, noProgram = [], assignments = false, split = [], subcommand } = {}) => ({ values: new Set(values), positionals, noProgram: new Set(noProgram), assignments, split: new Set(split), subcommand });

/** The launchers. @es Los lanzadores. */
export const LAUNCHERS = {
  env: launcher({ values: ['-u', '--unset', '-C', '--chdir'], assignments: true, split: ['-S', '--split-string'] }),
  command: launcher({ noProgram: ['-v', '-V'] }),
  exec: launcher({ values: ['-a'] }),
  time: launcher({ values: ['-f', '--format', '-o', '--output'] }),
  timeout: launcher({ values: ['-s', '--signal', '-k', '--kill-after'], positionals: 1 }),
  nice: launcher({ values: ['-n', '--adjustment'] }),
  npx: launcher({ values: ['-p', '--package'], noProgram: ['-c', '--call'] }),
  nohup: launcher(),
  sudo: launcher({ values: ['-u', '--user', '-g', '--group', '-C', '--close-from', '-D', '--chdir', '-h', '--host', '-p', '--prompt', '-U', '--other-user', '-r', '--role', '-t', '--type', '-T', '--command-timeout'], noProgram: ['-l', '--list', '-v', '--validate', '-V', '--version', '-e', '--edit', '-K', '--remove-timestamp'] }),
  xargs: launcher({ values: ['-I', '-L', '-n', '--max-args', '-P', '--max-procs', '-s', '--max-chars', '-d', '--delimiter', '-E', '-a', '--arg-file'] }),
  stdbuf: launcher({ values: ['-i', '--input', '-o', '--output', '-e', '--error'] }),
  uv: launcher({ subcommand: 'run', values: ['--with', '--with-editable', '--with-requirements', '--python', '-p', '--project', '--directory', '--env-file', '--extra', '--group', '--index', '--package', '--from'] }),
  poetry: launcher({ subcommand: 'run', values: ['-C', '--directory', '-P', '--project'] })
};

/** The words of a command line given as one string (`env -S 'node -'`), split on blanks. @es Las palabras de una línea dada como una cadena, separadas por blancos. */
function splitWords(text) {
  return text.split(' ').flatMap((part) => part.split('\t')).filter((part) => part.length > 0).map((raw) => ({ kind: 'word', raw, quoted: false, bare: true }));
}

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

/**
 * Whether a word is an option of a launcher (`-x`, `--long`, `-10` for nice). Quoting is no part of the answer: the
 * launcher receives the same argument either way, so `--split-string='node -'` is an option.
 * @es Si una palabra es una opción de un lanzador. Las comillas no deciden: el lanzador recibe el mismo argumento con
 * o sin ellas, así `--split-string='node -'` es una opción.
 */
const isOption = (token) => token.raw.length > 1 && token.raw[0] === '-';

/**
 * The words the command at `position` runs, starting at its program, past every launcher: the program word and
 * its arguments; `undefined` when a launcher runs nothing or no program word is left. A split option's string
 * (`env -S 'node -'`) becomes words of the command line itself.
 * @es Las palabras que ejecuta la orden desde `position`, empezando por su programa, tras todo lanzador;
 * `undefined` si un lanzador no ejecuta nada o no queda programa. La cadena de una opción de partición se vuelve
 * palabras de la propia línea.
 */
export function programWords(words, position) {
  let rest = words.slice(position);

  while (rest.length > 0) {
    while (rest.length > 0 && isEnvironmentAssignment(rest[0])) rest = rest.slice(1);

    const name = programName(rest[0]?.raw ?? '');

    if (!Object.hasOwn(LAUNCHERS, name)) return rest.length > 0 ? rest : undefined;

    const spec = LAUNCHERS[name];
    let at = 1;

    if (spec.subcommand !== undefined) {
      if (rest[1]?.raw !== spec.subcommand) return undefined;

      at = 2;
    }

    let positionals = spec.positionals;
    let split;

    while (at < rest.length && split === undefined) {
      const word = rest[at];

      // `--` is skipped like any flag, so `timeout -- 5 node` still counts its duration.
      // @es `--` se salta como cualquier flag, así `timeout -- 5 node` sigue contando su duración.
      if (isOption(word)) {
        // A short split option with its string attached (`-S'node -'`, read as `-Snode -`) is the split form too.
        // @es Una opción de partición corta con la cadena pegada también es la forma de partición.
        const attached = [...spec.split].find((flag) => flag.length === 2 && word.raw.length > flag.length && word.raw.startsWith(flag));

        if (attached !== undefined) {
          split = word.raw.slice(attached.length);
          at += 1;
          continue;
        }

        const inline = word.raw.includes('=');
        const option = inline ? word.raw.slice(0, word.raw.indexOf('=')) : word.raw;

        if (spec.noProgram.has(option)) return undefined;
        if (spec.split.has(option)) split = inline ? word.raw.slice(word.raw.indexOf('=') + 1) : rest[at + 1]?.raw ?? '';

        at += (spec.values.has(option) || spec.split.has(option)) && !inline ? 2 : 1;
        continue;
      }

      if (spec.assignments && isEnvironmentAssignment(word)) {
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

    rest = split === undefined ? rest.slice(at) : [...splitWords(split), ...rest.slice(at)];
  }

  return undefined;
}
