/**
 * The SECOND way a command destroys the verdict it was written to preserve: it reads `$?` on the
 * statement AFTER A PIPELINE, where bash has already replaced it with the LAST member's status.
 *
 * WHAT HAPPENED, measured and recorded as `measurement-failure-is-not-a-zero`. A probe asked whether a
 * package existed on a registry with `npm view <pkg> version 2>&1 | head -5; echo exit=$?`. It printed
 * `exit=0`, which reads as "npm succeeded". It was `head`'s status. The probe measured nothing while
 * producing success-shaped output, and it was caught only by re-reading a transcript.
 *
 * THE SHELL FACT, re-measured here rather than quoted (bash 5, this machine, 2026-09-22):
 *
 *   false | head -1; c=$?; echo "$c"                     -> 0   <- this shape
 *   set -o pipefail; false | head -1; c=$?; echo "$c"     -> 1
 *   false | head -1; echo "${PIPESTATUS[0]}"              -> 1
 *
 * So the defect is not "a pipeline" and not "`$?`": it is reading `$?` about a pipeline whose failure
 * bash has already thrown away. Both repairs above are recognised and allowed, which is what keeps this
 * from being a rule people route around — the guard refuses the shape that cannot measure, and names the
 * two shapes that can.
 *
 * WHY ONLY BASH. PowerShell was MEASURED (5.1, this machine, 2026-09-22) and does NOT have this defect:
 *
 *   cmd /c exit 7 | Out-Null            ; $LASTEXITCODE -> 7
 *   cmd /c exit 7 | Select-Object -First 1 ; $LASTEXITCODE -> 7, $? -> False
 *
 * A native program's code survives the pipeline there, so refusing that shape in PowerShell would redden
 * correct work — the `guard-that-cannot-go-red` fourth face, reached from the other side. The silence
 * here is measured, not assumed.
 *
 * WHAT COUNTS AS READING THE STATUS, and why it is not "the text contains `$?`". A word that merely
 * CARRIES those two characters is data — a commit message, a sed program, a piece of prose about this
 * very rule. The statement must CONSUME the status: assign it (`c=$?`), print it, test it, or exit with
 * it. `git commit -m 'fix $? handling'` after a pipeline is therefore allowed, and a heredoc body never
 * reaches this decision at all, because `shell-command.mjs` keeps what the shell treats as data out of
 * the words.
 *
 * NO REGEX (M5): `includes`, `split` and set membership on literals.
 *
 * @es La SEGUNDA forma de destruir el veredicto: leer `$?` en la sentencia POSTERIOR A UN PIPELINE,
 * donde bash ya lo sustituyó por el estado del ÚLTIMO miembro. Medido aquí mismo: `false | head -1; c=$?`
 * da 0; con `set -o pipefail` da 1; y `${PIPESTATUS[0]}` da 1 — las dos reparaciones se permiten y se
 * nombran. SOLO BASH: en PowerShell 5.1, MEDIDO, `$LASTEXITCODE` sobrevive al pipeline (7), así que
 * rechazarlo allí sería enrojecer trabajo correcto. Y no basta con que el texto contenga `$?`: la
 * sentencia debe CONSUMIR el estado (asignarlo, imprimirlo, probarlo o salir con él), así que un mensaje
 * de commit que lo mencione pasa, y el cuerpo de un heredoc ni llega aquí. SIN REGEX.
 */

import { DIALECTS, commandWordIndex, executableName, simpleCommands } from '../shell-command/shell-command.mjs';

/** The parameter bash overwrites with the last pipeline member's status. @es El parámetro que bash sobrescribe. */
const STATUS = '$?';

/** The option that makes `$?` the first failing member's status. @es La opción que hace `$?` útil tras un pipeline. */
const PIPEFAIL = 'pipefail';

/** The operator that ends a pipeline member. @es El operador que termina un miembro del pipeline. */
const PIPE = '|';

/**
 * Separators that END a statement. A command followed by one of these is the last member of whatever
 * preceded it, so the next command is a NEW statement — which is where `$?` is read.
 * @es Separadores que TERMINAN una sentencia; tras uno de ellos empieza una sentencia nueva.
 */
const STATEMENT_ENDS = new Set([';', '\n', '&&', '||', '&', ')', 'end']);

/** Commands that USE the status rather than merely carrying its characters. @es Comandos que USAN el estado. */
const STATUS_CONSUMERS = new Set(['echo', 'printf', 'exit', 'return', 'test', '[', '[[', 'let']);

const NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

/** True for a bash `NAME=value` word — the shape `c=$?` takes. @es Verdadero para `NOMBRE=valor`. */
function isAssignment(word) {
  const name = word.slice(0, Math.max(0, word.indexOf('=')));

  return name.length > 0 && !'0123456789'.includes(name.charAt(0)) && [...name].every((character) => NAME_CHARACTERS.includes(character));
}

/**
 * A word that reads `$?`. `${PIPESTATUS[0]}` needs no exception: it does not contain those two
 * characters, so the repair is recognised by the shell's own spelling rather than by a clause here —
 * and a clause that can never be false is a branch that cannot fire.
 * @es Palabra que lee `$?`. `${PIPESTATUS[0]}` no necesita excepción: no contiene esos caracteres.
 */
function readsStatus(word) {
  return word.includes(STATUS);
}

/** Whether the command CONSUMES the status: assigns it, prints it, tests it, or exits with it. @es Si el comando CONSUME el estado. */
function consumesStatus(command) {
  const carrying = command.words.filter((word) => readsStatus(word));

  if (carrying.length === 0) return false;
  if (carrying.some((word) => isAssignment(word))) return true;

  const at = commandWordIndex(command.words);

  return at !== -1 && STATUS_CONSUMERS.has(executableName(command.words[at]));
}

/** Whether the script turns `pipefail` on, which makes `$?` a real measurement of the pipeline. @es Si el script activa `pipefail`. */
function pipefailIsSet(commands) {
  return commands.some((command) => {
    const at = commandWordIndex(command.words);

    return at !== -1 && executableName(command.words[at]) === 'set' && command.words.some((word) => word.includes(PIPEFAIL));
  });
}

/**
 * The first place `command` reads a status bash has already discarded, as
 * `{ pipeline, statement }` naming both halves, or `undefined` when nothing does.
 * Only `Bash` is decided; every other tool returns `undefined` (see the header for the measurement).
 * @es El primer sitio donde `command` lee un estado que bash ya descartó, o `undefined`.
 */
export function readsPipelineStatus(toolName, command) {
  if (toolName !== 'Bash' || typeof command !== 'string' || !command.includes(STATUS)) return undefined;

  const commands = simpleCommands(command, DIALECTS.BASH);

  if (pipefailIsSet(commands)) return undefined;

  for (let index = 2; index < commands.length; index += 1) {
    const statement = commands[index];

    if (!consumesStatus(statement)) continue;

    const last = commands[index - 1];

    // The statement must START a new one: otherwise it is itself a member of the pipeline.
    // @es La sentencia debe EMPEZAR una nueva; si no, es un miembro más del pipeline.
    if (!STATEMENT_ENDS.has(last.separator)) continue;

    const previous = commands[index - 2];

    if (previous.separator !== PIPE) continue;

    return { pipeline: `${previous.text} ${PIPE} ${last.text}`, statement: statement.text };
  }

  return undefined;
}
