#!/usr/bin/env node
/**
 * `PreToolUse` guard: refuses a tool call when the assistant text written just before it, addressed to the
 * owner, is English prose. Thin shell over the one classifier (`decide.mjs#englishParagraphs`); the text
 * comes from `interstitial.mjs`. Main session only: a subagent's calls are never judged. The tool call's
 * own payload is never read (it is data for another agent). FAILS OPEN on any problem of its own.
 *
 * @es Guardia `PreToolUse`: rechaza la llamada cuando el texto escrito justo antes, dirigido al dueño, es
 * prosa en inglés. Usa el único clasificador (`decide.mjs`). Solo sesión principal; el payload de la
 * llamada nunca se lee. FALLA ABIERTO ante cualquier fallo propio.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { englishParagraphs } from './decide.mjs';
import { readInterstitialTexts } from './interstitial.mjs';
import { speaker } from './pretool-messages.mjs';

const withoutBom = (raw) => (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

/**
 * The hook output for a raw PreToolUse payload, or `undefined` to allow. `readTexts` is injectable.
 * @es La salida de hook para un payload crudo, o `undefined` para permitir.
 */
export function evaluate(raw, readTexts = readInterstitialTexts) {
  try {
    const payload = JSON.parse(withoutBom(raw));
    const transcript = payload?.transcript_path;

    if (isSubagentCaller(payload) || typeof transcript !== 'string' || transcript.length === 0) return undefined;

    const [first] = englishParagraphs(readTexts(transcript));

    if (first === undefined) return undefined;

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: speaker.line('english-before-tool', { excerpt: first.excerpt })
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
