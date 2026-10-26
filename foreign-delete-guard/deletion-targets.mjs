/**
 * Every path a shell line DELETES, as the shared parser reads it: `rm`, `rmdir`, `unlink`, `del`, `erase`, `rd`,
 * `Remove-Item` and its alias `ri` (and the PowerShell aliases of the same names), `find ... -delete` and
 * `find ... -exec rm`, `xargs rm`, and `git clean`. This is the deletion half of the question that
 * `write-targets/` answers for writes; that vendored directory says in its header that deletions are not lexed,
 * so they live here, on the same parser (`simpleCommands`) and the same directory tracking
 * (`withWorkingDirectories`), with no second lexer.
 *
 * RESOLVED BEFORE DECIDED. A wildcard is expanded against the file system (`operand-paths.mjs`), so the
 * decision sees the files a glob really reaches. What cannot be known is reported with a reason code and never
 * guessed: a variable or substitution (`variable`), an unknowable `cd` (`directory`), `xargs` operands that
 * arrive on standard input (`stdin`), a `Remove-Item` fed by the pipeline (`pipeline`), and a `git clean` whose
 * dry run failed (`preview`).
 *
 * `find` IS TREATED AS ITS WHOLE SUBTREE. The predicates (`-name`, `-mtime`, ...) are not evaluated, so every
 * file under a start path counts as possibly deleted. That is stricter than the truth by design: a guard that
 * evaluated find could be argued past, one that does not can only over-refuse, and the remedy (delete inside
 * your own folder) is cheap. `git clean` is the opposite case: git itself lists what it would remove (`-n`), so
 * the exact files are known.
 *
 * STATED LIMITS. A deletion made by an interpreter (`node -e fs.rmSync(...)`, `python -c shutil.rmtree(...)`),
 * `git rm`, `mv` to nowhere and a script run by name are not lexed. `Remove-Item -Include/-Exclude/-Filter` are
 * not applied (the unfiltered path is judged), which can only over-refuse.
 *
 * @es Cada ruta que BORRA una línea de shell, leída con el parser compartido: `rm`, `rmdir`, `unlink`, `del`,
 * `erase`, `rd`, `Remove-Item` y su alias `ri`, `find ... -delete` y `find ... -exec rm`, `xargs rm` y
 * `git clean`. Es la mitad de borrados de lo que `write-targets/` responde para escrituras (su cabecera dice que
 * no lexea borrados), sobre el mismo parser y el mismo seguimiento de directorios. Se RESUELVE ANTES DE DECIDIR:
 * el comodín se expande contra el sistema de ficheros; lo que no se puede saber se informa con un código
 * (`variable`, `directory`, `stdin`, `pipeline`, `preview`) y nunca se adivina. `find` cuenta como TODO SU
 * SUBÁRBOL (no se evalúan sus predicados: puede rechazar de más, nunca de menos); `git clean` lista él mismo lo
 * que borraría (`-n`). LÍMITES: un borrado hecho por un intérprete, `git rm` y un script por nombre no se
 * lexean; `-Include/-Exclude/-Filter` no se aplican.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { commandWordIndex, DIALECTS, executableName, simpleCommands } from '../shell-command/shell-command.mjs';
import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { copyOperands } from './creation-targets.mjs';
import { resolveOperand } from './operand-paths.mjs';

/** The executables whose operands are files to delete. @es Los ejecutables cuyos operandos son ficheros a borrar. */
const REMOVERS = new Set(['rm', 'rmdir', 'unlink', 'del', 'erase', 'rd', 'remove-item', 'ri']);

/**
 * The executables that MOVE files: the source stops being where it was, which is a deletion of the source and the
 * way a foreign file could be laundered into the agent's own (the destination is confirmed by identity, and a
 * rename keeps identity). Their sources are judged like the operands of a remover.
 * @es Los ejecutables que MUEVEN ficheros: el origen deja de estar donde estaba, lo que es un borrado del origen y
 * la forma de blanquear un fichero ajeno como propio (el destino se confirma por identidad y renombrar la
 * conserva). Sus orígenes se juzgan como los operandos de un borrador.
 */
const MOVERS = new Set(['mv', 'move-item', 'move', 'mi']);

