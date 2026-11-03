/**
 * Every file a shell line WRITES to — the shell half of the question "which files does a tool call
 * write?", owned by this directory and read by the golden guard and by the isolation boundary alike.
 *
 * WHAT COUNTS AS A WRITE: an output redirection (`>`, `>>`, `&>`, …, via `redirect-targets.mjs`),
 * `sed -i`/`sed --in-place`, `tee`, the DESTINATION of `cp`/`mv` and of the PowerShell
 * `Copy-Item`/`Move-Item` family (by `-Destination` or position), and the PowerShell content cmdlets
 * `Set-Content`/`Out-File`/`Add-Content` (by `-Path`/`-FilePath` or their first positional argument), and the
 * destination of cmd's `copy`/`move`.
 *
 * EACH COMMAND IN ITS OWN DIALECT. A name can mean a different program in another shell: `cp` and `mv` are
 * Copy-Item and Move-Item in PowerShell, and `copy` and `move` are cmd's own builtins in a `cmd /c` script,
 * whose switches are `/y`, not `-Destination`. So each command's writer is chosen by the dialect the shared parser
 * READ it in (`command.dialect`), never by the line's, and its redirections are the ones the parser listed.
 *
 * WHAT IS NOT LEXED, stated: a write made by a CHILD PROCESS (`npm run api:update`, a `node script.mjs`
 * that writes files) and deletions or creations (`rm`, `mkdir`, `touch`, `New-Item`, `Remove-Item`). The
 * golden guard needs the child-process asymmetry — `api:update` is the one producer it must leave
 * unblocked — and adding deletions would change what it refuses without anyone having decided that.
 *
 * UNRESOLVABLE TARGETS ARE REPORTED, NOT GUESSED: the caller decides what an unknowable target means.
 * Both current callers ALLOW it — a stated tradeoff, unlike the cherry-pick and toolchain guards this
 * module borrows its directory-tracking from, where an unknowable landing IS the dangerous case. The
 * dangerous case here is a LITERAL hand-typed path (a worker fixing up `etc/button.api.md`, or copying
 * onto an absolute main-checkout path); neither computes it from a shell variable. Refusing every
 * `cd`-into-a-variable or `> "$LOG_FILE"` across the whole fleet — most of this project's ordinary
 * shell usage — would trade a large amount of daily friction for a coincidence that has never happened.
 * Stated rather than hidden, per this project's own rule that a tradeoff is named before it is chosen.
 *
 * WHERE THE PARTS COME FROM: `simpleCommands`/`commandWordIndex`/`executableName` (`shell-command.mjs`,
 * the shared parser), `withWorkingDirectories`/`nativeSpelling` (`cherry-pick-guard/working-directory.mjs`,
 * already reused across folders by `toolchain-guard/package-manager-mutations.mjs` — read, never
 * modified), and `outputRedirectionTargets` (this directory's own `redirect-targets.mjs`, which decides on the
 * redirections the parser lists).
 *
 * @es Cada fichero al que ESCRIBE una línea de shell: la mitad de shell de «¿qué ficheros escribe una
 * llamada de herramienta?», que leen el guard de goldens y la frontera de aislamiento. CUENTA COMO
 * ESCRITURA: una redirección de salida, `sed -i`, `tee`, el DESTINO de `cp`/`mv` y de la familia
 * `Copy-Item`/`Move-Item`, y los cmdlets `Set-Content`/`Out-File`/`Add-Content`. NO SE LEXEA: lo que
 * escribe un PROCESO HIJO (`npm run api:update`, un `node script.mjs`) ni las borraduras/creaciones
 * (`rm`, `mkdir`, `touch`, `New-Item`, `Remove-Item`). LOS DESTINOS NO RESOLUBLES SE REPORTAN, no se
 * adivinan; ambos llamadores los PERMITEN — tradeoff declarado: el caso peligroso es una ruta escrita a
 * mano LITERALMENTE, no calculada desde una variable de shell. CADA COMANDO EN SU DIALECTO: `cp`/`mv` son Copy-Item
 * y Move-Item en PowerShell, y `copy`/`move` son órdenes propias de cmd dentro de `cmd /c`; el escritor se elige por
 * el dialecto en que el parser LEYÓ el comando, nunca por el de la línea.
 */

