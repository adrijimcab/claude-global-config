#!/usr/bin/env node
/**
 * `PreToolUse` on `Edit`, `Write` and `MultiEdit`, for EVERY repository on this machine — a value-level
 * TypeScript type assertion may never be ADDED by a write this harness performs.
 *
 * Owner, verbatim: «NO QUIERO QUE SE VUELVA A ESCRIBIR CODIGO ASÍ EN NINGUN REPO, Y QUIERO QUE LO CACE
 * ALGUN GATE». Real incidents this week: a library emitted through `value as B100InputValueOf<C>`; a
 * default of `input<C>({} as C)`; demo code "fixed" type errors with lying `as` casts. A separate worker
 * is adding the LINT layer inside b100-am-ui's own ESLint plugin — the human-and-CI net. This is the
 * OTHER net: it fires at authoring time, before any lint gate runs, and it covers every repo on this
 * machine, including the ones with no such lint yet (the discovery repos).
 *
 * THE DECISION (`assertion-diff.mjs`): REFUSE only when the edit would RAISE the file's value-level
 * assertion count — every `x as T`, `<T>x` and postfix `!`, never `as const` or `satisfies`
 * (`collect-assertions.mjs`). An edit that leaves an existing pile of assertions untouched is allowed;
 * one that moves or renames one without adding a net-new one is allowed; one that removes assertions is
 * always allowed. Detection is the TypeScript COMPILER API, never regex or substring scanning — a regex
 * that fails to match skips silently (project rule M5), and `import * as x` / `import { a as b }` share
 * the literal word "as" with a real assertion without sharing its meaning; the compiler API tells them
 * apart by NODE KIND, not by text.
 *
 * BEFORE/AFTER (`simulate-edit.mjs`) is reconstructed by simulating the same substitution the real tool
 * is about to perform, because this fires on `PreToolUse` — before the write happens.
 *
 * NO BYPASS FLAG, NO ALLOWLIST (`refusal-text.mjs`) — the owner rule
 * `failure-hidden-in-a-central-exception-registry`.
 *
 * FAILS OPEN on every malfunction of its own — a `typescript` package this guard cannot resolve for the
 * target repository (`resolve-typescript.mjs`), a file it cannot read, a payload whose `old_string`
 * disagrees with the disk — and NAMES the malfunction on stderr every time, because being unable to
 * verify is not the same as the code being clean, and this guard never lets the two look identical.
 *
 * @es `PreToolUse` sobre `Edit`, `Write` y `MultiEdit`, en TODO repositorio de esta máquina: una
 * aserción de tipo en tiempo de valor nunca puede ser AÑADIDA por una escritura de este harness.
 * Directiva del dueño: «no quiero que se vuelva a escribir código así en ningún repo, y quiero que lo
 * cace algún gate». LA DECISIÓN: rechazar solo cuando la edición SUBE el conteo de aserciones del
 * fichero; nunca `as const` ni `satisfies`. Detección con la API DEL COMPILADOR, nunca regex. FALLA
 * ABIERTO ante cualquier fallo propio, y lo NOMBRA en stderr siempre — no poder verificar no es lo mismo
 * que estar limpio.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { deny, hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { stateDir } from '../hook-state/locations.mjs';
import { unmatchedAfterAssertions, raisesAssertionCount } from './assertion-diff.mjs';
import { collectAssertions } from './collect-assertions.mjs';
import { refusalText } from './refusal-text.mjs';
import { resolveTypeScript } from './resolve-typescript.mjs';
import { simulateEdit } from './simulate-edit.mjs';

/** Where a malfunction of THIS guard is counted, so "failed open" never means "failed invisibly" — the
 * same property `collision-guard` proves for its own decision. @es Donde se cuenta un fallo propio. */
export const errorsFile = () => path.join(stateDir('type-assertion-guard'), 'guard-errors.jsonl');

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const GUARDED_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

/** Whether a path's extension is one this guard verifies. `.d.ts` ends in `.ts`, so it is included. */
function isTypeScriptFile(filePath) {
  return typeof filePath === 'string' && TS_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/**
 * A malfunction of THIS guard, never of the code it is checking. Always stderr, never stdout — stdout is
 * the hook decision itself, and the dispatcher treats anything printed there during `evaluate` as the
 * guard corrupting its own output. Bilingual, so it reads the same for the owner in either language.
 */
function reportMalfunction(message) {
  process.stderr.write(`[type-assertion-guard] ${message} — failing OPEN: unable to verify is not the same as clean.\n`);
  process.stderr.write(`[type-assertion-guard] @es ${message} — fallando ABIERTO: no poder verificar no es lo mismo que estar limpio.\n`);

  try {
    mkdirSync(path.dirname(errorsFile()), { recursive: true });
    appendFileSync(errorsFile(), `${JSON.stringify({ at: new Date().toISOString(), message })}\n`, 'utf8');
  } catch {
    // A journal is evidence, never a precondition: losing this line never blocks the fail-open path.
  }
}

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to allow the tool call. Exported so
 * `~/.claude/hook-dispatch/dispatch.mjs` can run it inside its own process, and so `guard.mjs` remains a
 * complete standalone hook when run directly.
 */
export function evaluate(raw) {
  const payload = tryParsePayload(raw);
  const toolName = payload?.tool_name;

  if (!GUARDED_TOOLS.has(toolName)) return undefined;

  const toolInput = payload?.tool_input;
  const filePathRaw = toolInput?.file_path;

  if (typeof filePathRaw !== 'string' || filePathRaw.length === 0 || !isTypeScriptFile(filePathRaw)) return undefined;

  const cwd = typeof payload?.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : process.cwd();
  const filePath = path.isAbsolute(filePathRaw) ? filePathRaw : path.resolve(cwd, filePathRaw);

  const simulated = simulateEdit(toolName, toolInput, filePath);

  if ('error' in simulated) {
    reportMalfunction(simulated.error);

    return undefined;
  }

  const resolved = resolveTypeScript(filePath);

  if ('error' in resolved) {
    reportMalfunction(`no TypeScript compiler could be resolved for ${filePath} (${resolved.error}); this guard could NOT check it for type assertions`);

    return undefined;
  }

  let beforeAssertions;
  let afterAssertions;

  try {
    beforeAssertions = collectAssertions(simulated.before, filePath, resolved.ts);
    afterAssertions = collectAssertions(simulated.after, filePath, resolved.ts);
  } catch (error) {
    reportMalfunction(`the TypeScript parser threw while checking ${filePath}: ${error instanceof Error ? error.message : String(error)}`);

    return undefined;
  }

  if (!raisesAssertionCount(beforeAssertions, afterAssertions)) return undefined;

  const newlyAdded = unmatchedAfterAssertions(beforeAssertions, afterAssertions);

  return deny(refusalText(filePath, newlyAdded, beforeAssertions.length, afterAssertions.length));
}

// Only when RUN as the hook — a module that EXPORTS runs no work when imported
// (`guard-that-cannot-go-red`): main() runs only when this file is the process entry point, never on
// import, so the dispatcher (and this guard's own selftest) can import `evaluate` freely without also
// triggering a stdin read.
// @es Solo al EJECUTARSE como hook: main() corre solo si este archivo es el punto de entrada, nunca al
// importarse.
runWhenMain(import.meta.url, hookMain(evaluate));
