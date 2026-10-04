#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `baseline-record/summary.mjs`, the bilingual human summary of a baseline record.
 * Every case renders a CONSTRUCTED record, never a measured one.
 *
 * THE STATE SPACE: the message table (an entry without its Spanish half, an unknown id, an unfilled
 * placeholder, accents kept), every line printed (English first, then `@es`, then Spanish), each section
 * (budget measured and not, journals, registry, tips, product repos clean and dirty, the discovery
 * `.claude/` inventory present and missing), and the latency lines (clean, dirty and unknown run sets, each
 * on its own line with the other one saying it was not measured; a failed measurement).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `summary.mjs`, el resumen bilingüe de un registro base. Cada caso
 * renderiza un registro CONSTRUIDO, nunca uno medido. Espacio de estados: la tabla de mensajes (sin mitad
 * española, id desconocido, marcador sin rellenar, tildes), cada línea impresa y cada sección, incluidas las
 * líneas de latencia (limpia, sucia y desconocida, cada una en su línea).
 */

import { MESSAGES, renderLine, renderSummary as renderUnsafe } from './summary.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** What `action` returns, or `threw: <message>`. @es Lo que devuelve `action`, o `threw: <mensaje>`. */
function outcome(action) {
  try {
    return action();
  } catch (error) {
    return `threw: ${error.message}`;
  }
}

/** The summary lines, or one `threw:` line: a failure is a checked value, never a crash of the selftest. @es Las líneas del resumen, o una línea `threw:`. */
const renderSummary = (given) => {
  try {
    return renderUnsafe(given);
  } catch (error) {
    return [`threw: ${error.message}`];
  }
};

const budget = (raw, exitCode = 1, measured = true) => ({ command: `node capture.mjs budget --project p`, exitCode, measured, rawChars: raw, harnessChars: raw - 900, ceiling: 147000, projectRawChars: 77449 });
const latency = (scenario) => ({ measured: true, command: 'node replay.mjs latency', exitCode: 0, result: { runs: 20, medianMs: 410.5, p95Ms: 620.1, firstMs: 800, liveTranscripts30min: 3, finishedWorkerTranscripts6h: 5, transcriptBytes: 123456, repos: [{ name: '~/.claude', dirty: scenario === 'dirty' }, { name: 'b100-am-ui/.claude', dirty: false }], scenario } });
const record = (overrides = {}) => ({
  recordedAt: '2026-10-04T20:00:00.000Z',
  budget: { global: budget(118092), project: budget(244965) },
  journals: { files: [{ file: 'a/state/x.jsonl', lines: 4 }, { file: 'b/state/y.jsonl', lines: 2 }], perGuard: { a: 4, b: 2 }, totalLines: 6 },
  registry: { settings: { events: { Stop: { groups: 2, hooks: 3 }, PreToolUse: { groups: 1, hooks: 2 } }, totalHooks: 5 }, manifests: { files: { 'stop.json': 8, 'pre.json': 4 }, totalGuards: 12 }, sidecars: 21 },
  tips: [{ name: '~/.claude', tip: 'a'.repeat(40), branch: 'master' }, { name: 'b100-am-ui/.claude', tip: 'b'.repeat(40), branch: 'master' }],
  productRepos: [{ name: 'clean-repo', measured: true, lines: [] }, { name: 'dirty-repo', measured: true, lines: [' M a.txt', '?? b.txt'] }],
  discoveryClaude: { inventory: { exists: true, entries: [{ name: 'CLAUDE.md' }, { name: 'worktrees' }], totalFiles: 3711, totalBytes: 99 }, porcelain: { measured: true, lines: [] } },
  stopLatency: latency('clean'),
  ...overrides
});

// --- the message table and its renderer ---
check('table: every entry has both halves, non-empty', Object.entries(MESSAGES).filter(([, entry]) => !(entry.en?.length > 0 && entry.es?.length > 0)).map(([id]) => id), []);
check('render: English first, then @es, then Spanish', renderLine({ hello: { en: 'Hi {n}', es: 'Hola {n}' } }, 'hello', { n: 'x' }), 'Hi x @es Hola x');
check('render: an entry without its Spanish half throws', /^threw: .*@es /.test(outcome(() => renderLine({ bad: { en: 'English only' } }, 'bad', {}))), true);
check('render: an entry with an empty Spanish half throws', /^threw: /.test(outcome(() => renderLine({ bad: { en: 'English', es: '' } }, 'bad', {}))), true);
check('render: an entry without its English half throws', /^threw: .*@es /.test(outcome(() => renderLine({ bad: { es: 'solo español' } }, 'bad', {}))), true);
check('render: an entry with an empty English half throws', /^threw: .*@es /.test(outcome(() => renderLine({ bad: { en: '', es: 'español' } }, 'bad', {}))), true);
check('render: an unknown message id throws', /^threw: .*@es /.test(outcome(() => renderLine({}, 'nope', {}))), true);
check('render: a placeholder with no value throws', /^threw: .*@es /.test(outcome(() => renderLine({ m: { en: 'a {x}', es: 'b {x}' } }, 'm', {}))), true);
check('render: a value of zero is a value', outcome(() => renderLine({ m: { en: 'a {x}', es: 'b {x}' } }, 'm', { x: 0 })), 'a 0 @es b 0');
check('render: a placeholder that repeats is filled everywhere', renderLine({ m: { en: '{x} {x}', es: '{x}' } }, 'm', { x: 'q' }), 'q q @es q');
check('table: the Spanish keeps its accents', [MESSAGES.journals.es.includes('líneas'), MESSAGES.journalsPerGuard.es.includes('Líneas'), MESSAGES.noRepos.es.includes('encontró'), MESSAGES.discoveryMissing.es.includes('inventarió'), MESSAGES.budgetProject.es.includes('más')], [true, true, true, true, true]);