/** The flags of `cmd` that run a script, in both spellings (Git Bash turns `/c` into `//c`). @es Las banderas de `cmd` que ejecutan un script, en las dos grafías. */
const CMD_SCRIPT_FLAGS = ['/c', '/k', '//c', '//k'];

/** The names that only PowerShell has, so their arguments are read with PowerShell's grammar. @es Los nombres solo de PowerShell. */
const POWERSHELL_ONLY = new Set(['remove-item', 'ri']);

/** The cmd.exe-style removers, whose flags look like `/q`. @es Los borradores al estilo cmd.exe, con banderas `/q`. */
const SLASH_FLAG_REMOVERS = new Set(['del', 'erase', 'rd', 'rmdir']);

/** PowerShell parameters of Remove-Item that take a value. @es Parámetros de Remove-Item de PowerShell que llevan valor. */
const POWERSHELL_VALUE_PARAMETERS = new Set(['-path', '-literalpath', '-include', '-exclude', '-filter', '-stream', '-credential', '-erroraction', '-ea', '-errorvariable', '-ev', '-warningaction', '-wa', '-warningvariable', '-wv', '-informationaction', '-ia', '-informationvariable', '-iv', '-outvariable', '-ov', '-outbuffer', '-ob', '-pipelinevariable', '-pv']);

/** The parameters whose value IS a path to delete. @es Los parámetros cuyo valor ES una ruta a borrar. */
const POWERSHELL_PATH_PARAMETERS = new Set(['-path', '-literalpath']);

/** The parameters that make Remove-Item delete nothing. @es Los parámetros con los que Remove-Item no borra nada. */
const POWERSHELL_DRY_PARAMETERS = new Set(['-whatif', '-wi']);

/** The `find` options that may precede its start paths. @es Las opciones de `find` que pueden preceder a sus rutas de inicio. */
const FIND_LEADING_OPTIONS = new Set(['-H', '-L', '-P']);

/** The `find` actions that run a command per match. @es Las acciones de `find` que ejecutan un comando por coincidencia. */
const FIND_EXEC_ACTIONS = new Set(['-exec', '-execdir', '-ok', '-okdir']);

const isOption = (word) => word.startsWith('-') && word !== '-';

/** A cmd.exe flag: a slash, one letter, and optionally `:value` (`/q`, `/a:r`). @es Una bandera de cmd.exe: barra, una letra y opcionalmente `:valor`. */
const isSlashFlag = (word) => word.length >= 2 && word.charAt(0) === '/' && word.charAt(1).toLowerCase() !== word.charAt(1).toUpperCase() && (word.length === 2 || word.charAt(2) === ':');

/** The operands of a bash-style remover: every word that is not an option, before and after `--`. @es Los operandos de un borrador al estilo bash. */
function bashOperands(name, args) {
  const operands = [];
  let optionsEnded = false;

  for (const word of args) {
    if (!optionsEnded && word === '--') {
      optionsEnded = true;
      continue;
    }

    if (!optionsEnded && (isOption(word) || (SLASH_FLAG_REMOVERS.has(name) && isSlashFlag(word)))) continue;

    operands.push(word);
  }

  return operands;
}

/**
 * The items of a PowerShell path list, plus the whole value when it holds a comma: the lexer drops the quotes, so
 * `a,b` (two paths) and `'a,b'` (one path that has a comma in its name) look alike, and the guard judges both
 * readings. A reading that names nothing that exists deletes nothing.
 * @es Los elementos de una lista de rutas de PowerShell, más el valor entero si lleva coma: el lexer pierde las
 * comillas, así que `a,b` (dos rutas) y `'a,b'` (una ruta con coma) se ven igual y se juzgan las dos lecturas.
 */
const listItems = (value) => {
  if (value === undefined) return [];

  const items = value.split(',').filter((item) => item.length > 0);

  return value.includes(',') ? [value, ...items] : items;
};

