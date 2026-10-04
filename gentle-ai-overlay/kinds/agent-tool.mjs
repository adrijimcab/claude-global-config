/**
 * Invariants on ONE tool in a sub-agent's frontmatter `tools:` line: a tool we require (restorable)
 * and a tool we deliberately withhold (reported, never edited).
 */
import path from 'node:path';
import { locateToolsLine, parseTools, renderPlainToolsLine, withToolInserted } from '../agent-frontmatter.mjs';
import { joinLines, lineContent, readTextOrNull, withEndingOf, writeTextAtomic } from '../text-file.mjs';

function readTools(customization, context) {
  const text = readTextOrNull(path.join(context.home, customization.file));
  if (text === null) return { error: 'file does not exist' };
  const located = locateToolsLine(text);
  if (located.error) return { error: located.error };
  return { text, located, parsed: parseTools(located.value) };
}

export const agentToolRequired = {
  evaluate(customization, context) {
    const { error, parsed } = readTools(customization, context);
    if (error) return { status: 'broken', detail: error };
    return parsed.tokens.includes(customization.tool)
      ? { status: 'held', detail: `tools line grants ${customization.tool}` }
      : { status: 'broken', detail: `tools line does not grant ${customization.tool}` };
  },

  /** Insert the tool into a canonical plain tools line; refuse every other shape. */
  apply(customization, context) {
    const { error, located, parsed } = readTools(customization, context);
    if (error) return { outcome: 'refused', detail: error };
    if (parsed.tokens.includes(customization.tool)) return { outcome: 'unchanged', detail: 'already granted' };
    const original = located.lines[located.index];
    const isCanonical = parsed.form === 'plain' && lineContent(original) === renderPlainToolsLine(parsed.tokens);
    if (!isCanonical) return { outcome: 'refused', detail: `tools line is not in the canonical "tools: A, B" form; edit it by hand: ${lineContent(original)}` };
    const lines = [...located.lines];
    lines[located.index] = withEndingOf(original, renderPlainToolsLine(withToolInserted(parsed.tokens, customization.tool)));
    writeTextAtomic(path.join(context.home, customization.file), joinLines(lines));
    return { outcome: 'applied', detail: `inserted ${customization.tool}` };
  },
};

export const agentToolForbidden = {
  remedy: 'A withheld tool was granted: remove it from that tools line by hand (apply never removes a grant). @es Se concedió una herramienta que se retiene a propósito: quitarla a mano de esa línea tools (apply nunca quita una concesión).',

  evaluate(customization, context) {
    const { error, parsed } = readTools(customization, context);
    if (error) return { status: 'broken', detail: error };
    return parsed.tokens.includes(customization.tool)
      ? { status: 'broken', detail: `tools line grants ${customization.tool}, which is withheld on purpose` }
      : { status: 'held', detail: `tools line withholds ${customization.tool}` };
  },
};
