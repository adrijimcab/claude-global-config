/**
 * Selftest cases of the `anchored-line-insertion` kind, on constructed fixtures only (never the live
 * files): held, broken and the near-miss shapes a real upstream edit produces, in both line endings, with
 * multibyte content; the persona region's tolerance for the lines this kind owns; and the real
 * customization list, whose two precedence lines are applied to fixtures built from the real anchors.
 * They live apart from selftest.mjs, which owns the harness and hands it in.
 *
 * @es Casos del selftest del tipo `anchored-line-insertion`, solo sobre fixtures construidos (nunca los
 * ficheros reales): held, broken y las formas de casi-acierto que produce una edición real de upstream,
 * con ambos finales de línea y contenido multibyte; la tolerancia de la región persona con las líneas que
 * este tipo posee; y la lista real de personalizaciones, cuyas dos líneas de precedencia se aplican a
 * fixtures construidos con los anclajes reales. Viven aparte de selftest.mjs, que es dueño del arnés y lo
 * entrega.
 */
import { CUSTOMIZATIONS } from './customizations.mjs';
import { KINDS, applyAll, evaluateAll, planAll } from './invariants.mjs';

const ANCHOR = '- If unsure whether to be brief or detailed, be brief — ñandú 日本.';
const LINE = '- Brevity governs length, never the voice — ñandú 日本.';
const entry = { id: 'i', kind: 'anchored-line-insertion', file: '.claude/output-styles/x.md', after: ANCHOR, line: LINE };

/** A style file with `middle` lines after the anchor. @es Un fichero de estilo con las líneas `middle` tras el ancla. */
const style = (middle, eol = '\n') => ['## Response Length Contract', '', '- Default to short answers.', ANCHOR, ...middle, '', '## Personality', ''].join(eol);

const PERSONA = ['## Rules', '', '- A persona rule — ñandú.', '- Another rule.', '', '## Persona Voice'].join('\n');

/**
 * Make every anchored-line-insertion entry of the REAL list held in a fixture home: our line is written by hand right
 * below its anchor (replacing the anchor when the file carries it, else appended in the file's own line ending, else a
 * new file), so a fixture never leans on the code under test. @es Deja held en un home de fixture toda entrada
 * anchored-line-insertion de la lista REAL: nuestra línea se escribe a mano justo bajo su ancla (sustituyendo el ancla si
 * el fichero la lleva, si no añadida con el final de línea del propio fichero, si no un fichero nuevo), así un fixture no
 * depende del código que se prueba.
 */
export function holdEveryInsertion({ home, put, read }) {
  for (const entry of CUSTOMIZATIONS.filter((candidate) => candidate.kind === 'anchored-line-insertion')) {
    let text = null;
    try {
      text = read(home, entry.file);
    } catch {
      text = null;
    }
    const eol = text?.includes('\r\n') ? '\r\n' : '\n';
    if (text === null) put(home, entry.file, ['## Response Length Contract', '', entry.after, entry.line, ''].join('\n'));
    else if (text.includes(`${entry.after}${eol}`)) put(home, entry.file, text.replace(`${entry.after}${eol}`, `${entry.after}${eol}${entry.line}${eol}`));
    else put(home, entry.file, `${text}${text.endsWith('\n') ? '' : eol}${entry.after}${eol}${entry.line}${eol}`);
  }
}

