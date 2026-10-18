/**
 * Whether a script text, fed to an interpreter through a heredoc, a here-string or a PowerShell here-string,
 * WRITES A FILE. That is the one question this module answers; where the text comes from is `detect.mjs`.
 *
 * WHY (2026-10-18, a delegated writer): source written through `node - <<'EOF' … fs.writeFileSync(…) … EOF`
 * lost a backslash and an apostrophe on the way, and nothing refused it. The Write and Edit tools never go
 * through a shell; a script that writes a file from a shell-fed script does. So a delegated agent that does it
 * is sent to those tools instead.
 *
 * WHAT COUNTS AS A WRITE is deliberately plain and listed: the write calls of node, python and PowerShell by
 * name, a python `open(…)` whose mode writes, appends or creates, and, for a shell-like interpreter, a `>`
 * redirection that is not a file-descriptor copy (`2>&1`) and does not target `/dev/null`. A script that only
 * reads, prints or compares (`a > b` in node is NOT looked at: `>` counts only for shell-like interpreters)
 * is untouched.
 *
 * @es Si un texto de script, entregado a un intérprete por heredoc, here-string o here-string de PowerShell,
 * ESCRIBE UN FICHERO. Es lo único que responde este módulo; de dónde sale el texto lo decide `detect.mjs`.
 * POR QUÉ (2026-10-18, un escritor delegado): código fuente escrito con `node - <<'EOF' … fs.writeFileSync(…)`
 * perdió un backslash y un apóstrofe por el camino y nada lo rechazó. Las herramientas Write y Edit no pasan
 * por ningún shell; un script que escribe un fichero desde un script entregado por shell, sí. QUÉ CUENTA COMO
 * ESCRITURA es llano y está listado: las llamadas de escritura de node, python y PowerShell por nombre, un
 * `open(…)` de python con modo de escritura, adición o creación y, para un intérprete tipo shell, una
 * redirección `>` que no sea copia de descriptor (`2>&1`) ni apunte a `/dev/null`.
 */

/** Calls that write a file, by the text they leave in a script. @es Llamadas que escriben un fichero, por el texto que dejan en el script. */
export const WRITE_MARKERS = ['writeFile', 'appendFile', 'fs.write', 'createWriteStream', 'write_text', 'write_bytes', 'Set-Content', 'Add-Content', 'Out-File', 'WriteAllText'];

/** Python `open` modes that write, append or create. @es Modos de `open` de python que escriben, añaden o crean. */
const WRITING_MODE_LETTERS = 'wax+';

const OPEN_CALL = 'open(';
const NULL_DEVICE = '/dev/null';

const isIdentifierCharacter = (character) =>
  character !== undefined && ((character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || character === '_');

/** The mode argument of one `open(` call's argument text, without quotes, or `undefined`. @es El argumento de modo de un `open(`, sin comillas, o `undefined`. */
function modeOf(argumentText) {
  const parts = argumentText.split(',').map((part) => part.trim());
  const named = parts.find((part) => part.startsWith('mode='));
  const raw = named === undefined ? parts[1] : named.slice('mode='.length).trim();

  if (raw === undefined) return undefined;

  const quote = raw[0];

  if (quote !== "'" && quote !== '"') return undefined;

  const closing = raw.indexOf(quote, 1);

  return raw.slice(1, closing === -1 ? raw.length : closing);
}

/** Whether the script calls python's `open` in a mode that writes. @es Si el script llama al `open` de python con un modo que escribe. */
function opensForWriting(text) {
  let from = text.indexOf(OPEN_CALL);

  while (from !== -1) {
    const startsACall = !isIdentifierCharacter(text[from - 1]);
    const close = text.indexOf(')', from);
    const mode = startsACall && close !== -1 ? modeOf(text.slice(from + OPEN_CALL.length, close)) : undefined;

    if (mode !== undefined && [...mode].some((letter) => WRITING_MODE_LETTERS.includes(letter))) return true;

    from = text.indexOf(OPEN_CALL, from + 1);
  }

  return false;
}

/** Whether a shell-like script redirects output into a file. @es Si un script tipo shell redirige la salida a un fichero. */
function redirectsToFile(text) {
  for (let index = text.indexOf('>'); index !== -1; index = text.indexOf('>', index + 1)) {
    let target = index + 1;

    if (text[target] === '>') target += 1;

    if (text[target] === '&') continue;

    while (text[target] === ' ' || text[target] === '\t') target += 1;

    if (!text.startsWith(NULL_DEVICE, target)) return true;
  }

  return false;
}

/**
 * The reason a script writes a file, or `undefined` when it does not. `shellLike` turns on the `>` rule.
 * @es La razón por la que un script escribe un fichero, o `undefined`. `shellLike` activa la regla de `>`.
 */
export function writeEvidence(text, { shellLike }) {
  const marker = WRITE_MARKERS.find((candidate) => text.includes(candidate));

  if (marker !== undefined) return `calls ${marker}`;
  if (opensForWriting(text)) return "opens a file with a mode that writes (open(…, 'w'))";
  if (shellLike && redirectsToFile(text)) return 'redirects output into a file (>)';

  return undefined;
}
