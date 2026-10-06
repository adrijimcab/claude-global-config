/**
 * Selftest cases of the `pruned-text-stays-pruned` kind, on constructed fixtures only (never the live
 * CLAUDE.md): held, broken and the near-miss shapes a real upstream edit produces, in both line
 * endings, with multibyte content. They live apart from selftest.mjs, which owns the harness and hands
 * it in, so neither file carries two responsibilities.
 *
 * @es Casos del selftest del tipo `pruned-text-stays-pruned`, solo sobre fixtures construidos (nunca el
 * CLAUDE.md real): held, broken y las formas de casi-acierto que produce una edición real de upstream,
 * con ambos finales de línea y contenido multibyte. Viven aparte de selftest.mjs, que es dueño del
 * arnés y lo entrega, así ningún fichero carga dos responsabilidades.
 */
import path from 'node:path';
import { KINDS, applyAll, evaluateAll } from './invariants.mjs';
import { parseManagedRegions } from './managed-regions.mjs';
import { readTextOrNull } from './text-file.mjs';

const KIND = 'pruned-text-stays-pruned';
const BEFORE = '## Delegation Rules — ñandú';
const AFTER = '## Cost and Context Balance';
const BLOCK = ['', 'A paragraph sync emits again — 日本.', '', '- a bullet the owner never reads'];
const CONDENSED = ['', 'Short version — 日本.'];
const FILE = '.claude/CLAUDE.md';

const prune = { id: 'p', kind: KIND, file: FILE, before: BEFORE, after: AFTER, block: BLOCK };
const condense = { ...prune, id: 'c', replacement: CONDENSED };

/** A CLAUDE.md whose region holds `middle` between the two anchors. @es Un CLAUDE.md cuya región lleva `middle` entre los dos anclajes. */
const claude = (middle, eol = '\n') =>
  ['# Owner pointer', '', '<!-- gentle-ai:sdd-orchestrator -->', '## Intro', 'Intro text.', BEFORE, ...middle, AFTER, 'Balance text.', '<!-- /gentle-ai:sdd-orchestrator -->', ''].join(eol);

