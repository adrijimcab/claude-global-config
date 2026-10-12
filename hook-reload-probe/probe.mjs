/**
 * Live probe: does a running Claude Code session pick up changes made mid-session to its settings hook groups
 * and to its CLAUDE.md / rules text? One long-lived headless session (stream-json) takes three turns; between
 * turns this script ADDS, EDITS and REMOVES hook groups of four events and rewrites CLAUDE.md and a rules file,
 * waits a few seconds, and the recorder hook logs which groups fired on each turn. It needs a logged-in `claude`
 * and spends a few model turns, so it is a manual measurement, not a selftest. The captured output of the run
 * that settled the stale-session question (Claude Code 2.1.296, 2026-10-12) is in `fixtures/`.
 * Usage: `node hook-reload-probe/probe.mjs <scratch-dir>` (the directory is created and overwritten).
 *
 * Decision (2026-10-12): the run showed every settings hook change live on the next turn, for UserPromptSubmit,
 * Stop, PreToolUse and SubagentStart, whether a group was added, edited or removed; CLAUDE.md and rules text was
 * NOT re-read. The former `stale-session-guard` warned that groups registered after the session started do not
 * run there, a premise taken from reading the dispatcher and never probed; it was false, so the guard was
 * removed with its registration, state row and selftests. Only memory text is stale in a running session.
 *
 * @es Sonda en vivo: ¿una sesión de Claude Code en marcha toma los cambios hechos a mitad de sesión en sus
 * grupos de hooks de settings y en el texto de CLAUDE.md / rules? Una sesión headless larga (stream-json) toma
 * tres turnos; entre turnos este script AGREGA, EDITA y QUITA grupos de hooks de cuatro eventos y reescribe
 * CLAUDE.md y un fichero de rules, espera unos segundos, y el hook registrador anota qué grupos dispararon en
 * cada turno. Necesita un `claude` con sesión iniciada y gasta unos turnos de modelo, así que es una medición
 * manual, no un selftest. La salida capturada de la corrida que resolvió la duda de sesión desactualizada
 * (Claude Code 2.1.296, 2026-10-12) está en `fixtures/`.
 * Uso: `node hook-reload-probe/probe.mjs <directorio-temporal>` (se crea y se sobrescribe).
 *
 * @es Decisión (2026-10-12): la corrida mostró todo cambio de hooks de settings activo en el turno siguiente,
 * para UserPromptSubmit, Stop, PreToolUse y SubagentStart, ya sea que el grupo se agregue, se edite o se quite;
 * el texto de CLAUDE.md y de rules NO se releyó. El antiguo `stale-session-guard` avisaba que los grupos
 * registrados después de arrancar la sesión no corren en ella, una premisa tomada de leer el dispatcher y
 * nunca sondeada; era falsa, así que se quitó la guardia con su registro, su fila de estado y sus selftests.
 * Solo el texto de memoria queda desactualizado en una sesión en marcha.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scratch = process.argv[2];

if (scratch === undefined) {
  console.error('Usage: node hook-reload-probe/probe.mjs <scratch-dir>. @es Uso: node hook-reload-probe/probe.mjs <directorio-temporal>.');
  process.exit(2);
}

const recorder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'recorder.mjs').replaceAll(path.sep, '/');
const project = path.resolve(scratch, 'proj');
const settingsFile = path.join(project, '.claude', 'settings.json');
const claudeMd = path.join(project, 'CLAUDE.md');
const ruleFile = path.join(project, '.claude', 'rules', 'r.md');
const logFile = path.resolve(scratch, 'fired.log');
const SETTLE_MS = 4000;

const group = (tag, matcher) => ({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: `node "${recorder}" ${tag}` }] });
const writeHooks = (hooks) => writeFileSync(settingsFile, JSON.stringify({ hooks }, null, 2));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mark = (label) => writeFileSync(logFile, `${existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''}=== ${label}\n`);

mkdirSync(path.dirname(ruleFile), { recursive: true });
rmSync(logFile, { force: true });
writeFileSync(claudeMd, 'The project codeword is ALPHA1.\n');
writeFileSync(ruleFile, 'The rule codeword is RULEONE.\n');
writeHooks({ UserPromptSubmit: [group('UPS-orig')], Stop: [group('STOP-orig')], PreToolUse: [group('PRE-orig', 'Bash')] });

const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--setting-sources', 'project', '--model', 'haiku', '--dangerously-skip-permissions'];
const child = spawn('claude', args, { cwd: project, shell: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PROBE_LOG: logFile } });
let buffer = '';
let waiter;

child.stdout.on('data', (chunk) => {
  buffer += chunk;

  for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
    const line = buffer.slice(0, end);

    buffer = buffer.slice(end + 1);

    try {
      const event = JSON.parse(line);

      if (event.type === 'result' && waiter !== undefined) {
        const resolve = waiter;

        waiter = undefined;
        resolve(event);
      }
    } catch {
      // A non-JSON line is not a result. @es Una línea no JSON no es un resultado.
    }
  }
});

const turn = (text) => new Promise((resolve) => {
  waiter = resolve;
  child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`);
});

mark('T1 baseline');
console.log('T1:', (await turn('Use the Bash tool to run: echo one. Then also tell me, verbatim, the project codeword and the rule codeword from your instructions.')).result);

// Change 1: add groups of four events, edit one command, remove the original Stop group, rewrite the memory text.
// @es Cambio 1: agregar grupos de cuatro eventos, editar un comando, quitar el grupo Stop original, reescribir el texto de memoria.
writeHooks({
  UserPromptSubmit: [group('UPS-orig-EDITED'), group('UPS-added')],
  Stop: [group('STOP-added')],
  PreToolUse: [group('PRE-orig', 'Bash'), group('PRE-added', 'Bash')],
  SubagentStart: [group('SUBSTART-added')]
});
writeFileSync(claudeMd, 'The project codeword is BETA2.\n');
writeFileSync(ruleFile, 'The rule codeword is RULETWO.\n');
await pause(SETTLE_MS);
mark('T2 after add/edit/remove');
console.log('T2:', (await turn('Use the Bash tool to run: echo two. Then launch one Agent (subagent_type general-purpose) with prompt "reply ok". Then tell me, verbatim, the project codeword and the rule codeword from your instructions as you see them now.')).result);

// Change 2: remove two groups and change nothing else. @es Cambio 2: quitar dos grupos y nada más.
writeHooks({ UserPromptSubmit: [group('UPS-orig-EDITED')], Stop: [group('STOP-added')], PreToolUse: [group('PRE-orig', 'Bash')], SubagentStart: [group('SUBSTART-added')] });
await pause(SETTLE_MS);
mark('T3 after removing UPS-added and PRE-added');
console.log('T3:', (await turn('Use the Bash tool to run: echo three. Reply done.')).result);

child.stdin.end();
await pause(1500);
child.kill();
console.log(readFileSync(logFile, 'utf8'));
