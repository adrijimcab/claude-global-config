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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');

/** Runs the guard exactly as the harness does. @es Ejecuta el guard exactamente como lo hace el harness. */
function run(input) {
  const result = spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8' });
  let decision;

  try {
    decision = JSON.parse(result.stdout).hookSpecificOutput.permissionDecision;
  } catch {
    decision = undefined;
  }

  return { status: result.status, decision };
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

for (const [expected, input, label] of cases) {
  const result = run(input);
  const actual = result.decision === 'deny' ? 'deny' : 'allow';
  const ok = actual === expected && result.status === 0;

  if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  expected=${expected} actual=${actual} exit=${result.status}  ${label}`);
}

console.log(`\n${cases.length - failures}/${cases.length} passed`);
process.exit(failures === 0 ? 0 : 1);