export function registerPrunedTextCases({ test, expect, newRoot, put, read }) {
  const evaluate = (entry, context) => KINDS[KIND].evaluate(entry, context);
  const apply = (entry, context) => KINDS[KIND].apply(entry, context);
  const homeWith = (text) => {
    const context = newRoot();
    put(context.home, FILE, text);
    return context;
  };
  const bilingual = (detail) => /@es \S/.test(detail);

  test('pruned text: the block sync put back -> broken, sync-safe and reapplicable', () => {
    const [result] = evaluateAll([prune], homeWith(claude(BLOCK)));
    expect(result.status, 'broken', 'status');
    expect(result.syncSafe, true, 'sync-safe');
    expect(result.reapplicable, true, 'reapplicable');
  });

  for (const eol of ['\n', '\r\n']) {
    const label = eol === '\n' ? 'LF' : 'CRLF';
    test(`pruned text ${label}: apply removes exactly the block, every other byte stays, then held; a second apply finds nothing`, () => {
      const context = homeWith(claude(BLOCK, eol));
      expect(applyAll([prune], context)[0].outcome, 'applied', 'apply');
      expect(read(context.home, FILE), claude([], eol), 'bytes after apply');
      expect(evaluate(prune, context).status, 'held', 'status after');
      expect(applyAll([prune], context).length, 0, 'second apply');
      expect(read(context.home, FILE), claude([], eol), 'bytes after second apply');
    });

    test(`condensed text ${label}: apply swaps the block for the condensed lines, then held; a second apply finds nothing`, () => {
      const context = homeWith(claude(BLOCK, eol));
      expect(applyAll([condense], context)[0].outcome, 'applied', 'apply');
      expect(read(context.home, FILE), claude(CONDENSED, eol), 'bytes after apply');
      expect(evaluate(condense, context).status, 'held', 'status after');
      expect(applyAll([condense], context).length, 0, 'second apply');
    });
  }

  test('pruned text: already pruned, or already condensed -> held, and apply writes nothing', () => {
    for (const [entry, middle] of [[prune, []], [condense, CONDENSED]]) {
      const context = homeWith(claude(middle));
      expect(evaluate(entry, context).status, 'held', `status of ${entry.id}`);
      expect(apply(entry, context).outcome, 'unchanged', `apply of ${entry.id}`);
      expect(read(context.home, FILE), claude(middle), `bytes of ${entry.id}`);
    }
  });

  test('pruned text: an entry that only prunes does not read the condensed form of another as held', () => {
    const context = homeWith(claude(CONDENSED));
    expect(evaluate(prune, context).status, 'broken', 'pruning entry sees unknown text between the anchors');
    expect(apply(prune, context).outcome, 'refused', 'apply');
  });

  // The upstream-changed finding: whatever stands between the anchors is neither the block, nor the
  // condensed form, nor nothing. @es El hallazgo «upstream cambió»: lo que hay entre los anclajes no es
  // el bloque, ni la versión condensada, ni nada.
  const NEAR_MISSES = [
    ['upstream reworded one word', BLOCK.map((line) => line.replace('paragraph', 'section'))],
    ['upstream appended a line to the block', [...BLOCK, '- a bullet upstream added']],
    ['upstream prepended a line to the block', ['- a bullet upstream added', ...BLOCK]],
    ['the block was only half pruned by hand', BLOCK.slice(0, 2)],
    ['the block is there twice', [...BLOCK, ...BLOCK]],
    ['the block and the condensed form together', [...BLOCK, ...CONDENSED]],
    ['the block quoted mid-line is not the block', ['', `See: ${BLOCK[1]}`, '', BLOCK[3]]],
  ];
  for (const entry of [prune, condense]) {
    for (const [name, middle] of NEAR_MISSES) {
      test(`pruned text near miss (${entry.id}): ${name} -> broken naming the upstream change, apply refuses, file untouched`, () => {
        const text = claude(middle);
        const context = homeWith(text);
        const result = evaluate(entry, context);
        expect(result.status, 'broken', 'status');
        expect(result.detail.includes('upstream changed') && result.detail.includes('re-review this pruning'), true, `detail (${result.detail})`);
        expect(bilingual(result.detail), true, `bilingual (${result.detail})`);
        expect(apply(entry, context).outcome, 'refused', 'apply');
        expect(read(context.home, FILE), text, 'file bytes');
      });
    }
  }

  test('pruned text: an anchor that is missing, duplicated, mid-line or out of order -> broken, refused, untouched', () => {
    const body = claude(BLOCK);
    const shapes = {
      'before missing': body.replace(BEFORE, '## Delegation Rules reworded'),
      'after missing': body.replace(AFTER, '## Cost and Context reworded'),
      'before duplicated': `${body}${BEFORE}\n`,
      'after duplicated': `${body}${AFTER}\n`,
      'before only mid-line': body.replace(BEFORE, `See ${BEFORE} here`),
      'after before the before': ['# Owner', AFTER, BEFORE, ...BLOCK, ''].join('\n'),
    };
    for (const [name, text] of Object.entries(shapes)) {
      const context = homeWith(text);
      const result = evaluate(prune, context);
      expect(result.status, 'broken', `${name}: status`);
      expect(bilingual(result.detail), true, `${name}: bilingual (${result.detail})`);
      expect(result.detail.includes('re-review this pruning'), true, `${name}: asks for the re-review (${result.detail})`);
      expect(apply(prune, context).outcome, 'refused', `${name}: apply`);
      expect(read(context.home, FILE), text, `${name}: file bytes`);
    }
  });

  test('pruned text: a missing anchor and a reworded block name different causes', () => {
    const anchorMiss = evaluate(prune, homeWith(claude(BLOCK).replace(BEFORE, 'x'))).detail;
    const blockMiss = evaluate(prune, homeWith(claude(['', 'something else']))).detail;
    expect(anchorMiss.includes('anchor not found'), true, `anchor miss (${anchorMiss})`);
    expect(blockMiss.includes('between the anchors'), true, `block miss (${blockMiss})`);
    expect(blockMiss.includes('anchor not found'), false, `block miss is not an anchor miss (${blockMiss})`);
  });

  test('pruned text: a duplicated anchor says it is ambiguous, not that it is missing', () => {
    const detail = evaluate(prune, homeWith(`${claude(BLOCK)}${BEFORE}\n`)).detail;
    expect(detail.includes('anchor ambiguous'), true, `detail (${detail})`);
  });

  test('pruned text: missing file -> broken, apply refuses and creates nothing', () => {
    const context = newRoot();
    expect(evaluate(prune, context).status, 'broken', 'status');
    expect(apply(prune, context).outcome, 'refused', 'apply');
    expect(readTextOrNull(path.join(context.home, FILE)), null, 'file still absent');
  });

  test('pruned text: plan names the removal or the condensing and writes nothing; a refused case plans a refusal', () => {
    const original = claude(BLOCK);
    const context = homeWith(original);
    expect(KINDS[KIND].plan(prune, context).outcome, 'would-prune', 'prune plan');
    expect(KINDS[KIND].plan(condense, context).outcome, 'would-condense', 'condense plan');
    expect(read(context.home, FILE), original, 'file untouched');
    expect(KINDS[KIND].plan(prune, homeWith(claude(['', 'other']))).outcome, 'refused', 'refused plan');
    expect(KINDS[KIND].plan(prune, homeWith(claude([]))).outcome, 'unchanged', 'held plan');
  });

  test('pruned text: a sync-shaped rewrite that puts the block back, then apply, gives the same pruned file', () => {
    const context = homeWith(claude(BLOCK));
    applyAll([condense], context);
    const pruned = read(context.home, FILE);
    put(context.home, FILE, claude(BLOCK));
    expect(evaluate(condense, context).status, 'broken', 'broken after the sync');
    applyAll([condense], context);
    expect(read(context.home, FILE), pruned, 'pruned again');
  });

  test('pruned text: pruning inside a managed region leaves the region markers well formed', () => {
    const context = homeWith(claude(BLOCK));
    applyAll([prune], context);
    const { regions, problems } = parseManagedRegions(read(context.home, FILE));
    expect(problems.length, 0, 'marker problems');
    expect(regions.length, 1, 'regions');
  });

  test('pruned text: a malformed entry is a configuration error, not a verdict', () => {
    const context = homeWith(claude(BLOCK));
    const malformed = {
      'empty block': { ...prune, block: [] },
      'no block': { ...prune, block: undefined },
      'replacement equal to the block': { ...prune, replacement: BLOCK },
      'blank before anchor': { ...prune, before: '  ' },
      'multi-line after anchor': { ...prune, after: 'a\nb' },
      'block that is only blank lines': { ...prune, block: ['', ''] },
    };
    for (const [name, entry] of Object.entries(malformed)) {
      let thrown = null;
      try {
        evaluate(entry, context);
      } catch (error) {
        thrown = error;
      }
      expect(thrown !== null, true, `${name}: evaluate throws`);
      expect(thrown.message.includes('"p"'), true, `${name}: names the entry (${thrown?.message})`);
    }
  });

  test('pruned text: every finding of the kind carries both languages', () => {
    const context = homeWith(claude(BLOCK));
    const texts = [
      evaluate(prune, context).detail,
      evaluate(prune, homeWith(claude([]))).detail,
      evaluate(prune, newRoot()).detail,
      apply(prune, context).detail,
      KINDS[KIND].plan(prune, homeWith(claude(BLOCK))).detail,
      KINDS[KIND].remedy,
    ];
    texts.forEach((text, index) => expect(bilingual(text), true, `text ${index} (${text})`));
  });
}
