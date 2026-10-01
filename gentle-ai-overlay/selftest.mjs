#!/usr/bin/env node
/**
 * Proves the overlay DISCRIMINATES, on constructed fixtures only (never the live files): each
 * invariant is exercised held, broken, and in the near-miss shapes a real edit produces, with
 * multibyte CRLF content and missing files — and the telemetry opt-out through a constructed fake
 * gentle-ai CLI, so live gentle-ai state is never read or changed; apply is proven idempotent and byte-preserving; the CLIs
 * are proven to return 0 / 1 / 2 on the real customization list; the hook is proven to exit 0 on drift
 * AND on its own malfunction.
 *
 *   node selftest.mjs      exit 0 only when every case passes
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUSTOMIZATIONS } from './customizations.mjs';
import { KINDS, applyAll, evaluateAll } from './invariants.mjs';
import { parseManagedRegions } from './managed-regions.mjs';
import { inspectSection, reconcileSection, sha256 } from './review-contract-section.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '2.99.0';
const PERSONA = ['## Rules', '', '- A persona rule — con acentos: ñandú, 日本.', '', '## Persona Voice', '', 'Voice text.'].join('\n');
const MCP = 'mcp__engram__mem_search, mcp__engram__mem_save';

// ---------------------------------------------------------------- fixture construction

const roots = [];
function newRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'gentle-ai-overlay-selftest-'));
  roots.push(root);
  const home = path.join(root, 'home');
  const modCache = path.join(root, 'modcache');
  mkdirSync(home, { recursive: true });
  return { home, modCache };
}

function put(base, relative, text) {
  const target = path.join(base, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, 'utf8');
}

const read = (base, relative) => readFileSync(path.join(base, relative), 'utf8');

function agentFile({ tools, body = 'You are an executor.', eol = '\n' }) {
  const toolsLine = tools === undefined ? [] : [`tools: ${tools}`];
  return ['---', 'name: sdd-x', 'description: >', '  Explore — investiga el código, ñandú 日本 ✓', 'model: sonnet', ...toolsLine, '---', '', body, ''].join(eol);
}

function region(id, content) {
  return [`<!-- gentle-ai:${id} -->`, content, `<!-- /gentle-ai:${id} -->`].join('\n');
}

/** A CLAUDE.md: owner text, then the persona region (optionally with extra lines), then another region. */
function claudeMd({ owner, personaExtraLeading = [], after = [], eol = '\n' }) {
  const persona = region('persona', [...personaExtraLeading, PERSONA].join('\n'));
  return [owner, persona, '', region('engram-protocol', '## Engram\n\nEngram text.'), ...after, ''].join('\n').split('\n').join(eol);
}

function installReference({ home, modCache }, { persona = 'gentleman', version = VERSION } = {}) {
  put(home, '.gentle-ai/state.json', JSON.stringify({ installed_binary_version: version, persona }));
  put(modCache, `github.com/gentleman-programming/gentle-ai/v2@v${version}/internal/assets/claude/persona-gentleman.md`, `${PERSONA}\n`);
}

/**
 * A stand-in for the gentle-ai CLI: answers `telemetry status --json` from a state file beside it,
 * honouring DO_NOT_TRACK before the persisted flag exactly as gentle-ai does (killswitch.go), and
 * `telemetry disable --json` by persisting the opt-out. `fault` in the state forces a failure shape.
 */
const FAKE_CLI = `
const fs = require('node:fs');
const path = require('node:path');
const statePath = path.join(__dirname, 'telemetry-state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const args = process.argv.slice(2).join(' ');
if (args === 'telemetry disable --json') {
  fs.writeFileSync(statePath, JSON.stringify({ ...state, enabled: false }));
  process.stdout.write('{}');
} else if (args === 'telemetry status --json') {
  if (state.fault === 'exit') { process.stdout.write(JSON.stringify({ schema: 'gentle-ai.telemetry-status/v1', enabled: false, source: 'state' })); process.stderr.write('boom'); process.exit(3); }
  if (state.fault === 'garbage') { process.stdout.write('not json at all'); process.exit(0); }
  const dnt = (process.env.DO_NOT_TRACK ?? '') !== '';
  const decision = dnt ? { enabled: false, source: 'DO_NOT_TRACK' } : state.enabled ? { enabled: true, source: 'default' } : { enabled: false, source: state.source ?? 'state' };
  process.stdout.write(JSON.stringify({ schema: state.schema ?? 'gentle-ai.telemetry-status/v1', operation: 'status', ...decision }));
} else {
  process.exit(2);
}
`;

