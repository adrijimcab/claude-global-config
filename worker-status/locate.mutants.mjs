#!/usr/bin/env node
/**
 * Mutant campaign of `locate.mjs` and `transcript.mjs`: each mutant reverts ONE decision and
 * `locate.selftest.mjs` must go red by assertion. Exit 2 = NOT MEASURED (no shared runner).
 * @es Campaña de mutantes de `locate.mjs` y `transcript.mjs`: cada mutante revierte UNA decisión y el
 * selftest debe ponerse en rojo por aserción. Salida 2 = NO MEDIDO.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = path.resolve(import.meta.dirname, '..', 'mutation-proof', 'run-mutants.mjs');
const W = 'worker-status';

const MUTANTS = [
  // locate.mjs
  ['the agent- prefix is not added', `${W}/locate.mjs`, "id.startsWith('agent-') ? id : `agent-${id}`", 'id'],
  ['the project filter is ignored', `${W}/locate.mjs`, 'record.id === wanted && (projectDir === undefined || record.project === path.basename(projectDir))', 'record.id === wanted'],
  ['the project root is not the parent dir', `${W}/locate.mjs`, 'path.dirname(projectDir)', 'projectDir'],
  ['injected records are ignored', `${W}/locate.mjs`, 'records ?? agentRecords(', 'agentRecords('],
  ['the brief wins over the harness path', `${W}/locate.mjs`, "if (record.worktreePath !== '') return record.worktreePath;", ''],
  ['TENANCY needs no colon', `${W}/locate.mjs`, "if (!rest.startsWith(':')) continue;", ''],
  ['any line is a TENANCY line', `${W}/locate.mjs`, "const rest = at === -1 ? '' : line.slice(at + 'TENANCY'.length).trimStart();", 'const rest = `: ${line}`;'],
  ['relative tokens count as paths', `${W}/locate.mjs`, "token.startsWith('/') || (", 'true || ('],
  ['POSIX paths are not absolute', `${W}/locate.mjs`, "token.startsWith('/') || (", 'false || ('],
  ['wrappers are kept on the left', `${W}/locate.mjs`, 'while (start < end && WRAPPERS.includes(token.charAt(start))) start += 1;', ''],
  ['wrappers are kept on the right', `${W}/locate.mjs`, 'while (end > start && WRAPPERS.includes(token.charAt(end - 1))) end -= 1;', ''],

  // transcript.mjs
  ['bookkeeping entries are records', `${W}/transcript.mjs`, "if (entry?.type !== 'assistant' && entry?.type !== 'user') return undefined;", ''],
  ['the tool name is dropped', `${W}/transcript.mjs`, "tool: block?.type === 'tool_use' ? block.name : undefined,", 'tool: undefined,'],
  ['file_path is not a detail', `${W}/transcript.mjs`, 'input.command ?? input.file_path ?? ', 'input.command ?? '],
  ['commands are never truncated', `${W}/transcript.mjs`, 'value.length <= FIELD_LIMIT ? value :', 'true ? value :'],
  ['truncation drops the ellipsis', `${W}/transcript.mjs`, '${value.slice(0, FIELD_LIMIT)}…', '${value.slice(0, FIELD_LIMIT)}'],
  ['non-string details are shown', `${W}/transcript.mjs`, "typeof detail === 'string' ? truncate(detail) : undefined", 'detail'],
  ['string prompts are not text', `${W}/transcript.mjs`, "(typeof content === 'string' ? 'text' : 'empty')", "'empty'"],
  ['the oldest line is read first', `${W}/transcript.mjs`, 'tailLines(descriptor, size, window).reverse()', 'tailLines(descriptor, size, window)'],
  ['broken lines abort the search', `${W}/transcript.mjs`, '        } catch {\n          continue;\n        }', '        } catch {\n          return { kind: "none", mtimeMs };\n        }'],
  ['the window stops at the first read', `${W}/transcript.mjs`, 'if (window >= size || window >= MAX_WINDOW) return', 'if (true) return'],
  ['mtime is not reported', `${W}/transcript.mjs`, 'return { ...described, mtimeMs };', 'return { ...described, mtimeMs: 0 };']
];

if (!existsSync(RUNNER)) {
  console.error(`NOT MEASURED — shared runner missing at ${RUNNER}. @es NO MEDIDO — falta el runner compartido en ${RUNNER}.`);
  process.exit(2);
}

const { runMutants } = await import(pathToFileURL(RUNNER).href);

const survivors = runMutants({
  fleetRoot: path.resolve(import.meta.dirname, '..'),
  paths: [W, 'agent-liveness', 'brief-tenancy', 'owner-language-guard', 'bilingual-output', 'hook-state', 'hook-caller'],
  selftest: `${W}/locate.selftest.mjs`,
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 120_000
});

process.exit(survivors === 0 ? 0 : 1);
