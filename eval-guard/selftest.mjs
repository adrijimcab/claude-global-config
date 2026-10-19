#!/usr/bin/env node
/**
 * End-to-end proof for the eval guard, exercised the way the harness exercises it: a real child
 * process, a real JSON payload on stdin, a real exit code and stdout envelope read back.
 *
 * It proves FOUR things, because three of them are the ways this class of guard is usually wrong:
 *   REFUSED  — every shape this harness was measured to mangle is actually blocked;
 *   ALLOWED  — every shape it was measured to deliver INTACT passes untouched, so the guard is not the
 *              kind of rule people route around. These cases are not politeness: each one is a
 *              measurement, and the guard refusing them would be the guard being wrong;
 *   FAIL-OPEN— every corruption of the hook's own input exits 0 without a decision;
 *   BOM      — a BOM-prefixed payload still DECIDES, rather than failing open and looking clean.
 * The last one matters most: a guard that fails open on a BOM reads exactly like a guard that found
 * nothing, which is the same indistinguishability the whole mechanism exists to remove.
 *
 * @es Prueba de extremo a extremo tal y como la ejerce el harness. Demuestra CUATRO cosas: que se
 * bloquea toda forma que este harness DESTROZA de verdad; que pasa intacta toda forma que ENTREGA
 * intacta (no es cortesía: cada caso es una medición, y rechazarlo sería el guard equivocándose); que
 * cualquier corrupción de su propia entrada sale con 0 sin decidir; y que un payload con BOM SIGUE
 * decidiendo — lo último es lo que más importa, porque un guard que falla abierto ante un BOM se lee
 * igual que uno que no encontró nada, la misma indistinguibilidad que se quiere eliminar.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestInput } from '../hook-state/journal.mjs';
import { extractPowerShellHereStrings } from './detect.mjs';
import { isolateState, stateDir } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('eval-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');

/** Runs the guard exactly as the harness does. @es Ejecuta el guard exactamente como lo hace el harness. */
function run(input) {
  const result = spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8' });
  let decision;
  let reason = '';

  try {
    const output = JSON.parse(result.stdout).hookSpecificOutput;

    decision = output.permissionDecision;
    reason = output.permissionDecisionReason ?? '';
  } catch {
    decision = undefined;
  }

  return { status: result.status, decision, reason };
}

const payload = (command, tool = 'Bash') =>
  JSON.stringify({ session_id: 'selftest', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command } });

/** The payload of a DELEGATED agent (agent_id plus a subagents transcript). @es El payload de un agente DELEGADO. */
const delegated = (command, tool = 'Bash') =>
  JSON.stringify({ session_id: 'selftest', agent_id: 'agent-selftest', transcript_path: '/home/u/.claude/projects/p/s/subagents/agent-selftest.jsonl', hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command } });

const lines = (...parts) => parts.join('\n');

// A file-writing script fed to an interpreter through a shell, one case per write marker, each written as the
// CALL its language makes. The lists are written out here on purpose: they are the specification, not a copy of
// the module's own lists.
// @es Un script que escribe un fichero entregado a un intérprete por un shell, un caso por marcador, cada uno
// escrito como la LLAMADA de su lenguaje. Las listas están escritas aquí a propósito: son la especificación.
const CALL_MARKERS = ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream', 'writeSync', 'fs.write', 'copyFileSync', 'renameSync', 'cpSync', 'write_text', 'write_bytes', 'shutil.copy', 'shutil.copy2', 'shutil.copyfile', 'shutil.copytree', 'os.replace', 'WriteAllText'];
const CMDLETS = ['Set-Content', 'Add-Content', 'Out-File', 'set-content'];
const markerCases = [
  ...CALL_MARKERS.map((marker) => ['deny', delegated(lines("node - <<'EOF'", `${marker}('out.txt', data);`, 'EOF')), `a delegated heredoc script calling ${marker}( is refused`, 'writes a file']),
  ...CALL_MARKERS.map((marker) => ['deny', delegated(lines("python3 - <<'EOF'", `target.${marker} ('out.txt', data)`, 'EOF')), `a delegated heredoc script calling .${marker} ( is refused`, 'writes a file']),
  ...CMDLETS.map((cmdlet) => ['deny', delegated(lines("pwsh - <<'EOF'", `'x' | ${cmdlet} out.txt`, 'EOF')), `a delegated pwsh script running ${cmdlet} is refused`, 'writes a file'])
];

const SHELL_LIKE = ['sh', 'bash', 'zsh', 'dash', 'pwsh', 'powershell'];
const NOT_SHELL_LIKE = ['node', 'nodejs', 'tsx', 'python', 'python3', 'python3.12', 'py', 'perl', 'ruby', 'deno', 'bun'];

// Every interpreter is refused when its stdin script writes; only the shell-like ones read `>` as a redirection.
// @es Todo intérprete se rechaza si su script de stdin escribe; solo los tipo shell leen `>` como redirección.
const interpreterCases = [
  ...[...SHELL_LIKE, ...NOT_SHELL_LIKE].map((name) => ['deny', delegated(lines(`${name} - <<'EOF'`, 'Set-Content out.txt', 'EOF')), `${name} reading a writing script from a heredoc is refused`, 'writes a file']),
  ...[...SHELL_LIKE, ...NOT_SHELL_LIKE].map((name) => ['deny', delegated(lines(`/usr/bin/${name}.exe <<'EOF'`, 'Set-Content out.txt', 'EOF')), `${name} named by a path with .exe is matched by base name`, 'writes a file']),
  ...SHELL_LIKE.map((name) => ['deny', delegated(lines(`${name} - <<'EOF'`, 'echo x > out.txt', 'EOF')), `${name}: > in its heredoc script is a redirection`, 'redirects output']),
  ...NOT_SHELL_LIKE.map((name) => ['allow', delegated(lines(`${name} - <<'EOF'`, 'print(1 > 0)', 'EOF')), `${name}: > in its heredoc script is a comparison, not a redirection`])
];

const WRITE = "fs.writeFileSync('a.txt', 'x');";
const at = (command, opener) => `at offset ${command.indexOf(opener)}`;

