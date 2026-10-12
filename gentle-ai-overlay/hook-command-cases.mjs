/**
 * Selftest cases of the `hook-command-replacement` kind and of `go-json.mjs`, on constructed fixtures only (the
 * committed `settings.json` is read, never the live one): held, a FRESH SYNC RENDER (what `gentle-ai sync` leaves when
 * a replacement is already registered, measured 2026-10-12 on gentle-ai 4.0.0: its own entry appended to each event
 * with its own matcher and timeout), the first adoption (only the upstream command), the shapes a real edit
 * produces, and the byte-level promises (escapes, line ending, final newline). They live apart from selftest.mjs,
 * which owns the harness and hands it in.
 *
 * @es Casos del selftest del tipo `hook-command-replacement` y de `go-json.mjs`, solo sobre fixtures construidos (se
 * lee el `settings.json` versionado, nunca el vivo): held, un RENDER FRESCO DE SYNC (lo que deja `gentle-ai sync` con un
 * reemplazo ya registrado, medido el 2026-10-12 con gentle-ai 4.0.0: su entrada añadida a cada evento con su matcher y
 * su timeout), la primera adopción (solo el comando de upstream), las formas que produce una edición real y las
 * promesas a nivel de byte (escapes, final de línea, salto final). Viven aparte de selftest.mjs, que es dueño del arnés.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUSTOMIZATIONS } from './customizations.mjs';
import { goJsonText } from './go-json.mjs';
import { KINDS, applyAll, evaluateAll, planAll } from './invariants.mjs';
import { reapplySyncSafe } from './reapply-hook-output.mjs';
import { readTextOrNull } from './text-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UPSTREAM = 'gentle-ai review stop-hook --agent claude-code';
const REPLACEMENT = 'node "$HOME/.claude/review-site/stop-hook.mjs"';
const FILE = '.claude/settings.json';
const entryFor = (event) => ({ id: `h-${event}`, kind: 'hook-command-replacement', file: FILE, event, upstream: UPSTREAM, replacement: REPLACEMENT });
const stop = entryFor('Stop');
const start = entryFor('SessionStart');
const ENTRIES = [start, stop];

const START_MATCHER = 'startup|resume|clear|compact';
const group = (command, extra = {}, matcher = '') => ({ hooks: [{ command, type: 'command', ...extra }], matcher });
const telemetry = { hooks: [{ async: true, command: 'gentle-ai telemetry runtime claude --json', timeout: 5, type: 'command' }], matcher: '' };
/** An unrelated string with the characters Go escapes, to prove the rest of the file keeps its escapes. @es Una cadena ajena con los caracteres que Go escapa. */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const OWNER_NOTE = `owner <note> & ñandú 日本 ${LINE_SEPARATOR} end`;

/** The settings of a home that has ADOPTED the replacement: ours on both events, plus unrelated entries. @es Los settings de un home que ADOPTÓ el reemplazo. */
const adopted = () => ({
  note: OWNER_NOTE,
  hooks: {
    SessionStart: [group(REPLACEMENT, { timeout: 30 }, START_MATCHER), group('node "$HOME/.claude/other/start.mjs"', { timeout: 15 }, START_MATCHER)],
    Stop: [group('node "$HOME/.claude/other/stop.mjs"', { timeout: 30 }), group(REPLACEMENT, { timeout: 60 }), telemetry],
  },
});

/** What `gentle-ai sync` leaves of `settings`: its own entry appended to each event, as measured. @es Lo que deja `gentle-ai sync`. */
function freshSyncRender(settings) {
  const copy = JSON.parse(JSON.stringify(settings));
  copy.hooks.SessionStart.push(group(UPSTREAM, { timeout: 30 }, START_MATCHER));
  copy.hooks.Stop.splice(copy.hooks.Stop.length - 1, 0, group(UPSTREAM, { timeout: 60 }));
  return copy;
}

/** Settings that still run only gentle-ai's own hook: the state before the replacement was adopted. @es Los settings antes de adoptar el reemplazo. */
const beforeAdoption = () => ({
  note: OWNER_NOTE,
  hooks: {
    SessionStart: [group(UPSTREAM, { timeout: 30 }, START_MATCHER)],
    Stop: [group(UPSTREAM, { timeout: 60 })],
  },
});

/**
 * The settings of a home that runs OUR hook command on every event the real list replaces: what a fixture home needs
 * to satisfy the real customization list. @es Los settings de un home que corre NUESTRO comando de hook en cada evento
 * que reemplaza la lista real: lo que un home de fixture necesita para cumplir la lista real.
 */
