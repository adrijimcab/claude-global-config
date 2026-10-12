/**
 * Reads one script line as the commands it runs. It splits at `&&`, `||`, `;`, `|` and newlines that sit outside
 * quotes, tokenises each command with its quotes removed, and strips what only launches a program (`NAME=value`
 * prefixes, `cross-env`, `npx [--no-install|-y]`, `<manager> exec`) so `argv[0]` is the program that runs. It is
 * a reader of command STRUCTURE, never a judge of what a command does.
 *
 * @es Lee una línea de script como los comandos que ejecuta. Parte en `&&`, `||`, `;`, `|` y saltos de línea fuera
 * de comillas, separa cada comando en palabras sin comillas y quita lo que solo lanza un programa (prefijos
 * `NOMBRE=valor`, `cross-env`, `npx [--no-install|-y]`, `<gestor> exec`) para que `argv[0]` sea el programa que
 * corre. Lee la ESTRUCTURA del comando, nunca juzga lo que hace.
 */

const SEPARATORS = ['&&', '||', ';', '|', '\n'];
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn']);

/** The separator that starts at `index` of `text`, or undefined. @es El separador que empieza en `index`, o undefined. */
function separatorAt(text, index) {
  return SEPARATORS.find((separator) => text.startsWith(separator, index));
}

/**
 * Splits `text` into the simple commands it chains, quotes kept inside each command.
 * @es Parte `text` en los comandos simples que encadena, con las comillas dentro de cada uno.
 */
export function splitCommands(text) {
  const commands = [];
  let current = '';
  let quote = null;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    const separator = quote === null ? separatorAt(text, index) : undefined;

    if (separator !== undefined) {
      commands.push(current);
      current = '';
      index += separator.length;
      continue;
    }

    if (quote === null && (char === '"' || char === "'")) quote = char;
    else if (quote === char) quote = null;

    current += char;
    index += 1;
  }

  commands.push(current);

  return commands.map((command) => command.trim()).filter((command) => command !== '');
}

/** The words of one command, quotes removed. @es Las palabras de un comando, sin comillas. */
export function words(command) {
  const result = [];
  let current = '';
  let quote = null;
  let started = false;

  for (const char of command) {
    if (quote === null && (char === '"' || char === "'")) {
      quote = char;
      started = true;
    } else if (quote === char) quote = null;
    else if (quote === null && /\s/.test(char)) {
      if (started) result.push(current);
      current = '';
      started = false;
    } else {
      current += char;
      started = true;
    }
  }

  if (started) result.push(current);

  return result;
}

/** Drops one launcher layer from the front of `argv`, or returns undefined when there is none. @es Quita una capa de lanzador del frente, o undefined si no hay. */
function withoutLauncher(argv) {
  const [first, second] = argv;

  if (ENV_ASSIGNMENT.test(first)) return argv.slice(1);
  if (first === 'cross-env') return argv.slice(1);
  if (first === 'npx' || first === 'pnpx') {
    let rest = argv.slice(1);

    while (rest.length > 0 && rest[0].startsWith('-')) rest = rest.slice(1);

    return rest;
  }
  if (PACKAGE_MANAGERS.has(first) && second === 'exec') return argv.slice(argv[2] === '--' ? 3 : 2);

  return undefined;
}

/**
 * The argv of one command with every launcher layer removed: `argv[0]` is the program that runs.
 * @es El argv de un comando sin ninguna capa de lanzador: `argv[0]` es el programa que corre.
 */
export function programArgv(command) {
  let argv = words(command);

  for (let next = withoutLauncher(argv); next !== undefined && next.length > 0; next = withoutLauncher(argv)) argv = next;

  return argv;
}

/** Every command of a script line, as program argv. @es Todos los comandos de una línea de script, como argv de programa. */
export function commandsOf(text) {
  return splitCommands(text)
    .map(programArgv)
    .filter((argv) => argv.length > 0);
}

/**
 * The package script a command runs, or undefined: `npm run x`, `npm run-script x`, `pnpm run x`, `yarn run x`,
 * `npm test` and `npm start`.
 * @es El script de package que ejecuta un comando, o undefined.
 */
export function scriptNamed(argv) {
  const [manager, verb, name] = argv;

  if (!PACKAGE_MANAGERS.has(manager)) return undefined;
  if (verb === 'run' || verb === 'run-script') return name;
  if (manager !== 'yarn' && (verb === 'test' || verb === 'start')) return verb;

  return undefined;
}

const AGGREGATOR_FILE = /(^|[\\/])run-checks(\.[a-z]+)?$/;
const AGGREGATOR_PROGRAMS = new Set(['npm-run-all', 'run-s', 'run-p']);

/**
 * The words a script aggregator runs as scripts (`run-checks a b c`, `npm-run-all a b`), or an empty list.
 * @es Las palabras que un agregador de scripts ejecuta como scripts, o lista vacía.
 */
export function aggregatedNames(argv) {
  const at = AGGREGATOR_PROGRAMS.has(argv[0]) ? 0 : argv.findIndex((word) => AGGREGATOR_FILE.test(word));

  if (at === -1) return [];

  return argv.slice(at + 1).filter((word) => !word.startsWith('-'));
}