// --- the whole summary ---
{
  const lines = outcome(() => renderSummary(record()));

  check('summary: every printed line has an English half, @es, and a Spanish half', Array.isArray(lines) && lines.every((line) => /^\S.* @es \S/.test(line)), true);
  check('summary: no printed line is empty or shows an unfilled placeholder', Array.isArray(lines) && lines.every((line) => line.trim() !== '' && !/\{\w+\}/.test(line)), true);

  const text = Array.isArray(lines) ? lines.join('\n') : String(lines);

  /** Whether a printed line starts with this exact English text, so each figure sits in its own place. @es Si una línea empieza con este texto inglés exacto. */
  const has = (english) => lines.some((printed) => printed.startsWith(`${english} @es `));

  check('summary: the title carries the time of the record', has('Baseline record taken at 2026-10-04T20:00:00.000Z.'), true);
  check('summary: the global figure, its harness count, ceiling, command and exit code', has('Global always-loaded set: 118092 raw characters (harness-counted 117192) against the ceiling 147000; command: node capture.mjs budget --project p; exit 1.'), true);
  check('summary: the project figure, its harness count and its own share', has('b100 always-loaded set (global plus project): 244965 raw characters (harness-counted 244065), of which 77449 in the project files; command: node capture.mjs budget --project p; exit 1.'), true);
  check('summary: journal totals', has('Guard journals: 2 files, 6 lines in total.'), true);
  check('summary: the per-guard lines', has('Journal lines per guard: a=4, b=2.'), true);
  check('summary: registry totals', has('Hook registry: 2 settings events with 5 hooks; 2 manifests with 12 guards; 21 registration sidecars.'), true);
  check('summary: each tip with its branch', [has(`Git tip of ~/.claude: ${'a'.repeat(40)} on master.`), has(`Git tip of b100-am-ui/.claude: ${'b'.repeat(40)} on master.`)], [true, true]);
  check('summary: a clean product repo is said clean', has('Product repo clean-repo: clean.'), true);
  check('summary: a dirty product repo lists its count and its raw paths', has('Product repo dirty-repo: 2 changed paths:  M a.txt; ?? b.txt.'), true);
  check('summary: the discovery inventory counts', has('di_1700002_discovery_fe/.claude/: 3711 files and 99 bytes in 2 top-level entries; 0 git status lines.'), true);
  check('summary: no aggregate appears anywhere', /aggregate|agregado/i.test(text), false);
}