/** Install the fake CLI in a fixture and return the context field that invokes it. */
function installFakeCli(context, telemetryState) {
  const root = path.dirname(context.home);
  put(root, 'fake-cli/gentle-ai.cjs', FAKE_CLI);
  put(root, 'fake-cli/telemetry-state.json', JSON.stringify(telemetryState));
  context.fakeCli = path.join(root, 'fake-cli', 'gentle-ai.cjs');
  context.gentleAi = [process.execPath, context.fakeCli];
  return context;
}

// ---------------------------------------------------------------- harness

const cases = [];
const test = (name, body) => cases.push({ name, body });
function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const evaluate = (customization, context) => KINDS[customization.kind].evaluate(customization, context);
const run = (script, args, env = process.env) => spawnSync(process.execPath, [path.join(HERE, script), ...args], { encoding: 'utf8', env });

// ---------------------------------------------------------------- agent-tool-required

const needsBash = { id: 't', kind: 'agent-tool-required', file: '.claude/agents/sdd-x.md', tool: 'Bash' };

test('required: Bash in the tools line -> held', () => {
  const context = newRoot();
  put(context.home, needsBash.file, agentFile({ tools: `Read, Bash, ${MCP}` }));
  expect(evaluate(needsBash, context).status, 'held', 'status');
});

test('required: Bash absent -> broken; apply inserts it before the first mcp__ tool', () => {
  const context = newRoot();
  put(context.home, needsBash.file, agentFile({ tools: `Read, Grep, ${MCP}` }));
  expect(evaluate(needsBash, context).status, 'broken', 'before');
  expect(KINDS[needsBash.kind].apply(needsBash, context).outcome, 'applied', 'apply');
  expect(read(context.home, needsBash.file), agentFile({ tools: `Read, Grep, Bash, ${MCP}` }), 'file after apply');
  expect(evaluate(needsBash, context).status, 'held', 'after');
});

test('required: apply is idempotent (second run unchanged, bytes identical)', () => {
  const context = newRoot();
  put(context.home, needsBash.file, agentFile({ tools: `Read, ${MCP}` }));
  applyAll([needsBash], context);
  const once = read(context.home, needsBash.file);
  expect(applyAll([needsBash], context).length, 0, 'second apply finds nothing broken');
  expect(read(context.home, needsBash.file), once, 'bytes after second apply');
});

test('required: multibyte CRLF file keeps every other byte when Bash is inserted', () => {
  const context = newRoot();
  put(context.home, needsBash.file, agentFile({ tools: `Read, ${MCP}`, eol: '\r\n' }));
  KINDS[needsBash.kind].apply(needsBash, context);
  expect(read(context.home, needsBash.file), agentFile({ tools: `Read, Bash, ${MCP}`, eol: '\r\n' }), 'CRLF file after apply');
});

test('required: no mcp__ tool -> Bash is appended', () => {
  const context = newRoot();
  put(context.home, needsBash.file, agentFile({ tools: 'Read, Grep' }));
  KINDS[needsBash.kind].apply(needsBash, context);
  expect(read(context.home, needsBash.file), agentFile({ tools: 'Read, Grep, Bash' }), 'file');
});

test('near miss: Bash only in the body text, not the tools line -> broken', () => {
  const context = newRoot();
  put(context.home, needsBash.file, agentFile({ tools: `Read, ${MCP}`, body: 'Use Bash for git.\ntools: Read, Bash' }));
  expect(evaluate(needsBash, context).status, 'broken', 'status');
});

test('near miss: no tools line in the frontmatter, "tools: Read, Bash" only in the body -> broken', () => {
  const context = newRoot();
  put(context.home, needsBash.file, agentFile({ tools: undefined, body: 'tools: Read, Bash' }));
  expect(evaluate(needsBash, context).status, 'broken', 'status');
});

