#!/usr/bin/env node
/**
 * Prueba que el guard DISCRIMINA, solo con fixtures construidos (nunca el overlay vivo):
 *   - qué comandos ejecutan de verdad un `gentle-ai sync` y cuáles lo mencionan como dato (echo,
 *     comillas, heredoc, here-string, comentario, mensaje de commit), en bash y en PowerShell, y que el
 *     análisis se REANUDA después de cada dato;
 *   - los casi-aciertos: `--dry-run`, `sync-status`, `gentle-ai-sync`, `sync` solo, `--dry-run=false`;
 *   - cada respuesta del check (0, 1, 2, falla) y que el check no se consulta si no hay sync real;
 *   - el CLI: rechazo en JSON válido con salida 0, silencio al permitir, BOM, y salida 0 con aviso ante
 *     su propia falla (stdin roto, módulos faltantes).
 *
 *   node selftest.mjs      sale con 0 solo si pasan todos los casos
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';
import { runOverlayCheck } from './overlay-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASH = 'Bash';
const POWERSHELL = 'PowerShell';

const BROKEN_RESULTS = [
  { id: 'sdd-spec-grants-bash', status: 'broken', detail: 'tools line does not grant Bash', reapplicable: true },
  { id: 'claude-md-owner-sections-outside-managed-regions', status: 'broken', detail: 'line 900 is INSIDE persona', reapplicable: false, remedy: 'Move the owner text by hand.' },
];
const UNVERIFIABLE_RESULTS = [{ id: 'claude-md-persona-region-is-only-gentle-ai-text', status: 'unverifiable', detail: 'source not in module cache', reapplicable: false }];

const DRIFT = {
  clean: () => ({ exitCode: 0, results: [] }),
  broken: () => ({ exitCode: 1, results: BROKEN_RESULTS }),
  unverifiable: () => ({ exitCode: 2, results: UNVERIFIABLE_RESULTS }),
  failing: () => ({ failure: 'check.mjs could not run: ENOENT' }),
};

const cases = [];
const test = (name, body) => cases.push({ name, body });
function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const verdict = (command, toolName = BASH, checkDrift = DRIFT.broken) => decide({ command, toolName }, { checkDrift }).decision;

// ------------------------------------------------ ejecuta un sync real -> rechazo con deriva

const REAL_SYNCS = [
  [BASH, 'gentle-ai sync'],
  [BASH, 'cd x && gentle-ai sync'],
  [BASH, 'gentle-ai sync --agents claude-code'],
  [BASH, '/c/Users/a/go/bin/gentle-ai sync'],
  [BASH, 'echo start; gentle-ai sync; echo done'],
  [BASH, 'FOO=1 gentle-ai sync'],
  [BASH, 'env -i FOO=1 gentle-ai sync'],
  [BASH, 'x=$(gentle-ai sync)'],
  [BASH, 'echo "result: $(gentle-ai sync)"'],
  [BASH, 'echo `gentle-ai sync`'],
  [BASH, 'diff <(gentle-ai sync) expected.txt'],
  [BASH, 'bash -c "gentle-ai sync"'],
  [BASH, 'pwsh -Command "gentle-ai sync"'],
  [BASH, 'cmd //c gentle-ai sync'],
  [BASH, 'gentle-ai sync 2>&1 | tee sync.log'],
  [BASH, 'gentle-ai sync --dry-run=false'],
  [BASH, 'cat <<EOF\n$(gentle-ai sync)\nEOF'],
  [BASH, "cat <<'EOF'\ngentle-ai sync\nEOF\ngentle-ai sync"],
  [BASH, 'echo "gentle-ai sync" && gentle-ai sync'],
  [BASH, 'git commit -m "gentle-ai sync" && gentle-ai sync'],
  [BASH, 'gentle-ai sync --dry-run; gentle-ai sync'],
  [BASH, '>sync.log gentle-ai sync'],
  [BASH, 'cat <<-EOF\n\tdata\n\tEOF\ngentle-ai sync'],
  [BASH, 'echo "$( (true) ; gentle-ai sync )"'],
  [BASH, 'sudo gentle-ai sync'],
  [BASH, 'echo hi >\ngentle-ai sync'],
  // Near misses of the help rule: other flags before the subcommand, a flag that only starts like help,
  // and a help flag in ANOTHER command of the line. @es Casi-aciertos de la regla de ayuda.
  [BASH, 'gentle-ai --verbose sync'],
  [BASH, 'gentle-ai --helpful sync'],
  [BASH, 'gentle-ai --help; gentle-ai sync'],
  [POWERSHELL, 'gentle-ai --verbose sync'],
  [POWERSHELL, 'gentle-ai --help; gentle-ai sync'],
  [POWERSHELL, 'gentle-ai sync'],
  [POWERSHELL, 'Set-Location x; gentle-ai sync'],
  [POWERSHELL, 'cd x && gentle-ai sync'],
  [POWERSHELL, '& gentle-ai sync'],
  [POWERSHELL, '& "C:\\Users\\a\\go\\bin\\gentle-ai.exe" sync'],
  [POWERSHELL, 'gentle-ai sync 2>&1 | Out-File sync.log'],
  [POWERSHELL, '$out = $(gentle-ai sync)'],
  [POWERSHELL, "Write-Host 'gentle-ai sync'; gentle-ai sync"],
  [POWERSHELL, "$m = @'\ngentle-ai sync\n'@\ngentle-ai sync"],
  [POWERSHELL, '$m = @"\n$(gentle-ai sync)\n"@'],
];
REAL_SYNCS.forEach(([tool, command]) => test(`deny (${tool}): ${JSON.stringify(command)}`, () => expect(verdict(command, tool), 'deny', 'decision')));

// ------------------------------------------------ dato o casi-acierto -> pasa aunque haya deriva

const NOT_A_SYNC = [
  [BASH, 'gentle-ai sync --dry-run'],
  [BASH, 'gentle-ai sync --dry-run=true --agents claude-code'],
  [BASH, 'cd x && gentle-ai sync --dry-run'],
  [BASH, 'echo gentle-ai sync'],
  [BASH, 'echo "gentle-ai sync"'],
  [BASH, "echo 'run gentle-ai sync later'"],
  [BASH, 'git commit -m "gentle-ai sync erased our rules"'],
  [BASH, "git commit -F - <<'EOF'\nfix: gentle-ai sync\nEOF"],
  [BASH, 'cat <<EOF\nplain text: gentle-ai sync\nEOF'],
  [BASH, 'cat <<-EOF\n\tgentle-ai sync\n\tEOF\necho after'],
  [BASH, 'rg "gentle-ai sync" notes.md'],
  [BASH, '# gentle-ai sync'],
  [BASH, 'echo hi # gentle-ai sync'],
  [BASH, 'echo hi # done; gentle-ai sync'],
  [BASH, 'gentle-ai sync-status'],
  [BASH, 'gentle-ai skill-registry refresh --quiet'],
  [BASH, 'gentle-ai telemetry status --json'],
  [BASH, 'gentle-ai-sync'],
  [BASH, 'gentle-ai; sync'],
  [BASH, 'sync'],
  [BASH, 'echo x > gentle-ai sync.txt'],
  [BASH, 'bash -c "echo gentle-ai sync"'],
  [BASH, 'echo "done; gentle-ai sync"'],
  [BASH, "echo 'a && gentle-ai sync'"],
  [BASH, 'echo "a \\" ; gentle-ai sync"'],
  [BASH, 'x="$(echo "gentle-ai sync")"'],
  [BASH, 'gentle-ai sdd-status sync'],
  // A help flag (or the `help` word) BEFORE the subcommand asks for help, it never syncs.
  // @es Un flag de ayuda (o la palabra `help`) ANTES del subcomando pide ayuda, nunca sincroniza.
  [BASH, 'gentle-ai --help sync'],
  [BASH, 'gentle-ai -h sync'],
  [BASH, 'gentle-ai help sync'],
  [BASH, 'cd x && gentle-ai --help sync --agents claude-code'],
  [POWERSHELL, 'gentle-ai --help sync'],
  [POWERSHELL, '& "C:\\Users\\a\\go\\bin\\gentle-ai.exe" -h sync'],
  [POWERSHELL, 'gentle-ai help sync'],
  [POWERSHELL, 'gentle-ai sync --dry-run'],
  [POWERSHELL, "Write-Host 'it''s; gentle-ai sync'"],
  [POWERSHELL, 'Write-Host "a`"; gentle-ai sync"'],
  [POWERSHELL, "Write-Host 'gentle-ai sync'"],
  [POWERSHELL, 'Write-Host "gentle-ai sync"'],
  [POWERSHELL, "$m = @'\ngentle-ai sync\n'@"],
  [POWERSHELL, '$m = @"\ntext gentle-ai sync\n"@'],
  [POWERSHELL, '<# gentle-ai sync #> Get-Date'],
  [POWERSHELL, '<#\ngentle-ai sync\n#>\nGet-Date'],
  [POWERSHELL, "$m = @'\nit's\ngentle-ai sync\n'@"],
  [POWERSHELL, 'Get-Date # gentle-ai sync'],
  [POWERSHELL, 'gentle-ai sync-status'],
];
NOT_A_SYNC.forEach(([tool, command]) => test(`allow (${tool}): ${JSON.stringify(command)}`, () => expect(verdict(command, tool), 'allow', 'decision')));

// ------------------------------------------------ la respuesta del check decide

test('drift clean (check exit 0) -> a real sync is allowed', () => expect(verdict('gentle-ai sync', BASH, DRIFT.clean), 'allow', 'decision'));

test('broken (exit 1) -> refusal names every broken id and both fixes', () => {
  const result = decide({ command: 'gentle-ai sync', toolName: BASH }, { checkDrift: DRIFT.broken });
  const mentions = ['sdd-spec-grants-bash', 'claude-md-owner-sections-outside-managed-regions', 'apply.mjs', 'Move the owner text by hand.', '--dry-run'];
  mentions.forEach((text) => expect(result.reason.includes(text), true, `reason mentions ${text}`));
});

test('unverifiable (exit 2) -> refused, and the refusal says it could not verify', () => {
  const result = decide({ command: 'gentle-ai sync', toolName: BASH }, { checkDrift: DRIFT.unverifiable });
  expect(result.decision, 'deny', 'decision');
  expect(result.reason.includes('could NOT VERIFY') && result.reason.includes('claude-md-persona-region-is-only-gentle-ai-text'), true, 'reason');
});

test('check cannot run -> refused, never read as clean', () => {
  const result = decide({ command: 'gentle-ai sync', toolName: BASH }, { checkDrift: DRIFT.failing });
  expect(result.decision, 'deny', 'decision');
  expect(result.reason.includes('could not run'), true, 'reason');
});

test('unexpected check exit code -> refused, naming the code', () => {
  const result = decide({ command: 'gentle-ai sync', toolName: BASH }, { checkDrift: () => ({ exitCode: 7, results: [] }) });
  expect(result.decision, 'deny', 'decision');
  expect(result.reason.includes('unexpected exit code 7'), true, 'reason');
});

// ------------------------------------------------ resultados seguros ante sync (sync solo los deshace)
// Sync-safe results: sync can only undo them. @es Resultados seguros ante sync: sync solo puede deshacerlos.

const SYNC_SAFE_RESULTS = [{ id: 'review-contract-lazy-while-reviews-are-off', status: 'broken', detail: 'span loaded while reviews are off', reapplicable: true, syncSafe: true }];

test('only a sync-safe result is broken (exit 1) -> the sync is ALLOWED', () => {
  expect(verdict('gentle-ai sync', BASH, () => ({ exitCode: 1, results: SYNC_SAFE_RESULTS })), 'allow', 'decision');
});

test('only a sync-safe result is unverifiable (exit 2) -> the sync is ALLOWED', () => {
  const results = [{ ...SYNC_SAFE_RESULTS[0], status: 'unverifiable' }];
  expect(verdict('gentle-ai sync', BASH, () => ({ exitCode: 2, results })), 'allow', 'decision');
});

test('a sync-safe result beside a real breakage -> refused, and the reason names only the real one', () => {
  const result = decide({ command: 'gentle-ai sync', toolName: BASH }, { checkDrift: () => ({ exitCode: 1, results: [...SYNC_SAFE_RESULTS, ...BROKEN_RESULTS] }) });
  expect(result.decision, 'deny', 'decision');
  expect(result.reason.includes('sdd-spec-grants-bash'), true, 'names the real breakage');
  expect(result.reason.includes('review-contract-lazy-while-reviews-are-off'), false, 'omits the sync-safe one');
});

test('a sync-safe result beside a real unverifiable one -> refused as unverifiable', () => {
  const result = decide({ command: 'gentle-ai sync', toolName: BASH }, { checkDrift: () => ({ exitCode: 1, results: [...SYNC_SAFE_RESULTS, ...UNVERIFIABLE_RESULTS] }) });
  expect(result.decision, 'deny', 'decision');
  expect(result.reason.includes('could NOT VERIFY'), true, 'reason');
});

test('exit 1 that no result explains -> refused as a malfunction, never allowed', () => {
  const result = decide({ command: 'gentle-ai sync', toolName: BASH }, { checkDrift: () => ({ exitCode: 1, results: [{ id: 'x', status: 'held', detail: 'ok' }] }) });
  expect(result.decision, 'deny', 'decision');
  expect(result.reason.includes('every result held'), true, 'reason');
});

test('the check is consulted only when a real sync is present', () => {
  let calls = 0;
  const counting = () => ((calls += 1), DRIFT.broken());
  ['ls', 'gentle-ai sync --dry-run', 'echo gentle-ai sync'].forEach((command) => decide({ command, toolName: BASH }, { checkDrift: counting }));
  expect(calls, 0, 'calls without a real sync');
  decide({ command: 'gentle-ai sync', toolName: BASH }, { checkDrift: counting });
  expect(calls, 1, 'calls with a real sync');
});

test('no command string -> allow', () => expect(decide({ command: undefined, toolName: BASH }, { checkDrift: DRIFT.broken }).decision, 'allow', 'decision'));

// ------------------------------------------------ el CLI

const roots = [];
function scratch() {
  const root = mkdtempSync(path.join(tmpdir(), 'gentle-ai-sync-guard-selftest-'));
  roots.push(root);
  return root;
}

/** Un `check.mjs` falso que imprime el reporte dado y sale con el código dado. */
function fakeCheck(exitCode, results) {
  const file = path.join(scratch(), 'check.mjs');
  writeFileSync(file, `process.stdout.write(${JSON.stringify(JSON.stringify({ exitCode, results }))});\nprocess.exitCode = ${exitCode};\n`);
  return file;
}