// --- the other states of the sections ---
{
  const unmeasured = outcome(() => renderSummary(record({ budget: { global: budget(0, 2, false), project: budget(244965) } }))).join('\n');

  check('budget: a figure that was not measured is said NOT MEASURED, with its exit code, and shows no figure', [/NOT MEASURED.*global/.test(unmeasured), unmeasured.includes('exit 2'), unmeasured.includes('Global always-loaded')], [true, true, false]);

  const missingDiscovery = outcome(() => renderSummary(record({ discoveryClaude: { inventory: { exists: false }, porcelain: { measured: true, lines: [] } } }))).join('\n');

  check('discovery: a missing directory is said missing, not zero files', [/\.claude\/ is missing/.test(missingDiscovery), missingDiscovery.includes('0 files')], [true, false]);

  const failedRepo = outcome(() => renderSummary(record({ productRepos: [{ name: 'broken', measured: false, lines: [] }] }))).join('\n');

  check('product repo: a status that failed is NOT MEASURED, never clean', [/NOT MEASURED.*broken/.test(failedRepo), failedRepo.includes('broken: clean')], [true, false]);
  const withStatus = outcome(() => renderSummary(record({ discoveryClaude: { inventory: { exists: true, entries: [{ name: 'a' }], totalFiles: 1, totalBytes: 2 }, porcelain: { measured: true, lines: ['?? x', '?? y'] } } })));

  check('discovery: the git status lines are counted', withStatus.some((printed) => printed.startsWith('di_1700002_discovery_fe/.claude/: 1 files and 2 bytes in 1 top-level entries; 2 git status lines. @es ')), true);

  const noStatus = outcome(() => renderSummary(record({ discoveryClaude: { inventory: { exists: true, entries: [], totalFiles: 0, totalBytes: 0 }, porcelain: { measured: false, exitCode: 128, lines: [] } } }))).join('\n');

  check('discovery: a git status that failed is NOT MEASURED with its exit code, never zero lines', [/git status NOT MEASURED \(exit 128\)/.test(noStatus), noStatus.includes('0 git status lines')], [true, false]);
  check('render: an id that is an inherited object key is unknown, not a message', /^threw: Unknown message id constructor/.test(outcome(() => renderLine({}, 'constructor', {}))), true);

  const noRegistry = renderSummary(record({ registry: { settings: 'unreadable', manifests: { files: {}, totalGuards: 0 }, sidecars: 'unmeasurable' } })).join('\n');

  check('registry: unreadable settings are NOT MEASURED, never a count of zero hooks', [/NOT MEASURED: the hook registry/.test(noRegistry), noRegistry.includes('Hook registry:')], [true, false]);

  const noTip = outcome(() => renderSummary(record({ tips: [{ name: 'orphan', tip: undefined, tipExit: 128 }] }))).join('\n');

  check('tip: a repo with no tip is NOT MEASURED with its exit code, never a blank tip', [/NOT MEASURED.*orphan.*exit 128/.test(noTip), noTip.includes('undefined')], [true, false]);
  check('product repos: none found is said so', outcome(() => renderSummary(record({ productRepos: [] }))).join('\n').includes('No product repository'), true);
}

// --- latency: clean, dirty and unknown run sets each on their own line ---
{
  const lines = (scenario) => outcome(() => renderSummary(record({ stopLatency: latency(scenario) })));
  const clean = lines('clean');
  const dirty = lines('dirty');
  const unknown = lines('unknown');
  const find = (all, pattern) => all.filter((line) => pattern.test(line));

  check('latency clean: the figures are on the clean line and the dirty line says not measured', [find(clean, /^Stop latency, clean repos: median 410.5 ms/).length, find(clean, /^Stop latency, dirty repos: not measured/).length], [1, 1]);
  check('latency dirty: the figures are on the dirty line, apart, and the clean line says not measured', [find(dirty, /^Stop latency, dirty repos: median 410.5 ms/).length, find(dirty, /^Stop latency, clean repos: not measured/).length], [1, 1]);
  check('latency dirty: the figures never appear on two lines', dirty.filter((line) => line.includes('410.5')).length, 1);
  check('latency unknown: the figures carry the unknown state and neither the clean nor the dirty label', [find(unknown, /^Stop latency, repo state unknown: median 410.5 ms/).length, find(unknown, /^Stop latency, (clean|dirty) repos: median/).length], [1, 0]);
  check('latency: p95, the first run and the run count are on the figures line', [/p95 620.1 ms/.test(find(clean, /median/)[0]), /first run 800 ms/.test(find(clean, /median/)[0]), /20 runs/.test(find(clean, /median/)[0])], [true, true, true]);
  check('latency: transcripts in reach and their bytes', [find(clean, /live transcripts/)[0]?.includes('3 live'), find(clean, /live transcripts/)[0]?.includes('5 finished'), find(clean, /live transcripts/)[0]?.includes('123456 transcript bytes')], [true, true, true]);
  check('latency: each repo is listed clean or dirty', [find(clean, /^Stop latency repos/)[0]?.startsWith('Stop latency repos: ~/.claude=clean, b100-am-ui/.claude=clean. @es '), find(dirty, /^Stop latency repos/)[0]?.startsWith('Stop latency repos: ~/.claude=dirty, b100-am-ui/.claude=clean. @es ')], [true, true]);

  const odd = outcome(() => renderSummary(record({ stopLatency: { ...latency('unknown'), result: { ...latency('unknown').result, repos: [{ name: 'x', dirty: 'unreadable' }] } } })));

  check('latency: a repo whose state could not be read is listed unreadable', odd.some((printed) => printed.startsWith('Stop latency repos: x=unreadable. @es ')), true);

  const failed = outcome(() => renderSummary(record({ stopLatency: { measured: false, command: 'node replay.mjs latency', exitCode: 1 } }))).join('\n');

  check('latency: a failed measurement is NOT MEASURED, names its exit code and prints no figure', [/NOT MEASURED: Stop latency/.test(failed), /NOT MEASURED: Stop latency \(exit 1;/.test(failed), /median/.test(failed)], [true, true, false]);
}

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
