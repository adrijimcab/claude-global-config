#!/usr/bin/env node
/**
 * Self-test for `preflight.mjs`, the one-pass check of a draft brief.
 *
 * What it must do, and what would make it wrong:
 *   - report EVERY guard that refuses, not the first — the whole point is one pass, all problems;
 *   - build the payload the harness would send, so each guard reads the draft where the real call
 *     carries it (a resume's text in `message`, a delegation's in `prompt`);
 *   - never read silence as clean when a guard failed to run (exit 2, not 0);
 *   - refuse a malformed command line rather than guess.
 * The multi-guard proof runs the REAL dispatcher over a temporary manifest naming two REAL guards
 * (brief-provenance and brief-feasibility) against a REAL draft both of them object to
 * (`fixtures/incidents.json` → `refusedDrafts`, verbatim from session c45d798b).
 *
 * @es Auto-test de `preflight.mjs`. Debe informar de TODOS los guards que rechazan, construir el payload
 * que enviaría el harness, no leer silencio como limpio si un guard no corrió, y rechazar una línea de
 * comandos mal formada. La prueba multi-guard usa el dispatcher REAL, dos guards REALES y un borrador
 * REAL al que ambos objetan.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { delegationManifests, draftPayload, EXIT, parseArguments, preflight } from './preflight.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRAFTS = JSON.parse(readFileSync(join(HERE, 'fixtures', 'incidents.json'), 'utf8')).refusedDrafts;
const ISOLATED_DRAFT = DRAFTS.find((draft) => draft.tool === 'Agent');
const RESUME_DRAFT = DRAFTS.find((draft) => draft.tool === 'SendMessage');

let failures = 0;
let total = 0;

function report(ok, line) {
  total += 1;

  if (!ok) failures += 1;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

const world = mkdtempSync(join(tmpdir(), 'brief-preflight-'));

try {
  // --- THE COMMAND LINE ----------------------------------------------------------------------------
  report(parseArguments(['draft.md']).tool === 'Agent', 'a draft alone is a delegation');
  report(parseArguments(['draft.md', '--tool', 'SendMessage', '--to', 'a1']).to === 'a1', 'a resume names its recipient');
  report(parseArguments(['draft.md', '--tool', 'SendMessage']).error !== undefined, 'a resume with no recipient is refused, never guessed');
  report(parseArguments(['draft.md', '--tool', 'Bash']).error !== undefined, 'a tool that carries no brief is refused');
  report(parseArguments([]).error !== undefined, 'no draft is refused');
  report(parseArguments(['draft.md', '--to']).error !== undefined, 'a flag with no value is refused');
  report(parseArguments(['a.md', 'b.md']).error !== undefined, 'two drafts are refused');

  // --- THE PAYLOAD: the draft travels in the field the real call carries it in. ---------------------
  const agentPayload = draftPayload('the brief', { tool: 'Agent', description: 'errand', isolation: 'worktree', cwd: world });
  const resumePayload = draftPayload('the brief', { tool: 'SendMessage', to: 'a1', cwd: world }, () => ({ sessionId: 'real-session', transcriptPath: join(world, 'real-session.jsonl') }));

  report(agentPayload.tool_input.prompt === 'the brief' && agentPayload.tool_input.isolation === 'worktree' && agentPayload.tool_input.description === 'errand', 'a delegation carries prompt, description and isolation');
  report(agentPayload.session_id === 'preflight', 'a delegation preflight is journaled under the preflight session, never a real one');
  report(resumePayload.tool_input.message === 'the brief' && resumePayload.tool_input.to === 'a1', 'a resume carries message and to');
  report(resumePayload.session_id === 'real-session' && resumePayload.transcript_path === join(world, 'real-session.jsonl'), "a resume carries its recipient's session, which is how the recipient's worktree is found");
  report(draftPayload('x', { tool: 'SendMessage', to: 'nobody', cwd: world }, () => undefined).session_id === 'preflight', 'an unlocatable recipient falls back to the preflight session');

  // --- THE MANIFESTS: whichever exist, global first. -----------------------------------------------
  const home = join(world, 'home');
  const checkout = join(world, 'checkout');

  mkdirSync(join(home, '.claude', 'hook-dispatch', 'manifests'), { recursive: true });
  writeFileSync(join(home, '.claude', 'hook-dispatch', 'manifests', 'pretooluse-delegation.json'), '{}');
  report(delegationManifests(join(checkout, '.claude', 'worktrees', 'agent-x'), home).length === 1, 'an absent project manifest is skipped, the global one kept');
  mkdirSync(join(checkout, '.claude', 'hook-dispatch'), { recursive: true });
  writeFileSync(join(checkout, '.claude', 'hook-dispatch', 'pretooluse-delegation.json'), '{}');

  const both = delegationManifests(join(checkout, '.claude', 'worktrees', 'agent-x'), home);

  report(both.length === 2 && both[1] === join(checkout, '.claude', 'hook-dispatch', 'pretooluse-delegation.json'), "a worker's worktree resolves to the MAIN checkout's manifest");

  // --- AGGREGATION, with the dispatcher stubbed: every refusal is kept, problems are never silence. ---
  const denying = (text) => ({ output: { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: text } }, problems: [] });
  const two = await preflight({}, ['m1', 'm2'], async (manifest) => denying(`refused by ${manifest}`));

  report(two.refusals.length === 2 && two.refusals[1].reason === 'refused by m2', 'a refusal from EVERY manifest is kept, not the first');

  const broken = await preflight({}, ['m1'], async () => ({ output: undefined, problems: ['guard x: import failed'] }));

  report(broken.problems.length === 1 && broken.refusals.length === 0, 'a guard that failed to run is a PROBLEM, never a clean silence');

  const thrown = await preflight({}, ['m1'], async () => {
    throw new Error('manifest unreadable');
  });

  report(thrown.problems.length === 1, 'a manifest that cannot load is a problem too');

  const clean = await preflight({}, ['m1'], async () => ({ output: undefined, problems: [] }));

  report(clean.refusals.length === 0 && clean.problems.length === 0, 'no guard objecting is clean');
  report(EXIT.CLEAN === 0 && EXIT.REFUSED === 1 && EXIT.NOT_MEASURED === 2, 'the three exit codes are distinct');

  // --- REAL GUARDS, REAL DISPATCHER, REAL DRAFT: one pass reports both objections. -----------------
  const manifest = join(world, 'two-guards.json');

  writeFileSync(manifest, JSON.stringify({ event: 'PreToolUse', guards: [join(HERE, '..', 'brief-provenance', 'guard.mjs'), join(HERE, 'guard.mjs')] }));

  const realCheckout = 'C:/Users/adrian.jimenez/Desktop/Projects/b100-am-ui';
  const isolated = draftPayload(ISOLATED_DRAFT.input.prompt, { tool: 'Agent', description: ISOLATED_DRAFT.input.description, isolation: ISOLATED_DRAFT.input.isolation, cwd: realCheckout });
  const both2 = await preflight(isolated, [manifest]);
  const reason = both2.refusals[0]?.reason ?? '';

  report(reason.includes('BRIEF-PROVENANCE REFUSED') && reason.includes('BRIEF-FEASIBILITY REFUSED'), `REAL DRAFT [${ISOLATED_DRAFT.source.toolUseId}]: one pass reports BOTH the provenance and the feasibility objection`);
  report(reason.includes(ISOLATED_DRAFT.liveRefusalHead.slice(0, 40)), 'REAL DRAFT: the provenance objection is the one the live guard gave it');

  const resume = draftPayload(RESUME_DRAFT.input.message, { tool: 'SendMessage', to: RESUME_DRAFT.input.to, cwd: realCheckout }, () => undefined);
  const resumed = await preflight(resume, [manifest]);

  report((resumed.refusals[0]?.reason ?? '').includes('BRIEF-PROVENANCE REFUSED this message (SendMessage)'), `REAL DRAFT [${RESUME_DRAFT.source.toolUseId}]: a resume draft is read from its message field and refused as the live guard refused it`);
} finally {
  rmSync(world, { recursive: true, force: true });
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