/** The operands of Remove-Item, and whether `-WhatIf` turns the deletion off. @es Los operandos de Remove-Item y si `-WhatIf` apaga el borrado. */
function powershellOperands(args) {
  const operands = [];
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (!word.startsWith('-')) {
      operands.push(...listItems(word));
      continue;
    }

    const colon = word.indexOf(':');
    const name = (colon === -1 ? word : word.slice(0, colon)).toLowerCase();

    if (POWERSHELL_DRY_PARAMETERS.has(name)) dryRun = true;

    if (!POWERSHELL_VALUE_PARAMETERS.has(name)) continue;

    const value = colon === -1 ? args[index + 1] : word.slice(colon + 1);

    if (colon === -1) index += 1;
    if (POWERSHELL_PATH_PARAMETERS.has(name)) operands.push(...listItems(value));
  }

  return { operands, dryRun };
}

/** Whether `script` runs a remover as one of its commands. @es Si `script` ejecuta un borrador como uno de sus comandos. */
function runsRemover(script, dialect) {
  return simpleCommands(script, dialect).some((command) => {
    const at = commandWordIndex(command.words);

    return at !== -1 && REMOVERS.has(executableName(command.words[at]));
  });
}

/** The entries for one remover command, `rm`-style or PowerShell-style. @es Las entradas de un comando borrador. */
function removerTargets(name, args, directory, dialect, platform) {
  const powershell = dialect === DIALECTS.POWERSHELL || POWERSHELL_ONLY.has(name);
  const grammar = powershell ? DIALECTS.POWERSHELL : DIALECTS.BASH;

  if (!powershell) return bashOperands(name, args).flatMap((raw) => resolveOperand(raw, directory, name, grammar, platform));

  const { operands, dryRun } = powershellOperands(args);

  if (dryRun) return [];
  if (operands.length === 0) return [{ path: undefined, unresolvable: 'pipeline', via: name }];

  return operands.flatMap((raw) => resolveOperand(raw, directory, name, grammar, platform));
}

/** The start paths of a `find`: the words before its first expression. @es Las rutas de inicio de un `find`. */
function findStarts(args) {
  let index = 0;

  while (FIND_LEADING_OPTIONS.has(args[index])) index += 1;

  const starts = [];

  while (index < args.length && !args[index].startsWith('-')) {
    starts.push(args[index]);
    index += 1;
  }

  return starts.length === 0 ? ['.'] : starts;
}

/** Which deleting action a `find` carries, or `undefined`. @es Qué acción de borrado lleva un `find`, o `undefined`. */
function findDeletion(args, dialect) {
  if (args.includes('-delete')) return 'find -delete';

  /**
   * An `-exec` family action runs a remover when the words after it, read as a command line, do: the shared
   * parser unwraps `sh -c`, `env`, `sudo` and the like, exactly as it does for `xargs`, and a `;` terminator ends
   * the command it belongs to.
   * @es Una acción de la familia `-exec` ejecuta un borrador cuando lo hacen las palabras que le siguen, leídas
   * como línea de comandos: el parser compartido desenvuelve `sh -c`, `env`, `sudo` y similares, igual que en `xargs`.
   */
  const exec = args.findIndex((word, index) => FIND_EXEC_ACTIONS.has(word) && runsRemover(args.slice(index + 1).join(' '), dialect));

  return exec === -1 ? undefined : `find ${args[exec]} ${executableName(args[exec + 1])}`;
}

/** The entries of one `find` command: every start path, as a subtree. @es Las entradas de un `find`: cada ruta de inicio, como subárbol. */
function findTargets(args, directory, dialect, platform) {
  const via = findDeletion(args, dialect);

  if (via === undefined) return [];

  return findStarts(args).flatMap((raw) => resolveOperand(raw, directory, via, dialect, platform));
}

/**
 * The entry of a `cmd /c ...` command that runs a remover while its text holds a backslash. The shared parser reads
 * the script of a nested `cmd /c` with bash escapes, so every backslash of a Windows path in it is eaten before
 * this module sees the path (`del C:\a\b\*.mjs` arrives as `C:ab*.mjs`) and the deletion cannot be located. That
 * grammar belongs to the vendored parser's owner; until it is fixed at the source such a deletion is refused as
 * unresolvable instead of judged on a wrong path.
 * @es La entrada de un `cmd /c ...` que ejecuta un borrador y cuyo texto lleva una barra invertida. El parser
 * compartido lee el script de un `cmd /c` anidado con escapes de bash y se come las barras de una ruta de Windows
 * antes de que este módulo la vea; esa gramática es del dueño del parser vendorizado, y mientras no se arregle en
 * origen el borrado se rechaza como no resoluble en vez de juzgarse sobre una ruta falsa.
 */