import path from 'node:path';

import { nativeSpelling, withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { commandWordIndex, DIALECTS, executableName, isUnresolvableWord, simpleCommands } from '../shell-command/shell-command.mjs';
import { outputRedirectionTargets } from './redirect-targets.mjs';

/** A word that is an option rather than an operand. A bare `-` is an operand (stdin/stdout). @es Palabra que es opción, no operando. */
const isFlag = (word) => word.startsWith('-') && word !== '-';


const SED_INPLACE_TOKENS = new Set(['-i', '--in-place']);

/** A short-option cluster carrying `i` (`-i.bak`, `-ni`): in-place, and everything after the `i` is its backup SUFFIX. @es Un grupo de opciones cortas con `i`: in-place; lo que sigue a la `i` es el SUFIJO. */
const isShortClusterWithInPlace = (word) => word.startsWith('-') && !word.startsWith('--') && word.length > 1 && word.includes('i');

/** Whether `words` (sed's arguments, `sed` itself excluded) turn on in-place editing. @es Si `words` activa la edición in-place de sed. */
function sedIsInPlace(words) {
  return words.some((word) => SED_INPLACE_TOKENS.has(word) || word.startsWith('--in-place=') || isShortClusterWithInPlace(word));
}

/** Options after which sed has its SCRIPT (`-e`, `-f`): then every operand is a file. @es Opciones que aportan el script de sed. */
const SED_SCRIPT_OPTIONS = new Set(['-e', '-f', '--expression', '--file']);

/** Options that take the NEXT word as a value which is neither script nor file. @es Opciones cuyo valor es la palabra siguiente. */
const SED_VALUE_OPTIONS = new Set(['-l', '--line-length']);

/** A short-option cluster whose last letter is `e` or `f` (`-ne`), which takes the script as its value; a cluster with `i` is excluded because its tail is a backup SUFFIX. @es Un grupo de opciones cortas que termina en `e`/`f`. */
const endsInScriptOption = (word) => !word.startsWith('--') && !isShortClusterWithInPlace(word) && word.length > 2 && 'ef'.includes(word.at(-1));

/**
 * `sed -i`'s file targets. sed's own grammar decides which operand is which: when the script is given with
 * `-e`/`-f` EVERY operand is a file, and otherwise the FIRST operand is the script and the rest are files. The
 * script is therefore never a target — it used to be listed as one "for safety", and a script such as
 * `s#'../../x'#'C:/y'#` resolved against the working directory became a phantom path the isolation boundary
 * refused. A flag value (`-l 5`) is consumed, not read as a file.
 * @es Los destinos de `sed -i`, según la gramática de sed: con `-e`/`-f` todo operando es fichero; si no, el
 * PRIMERO es el script y el resto ficheros. El script nunca es un destino.
 */
function sedInPlaceTargets(words) {
  if (!sedIsInPlace(words)) return [];

  const operands = [];
  let scriptGiven = false;
  let operandsOnly = false;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];

    if (!operandsOnly && word === '--') {
      operandsOnly = true;
      continue;
    }

    if (!operandsOnly && (SED_SCRIPT_OPTIONS.has(word) || endsInScriptOption(word))) {
      scriptGiven = true;
      index += 1;
      continue;
    }

    if (!operandsOnly && (word.startsWith('--expression=') || word.startsWith('--file='))) {
      scriptGiven = true;
      continue;
    }

    if (!operandsOnly && SED_VALUE_OPTIONS.has(word)) {
      index += 1;
      continue;
    }

    if (!operandsOnly && isFlag(word)) continue;

    operands.push(word);
  }

  return scriptGiven ? operands : operands.slice(1);
}

/** `tee`'s file targets: every non-flag operand. @es Los destinos de `tee`: cada operando no-flag. */
function teeTargets(words) {
  return words.filter((word) => !isFlag(word));
}

/** `cp`/`mv`'s destination: the LAST non-flag operand, their ordinary one-destination shape. @es El destino de `cp`/`mv`: el último operando no-flag. */
function lastOperandTarget(words) {
  const operands = words.filter((word) => !isFlag(word));

  return operands.length > 0 ? [operands.at(-1)] : [];
}

