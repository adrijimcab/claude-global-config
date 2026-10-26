/**
 * A script handed to a NESTED PowerShell or cmd whose backslashes the outer bash consumes, or may consume.
 *
 * THE INCIDENT (`shell-payload-quoting-corrupted-data`, 2026-10-16). Creating `node_modules` junctions for four
 * worktrees, the orchestrator built a Windows path for PowerShell inside a bash double-quoted string,
 * `"...\worktrees\$n..."`. Bash consumed the backslash before `$` (it escapes the dollar), so PowerShell received
 * `...worktrees$n...`: a different path. A stray folder with two junctions appeared and three calls failed, all
 * with no error from the line that built the path. The path was written for one shell and parsed by two.
 *
 * WHAT IS REFUSED, read from the quoting each backslash was WRITTEN in (`tokenize` in `detect.mjs`), in the words
 * after the script switch of `powershell`/`pwsh` (`-Command`, `-c`) or `cmd` (`//c`, `//k`):
 *   - an unquoted backslash: bash always consumes it;
 *   - any backslash inside bash double quotes: bash consumes it before `$`, `` ` ``, `"`, `\` or a newline, and
 *     keeps it elsewhere, so the path is one edit away from the incident and its meaning depends on its neighbour;
 *   - any backslash inside `$'…'`: bash reads it as an escape;
 *   - a backslash next to a `$`, in any quoting: inside single quotes bash keeps it, and the nested shell then
 *     expands the variable itself, which is the same path parsed by the wrong shell.
 * What passes: a single-quoted script with no `$` next to a backslash, forward-slash paths, a script file
 * (`powershell -File x.ps1 <args>`), and every command through the PowerShell tool, which has no outer bash.
 *
 * WHY THE SWITCHES ARE LISTED HERE: they are the ones `shell-command/shell-command.mjs` (NESTED_SHELLS) reads as a
 * nested script. That table is not exported and the module is vendored, so it is not changed from this tree. Of
 * cmd's, only the Git Bash spellings `//c` and `//k`: a lone `/c` or `/k` in a Bash line is refused before this rule
 * by the MSYS-switch rule of `detect.mjs`, so listing it here would be code no command can reach.
 *
 * @es Un script entregado a un PowerShell o cmd ANIDADO cuyos backslashes el bash exterior consume, o puede
 * consumir. EL INCIDENTE (2026-10-16): una ruta de Windows para PowerShell escrita en comillas dobles de bash,
 * `"...\worktrees\$n..."`; bash consumió el backslash delante de `$` y PowerShell recibió otra ruta, sin que la
 * línea que la construyó diera error. SE RECHAZA, leído del entrecomillado en que se ESCRIBIÓ cada backslash, en
 * las palabras tras el switch de script de `powershell`/`pwsh` o `cmd`: un backslash sin comillas, cualquiera
 * dentro de comillas dobles de bash o de `$'…'`, y uno junto a un `$` en cualquier entrecomillado. PASA: un script
 * en comillas simples sin `$` junto a un backslash, rutas con barras normales, un fichero de script y todo lo que
 * pasa por la herramienta PowerShell. Los switches son los que lee como script anidado `shell-command.mjs`; de cmd, solo `//c` y `//k`, porque un `/c` suelto ya lo rechaza antes la regla del switch de MSYS.
 */

import { programName } from './launchers.mjs';

/** The nested shells and the switches after which their script follows. @es Las shells anidadas y sus switches de script. */
const SCRIPT_SWITCHES = { powershell: ['-command', '-c'], pwsh: ['-command', '-c'], cmd: ['//c', '//k'] };

/** The quoting in which bash consumes or reinterprets every backslash. @es El entrecomillado en que bash consume o reinterpreta todo backslash. */
const CONSUMING_QUOTES = new Set(['bare', 'double', 'ansi']);

/** What a refused backslash is, in words. @es Qué es un backslash rechazado, en palabras. */
const KINDS = {
  bare: 'unquoted backslash: bash consumes it before the nested shell sees it',
  double: 'backslash inside bash double quotes: bash consumes it before $ ` " \\ or a newline, so the path depends on its neighbour',
  ansi: "backslash inside $'…': bash reads it as an escape",
  dollar: 'backslash next to $: a variable in the path is expanded by a shell it was not written for'
};

/** Why one backslash is refused, or `undefined`. @es Por qué se rechaza un backslash, o `undefined`. */
function kindOf({ quote, previous, next }) {
  if (CONSUMING_QUOTES.has(quote)) return KINDS[quote];

  return previous === '$' || next === '$' ? KINDS.dollar : undefined;
}

/**
 * The refusal for the command whose words start at its program (`programWords`), or `undefined`.
 * @es La negativa para la orden cuyas palabras empiezan en su programa, o `undefined`.
 */
export function nestedShellRefusal(words) {
  const program = words[0];
  const switches = SCRIPT_SWITCHES[programName(program?.raw ?? '')];

  if (switches === undefined) return undefined;

  const switchAt = words.findIndex((word) => switches.includes(word.raw.toLowerCase()));

  if (switchAt === -1) return undefined;

  for (const word of words.slice(switchAt + 1)) {
    const findings = (word.backslashes ?? []).flatMap((backslash) => {
      const kind = kindOf(backslash);

      return kind === undefined ? [] : [{ offset: backslash.offset, code: 0x5c, kind }];
    });

    if (findings.length > 0) return { kind: 'nested-shell-path', flag: `${program.raw} ${words[switchAt].raw}`, payload: word.raw, findings };
  }

  return undefined;
}
