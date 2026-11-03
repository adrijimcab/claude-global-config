/**
 * The file each OUTPUT redirection of one parsed shell command targets.
 *
 * ONE LEXER. `shell-command.mjs`'s `simpleCommands` (the shared parser every guard on this machine reuses) lists
 * every redirection of a command with its operator, its target word and the quoting that word was written in
 * (`command.redirections`), read in the dialect the command was READ in, nested `cmd /c` scripts included. This
 * module only DECIDES on that list: which operators write a file, which target is a file descriptor rather than
 * a file, and which target depends on an expansion. It used to re-lex the command's text with a scanner of its
 * own, in the LINE's dialect, so a `cmd /c "echo x > C:\a\b.txt"` inside a bash line lost its backslashes; there
 * is no second reading any more.
 *
 * ONLY redirections that WRITE are recognised (`>`, `>>`, `>|`, `>&`, `&>`, `&>>`, with a descriptor before them,
 * `2>`, `*>`, and bash `<>`, which opens read-write and creates a missing file): a file is READ, never written, by
 * an input redirection, so `<`, `<<`, `<<<` and `<&` are deliberately excluded.
 *
 * @es El fichero que nombra como destino cada redirección de SALIDA de un comando ya analizado. UN SOLO LEXER:
 * `simpleCommands` lista cada redirección con su operador, su palabra destino y su entrecomillado, leída en el
 * dialecto en que se LEYÓ el comando (también los scripts anidados de `cmd /c`); este módulo solo DECIDE sobre esa
 * lista: qué operadores escriben un fichero, qué destino es un descriptor y no un fichero, y qué destino depende de
 * una expansión. Antes volvía a analizar el texto con un escáner propio, en el dialecto de la LÍNEA, y un
 * `cmd /c "echo x > C:\a\b.txt"` dentro de bash perdía sus barras invertidas. Solo reconoce redirecciones de SALIDA.
 */

import { DIALECTS, QUOTES } from '../shell-command/shell-command.mjs';

/** The descriptors a redirection may name before its operator (`2>`, `*>`). @es Los descriptores que pueden ir antes del operador. */
const DESCRIPTOR_CHARACTERS = '0123456789*';

/** What an output operator starts with once its descriptor is set aside; bash `<>` opens read-write and creates the file. @es Con qué empieza un operador de salida sin su descriptor; `<>` de bash abre en lectura-escritura y crea el fichero. */
const OUTPUT_OPENERS = Object.freeze(['>', '&>', '<>']);

/** The quotings in which a shell expands a variable; single quotes and `$'…'` keep it literal. @es Los entrecomillados en que la shell expande una variable. */
const EXPANDING_QUOTES = new Set([QUOTES.BARE, QUOTES.DOUBLE]);

/** A descriptor number or the close marker `-` — what follows `>&` when it is not a file. @es Un número de descriptor o `-`. */
function isDescriptorWord(word) {
  return word === '-' || (word.length > 0 && [...word].every((character) => '0123456789'.includes(character)));
}

/** Whether a redirection operator writes: `>`, `&>` or `<>` once a leading descriptor is set aside. @es Si un operador de redirección escribe. */
function isOutputOperator(operator) {
  const afterDescriptor = operator.slice([...operator].findIndex((character) => !DESCRIPTOR_CHARACTERS.includes(character)));

  return OUTPUT_OPENERS.some((opener) => afterDescriptor.startsWith(opener));
}

/**
 * What the target's value depends on that only the running shell knows, or `undefined`: a substitution, or a
 * variable (`$` in bash and PowerShell, `%` in cmd) written where the shell expands it.
 * @es De qué depende el valor del destino que solo sabe la shell en ejecución: una sustitución o una variable
 * escrita donde la shell la expande.
 */
function expansionOf({ target, quoting }, dialect) {
  const marker = dialect === DIALECTS.CMD ? '%' : '$';
  const reasons = quoting.map((span) => {
    if (span.quote === QUOTES.SUBSTITUTION) return target.slice(span.valueStart, span.valueEnd).startsWith('$(') ? 'a $(...) command substitution' : 'a backtick command substitution';

    return EXPANDING_QUOTES.has(span.quote) && target.slice(span.valueStart, span.valueEnd).includes(marker) ? 'a shell variable' : undefined;
  });

  return reasons.find((reason) => reason !== undefined);
}

/**
 * Every OUTPUT redirection target of one command as `simpleCommands` (`shell-command.mjs`) lists it.
 *
 * @param command One entry of `simpleCommands(...)`: its `redirections` and the `dialect` it was read in.
 * @returns `[{ target } | { unresolvable }]`, one per output redirection to a file, in written order.
 * @es Cada destino de redirección de SALIDA de un comando de `simpleCommands`, en el orden escrito.
 */
export function outputRedirectionTargets(command) {
  const targets = [];

  for (const redirection of command?.redirections ?? []) {
    // A target that never came (`echo >` at the end of the line) names nothing to report. @es Un destino que nunca llegó no nombra nada.
    if (!isOutputOperator(redirection.operator) || redirection.target === undefined) continue;

    // `2>&1` / `>&2` / `>&-` DUPLICATE or CLOSE a file descriptor: the word after `>&` is a descriptor, not a
    // file. Reading it as a path made every `cmd 2>&1` look like a write to a file named `1` (measured: a
    // worker's read-only `rg … 2>&1` was refused after a `cd` into a directory its policy did not cover).
    // @es `2>&1` / `>&2` / `>&-` DUPLICAN o CIERRAN un descriptor: la palabra tras `>&` no es un fichero.
    if (redirection.operator.endsWith('&') && isDescriptorWord(redirection.target)) continue;

    const expansion = expansionOf(redirection, command.dialect);

    targets.push(expansion === undefined ? { target: redirection.target } : { unresolvable: `the redirection target depends on ${expansion}` });
  }

  return targets;
}
