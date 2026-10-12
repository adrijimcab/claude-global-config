/**
 * Reads the jobs of a GitLab CI file by its indentation: a top-level key starts a job (hidden `.templates` and the
 * global keywords are not jobs), `allow_failure` at the job level says whether the job can fail the pipeline, and
 * the lines under `before_script` and `script` are the commands it runs, with comments, YAML list dashes and
 * block-scalar markers removed. It reads structure, not meaning: an anchor (`*alias`) is not expanded and
 * `rules:` conditions are not evaluated; the report says so.
 *
 * @es Lee los jobs de un fichero de GitLab CI por su indentación: una clave de primer nivel abre un job (las
 * plantillas ocultas `.x` y las palabras clave globales no son jobs), `allow_failure` a nivel de job dice si el job
 * puede fallar el pipeline, y las líneas bajo `before_script` y `script` son los comandos que corre, sin
 * comentarios, guiones de lista YAML ni marcadores de bloque. Lee estructura, no significado: un ancla (`*alias`)
 * no se expande y las condiciones `rules:` no se evalúan; el informe lo dice.
 */

const GLOBAL_KEYWORDS = new Set(['stages', 'variables', 'default', 'include', 'workflow', 'cache', 'image', 'services', 'before_script', 'after_script']);
const TOP_LEVEL_KEY = /^([A-Za-z0-9_.][A-Za-z0-9_.-]*):/;
const SCRIPT_KEY = /^(\s+)(before_script|script):\s*$/;
const ALLOW_FAILURE = /^ {2}allow_failure:\s*(\S*)/;

/** Spaces before the first character. @es Espacios antes del primer carácter. */
function indentOf(line) {
  return line.length - line.trimStart().length;
}

/** The command a script line holds, or undefined for a comment, a marker or an alias. @es El comando de una línea de script, o undefined. */
function commandText(line) {
  const text = line.trim().replace(/^-\s+/, '');

  if (text === '' || text.startsWith('#') || text === '|' || text === '>' || text === '|-' || text === '>-' || text.startsWith('*')) return undefined;

  return text;
}

/** The commands of the script section that starts after line `start`. @es Los comandos de la sección de script que empieza tras la línea `start`. */
function sectionCommands(lines, start, keyIndent) {
  const commands = [];

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim() !== '' && !line.trim().startsWith('#') && indentOf(line) <= keyIndent) break;

    const text = commandText(line);

    if (text !== undefined) commands.push({ text, line: index + 1 });
  }

  return commands;
}

/** The job whose block is `lines[from..to)`. @es El job cuyo bloque es `lines[from..to)`. */
function readJob(name, lines, from, to) {
  let allowFailure = false;
  const commands = [];

  for (let index = from; index < to; index += 1) {
    const allow = ALLOW_FAILURE.exec(lines[index]);
    const script = SCRIPT_KEY.exec(lines[index]);

    if (allow !== null && allow[1] !== 'false') allowFailure = true;
    if (script !== null) commands.push(...sectionCommands(lines, index, script[1].length));
  }

  return { name, allowFailure, commands };
}

/** The jobs of a GitLab CI file. @es Los jobs de un fichero de GitLab CI. */
export function ciJobs(text) {
  const lines = text.split(/\r?\n/);
  const keys = [];

  lines.forEach((line, index) => {
    const key = TOP_LEVEL_KEY.exec(line);

    if (key !== null) keys.push({ name: key[1], index });
  });

  return keys
    .map((start, position) => ({ start, end: position + 1 < keys.length ? keys[position + 1].index : lines.length }))
    .filter(({ start }) => !start.name.startsWith('.') && !GLOBAL_KEYWORDS.has(start.name))
    .map(({ start, end }) => readJob(start.name, lines, start.index + 1, end));
}