// E1: an interpreter reads its script from stdin whenever no script path argument is given, whatever else is there.
// @es E1: un intérprete lee su script de stdin siempre que no recibe una ruta de script, haya lo que haya.
const stdinShapeCases = [
  ['deny', delegated(lines("python3 - 2>&1 <<'EOF'", "open('out.txt', 'w').write('x')", 'EOF')), 'a redirection between the interpreter and << stays with the interpreter (2>&1)', 'writes a file'],
  ['deny', delegated(lines("node - >/dev/null <<'EOF'", WRITE, 'EOF')), 'a >/dev/null between the interpreter and <<', 'writes a file'],
  ['deny', delegated(lines("node - > log.txt <<'EOF'", WRITE, 'EOF')), 'a > log between the interpreter and <<: the log is no script path', 'writes a file'],
  ['deny', delegated(lines("node - 0<<'EOF'", WRITE, 'EOF')), 'an fd-numbered heredoc (0<<)', 'writes a file'],
  ['deny', delegated(lines("node - 0<<<\"fs.writeFileSync('a', 'b')\"")), 'an fd-numbered here-string (0<<<)', 'writes a file'],
  ['deny', delegated(lines("python3 - arg1 arg2 <<'EOF'", "open('out.txt', 'w')", 'EOF')), 'script arguments after - leave the script on stdin', 'writes a file'],
  ['deny', delegated(lines("node -r ./hook.js - <<'EOF'", WRITE, 'EOF')), 'an option value (-r ./x) is no script path', 'writes a file'],
  ['deny', delegated(lines("node --require ./hook.js <<'EOF'", WRITE, 'EOF')), 'a long option value is no script path', 'writes a file'],
  ['deny', delegated(lines("python3 -W ignore <<'EOF'", "open('o', 'w')", 'EOF')), 'python -W value is no script path', 'writes a file'],
  ['deny', delegated(lines("bash -o pipefail <<'EOF'", 'echo x > out.txt', 'EOF')), 'bash -o value is no script path', 'writes a file'],
  ['deny', delegated(lines("bash -s a b <<'EOF'", 'echo x > out.txt', 'EOF')), 'bash -s reads stdin whatever its arguments', 'writes a file'],
  ['deny', delegated(lines("bash -s -- a b <<'EOF'", 'echo x > out.txt', 'EOF')), 'bash -s -- args reads stdin', 'writes a file'],
  ['deny', delegated(lines("node -- <<'EOF'", WRITE, 'EOF')), 'a -- with no script path after it is stdin', 'writes a file'],
  ['deny', delegated(lines("node -- - x <<'EOF'", WRITE, 'EOF')), 'a -- followed by - is stdin', 'writes a file'],
  ['deny', delegated(lines("node /dev/stdin <<'EOF'", WRITE, 'EOF')), '/dev/stdin as the script is stdin', 'writes a file'],
  ['deny', delegated(lines("pwsh -NoProfile -Command - <<'EOF'", "'x' | Set-Content o.txt", 'EOF')), 'pwsh -Command - reads stdin', 'writes a file'],
  ['deny', delegated(lines("deno run - <<'EOF'", WRITE, 'EOF')), 'deno run - reads stdin', 'writes a file'],
  ['deny', delegated(lines("bun run - <<'EOF'", WRITE, 'EOF')), 'bun run - reads stdin', 'writes a file'],
  ['deny', delegated(lines("perl -Mstrict - <<'EOF'", "open(my $f, '>', 'o'); copyFileSync('a', 'b');", 'EOF')), 'perl -Mmodule keeps the script on stdin', 'writes a file'],
  ['deny', delegated(lines("cat <<'EOF' | node -", WRITE, 'EOF')), 'a heredoc piped into an interpreter flows through the pipe', 'writes a file'],
  ['deny', delegated(lines("cat <<'EOF' | tr a a | node -", WRITE, 'EOF')), 'a heredoc flows through every stage of a pipe', 'writes a file'],
  ['deny', delegated(lines("cat <<'EOF' |& node -", WRITE, 'EOF')), 'a heredoc piped with |& flows', 'writes a file'],
  ['deny', delegated(lines("{ node -; } <<'EOF'", WRITE, 'EOF')), 'a heredoc after a brace group is its commands\' stdin', 'writes a file'],
  ['deny', delegated(lines("( python3 - ) <<'EOF'", "open('o', 'w')", 'EOF')), 'a heredoc after a subshell is its commands\' stdin', 'writes a file'],
  ['deny', delegated("{ node -; } <<< \"fs.writeFileSync('a', 'b')\""), 'a here-string after a brace group', 'writes a file'],
  ...['env', 'env FOO=1 -u BAR', 'command', 'exec', 'time', 'time -p', 'timeout 5', 'timeout -s KILL 5', 'nice', 'nice -n 5', 'npx', 'npx --yes', 'env FOO=1 timeout 5'].map((wrapper) => ['deny', delegated(lines(`${wrapper} node - <<'EOF'`, WRITE, 'EOF')), `the launcher "${wrapper}" is unwrapped to node`, 'writes a file']),
  ['deny', delegated(lines("npx tsx - <<'EOF'", WRITE, 'EOF')), 'npx tsx - is tsx reading stdin', 'writes a file'],
  ['deny', delegated(lines("python3 - 2>&1 <<'EOF'", "open('o', 'w')", 'EOF')), 'the finding points at the real << opener', `${at(lines("python3 - 2>&1 <<'EOF'"), '<<')} (U+003C)`],
  ['deny', delegated("python3 - <<< \"open('o', 'w')\""), 'the finding points at the real <<< opener', `${at("python3 - <<< \"open('o', 'w')\"", '<<<')} (U+003C)`],
  ['deny', delegated(lines("$x = 1; @'", WRITE, "'@ | node -"), 'PowerShell'), 'the finding points at the @ of a PowerShell here-string', `${at("$x = 1; @'", '@')} (U+0040)`]
];

// E1 and E5: the shapes that take the script from elsewhere, or attribute no stdin, still pass.
// @es E1 y E5: las formas que toman el script de otro sitio, o no atribuyen stdin, siguen pasando.
const stdinElsewhereCases = [
  ['allow', delegated(lines("node <<'EOF' tool.mjs", WRITE, 'EOF')), 'the words after the delimiter stay the command\'s: tool.mjs is its script'],
  ['allow', delegated(lines("python3 tool.py 2>&1 <<'EOF'", "open('o', 'w')", 'EOF')), 'a script path before the redirection'],
  ['allow', delegated(lines("node -e \"console.log(1)\" <<'EOF'", WRITE, 'EOF')), 'node -e: the heredoc is data'],
  ['allow', delegated(lines("python3 -c 'print(1)' <<'EOF'", "open('o', 'w')", 'EOF')), 'python -c: the heredoc is data'],
  ['allow', delegated(lines("python3 -m tool <<'EOF'", "open('o', 'w')", 'EOF')), 'python -m: the heredoc is data'],
  ['allow', delegated(lines("bash -c 'cat' <<'EOF'", 'echo x > out.txt', 'EOF')), 'bash -c: the heredoc is data'],
  ['allow', delegated(lines("node -- tool.mjs <<'EOF'", WRITE, 'EOF')), 'a script path after --'],
  ['allow', delegated(lines("deno run tool.ts <<'EOF'", WRITE, 'EOF')), 'deno run with a script path'],
  ['allow', delegated(lines("deno eval 'console.log(1)' <<'EOF'", WRITE, 'EOF')), 'deno eval: the heredoc is data'],
  ['allow', delegated(lines("pwsh -File tool.ps1 <<'EOF'", "'x' | Set-Content o.txt", 'EOF')), 'pwsh -File path: the heredoc is data'],
  ['allow', delegated(lines("command -v node <<'EOF'", WRITE, 'EOF')), 'command -v runs nothing'],
  ['allow', delegated(lines("cat <<'EOF' | node tool.mjs", WRITE, 'EOF')), 'a piped heredoc into a script FILE run is data'],
  ['allow', delegated(lines("cat <<'EOF' || node -", WRITE, 'EOF')), '|| is no pipe: nothing flows into node'],
  ['allow', delegated(lines("@'", WRITE, "'@ | Out-Host; pwsh -NoProfile -Command Get-Date"), 'PowerShell'), 'a here-string is attributed only to the command it is piped into'],
  ['allow', delegated(lines("$s = @'", WRITE, "'@", 'node tool.mjs'), 'PowerShell'), 'an assigned here-string feeds no later interpreter']
];

