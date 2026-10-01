/**
 * Which currently-LIVE agents WROTE a given path — the DETERMINISTIC source the owner asked for, never
 * guessed from a title, a path convention or a mention.
 *
 * A SELF-CONTAINED, SIMPLIFIED REIMPLEMENTATION of the same measured LIVENESS approach as b100-am-ui's
 * `.claude/agent-liveness/liveness.mjs` (this mechanism lives under `~/.claude/` and stays self-contained
 * there): an agent writes on every tool ROUND, so liveness is the transcript's own mtime within
 * `ACTIVE_WINDOW_MS` (30 minutes).
 *
 * ATTRIBUTION, REVISED FOUR TIMES AGAINST MEASURED FALSE POSITIVES. Exact `file_path` equality missed a
 * wholly-new directory (git collapses it into ONE `?? dir/` entry); the same immediate directory missed a
 * file in a different directory; the last path segment collided across this fleet's identically named
 * `guard.mjs`/`decide.mjs`/`selftest.mjs`; and a plain substring over the whole transcript excused ANY
 * path a live transcript merely mentioned — 8 of 8 live transcripts mentioned `lessons-ledger.md`
 * (measured 2026-10-01). NOW: a path is attributed only to a live agent that WROTE it (`transcript-writes.mjs`),
 * matched by its WHOLE relative path at a directory boundary. THE STATED LIMIT: a single-segment path
 * (`CLAUDE.md`) matches that file name in any directory the agent wrote. A path changed by a shell
 * command is attributed by TIME instead (`shell-windows.mjs`, `path-ownership.mjs`).
 *
 * A live transcript belongs to the SESSION whose directory holds it (`projects/<project>/<session>/
 * subagents/` for a subagent, `projects/<project>/<session>.jsonl` for the session itself), which is how
 * an unpushed commit or a dirty path is told to be another session's work.
 *
 * @es Qué agentes VIVOS ESCRIBIERON una ruta: la fuente DETERMINISTA, nunca un título, una convención ni
 * una mención. Liveness = mtime del transcript dentro de 30 minutos. La atribución se revisó CUATRO veces
 * contra falsos positivos medidos; la última: una subcadena sobre todo el transcript excusaba cualquier
 * ruta que un transcript vivo solo MENCIONARA (8 de 8 mencionaban `lessons-ledger.md`, medido el
 * 2026-10-01). AHORA: una ruta se atribuye solo a un agente vivo que la ESCRIBIÓ (`transcript-writes.mjs`),
 * por su ruta relativa COMPLETA en frontera de directorio. LÍMITE DECLARADO: una ruta de un solo segmento
 * casa con ese nombre en cualquier directorio escrito. Una ruta cambiada por shell se atribuye por HORA
 * (`shell-windows.mjs`, `path-ownership.mjs`). Un transcript vivo pertenece a la SESIÓN cuyo directorio lo
 * guarda (subagente: `<sesión>/subagents/`; la propia sesión: `<sesión>.jsonl`).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { shellWindowsIn } from './shell-windows.mjs';
import { normalizedPath, writtenPathsIn } from './transcript-writes.mjs';

/** Same measured window as `agent-liveness/liveness.mjs`, same measured reason (see module docblock). @es Misma ventana medida, mismo motivo medido. */
export const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

/**
 * Every transcript this harness has written, across all projects and sessions: `{ id, session, subagent,
 * transcript }` — a subagent's (`projects/<project>/<session>/subagents/`) and a session's own main one
 * (`projects/<project>/<session>.jsonl`, `id` `main-<session>`). `root` is injectable so a selftest can
 * point it at a constructed fixture tree.
 * @es Cada transcript que el harness ha escrito: de subagente y principal de cada sesión. `root` es inyectable.
 */
export function agentRecords(root = path.join(homedir(), '.claude', 'projects')) {
  const records = [];

  if (!existsSync(root)) return records;

  for (const project of readdirSync(root)) {
    const sessions = path.join(root, project);

    if (!statSync(sessions).isDirectory()) continue;

    for (const session of readdirSync(sessions)) {
      if (session.endsWith('.jsonl')) {
        const own = session.slice(0, -'.jsonl'.length);

        records.push({ id: `main-${own}`, session: own, subagent: false, transcript: path.join(sessions, session) });
        continue;
      }

      const dir = path.join(sessions, session, 'subagents');

      if (!existsSync(dir)) continue;

      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.meta.json')) continue;

        const id = file.slice(0, -'.meta.json'.length);

        records.push({ id, session, subagent: true, transcript: path.join(dir, `${id}.jsonl`) });
      }
    }
  }

  return records;
}

/** Whether `record`'s transcript was written to within `ACTIVE_WINDOW_MS` of `now`. @es Si el transcript de `record` se escribió dentro de la ventana activa. */
export function isLive(record, now = Date.now()) {
  try {
    return now - statSync(record.transcript).mtimeMs < ACTIVE_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * `Map<id, { session, subagent, writes, windows }>` for every currently-LIVE transcript, `writes` being
 * what it wrote through structured calls and `windows` its shell calls (`shell-windows.mjs`). `records`
 * and `now` are injectable so a selftest never touches the real `~/.claude/projects`.
 * @es `Map<id, { session, subagent, writes, windows }>` para cada transcript VIVO. Inyectables.
 */
export function liveAgentWrites(now = Date.now(), records = agentRecords()) {
  const byAgent = new Map();

  for (const record of records) {
    if (!isLive(record, now)) continue;

    try {
      const text = readFileSync(record.transcript, 'utf8');

      byAgent.set(record.id, { session: record.session, subagent: record.subagent, writes: writtenPathsIn(text), windows: shellWindowsIn(text, now) });
    } catch {
      continue;
    }
  }

  return byAgent;
}

/** `value` without trailing `/` or `\`, by plain character checks — no regex (M5). @es `value` sin separadores finales, sin regex (M5). */
function withoutTrailingSeparators(value) {
  let end = value.length;

  while (end > 0 && (value[end - 1] === '/' || value[end - 1] === '\\')) end -= 1;

  return value.slice(0, end);
}

/** Whether the normalized `written` path is `needle` or sits at a directory boundary around it. @es Si `written` es `needle` o lo contiene en frontera de directorio. */
function writtenMatches(written, needle) {
  return written === needle || written.endsWith(`/${needle}`) || written.includes(`/${needle}/`);
}

/**
 * The live agents that WROTE `dirtyPath` (a path relative to its repo, or a collapsed directory), as
 * `[{ id, session, subagent }]`. An empty or all-separator path matches nothing, because `writtenMatches`
 * only accepts whole path segments (`''.includes('')` would match every string).
 * @es Los agentes vivos que ESCRIBIERON `dirtyPath`, como `[{ id, session, subagent }]`. Una ruta vacía no
 * casa con nada: `writtenMatches` solo acepta segmentos de ruta completos.
 */
export function writersOf(dirtyPath, liveAgents) {
  const needle = withoutTrailingSeparators(normalizedPath(dirtyPath));

  return [...liveAgents].filter(([, agent]) => agent.writes.some((written) => writtenMatches(written, needle))).map(([id, agent]) => ({ id, session: agent.session, subagent: agent.subagent }));
}

/** The id of a live agent that wrote `dirtyPath`, or `undefined`. @es El id de un agente vivo que escribió `dirtyPath`, o `undefined`. */
export function liveOwnerOf(dirtyPath, liveAgents) {
  return writersOf(dirtyPath, liveAgents)[0]?.id;
}