function cmdTargets(args, text, dialect, directory, options) {
  const flagAt = args.findIndex((word) => CMD_SCRIPT_FLAGS.includes(word.toLowerCase()));
  const script = args.slice(flagAt + 1).join(' ');

  if (flagAt === -1 || !runsRemover(script, dialect)) return [];
  if (text.includes('\\')) return [{ path: undefined, unresolvable: 'backslash', via: 'cmd /c' }];

  // The shared parser unwraps `/c` and `/k` itself, but not Git Bash's `//c`: that script is read here.
  // @es El parser compartido desenvuelve `/c` y `/k`, pero no el `//c` de Git Bash: ese script se lee aquí.
  if (!args[flagAt].startsWith('//')) return [];
  if (directory === undefined) return [{ path: undefined, unresolvable: 'directory', via: 'cmd //c' }];

  return deletionTargets(script, DIALECTS.BASH, directory, options);
}

/** The entries of one move command: each of its sources. @es Las entradas de un comando de movimiento: cada uno de sus orígenes. */
function moveTargets(name, args, directory, dialect, platform) {
  const { grammar, sources } = copyOperands(name, args, dialect);

  return sources.flatMap((raw) => resolveOperand(raw, directory, name, grammar, platform));
}

/**
 * Whether `xargs` launches the program at `at`: the shared parser unwraps launchers (`launchers.mjs`), so `xargs`
 * and its options sit BEFORE the program word, never at it. A word named `xargs` before the program that is an
 * option value (`sudo -u xargs rm`) also counts: that only ever costs a refusal of a deletion, never a missed one.
 * @es Si `xargs` lanza el programa de `at`: el parser compartido desenvuelve los lanzadores, así que `xargs` y sus
 * opciones quedan ANTES de la palabra del programa. Una palabra `xargs` que sea valor de opción también cuenta: solo
 * cuesta un rechazo, nunca un borrado que se escape.
 */
const launchedByXargs = (words, at) => words.slice(0, at).some((word) => executableName(word) === 'xargs');

/** The entry of a program `xargs` launches that removes: its operands are on standard input. @es La entrada de un programa que lanza `xargs` y borra: sus operandos llegan por stdin. */
function xargsTargets(launched, dialect) {
  return runsRemover(launched.join(' '), dialect) ? [{ path: undefined, unresolvable: 'stdin', via: `xargs ${executableName(launched[0])}` }] : [];
}

/** Whether `git clean` is a dry run: `-n`, `--dry-run`, or a short cluster of the clean letters holding `n`. @es Si `git clean` es una prueba en seco. */
function isDryRun(args) {
  return args.some((word) => word === '--dry-run' || (word.startsWith('-') && !word.startsWith('--') && [...word.slice(1)].every((letter) => 'fdxXinqe'.includes(letter)) && word.includes('n')));
}

/**
 * A short-option cluster without its `i` letters (interactive mode cannot run with `-n`). The letters from an
 * `e` on are the exclude pattern's own text and stay as written.
 * @es Un grupo de opciones cortas sin sus letras `i` (el modo interactivo no admite `-n`). Las letras desde una
 * `e` son el texto del patrón de exclusión y se conservan.
 */
function withoutInteractive(cluster) {
  const letters = [...cluster.slice(1)];
  const exclude = letters.indexOf('e');
  const flags = exclude === -1 ? letters : letters.slice(0, exclude);
  const kept = [...flags.filter((letter) => letter !== 'i'), ...(exclude === -1 ? [] : letters.slice(exclude))].join('');

  return kept.length > 0 ? `-${kept}` : undefined;
}