// E3: false refusals. Markers count only as call sites; `>` only as a shell redirection into a file.
// @es E3: rechazos falsos. Los marcadores cuentan solo como llamadas; `>` solo como redirección de shell a un fichero.
const falseRefusalCases = [
  ['allow', delegated(lines("node - <<'EOF'", "console.log('remember writeFileSync and Set-Content');", 'EOF')), 'a marker inside a message is no call'],
  ['allow', delegated(lines("node - <<'EOF'", 'myWriteFile(x); rewriteFileSync(y);', 'EOF')), 'a longer name is no call of the marker'],
  ['allow', delegated(lines("pwsh - <<'EOF'", 'Get-Content in.txt; Write-Host "use Set-Content later"', 'EOF')), 'a cmdlet name inside a string is no command'],
  ['allow', delegated(lines("bash <<'EOF'", "awk '$1 > 5' data.txt", "jq '.a > 1' x.json", 'EOF')), 'a > inside awk and jq programs'],
  ['allow', delegated(lines("bash <<'EOF'", 'if [[ "$a" > "$b" ]]; then echo yes; fi', '(( n > 3 )) && echo big', 'EOF')), 'a > inside [[ ]] and (( ))'],
  ['allow', delegated(lines("bash <<'EOF'", '# write > out.txt later', 'echo "a > b"', "echo 'x -> y'", 'echo a->b', 'EOF')), 'a > in a comment, in quotes and in an arrow'],
  ['allow', delegated(lines("bash <<'EOF'", 'echo x > /dev/stderr', 'echo y >/dev/stdout', 'echo z >&2', 'echo w &>/dev/null', 'EOF')), 'stderr, stdout and descriptor copies are no files'],
  ['allow', delegated(lines("pwsh - <<'EOF'", 'Get-Date > $null', 'Get-Date > NUL', 'EOF')), 'PowerShell $null and NUL are no files'],
  ['allow', delegated(lines("bash <<'EOF'", "awk '$1 > 5' <<'X'", '3 > 2', 'X', 'EOF')), 'a read-only awk heredoc nested in a shell script'],
  ['allow', delegated(lines("awk '$1 > 5' <<'EOF'", '7', 'EOF')), 'a read-only awk heredoc'],
  ['allow', delegated(lines("bash <<'EOF'", 'tee < in.txt', 'sed -n p a.txt', 'EOF')), 'tee with no file and sed without -i'],
  ['deny', delegated(lines("bash <<'EOF'", 'echo x | tee out.txt', 'EOF')), 'tee with a file writes', 'calls tee'],
  ['deny', delegated(lines("bash <<'EOF'", 'cp a.txt b.txt', 'EOF')), 'cp writes', 'calls cp'],
  ['deny', delegated(lines("bash <<'EOF'", "sed -i 's/a/b/' f.txt", 'EOF')), 'sed -i writes', 'calls sed -i'],
  ['deny', delegated(lines("bash <<'EOF'", "sed --in-place 's/a/b/' f.txt", 'EOF')), 'sed --in-place writes', 'calls sed -i'],
  ['deny', delegated(lines("bash <<'EOF'", 'echo x &> out.txt', 'EOF')), '&> into a file writes', 'redirects output'],
  ['deny', delegated(lines("bash <<'EOF'", '{ echo x; } > out.txt', 'EOF')), 'a redirection after a brace group writes', 'redirects output'],
  ['deny', delegated(lines("bash <<'EOF'", "node - <<'X'", WRITE, 'X', 'EOF')), 'a nested heredoc fed to node inside a shell script', 'writes a file']
];

// E2: python open with nested parens, a method open, and the new markers.
// @es E2: open de python con paréntesis anidados, un open de método y los marcadores nuevos.
const openCases = [
  ['deny', delegated(lines("python3 - <<'EOF'", "open(os.path.join(root, 'b'), 'w').write(x)", 'EOF')), 'open with a nested-paren first argument', 'writes a file'],
  ['deny', delegated(lines("python3 - <<'EOF'", "open(f'{root}/x,y', 'a')", 'EOF')), 'open whose first argument holds a comma in quotes', 'writes a file'],
  ['deny', delegated(lines("python3 - <<'EOF'", "Path(p).open('w').write(x)", 'EOF')), 'Path(p).open(\'w\')', 'writes a file'],
  ['deny', delegated(lines("python3 - <<'EOF'", "Path(p).open(mode='x')", 'EOF')), 'a method open with mode=', 'writes a file'],
  ['deny', delegated(lines("python3 - <<'EOF'", "io.open(p, 'w')", 'EOF')), 'io.open takes the mode second', 'writes a file'],
  ['deny', delegated(lines("python3 - <<'EOF'", "open(p, encoding='utf8', mode='w')", 'EOF')), 'mode= after another keyword', 'writes a file'],
  ['allow', delegated(lines("python3 - <<'EOF'", "Path(p).open().read(); Path(p).open('r'); io.open('w.txt', 'r')", 'EOF')), 'read-only method opens'],
  ['allow', delegated(lines("python3 - <<'EOF'", "open(os.path.join(root, 'w'), 'r')", 'EOF')), 'a w inside the nested path is no mode']
];

// Boundaries: each case pins one decision of the readers above (launchers, families, options, redirections).
// @es Límites: cada caso fija una decisión de los lectores de arriba (lanzadores, familias, opciones, redirecciones).
const boundaryCases = [
  ['deny', delegated(lines("cat <<< 'x'; node - <<'EOF'", WRITE, 'EOF')), 'a here-string opener marks one word only'],
  ['deny', delegated(lines("node 2>/dev/null <<'EOF'", WRITE, 'EOF')), 'a descriptor before > is no script path'],
  ['deny', delegated(lines("node 0<<'EOF'", WRITE, 'EOF')), 'a descriptor before << is no script path'],
  ['deny', delegated("node 0<<<\"fs.writeFileSync('a', 'b')\""), 'a descriptor before <<< is no script path'],
  ['deny', delegated("node <<< \"fs.writeFileSync('a', 'b')\""), 'a here-string word is no script path'],
  ['deny', delegated(lines("node > log.txt <<'EOF'", WRITE, 'EOF')), 'a redirection target is no script path'],
  ['deny', delegated(lines("{ cat; } <<'EOF' | node -", WRITE, 'EOF')), 'a compound piped into an interpreter passes its heredoc on'],
  ['deny', delegated(lines("nice -- node - <<'EOF'", WRITE, 'EOF')), 'a launcher -- ends its options'],
  ['deny', delegated(lines("timeout --signal=KILL 5 node - <<'EOF'", WRITE, 'EOF')), 'a launcher option with = carries its value'],
  ['deny', delegated(lines("/usr/bin/Python3 - <<'EOF'", "open('o', 'w')", 'EOF')), 'a program name is matched in any case'],
  ['deny', delegated(lines("bash +o posix <<'EOF'", 'echo x > out.txt', 'EOF')), 'a shell +o value is no script path'],
  ['deny', delegated(lines("pwsh -ExecutionPolicy Bypass -Command - <<'EOF'", "'x' | Set-Content o.txt", 'EOF')), 'a PowerShell option value is no script path'],
  ['deny', delegated(lines("ruby -r json - <<'EOF'", WRITE, 'EOF')), 'a ruby -r value is no script path'],
  ['deny', delegated(lines("deno run -c deno.json - <<'EOF'", WRITE, 'EOF')), 'a deno -c value is no script path'],
  ['deny', delegated(lines("perl -Mfeature=say - <<'EOF'", WRITE, 'EOF')), 'a perl -M module swallows the rest of its word'],
  ['deny', delegated(lines("bash <<'EOF'", 'FOO=1 cp a b', 'EOF')), 'an assignment before cp in a shell script', 'calls cp'],
  ['deny', delegated(lines("bash <<'EOF'", "sed --in-place=.bak 's/a/b/' f.txt", 'EOF')), 'sed --in-place=suffix writes', 'calls sed -i'],
  ['deny', delegated(lines("pwsh - <<'EOF'", "Write-Host don't", "Set-Content o.txt 'x'", 'EOF')), 'a quote with no partner on its line blanks nothing after it', 'writes a file'],
  ['allow', delegated(lines("{ node -; } ; <<'EOF'", WRITE, 'EOF')), 'a heredoc after a separator that follows a compound is no one\'s'],
  ['allow', delegated(lines("node tool.mjs>/dev/null <<'EOF'", WRITE, 'EOF')), 'a script path glued to > is no descriptor'],
  ['allow', delegated(lines("nodemon - <<'EOF'", WRITE, 'EOF')), 'a longer program name is no versioned interpreter'],
  ['allow', delegated(lines("node --eval \"1\" <<'EOF'", WRITE, 'EOF')), 'node --eval: the heredoc is data'],
  ['allow', delegated(lines("node --require=./hook.js tool.mjs <<'EOF'", WRITE, 'EOF')), 'a long option with = skips no word'],
  ['allow', delegated(lines("python3 -Wignore tool.py <<'EOF'", "open('o', 'w')", 'EOF')), 'an attached option value skips no word'],
  ['allow', delegated(lines("ruby -e 'p 1' <<'EOF'", WRITE, 'EOF')), 'ruby -e: the heredoc is data'],
  ['allow', delegated(lines("bash <<'EOF'", 'echo x >&-', 'echo x | tee /dev/null', 'echo x | tee -a', 'sed --expression p file.txt', 'sed -n p file.txt', 'EOF')), 'a closed descriptor, tee into a sink or nothing, sed without -i'],
  ['allow', delegated(lines("pwsh - <<'EOF'", 'Show-Out-File', 'Out-FileReport', 'EOF')), 'a cmdlet name inside a longer word']
];

