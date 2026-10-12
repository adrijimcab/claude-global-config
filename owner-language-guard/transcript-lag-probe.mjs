/**
 * Probe hook: at PreToolUse copies the last transcript entries into PROBE_DIR, once at call time and once
 * LATE_MS later, so what the transcript holds when the hook runs can be compared with what lands right after.
 * Manual measurement tool, not a guard. Usage: a scratch project whose `.claude/settings.json` registers this file
 * as a PreToolUse hook, `PROBE_DIR=<dir>` set, and `claude -p --input-format stream-json --setting-sources project`
 * running a prompt that makes several Bash calls with a sentence before each; the capture of 2026-10-12 is in
 * `fixtures/pretool-lag-probe.jsonl`.
 *
 * @es Hook de sonda: al disparar PreToolUse copia las últimas entradas del transcript a PROBE_DIR, una vez al
 * llamar y otra LATE_MS después, para comparar lo que el transcript tiene cuando corre el hook con lo que
 * aparece enseguida. Herramienta de medición manual. Uso: un proyecto temporal cuyo `.claude/settings.json`
 * registra este fichero como hook PreToolUse, con `PROBE_DIR=<dir>`, y `claude -p --input-format stream-json
 * --setting-sources project` con un prompt de varias llamadas Bash con una frase antes de cada una; la captura
 * del 2026-10-12 está en `fixtures/pretool-lag-probe.jsonl`.
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const LATE_MS = 1500;
const dir = process.env.PROBE_DIR;
const payload = JSON.parse(readFileSync(0, 'utf8'));
const read = () => readFileSync(payload.transcript_path, 'utf8').split('\n').filter(Boolean);
const atCall = read();

const slim = (line) => {
  try {
    const entry = JSON.parse(line);
    const content = entry.message?.content;
    const describe = (block) => (block.type === 'text' ? `text:${block.text.slice(0, 120)}` : block.type === 'tool_use' ? `tool_use:${block.name}` : block.type);

    return {
      type: entry.type,
      isSidechain: entry.isSidechain,
      ts: entry.timestamp,
      attachment: entry.attachment?.type,
      content: typeof content === 'string' ? content.slice(0, 120) : Array.isArray(content) ? content.map(describe) : undefined
    };
  } catch {
    return { unparsable: true };
  }
};

await new Promise((resolve) => setTimeout(resolve, LATE_MS));

const late = read();

appendFileSync(
  path.join(dir, 'captures.jsonl'),
  `${JSON.stringify({ hookStartedAfterWrite: null, tool: payload.tool_name, toolUseId: payload.tool_use_id, entriesAtCall: atCall.length, entriesLate: late.length, tailAtCall: atCall.slice(-6).map(slim), tailLate: late.slice(-6).map(slim) })}\n`
);
writeFileSync(path.join(dir, `raw-${payload.tool_use_id ?? Date.now()}.jsonl`), atCall.slice(-6).join('\n'));