test('near miss: BashOutput is not Bash -> broken', () => {
  const context = newRoot();
  put(context.home, needsBash.file, agentFile({ tools: `Read, BashOutput, ${MCP}` }));
  expect(evaluate(needsBash, context).status, 'broken', 'status');
});

test('flow-form tools line with "Bash" -> held; without it apply refuses to rewrite', () => {
  const context = newRoot();
  put(context.home, needsBash.file, agentFile({ tools: '["read", "Bash"]' }));
  expect(evaluate(needsBash, context).status, 'held', 'held');
  put(context.home, needsBash.file, agentFile({ tools: '["read"]' }));
  expect(KINDS[needsBash.kind].apply(needsBash, context).outcome, 'refused', 'apply');
});

test('empty tools contract ([]) -> broken, apply refuses and leaves the file untouched', () => {
  const context = newRoot();
  const original = agentFile({ tools: '[]' });
  put(context.home, needsBash.file, original);
  expect(evaluate(needsBash, context).status, 'broken', 'status');
  expect(KINDS[needsBash.kind].apply(needsBash, context).outcome, 'refused', 'apply');
  expect(read(context.home, needsBash.file), original, 'file');
});

test('no frontmatter tools line -> broken, apply refuses', () => {
  const context = newRoot();
  put(context.home, needsBash.file, agentFile({ tools: undefined }));
  expect(evaluate(needsBash, context).status, 'broken', 'status');
  expect(KINDS[needsBash.kind].apply(needsBash, context).outcome, 'refused', 'apply');
});

test('missing agent file -> broken, apply refuses and creates nothing', () => {
  const context = newRoot();
  expect(evaluate(needsBash, context).status, 'broken', 'status');
  expect(KINDS[needsBash.kind].apply(needsBash, context).outcome, 'refused', 'apply');
  expect(spawnSync(process.execPath, ['-e', `process.exit(require('fs').existsSync(${JSON.stringify(path.join(context.home, needsBash.file))}) ? 1 : 0)`]).status, 0, 'file still absent');
});

// ---------------------------------------------------------------- agent-tool-forbidden

const withholdsBash = { id: 'r', kind: 'agent-tool-forbidden', file: '.claude/agents/sdd-research.md', tool: 'Bash' };

test('forbidden: missing file -> broken, never held', () => {
  expect(evaluate(withholdsBash, newRoot()).status, 'broken', 'status');
});

test('forbidden: tools line without Bash -> held; with Bash -> broken and not reapplicable', () => {
  const context = newRoot();
  put(context.home, withholdsBash.file, agentFile({ tools: 'WebFetch, WebSearch' }));
  expect(evaluate(withholdsBash, context).status, 'held', 'held');
  put(context.home, withholdsBash.file, agentFile({ tools: 'WebFetch, WebSearch, Bash' }));
  const [result] = evaluateAll([withholdsBash], context);
  expect(result.status, 'broken', 'broken');
  expect(result.reapplicable, false, 'reapplicable');
});

// ---------------------------------------------------------------- owner sections

const ANCHORS = ['# ⛔ ABSOLUTE MANDATE', '- **`a-rule-key`**'];
const OWNER = '# ⛔ ABSOLUTE MANDATE — highest priority\n\nOwner prose, ñ.\n\n- **`a-rule-key`** — a rule.\n';
const owners = { id: 'o', kind: 'owner-sections-outside-managed-regions', file: '.claude/CLAUDE.md', anchors: ANCHORS };

test('owner sections above every region (multibyte, CRLF) -> held', () => {
  const context = newRoot();
  put(context.home, owners.file, claudeMd({ owner: OWNER, eol: '\r\n' }));
  expect(evaluate(owners, context).status, 'held', 'status');
});

test('owner section BELOW the last region -> held (sync keeps text after a region)', () => {
  const context = newRoot();
  put(context.home, owners.file, claudeMd({ owner: '# ⛔ ABSOLUTE MANDATE\n', after: ['', '- **`a-rule-key`** — below.'] }));
  expect(evaluate(owners, context).status, 'held', 'status');
});