// E4: PowerShell here-strings are PowerShell syntax only, opened at a token start, never swallowing an unterminated rest.
// @es E4: los here-strings de PowerShell son solo sintaxis de PowerShell, abiertos al inicio de un token, sin tragarse un resto sin cerrar.
const powerShellCases = [
  ['deny', delegated(lines('echo "@\'', '"', "node - <<'EOF'", WRITE, 'EOF')), 'a Bash command\'s @\' is not cut as a PowerShell here-string', 'writes a file'],
  ['allow', delegated(lines('Write-Output "x@\'', WRITE, '\'@"', 'node -'), 'PowerShell'), 'an @\' inside a token opens no here-string']
];

const cases = [
  // --- REFUSED: a delegated agent writes a file from a script fed through a shell / RECHAZADO: un agente delegado escribe un fichero desde un script entregado por un shell
  ['deny', delegated(lines("node - <<'EOF'", "const fs = require('fs');", "fs.writeFileSync('guard.mjs', 'line with \\\\ backslash and an it's');", 'EOF')), 'the 2026-10-18 incident: node - heredoc with writeFileSync', 'writes a file'],
  ['deny', delegated(lines("node <<'EOF'", "fs.writeFileSync('a.txt', 'x');", 'EOF')), 'node reading its script from a heredoc with no dash', 'writes a file'],
  ['deny', delegated(lines('node - <<EOF', "fs.writeFileSync('a.txt', 'x');", 'EOF')), 'an unquoted heredoc delimiter', 'writes a file'],
  ['deny', delegated(lines('node - <<-EOF', "\tfs.writeFileSync('a.txt', 'x');", '\tEOF')), 'the <<- form with a tab-indented terminator', 'writes a file'],
  ['deny', delegated(lines('cd repo && node - <<"EOF"', "fs.writeFileSync('a.txt', 'x');", 'EOF')), 'a heredoc after && with a double-quoted delimiter', 'writes a file'],
  ['deny', delegated(lines("node - <<'EOF' | tee log.txt", "fs.writeFileSync('a.txt', 'x');", 'EOF')), 'the heredoc command is piped on', 'writes a file'],
  ['deny', delegated(lines("python3 - <<'EOF'", "open('out.txt', 'w').write('x')", 'EOF')), "python3 heredoc with open(…, 'w')", 'writes a file'],
  ['deny', delegated(lines("python - <<'EOF'", "with open(path, mode='a') as handle:", '    handle.write(text)', 'EOF')), 'python heredoc with open(…, mode=a)', 'writes a file'],
  ['deny', delegated(lines("python3 - <<'EOF'", "handle = open(path, 'r+')", 'EOF')), "python heredoc with open(…, 'r+')", 'writes a file'],
  ['deny', delegated(lines("python3 - <<'EOF'", 'open(path, "wb").write(data)', 'EOF')), 'python heredoc with a double-quoted wb mode', 'writes a file'],
  ['deny', delegated(lines("bash <<'EOF'", 'echo done > out.txt', 'EOF')), 'a bash heredoc redirecting into a file', 'writes a file'],
  ['deny', delegated(lines("sh -s <<'EOF'", 'echo done >> out.txt', 'EOF')), 'an sh heredoc appending with >>', 'writes a file'],
  ['deny', delegated(lines("pwsh - <<'EOF'", "'x' | Set-Content out.txt", 'EOF')), 'a pwsh heredoc with Set-Content', 'writes a file'],
  ['deny', delegated("python3 - <<< \"open('out.txt', 'w').write('x')\""), 'a here-string to python3 writing a file', 'writes a file'],
  ['deny', delegated("bash <<< 'echo done > out.txt'"), 'a here-string to bash redirecting into a file', 'writes a file'],
  ['deny', delegated(lines("@'", "const fs = require('fs'); fs.writeFileSync('a.txt', 'it's');", "'@ | node -"), 'PowerShell'), 'a PowerShell @-quote here-string piped to node, apostrophes inside', 'writes a file'],
  ['deny', delegated(lines('@"', "'x' | Set-Content out.txt", '"@ | pwsh -'), 'PowerShell'), 'a PowerShell @-doublequote here-string piped to pwsh', 'writes a file'],
  ...markerCases,
  ...interpreterCases,
  ...stdinShapeCases,
  ...stdinElsewhereCases,
  ...falseRefusalCases,
  ...openCases,
  ...powerShellCases,
  ...boundaryCases,
  ['deny', delegated(lines("python3 - <<'EOF'", "open(path, 'xb').write(data)", 'EOF')), "python heredoc with an exclusive-create mode (xb)", 'writes a file'],
  ['deny', delegated(lines('grep "@\'" notes.txt', "node - <<'EOF'", "fs.writeFileSync('a', 'b');", 'EOF')), 'an @-quote in the middle of a line is no here-string and hides nothing after it', 'writes a file'],
  ['allow', delegated(lines("bash <<'EOF'", 'echo x >>/dev/null', 'echo y > /dev/null', 'EOF')), 'redirections to /dev/null, appended or spaced, are not file writes'],
  ['allow', delegated("bash <<< 'echo ok'; python3 tool.py \"open('f', 'w')\""), 'the here-string flag belongs to ONE word: later words are not here-strings'],
  ['allow', delegated(lines("node - ; <<'EOF'", "fs.writeFileSync('a', 'b');", 'EOF')), 'a heredoc after a separator belongs to no earlier command'],

  // --- ALLOWED: the same shapes that do not write a file, or are not a delegated agent / PERMITIDO: lo que no escribe, o no es un agente delegado
  ['allow', payload(lines("node - <<'EOF'", "fs.writeFileSync('guard.mjs', 'x');", 'EOF')), 'the orchestrator (not delegated) keeps the heredoc'],
  ['allow', delegated(lines("node - <<'EOF'", 'console.log(2 > 1, [1].map((x) => x));', 'EOF')), 'node comparison and arrow are not redirections'],
  ['allow', delegated(lines("node - <<'EOF'", "console.log(require('fs').readFileSync('a.txt', 'utf8'));", 'EOF')), 'a node heredoc that only reads'],
  ['allow', delegated(lines("bash <<'EOF'", 'ls | wc -l', 'echo hi 2>&1', 'echo gone >/dev/null', 'EOF')), 'a bash heredoc with fd copies and /dev/null only'],
  ['allow', delegated(lines("python3 - <<'EOF'", "print(open('a.txt').read())", "print(open('a.txt', 'r').read(), open('b.bin', 'rb').read())", 'EOF')), 'a python heredoc that only reads'],
  ['allow', delegated(lines("python3 - <<'EOF'", "print(reopen('a.txt', 'w'))", 'EOF')), 'a name that merely ends in open( is no open call'],
  ['allow', delegated(lines("node tool.mjs <<'EOF'", "fs.writeFileSync('a.txt', 'x');", 'EOF')), 'node running a script FILE: the heredoc is its data, not its script'],
  ['allow', delegated(lines("cat > notes.txt <<'EOF'", 'plain text', 'EOF')), 'cat with a heredoc is no interpreter'],
  ['allow', delegated(lines("node - <<'EOF'", "console.log('x');", 'EOF', "echo fs.writeFileSync('a.txt', 'x')")), 'text after the terminator is not the script'],
  ['allow', delegated(lines("@'", "console.log(1 > 0);", "'@ | node -"), 'PowerShell'), 'a PowerShell here-string that does not write'],
  ['allow', delegated(lines("@'", "fs.writeFileSync('a.txt', 'x');", "'@ | Out-Host"), 'PowerShell'), 'a PowerShell here-string that reaches no interpreter'],
  ['allow', delegated("python3 - <<< \"print(open('a.txt').read())\""), 'a here-string that only reads'],

  // --- REFUSED: shapes measured to arrive mangled / RECHAZADAS: formas medidas que llegan destrozadas
  ['deny', payload(String.raw`node -e "const re = new RegExp('\\b' + name + '\\b'); console.log(re)"`), 'failure 1: the doubled \\b that became a BACKSPACE'],
  ['deny', payload(`node -e 'console.log("d'échouer")'`), 'failure 2: apostrophe closes the payload early'],
  ['deny', payload(String.raw`node --eval "console.log('\\n')"`), 'doubled backslash, long --eval form'],
  ['deny', payload(String.raw`node -pe "'\\d'"`), 'doubled backslash, clustered -pe'],
  ['deny', payload(String.raw`node --eval='x\\y'`), 'doubled backslash, inline --eval= form'],
  ['deny', payload(String.raw`git log --oneline && node -e "console.log('\\t')"`), 'doubled backslash after a shell operator'],
  ['deny', payload(String.raw`x=$(node -e "console.log('\\s')")`), 'doubled backslash inside command substitution'],
  ['deny', payload(String.raw`node -e "console.log(\"x\")"`), 'measured: \\" has its backslash eaten'],
  ['deny', payload(String.raw`node -e "console.log('\$HOME')"`), 'measured: \\$ has its backslash eaten'],
  ['deny', payload('node --eval=abc\\'), 'trailing backslash escapes whatever follows'],
  ['deny', payload(String.raw`node -e "console.log('\u0007')"`.replace('\\u0007', '\u0007')), 'raw control character in the payload'],
  ['deny', payload(String.raw`node -e "console.log('\\b')"`, 'PowerShell'), 'doubled backslash via the PowerShell tool'],
  ['deny', payload(String.raw`"C:\Program Files\nodejs\node.exe" -e "console.log('\\b')"`), 'doubled backslash, absolute node.exe path'],
  ['deny', payload(`node -e "console.log('unclosed)`), 'unterminated quote run'],

  // --- REFUSED: MSYS switch mangling. Same family as an eaten escape — the command's FORM makes it
  // silently not do what it says. Measured: `cmd /c "rmdir …"` from Git Bash launched an INTERACTIVE
  // cmd (MSYS rewrote `/c` to `C:/`), exited 0, and two worktree teardowns were reported done while
  // the directories survived on disk. These cases exist so the DISCRIMINATION cannot drift back: the
  // refusal must fire on the single slash and must NOT fire on the doubled one, or the escape hatch
  // stops working and the guard gets routed around.
  // @es Mangling de switch MSYS. Estos casos existen para que la DISCRIMINACIÓN no pueda desviarse:
  // debe disparar con barra simple y NO con la doblada, o la salida deja de funcionar y se rodea el guard.
  ['deny', payload(`cmd /c "rmdir /S /Q somedir"`), 'cmd /c — the switch MSYS rewrites to a path'],
  ['deny', payload(`cmd /k echo hi`), 'cmd /k — same mangling, different switch'],
  // NEAR MISS, measured 2026-09-14: the same text through the PowerShell TOOL. PowerShell is not MSYS, so
  // nothing rewrites `/c` — this guard's own refusal tells people to use PowerShell for exactly this —
  // and a refusal there would block the very remedy it names. The Bash refusal above must still fire.
  // @es CASI-ACIERTO: el mismo texto por la herramienta PowerShell, donde nada reescribe `/c`; negarlo
  // bloquearía el remedio que el propio rechazo nombra.
  ['allow', payload(`cmd /c "rmdir /S /Q somedir"`, 'PowerShell'), 'cmd /c through PowerShell — no MSYS, no mangling, the refusal\'s own remedy'],
  ['allow', payload(`cmd /k echo hi`, 'PowerShell'), 'cmd /k through PowerShell'],

  // --- ALLOWED: shapes measured to arrive INTACT / PERMITIDAS: formas medidas que llegan INTACTAS
  ['allow', payload(`cmd //c "rmdir /S /Q somedir"`), 'cmd //c — the doubled slash MSYS honours (the escape hatch MUST pass)'],
  ['allow', payload(`cmd //c type /config/file`), 'a real path argument is not a switch'],
  ['allow', payload(`git commit -m /c`), '/c on a program that is not cmd'],
  ['allow', payload(String.raw`node -e "const l=require('fs').readFileSync(p,'utf8').split('\n');console.log(l.length)"`), "measured intact: a lone \\n (the 381-command pattern)"],
  ['allow', payload(String.raw`node -e "process.stdout.write('a\tb')"`), 'measured intact: a lone \\t'],
  ['allow', payload(`node -e "console.log('café')"`), 'measured intact: non-ASCII, Bash'],
  ['allow', payload(`node -e "console.log('café')"`, 'PowerShell'), 'measured intact: non-ASCII, PowerShell'],
  ['allow', payload(`node -e "const j=require('./package.json'); console.log(j.version)"`), 'plain ASCII one-liner'],
  ['allow', payload(`node -e "console.log(1)"`), 'trivial one-liner'],
  ['allow', payload(`node ./scripts/check.mjs`), 'running a real file'],
  ['allow', payload(String.raw`rg "node -e \\b" src`), 'the phrase inside another tool argument'],
  ['allow', payload(String.raw`echo "use node -e with \\b carefully"`), 'the phrase inside an echo'],
  ['allow', payload(String.raw`node "C:\Users\me\scripts\check.mjs"`), 'measured intact: a Windows path, no eval flag'],
  ['allow', payload(String.raw`node --experimental-strip-types ./x.ts`), 'a long flag that is not eval'],
  ['allow', payload(`git commit -m "fix: café"`), 'non-ASCII with no node eval at all'],
  ['allow', payload(`node -e "console.log(process.argv[1])" "C:/tmp/x"`), 'quoted payload plus a path argument'],

  // --- node's OWN options only. Everything after the script path belongs to the SCRIPT: a `-p` there is
  // git's patch flag forwarded through a wrapper, not node's print switch. Measured: `node
  // .claude/backup-repo.mjs log -p -S"x" -- AGENT-LEDGER.md` was refused as an evaluate payload.
  // @es Solo las opciones PROPIAS de node. Lo que sigue a la ruta del script es del SCRIPT: un `-p` ahí es
  // el flag de parche de git reenviado por un wrapper, no el switch de impresión de node.
  ['allow', payload(`node .claude/backup-repo.mjs log -p -S"x" -- AGENT-LEDGER.md`), 'THE INCIDENT: git -p forwarded through a wrapper script'],
  ['allow', payload(String.raw`node script.mjs -e "console.log('\\b')"`), 'a script argument -e carrying a doubled backslash is the script\'s, not node\'s'],
  ['allow', payload(String.raw`node script.mjs --eval "x\\y" --print`), 'the long forms after the script path are the script\'s too'],
  ['allow', payload(`node -r ./hook.js script.mjs -p "a"`), 'a value-taking option (-r) does not end node\'s options, and the script still does'],
  ['allow', payload(String.raw`node -- script.mjs -e "console.log('\\b')"`), 'a bare -- ends node\'s options'],
  ['allow', payload(`node --no-warnings script.mjs -pe "x"`), 'a boolean option before the script, evaluate cluster after it'],
  ['allow', payload(`node -p "1 + 1"`), 'a plain print one-liner is still fine'],
  ['allow', payload(String.raw`node -- -e "console.log('\\b')"`), 'after a bare -- even -e is the script file name, not a switch'],
  ['allow', payload(String.raw`node - -e "console.log('\\b')"`), 'a lone - (stdin) ends node\'s options; what follows is the script\'s'],
  // --- and every evaluate switch that IS node's own stays refused, wherever among node's options it sits.
  // @es Y todo switch de evaluación que SÍ es de node sigue rechazado, esté donde esté entre sus opciones.
  ['deny', payload(String.raw`node --input-type=module -e "console.log('\\b')"`), 'an inline-valued option before -e'],
  ['deny', payload(String.raw`node --input-type module -e "console.log('\\b')"`), 'a space-valued option before -e (its value is not the script)'],
  ['deny', payload(String.raw`node -r ./hook.js -e "console.log('\\b')"`), '-r with its value, then -e'],
  ['deny', payload(String.raw`node --no-warnings --eval "console.log('\\b')"`), 'a boolean option before --eval'],
  ['deny', payload(String.raw`node -e "ok" -p "console.log('\\b')"`), 'a SECOND evaluate switch after a clean first one is still node\'s'],
  ['deny', payload(String.raw`node -pe "'\\d'" script.mjs`), 'the evaluate cluster before a trailing script word'],

  // --- TEXT-EDIT programs (sed, sd, awk, gawk, perl, ruby, python): the same decision over a new set of
  // programs. The 4th element is a fragment the refusal text must carry, so the refusal is proven to NAME
  // the finding and to render the text-edit kind, not merely to deny.
  // @es Programas de edición de texto: la misma decisión sobre programas nuevos. El 4º elemento es un
  // fragmento que el texto del rechazo debe llevar: se prueba que NOMBRA el hallazgo y que renderiza el tipo.
  // REFUSED / RECHAZADAS
  ['deny', payload(String.raw`sd -F "a\\\\b" "c" file.txt`), 'THE INCIDENT: doubled backslashes in a double-quoted sd pattern', 'backslash the shell eats'],
  ['deny', payload(String.raw`sd -F "\${x}" "y" file.txt`), 'THE INCIDENT: a backslash before $ in a double-quoted template marker', 'before "$"'],
  ['deny', payload(String.raw`sed "s/a\\b/c/" f`), 'sed with a doubled backslash', 'Edit tool'],
  ['deny', payload(String.raw`awk "{print \"x\"}" f`), 'awk with an escaped quote in double quotes', 'before "\\""'],
  ['deny', payload(String.raw`gawk '{gsub(/a\\b/,"c")}1' f`), 'gawk, doubled backslash even in single quotes', 'backslash the shell eats'],
  ['deny', payload(String.raw`sed -e 's/a/b/' -e "s/c\\d/e/" f`), 'the value of a second -e is a script', 'backslash the shell eats'],
  ['deny', payload(String.raw`sd foo "bar\\n" f`, 'PowerShell'), 'second sd word (the replacement), via PowerShell', 'backslash the shell eats'],
  ['deny', payload(String.raw`perl -pe "s/a\\b/c/" f`), 'perl -pe with a doubled backslash', 'backslash the shell eats'],
  ['deny', payload(String.raw`ruby -e "puts '\\n'"`), 'ruby -e with a doubled backslash', 'backslash the shell eats'],
  ['deny', payload(String.raw`python -c "print('\\n')"`), 'python -c with a doubled backslash', 'backslash the shell eats'],
  ['deny', payload(String.raw`python3 -c "print('\$x')"`), 'python3 -c with a backslash before $', 'backslash the shell eats'],
  ['deny', payload(String.raw`FOO=1 /usr/bin/sed "s/a\\b/c/" f && echo ok`), 'env prefix, absolute program path, operator after', 'backslash the shell eats'],
  // Near misses, each with its own refusal fragment / casi-aciertos, cada uno con su fragmento
  ['deny', payload(`sed 's/a/b\\' f`), 'NEAR MISS: a trailing backslash inside single quotes', 'trailing backslash'],
  ['deny', payload(`sd foo bar\\`), 'NEAR MISS: a trailing backslash at the end of the command', 'trailing backslash'],
  ['deny', payload(`sed 's/a/b/ file`), 'NEAR MISS: an unterminated quote', 'unterminated quote'],
  ['deny', payload(`sd 'foo bar f`), 'NEAR MISS: an unterminated quote on sd', 'unterminated quote'],
  ['deny', payload(`sed 's/a/b/'x f`), 'NEAR MISS: a script partly quoted and partly bare', 'partly quoted and partly bare'],
  ['deny', payload(`awk '{print 1}'x f`), 'NEAR MISS: awk script partly quoted and partly bare', 'partly quoted and partly bare'],
  ['deny', payload(`python -c 'print(1)'x`), 'NEAR MISS: python code partly quoted and partly bare', 'partly quoted and partly bare'],
  ['deny', payload(String.raw`sed 's/a/b/' "dir\\file.txt"`), 'a doubled backslash in a FILE argument is eaten too', 'backslash the shell eats'],
  ['deny', payload(String.raw`sd "-a\\b" c f`), 'a QUOTED word that starts with a dash is a pattern, not an option', 'backslash the shell eats'],
  ['deny', payload(`sd -n 2 foo bar"x y" f`), 'the value of sd -n is consumed, so the replacement is the second script word', 'partly quoted and partly bare'],
  // ALLOWED / PERMITIDAS
  ['allow', payload(`awk -f prog.awk data"x y"`), 'with -f no leading word is an inline script, so a part-quoted file is fine'],
  ['allow', payload(`sed -e 's/a/b/' x"y z"`), 'after -e the leading words are files, so a part-quoted file is fine'],
  ['allow', payload(`sed 's/a/b/' f`), 'plain sed'],
  ['allow', payload(`sd foo bar f`), 'plain sd'],
  ['allow', payload(`awk '{print $1}' f`), 'awk with a $ field inside single quotes'],
  ['allow', payload(String.raw`sed 's/\n/ /' f`), 'a lone \\n inside single quotes arrives intact'],
  ['allow', payload(String.raw`sed "s/\d/x/" f`), 'NEAR MISS: a single backslash before a letter in double quotes arrives intact'],
  ['allow', payload(String.raw`sed -i 's/a/b/' "C:\Users\me\file.txt"`), 'a Windows path argument'],
  ['allow', payload(`sd 'café' 'cafe' f`), 'an accented string'],
  ['allow', payload(`sed -n '1,5p' f`), 'sed with an option that takes no value'],
  ['allow', payload(`sed -i.bak -e 's/a/b/' f`), 'sed -e with a clean script'],
  ['allow', payload(`sd -n 2 foo bar f`), 'the value of sd -n is not a script'],
  ['allow', payload(`awk -F: -v x=1 '{print $1}' f`), 'awk options with their values'],
  ['allow', payload(`sd foo bar ~/"My Files"/x`), 'a part-quoted FILE path is not a script shape'],
  ['allow', payload(`perl -pe 's/a/b/' f`), 'plain perl -pe'],
  ['allow', payload(`ruby -e "puts 1"`), 'plain ruby -e'],
  ['allow', payload(`python -c "print(1)"`), 'plain python -c'],
  ['allow', payload(`python3 script.py -c "print('\\\\n')"`), 'python script argument -c belongs to the script'],
  ['allow', payload(`python -m pytest -c "x\\\\y"`), 'python -m ends the interpreter options'],
  ['allow', payload(`perl script.pl -e "x\\\\y"`), 'perl script argument -e belongs to the script'],
  ['allow', payload(`rg "sed \\\\b" src`), 'the phrase inside another tool argument'],
  ['allow', payload(`git commit -m "use sed \\\\ carefully"`), 'the phrase inside a commit message'],

  // --- HEREDOC bodies are DATA (guard-that-cannot-go-red, "the guard that forbids writing about itself"):
  // the measured false positive was a body line starting with `sd -F "a\\\\b"`. The scan must skip the
  // body AND resume after the terminator, so a dangerous command after it, or before the `<<`, is refused.
  // @es Los cuerpos de heredoc son DATOS: el falso positivo medido fue una línea de cuerpo que empezaba
  // con `sd -F "a\\\\b"`. Se salta el cuerpo y se REANUDA tras el terminador.
  // ALLOWED / PERMITIDAS
  ['allow', payload(`cat <<'EOF' > f.txt\n${String.raw`sd -F "a\\\\b" f`}\nEOF`), 'THE INCIDENT: a sd line in a quoted-delimiter heredoc body fed to cat'],
  ['allow', payload(`node - <<EOF\n${String.raw`sd -F "a\\\\b" f`}\nEOF`), 'the same body fed to node through an unquoted delimiter'],
  ['allow', payload(`node - <<EOF\n${String.raw`node -e "x\\\\y"`}\nEOF`), 'a node -e line in a heredoc body is data too'],
  ['allow', payload(`cat <<"EOF"\n${String.raw`sed "s/a\\b/c/" f`}\nEOF`), 'a double-quoted delimiter'],
  ['allow', payload(`cat <<-EOF\n\t${String.raw`sd -F "a\\\\b" f`}\n\tEOF`), '<<- with the terminator indented by tabs'],
  ['allow', payload(`cat <<A <<B\n${String.raw`sd -F "a\\\\b" f`}\nA\n${String.raw`sd -F "a\\\\b" g`}\nB`), 'two heredocs on one line: both bodies are data'],
  ['allow', payload(`cat <<A <<B\nx\nA\n${String.raw`sd -F "a\\\\b" f`}\nB`), 'the first terminator ends only the first body: the second body is still data'],
  ['allow', payload(`cat <<EOF\n${String.raw`sd -F "a\\\\b" f`}`), 'an unterminated heredoc: the rest of the command is data'],
  ['allow', payload(`cat <<EOF\nEOFX\n${String.raw`sd -F "a\\\\b" f`}\nEOF`), 'a line that only STARTS with the delimiter does not end the body'],
  ['allow', payload(`cat <<EOF\n\tEOF\n${String.raw`sd -F "a\\\\b" f`}`), 'plain << does not strip tabs, so an indented EOF is still body'],
  ['allow', payload(`cat <<< "hello"`), 'a here-string with a harmless payload'],
  // REFUSED / RECHAZADAS
  ['deny', payload(`cat <<'EOF'\nbody\nEOF\n${String.raw`sd -F "a\\\\b" c f`}`), 'a dangerous sd on the line AFTER the terminator: the scan resumed', 'backslash the shell eats'],
  ['deny', payload(`cat <<EOF\nbody\nEOF\n${String.raw`node -e "console.log('\\b')"`}`), 'a dangerous node -e after an unquoted-delimiter heredoc', 'backslash the shell eats'],
  ['deny', payload(`cat <<"EOF"\nbody\nEOF\n${String.raw`sed "s/a\\b/c/" f`}`), 'a dangerous sed after a double-quoted-delimiter heredoc', 'backslash the shell eats'],
  ['deny', payload(`cat <<-EOF\n\tbody\n\tEOF\n${String.raw`sd -F "a\\\\b" c f`}`), 'a dangerous sd after a <<- heredoc whose terminator is tab-indented', 'backslash the shell eats'],
  ['deny', payload(`cat <<A <<B\nx\nA\ny\nB\n${String.raw`sd -F "a\\\\b" c f`}`), 'a dangerous sd after two heredocs on one line', 'backslash the shell eats'],
  ['deny', payload(`${String.raw`sd -F "a\\\\b" c f`} <<EOF\nbody\nEOF`), 'a dangerous sd BEFORE the << on the same line', 'backslash the shell eats'],
  ['deny', payload(`${String.raw`node -e "console.log('\\b')"`} <<EOF\nbody\nEOF`), 'a dangerous node -e BEFORE the << on the same line', 'backslash the shell eats'],
  ['deny', payload(`${String.raw`sd "a\\b" c f`} && cat <<EOF\nbody`), 'an unterminated heredoc keeps the earlier command inspected', 'backslash the shell eats'],
  ['deny', payload(String.raw`sd foo bar <<< "a\\\\b"`), 'a here-string payload is an ordinary argument of sd, so it is judged', 'backslash the shell eats'],
  ['deny', payload(String.raw`cat <<< "x" && sd -F "a\\\\b" c f`), 'after a here-string the next command is still inspected', 'backslash the shell eats'],

  // --- A SCRIPT FILE IS A FILE RUN, whatever its module extension. Node stops reading its own options at
  // the script path, so a `-e` / `-p` after `x.cjs` is the script's argument and its payload is never an
  // eval. One case per extension and per way a script is named, so no extension can quietly start to
  // read as code: the walk keys on the SHAPE of the word (a non-option ends node's options), never on
  // a suffix list, and these cases keep it that way.
  // @es UN FICHERO DE SCRIPT ES UNA EJECUCIÓN DE FICHERO, sea cual sea su extensión de módulo. Node deja de
  // leer sus opciones en la ruta del script, así que un `-e`/`-p` tras `x.cjs` es argumento del script. Un
  // caso por extensión y por forma de nombrar el script: el recorrido decide por la FORMA de la palabra,
  // nunca por una lista de sufijos, y estos casos lo mantienen así.
  ...['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].flatMap((extension) => [
    ['allow', payload(String.raw`node ./scripts/run${extension} -e "console.log('\\b')"`), `script ${extension}: a relative path, its -e is the script's`],
    ['allow', payload(String.raw`node --require ./hook.cjs ./run${extension} -p "a\\b"`), `script ${extension}: after a value-taking option, its -p is the script's`],
    ['allow', payload(String.raw`node "C:\Users\me\scripts\run${extension}" --eval "x\\y"`), `script ${extension}: a quoted Windows path, its --eval is the script's`],
    ['allow', payload(String.raw`FOO=1 node --no-warnings run${extension} -pe "'\\d'"`, 'PowerShell'), `script ${extension}: env prefix and boolean option, via PowerShell`]
  ]),
  ['allow', payload(`node run.cjs && sed -n 1p run.cjs`), 'a script file named on both sides of an operator'],
  ['allow', payload(`sed -i 's/a/b/' src/run.cjs`), 'a text edit whose FILE argument is a .cjs'],
  ['deny', payload(String.raw`node --require ./hook.cjs -e "console.log('\\b')"`), 'a .cjs as the VALUE of -r is not the script: the -e after it is still node\'s'],

  // --- COMMENTS AND LINE CONTINUATIONS are not payload. A `#` that opens a word runs to the end of the line
  // and is data, like a heredoc body; an unquoted backslash-newline is removed by the shell and joins
  // nothing. Measured shape: a multi-line `sed -n \` + newline + the script was refused for "a backslash
  // the shell eats", and an apostrophe in a trailing comment was refused as an unterminated quote.
  // @es COMENTARIOS Y CONTINUACIONES DE LÍNEA no son payload. Un `#` que abre palabra llega al fin de línea
  // y es dato, como un cuerpo de heredoc; un backslash-salto sin comillas lo elimina el shell. Forma medida:
  // un `sed -n \` multilínea se rechazaba por «backslash que el shell se come» y un apóstrofe en un
  // comentario final por «comilla sin cerrar».
  ['allow', payload(`sed -n \\\n  '1,5p' src/run.cjs`), 'an unquoted line continuation between sed and its script'],
  ['allow', payload(`sd foo bar \\\n  src/run.cjs`), 'a line continuation before the file argument of sd'],
  ['allow', payload(`awk -F: \\\n  '{print $1}' src/run.cjs`), 'a line continuation between awk options and its script'],
  ['allow', payload(`node run.cjs \\\n  --flag value`), 'a line continuation inside a node script invocation'],
  ['allow', payload(`sed -n 1p run.cjs # it's the second pass`), 'an apostrophe in a trailing comment'],
  ['allow', payload(String.raw`sed -n 1p run.cjs # the pattern a\\b stays literal here`), 'a doubled backslash in a trailing comment'],
  ['allow', payload(`# node -e "x\\\\y" is what I want to avoid\nsed -n 1p run.cjs`), 'a whole-line comment naming a refused shape'],
  ['allow', payload(`sed -n 1p run.cjs;# it's glued to the operator`), 'a comment right after an operator'],
  ['allow', payload(String.raw`echo a;# note; sed "s/a\\b/c/" f`), 'a comment glued to ; hides the commands it names'],
  ['allow', payload(String.raw`echo a|# note; sed "s/a\\b/c/" f`), 'a comment glued to | hides the commands it names'],
  ['allow', payload(String.raw`echo a&# note; sed "s/a\\b/c/" f`), 'a comment glued to & hides the commands it names'],
  ['allow', payload(String.raw`echo a # note; sed "s/a\\b/c/" f`), 'a comment after a blank hides the commands it names'],
  ['deny', payload(`sed -n 1p run.cjs # fine\n${String.raw`sd -F "a\\\\b" c f`}`), 'a dangerous command on the line AFTER a comment is still judged', 'backslash the shell eats'],
  ['deny', payload(`${String.raw`node -e "console.log('\\b')"`} # trailing comment`), 'a dangerous payload BEFORE a comment is still judged', 'backslash the shell eats'],
  ['deny', payload(`echo \${#x}; ${String.raw`node -e "console.log('\\b')"`}`), 'the # of ${#x} does not open a comment that hides the rest of the line', 'backslash the shell eats'],
  ['deny', payload(`sed -n a#b ${String.raw`"x\\\\y"`} f`), 'a # inside a word is no comment: the script after it is still judged', 'backslash the shell eats'],
  ['deny', payload(`sed \\\n  ${String.raw`"s/a\\b/c/"`} f`), 'a line continuation does not hide a dangerous script that follows it', 'backslash the shell eats'],
  ['deny', payload(`sed "s/a\\\nb/c/" f`), 'a backslash-newline INSIDE double quotes is still eaten', 'before "\\n"'],

  // --- FAIL OPEN: every corruption of the hook's own input / FALLAR ABIERTO
  ['allow', 'this is not json at all', 'unparseable stdin'],
  ['allow', '', 'empty stdin'],
  ['allow', '{"tool_input":', 'truncated json'],
  ['allow', JSON.stringify({ tool_input: { command: 42 } }), 'command of the wrong type'],
  ['allow', JSON.stringify({}), 'payload with no tool_input'],
  ['allow', 'null', 'json null payload'],
  ['allow', '\uFEFFthis is not json at all', 'BOM plus garbage'],

  // --- BOM must not turn a decision into a silent pass / el BOM no debe convertir una decisión en pase silencioso
  ['deny', `\uFEFF${payload(String.raw`node -e "console.log('\\b')"`)}`, 'BOM-prefixed valid payload still decides'],
];

