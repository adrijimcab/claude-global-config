#!/usr/bin/env node
/**
 * Proves the in-place source edit rule of eval-guard through its real entry point (`guard.mjs` evaluate) with
 * real-shaped payloads: a delegated agent's `sed -i`, `perl -pi`, `awk -i inplace`, `sd` and PowerShell
 * `Set-Content` on a source file are refused with a bilingual reason naming the program and the file; the same commands
 * from the parent session, the read-only forms, an in-place edit of a non-source file and `perl -Ilib/include` pass.
 * The 7th recurrence (2026-11-22, an escape-free `sed -i` on a spec file) is the first case.
 *
 * @es Prueba la regla de edición en el sitio de fuentes de eval-guard por su entrada real con payloads de forma real:
 * un agente delegado con `sed -i`, `perl -pi`, `awk -i inplace`, `sd` o `Set-Content` sobre un fuente se rechaza con
 * un motivo bilingüe que nombra el programa y el fichero; los mismos comandos desde la sesión padre, las formas de solo
 * lectura, la edición de un fichero que no es fuente y `perl -Ilib/include` pasan.
 */

import { evaluate } from './guard.mjs';
import { isSourceFile, shellSourceWrite } from './in-place-edits.mjs';
import { isolateState } from '../hook-state/locations.mjs';

isolateState('eval-guard');

let passed = 0;
const failures = [];

const check = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

const payload = (command, { tool = 'Bash', delegated = true } = {}) => JSON.stringify({
  session_id: 'selftest',
  hook_event_name: 'PreToolUse',
  tool_name: tool,
  tool_input: { command },
  cwd: 'C:/repo',
  ...(delegated ? { agent_id: 'agent-selftest', transcript_path: '/home/u/.claude/projects/p/s/subagents/agent-selftest.jsonl' } : { transcript_path: '/home/u/.claude/projects/p/s.jsonl' }),
});

const verdict = (command, options) => {
  const out = evaluate(payload(command, options));

  return out === undefined ? 'allow' : out.hookSpecificOutput.permissionDecision;
};

const refusedOn = [
  ["sed -i 's/old/new/' src/app/pages/cics/components/cics-type-card/cics-type-card.component.spec.ts", 'the 7th recurrence: an escape-free sed -i on a spec'],
  ["sed -i.bak 's/a/b/' src/x.ts", 'sed -i with a backup suffix'],
  ["sed -ni 's/a/b/p' src/x.html", 'sed -ni'],
  ["sed --in-place 's/a/b/' src/x.scss", 'sed --in-place'],
  ["cd src && sed -i 's/a/b/' x.ts", 'sed -i after a cd'],
  ['cat src/part.txt >> src/app/network-vis-click.ts', 'the 2026-11-23 case: cat >> appending source'],
  ["echo 'export const a = 1;' > src/x.ts", 'a > redirection into a source file'],
  ["cat <<'EOF' > src/y.ts\nexport const y = 1;\nEOF", 'a heredoc redirected into a source file'],
  ['echo x | tee src/z.ts', 'tee into a source file'],
];

for (const [command, label] of refusedOn) check(`deny: ${label}`, verdict(command), 'deny');

check('deny: PowerShell Set-Content -Path on a source file', verdict("Set-Content -Path 'src/x.ts' -Value 'y'", { tool: 'PowerShell' }), 'deny');
check('deny: PowerShell Out-File with a positional source file', verdict("'y' | Out-File src/x.json", { tool: 'PowerShell' }), 'deny');

for (const [command, label] of [
  ["sed -n '1,5p' src/x.ts", 'sed -n only reads'],
  ["sed 's/a/b/' src/x.ts", 'sed without -i prints, it does not edit'],
  ["perl -ne 'print' src/x.ts", 'perl -ne only reads'],
  ["perl -Ilib/include -e 'print 1' src/x.ts", 'perl -Ilib/include is an include path, not -i'],
  ["awk '{print}' src/x.js", 'awk without inplace only reads'],
  ["sed -i 's/a/b/' build.log", 'an in-place edit of a non-source file'],
  ["sed -i 's/a/b/' notes.md", 'markdown is not a source file here'],
  ['node build.mjs > build.log', 'a redirection into a log'],
  ['cp src/a.ts src/b.ts', 'a byte copy of a source file carries no text through the shell'],
  ['mv src/a.ts src/c.ts', 'a byte move of a source file'],
]) check(`allow: ${label}`, verdict(command), 'allow');

check('allow: Get-Content only reads', verdict("Get-Content -Path 'src/x.ts'", { tool: 'PowerShell' }), 'allow');
check('allow: Set-Content on a non-source file', verdict("Set-Content -Path 'out.txt' -Value 'y'", { tool: 'PowerShell' }), 'allow');
check('allow: the parent session is not covered (delegated agents only)', verdict("sed -i 's/a/b/' src/x.ts", { delegated: false }), 'allow');

const reason = evaluate(payload("sed -i 's/a/b/' src/x.ts"))?.hookSpecificOutput?.permissionDecisionReason ?? '';

check('the reason names the writer and the file', reason.includes('sed -i writes the source file') && reason.includes('x.ts`'), true);
check('the reason points at the Edit tool, in both languages', reason.includes('the Edit tool') && reason.includes('@es Lo que sí funciona'), true);

const shellPayload = (command, tool = 'Bash') => ({ tool_name: tool, tool_input: { command }, cwd: 'C:/repo' });

check('pure: an extension in upper case is a source file', isSourceFile('X.TS'), true);
check('pure: a dotfile with no extension is not', isSourceFile('.gitignore'), false);
check('pure: a word with .ts inside but another extension is not source', isSourceFile('src/x.ts.orig'), false);
check('pure: the write names its writer label', shellSourceWrite(shellPayload('echo x | tee src/x.mjs'))?.via, 'tee');
check('pure: a sed executable given with a folder and .exe is recognised', shellSourceWrite(shellPayload("C:/bin/sed.exe -i 's/a/b/' x.ts"))?.via, 'sed -i');
check('pure: a command that writes nothing gives no finding', shellSourceWrite(shellPayload('git status')), undefined);
check('pure: Set-Content -LiteralPath is read, not the first positional word', shellSourceWrite(shellPayload("Set-Content -Value 'notes' -LiteralPath a.mjs", 'PowerShell'))?.target?.endsWith('a.mjs'), true);

if (failures.length > 0) {
  for (const failure of failures) console.log(`FAIL ${failure}`);
  console.log(`${String(passed)} passed, ${String(failures.length)} failed @es ${String(passed)} pasan, ${String(failures.length)} fallan`);
  process.exitCode = 1;
} else {
  console.log(`${String(passed)}/${String(passed)} checks passed @es ${String(passed)}/${String(passed)} comprobaciones correctas`);
}
