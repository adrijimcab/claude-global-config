/**
 * The programs that LAUNCH another program, and where the launched program's word sits.
 *
 * WHY THIS EXISTS. `timeout 60 git commit -am x`, `nice git ...`, `xargs git update-ref -d`, `env -i git ...`
 * and `exec git` all RUN git, but the word in command position is the launcher, so every guard that asks
 * "is this git?" saw `timeout` and let the command through (measured by two blind judges on the worker git
 * guard, 2026-10-19). The shell grammar is the same for all of them: the launcher, its own options (some take
 * a value word), a fixed number of positional words (`timeout` takes a duration), and then the program.
 *
 * ONE RESPONSIBILITY: given the words and the index of a launcher, return the index of the program it
 * launches. The table below is the only place a launcher is described; `commandWordIndex` calls this in a
 * loop, so a launcher behind a launcher (`env timeout 5 git ...`) unwraps recursively.
 *
 * NOT MODELLED, stated: option grammars beyond the ones listed per launcher (an unknown option is skipped
 * as a flag without a value); `xargs` input read from a pipe is data, not words, so only the program that
 * `xargs` runs is reported.
 *
 * @es Los programas que LANZAN otro programa y dónde está la palabra del programa lanzado. Una guardia que
 * pregunta «¿esto es git?» veía `timeout` y dejaba pasar `timeout 60 git commit`. Cada lanzador se describe
 * UNA vez en la tabla (opciones con valor, palabras posicionales); `commandWordIndex` la aplica en bucle y
 * por eso `env timeout 5 git` se desenvuelve recursivamente. No se modelan gramáticas de opciones fuera de
 * las listadas: una opción desconocida se salta como bandera sin valor.
 */

/**
 * Per launcher: the options that take a SEPARATE value word, how many positional words precede the launched
 * program, whether `NAME=value` words may precede it, and the flags after which nothing is launched.
 * @es Por lanzador: opciones con valor separado, palabras posicionales previas, si admite `NOMBRE=valor`, y banderas tras las que no se lanza nada.
 */
const LAUNCHERS = Object.freeze({
  timeout: { valueOptions: ['-s', '--signal', '-k', '--kill-after'], positionals: 1, assignments: false, inertFlags: [] },
  nice: { valueOptions: ['-n', '--adjustment'], positionals: 0, assignments: false, inertFlags: [] },
  // xargs: `-e`, `-i` and `-l` take their value ATTACHED only (`-iX`), so they are flags here; `-E`, `-I`, `-L` take a separate one.
  xargs: { valueOptions: ['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '--arg-file', '--delimiter', '--max-args', '--max-procs', '--max-chars', '--max-lines'], positionals: 0, assignments: false, inertFlags: [] },
  // env: `-S` / `--split-string` carry the whole command as ONE string (`env -S 'git reset'`), see `scriptOptions`.
  env: { valueOptions: ['-u', '--unset', '-C', '--chdir'], scriptOptions: ['-S', '--split-string'], positionals: 0, assignments: true, inertFlags: [] },
  exec: { valueOptions: ['-a'], positionals: 0, assignments: false, inertFlags: [] },
  command: { valueOptions: [], positionals: 0, assignments: false, inertFlags: ['-v', '-V'] },
  time: { valueOptions: ['-f', '--format', '-o', '--output'], positionals: 0, assignments: false, inertFlags: [] },
  nohup: { valueOptions: [], positionals: 0, assignments: false, inertFlags: [] },
  sudo: { valueOptions: ['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U', '--user', '--group', '--host', '--prompt', '--chdir'], positionals: 0, assignments: true, inertFlags: [] }
});

/** The launcher description for an executable name, or `undefined`. @es La descripción del lanzador, o `undefined`. */
export function launcherNamed(name) {
  return Object.hasOwn(LAUNCHERS, name) ? LAUNCHERS[name] : undefined;
}

/**
 * The command string a script option carries (`-S 'git reset'`, `-Sgit`, `--split-string=git reset`), joined
 * with the words that follow it, or `undefined` when `word` is not a script option of the launcher.
 * @es La cadena de comando que lleva una opción de script, unida a las palabras siguientes, o `undefined`.
 */
function scriptCarried(words, index, scriptOptions) {
  const word = words[index];

  for (const option of scriptOptions) {
    const isLong = option.startsWith('--');

    if (word === option) return words.slice(index + 1).join(' ');
    if (isLong && word.startsWith(`${option}=`)) return [word.slice(option.length + 1), ...words.slice(index + 1)].join(' ');
    if (!isLong && word.startsWith(option)) return [word.slice(option.length), ...words.slice(index + 1)].join(' ');
  }

  return undefined;
}

/**
 * How many words the option at `word` occupies: 2 when it takes a separate value, otherwise 1. A short
 * cluster (`-0n 5`) is walked and STOPS at the first letter that takes a value; that value is the next word
 * only when the letter ends the cluster (`-n40` carries its own).
 * @es Cuántas palabras ocupa la opción: 2 si toma valor separado. Un cúmulo corto se recorre hasta la primera letra con valor.
 */
function optionWidth(word, valueOptions) {
  if (valueOptions.includes(word)) return 2;
  if (word.startsWith('--')) return 1;

  for (let at = 1; at < word.length; at += 1) {
    if (valueOptions.includes(`-${word[at]}`)) return at === word.length - 1 ? 2 : 1;
  }

  return 1;
}

/**
 * What `words[at]` launches: `{ index }` is the launched program's word (`at` itself when the launcher runs
 * nothing, like `command -v`; -1 when no program follows), and `{ script }` is set instead when the launcher
 * carries the command as one string (`env -S 'git reset'`), which the caller reads as a script of its own.
 * @param {string[]} words The command's words.
 * @param {number} at Index of a launcher word.
 * @param {string} name The launcher's executable name, a key of the table.
 * @param {(word: string) => boolean} isAssignment Whether a word is a `NAME=value` prefix.
 * @es Qué lanza `words[at]`: `index` es la palabra del programa (`at` si no lanza nada; -1 si no sigue ninguno) y
 * `script` va en su lugar cuando el lanzador lleva el comando en una sola cadena (`env -S 'git reset'`).
 */
export function unwrapLauncher(words, at, name, isAssignment) {
  const launcher = LAUNCHERS[name];
  const scriptOptions = launcher.scriptOptions ?? [];
  let positionalsLeft = launcher.positionals;
  let optionsEnded = false;
  let index = at + 1;

  while (index < words.length) {
    const word = words[index];
    const script = optionsEnded ? undefined : scriptCarried(words, index, scriptOptions);

    if (script !== undefined) {
      return { index: -1, script };
    } else if (!optionsEnded && word === '--') {
      optionsEnded = true;
      index += 1;
    } else if (!optionsEnded && launcher.inertFlags.includes(word)) {
      return { index: at };
    } else if (!optionsEnded && word.startsWith('-')) {
      index += optionWidth(word, launcher.valueOptions);
    } else if (launcher.assignments && isAssignment(word)) {
      index += 1;
    } else if (positionalsLeft > 0) {
      positionalsLeft -= 1;
      index += 1;
    } else {
      return { index };
    }
  }

  return { index: -1 };
}