test('near miss: an owner section placed ONE line inside the persona region -> broken', () => {
  const context = newRoot();
  put(context.home, owners.file, claudeMd({ owner: '# ⛔ ABSOLUTE MANDATE\n', personaExtraLeading: ['- **`a-rule-key`** — slipped in.'] }));
  const result = evaluate(owners, context);
  expect(result.status, 'broken', 'status');
  expect(result.detail.includes('INSIDE <!-- gentle-ai:persona -->'), true, 'detail names the region');
});

test('owner section missing -> broken', () => {
  const context = newRoot();
  put(context.home, owners.file, claudeMd({ owner: '# ⛔ ABSOLUTE MANDATE\n' }));
  expect(evaluate(owners, context).status, 'broken', 'status');
});

test('near miss: anchor only mentioned mid-line -> not the section -> broken (missing)', () => {
  const context = newRoot();
  put(context.home, owners.file, claudeMd({ owner: '# ⛔ ABSOLUTE MANDATE\n\nSee - **`a-rule-key`** above.\n' }));
  expect(evaluate(owners, context).detail.startsWith('missing'), true, 'detail');
});

test('owner section duplicated (one copy outside, one inside) -> broken', () => {
  const context = newRoot();
  put(context.home, owners.file, claudeMd({ owner: OWNER, personaExtraLeading: ['- **`a-rule-key`** — copy.'] }));
  expect(evaluate(owners, context).status, 'broken', 'status');
});

test('marker mentioned inside prose -> broken (sync would read it as a marker)', () => {
  const context = newRoot();
  put(context.home, owners.file, claudeMd({ owner: `${OWNER}\nKeep it above \`<!-- gentle-ai:persona -->\`.\n` }));
  expect(evaluate(owners, context).detail.includes('inside prose'), true, 'detail');
});

test('unclosed region -> broken', () => {
  const context = newRoot();
  put(context.home, owners.file, `${OWNER}\n<!-- gentle-ai:persona -->\n${PERSONA}\n`);
  expect(evaluate(owners, context).detail.includes('never closed'), true, 'detail');
});

test('region closed under a different id -> broken', () => {
  const context = newRoot();
  put(context.home, owners.file, `${OWNER}
<!-- gentle-ai:persona -->
${PERSONA}
<!-- /gentle-ai:engram-protocol -->
`);
  expect(evaluate(owners, context).detail.includes('while "persona"'), true, 'detail');
});

test('missing CLAUDE.md -> broken', () => {
  expect(evaluate(owners, newRoot()).status, 'broken', 'status');
});

// ---------------------------------------------------------------- persona region

const persona = { id: 'p', kind: 'persona-region-matches-upstream', file: '.claude/CLAUDE.md', region: 'persona' };

test('persona region equals the installed asset (CRLF file) -> held', () => {
  const context = newRoot();
  installReference(context);
  put(context.home, persona.file, claudeMd({ owner: OWNER, eol: '\r\n' }));
  expect(evaluate(persona, context).status, 'held', 'status');
});

test('an UNDECLARED owner line inside the persona region -> broken, at its exact line', () => {
  const context = newRoot();
  installReference(context);
  put(context.home, persona.file, claudeMd({ owner: '# Owner\n', personaExtraLeading: ['- **`new-undeclared-rule`** — written below the marker.'] }));
  const result = evaluate(persona, context);
  expect(result.status, 'broken', 'status');
  expect(result.detail.includes('line 4: "- **`new-undeclared-rule`**'), true, `detail (${result.detail})`);
});

test('owner text appended at the END of the persona region -> broken', () => {
  const context = newRoot();
  installReference(context);
  const text = claudeMd({ owner: '# Owner\n' }).replace('Voice text.\n<!-- /gentle-ai:persona -->', 'Voice text.\n\n- **`tail-rule`** — ñ.\n<!-- /gentle-ai:persona -->');
  put(context.home, persona.file, text);
  expect(evaluate(persona, context).status, 'broken', 'status');
});

test('gentle-ai source absent from the module cache -> unverifiable, never held', () => {
  const context = newRoot();
  put(context.home, '.gentle-ai/state.json', JSON.stringify({ installed_binary_version: VERSION, persona: 'gentleman' }));
  put(context.home, persona.file, claudeMd({ owner: OWNER }));
  expect(evaluate(persona, context).status, 'unverifiable', 'status');
});

