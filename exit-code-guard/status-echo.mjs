/**
 * The DECISION of the exit-code guard: does a command END by printing the exit status it was written to
 * preserve — which, by the shell's own rules, replaces that status with the print's success?
 *
 * One rule per shell, because the two shells differ in exactly the places that decide it:
 *
 *   BASH — the status of a `;`/newline list is its LAST command's. `false; echo "EXIT=$?"` exits 0.
 *
 *   POWERSHELL — measured 2026-09-14 on Windows PowerShell 5.1 (`powershell.exe -NoProfile
 *   -NonInteractive -Command`), every row read from the process exit code:
 *
 *     cmd /c exit 7                                                      -> 1  (failure surfaces)
 *     cmd /c exit 7; Write-Output "EXIT=$LASTEXITCODE"                   -> 0  (printed 7, reported 0)
 *     cmd /c exit 7; echo $LASTEXITCODE                                  -> 0
 *     cmd /c exit 7; "EXIT=$LASTEXITCODE"                                -> 0  (a bare string is output)
 *     cmd /c exit 7; Write-Host "EXIT=$LASTEXITCODE"                     -> 0
 *     Get-Item C:\does-not-exist; Write-Output "ok=$?"                   -> 0
 *     cmd /c exit 7<newline>Write-Output "EXIT=$LASTEXITCODE"            -> 0  (a newline separates too)
 *     cmd /c exit 7; if ($?) { Write-Output ok }                         -> 1  (a guarded block preserves it)
 *     cmd /c exit 7; $code = $LASTEXITCODE; Write-Output "EXIT=$code"; exit $code  -> 7  (the correct shape)
 *
 *   So the PowerShell shape is the same defect with different words: the status variables are
 *   `$LASTEXITCODE` (native programs) and `$?` (everything), the printers are `echo`/`write`/`Write-
 *   Output`/`Write-Host`/`Write-Information`/`Add-Content`/`Set-Content`/`Out-File` or a bare string, and
 *   names are case-insensitive. And a `;` inside `{ }`, `( )` or quotes does not end a statement — the
 *   guarded-block row above is why the PowerShell splitter tracks depth and quotes rather than cutting on
 *   every `;`, which would refuse a shape that measurably preserves the failure.
 *
 * WHY BASH KEEPS ITS OWN SPLITTER. Bash quoting (`'…'` literal, `$(…)`, here-docs) is not PowerShell's,
 * and the Bash rule is pinned by the cases this project actually runs. Sharing one splitter would make it
 * wrong for one of the two shells; each shell's rule is stated with its own measurement instead.
 *
 * NO REGEX (M5): character walks and `startsWith`/`includes` on literals.
 *
 * @es La DECISIÓN del guard: ¿termina un comando imprimiendo el código de salida que pretendía conservar,
 * lo que por las reglas de la shell lo sustituye por el éxito de la impresión? Una regla por shell. En
 * PowerShell 5.1 (medido): la salida es la de la ÚLTIMA sentencia, así que `cmd; Write-Output
 * "EXIT=$LASTEXITCODE"` sale 0; las variables son `$LASTEXITCODE` y `$?`, las impresoras varias y sin
 * distinguir mayúsculas, y un `;` dentro de llaves, paréntesis o comillas no termina sentencia — por eso
 * el separador de PowerShell sigue profundidad y comillas. SIN REGEX.
 */

/** Bash: statements separated by `;` or a newline. `&&`/`||` bind the status and are not separators. @es Bash: sentencias separadas por `;` o salto de línea. */
function bashStatements(command) {
  const parts = [];
  let current = '';

  for (const character of command) {
    if (character === ';' || character === '\n') {
      parts.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  parts.push(current);

  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** Bash: an `echo`/`printf` that reads `$?`. @es Bash: un `echo`/`printf` que lee `$?`. */
function bashPrintsStatus(statement) {
  return (statement.startsWith('echo ') || statement.startsWith('printf ')) && statement.includes('$?');
}

const OPENERS = '{(';
const CLOSERS = '})';

/**
 * PowerShell: TOP-LEVEL statements. A `;` or newline ends a statement only outside quotes and outside
 * `{ }`/`( )`, and a newline right after a backtick is a line continuation, not a separator.
 * @es PowerShell: sentencias de NIVEL SUPERIOR, fuera de comillas y de llaves/paréntesis; un salto tras
 * acento grave continúa la línea.
 */
function powershellStatements(command) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote;

  for (const character of command) {
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      current += character;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }

    if (OPENERS.includes(character)) depth += 1;

    if (CLOSERS.includes(character)) depth = Math.max(0, depth - 1);

    const continued = character === '\n' && current.trimEnd().endsWith('`');
    const separates = depth === 0 && !continued && (character === ';' || character === '\n');

    if (separates) {
      parts.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  parts.push(current);

  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** Commands that PRINT or WRITE, lowercased, each followed by whitespace in a statement. @es Comandos que imprimen o escriben. */
const POWERSHELL_PRINTERS = ['echo', 'write', 'write-output', 'write-host', 'write-information', 'add-content', 'set-content', 'out-file'];

/** The status variables, lowercased. @es Las variables de estado. */
const POWERSHELL_STATUS = ['$lastexitcode', '$?'];

/** PowerShell: a statement that prints a status variable — by a printer, as a bare string, or as the bare variable. @es PowerShell: una sentencia que imprime una variable de estado. */
function powershellPrintsStatus(statement) {
  const lowered = statement.toLowerCase();

  if (!POWERSHELL_STATUS.some((variable) => lowered.includes(variable))) return false;

  const printer = POWERSHELL_PRINTERS.some((name) => lowered.startsWith(`${name} `) || lowered.startsWith(`${name}\t`));
  const bareOutput = lowered.startsWith('"') || lowered.startsWith("'") || POWERSHELL_STATUS.some((variable) => lowered === variable);

  return printer || bareOutput;
}

/**
 * The shells this decision covers, and how each splits and judges. This map IS the covered set: the
 * guard's declaration is checked against its keys by the selftest.
 * @es Las shells cubiertas y cómo separa y juzga cada una. Este mapa ES el conjunto cubierto.
 */
export const SHELLS = Object.freeze({
  Bash: Object.freeze({ statements: bashStatements, printsStatus: bashPrintsStatus }),
  PowerShell: Object.freeze({ statements: powershellStatements, printsStatus: powershellPrintsStatus }),
});

/**
 * Whether `command`, run by `toolName`, ends by printing the exit status. A lone print discards nothing —
 * there is no preceding command whose status it hides.
 * @es Si `command` termina imprimiendo el código de salida. Una impresión sola no oculta nada.
 */
export function endsByPrintingStatus(toolName, command) {
  if (typeof toolName !== 'string' || !Object.hasOwn(SHELLS, toolName)) return false;
  if (typeof command !== 'string') return false;

  const shell = SHELLS[toolName];
  const parts = shell.statements(command);

  if (parts.length < 2) return false;

  return shell.printsStatus(parts.at(-1));
}