export function settingsHoldingTheReplacements(customizations = CUSTOMIZATIONS) {
  const hooks = Object.fromEntries(customizations.filter((candidate) => candidate.kind === 'hook-command-replacement').map((entry) => [entry.event, [group(entry.replacement)]]));
  return goJsonText({ hooks });
}

export function registerHookCommandCases({ test, expect: expectIdentical, newRoot, put, read }) {
  /** Deep equality by JSON text: the selftest's own `expect` compares with `===`. @es Igualdad profunda por texto JSON. */
  const expect = (actual, expected, label) => expectIdentical(JSON.stringify(actual), JSON.stringify(expected), label);
  const homeWith = (text) => {
    const context = newRoot();
    if (text !== undefined) put(context.home, FILE, text);
    return context;
  };
  const homeOf = (settings, options) => homeWith(goJsonText(settings, options));
  const statusesOf = (context) => evaluateAll(ENTRIES, context).map((result) => result.status);

  test('hook command: the replacement alone on both events -> held; apply writes nothing', () => {
    const text = goJsonText(adopted());
    const context = homeWith(text);
    expect(statusesOf(context), ['held', 'held'], 'statuses');
    expect(applyAll(ENTRIES, context).length, 0, 'apply');
    expect(read(context.home, FILE), text, 'bytes');
  });

  test('hook command: the upstream command registered -> broken, sync-safe and reapplicable', () => {
    const results = evaluateAll(ENTRIES, homeOf(beforeAdoption()));
    expect(results.map((result) => result.status), ['broken', 'broken'], 'statuses');
    expect(results.map((result) => [result.syncSafe, result.reapplicable]), [[true, true], [true, true]], 'sync-safe and reapplicable');
  });

  test('hook command: first adoption rewrites the upstream command IN PLACE, keeping matcher and timeout, then held', () => {
    const context = homeOf(beforeAdoption());
    expect(applyAll(ENTRIES, context).map((outcome) => outcome.outcome), ['applied', 'applied'], 'apply');
    const settings = JSON.parse(read(context.home, FILE));
    expect(settings.hooks.SessionStart, [group(REPLACEMENT, { timeout: 30 }, START_MATCHER)], 'SessionStart');
    expect(settings.hooks.Stop, [group(REPLACEMENT, { timeout: 60 })], 'Stop');
    expect(statusesOf(context), ['held', 'held'], 'statuses after');
    expect(applyAll(ENTRIES, context).length, 0, 'second apply');
  });

  test('hook command: a FRESH SYNC RENDER (the replacement kept, gentle-ai appended its own) -> broken; apply gives back exactly the adopted file', () => {
    const adoptedText = goJsonText(adopted());
    const context = homeOf(freshSyncRender(adopted()));
    expect(statusesOf(context), ['broken', 'broken'], 'statuses after the sync');
    expect(applyAll(ENTRIES, context).map((outcome) => outcome.outcome), ['applied', 'applied'], 'apply');
    expect(read(context.home, FILE), adoptedText, 'bytes: the replacement kept, gentle-ai entry gone, every other entry as it was');
    expect(statusesOf(context), ['held', 'held'], 'statuses after');
    expect(applyAll(ENTRIES, context).length, 0, 'second apply');
  });

  test('hook command: the hook that re-applies after a raw sync removes what sync appended and tells the user', () => {
    const context = homeOf(freshSyncRender(adopted()));
    const { systemMessage } = reapplySyncSafe(context, ENTRIES);
    expect(read(context.home, FILE), goJsonText(adopted()), 'bytes');
    expect(ENTRIES.every((entry) => systemMessage.includes(`re-applied ${entry.id}`)), true, `message (${systemMessage})`);
  });

  test('hook command: gentle-ai entry in the same group as ours -> only that hook goes, the group stays', () => {
    const settings = adopted();
    settings.hooks.Stop[1].hooks.push({ command: UPSTREAM, timeout: 60, type: 'command' });
    const context = homeOf(settings);
    applyAll([stop], context);
    expect(JSON.parse(read(context.home, FILE)).hooks.Stop, adopted().hooks.Stop, 'Stop');
  });

  test('hook command: the upstream command twice and no replacement -> the first is rewritten, the other removed', () => {
    const settings = beforeAdoption();
    settings.hooks.Stop.push(group(UPSTREAM, { timeout: 5 }));
    const context = homeOf(settings);
    applyAll([stop], context);
    expect(JSON.parse(read(context.home, FILE)).hooks.Stop, [group(REPLACEMENT, { timeout: 60 })], 'Stop');
    expect(statusesOf(context), ['broken', 'held'], 'the other event is untouched');
  });

  test('hook command: the other event is untouched when only one is broken', () => {
    const settings = adopted();
    settings.hooks.Stop.push(group(UPSTREAM, { timeout: 60 }));
    const context = homeOf(settings);
    expect(statusesOf(context), ['held', 'broken'], 'statuses');
    applyAll(ENTRIES, context);
    const after = JSON.parse(read(context.home, FILE));
    expect(after.hooks.SessionStart, adopted().hooks.SessionStart, 'SessionStart');
    expect(after.hooks.Stop, adopted().hooks.Stop, 'Stop');
  });

  test('hook command near miss: a command that only MENTIONS the upstream command is neither counted nor touched', () => {
    const settings = adopted();
    settings.hooks.Stop.push(group(`echo ${UPSTREAM}`), group(`${UPSTREAM} --extra`));
    const context = homeOf(settings);
    expect(statusesOf(context), ['held', 'held'], 'statuses');
    const text = read(context.home, FILE);
    expect(applyAll(ENTRIES, context).length, 0, 'apply');
    expect(read(context.home, FILE), text, 'bytes');
    const before = beforeAdoption();
    before.hooks.Stop.push(group(`echo ${UPSTREAM}`));
    const mentioned = homeOf(before);
    applyAll([stop], mentioned);
    expect(JSON.parse(read(mentioned.home, FILE)).hooks.Stop, [group(REPLACEMENT, { timeout: 60 }), group(`echo ${UPSTREAM}`)], 'only the exact command was rewritten');
  });

  test('hook command: a group that is not an object with hooks is left as it is', () => {
    const settings = adopted();
    settings.hooks.Stop.push({ matcher: 'x' });
    settings.hooks.Stop.push(group(UPSTREAM, { timeout: 60 }));
    const context = homeOf(settings);
    applyAll([stop], context);
    const expected = adopted();
    expected.hooks.Stop.push({ matcher: 'x' });
    expect(JSON.parse(read(context.home, FILE)).hooks.Stop, expected.hooks.Stop, 'Stop');
  });

  test('hook command: neither command registered -> broken and refused naming the anchor; the file is untouched', () => {
    const text = goJsonText({ hooks: { Stop: [group('node other.mjs')], SessionStart: [] } });
    const context = homeWith(text);
    const [result] = evaluateAll([stop], context);
    expect(result.status, 'broken', 'status');
    expect(result.detail.startsWith('neither the upstream command'), true, `detail (${result.detail})`);
    expect(applyAll([stop], context)[0].outcome, 'refused', 'apply');
    expect(read(context.home, FILE), text, 'bytes');
  });

  test('hook command: the replacement registered twice -> refused, untouched, even with the upstream command present', () => {
    const settings = adopted();
    settings.hooks.Stop.push(group(REPLACEMENT, { timeout: 60 }), group(UPSTREAM, { timeout: 60 }));
    const text = goJsonText(settings);
    const context = homeWith(text);
    expect(evaluateAll([stop], context)[0].status, 'broken', 'status');
    expect(applyAll([stop], context)[0].outcome, 'refused', 'apply');
    expect(read(context.home, FILE), text, 'bytes');
  });

  test('hook command: a missing file, invalid JSON, a non-object and an event that is not a list -> broken, refused, nothing created or changed', () => {
    const missing = homeWith(undefined);
    expect(evaluateAll([stop], missing)[0].status, 'broken', 'missing');
    expect(applyAll([stop], missing)[0].outcome, 'refused', 'missing apply');
    expect(readTextOrNull(path.join(missing.home, FILE)), null, 'still absent');
    for (const text of ['{ not json', '[1, 2]', 'null', goJsonText({ hooks: { Stop: 'x' } }), goJsonText({})]) {
      const context = homeWith(text);
      expect(evaluateAll([stop], context)[0].status, 'broken', `status of ${text.slice(0, 12)}`);
      expect(applyAll([stop], context)[0].outcome, 'refused', `apply of ${text.slice(0, 12)}`);
      expect(read(context.home, FILE), text, `bytes of ${text.slice(0, 12)}`);
    }
  });

  test('hook command: the rest of the file keeps its bytes, escapes included; CRLF and a missing final newline are kept', () => {
    for (const options of [{ eol: '\n', trailingNewline: true }, { eol: '\r\n', trailingNewline: true }, { eol: '\n', trailingNewline: false }]) {
      const context = homeOf(freshSyncRender(adopted()), options);
      applyAll(ENTRIES, context);
      expect(read(context.home, FILE), goJsonText(adopted(), options), `bytes for ${JSON.stringify(options)}`);
    }
    expect(goJsonText(adopted()).includes('\\u003cnote\\u003e \\u0026'), true, 'the fixture really carries Go escapes');
  });

  test('hook command: plan names the swap and writes nothing; a held case plans nothing; a refused case plans a refusal', () => {
    const before = goJsonText(beforeAdoption());
    const context = homeWith(before);
    expect(planAll(ENTRIES, context).map((plan) => plan.outcome), ['would-replace', 'would-replace'], 'plan before adoption');
    const render = goJsonText(freshSyncRender(adopted()));
    put(context.home, FILE, render);
    expect(planAll(ENTRIES, context).map((plan) => plan.outcome), ['would-remove', 'would-remove'], 'plan after a sync');
    expect(read(context.home, FILE), render, 'file untouched');
    expect(KINDS[stop.kind].plan(stop, homeOf(adopted())).outcome, 'unchanged', 'held plan');
    expect(KINDS[stop.kind].plan(stop, homeWith('{ nope')).outcome, 'refused', 'refused plan');
  });

  test('hook command: every REAL entry is distinct, its replacement does not contain its upstream, and the pair covers SessionStart and Stop', () => {
    const real = CUSTOMIZATIONS.filter((candidate) => candidate.kind === 'hook-command-replacement');
    expect(real.map((entry) => entry.event).sort(), ['SessionStart', 'Stop'], 'events');
    expect(new Set(real.map((entry) => entry.id)).size, real.length, 'unique ids');
    real.forEach((entry) => {
      expect(entry.upstream === entry.replacement, false, `${entry.id}: distinct`);
      expect(entry.replacement.includes(entry.upstream), false, `${entry.id}: replacement does not contain upstream`);
    });
  });

  test('hook command: the COMMITTED settings.json satisfies every real entry, and a fresh sync render of it is healed back to it', () => {
    const real = CUSTOMIZATIONS.filter((candidate) => candidate.kind === 'hook-command-replacement');
    const committed = readFileSync(path.join(HERE, '..', 'settings.json'), 'utf8');
    const context = homeWith(committed);
    expect(evaluateAll(real, context).map((result) => result.status), ['held', 'held'], 'committed file holds');
    const settings = JSON.parse(committed);
    settings.hooks.SessionStart.push(group(real[0].upstream, { timeout: 30 }, START_MATCHER));
    settings.hooks.Stop.push(group(real[0].upstream, { timeout: 60 }));
    put(context.home, FILE, goJsonText(settings));
    expect(evaluateAll(real, context).map((result) => result.status), ['broken', 'broken'], 'a fresh sync render breaks it');
    applyAll(real, context);
    expect(read(context.home, FILE), committed, 'healed to the committed bytes');
  });

  test('go-json: the committed settings.json round-trips byte for byte, which a plain JSON.stringify does not', () => {
    const committed = readFileSync(path.join(HERE, '..', 'settings.json'), 'utf8');
    expect(goJsonText(JSON.parse(committed)), committed, 'go form');
  });

  test('go-json: the characters Go escapes become \\uXXXX, nothing else changes, and the line ending and final newline are the caller\'s', () => {
    const backslash = String.fromCharCode(92);
    const special = `<&>${String.fromCharCode(0x2028, 0x2029)}`;
    const plain = JSON.stringify({ a: special, b: ['ñ', 1] }, null, 2);
    expect(goJsonText({ a: special, b: ['ñ', 1] }, { trailingNewline: false }), plain.replace(special, ['u003c', 'u0026', 'u003e', 'u2028', 'u2029'].map((code) => backslash + code).join('')), 'escapes');
    expect(goJsonText({ a: 1 }), '{\n  "a": 1\n}\n', 'default');
    expect(goJsonText({ a: 1 }, { eol: '\r\n', trailingNewline: false }), '{\r\n  "a": 1\r\n}', 'CRLF without a final newline');
  });
}