test('persona region absent -> broken', () => {
  const context = newRoot();
  installReference(context);
  put(context.home, persona.file, `${OWNER}\n${region('engram-protocol', 'x')}\n`);
  expect(evaluate(persona, context).status, 'broken', 'status');
});

// ---------------------------------------------------------------- telemetry

const telemetry = { id: 'g', kind: 'telemetry-disabled' };
const withCli = (state) => installFakeCli(newRoot(), state);

test('telemetry: persisted opt-out -> held', () => {
  expect(evaluate(telemetry, withCli({ enabled: false })).status, 'held', 'status');
});

test('telemetry: enabled -> broken; apply disables it through the CLI; second apply finds nothing', () => {
  const context = withCli({ enabled: true });
  expect(evaluate(telemetry, context).status, 'broken', 'before');
  expect(applyAll([telemetry], context)[0].outcome, 'applied', 'apply');
  expect(evaluate(telemetry, context).status, 'held', 'after');
  expect(applyAll([telemetry], context).length, 0, 'second apply');
});

test('telemetry near miss: DO_NOT_TRACK in the caller env masks an ENABLED state -> still broken', () => {
  const previous = process.env.DO_NOT_TRACK;
  process.env.DO_NOT_TRACK = '1';
  try {
    expect(evaluate(telemetry, withCli({ enabled: true })).status, 'broken', 'status');
  } finally {
    if (previous === undefined) delete process.env.DO_NOT_TRACK;
    else process.env.DO_NOT_TRACK = previous;
  }
});

test('telemetry: CLI cannot be started -> unverifiable, never held', () => {
  const context = { ...newRoot(), gentleAi: [path.join(tmpdir(), 'no-such-gentle-ai-binary.exe')] };
  expect(evaluate(telemetry, context).status, 'unverifiable', 'status');
});

test('telemetry: CLI exits non-zero even while printing a "disabled" answer -> unverifiable', () => {
  expect(evaluate(telemetry, withCli({ enabled: false, fault: 'exit' })).status, 'unverifiable', 'status');
});

test('telemetry: CLI prints non-JSON -> unverifiable', () => {
  expect(evaluate(telemetry, withCli({ enabled: false, fault: 'garbage' })).status, 'unverifiable', 'status');
});

test('telemetry: status schema changed -> unverifiable', () => {
  expect(evaluate(telemetry, withCli({ enabled: false, schema: 'gentle-ai.telemetry-status/v2' })).status, 'unverifiable', 'status');
});

test('telemetry: disabled by an unknown source -> unverifiable, not held', () => {
  expect(evaluate(telemetry, withCli({ enabled: false, source: 'CI' })).status, 'unverifiable', 'status');
});

// ---------------------------------------------------------------- review contract section (pure)
// The span gentle-ai renders, its lazy form, and its restoration, on a multibyte fixture in both line
// endings. @es El tramo que genera gentle-ai, su forma diferida y su restauración, sobre un fixture
// multibyte con ambos finales de línea.

const REVIEW_SPAN = ['#### Review Execution Contract', '', '# Native Compact Review Orchestration', '', 'Contract body — ñandú 日本.', '<!-- authority-first-terminal-procedure:start -->', 'Procedure.', '<!-- authority-first-terminal-procedure:end -->', '', ''].join('\n');
const STASH_LABEL = '~/.claude/gentle-ai-overlay/lazy/review-execution-contract.md';

