/**
 * What a `git commit` command line says about WHAT it will commit: the texts it carries (messages,
 * `--author`, `--trailer`), the message files and reused commits it reads, the explicit pathspec, and
 * whether `-a` / `--only` change which content is committed. Only the arguments AFTER `commit`.
 *
 * Recognised: `-m X`, `-mX`, `--message X`, `--message=X`, short clusters read left to right the way git
 * does (`-am X`: `a`, then `m` takes the next word; `-mX`: `m` takes the rest of the word), `-F f` /
 * `--file f`, `-C c` / `-c c` / `--reuse-message` / `--reedit-message`, `--author`, `--trailer`, `-a` /
 * `--all`, `-o` / `--only`, `--` and the paths after it.
 * NOT modelled, stated: an editor-written message (no `-m`/`-F`), which a guard cannot see.
 *
 * @es Lo que una línea `git commit` dice de LO QUE commiteará: los textos que lleva (mensajes, `--author`,
 * `--trailer`), los ficheros de mensaje y commits reutilizados que lee, el pathspec explícito y si `-a` /
 * `--only` cambian qué contenido se commitea. Los grupos cortos se leen de izquierda a derecha como hace
 * git (`-am X`, `-mX`). No se modela un mensaje escrito en el editor.
 */

/** Long flags whose value is a message text, with the label a finding gets. @es Banderas largas cuyo valor es un texto. */
const TEXT_FLAGS = new Map([['--message', 'commit message'], ['--author', 'commit author'], ['--trailer', 'commit trailer']]);

/** Long flags whose value names a message file. @es Banderas largas cuyo valor es un fichero de mensaje. */
const FILE_FLAGS = new Set(['--file']);

/** Long flags whose value is a commit whose message is reused. @es Banderas largas cuyo valor es un commit reutilizado. */
const REUSE_FLAGS = new Set(['--reuse-message', '--reedit-message']);

/** Long flags with a separate value word that is not a path. @es Banderas largas con un valor que no es una ruta. */
const OTHER_VALUE_FLAGS = new Set(['--date', '--template', '--cleanup', '--pathspec-from-file']);

/** Short letters that take a value, and where it goes. @es Letras cortas que toman valor, y dónde va. */
const SHORT_VALUES = new Map([['m', 'texts'], ['F', 'files'], ['C', 'reuse'], ['c', 'reuse'], ['t', undefined]]);

/** Records `value` under `kind` (`texts` also carries a label). @es Anota `value` bajo `kind`. */
function record(parsed, kind, value, label = 'commit message') {
  if (value === undefined) return;

  if (kind === 'texts') parsed.texts.push({ label, text: value });
  else if (kind !== undefined) parsed[kind].push(value);
}

/** Reads one short cluster; returns how many EXTRA words it consumed. @es Lee un grupo corto; devuelve cuántas palabras extra consumió. */
function readShortCluster(word, next, parsed) {
  for (let at = 1; at < word.length; at += 1) {
    const letter = word[at];

    if (SHORT_VALUES.has(letter)) {
      const attached = word.slice(at + 1);

      record(parsed, SHORT_VALUES.get(letter), attached.length > 0 ? attached : next);

      return attached.length > 0 || next === undefined ? 0 : 1;
    }

    if (letter === 'a') parsed.all = true;
    if (letter === 'o') parsed.only = true;
  }

  return 0;
}

/**
 * @returns `{ texts: [{ label, text }], files, reuse, paths, all, only }`.
 * @es `{ texts: [{ label, text }], files, reuse, paths, all, only }`.
 */
export function parseCommitArguments(args) {
  const parsed = { texts: [], files: [], reuse: [], paths: [], all: false, only: false };

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (word === '--') {
      parsed.paths.push(...args.slice(index + 1));
      break;
    }

    if (!word.startsWith('-') || word === '-') {
      parsed.paths.push(word);
      continue;
    }

    if (!word.startsWith('--')) {
      index += readShortCluster(word, args[index + 1], parsed);
      continue;
    }

    const [flag, ...attached] = word.split('=');
    const inline = attached.length > 0;
    const value = inline ? attached.join('=') : args[index + 1];

    if (flag === '--all') parsed.all = true;
    else if (flag === '--only') parsed.only = true;
    else if (TEXT_FLAGS.has(flag)) record(parsed, 'texts', value, TEXT_FLAGS.get(flag));
    else if (FILE_FLAGS.has(flag)) record(parsed, 'files', value);
    else if (REUSE_FLAGS.has(flag)) record(parsed, 'reuse', value);

    const takesValue = TEXT_FLAGS.has(flag) || FILE_FLAGS.has(flag) || REUSE_FLAGS.has(flag) || OTHER_VALUE_FLAGS.has(flag);

    if (takesValue && !inline) index += 1;
  }

  return parsed;
}
