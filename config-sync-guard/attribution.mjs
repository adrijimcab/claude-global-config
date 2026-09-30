/**
 * Which currently-LIVE agent, if any, owns a given dirty path — the DETERMINISTIC source the owner
 * asked for, revised THREE TIMES against real, measured false positives since this mechanism shipped
 * (never guessed from a title or a path convention).
 *
 * A SELF-CONTAINED, SIMPLIFIED REIMPLEMENTATION of the same measured LIVENESS approach as b100-am-ui's
 * own `.claude/agent-liveness/liveness.mjs`, not an import of it — this mechanism lives under
 * `~/.claude/` and must stay self-contained there, while `agent-liveness` is project-scoped.
 *
 * LIVENESS: the same measured window and reason as `agent-liveness` (`ACTIVE_WINDOW_MS`, 30 minutes) —
 * an agent writes on every tool ROUND, not continuously; liveness is the transcript's own mtime.
 *
 * ATTRIBUTION, REVISED TWICE THE DAY IT SHIPPED. The FIRST design read only `Edit`/`Write`/
 * `NotebookEdit` tool_use `file_path` values — exact-match only. Measured wrong the same day: `git
 * status --porcelain` collapses a wholly-untracked NEW directory into ONE entry (`?? dir/`, verified
 * against a real constructed repo), so this mechanism's OWN freshly-Written `config-sync-guard/`
 * tripped as unattributed — no single `file_path` exactly equals a directory path. A same-DIRECTORY
 * fallback was tried next and ALSO measured wrong within the hour: a real reported file
 * (`reap-delivered-worktree.mjs`) sat in a DIFFERENT immediate directory (`.claude/`) than the other
 * files the SAME live agent had actually Edited (`fleet-env/…`), so "same immediate parent directory"
 * still missed it, and a broader "anywhere under this directory tree" reading immediately produced a
 * cross-contamination in this module's OWN selftest fixtures (two independent, same-named test
 * directories quietly aliased to each other).
 *
 * THE SHAPE THAT MATCHED THE FIRST ROUND OF MEASURED EVIDENCE: the owner reported the correlating
 * signal directly — "244 mentions" of the tripped path in the owning agent's own transcript. So
 * attribution became: a dirty path (or, for a collapsed directory entry, the directory's own name) is
 * owned by a live agent when that agent's FULL transcript text contains it as a plain substring —
 * covering an `Edit`/`Write` call, a `Bash`/`PowerShell` command that names it, a generated file a
 * script produced, and prose describing the work, all in the ONE check.
 *
 * THE THIRD FAILURE, measured directly against a real, currently-dirty tree (never assumed): matching
 * only the dirty path's LAST SEGMENT collided constantly, because this fleet's own convention names
 * every guard mechanism's files identically (`guard.mjs`, `decide.mjs`, `selftest.mjs`, `mutants.mjs`)
 * — `backlog-guard/master-save.mjs` and every `ungated-landing-guard/*.mjs` path attributed to live
 * agents with no real connection to either, simply because THEIR OWN differently-purposed guards use
 * the same filenames. THE FIX, in `liveOwnerOf` below: the needle is the dirty path's WHOLE relative
 * path (every segment), not just its last one — `ungated-landing-guard/guard.mjs` as a compound string
 * is far less likely to appear by coincidence than `guard.mjs` alone.
 *
 * THE STATED LIMIT THAT REMAINS. A single-segment dirty path (a top-level file like `CLAUDE.md`, or a
 * git-collapsed directory entry with no further path context) still degrades to matching that one
 * generic segment alone, and COULD still be over-attributed by coincidence — this mechanism accepts
 * that narrower residual risk, and it fails toward BLOCKING (never silently excusing) whenever no live
 * agent's transcript mentions the path at all.
 *
 * @es Qué agente VIVO, si alguno, es dueño de una ruta sucia. Reimplementación PROPIA y simplificada de
 * la liveness ya medida de `agent-liveness/liveness.mjs`. La atribución se revisó TRES VECES contra
 * falsos positivos reales, medidos, nunca asumidos: coincidencia exacta de `file_path` falló porque git
 * colapsa un directorio nuevo sin trackear en UNA entrada; el mismo directorio inmediato también falló
 * porque un fichero real reportado estaba en un directorio DISTINTO; y comparar solo el ÚLTIMO segmento
 * de ruta chocaba constantemente porque esta flota nombra todo mecanismo igual (`guard.mjs`,
 * `decide.mjs`, `selftest.mjs`, `mutants.mjs`). ARREGLO: la aguja es la ruta relativa COMPLETA. LÍMITE
 * DECLARADO: una ruta de UN SOLO SEGMENTO (un fichero de nivel superior, o un directorio colapsado por
 * git) sigue degradando a ese único segmento genérico, y falla hacia BLOQUEAR cuando nada coincide.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** Same measured window as `agent-liveness/liveness.mjs`, same measured reason (see module docblock). @es Misma ventana medida, mismo motivo medido. */