/** A CLAUDE.md whose sdd-orchestrator region holds the review span. @es Un CLAUDE.md cuya región sdd-orchestrator contiene el tramo. */
function orchestratorMd({ span = REVIEW_SPAN, eol = '\n', after = '' } = {}) {
  const body = ['# Agent Teams', '', '#### Native Checking Contract', '', 'Checking.', '', `${span}#### Cost and Context Balance`, '', 'Cost.'].join('\n');
  return ['# Owner pointer', '', region('persona', PERSONA), '', region('sdd-orchestrator', body), '', region('agent-routing', 'Routing.'), after, ''].join('\n').split('\n').join(eol);
}
const spanOf = (text) => {
  const { start, end } = inspectSection(text);
  return { start, end, bytes: text.slice(start, end) };
};
const lazy = (text, stash = null, keepLoaded = false) => reconcileSection(text, { keepLoaded, stash, stashLabel: STASH_LABEL });
const ORCHESTRATOR_OPEN = '<!-- gentle-ai:sdd-orchestrator -->';
const ORCHESTRATOR_CLOSE = '<!-- /gentle-ai:sdd-orchestrator -->';
/** What `gentle-ai sync` does to the region: replaces everything between its markers. @es Lo que hace `gentle-ai sync` con la región. */
const syncRegion = (text, from) =>
  text.slice(0, text.indexOf(ORCHESTRATOR_OPEN)) + from.slice(from.indexOf(ORCHESTRATOR_OPEN), from.indexOf(ORCHESTRATOR_CLOSE)) + text.slice(text.indexOf(ORCHESTRATOR_CLOSE));

for (const eol of ['\n', '\r\n']) {
  const label = eol === '\n' ? 'LF' : 'CRLF';

  test(`section ${label}: off + present -> moved; stash is the span byte for byte; nothing outside the span changes`, () => {
    const original = orchestratorMd({ eol });
    const span = spanOf(original);
    const result = lazy(original);
    expect(result.outcome, 'moved', 'outcome');
    expect(result.stash, span.bytes, 'stash bytes');
    expect(result.text.slice(0, span.start), original.slice(0, span.start), 'prefix');
    expect(result.text.endsWith(original.slice(span.end)), true, 'suffix');
    expect(parseManagedRegions(result.text).problems.length, 0, 'markers well formed');
  });

  test(`section ${label}: the pointer carries the sentinel sha, the stash label, every trigger, both languages, and the file's line ending`, () => {
    const original = orchestratorMd({ eol });
    const result = lazy(original);
    const pointer = result.text.slice(spanOf(original).start, result.text.length - (original.length - spanOf(original).end));
    expect(pointer.includes(`sha256=${sha256(result.stash)} -->`), true, 'sentinel sha');
    ['`~/.claude/gentle-ai-overlay/lazy/review-execution-contract.md`', 'other than `gentle-ai review mode status`', 'consent/v3', 'effective: on', '\n@es '].forEach((needle) => expect(pointer.includes(needle), true, `pointer holds ${needle}`));
    expect(pointer.split('\r\n').join('').includes('\n'), eol === '\n', 'line ending');
  });

  test(`section ${label}: idempotent; keepLoaded restores the original bytes; keepLoaded on a present span changes nothing`, () => {
    const original = orchestratorMd({ eol });
    const moved = lazy(original);
    const again = lazy(moved.text, moved.stash);
    expect(again.outcome, 'unchanged', 'second run outcome');
    expect(again.text, moved.text, 'second run bytes');
    const restored = lazy(moved.text, moved.stash, true);
    expect(restored.outcome, 'restored', 'restore outcome');
    expect(restored.text, original, 'restored bytes');
    expect(lazy(original, null, true).text, original, 'present + keepLoaded');
  });

  test(`section ${label}: a sync-shaped rewrite of the moved file, then the overlay, gives the same moved file`, () => {
    const original = orchestratorMd({ eol });
    const moved = lazy(original);
    expect(moved.outcome, 'moved', 'moved before the sync');
    const synced = syncRegion(moved.text, original);
    expect(synced, original, 'sync restores the span');
    const again = lazy(synced, moved.stash);
    expect(again.text, moved.text, 'moved again');
    expect(again.stash, moved.stash, 'stash again');
  });
}

test('section: a moved span whose stash is tampered, missing or drifted is refused, never guessed', () => {
  const moved = lazy(orchestratorMd());
  expect(lazy(moved.text, `${moved.stash}x`, true).refused !== undefined, true, 'tampered, restore');
  expect(lazy(moved.text, null, true).refused !== undefined, true, 'missing, restore');
  expect(lazy(moved.text, 'other', false).refused !== undefined, true, 'drifted, off');
});

test('section: no heading and no contract title -> absent, nothing to move', () => {
  const text = orchestratorMd({ span: '' });
  expect(inspectSection(text).form, 'absent', 'form');
  expect(lazy(text).outcome, 'unchanged', 'outcome');
});