const payload = (command, toolName = BASH) => JSON.stringify({ tool_name: toolName, tool_input: { command }, hook_event_name: 'PreToolUse' });
const runGuard = (input, args = [], guard = path.join(HERE, 'guard.mjs')) => spawnSync(process.execPath, [guard, ...args], { input, encoding: 'utf8' });

test('CLI: sync with broken overlay -> exit 0 and a valid deny naming the fix', () => {
  const result = runGuard(payload('cd x && gentle-ai sync'), ['--overlay-check', fakeCheck(1, BROKEN_RESULTS)]);
  expect(result.status, 0, 'exit');
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  expect(output.permissionDecision, 'deny', 'decision');
  expect(output.permissionDecisionReason.includes('apply.mjs'), true, 'reason');
});

test('CLI: PowerShell sync with unverifiable overlay -> deny', () => {
  const result = runGuard(payload('Set-Location x; gentle-ai sync', POWERSHELL), ['--overlay-check', fakeCheck(2, UNVERIFIABLE_RESULTS)]);
  expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny', 'decision');
});

test('CLI: sync while only the sync-safe lazy review contract is broken -> exit 0, silent (allowed)', () => {
  const result = runGuard(payload('gentle-ai sync'), ['--overlay-check', fakeCheck(1, SYNC_SAFE_RESULTS)]);
  expect(result.status, 0, 'exit');
  expect(result.stdout, '', 'stdout');
});