export const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

/**
 * Every subagent record this harness has written, across all projects and sessions: `{ id, transcript
 * }`. `root` is injectable so a selftest can point it at a constructed fixture tree.
 * @es Cada registro de subagente que el harness ha escrito. `root` es inyectable.
 */
export function agentRecords(root = path.join(homedir(), '.claude', 'projects')) {
  const records = [];

  if (!existsSync(root)) return records;

  for (const project of readdirSync(root)) {
    const sessions = path.join(root, project);

    if (!statSync(sessions).isDirectory()) continue;

    for (const session of readdirSync(sessions)) {
      const dir = path.join(sessions, session, 'subagents');

      if (!existsSync(dir)) continue;

      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.meta.json')) continue;

        records.push({ id: file.slice(0, -'.meta.json'.length), transcript: path.join(dir, `${file.slice(0, -'.meta.json'.length)}.jsonl`) });
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
 * `Map<agentId, fullTranscriptText>` for every currently-LIVE agent. `records` and `now` are injectable
 * so a selftest never touches the real `~/.claude/projects` tree.
 * @es `Map<agentId, textoCompletoDelTranscript>` para cada agente VIVO. Inyectables.
 */
export function liveTranscriptTexts(now = Date.now(), records = agentRecords()) {
  const byAgent = new Map();

  for (const record of records) {
    if (!isLive(record, now)) continue;

    try {
      byAgent.set(record.id, readFileSync(record.transcript, 'utf8'));
    } catch {
      continue;
    }
  }

  return byAgent;
}

/** `value` with every trailing `/`/`\` removed, by plain character checks — no regex (M5). @es `value` sin separadores finales, por comprobación de caracteres — sin regex (M5). */
function withoutTrailingSeparators(value) {
  let end = value.length;

  while (end > 0 && (value[end - 1] === '/' || value[end - 1] === '\\')) end -= 1;

  return value.slice(0, end);
}

/**
 * `value` normalized to forward slashes with any trailing separator stripped — git's own reporting
 * convention (`git status --porcelain` always uses `/`, even on Windows).
 * @es `value` normalizado a `/`, sin separador final — la convención propia de git.
 */
function asRelativePath(value) {
  return withoutTrailingSeparators(String(value).replaceAll('\\', '/'));
}

/**
 * `value`'s forward-slash segments rejoined with `separator` — the THREE shapes a Windows path takes
 * across a raw transcript's byte layers: forward slashes (a Bash/PowerShell command may use them even
 * on Windows), a single backslash (plain prose describing a path), and a DOUBLE backslash (measured,
 * same reasoning as `master-save.mjs`'s own `ID_FIELD_MARKERS`: a JSON string value escapes each literal
 * backslash once, so a `file_path`'s separators appear DOUBLED in the raw bytes of a real
 * `tool_use.input` — this is the form a genuine `Edit`/`Write` call's own path takes).
 * @es Los segmentos de `value` reunidos con `separator` — las TRES formas de una ruta Windows en un
 * transcript crudo: `/`, `\` simple, y `\\` doble (una cadena JSON escapa cada `\` literal una vez).
 */
function withSeparator(value, separator) {
  return value.split('/').join(separator);
}

/**
 * The live agent id whose transcript mentions `dirtyPath` (its full relative path, in any of the three
 * separator shapes a raw transcript may hold — see `withSeparator`), or `undefined`. `liveTexts` is
 * injectable.
 * @es El id del agente vivo cuyo transcript menciona `dirtyPath` (su ruta relativa COMPLETA, en
 * cualquiera de las tres formas de separador), o `undefined`.
 */
export function liveOwnerOf(dirtyPath, liveTexts) {
  const forward = asRelativePath(dirtyPath).toLowerCase();

  if (forward.length === 0) return undefined;

  const needles = [forward, withSeparator(forward, '\\'), withSeparator(forward, '\\\\')];

  for (const [agentId, text] of liveTexts) {
    const haystack = text.toLowerCase();

    if (needles.some((needle) => haystack.includes(needle))) return agentId;
  }

  return undefined;
}
