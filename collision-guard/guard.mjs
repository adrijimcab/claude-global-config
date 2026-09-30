#!/usr/bin/env node
/**
 * `PreToolUse` on Bash and PowerShell — a conflict may not be resolved by taking one whole side while
 * the OTHER side holds content the merge base did not.
 *
 * This is the shim: stdin, a journal, and a refusal. `side-taking.mjs` says what the command asks for;
 * `conflict.mjs` asks the index what would be lost. The lesson is
 * `collision-fixed-by-deleting-unread-side`, whose measured cost was a hand-authored paragraph dropped
 * by a side-taking resolution while every gate stayed green — a gate compares what it was built to
 * compare, and the content a side-take loses is precisely the content no gate reads.
 *
 * WHAT IT DOES NOT DO, stated so nobody relies on it for more. It cannot see a resolution performed by
 * an editor, by `git checkout <branch> -- <path>`, or by writing the file by hand; and it cannot know
 * whether a union was constructed correctly. It closes ONE face of the lesson — the mechanical
 * side-take — and says so.
 *
 * FAILS OPEN on every malfunction of its own, and on every measurement it could not make.
 *
 * @es `PreToolUse` sobre Bash y PowerShell: no se resuelve un conflicto quedándose con un lado entero
 * mientras el OTRO tiene contenido que la base no tenía. Este fichero es el conducto; `side-taking.mjs`
 * dice qué pide el comando y `conflict.mjs` pregunta al índice qué se perdería. Cierra UNA cara de la
 * lección —la mecánica— y lo dice. Cualquier fallo propio o medición imposible DEJA PASAR.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { lossyResolutions } from './conflict.mjs';
import { sideTakings } from './side-taking.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REFUSALS = path.join(HERE, 'state', 'refusals.jsonl');

/** Where a malfunction of this guard is COUNTED, so failing open never means failing silently. @es Donde se CUENTA un fallo propio. */
export const ERRORS = path.join(HERE, 'state', 'guard-errors.jsonl');

/** Appends one record to a journal, or gives up: a journal is evidence, never a precondition. @es Añade un registro o desiste. */
function record(file, entry) {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
  } catch {
    /* a journal is evidence, never a precondition */
  }
}

/** Journals a refusal's payload verbatim, so a proof can replay real traffic. @es Registra el payload literal de cada negativa. */
function journal(raw) {
  record(REFUSALS, { raw });
}

/** The refusal text, naming every path that would lose content and how to read it first. @es La negativa, con cada ruta y cómo leerla antes. */
function reasonFor(take, lossy) {
  const kept = take.side;
  const dropped = kept === 'ours' ? 'theirs' : 'ours';

  return [
    `COLLISION GUARD REFUSED: \`${take.text}\` resolves ${String(lossy.length)} conflicted path(s) by keeping`,
    `${kept.toUpperCase()} and dropping content ${dropped.toUpperCase()} added, unread.`,
    '',
    ...lossy.map(({ path: file, reason }) => `  ${file}\n      ${reason}`),
    '',
    'WHY THIS IS REFUSED. Taking one whole side preserves only what somebody thinks to check',
    'afterwards. Measured on this repository: three `docs/SCRIPTS.md` conflicts resolved that way',
    'silently dropped a hand-authored paragraph salvaged hours earlier, leaving the row',
    'self-contradicting — and `check:script-docs` was green the whole time, because it compares',
    'commands and never reads prose. A side-take loses exactly the content no gate verifies.',
    '',
    'READ BOTH SIDES FIRST — each of these prints what the dropped side holds:',
    '',
    ...lossy.map(({ path: file, dropped: stage }) => `  git -C "${take.directory}" diff :1:${file} :${stage}:${file}`),
    '',
    'Then resolve it as a UNION you construct: write the file with both sides\' content and `git add`',
    'it. And when the dropped side really is redundant, SAY SO and write the kept side explicitly —',
    'which is the same result stated as a decision instead of as a default:',
    '',
    ...lossy.map(({ path: file }) => `  git -C "${take.directory}" show :${kept === 'ours' ? '2' : '3'}:${file} > "${file}" && git -C "${take.directory}" add "${file}"`),
    '',
    'Re-running the same side-take is NOT the way through: this guard refuses it every time, by design.'
  ].join('\n');
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el comando puede correr. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra dentro de su propio proceso.
 */
export function evaluate(raw) {
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  let reason;

  try {
    for (const take of sideTakings(payload?.tool_name, payload?.tool_input?.command, payload?.cwd ?? process.cwd())) {
      const lossy = lossyResolutions(take);

      if (lossy.length === 0) continue;

      reason = reasonFor(take, lossy);
      break;
    }
  } catch (error) {
    // DEGRADE OPEN, NEVER DEGRADE INVISIBLE (`measurement-failure-is-not-a-zero`, third face): the
    // command is allowed, because a malfunction here must never block work — but a malfunction that
    // leaves no trace is indistinguishable from a clean pass, and this guard's own proof asserts the
    // error log stays EMPTY, so a refusal that collapses into a crash cannot read as a decision.
    // @es DEGRADAR ABIERTO, NUNCA INVISIBLE: se deja pasar, pero se REGISTRA; la prueba de este guard
    // exige que el log de errores quede VACÍO, así que una negativa convertida en crash no pasa por
    // decisión.
    record(ERRORS, { error: error instanceof Error ? error.message : String(error), command: payload?.tool_input?.command });

    return undefined;
  }

  if (reason === undefined) return undefined;

  journal(raw);

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  const output = evaluate(raw);

  if (output === undefined) return;

  console.log(JSON.stringify(output));
}

// Only when RUN as the hook. Imported — which is how the proof reads the error-journal path from the
// one place that owns it, instead of repeating the literal and drifting from it — nothing reads stdin.
// @es Solo al EJECUTARSE como hook: importado (así la prueba lee la ruta del journal de su dueño) no
// toca stdin.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
