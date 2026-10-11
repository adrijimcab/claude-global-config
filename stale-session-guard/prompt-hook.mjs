#!/usr/bin/env node
/**
 * `UserPromptSubmit` hook: warns a session whose process predates a hook group registered later. Claude Code
 * snapshots the hook groups of settings at session start, so a group added afterwards is invisible to that
 * session until it restarts. The session's baseline (the groups registered at its first prompt, re-taken when
 * its process restarts) is compared with the groups registered now; the groups it lacks are injected as
 * `additionalContext`, once per distinct lack. It WARNS, it never blocks, and FAILS OPEN on any problem of its
 * own. Manifest edits are not a lack: the dispatcher reads its manifest on every call.
 *
 * @es Hook `UserPromptSubmit`: avisa a una sesión cuyo proceso es anterior a un grupo de hooks registrado
 * después. Claude Code congela los grupos de hooks al arrancar la sesión, así que uno agregado luego es
 * invisible hasta reiniciar. Se compara la línea base de la sesión (los grupos registrados en su primer prompt,
 * retomada al reiniciar su proceso) con los registrados ahora; los que le faltan se inyectan como
 * `additionalContext`, una vez por falta distinta. AVISA, nunca bloquea, y FALLA ABIERTO. Editar un manifiesto
 * no es una falta: el dispatcher lo lee en cada llamada.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { claudeHome } from '../hook-state/locations.mjs';
import { lackedGroups, lackFingerprint, processRestarted, shouldWarn } from './decide.mjs';
import { registeredGroups } from './hook-groups.mjs';
import { speaker } from './messages.mjs';
import { processStartMarker } from './process-start-marker.mjs';
import { isRecordableSession, readRecord, writeRecord } from './session-record.mjs';

const withoutBom = (raw) => (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

/** How one lacked group reads in the notice. @es Cómo se lee un grupo faltante en el aviso. */
function describeGroup(group) {
  const where = group.matcher === '' ? group.event : `${group.event}[${group.matcher}]`;
  const what = group.manifest === undefined ? group.command : `${group.manifest}${group.guards.length > 0 ? ` (${group.guards.join(', ')})` : ''}`;

  return `${where} -> ${what}`;
}

/** The hook output carrying the notice. @es La salida de hook con el aviso. */
const noticeOutput = (lacked) => ({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: speaker.line('stale-session', { count: lacked.length, groups: lacked.map(describeGroup).join('; ') })
  }
});

/**
 * The hook output for a raw UserPromptSubmit payload, or `undefined` for silence. `options.home` redirects the
 * Claude home (selftests); it defaults to the real one.
 * @es La salida de hook para un payload crudo, o `undefined` para silencio. `options.home` redirige el home.
 */
export function evaluate(raw, options = {}) {
  try {
    const payload = JSON.parse(withoutBom(raw));
    const sessionId = payload?.session_id;

    if (isSubagentCaller(payload) || typeof sessionId !== 'string' || !isRecordableSession(sessionId)) return undefined;

    const current = registeredGroups(options.home ?? claudeHome());

    if (current === undefined) return undefined;

    const marker = processStartMarker(payload.transcript_path);
    const record = readRecord(sessionId);

    if (record === undefined || processRestarted(record.marker, marker)) {
      writeRecord(sessionId, { baseline: [...current.keys()], marker: marker ?? null, warnedFor: null });

      return undefined;
    }

    const lacked = lackedGroups(record.baseline, current);

    if (!shouldWarn(lacked, record.warnedFor)) return undefined;

    writeRecord(sessionId, { ...record, marker: record.marker ?? marker ?? null, warnedFor: lackFingerprint(lacked) });

    return noticeOutput(lacked);
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
