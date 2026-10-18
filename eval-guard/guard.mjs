#!/usr/bin/env node
/**
 * `PreToolUse` hook on `Bash` / `PowerShell` — the ENFORCEMENT half of the eval guard.
 *
 * MECHANISM FOR the promoted lesson `shell-one-liner-corrupted-data` (text edits and code payloads
 * whose escapes the shell eats: node evaluate flags since 2026-09, and since 2026-10-04 the script
 * arguments of sed, sd, awk, gawk, perl, ruby, python and python3, refusal kind `text-edit`).
 * @es Mecanismo de la lección promovida `shell-one-liner-corrupted-data`.
 *
 * WHY A HOOK AND NOT PROSE. The remedy for this failure was, until now, a sentence in the two agent
 * contract files: "never build escapes or non-ASCII in a shell one-liner — write a `.mjs` file". That
 * is the ADVISORY mechanism, and this project's own first ledger entry (2026-06-16) says why it is the
 * wrong one: memory depends on recall, a hook does not. The same advisory material had already failed
 * six times for the M8 translation obligation. Prose stays — it explains — but the refusal is here.
 *
 * WHAT IT REFUSES, AND WHAT IT DELIBERATELY DOES NOT. Only the conjunction that was actually measured:
 * a node evaluate flag AND a payload carrying a backslash escape or a non-ASCII character. A plain
 * ASCII `node -e "console.log(1)"` is untouched. That narrowness is a design requirement rather than
 * timidity — a guard that fires on ordinary work gets routed around, and this repository already
 * learned what a routinely-bypassed gate is worth from `--no-verify`.
 *
 * FAIL OPEN, ALWAYS, ON ITS OWN FAILURE. Every malfunction of this file — unreadable stdin, a BOM, bad
 * JSON, an fs error, a detector throw — exits 0 and lets the command run. It blocks ONLY on a positive
 * detection. A guard able to wedge the fleet on its own bug is a larger hazard than the one it
 * prevents. It fails open LOUDLY though: the malfunction is appended where it can be counted, because
 * silence is exactly what let a sibling hook's BOM bug survive its own test run.
 *
 * @es Hook `PreToolUse` sobre `Bash`/`PowerShell` — la mitad de EJECUCIÓN del guard. La prosa del
 * contrato es el mecanismo ADVISORY que la primera entrada del ledger (2026-06-16) declara inadecuado:
 * la memoria depende del recuerdo, un hook no. Rechaza SOLO la conjunción medida: flag de evaluación
 * de node Y payload con escape o no-ASCII; un `node -e "console.log(1)"` ASCII pasa intacto. Esa
 * estrechez es requisito de diseño: un guard que salta en trabajo normal se esquiva, y aquí ya se
 * aprendió lo que vale un gate esquivado con `--no-verify`. FALLA ABIERTO siempre ante su propio
 * fallo — y en voz alta: el silencio es lo que dejó sobrevivir el bug del BOM de un hook hermano.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestInput } from '../hook-state/journal.mjs';
import { stateDir } from '../hook-state/locations.mjs';
import { inspectCommand } from './detect.mjs';

/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('eval-guard');
const BYTE_ORDER_MARK = 0xfe_ff;
const MAX_REPORTED_FINDINGS = 6;

/** Lets the command run. Every failure path in this file goes through here. @es Deja correr el comando. Todo camino de fallo pasa por aquí. */
function allow() {
  process.exit(0);
}

function record(file, entry) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(path.join(stateDirectory(), file), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* the journal is evidence, not a precondition: never let its failure change the decision */
  }
}

/** The refusal text. It must carry the whole escape route, or it becomes something to fight. @es El texto del rechazo debe llevar la salida entera, o se convierte en algo contra lo que pelear. */
/**
 * The MSYS-switch refusal. Kept separate from the payload one because the mechanism, the evidence and
 * the remedy are all different, and a refusal that describes the wrong failure teaches the reader to
 * distrust the guard — the same erosion a false warning causes in a gate.
 * @es Rechazo por switch de MSYS, separado del de payload: mecanismo, evidencia y remedio son otros, y
 * un rechazo que describe el fallo equivocado enseña a desconfiar del guard.
 */
function switchReason(refusal) {
  return [
    `EVAL-GUARD REFUSED this command: \`${refusal.program} ${refusal.payload}\` — MSYS rewrites that switch into a path, so it never reaches cmd.`,
    '',
    'What actually happens, measured. Git Bash translates a lone `/c` argument to `C:/`, so',
    '`cmd /c "rmdir /S /Q <dir>"` starts an INTERACTIVE cmd and the rmdir never runs. It exits 0.',
    'Two worktree teardowns were reported done on that exit code while the directories survived on',
    'disk, and the output redirect hid the Windows banner that would have revealed it. The command',
    'did not fail — it did not happen, which is strictly harder to notice.',
    '',
    'Fix it either way, both trivial:',
    '',
    `  cmd //c "${'<your command>'}"        # MSYS honours the doubled slash and passes /c through`,
    '  # or run it from the PowerShell tool, where no path translation exists at all',
    '',
    'And whatever you run: verify the EFFECT, not the return. A teardown is proven by testing that',
    'the path is gone, never by the exit code of the command meant to remove it.'
  ].join('\n');
}