const POWERSHELL_PATH_PARAMETERS = new Set(['-path', '-filepath', '-literalpath']);

/** Copy-Item/Move-Item parameters whose value is NOT the destination. @es Parámetros de Copy-Item/Move-Item cuyo valor NO es el destino. */
const POWERSHELL_COPY_VALUE_PARAMETERS = new Set(['-path', '-literalpath', '-filter', '-include', '-exclude', '-credential', '-stream']);

/** Copy-Item/Move-Item parameters that name the SOURCE. @es Parámetros de Copy-Item/Move-Item que nombran el ORIGEN. */
const POWERSHELL_SOURCE_PARAMETERS = new Set(['-path', '-literalpath']);

/**
 * A PowerShell content cmdlet's file target: the value after `-Path`/`-FilePath`/`-LiteralPath` when
 * named, else the first positional operand — `Set-Content etc/x.api.md -Value $y` and
 * `Set-Content -Path etc/x.api.md -Value $y` are both real, common shapes.
 * @es El destino de un cmdlet de contenido de PowerShell: el valor tras `-Path`, o el primer posicional.
 */
function powershellContentTarget(words) {
  for (let index = 0; index < words.length; index += 1) {
    if (POWERSHELL_PATH_PARAMETERS.has(words[index].toLowerCase())) return words[index + 1] === undefined ? [] : [words[index + 1]];
  }

  const positional = words.find((word) => !isFlag(word));

  return positional === undefined ? [] : [positional];
}

/**
 * A `Copy-Item`/`Move-Item` destination: the value after `-Destination` when named, else the second
 * positional operand — or the first, when the source was named with `-Path`/`-LiteralPath`. Counting
 * matters: `Copy-Item a b` writes `b`, and `Copy-Item -Destination b a` still writes `b`.
 * @es El destino de `Copy-Item`/`Move-Item`: el valor tras `-Destination`, o el segundo posicional (el
 * primero si el origen se nombró con `-Path`).
 */
function powershellCopyTarget(words) {
  const positionals = [];
  let sourceNamed = false;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const parameter = word.toLowerCase();

    if (parameter === '-destination') return words[index + 1] === undefined ? [] : [words[index + 1]];

    if (!isFlag(word)) {
      positionals.push(word);
      continue;
    }

    if (POWERSHELL_COPY_VALUE_PARAMETERS.has(parameter)) {
      sourceNamed = sourceNamed || POWERSHELL_SOURCE_PARAMETERS.has(parameter);
      index += 1;
    }
  }

  const destination = positionals[sourceNamed ? 0 : 1];

  return destination === undefined ? [] : [destination];
}

/**
 * Per executable NAME (lower-cased, extension-stripped — `executableName`'s own contract), how to find
 * its write targets from its OWN arguments (the executable word itself excluded), and the label a
 * refusal names it by.
 * @es Por NOMBRE de ejecutable, cómo hallar sus destinos de escritura y la etiqueta con la que un rechazo lo nombra.
 */
const WORD_BASED_WRITERS = new Map([
  ['sed', { label: 'sed -i', targetsOf: sedInPlaceTargets }],
  ['tee', { label: 'tee', targetsOf: teeTargets }],
  ['cp', { label: 'cp', targetsOf: lastOperandTarget }],
  ['mv', { label: 'mv', targetsOf: lastOperandTarget }],
  ['copy-item', { label: 'PowerShell Copy-Item', targetsOf: powershellCopyTarget }],
  ['copy', { label: 'PowerShell Copy-Item', targetsOf: powershellCopyTarget }],
  ['cpi', { label: 'PowerShell Copy-Item', targetsOf: powershellCopyTarget }],
  ['move-item', { label: 'PowerShell Move-Item', targetsOf: powershellCopyTarget }],
  ['move', { label: 'PowerShell Move-Item', targetsOf: powershellCopyTarget }],
  ['mi', { label: 'PowerShell Move-Item', targetsOf: powershellCopyTarget }],
  ['set-content', { label: 'PowerShell Set-Content', targetsOf: powershellContentTarget }],
  ['out-file', { label: 'PowerShell Out-File', targetsOf: powershellContentTarget }],
  ['add-content', { label: 'PowerShell Add-Content', targetsOf: powershellContentTarget }]
]);