/** The arguments of `git clean` rewritten to list what it would remove: interactive mode dropped, `-n` first. @es Los argumentos de `git clean` reescritos para listar lo que borraría. */
function dryRunArguments(args) {
  const rewritten = [];
  let pathsStarted = false;

  for (const word of args) {
    if (pathsStarted || word === '--') {
      pathsStarted = true;
      rewritten.push(word);
      continue;
    }

    if (word === '--interactive') continue;

    if (word.startsWith('-') && !word.startsWith('--')) {
      const cluster = withoutInteractive(word);

      if (cluster !== undefined) rewritten.push(cluster);
      continue;
    }

    rewritten.push(word);
  }

  return ['clean', '-n', ...rewritten];
}

const PREVIEW_PREFIX = 'Would remove ';

/**
 * The files a `git clean -n` listing names. `ok` is false when git quoted a name (a quote, a backslash or a
 * control character in it): the quoted spelling is not a path, so the listing cannot be trusted.
 * @es Los ficheros que nombra un listado de `git clean -n`. `ok` es falso si git entrecomilló un nombre.
 */
export function previewFrom(stdout) {
  const paths = stdout.split('\n').map((line) => line.replace('\r', '')).filter((line) => line.startsWith(PREVIEW_PREFIX)).map((line) => line.slice(PREVIEW_PREFIX.length));

  return paths.some((listed) => listed.startsWith('"')) ? { ok: false, paths: [] } : { ok: true, paths };
}

/**
 * What `git clean` would remove, as git itself lists it in a dry run.
 * @es Lo que `git clean` borraría, tal como lo lista git en una prueba en seco.
 */
export function gitCleanPreview(directory, args) {
  const result = spawnSync('git', ['-C', directory, '-c', 'core.quotePath=off', ...args], { encoding: 'utf8', windowsHide: true, timeout: 20000 });

  return result.error !== undefined || result.status !== 0 ? { ok: false, paths: [] } : previewFrom(result.stdout);
}

/** The entries of every `git clean` in the line. @es Las entradas de cada `git clean` de la línea. */
function gitCleanTargets(script, dialect, cwd, platform, cleanPreview) {
  const entries = [];

  for (const invocation of gitInvocations(script, dialect, cwd, platform)) {
    if (invocation.subcommand !== 'clean' || isDryRun(invocation.args)) continue;

    if (invocation.directory === undefined) {
      entries.push({ path: undefined, unresolvable: 'directory', via: 'git clean' });
      continue;
    }

    const preview = cleanPreview(invocation.directory, dryRunArguments(invocation.args));

    if (!preview.ok) {
      entries.push({ path: undefined, unresolvable: 'preview', via: 'git clean' });
      continue;
    }

    for (const listed of preview.paths) entries.push({ path: path.resolve(invocation.directory, listed), via: 'git clean' });
  }

  return entries;
}

/**
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @param {{ platform?: string, cleanPreview?: Function }} [options] Injectable seams.
 * @returns {Array<{ path: string, via: string } | { path: undefined, unresolvable: string, via: string }>}
 *   Every path the line deletes, or an unresolvable entry with the reason code.
 * @es Cada ruta que borra la línea, o una entrada `unresolvable` con el código del motivo.
 */
export function deletionTargets(script, dialect, cwd, { platform = process.platform, cleanPreview = gitCleanPreview } = {}) {
  const found = [];

  for (const { command, directory } of withWorkingDirectories(simpleCommands(script, dialect), cwd, dialect, platform)) {
    const at = commandWordIndex(command.words);

    if (at === -1) continue;

    // What xargs launches gets its operands on stdin, whatever its own words say. @es Lo que lanza xargs recibe sus operandos por stdin.
    if (launchedByXargs(command.words, at)) {
      found.push(...xargsTargets(command.words.slice(at), dialect));
      continue;
    }

    const name = executableName(command.words[at]);
    const args = command.words.slice(at + 1);

    if (REMOVERS.has(name)) found.push(...removerTargets(name, args, directory, dialect, platform));
    if (name === 'find') found.push(...findTargets(args, directory, dialect, platform));
    if (name === 'cmd') found.push(...cmdTargets(args, command.text, dialect, directory, { platform, cleanPreview }));
    if (MOVERS.has(name)) found.push(...moveTargets(name, args, directory, dialect, platform));
  }

  found.push(...gitCleanTargets(script, dialect, cwd, platform, cleanPreview));

  return found;
}
