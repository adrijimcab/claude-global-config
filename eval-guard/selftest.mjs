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

const cases = [
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

console.log(`\n${cases.length - failures}/${cases.length} passed`);
process.exit(failures === 0 ? 0 : 1);