/** The refusal names the exact cause it found. @es El rechazo nombra la causa exacta que encontró. */
const refusedFor = (text, cause) => (lazy(text).refused ?? '').startsWith(cause);
const START_REFUSAL = '"#### Review Execution Contract" is not exactly one whole line';
const END_REFUSAL = '"#### Cost and Context Balance" is not exactly one whole line';

test('section near misses refuse, naming why: duplicated start, duplicated end, renamed start with the title still rendered', () => {
  expect(refusedFor(orchestratorMd({ after: '#### Review Execution Contract' }), START_REFUSAL), true, 'start twice');
  expect(refusedFor(orchestratorMd({ after: '#### Cost and Context Balance' }), END_REFUSAL), true, 'end twice');
  expect(refusedFor(orchestratorMd({ span: REVIEW_SPAN.replace('#### Review Execution Contract', '#### Review Execution Contracts') }), START_REFUSAL), true, 'renamed start');
});

test('section near misses refuse, naming why: end heading missing, a second sdd-orchestrator region, span outside the region', () => {
  expect(refusedFor(orchestratorMd().replace('#### Cost and Context Balance', '#### Cost'), END_REFUSAL), true, 'end missing');
  expect(refusedFor(orchestratorMd({ after: region('sdd-orchestrator', 'Second copy.') }), 'the sdd-orchestrator region is not present exactly once'), true, 'region twice');
  const outside = orchestratorMd({ span: '' }).replace('#### Cost and Context Balance', 'Cost heading moved.').concat(REVIEW_SPAN, '#### Cost and Context Balance\n');
  expect(lazy(outside).refused !== undefined, true, 'outside the region');
});

test('section near misses are not headings or sentinels: a heading quoted mid-line, a sentinel without its closing', () => {
  const quoted = orchestratorMd().replace('Checking.', 'See #### Review Execution Contract below.');
  expect(lazy(quoted).outcome, 'moved', 'mid-line mention ignored');
  const moved = lazy(orchestratorMd());
  const unclosed = moved.text.replace(`${sha256(moved.stash)} -->`, sha256(moved.stash));
  expect(inspectSection(unclosed).form, 'present', 'unclosed sentinel is not a sentinel');
});

// ---------------------------------------------------------------- the real list, through the CLIs

/** A fixture home that satisfies every entry of the REAL customization list. */
function completeHome({ telemetryEnabled = false } = {}) {
  const context = installFakeCli(newRoot(), { enabled: telemetryEnabled });
  installReference(context);
  // Desde el 2026-09-28 el texto propio vive en varios archivos (CLAUDE.md conserva solo un puntero; el
  // resto está en ~/.claude/rules/). Cada entrada de este tipo recibe SUS anclas en SU archivo.
  for (const entry of CUSTOMIZATIONS.filter((candidate) => candidate.kind === 'owner-sections-outside-managed-regions')) {
    const owner = entry.anchors.map((anchor) => `${anchor} text\n`).join('\n');
    put(context.home, entry.file, entry.file === '.claude/CLAUDE.md' ? claudeMd({ owner, eol: '\r\n' }) : owner);
  }
  for (const entry of CUSTOMIZATIONS.filter((candidate) => candidate.kind.startsWith('agent-tool'))) {
    put(context.home, entry.file, agentFile({ tools: entry.kind === 'agent-tool-required' ? `Read, Bash, ${MCP}` : 'WebFetch, WebSearch' }));
  }
  return context;
}
const flags = ({ home, modCache, fakeCli }) => ['--home', home, '--mod-cache', modCache, '--gentle-ai-node-script', fakeCli];

test('real list: every kind is registered and every id is unique', () => {
  CUSTOMIZATIONS.forEach((entry) => expect(KINDS[entry.kind] !== undefined, true, `kind of ${entry.id}`));
  expect(new Set(CUSTOMIZATIONS.map((entry) => entry.id)).size, CUSTOMIZATIONS.length, 'unique ids');
});

test('check.mjs: complete fixture -> exit 0', () => {
  expect(run('check.mjs', flags(completeHome())).status, 0, 'exit');
});

