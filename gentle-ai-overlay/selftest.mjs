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
import { inspectSection, reconcileSection } from './lazy-section.mjs';
import { registerLazySectionCases } from './lazy-section-cases.mjs';
import { fullOrchestratorMd, lazyEntries } from './lazy-section-fixtures.mjs';
import { driftAdvisory } from './report.mjs';
import { registerLineReplacementCases } from './line-replacement-cases.mjs';
import { registerPrunedTextCases } from './pruned-text-cases.mjs';
import { registerReapplyCases } from './reapply-cases.mjs';
import { registerSyncWrapperCases } from './sync-wrapper-cases.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '2.99.0';
const PERSONA = ['## Rules', '', '- A persona rule — con acentos: ñandú, 日本.', '', '## Persona Voice', '', 'Voice text.'].join('\n');
const MCP = 'mcp__engram__mem_search, mcp__engram__mem_save';

// ---------------------------------------------------------------- fixture construction

const roots = [];
// Every root is removed on every exit, a throw included: a selftest leaves nothing behind it. @es Toda raíz se
// elimina en toda salida, también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));
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
  return ['---', 'name: worker-x', 'description: >', '  Explore — investiga el código, ñandú 日本 ✓', 'model: sonnet', ...toolsLine, '---', '', body, ''].join(eol);
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
} else if (args === 'review mode status --json') {
  const global = state.reviewGlobal ?? '';
  const effective = global === 'on' && !state.cloneOff ? 'on' : 'off';
  const report = { schema: state.reviewSchema ?? 'gentle-ai.review-mode/v1', operation: 'status', scope: 'both', status: { schema: state.reviewStatusSchema ?? 'gentle-ai.rdd-mode-status/v1', global, clone_local: state.cloneOff ? 'off' : '', effective, source: 'default' } };
  if (state.reviewFault === 'garbage') { process.stdout.write('not json at all'); process.exit(0); }
  process.stdout.write(JSON.stringify(report));
  if (state.reviewFault === 'exit') process.exit(4);
} else if (process.argv[2] === 'sync') {
  fs.appendFileSync(path.join(__dirname, 'sync-calls.log'), JSON.stringify(process.argv.slice(3)) + '\\n');
  for (const [file, text] of Object.entries(state.syncWrites ?? {})) fs.writeFileSync(file, text);
  if (state.syncSignal) process.kill(process.pid, state.syncSignal);
  process.exit(state.syncExit ?? 0);
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

const needsBash = { id: 't', kind: 'agent-tool-required', file: '.claude/agents/worker-x.md', tool: 'Bash' };

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

const withholdsBash = { id: 'r', kind: 'agent-tool-forbidden', file: '.claude/agents/researcher.md', tool: 'Bash' };

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

// ---------------------------------------------------------------- anchored line replacement
// @es Reemplazo de una línea anclada: los casos viven en line-replacement-cases.mjs.

registerLineReplacementCases({ test, expect, newRoot, put, read });

// ---------------------------------------------------------------- pruned text
// @es Texto podado: los casos viven en pruned-text-cases.mjs.

registerPrunedTextCases({ test, expect, newRoot, put, read });

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

// ---------------------------------------------------------------- lazy sections
// @es Secciones diferidas: los casos viven en lazy-section-cases.mjs.

registerLazySectionCases({ test, expect, newRoot, put, read, installFakeCli });

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
  return context;
}
/** CLAUDE.md of a complete home with every lazy span loaded, as a raw v4 sync leaves it. @es CLAUDE.md de un home completo con todo tramo diferido cargado, como lo deja un sync v4 crudo. */
const withLoadedSpans = (context) => `${read(context.home, '.claude/CLAUDE.md')}${fullOrchestratorMd({ eol: '\r\n' })}`;
const flags = ({ home, modCache, fakeCli }) => ['--home', home, '--mod-cache', modCache, '--gentle-ai-node-script', fakeCli];

