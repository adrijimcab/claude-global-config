#!/usr/bin/env node
/**
 * Stop hook — claim guard.
 *
 * Blocks the end of a turn when the assistant's final message states an ABSOLUTE or NEGATIVE claim
 * about the system ("there is no X", "nothing would have caught it", "never", "impossible") without
 * shipping any evidence in that same message.
 *
 * That is the exact defect class this guards: on 2026-07-14 two such claims were asserted minutes
 * apart from memory alone, and both were refuted by a single grep.
 *
 * Contract (verified against the official hooks reference, not assumed):
 *   - stdin  : JSON with `last_assistant_message` and `stop_hook_active`.
 *   - stdout : exit 0 + {"decision":"block", ...} blocks the turn; anything else lets it end.
 *   - `stop_hook_active` is true once this hook has already blocked, so the guard fires AT MOST once
 *     per turn — it forces one verification pass, it can never loop.
 *
 * Deliberate limitation, stated rather than hidden: a command hook pattern-matches, it cannot judge
 * truth. It is a tripwire on the highest-risk phrasing, not an oracle. The semantic obligation lives
 * in ~/.claude/verification-contract.md, loaded in every project by ~/.claude/rules/10-contracts.md.
 */

const HIGH_RISK = [
  // Spanish — claims of non-existence / absolutes about the system
  /\bno\s+(existe|hay|tenemos|ten[ií]a(?:mos)?|est[aá]\s+cableado|lo\s+caza|cubre|falta)\b/i,
  /\bning[uú]n[ao]?\b/i,
  /\bnada\s+(?:\w+\s+){0,2}(habr[ií]a|hubiera|caza|cubre|lo\s+detecta)/i,
  /\b(nunca|siempre|jam[aá]s|imposible)\b/i,
  // English
  /\bthere(?:'s| is| are| was| were)\s+no\b/i,
  /\bwe\s+(?:don't|do not|didn't|did not)\s+have\b/i,
  /\bnothing\s+(?:\w+\s+){0,2}(would|will|could|catches|caught)\b/i,
  /\b(never|always|impossible|doesn't exist|does not exist)\b/i,
];

const EVIDENCE = [
  /[\w./\\-]+\.(?:ts|tsx|js|mjs|cjs|scss|css|html|json|md|ya?ml|sh|toml)\b/i, // a real file path
  /:\d+\b/, // a path:line reference
  /`[^`]*(?:npm|npx|rg|grep|git|node|check:|test|build|lint)[^`]*`/i, // a command shown
  /\b(?:EXIT|exit code|exit=)\b/i, // an exit code pasted
  /\b(verificad|verifiqu|comprobad|comprob[eé]|confirmad|confirm[eé]|verified|confirmed|checked)\w*/i,
  /https?:\/\/\S+/, // a cited source
  /```/, // a pasted block of output
];

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

/**
 * La salida de hook para un payload crudo, o `undefined` si el turno puede terminar. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso. Un payload ilegible deja pasar.
 */
export function evaluate(raw) {
  let payload;
  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined; // never let a malformed payload wedge the session
  }

  // Already blocked once this turn: the verification pass has been demanded. Let the turn end.
  if (payload?.stop_hook_active === true) return undefined;

  const message = typeof payload?.last_assistant_message === 'string' ? payload.last_assistant_message : '';
  if (message.trim().length === 0) return undefined;

  const tripped = HIGH_RISK.find((pattern) => pattern.test(message));
  if (!tripped) return undefined;

  const hasEvidence = EVIDENCE.some((pattern) => pattern.test(message));
  if (hasEvidence) return undefined;

  const matched = message.match(tripped)?.[0] ?? '(unknown)';

  return {
      decision: 'block',
      reason: `Claim guard: absolute/negative claim ("${matched}") stated with no evidence in the message.`,
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: [
          `CLAIM GUARD TRIPPED on the phrase: "${matched}".`,
          '',
          'Your final message asserts something absolute or non-existent about the system and ships',
          'NO evidence with it — no file path, no command, no exit code, no cited source. That is the',
          'exact defect that produced two false statements minutes apart on 2026-07-14.',
          '',
          'Absence of memory is not evidence of absence. Do ONE of these before ending the turn:',
          '  1. Run the search that WOULD have found the thing you claim is absent (rg / Read / the',
          '     vendor package.json / the official docs). Then restate the claim WITH the receipt,',
          '     or retract it if the search refutes you.',
          '  2. If the claim is not load-bearing, cut it.',
          '  3. If you cannot verify it right now, keep it but mark it explicitly as unverified.',
          '',
          'This guard fires at most once per turn — it will not fire again after this pass.',
        ].join('\n'),
      },
    };
}

const main = async () => {
  let raw;
  try {
    raw = await readStdin();
  } catch {
    process.exit(0);
  }
  const output = evaluate(raw);
  if (output !== undefined) process.stdout.write(JSON.stringify(output));
  process.exit(0);
};

// Dentro del dispatcher, stdin ya lo leyó él: escucharlo acá consumiría su entrada.
if (globalThis[Symbol.for('hook-dispatch.in-process')] !== true) main();