test('check.mjs: one tools line lost Bash -> exit 1; apply.mjs restores it -> exit 0; second apply -> exit 0, no change', () => {
  const context = completeHome();
  put(context.home, '.claude/agents/sdd-spec.md', agentFile({ tools: `Read, ${MCP}` }));
  expect(run('check.mjs', flags(context)).status, 1, 'check before');
  expect(run('apply.mjs', flags(context)).status, 0, 'apply');
  const restored = read(context.home, '.claude/agents/sdd-spec.md');
  expect(restored, agentFile({ tools: `Read, Bash, ${MCP}` }), 'restored bytes');
  expect(run('apply.mjs', flags(context)).stdout.includes('nothing reapplicable was broken'), true, 'second apply');
  expect(read(context.home, '.claude/agents/sdd-spec.md'), restored, 'bytes after second apply');
});

test('apply.mjs: owner rule inside the region -> refuses to move prose, exits 1, CLAUDE.md untouched', () => {
  const context = completeHome();
  const original = read(context.home, '.claude/CLAUDE.md').replace('## Rules', '- **`guard-that-cannot-go-red`** dup\r\n## Rules');
  put(context.home, '.claude/CLAUDE.md', original);
  expect(run('apply.mjs', flags(context)).status, 1, 'exit');
  expect(read(context.home, '.claude/CLAUDE.md'), original, 'CLAUDE.md bytes');
});

test('check.mjs: telemetry enabled, even under DO_NOT_TRACK=1 -> exit 1; apply.mjs disables it -> exit 0', () => {
  const context = completeHome({ telemetryEnabled: true });
  expect(run('check.mjs', flags(context), { ...process.env, DO_NOT_TRACK: '1' }).status, 1, 'check');
  expect(run('apply.mjs', flags(context)).status, 0, 'apply');
  expect(run('check.mjs', flags(context)).status, 0, 'check after');
});

test('check.mjs --json: same verdict as the exit code, results carry id, status and remedy', () => {
  const context = completeHome();
  put(context.home, '.claude/agents/sdd-tasks.md', agentFile({ tools: `Read, ${MCP}` }));
  const result = run('check.mjs', [...flags(context), '--json']);
  const report = JSON.parse(result.stdout);
  expect(result.status, 1, 'exit');
  expect(report.exitCode, 1, 'exitCode field');
  const broken = report.results.filter((entry) => entry.status === 'broken').map((entry) => entry.id);
  expect(broken.join(','), 'sdd-tasks-grants-bash', 'broken ids');
});

test('check.mjs: reference unavailable, nothing broken -> exit 2', () => {
  const context = completeHome();
  rmSync(context.modCache, { recursive: true, force: true });
  expect(run('check.mjs', flags(context)).status, 2, 'exit');
});

// ---------------------------------------------------------------- the hook

test('hook: all held -> exit 0 and silent', () => {
  const result = run('session-start-hook.mjs', flags(completeHome()));
  expect(result.status, 0, 'exit');
  expect(result.stdout, '', 'stdout');
});

test('hook: drift -> exit 0 with valid JSON naming the apply command', () => {
  const context = completeHome();
  put(context.home, '.claude/agents/sdd-design.md', agentFile({ tools: `Read, ${MCP}` }));
  const result = run('session-start-hook.mjs', flags(context));
  expect(result.status, 0, 'exit');
  const message = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  expect(message.includes('apply.mjs') && message.includes('sdd-design-grants-bash'), true, 'advisory');
});

test('hook: its own malfunction (its sibling modules are missing) -> still exit 0, and says the check failed', () => {
  const { home } = newRoot();
  const lonelyHook = path.join(home, 'session-start-hook.mjs');
  copyFileSync(path.join(HERE, 'session-start-hook.mjs'), lonelyHook);
  const result = spawnSync(process.execPath, [lonelyHook], { encoding: 'utf8' });
  expect(result.status, 0, 'exit');
  expect(result.stdout.includes('the drift check itself failed'), true, `stdout (${result.stdout})`);
});

// ---------------------------------------------------------------- run

let failed = 0;
for (const { name, body } of cases) {
  try {
    body();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}
roots.forEach((root) => rmSync(root, { recursive: true, force: true }));
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exitCode = failed === 0 ? 0 : 1;
