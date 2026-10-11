/**
 * Selftest cases of the `anchored-line-replacement` kind, on constructed fixtures only (never the live
 * skill file): held, broken and the near-miss shapes a real upstream edit produces, in both line
 * endings, with multibyte content. They live apart from selftest.mjs, which owns the harness and hands
 * it in, so neither file carries two responsibilities.
 *
 * @es Casos del selftest del tipo `anchored-line-replacement`, solo sobre fixtures construidos (nunca
 * el fichero real de la skill): held, broken y las formas de casi-acierto que produce una edición real
 * de upstream, con ambos finales de línea y contenido multibyte. Viven aparte de selftest.mjs, que es
 * dueño del arnés y lo entrega, así ningún fichero carga dos responsabilidades.
 */
import path from 'node:path';
import { CUSTOMIZATIONS } from './customizations.mjs';
import { KINDS, applyAll, evaluateAll } from './invariants.mjs';
import { readTextOrNull } from './text-file.mjs';

const UPSTREAM = '- Run everything only when all tasks are done — ñandú 日本, without the full suite.';
const REPLACEMENT = '- Run only what proves the change — ñandú 日本; the orchestrator runs the full suite once.';
const entry = { id: 'l', kind: 'anchored-line-replacement', file: '.claude/skills/x/SKILL.md', upstream: UPSTREAM, replacement: REPLACEMENT };

/** A skill file with `line` as one of its lines. @es Un fichero de skill con `line` como una de sus líneas. */
const skill = (line, eol = '\n') => ['---', 'name: x', '---', '', '## Hard Rules', '', '- First rule — ñ.', line, '- Last rule.', ''].join(eol);

export function registerLineReplacementCases({ test, expect, newRoot, put, read }) {
  const evaluate = (context) => KINDS[entry.kind].evaluate(entry, context);
  const apply = (context) => KINDS[entry.kind].apply(entry, context);
  const homeWith = (text) => {
    const context = newRoot();
    put(context.home, entry.file, text);
    return context;
  };

  test('line replacement: the upstream sentence in place -> broken, sync-safe and reapplicable', () => {
    const [result] = evaluateAll([entry], homeWith(skill(UPSTREAM)));
    expect(result.status, 'broken', 'status');
    expect(result.syncSafe, true, 'sync-safe');
    expect(result.reapplicable, true, 'reapplicable');
  });

  for (const eol of ['\n', '\r\n']) {
    const label = eol === '\n' ? 'LF' : 'CRLF';
    test(`line replacement ${label}: apply swaps exactly that line, every other byte stays, then held; a second apply finds nothing`, () => {
      const context = homeWith(skill(UPSTREAM, eol));
      expect(applyAll([entry], context)[0].outcome, 'applied', 'apply');
      expect(read(context.home, entry.file), skill(REPLACEMENT, eol), 'bytes after apply');
      expect(evaluate(context).status, 'held', 'status after');
      expect(applyAll([entry], context).length, 0, 'second apply');
      expect(read(context.home, entry.file), skill(REPLACEMENT, eol), 'bytes after second apply');
    });
  }

  test('line replacement: the replacement already in place -> held, and apply writes nothing', () => {
    const context = homeWith(skill(REPLACEMENT));
    expect(evaluate(context).status, 'held', 'status');
    expect(apply(context).outcome, 'unchanged', 'apply');
  });

  test('line replacement near miss: upstream reworded one word -> broken, apply refuses naming the anchor, file untouched', () => {
    const reworded = skill(UPSTREAM.replace('full suite', 'whole suite'));
    const context = homeWith(reworded);
    const result = evaluate(context);
    expect(result.status, 'broken', 'status');
    expect(result.detail.startsWith('anchor not found'), true, `detail (${result.detail})`);
    expect(apply(context).outcome, 'refused', 'apply');
    expect(read(context.home, entry.file), reworded, 'file bytes');
  });

  test('line replacement near miss: the sentence quoted mid-line is not the anchor -> broken, refused, untouched', () => {
    const quoted = skill(`See ${UPSTREAM} above.`);
    const context = homeWith(quoted);
    expect(evaluate(context).status, 'broken', 'status');
    expect(apply(context).outcome, 'refused', 'apply');
    expect(read(context.home, entry.file), quoted, 'file bytes');
  });

  test('line replacement near miss: the sentence twice, or both forms at once -> broken, refused, untouched', () => {
    for (const text of [`${skill(UPSTREAM)}${UPSTREAM}\n`, `${skill(UPSTREAM)}${REPLACEMENT}\n`, `${skill(REPLACEMENT)}${REPLACEMENT}\n`]) {
      const context = homeWith(text);
      expect(evaluate(context).status, 'broken', 'status');
      expect(apply(context).outcome, 'refused', 'apply');
      expect(read(context.home, entry.file), text, 'file bytes');
    }
  });

  test('line replacement: missing file -> broken, apply refuses and creates nothing', () => {
    const context = newRoot();
    expect(evaluate(context).status, 'broken', 'status');
    expect(apply(context).outcome, 'refused', 'apply');
    expect(readTextOrNull(path.join(context.home, entry.file)), null, 'file still absent');
  });

  test('line replacement: plan names the swap and writes nothing; a refused case plans a refusal', () => {
    const original = skill(UPSTREAM);
    const context = homeWith(original);
    expect(KINDS[entry.kind].plan(entry, context).outcome, 'would-replace', 'plan');
    expect(read(context.home, entry.file), original, 'file untouched');
    expect(KINDS[entry.kind].plan(entry, homeWith(skill('- something else'))).outcome, 'refused', 'refused plan');
  });

  test('line replacement: a sync-shaped rewrite back to upstream, then apply, gives the same replaced file', () => {
    const context = homeWith(skill(UPSTREAM));
    applyAll([entry], context);
    const replaced = read(context.home, entry.file);
    put(context.home, entry.file, skill(UPSTREAM));
    expect(evaluate(context).status, 'broken', 'broken after the sync');
    applyAll([entry], context);
    expect(read(context.home, entry.file), replaced, 'replaced again');
  });

  // No live entry since gentle-ai v4 retired the sdd-verify skill it anchored on (2026-10-11); any future one must
  // still hold these properties. @es Sin entrada viva desde que gentle-ai v4 retiró la skill sdd-verify donde se
  // anclaba (2026-10-11); toda entrada futura debe seguir cumpliendo estas propiedades.
  test('line replacement: every REAL entry is a single distinct line and its replacement does not contain its upstream', () => {
    for (const real of CUSTOMIZATIONS.filter((candidate) => candidate.kind === 'anchored-line-replacement')) {
      expect(real.upstream.includes('\n') || real.replacement.includes('\n'), false, `${real.id}: single lines`);
      expect(real.upstream === real.replacement, false, `${real.id}: distinct`);
      expect(real.replacement.includes(real.upstream), false, `${real.id}: replacement does not contain upstream`);
    }
  });
}
