#!/usr/bin/env node
/**
 * `UserPromptSubmit` hook: warns a session whose project declares an integration branch (`declaration.mjs`)
 * while the clone's `origin/HEAD` points at another one, naming the exact `sync.mjs` command that fixes it
 * (or, when the clone lacks the remote-tracking ref, the fetch or push the owner must decide). It WARNS, it
 * never blocks, and it FAILS OPEN on any problem of its own: an unreadable declaration is the landing's
 * refusal to make, not a reason to fail a prompt. It keeps no state: the warning repeats on every prompt
 * while the drift lasts, so a session that compacted or lost the first notice is never left blind.
 *
 * @es Hook `UserPromptSubmit`: avisa a una sesión cuyo proyecto declara una rama de integración
 * (`declaration.mjs`) mientras el `origin/HEAD` del clon apunta a otra, nombrando el comando exacto de
 * `sync.mjs` que lo arregla (o, si al clon le falta la referencia de seguimiento, el fetch o push que debe
 * decidir el dueño). AVISA, nunca bloquea y FALLA ABIERTO ante cualquier problema propio: una declaración
 * ilegible es un rechazo que corresponde al aterrizaje, no un motivo para fallar un prompt. No guarda estado:
 * el aviso se repite en cada prompt mientras dure la deriva, así una sesión que compactó o perdió el primer
 * aviso nunca queda a ciegas.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { speaker } from './messages.mjs';
import { originHeadState } from './origin-head-state.mjs';

const SYNC_COMMAND = path.join(import.meta.dirname, 'sync.mjs');
const withoutBom = (raw) => (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
/** The notice each drifted verdict gets; a verdict with none (in sync, ungoverned, no repository) is silence. @es El aviso de cada veredicto con deriva; un veredicto sin aviso (sincronizado, sin gobierno, sin repositorio) es silencio. */
const NOTICE_BY_VERDICT = { set: 'drift-set', 'missing-remote-ref': 'drift-missing-ref' };

/**
 * The hook output for a raw UserPromptSubmit payload, or `undefined` for silence.
 * @es La salida de hook para un payload crudo de UserPromptSubmit, o `undefined` para silencio.
 */
export function evaluate(raw) {
  try {
    const payload = JSON.parse(withoutBom(raw));

    if (isSubagentCaller(payload)) return undefined;

    const state = originHeadState(payload.cwd);
    const notice = NOTICE_BY_VERDICT[state?.verdict];

    if (notice === undefined) return undefined;

    const { main, want, source } = state;
    const current = state.current ?? '(unset @es sin fijar)';

    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: speaker.line(notice, { main, want, source, current, sync: SYNC_COMMAND })
      }
    };
  } catch {
    return undefined;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  let output;

  try {
    output = evaluate(readFileSync(0, 'utf8'));
  } catch {
    output = undefined;
  }

  if (output !== undefined) process.stdout.write(JSON.stringify(output));
  process.exitCode = 0;
}
