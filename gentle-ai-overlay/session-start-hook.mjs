#!/usr/bin/env node
/**
 * SessionStart hook: when any customization of a gentle-ai-managed file has drifted, tell both the
 * user (systemMessage) and the model (additionalContext) exactly what to run. Silent when all hold.
 *
 * It ALWAYS exits 0, including on its own malfunction — it is advisory and must never block a session.
 * The modules are imported inside the try so that even a missing or broken sibling file lands in the
 * catch. A malfunction is still reported, because a check that could not run did not pass.
 *
 * Registered in ~/.claude/settings.json. gentle-ai sync merges that file's hooks append-only
 * (internal/components/sdd/inject.go, appendClaudeReviewStopHookEntry), so the entry survives a sync.
 */
const CHECK_COMMAND = 'node "$HOME/.claude/gentle-ai-overlay/check.mjs"';

const emit = (message) =>
  process.stdout.write(`${JSON.stringify({ systemMessage: message, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message } })}\n`);

try {
  const { contextFromArgv } = await import('./context.mjs');
  const { CUSTOMIZATIONS } = await import('./customizations.mjs');
  const { evaluateAll } = await import('./invariants.mjs');
  const { driftAdvisory } = await import('./report.mjs');
  const results = evaluateAll(CUSTOMIZATIONS, contextFromArgv(process.argv.slice(2)));
  if (results.some((result) => result.status !== 'held')) emit(driftAdvisory(results));
} catch (error) {
  emit(`[gentle-ai overlay] the drift check itself failed (${error.message}); customizations are UNVERIFIED. Run: ${CHECK_COMMAND}`);
}
process.exitCode = 0;
