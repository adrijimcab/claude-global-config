/**
 * The last record of a subagent transcript: its kind and, for a tool call, the tool name and command
 * (truncated), plus the write time. Only the TAIL is read, with a window that doubles up to a ceiling.
 * @es El último registro del transcript de un subagente: su tipo y, si es una llamada, la herramienta y el
 * comando (truncado), más la hora de escritura. Solo se lee la COLA, con una ventana que se duplica hasta
 * un techo.
 */

import { closeSync, fstatSync, openSync } from 'node:fs';

import { tailLines } from '../owner-language-guard/turn.mjs';

const INITIAL_WINDOW = 128 << 10;
const MAX_WINDOW = 8 << 20;
export const FIELD_LIMIT = 120;

const truncate = (value) => (value.length <= FIELD_LIMIT ? value : `${value.slice(0, FIELD_LIMIT)}…`);

/** The kind/tool/command of one transcript entry, or `undefined` when it is not a conversation record. @es Tipo/herramienta/comando de una entrada. */
export function describeEntry(entry) {
  if (entry?.type !== 'assistant' && entry?.type !== 'user') return undefined;

  const content = entry.message?.content;
  const block = Array.isArray(content) ? content.at(-1) : undefined;
  const input = block?.type === 'tool_use' ? (block.input ?? {}) : {};
  const detail = input.command ?? input.file_path ?? input.description ?? input.prompt ?? input.message;

  return {
    kind: `${entry.type}:${block?.type ?? (typeof content === 'string' ? 'text' : 'empty')}`,
    tool: block?.type === 'tool_use' ? block.name : undefined,
    command: typeof detail === 'string' ? truncate(detail) : undefined
  };
}

/** Last record of the transcript at `file` and its write time; throws when it cannot be read. @es Último registro y hora de escritura. */
export function lastRecord(file) {
  const descriptor = openSync(file, 'r');

  try {
    const { size, mtimeMs } = fstatSync(descriptor);

    for (let window = INITIAL_WINDOW; ; window *= 2) {
      for (const line of tailLines(descriptor, size, window).reverse()) {
        let entry;

        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        const described = describeEntry(entry);

        if (described !== undefined) return { ...described, mtimeMs };
      }

      if (window >= size || window >= MAX_WINDOW) return { kind: 'none', mtimeMs };
    }
  } finally {
    closeSync(descriptor);
  }
}