/** A cmd switch (`/y`, `/-y`, `/b`): a slash and at most two characters, never a path. @es Un switch de cmd: barra y como mucho dos caracteres. */
const isCmdSwitch = (word) => word.startsWith('/') && word.length <= 3 && !word.slice(1).includes('/');

/**
 * cmd `copy`/`move`'s destination: the LAST operand that is no switch, or, with one operand only, the file of
 * that name in the directory it runs in (`copy C:\x\a.txt` writes `.\a.txt`).
 * @es El destino de `copy`/`move` de cmd: el ÚLTIMO operando que no es switch o, con un solo operando, el fichero de
 * ese nombre en el directorio en que corre.
 */
function cmdCopyTarget(words) {
  const operands = words.filter((word) => !isCmdSwitch(word));

  if (operands.length === 1) return [path.win32.basename(operands[0])];

  return operands.length > 0 ? [operands.at(-1)] : [];
}

/**
 * The writers whose name means another program in one dialect, which win over `WORD_BASED_WRITERS` there.
 * @es Los escritores cuyo nombre significa otro programa en un dialecto, que allí ganan a `WORD_BASED_WRITERS`.
 */
const DIALECT_WRITERS = new Map([
  [
    DIALECTS.POWERSHELL,
    new Map([
      ['cp', { label: 'PowerShell Copy-Item', targetsOf: powershellCopyTarget }],
      ['mv', { label: 'PowerShell Move-Item', targetsOf: powershellCopyTarget }]
    ])
  ],
  [
    DIALECTS.CMD,
    new Map([
      ['copy', { label: 'cmd copy', targetsOf: cmdCopyTarget }],
      ['move', { label: 'cmd move', targetsOf: cmdCopyTarget }]
    ])
  ]
]);

/** The writer a program name is in the dialect its command was read in, or `undefined`. @es El escritor que es un nombre en el dialecto de su comando. */
const writerOf = (name, dialect) => DIALECT_WRITERS.get(dialect)?.get(name) ?? WORD_BASED_WRITERS.get(name);

/** One candidate write target, resolved against the directory it runs in, or marked `unresolvable`. @es Un destino candidato, resuelto contra su directorio, o marcado `unresolvable`. */
function resolvedTarget(raw, directory, platform, via) {
  if (isUnresolvableWord(raw)) return { path: undefined, unresolvable: `the ${via} target depends on a variable`, via };
  if (directory === undefined) return { path: undefined, unresolvable: `the directory this ${via} runs in is unknowable`, via };

  return { path: path.resolve(directory, nativeSpelling(raw, platform)), unresolvable: undefined, via };
}

/**
 * Every candidate write target `script` performs.
 *
 * @param script The shell line exactly as the tool received it.
 * @param dialect `'bash'` or `'powershell'` (`shell-command.mjs`'s `DIALECTS`).
 * @param cwd The directory the line starts in.
 * @param platform Injectable for the Git Bash path translation; defaults to this process's.
 * @returns `[{ path, via }]` for a resolvable target, `[{ path: undefined, unresolvable, via }]` for one
 *   this module cannot pin down — see the module header for why the latter is ALLOWED, not refused.
 * @es Cada destino de escritura candidato que ejecuta `script`.
 */
export function shellWriteTargets(script, dialect, cwd, platform = process.platform) {
  const found = [];

  for (const { command, directory } of withWorkingDirectories(simpleCommands(script, dialect), cwd, dialect, platform)) {
    const at = commandWordIndex(command.words);

    if (at !== -1) {
      const words = command.words.slice(at);
      const writer = writerOf(executableName(words[0]), command.dialect);

      if (writer !== undefined) {
        for (const raw of writer.targetsOf(words.slice(1))) found.push(resolvedTarget(raw, directory, platform, writer.label));
      }
    }

    for (const redirect of outputRedirectionTargets(command)) {
      found.push(
        'unresolvable' in redirect
          ? { path: undefined, unresolvable: redirect.unresolvable, via: 'a shell redirection' }
          : resolvedTarget(redirect.target, directory, platform, 'a shell redirection')
      );
    }
  }

  return found;
}