test('real list: every kind is registered and every id is unique', () => {
  CUSTOMIZATIONS.forEach((entry) => expect(KINDS[entry.kind] !== undefined, true, `kind of ${entry.id}`));
  expect(new Set(CUSTOMIZATIONS.map((entry) => entry.id)).size, CUSTOMIZATIONS.length, 'unique ids');
});

test('check.mjs: complete fixture -> exit 0', () => {
  expect(run('check.mjs', flags(completeHome())).status, 0, 'exit');
});

test('check.mjs: every lazy span loaded -> exit 1; apply.mjs moves them all -> exit 0; second apply -> exit 0, no change', () => {
  const context = completeHome();
  put(context.home, '.claude/CLAUDE.md', withLoadedSpans(context));
  expect(run('check.mjs', flags(context)).status, 1, 'check before');
  expect(run('apply.mjs', flags(context)).status, 0, 'apply');
  const moved = read(context.home, '.claude/CLAUDE.md');
  lazyEntries().forEach((entry) => expect(inspectSection(moved, entry).form, 'moved', `${entry.name} moved`));
  expect(run('apply.mjs', flags(context)).stdout.includes('nothing reapplicable was broken'), true, 'second apply');
  expect(read(context.home, '.claude/CLAUDE.md'), moved, 'bytes after second apply');
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
  const context = completeHome({ telemetryEnabled: true });
  const result = run('check.mjs', [...flags(context), '--json']);
  const report = JSON.parse(result.stdout);
  expect(result.status, 1, 'exit');
  expect(report.exitCode, 1, 'exitCode field');
  const broken = report.results.filter((entry) => entry.status === 'broken');
  expect(broken.map((entry) => entry.id).join(','), 'gentle-ai-telemetry-disabled', 'broken ids');
  expect(broken[0].reapplicable, true, 'reapplicable carried');
});

test('apply.mjs --dry-run: every loaded span would move, nothing is written, exit is the current verdict; apply.mjs then moves them -> exit 0', () => {
  const context = completeHome();
  const withSpans = withLoadedSpans(context);
  put(context.home, '.claude/CLAUDE.md', withSpans);
  const dry = run('apply.mjs', [...flags(context), '--dry-run']);
  expect(dry.status, 1, 'dry-run exit');
  lazyEntries().forEach((entry) => expect(dry.stdout.includes(`WOULD-MOVE lazy-${entry.name}`), true, `dry-run names ${entry.name} (${dry.stdout})`));
  expect(read(context.home, '.claude/CLAUDE.md'), withSpans, 'CLAUDE.md after dry run');
  expect(run('apply.mjs', flags(context)).status, 0, 'apply exit');
  const moved = lazyEntries().reduce((text, entry) => reconcileSection(text, entry, { keepLoaded: false, stash: null, stashLabel: `~/${entry.stash}` }).text, withSpans);
  expect(read(context.home, '.claude/CLAUDE.md'), moved, 'CLAUDE.md after apply');
});

test('check.mjs --json: the lazy sections report syncSafe, every other kind does not', () => {
  const report = JSON.parse(run('check.mjs', [...flags(completeHome()), '--json']).stdout);
  const safe = report.results.filter((entry) => entry.syncSafe === true).map((entry) => entry.id);
  expect(
    safe.join(','),
    'lazy-blocking-prompts,lazy-delegated-verification,lazy-review-contract,lazy-delegation-restatement,lazy-routing-ladder,lazy-skill-discovery,lazy-skill-registry-protocol,lazy-odd-reference,lazy-rdd-user-owned',
    'sync-safe ids',
  );
});

test('the real list carries no customization of a file gentle-ai v4 no longer installs (no SDD phase agent or skill)', () => {
  CUSTOMIZATIONS.filter((entry) => entry.file !== undefined).forEach((entry) => expect(/sdd-/.test(entry.file), false, `${entry.id}: ${entry.file}`));
});