export function registerLineInsertionCases({ test, expect, newRoot, put, read }) {
  const evaluate = (context, target = entry) => KINDS[target.kind].evaluate(target, context);
  const apply = (context, target = entry) => KINDS[target.kind].apply(target, context);
  const homeWith = (text) => {
    const context = newRoot();
    put(context.home, entry.file, text);
    return context;
  };

  test('line insertion: the anchor without our line -> broken, sync-safe and reapplicable', () => {
    const [result] = evaluateAll([entry], homeWith(style([])));
    expect(result.status, 'broken', 'status');
    expect(result.syncSafe, true, 'sync-safe');
    expect(result.reapplicable, true, 'reapplicable');
  });

  for (const eol of ['\n', '\r\n']) {
    const label = eol === '\n' ? 'LF' : 'CRLF';
    test(`line insertion ${label}: apply puts the line right after the anchor, every other byte stays, then held; a second apply finds nothing`, () => {
      const context = homeWith(style([], eol));
      expect(applyAll([entry], context)[0].outcome, 'applied', 'apply');
      expect(read(context.home, entry.file), style([LINE], eol), 'bytes after apply');
      expect(evaluate(context).status, 'held', 'status after');
      expect(applyAll([entry], context).length, 0, 'second apply');
      expect(read(context.home, entry.file), style([LINE], eol), 'bytes after second apply');
      expect(read(context.home, entry.file).split(LINE).length - 1, 1, 'our line stands exactly once');
    });
  }

  test('line insertion: the line already in place -> held, and apply writes nothing', () => {
    const context = homeWith(style([LINE]));
    expect(evaluate(context).status, 'held', 'status');
    expect(apply(context).outcome, 'unchanged', 'apply');
  });

  test('line insertion: the plan says it would insert and writes nothing', () => {
    const context = homeWith(style([]));
    expect(planAll([entry], context)[0].outcome, 'would-insert', 'outcome');
    expect(read(context.home, entry.file), style([]), 'file bytes');
  });

  test('line insertion near miss: upstream reworded the anchor -> broken, apply refuses naming the anchor, file untouched', () => {
    const reworded = style([]).replace('be brief', 'stay brief');
    const context = homeWith(reworded);
    const result = evaluate(context);
    expect(result.status, 'broken', 'status');
    expect(result.detail.startsWith('anchor not found'), true, `detail (${result.detail})`);
    expect(apply(context).outcome, 'refused', 'apply');
    expect(read(context.home, entry.file), reworded, 'file bytes');
  });

  test('line insertion near miss: the anchor quoted mid-line is not the anchor -> broken, refused, untouched', () => {
    const quoted = style([]).replace(`\n${ANCHOR}\n`, `\nSee ${ANCHOR} above.\n`);
    const context = homeWith(quoted);
    expect(evaluate(context).status, 'broken', 'status');
    expect(apply(context).outcome, 'refused', 'apply');
    expect(read(context.home, entry.file), quoted, 'file bytes');
  });

  test('line insertion near miss: the anchor twice, our line twice, or our line away from the anchor -> broken, refused, untouched', () => {
    const away = style([]).replace('## Personality', `## Personality\n${LINE}`);
    for (const text of [`${style([])}${ANCHOR}\n`, style([LINE, LINE]), away]) {
      const context = homeWith(text);
      expect(evaluate(context).status, 'broken', 'status');
      expect(apply(context).outcome, 'refused', 'apply');
      expect(read(context.home, entry.file), text, 'file bytes');
    }
  });

  test('line insertion: a missing file -> broken and refused, never held', () => {
    const context = newRoot();
    expect(evaluate(context).status, 'broken', 'status');
    expect(apply(context).outcome, 'refused', 'apply');
  });

  test('persona region: a line this kind owns is tolerated only when the region declares it', () => {
    const context = newRoot();
    const reference = `${PERSONA}\n`;
    put(context.home, '.gentle-ai/state.json', JSON.stringify({ installed_binary_version: '2.99.0', persona: 'gentleman' }));
    put(context.modCache, 'github.com/gentleman-programming/gentle-ai/v2@v2.99.0/internal/assets/claude/persona-gentleman.md', reference);
    const inserted = PERSONA.replace('- A persona rule — ñandú.', `- A persona rule — ñandú.\n${LINE}`);
    put(context.home, '.claude/CLAUDE.md', `# Owner\n\n<!-- gentle-ai:persona -->\n${inserted}\n<!-- /gentle-ai:persona -->\n`);
    const region = { id: 'p', kind: 'persona-region-matches-upstream', file: '.claude/CLAUDE.md', region: 'persona' };
    expect(evaluate(context, region).status, 'broken', 'undeclared line');
    expect(evaluate(context, { ...region, ownedLines: [LINE] }).status, 'held', 'declared line');
    expect(evaluate(context, { ...region, ownedLines: ['- Some other line.'] }).status, 'broken', 'another declared line');
  });

  const THE_LINE = 'Brevity governs length, never the voice: a short reply is still the Gentleman mentor, warm Rioplatense voseo that speaks to the person, with the why and a closing that lands.';
  const real = CUSTOMIZATIONS.filter((customization) => customization.kind === 'anchored-line-insertion');

  test('real list: the precedence line is declared for the output style and for the persona region of CLAUDE.md, with the exact wording', () => {
    expect(real.map((customization) => customization.file).sort().join(','), '.claude/CLAUDE.md,.claude/output-styles/gentleman.md', 'files');
    for (const customization of real) expect(customization.line.endsWith(THE_LINE), true, `wording (${customization.id})`);
  });

  test('real list: applied to fixtures that carry the real anchors, the line stands exactly once, a second pass changes nothing, and the persona region stays held', () => {
    const context = newRoot();
    put(context.home, '.gentle-ai/state.json', JSON.stringify({ installed_binary_version: '2.99.0', persona: 'gentleman' }));
    const claudeAnchor = real.find((customization) => customization.file === '.claude/CLAUDE.md').after;
    const upstreamPersona = ['## Rules', '', claudeAnchor, '- Ask at most one question at a time.', '', '## Expertise'].join('\n');
    put(context.modCache, 'github.com/gentleman-programming/gentle-ai/v2@v2.99.0/internal/assets/claude/persona-gentleman.md', `${upstreamPersona}\n`);
    put(context.home, '.claude/CLAUDE.md', `# Owner\n\n<!-- gentle-ai:persona -->\n${upstreamPersona}\n<!-- /gentle-ai:persona -->\n`);
    put(context.home, '.claude/output-styles/gentleman.md', style([]).replace(ANCHOR, real.find((customization) => customization.file.includes('output-styles')).after));
    const mine = [...real, CUSTOMIZATIONS.find((customization) => customization.kind === 'persona-region-matches-upstream')];
    expect(applyAll(mine, context).map((outcome) => outcome.outcome).join(','), 'applied,applied', 'first pass');
    for (const customization of real) expect(read(context.home, customization.file).split(THE_LINE).length - 1, 1, `exactly once in ${customization.file}`);
    const afterFirst = real.map((customization) => read(context.home, customization.file));
    expect(applyAll(mine, context).length, 0, 'second pass');
    expect(JSON.stringify(real.map((customization) => read(context.home, customization.file))), JSON.stringify(afterFirst), 'bytes unchanged by the second pass');
    expect(evaluateAll(mine, context).map((result) => result.status).join(','), 'held,held,held', 'all held after the overlay ran');
  });
}
