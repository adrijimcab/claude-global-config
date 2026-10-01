#!/usr/bin/env node
/**
 * SessionStart hook: first re-place the review execution contract (the one customization applied
 * automatically, see lazy-review-hook-output.mjs), which heals a `gentle-ai sync` run outside Claude
 * Code; then, when any customization of a gentle-ai-managed file has drifted, tell both the user
 * (systemMessage) and the model (additionalContext) exactly what to run. Silent when all hold and
 * nothing was re-placed.
 *
 * It ALWAYS exits 0, including on its own malfunction — it is advisory and must never block a session.
 * The modules are imported inside the try so that even a missing or broken sibling file lands in the
 * catch. A malfunction is still reported, because a check that could not run did not pass.
 *
 * Registered in ~/.claude/settings.json. gentle-ai sync merges that file's hooks append-only
 * (internal/components/sdd/inject.go, appendClaudeReviewStopHookEntry), so the entry survives a sync.
 *
 * @es Hook SessionStart: primero recoloca el contrato de ejecución de revisiones (la única
 * personalización que se aplica sola), lo que repara un `gentle-ai sync` corrido fuera de Claude Code;
 * luego, si alguna personalización de un fichero gestionado por gentle-ai se desvió, se lo dice al
 * usuario y al modelo con el comando exacto. Callado cuando todo se mantiene y nada se recolocó.
 * SIEMPRE sale con 0, también ante su propia falla, que igual se informa.
 */
const CHECK_COMMAND = 'node "$HOME/.claude/gentle-ai-overlay/check.mjs"';

const emit = (message, context = message) =>
  process.stdout.write(`${JSON.stringify({ systemMessage: message, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } })}\n`);

/** Non-empty parts, one paragraph each, or undefined. @es Las partes no vacías, un párrafo cada una, o undefined. */
const joined = (parts) => {
  const present = parts.filter((part) => part !== undefined);
  return present.length === 0 ? undefined : present.join('\n\n');
};

try {
  const { contextFromArgv } = await import('./context.mjs');
  const { CUSTOMIZATIONS } = await import('./customizations.mjs');
  const { evaluateAll } = await import('./invariants.mjs');
  const { driftAdvisory } = await import('./report.mjs');
  const { reconcileLazyReview } = await import('./lazy-review-hook-output.mjs');
  const context = contextFromArgv(process.argv.slice(2));
  const replaced = reconcileLazyReview(context);
  const results = evaluateAll(CUSTOMIZATIONS, context);
  const advisory = results.some((result) => result.status !== 'held') ? driftAdvisory(results) : undefined;
  const message = joined([replaced.systemMessage, advisory]);
  if (message !== undefined) emit(message, joined([replaced.additionalContext, advisory]));
} catch (error) {
  emit(`[gentle-ai overlay] the drift check itself failed (${error.message}); customizations are UNVERIFIED. Run: ${CHECK_COMMAND}`);
}
process.exitCode = 0;