test('check.mjs: reference unavailable, nothing broken -> exit 2', () => {
  const context = completeHome();
  rmSync(context.modCache, { recursive: true, force: true });
  expect(run('check.mjs', flags(context)).status, 2, 'exit');
});

// ---------------------------------------------------------------- the sync wrapper
// @es El envoltorio de sync: los casos viven en sync-wrapper-cases.mjs.

registerSyncWrapperCases({ test, expect, newRoot, put, read, installFakeCli, completeHome, agentFile, run });

// ---------------------------------------------------------------- the self-healing hooks
// @es Los hooks que se reparan solos: los casos viven en reapply-cases.mjs.

registerReapplyCases({ test, expect, newRoot, put, read, installFakeCli, completeHome, agentFile, run });

// ---------------------------------------------------------------- the hook

test('hook: all held -> exit 0 and silent', () => {
  const result = run('session-start-hook.mjs', flags(completeHome()));
  expect(result.status, 0, 'exit');
  expect(result.stdout, '', 'stdout');
});

test('hook: drift -> exit 0 with valid JSON naming the apply command', () => {
  const context = completeHome({ telemetryEnabled: true });
  const result = run('session-start-hook.mjs', flags(context));
  expect(result.status, 0, 'exit');
  const message = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  expect(message.includes('apply.mjs') && message.includes('gentle-ai-telemetry-disabled'), true, 'advisory');
  expect(message.includes('gentle-ai-overlay/sync.mjs'), true, 'advisory names the sync wrapper');
});

test('hook: its own malfunction (its sibling modules are missing) -> still exit 0, and says the check failed', () => {
  const { home } = newRoot();
  const lonelyHook = path.join(home, 'session-start-hook.mjs');
  copyFileSync(path.join(HERE, 'session-start-hook.mjs'), lonelyHook);
  const result = spawnSync(process.execPath, [lonelyHook], { encoding: 'utf8' });
  expect(result.status, 0, 'exit');
  expect(result.stdout.includes('the drift check itself failed'), true, `stdout (${result.stdout})`);
});

// ---------------------------------------------------------------- bilingual runtime messages
// Every runtime message is English first, then its Spanish half marked `@es`. @es Todo mensaje de
// ejecución va en inglés primero y luego su mitad en español marcada `@es`.

const withEs = (line) => line !== undefined && /@es \S/.test(line);
const lineWith = (text, needle) => text.split('\n').find((line) => line.includes(needle));

test('bilingual: apply.mjs says in both languages that nothing was broken, and labels its verdict in both', () => {
  const context = completeHome();
  const { stdout } = run('apply.mjs', flags(context));
  expect(withEs(lineWith(stdout, 'nothing reapplicable was broken')), true, `no-op line (${stdout})`);
  expect(withEs(lineWith(stdout, 'verdict after apply')), true, 'verdict heading');
});

test('bilingual: the drift advisory carries both halves on its header, restore and re-check lines, and for a withheld tool', () => {
  const context = completeHome();
  put(context.home, needsBash.file, agentFile({ tools: `Read, ${MCP}` }));
  put(context.home, withholdsBash.file, agentFile({ tools: 'WebFetch, Bash' }));
  const message = driftAdvisory(evaluateAll([needsBash, withholdsBash], context));
  ['local customization(s)', 'Restore the reapplicable ones with:', 'A withheld tool was granted', 'Re-check with:', 'Sync only through the wrapper'].forEach((needle) => expect(withEs(lineWith(message, needle)), true, `line "${needle}"`));
});

test('bilingual: the hook malfunction message carries both halves', () => {
  const { home } = newRoot();
  const lonelyHook = path.join(home, 'session-start-hook.mjs');
  copyFileSync(path.join(HERE, 'session-start-hook.mjs'), lonelyHook);
  const message = JSON.parse(spawnSync(process.execPath, [lonelyHook], { encoding: 'utf8' }).stdout).systemMessage;
  expect(withEs(message), true, `message (${message})`);
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
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exitCode = failed === 0 ? 0 : 1;