let failures = 0;

for (const [expected, input, label, fragment] of cases) {
  const result = run(input);
  const actual = result.decision === 'deny' ? 'deny' : 'allow';
  const fragmentOk = fragment === undefined || result.reason.includes(fragment);
  const ok = actual === expected && result.status === 0 && fragmentOk;

  if (!fragmentOk) console.log(`      refusal text lacks the fragment ${JSON.stringify(fragment)}`);

  if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  expected=${expected} actual=${actual} exit=${result.status}  ${label}`);
}

// --- The denial journal holds a digest of the command, never its text (the block-journal policy).
// @es El diario de rechazos guarda un digest del comando, nunca su texto (política del block-journal).
{
  const secretCommand = String.raw`node -e "console.log('\\b') // journal-secret-marker-7731"`;

  fs.rmSync(path.join(stateDir('eval-guard'), 'denials.jsonl'), { force: true });
  run(payload(secretCommand));

  const raw = fs.readFileSync(path.join(stateDir('eval-guard'), 'denials.jsonl'), 'utf8');
  const entry = JSON.parse(raw.trim().split('\n').at(-1));
  const holdsDigest = entry.commandDigest === digestInput(secretCommand);
  const holdsNoText = entry.command === undefined && !raw.includes('journal-secret-marker-7731');

  for (const [ok, label] of [[holdsDigest, 'the denial record carries the sha256 of the command'], [holdsNoText, 'the denial record never carries the command text']]) {
    if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

// --- E4: the PowerShell here-string cut, read directly: an unterminated opener and a mid-token one stay text.
// @es E4: el recorte de here-strings de PowerShell, leído directamente: una apertura sin cerrar o dentro de un token sigue siendo texto.
let directChecks = 0;

{
  const unterminated = lines("Write-Output @'", 'never closed', 'node -');
  const midToken = lines("x@'", 'body', "'@");
  const closed = lines("$a = @'", 'body', "'@ | node -");
  const results = [
    [JSON.stringify(extractPowerShellHereStrings(unterminated)) === JSON.stringify({ text: unterminated, scripts: [] }), 'an unterminated opener is left in the text, hiding nothing'],
    [JSON.stringify(extractPowerShellHereStrings(midToken)) === JSON.stringify({ text: midToken, scripts: [] }), 'an opener inside a token is no here-string'],
    [JSON.stringify(extractPowerShellHereStrings(closed)) === JSON.stringify({ text: '$a = POWERSHELLHEREDATA0 | node -', scripts: [{ text: 'body', offset: 5, code: 0x40 }] }), 'a terminated one is cut with its offset and code point']
  ];

  for (const [ok, label] of results) {
    directChecks += 1;
    if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

console.log(`\n${cases.length + directChecks - failures}/${cases.length + directChecks} passed`);
process.exit(failures === 0 ? 0 : 1);