test('CLI: sync with clean overlay -> exit 0, silent', () => {
  const result = runGuard(payload('gentle-ai sync'), ['--overlay-check', fakeCheck(0, [])]);
  expect(result.status, 0, 'exit');
  expect(result.stdout, '', 'stdout');
});

test('CLI: missing check script -> deny (unverified is not safe), exit 0', () => {
  const result = runGuard(payload('gentle-ai sync'), ['--overlay-check', path.join(scratch(), 'absent-check.mjs')]);
  expect(result.status, 0, 'exit');
  expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny', 'decision');
});

test('check that never finishes -> failure saying it did not complete, never a verdict', () => {
  const hanging = path.join(scratch(), 'check.mjs');
  writeFileSync(hanging, 'setInterval(() => {}, 1000);\n');
  const result = runOverlayCheck(hanging, { timeoutMs: 500 });
  expect(typeof result.failure === 'string' && result.failure.includes('did not complete'), true, `failure (${JSON.stringify(result)})`);
});

test('CLI: BOM-prefixed payload is still read', () => {
  const result = runGuard(`\uFEFF${payload('gentle-ai sync')}`, ['--overlay-check', fakeCheck(1, BROKEN_RESULTS)]);
  expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny', 'decision');
});

test('CLI: malformed stdin -> exit 0 and says it malfunctioned', () => {
  const result = runGuard('{not json');
  expect(result.status, 0, 'exit');
  expect(JSON.parse(result.stdout).systemMessage.includes('malfunctioned'), true, 'systemMessage');
});

test('CLI: sibling modules missing -> exit 0 and says it malfunctioned', () => {
  const lonely = path.join(scratch(), 'guard.mjs');
  copyFileSync(path.join(HERE, 'guard.mjs'), lonely);
  const result = runGuard(payload('gentle-ai sync'), [], lonely);
  expect(result.status, 0, 'exit');
  expect(result.stdout.includes('malfunctioned'), true, 'stdout');
});

// ------------------------------------------------ ejecución

let failed = 0;
for (const { name, body } of cases) {
  try {
    body();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}
roots.forEach((root) => rmSync(root, { recursive: true, force: true }));
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exitCode = failed === 0 ? 0 : 1;
