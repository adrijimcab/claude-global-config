/**
 * Selftest cases of the lazy-section machinery: the pure span logic (`lazy-section.mjs`) and the
 * `lazy-section` kind, on constructed fixtures only (never the live CLAUDE.md), in both line endings and
 * under both region ids gentle-ai has used (`sdd-orchestrator` in v2/v3, `orchestrator` in v4). The review
 * contract is one section of the list among others, so every section is held to the same cases. They live
 * apart from selftest.mjs, which owns the harness and hands it in.
 *
 * @es Casos del selftest de las secciones diferidas: la lógica pura del tramo (`lazy-section.mjs`) y el tipo
 * `lazy-section`, solo sobre fixtures construidos (nunca el CLAUDE.md vivo), con ambos finales de línea y
 * con los dos ids de región que gentle-ai ha usado (`sdd-orchestrator` en v2/v3, `orchestrator` en v4). El
 * contrato de revisiones es una sección de la lista entre otras, así que toda sección pasa los mismos casos.
 * Viven aparte de selftest.mjs, que es dueño del arnés y lo entrega.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, applyAll, evaluateAll } from './invariants.mjs';
import { inspectSection, pointerFor, reconcileSection, sha256 } from './lazy-section.mjs';
import { REVIEW_SPAN, lazyEntries, lazyEntryNamed, orchestratorMd, region, sectionMd, syncRegion } from './lazy-section-fixtures.mjs';
import { parseManagedRegions } from './managed-regions.mjs';
import { readTextOrNull } from './text-file.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGION_IDS = ['sdd-orchestrator', 'orchestrator'];
const bilingual = (text) => /@es \S/.test(text);

/** The pointer the first release of this feature wrote for the review contract, byte for byte (LF). @es El puntero que escribió la primera versión de esta función para el contrato de revisiones, byte a byte (LF). */
const HISTORIC_REVIEW_POINTER = [
  '#### Review Execution Contract',
  '',
  '<!-- owner-overlay:lazy-review-contract v1 sha256=SHA -->',
  'Receipt-driven development is off globally, so this contract is not loaded here; its exact text is in `~/.claude/gentle-ai-overlay/lazy/review-execution-contract.md`. READ THAT FILE IN FULL, and follow it as if it were written here, before any `gentle-ai review` command other than `gentle-ai review mode status`, before relaying a `gentle-ai.review-integration.consent/v3` envelope, and as soon as `gentle-ai review mode status` reports `effective: on`.',
  '@es El desarrollo guiado por recibos está apagado globalmente, así que este contrato no se carga aquí; su texto exacto está en `~/.claude/gentle-ai-overlay/lazy/review-execution-contract.md`. LEER ESE FICHERO COMPLETO, y seguirlo como si estuviera escrito aquí, antes de cualquier comando `gentle-ai review` distinto de `gentle-ai review mode status`, antes de transmitir un sobre `gentle-ai.review-integration.consent/v3`, y en cuanto `gentle-ai review mode status` informe `effective: on`.',
  '',
  '',
].join('\n');

