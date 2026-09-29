/**
 * Invariant: gentle-ai telemetry stays DISABLED by its persisted opt-out (owner decision 2026-09-28).
 *
 * Measured only through gentle-ai's own `telemetry status --json`, never by reading its state file:
 * the CLI owns the precedence rules, the file is an implementation detail. Held means exactly
 * `enabled: false` decided by `source: "state"`. Anything the CLI cannot answer — not installed, a
 * non-zero exit, output that is not the v1 status schema, a source this overlay does not know — is
 * UNVERIFIABLE, never held.
 *
 * The `gentle-ai telemetry runtime` hooks are deliberately left registered: with the opt-out in place
 * they send nothing, and sync re-adds them anyway.
 */
import { runGentleAi } from '../gentle-ai-cli.mjs';

const STATUS_SCHEMA = 'gentle-ai.telemetry-status/v1';

function readStatus(context) {
  const run = runGentleAi(context, ['telemetry', 'status', '--json']);
  if (!run.ok) return { unverifiable: run.reason };
  try {
    const status = JSON.parse(run.stdout);
    if (status.schema !== STATUS_SCHEMA) return { unverifiable: `telemetry status answered schema "${status.schema}", expected "${STATUS_SCHEMA}"` };
    return { status };
  } catch {
    return { unverifiable: `telemetry status did not print JSON: ${run.stdout.trim().slice(0, 120)}` };
  }
}

export const telemetryDisabled = {
  evaluate(customization, context) {
    const { status, unverifiable } = readStatus(context);
    if (unverifiable) return { status: 'unverifiable', detail: unverifiable };
    if (status.enabled === false && status.source === 'state') return { status: 'held', detail: 'disabled by the persisted opt-out (source "state")' };
    if (status.enabled === true) return { status: 'broken', detail: `telemetry is ENABLED (source "${status.source}")` };
    return { status: 'unverifiable', detail: `unexpected status: enabled=${status.enabled}, source "${status.source}"` };
  },

  apply(customization, context) {
    const run = runGentleAi(context, ['telemetry', 'disable', '--json']);
    return run.ok ? { outcome: 'applied', detail: 'ran gentle-ai telemetry disable' } : { outcome: 'refused', detail: run.reason };
  },
};