/** Formats the findings of a refusal as offset and code point lines. @es Da formato de líneas con offset y code point a los hallazgos. */
function evidenceLines(refusal) {
  const evidence = refusal.findings
    .slice(0, MAX_REPORTED_FINDINGS)
    .map((finding) => `  - ${finding.kind} at offset ${finding.offset} (U+${finding.code.toString(16).toUpperCase().padStart(4, '0')})`)
    .join('\n');
  const more = refusal.findings.length > MAX_REPORTED_FINDINGS ? `\n  - ...and ${refusal.findings.length - MAX_REPORTED_FINDINGS} more` : '';

  return evidence + more;
}

/**
 * The text-edit refusal (sed, sd, awk, gawk, perl, ruby, python). The failure is silent by nature: the
 * shell re-parses the command, collapses or eats the escape, the edit matches nothing and the program
 * still exits 0, so only a later count reveals it. The remedy is the Edit tool or a `.mjs` file.
 * @es Rechazo de edición de texto. El fallo es silencioso: el shell re-parsea el comando, colapsa o se
 * come el escape, la edición no casa con nada y el programa sale con 0; solo un recuento posterior lo
 * delata. El remedio es la herramienta Edit o un fichero `.mjs`.
 */
/**
 * Where the refusal tells the caller to write its scaffold: under `<tmp>/claude/`, the only part of the shared TEMP
 * root a delegated agent may write (shared-temp-guard), with a name unique to this moment and process so two sessions
 * never collide on it.
 * @es Dónde la negativa le dice al llamador que escriba su andamio: bajo `<tmp>/claude/`, la única parte de la raíz
 * TEMP compartida que un agente delegado puede escribir (shared-temp-guard), con un nombre único por momento y proceso
 * para que dos sesiones nunca choquen en él.
 */
const scaffoldPath = (kind) => path.join(os.tmpdir(), 'claude', 'eval-guard', `${kind}-${Date.now()}-${process.pid}.mjs`);

function textEditReason(refusal) {
  const scaffold = scaffoldPath('edit');

  return [
    `EVAL-GUARD REFUSED this command: it runs \`${refusal.flag}\` with a pattern or script this harness was MEASURED to mangle.`,
    '@es EVAL-GUARD RECHAZÓ este comando: ejecuta `' + refusal.flag + '` con un patrón o script que este harness DESTROZA (medido).',
    '',
    'Found in the payload:',
    '@es Hallado en el payload:',
    evidenceLines(refusal),
    '',
    'Why. The shell re-parses the command before the program sees it, so it collapses or eats the escape:',
    'the pattern that arrives is not the one you wrote, matches nothing, and the program still exits 0.',
    'Nothing fails; the file is simply unchanged, and only a later count shows it (measured twice:',
    '2026-09-30 and 2026-10-04). Re-quoting does not help, no quoting choice is a defence.',
    '@es Por qué. El shell re-parsea el comando antes de que el programa lo vea y colapsa o se come el',
    '@es escape: el patrón que llega no es el escrito, no casa con nada y el programa sale con 0. Nada',
    '@es falla; el fichero queda igual y solo un recuento posterior lo delata. Re-entrecomillar no sirve.',
    '',
    'What works instead:',
    '@es Lo que sí funciona:',
    '  1. The Edit tool for the replacement itself (it never goes through a shell), or',
    `  2. a script file: Write tool -> ${scaffold}, then run: node "${scaffold}"`,
    '@es   1. La herramienta Edit para el reemplazo (no pasa por ningún shell), o',
    '@es   2. un fichero de script escrito con Write y ejecutado con node.',
    '',
    'The guard is narrow on purpose: it fires only on a backslash before \\ " $ ` or a newline, a trailing',
    'backslash, a raw control character, or a script whose own quoting does not cover it. A lone \\n,',
    'non-ASCII text and Windows paths are delivered intact and are never touched.',
    '@es El guard es estrecho a propósito: solo salta ante un backslash antes de \\ " $ ` o salto de línea,',
    '@es un backslash final, un carácter de control o un script cuyo entrecomillado no lo cubre.'
  ].join('\n');
}