export function registerLazySectionCases({ test, expect, newRoot, put, read, installFakeCli }) {
  const review = lazyEntryNamed('review-contract');
  const stashLabel = (entry) => `~/${entry.stash}`;
  const spanOf = (text, entry = review) => {
    const { start, end } = inspectSection(text, entry);
    return { start, end, bytes: text.slice(start, end) };
  };
  const lazy = (text, stash = null, keepLoaded = false, entry = review) => reconcileSection(text, entry, { keepLoaded, stash, stashLabel: stashLabel(entry) });

  // ------------------------------------------------------------ the list itself

  test('lazy list: the real list names the review contract and at least one section that is always lazy; every section is well formed', () => {
    const entries = lazyEntries();
    expect(review !== undefined, true, 'review contract present');
    expect(entries.some((entry) => entry.loadedWhile === undefined), true, 'an always-lazy section exists');
    expect(new Set(entries.map((entry) => entry.name)).size, entries.length, 'unique names');
    expect(new Set(entries.map((entry) => entry.stash)).size, entries.length, 'unique stashes');
    for (const entry of entries) {
      expect(entry.file, '.claude/CLAUDE.md', `${entry.name}: file`);
      expect(entry.stash.startsWith('.claude/gentle-ai-overlay/lazy/') && entry.stash.endsWith('.md'), true, `${entry.name}: stash path`);
      expect(entry.regions.length > 0, true, `${entry.name}: names its regions`);
      expect([entry.start, entry.end].every((line) => line.trim() !== '' && !line.includes('\n')), true, `${entry.name}: anchors are single lines`);
      expect(entry.pointer.en.includes('{stash}') && entry.pointer.en.includes('READ'), true, `${entry.name}: the pointer names the stash and says to read it`);
      expect(['when ', 'before ', 'as soon as '].some((trigger) => entry.pointer.en.includes(trigger)), true, `${entry.name}: the pointer says WHEN to read it`);
      expect(entry.loadedWhile === undefined || entry.loadedWhile === 'reviews-may-run', true, `${entry.name}: known loading condition`);
    }
  });

  test('lazy list: the review contract accepts both region ids gentle-ai has used', () => {
    expect(REGION_IDS.every((id) => review.regions.includes(id)), true, 'sdd-orchestrator and orchestrator');
  });

  // The v4-only spans name the v4 region ids alone: inside a v2/v3 render their anchors (`### Delegation Rules`
  // is rendered by both) must never be moved under a v4 pointer. @es Los tramos exclusivos de v4 nombran solo los
  // ids de región de v4: dentro de un render v2/v3 sus anclas nunca se mueven bajo un puntero de v4.
  const V4_ONLY = ['orchestrator-mental-model', 'delegation-and-verification', 'routing-and-hand-off', 'skill-registry-protocol', 'odd-reference'];
  for (const name of V4_ONLY) {
    test(`lazy list: "${name}" is v4-only, so its span inside the v2/v3 orchestrator region is refused, never moved`, () => {
      const entry = lazyEntryNamed(name);
      expect(entry.regions.includes('sdd-orchestrator'), false, 'no v3 region id');
      const v3 = sectionMd(entry, { regionId: 'sdd-orchestrator' });
      expect(reconcileSection(v3, entry, { keepLoaded: false, stash: null, stashLabel: stashLabel(entry) }).refused !== undefined, true, 'refused in a v3 render');
    });
  }

  // ------------------------------------------------------------ the pure span logic

  for (const regionId of REGION_IDS) {
    for (const eol of ['\n', '\r\n']) {
      const label = `${regionId} ${eol === '\n' ? 'LF' : 'CRLF'}`;
      const md = (options = {}) => orchestratorMd({ eol, regionId, ...options });

      test(`section ${label}: off + present -> moved; stash is the span byte for byte; nothing outside the span changes`, () => {
        const original = md();
        const span = spanOf(original);
        const result = lazy(original);
        expect(result.outcome, 'moved', 'outcome');
        expect(result.stash, span.bytes, 'stash bytes');
        expect(result.text.slice(0, span.start), original.slice(0, span.start), 'prefix');
        expect(result.text.endsWith(original.slice(span.end)), true, 'suffix');
        expect(parseManagedRegions(result.text).problems.length, 0, 'markers well formed');
      });

      test(`section ${label}: the pointer carries the sentinel sha, the stash label, every trigger, both languages, and the file's line ending`, () => {
        const original = md();
        const result = lazy(original);
        const pointer = result.text.slice(spanOf(original).start, result.text.length - (original.length - spanOf(original).end));
        expect(pointer.includes(`sha256=${sha256(result.stash)} -->`), true, 'sentinel sha');
        ['`~/.claude/gentle-ai-overlay/lazy/review-execution-contract.md`', 'other than `gentle-ai review mode status`', 'consent/v3', 'effective: on'].forEach((needle) => expect(pointer.includes(needle), true, `pointer holds ${needle}`));
        expect(pointer.includes('@es '), review.pointer.es !== undefined, 'the Spanish half is there only when the section declares it');
        expect(pointer.split('\r\n').join('').includes('\n'), eol === '\n', 'line ending');
      });

      test(`section ${label}: idempotent; keepLoaded restores the original bytes; keepLoaded on a present span changes nothing`, () => {
        const original = md();
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
        const original = md();
        const moved = lazy(original);
        expect(moved.outcome, 'moved', 'moved before the sync');
        const synced = syncRegion(moved.text, original, regionId);
        expect(synced, original, 'sync restores the span');
        const again = lazy(synced, moved.stash);
        expect(again.text, moved.text, 'moved again');
        expect(again.stash, moved.stash, 'stash again');
      });
    }
  }

  test('section: a CLAUDE.md moved by the first release (its bilingual pointer, byte for byte) is read as moved, and its pointer is brought up to date without touching the stash', () => {
    const original = orchestratorMd();
    const span = spanOf(original);
    const historic = original.slice(0, span.start) + HISTORIC_REVIEW_POINTER.replace('SHA', sha256(span.bytes)) + original.slice(span.end);
    expect(inspectSection(historic, review).form, 'moved', 'form');
    const repointed = lazy(historic, span.bytes);
    expect(repointed.outcome, 'repointed', 'outcome');
    expect(repointed.text, lazy(original).text, 'the pointer written today');
    expect(repointed.stash, span.bytes, 'the stash is the same bytes');
    expect(lazy(repointed.text, span.bytes).outcome, 'unchanged', 'idempotent');
    expect(inspectSection(repointed.text, review).sha, sha256(span.bytes), 'the sentinel sha is unchanged');
  });

  test('section: a moved pointer that differs from the declared one is repointed in any line ending, and a restore ignores the pointer', () => {
    for (const eol of ['\n', '\r\n']) {
      const moved = lazy(orchestratorMd({ eol }));
      const stale = moved.text.replace('READ IT IN FULL', 'read it sometime');
      expect(stale !== moved.text, true, 'the fixture is stale');
      const fixed = lazy(stale, moved.stash);
      expect(fixed.outcome, 'repointed', `outcome (${JSON.stringify(eol)})`);
      expect(fixed.text, moved.text, `bytes (${JSON.stringify(eol)})`);
      expect(lazy(stale, moved.stash, true).outcome, 'restored', 'restore does not care about the pointer');
    }
  });

  test('section: a pointer carries its Spanish half only when the section declares one, and fills {stash} in both', () => {
    const text = orchestratorMd();
    const bilingualSection = { ...review, pointer: { en: 'English {stash} end.', es: 'Español {stash} fin.' } };
    const plainSection = { ...review, pointer: { en: 'English {stash} end.' } };
    const both = pointerFor(text, bilingualSection, 'a'.repeat(64), '~/x.md');
    const english = pointerFor(text, plainSection, 'a'.repeat(64), '~/x.md');

    expect(both.includes('\nEnglish ~/x.md end.\n@es Español ~/x.md fin.\n'), true, `bilingual (${JSON.stringify(both)})`);
    expect(english.includes('@es'), false, 'English only');
    expect(english.includes('\nEnglish ~/x.md end.\n\n'), true, `english (${JSON.stringify(english)})`);
  });

  test('section: a moved span whose stash is tampered, missing or drifted is refused, never guessed', () => {
    const moved = lazy(orchestratorMd());
    expect(lazy(moved.text, `${moved.stash}x`, true).refused !== undefined, true, 'tampered, restore');
    expect(lazy(moved.text, null, true).refused !== undefined, true, 'missing, restore');
    expect(lazy(moved.text, 'other', false).refused !== undefined, true, 'drifted, off');
  });

  test('section: no start line and no witness line -> absent, nothing to move', () => {
    const text = orchestratorMd({ span: '' });
    expect(inspectSection(text, review).form, 'absent', 'form');
    expect(lazy(text).outcome, 'unchanged', 'outcome');
  });

  /** The refusal names the exact cause it found. @es El rechazo nombra la causa exacta que encontró. */
  const refusedFor = (text, cause, entry = review) => (lazy(text, null, false, entry).refused ?? '').startsWith(cause);
  const START_REFUSAL = '"#### Review Execution Contract" is not exactly one whole line';
  const END_REFUSAL = '"#### Cost and Context Balance" is not exactly one whole line';

  test('section near misses refuse, naming why: duplicated start, duplicated end, renamed start with the witness still rendered', () => {
    expect(refusedFor(orchestratorMd({ after: '#### Review Execution Contract' }), START_REFUSAL), true, 'start twice');
    expect(refusedFor(orchestratorMd({ after: '#### Cost and Context Balance' }), END_REFUSAL), true, 'end twice');
    expect(refusedFor(orchestratorMd({ span: REVIEW_SPAN.replace('#### Review Execution Contract', '#### Review Execution Contracts') }), START_REFUSAL), true, 'renamed start');
  });

  test('section near misses refuse, naming why: end line missing, the region twice, a region this section does not name, span outside the region', () => {
    expect(refusedFor(orchestratorMd().replace('#### Cost and Context Balance', '#### Cost'), END_REFUSAL), true, 'end missing');
    expect(refusedFor(orchestratorMd({ after: region('sdd-orchestrator', 'Second copy.') }), 'the region'), true, 'region twice');
    expect(refusedFor(orchestratorMd({ after: region('orchestrator', 'Second copy.') }), 'the region'), true, 'one region of each accepted id');
    expect(refusedFor(orchestratorMd({ regionId: 'something-else' }), 'the region'), true, 'unnamed region id');
    const outside = orchestratorMd({ span: '' }).replace('#### Cost and Context Balance', 'Cost heading moved.').concat(REVIEW_SPAN, '#### Cost and Context Balance\n');
    expect(lazy(outside).refused !== undefined, true, 'outside the region');
  });

  test('section near miss: the only region around the span carries an id this section does not name -> refused', () => {
    const text = `${region('something-else', ['# Intro', '', review.start, '', 'Body.', '', review.end].join('\n'))}\n`;
    expect(refusedFor(text, 'the region'), true, 'refused');
    expect(reconcileSection(text.replace('something-else', 'orchestrator').replace('something-else', 'orchestrator'), review, { keepLoaded: false, stash: null, stashLabel: '~/x.md' }).outcome, 'moved', 'the same text under a named id moves');
  });

  test('section near misses are not anchors or sentinels: a line quoted mid-line, a sentinel without its closing', () => {
    const quoted = orchestratorMd().replace('Checking.', 'See #### Review Execution Contract below.');
    expect(lazy(quoted).outcome, 'moved', 'mid-line mention ignored');
    const moved = lazy(orchestratorMd());
    const unclosed = moved.text.replace(`${sha256(moved.stash)} -->`, sha256(moved.stash));
    expect(inspectSection(unclosed, review).form, 'present', 'unclosed sentinel is not a sentinel');
  });

  test('section: another section\'s sentinel inside this span is refused, so a pointer is never stashed as if it were the contract', () => {
    const foreign = '<!-- owner-overlay:lazy-some-other-section v1 sha256=abc -->';
    const text = orchestratorMd({ span: REVIEW_SPAN.replace('Procedure.', `${foreign}\nProcedure.`) });
    expect((lazy(text).refused ?? '').includes('another section'), true, 'refused naming the foreign sentinel');
  });

  test('section: the end line may be a marker line of a nested region, and the span may end at its own region\'s closing marker', () => {
    const nested = { ...review, name: 'nested-demo', regions: ['outer'], start: '## Table', end: '<!-- gentle-ai:inner -->' };
    const text = [region('outer', ['## Table', '', 'Rows.', '', region('inner', 'Inner text.')].join('\n')), ''].join('\n');
    const result = reconcileSection(text, nested, { keepLoaded: false, stash: null, stashLabel: '~/x.md' });
    expect(result.outcome, 'moved', 'moved up to the nested marker');
    expect(result.stash, '## Table\n\nRows.\n\n', 'stash bytes');
    expect(parseManagedRegions(result.text).problems.length, 0, 'markers well formed');
    const closing = { ...nested, name: 'closing-demo', regions: ['inner'], start: 'Inner text.', end: '<!-- /gentle-ai:inner -->' };
    expect(reconcileSection(region('inner', 'Inner text.\nMore.'), closing, { keepLoaded: false, stash: null, stashLabel: '~/x.md' }).outcome, 'moved', 'ends at the closing marker of its own region');
  });

  test('section: two sections of one file are independent, in either order', () => {
    const first = lazyEntryNamed('blocking-prompts');
    const second = lazyEntryNamed('review-contract');
    const text = [
      '# Owner pointer',
      region('sdd-orchestrator', [first.start, '', 'First body — ñandú.', '', first.end, '', '', second.start, '', 'Second body — 日本.', '', second.end, 'Tail.'].join('\n')),
      '',
    ].join('\n');
    const options = (entry, stash) => ({ keepLoaded: false, stash, stashLabel: stashLabel(entry) });
    const afterFirst = reconcileSection(text, first, options(first, null));
    const both = reconcileSection(afterFirst.text, second, options(second, null));
    const afterSecond = reconcileSection(text, second, options(second, null));
    const reverse = reconcileSection(afterSecond.text, first, options(first, null));
    expect(both.text, reverse.text, 'same file either order');
    expect([afterFirst.outcome, both.outcome].join(), 'moved,moved', 'both moved');
    expect(reconcileSection(both.text, first, options(first, afterFirst.stash)).outcome, 'unchanged', 'first still held');
    const restored = reconcileSection(both.text, first, { keepLoaded: true, stash: afterFirst.stash, stashLabel: stashLabel(first) });
    expect(restored.outcome, 'restored', 'restoring one');
    expect(restored.text, afterSecond.text, 'the other stays moved');
  });

  // ------------------------------------------------------------ every real section, through the kind

  for (const entry of lazyEntries()) {
    for (const regionId of entry.regions) {
      test(`real section "${entry.name}" (${regionId}): a fixture built from its anchors moves, holds, survives a sync and restores byte for byte`, () => {
        const context = installFakeCli(newRoot(), { enabled: false });
        const original = sectionMd(entry, { eol: '\r\n', regionId });
        put(context.home, entry.file, original);
        const [before] = evaluateAll([entry], context);
        expect(before.status, 'broken', 'broken while loaded');
        expect(before.syncSafe, true, 'sync-safe');
        expect(before.reapplicable, true, 'reapplicable');
        expect(applyAll([entry], context)[0].outcome, 'applied', 'apply');
        const moved = read(context.home, entry.file);
        expect(moved !== original, true, 'CLAUDE.md changed');
        expect(read(context.home, entry.stash).startsWith(entry.start), true, 'the stash opens with the start line');
        expect(evaluateAll([entry], context)[0].status, 'held', 'held after apply');
        expect(applyAll([entry], context).length, 0, 'second apply finds nothing');
        put(context.home, entry.file, original);
        expect(evaluateAll([entry], context)[0].status, 'broken', 'broken again after a sync-shaped rewrite');
        applyAll([entry], context);
        expect(read(context.home, entry.file), moved, 'moved again, same bytes');
      });
    }

    test(`real section "${entry.name}": its pointer says when to read the stash, the pointer is shorter than what it replaces and carries no gentle-ai marker`, () => {
      const original = sectionMd(entry, { body: ['x'.repeat(2000), ''] });
      const result = reconcileSection(original, entry, { keepLoaded: false, stash: null, stashLabel: stashLabel(entry) });
      const pointer = pointerFor(original, entry, 'f'.repeat(64), stashLabel(entry));
      expect(result.outcome, 'moved', 'moved');
      expect(pointer.length < 1200, true, `pointer is short (${pointer.length})`);
      expect(pointer.includes('<!-- gentle-ai:') || pointer.includes('<!-- /gentle-ai:'), false, 'no gentle-ai marker');
      expect(pointer.includes(stashLabel(entry)), true, 'names the stash');
      expect(pointer.includes(`<!-- owner-overlay:lazy-${entry.name} v1 sha256=${'f'.repeat(64)} -->`), true, 'the sentinel carries the name of THIS section and the sha');
    });
  }

  // ------------------------------------------------------------ the kind

  const kind = KINDS['lazy-section'];
  /** A fixture home with the review span in CLAUDE.md and the given CLI state. @es Un home de fixture con el tramo en CLAUDE.md y el estado de CLI dado. */
  function lazyHome(cliState, text = orchestratorMd({ eol: '\r\n' })) {
    const context = installFakeCli(newRoot(), { enabled: false, ...cliState });
    put(context.home, review.file, text);
    return context;
  }
  const stashOf = (context) => read(context.home, review.stash);

  test('lazy kind: reviews off, span loaded -> broken, sync-safe, reapplicable; apply moves it; second apply finds nothing', () => {
    const context = lazyHome({ reviewGlobal: '' });
    const original = read(context.home, review.file);
    const [before] = evaluateAll([review], context);
    expect(before.status, 'broken', 'status before');
    expect(before.syncSafe, true, 'sync-safe');
    expect(before.reapplicable, true, 'reapplicable');
    expect(applyAll([review], context)[0].outcome, 'applied', 'apply');
    expect(read(context.home, review.file), lazy(original).text, 'CLAUDE.md after apply');
    expect(stashOf(context), lazy(original).stash, 'stash bytes');
    expect(kind.evaluate(review, context).status, 'held', 'status after');
    expect(applyAll([review], context).length, 0, 'second apply');
  });

  test('lazy kind: global on -> a moved span is broken and apply restores the original bytes', () => {
    const context = lazyHome({ reviewGlobal: '' });
    const original = read(context.home, review.file);
    applyAll([review], context);
    installFakeCli(context, { enabled: false, reviewGlobal: 'on' });
    expect(kind.evaluate(review, context).status, 'broken', 'status');
    applyAll([review], context);
    expect(read(context.home, review.file), original, 'restored bytes');
    expect(kind.evaluate(review, context).status, 'held', 'held once loaded');
  });

  test('lazy kind near miss: global on while THIS clone is forced off -> the span stays loaded (another clone may review)', () => {
    expect(kind.evaluate(review, lazyHome({ reviewGlobal: '', cloneOff: true })).status, 'broken', 'the same file with reviews off everywhere');
    expect(kind.evaluate(review, lazyHome({ reviewGlobal: 'on', cloneOff: true })).status, 'held', 'global on, this clone off');
  });

  for (const [label, cliState] of [
    ['the CLI exits non-zero', { reviewFault: 'exit' }],
    ['the CLI prints non-JSON', { reviewFault: 'garbage' }],
    ['the report schema changed', { reviewSchema: 'gentle-ai.review-mode/v2' }],
    ['the status schema changed', { reviewStatusSchema: 'gentle-ai.rdd-mode-status/v2' }],
  ]) {
    test(`lazy kind: review mode unreadable (${label}) -> unverifiable, and apply keeps the span loaded`, () => {
      const context = lazyHome(cliState);
      const original = read(context.home, review.file);
      const [result] = evaluateAll([review], context);
      expect(result.status, 'unverifiable', 'status');
      expect(result.syncSafe, true, 'sync-safe');
      applyAll([review], context);
      expect(read(context.home, review.file), original, 'CLAUDE.md untouched');
    });
  }

  test('lazy kind: a moved span with the mode unreadable is restored, never left pointing at a stash nobody may read', () => {
    const context = lazyHome({ reviewGlobal: '' });
    const original = read(context.home, review.file);
    applyAll([review], context);
    expect(read(context.home, review.file) !== original, true, 'moved first');
    installFakeCli(context, { enabled: false, reviewFault: 'exit' });
    applyAll([review], context);
    expect(read(context.home, review.file), original, 'restored bytes');
  });

  test('lazy kind: a section that is always lazy never asks the CLI -> an unreadable review mode changes nothing about it', () => {
    const always = lazyEntries().find((entry) => entry.loadedWhile === undefined);
    for (const cliState of [{ reviewFault: 'exit' }, { reviewGlobal: 'on' }, { reviewFault: 'garbage' }]) {
      const context = installFakeCli(newRoot(), { enabled: false, ...cliState });
      const original = sectionMd(always, { eol: '\r\n' });
      put(context.home, always.file, original);
      expect(evaluateAll([always], context)[0].status, 'broken', `loaded (${JSON.stringify(cliState)})`);
      applyAll([always], context);
      expect(evaluateAll([always], context)[0].status, 'held', `moved (${JSON.stringify(cliState)})`);
      expect(read(context.home, always.file) !== original, true, 'CLAUDE.md changed');
    }
  });

  test('lazy kind: the stash changed on disk -> broken, apply refuses, CLAUDE.md untouched', () => {
    const context = lazyHome({ reviewGlobal: '' });
    applyAll([review], context);
    put(context.home, review.stash, 'edited by hand');
    const moved = read(context.home, review.file);
    expect(kind.evaluate(review, context).status, 'broken', 'status');
    expect(kind.apply(review, context).outcome, 'refused', 'apply');
    expect(read(context.home, review.file), moved, 'CLAUDE.md bytes');
  });

  test('lazy kind: no span in CLAUDE.md -> held; no CLAUDE.md -> broken', () => {
    expect(kind.evaluate(review, lazyHome({}, orchestratorMd({ span: '' }))).status, 'held', 'absent span');
    expect(kind.evaluate(review, installFakeCli(newRoot(), { enabled: false })).status, 'broken', 'missing file');
  });

  test('lazy kind: a v4 file (region `orchestrator`) is held and moved exactly like a v3 one', () => {
    const context = lazyHome({ reviewGlobal: '' }, orchestratorMd({ regionId: 'orchestrator' }));
    expect(kind.evaluate(review, context).status, 'broken', 'loaded');
    applyAll([review], context);
    expect(kind.evaluate(review, context).status, 'held', 'moved');
    expect(read(context.home, review.file).includes('<!-- gentle-ai:orchestrator -->'), true, 'region id untouched');
  });

  test('lazy kind: plan names the move and writes nothing', () => {
    const context = lazyHome({ reviewGlobal: '' });
    const original = read(context.home, review.file);
    expect(kind.plan(review, context).outcome, 'would-move', 'plan');
    expect(read(context.home, review.file), original, 'CLAUDE.md untouched');
    expect(readTextOrNull(path.join(context.home, review.stash)), null, 'no stash written');
  });

  test('lazy kind: every finding of the kind carries both languages', () => {
    const context = lazyHome({ reviewGlobal: '' });
    const texts = [kind.evaluate(review, context).detail, kind.plan(review, context).detail, kind.apply(review, context).detail, kind.evaluate(review, installFakeCli(newRoot(), { enabled: false })).detail, kind.remedy];
    texts.forEach((text, index) => expect(bilingual(text), true, `text ${index} (${text})`));
    const refused = lazyHome({}, orchestratorMd({ after: '#### Cost and Context Balance' }));
    expect(bilingual(kind.evaluate(review, refused).detail), true, 'refusal');
  });

  test('lazy kind: the repository\'s own stash files exist for every section that its CLAUDE.md already moved', () => {
    const claude = readTextOrNull(path.join(HERE, '..', 'CLAUDE.md'));
    if (claude === null) return;
    for (const entry of lazyEntries()) {
      const form = inspectSection(claude, entry).form;
      if (form !== 'moved') continue;
      const stash = readFileSync(path.join(HERE, '..', entry.stash.slice('.claude/'.length)), 'utf8');
      expect(sha256(stash), inspectSection(claude, entry).sha, `${entry.name}: the stash hashes to the sentinel`);
    }
  });
}