function reason(refusal) {
  if (refusal.kind === 'msys-switch') return switchReason(refusal);
  if (refusal.kind === 'text-edit') return textEditReason(refusal);

  const scaffold = scaffoldPath('eval');
  const evidence = refusal.findings
    .slice(0, MAX_REPORTED_FINDINGS)
    .map((finding) => `  - ${finding.kind} at offset ${finding.offset} (U+${finding.code.toString(16).toUpperCase().padStart(4, '0')})`)
    .join('\n');
  const more = refusal.findings.length > MAX_REPORTED_FINDINGS ? `\n  - ...and ${refusal.findings.length - MAX_REPORTED_FINDINGS} more` : '';

  return [
    `EVAL-GUARD REFUSED this command: it runs node \`${refusal.flag}\` with a payload this harness was MEASURED to mangle.`,
    '',
    'Found in the payload:',
    evidence + more,
    '',
    'Why this is refused and not merely discouraged. `node -e "…\'\\\\b\'…"` reached JS as a literal',
    'BACKSPACE, not a word boundary, and two symbol scripts consequently reported "58 symbols missing',
    'from develop" when the truth was 0 — one trusting read from a catastrophic false loss. A one-liner',
    'authoring French text lost every apostrophe. A loop truncated a whole-repo blob. Each was caught',
    'because the RESULT looked implausible — by luck, never by a mechanism. This is the mechanism.',
    '',
    'RE-QUOTING WILL NOT HELP, and this is measured, not assumed: `\'a\\\\nb\'` in SINGLE quotes still',
    'arrived as one backslash, so a further shell layer re-parses the command and no quoting choice is a',
    'defence. Do not try to escape your way past this. Put the code in a file:',
    '',
    `  1. Write tool -> ${scaffold}`,
    '     (paste the JS there verbatim, unescaped — the Write tool never goes through a shell)',
    `  2. node "${scaffold}"`,
    '',
    'The guard is deliberately narrow, so a refusal means something. It fires only on a node evaluate',
    'flag AND a payload the shell provably eats: a backslash before \\ " $ ` or a newline, a trailing',
    'backslash, a raw control character, or a payload whose own quoting does not cover it. Measured as',
    'INTACT and therefore never touched: a lone \\n or \\t, non-ASCII text, and Windows paths.',
  ].join('\n');
}

/** La decisión sobre un payload ya parseado: la salida de hook, o `undefined` si el comando corre. */
function decideFor(payload) {
  const toolInput = payload?.tool_input;
  const command = typeof toolInput?.command === 'string' ? toolInput.command : undefined;

  if (command === undefined) return undefined;

  const refusal = inspectCommand(command, { toolName: payload?.tool_name });

  if (refusal === undefined) return undefined;

  record('denials.jsonl', {
    at: new Date().toISOString(),
    session: typeof payload?.session_id === 'string' ? payload.session_id : undefined,
    tool: typeof payload?.tool_name === 'string' ? payload.tool_name : undefined,
    flag: refusal.flag,
    findings: refusal.findings.slice(0, MAX_REPORTED_FINDINGS),
    // The command text is never journaled, only its sha256 (the block-journal policy).
    // @es El texto del comando nunca se registra, solo su sha256 (la política del block-journal).
    commandDigest: digestInput(command),
  });

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason(refusal),
    },
  };
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el comando corre. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra dentro de su propio proceso. Un payload ilegible deja
 * pasar el comando, pero queda en `guard-errors.jsonl`: fallar abierto, nunca fallar invisible.
 */
export function evaluate(raw) {
  try {
    // PowerShell 5.1 prepends a UTF-8 BOM (U+FEFF) when it pipes a string into a native process and
    // `JSON.parse` rejects it. That was measured on a sibling hook here, where the throw was swallowed
    // and the guard silently stopped guarding. Decoding a BOM-prefixed UTF-8 stream is the reader's
    // job — this is the root fix, not a tolerance.
    // @es PowerShell 5.1 antepone un BOM UTF-8 al canalizar hacia un proceso nativo y `JSON.parse` lo
    // rechaza. Medido en un hook hermano, donde el throw se tragó y el guard dejó de guardar en
    // silencio. Decodificar un stream UTF-8 con BOM es tarea del lector: esto es el arreglo de raíz.
    return decideFor(JSON.parse(raw.charCodeAt(0) === BYTE_ORDER_MARK ? raw.slice(1) : raw));
  } catch (error) {
    record('guard-errors.jsonl', {
      at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      rawLength: raw.length,
      firstCharCode: raw.length > 0 ? raw.charCodeAt(0) : undefined,
    });

    return undefined;
  }
}

function main() {
  let raw = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('error', allow);
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', () => {
    const output = evaluate(raw);

    if (output !== undefined) process.stdout.write(JSON.stringify(output));
    allow();
  });
}

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre:
// leería el stdin del importador y lo cortaría con process.exit(0) a mitad de camino.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
