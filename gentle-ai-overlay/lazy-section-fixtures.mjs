/**
 * Constructed CLAUDE.md fixtures for the lazy-section selftests: the review span as gentle-ai renders it, a
 * region around it, and what `gentle-ai sync` does to a region. Shared by `lazy-section-cases.mjs` and
 * `reapply-cases.mjs`, so neither carries two responsibilities. Nothing here reads a live file.
 *
 * @es Fixtures construidos de CLAUDE.md para los selftests de las secciones diferidas: el tramo de revisiones
 * como lo genera gentle-ai, una región a su alrededor y lo que `gentle-ai sync` hace con una región. Los
 * comparten `lazy-section-cases.mjs` y `reapply-cases.mjs`, así ninguno carga dos responsabilidades. Nada
 * aquí lee un fichero vivo.
 */
import { CUSTOMIZATIONS } from './customizations.mjs';

/** The real entry of the lazy section called `name`. @es La entrada real de la sección diferida `name`. */
export const lazyEntryNamed = (name) => CUSTOMIZATIONS.find((entry) => entry.kind === 'lazy-section' && entry.name === name);

/** Every real lazy-section entry. @es Toda entrada real de sección diferida. */
export const lazyEntries = () => CUSTOMIZATIONS.filter((entry) => entry.kind === 'lazy-section');

export const region = (id, content) => [`<!-- gentle-ai:${id} -->`, content, `<!-- /gentle-ai:${id} -->`].join('\n');

export const REVIEW_SPAN = ['#### Review Execution Contract', '', '# Native Compact Review Orchestration', '', 'Contract body — ñandú 日本.', '<!-- authority-first-terminal-procedure:start -->', 'Procedure.', '<!-- authority-first-terminal-procedure:end -->', '', ''].join('\n');

/**
 * A CLAUDE.md whose orchestrator region (`regionId`: `sdd-orchestrator` in gentle-ai v2/v3, `orchestrator` in v4)
 * holds the review span between a checking section and the cost section.
 * @es Un CLAUDE.md cuya región orquestadora (`regionId`) contiene el tramo de revisiones.
 */
export function orchestratorMd({ span = REVIEW_SPAN, eol = '\n', after = '', regionId = 'sdd-orchestrator', persona = 'Persona.' } = {}) {
  return ['# Owner pointer', '', region('persona', persona), '', orchestratorRegion({ span, regionId }), '', region('agent-routing', 'Routing.'), after, ''].join('\n').split('\n').join(eol);
}

/** Just the orchestrator region of `orchestratorMd`. @es Solo la región orquestadora de `orchestratorMd`. */
export function orchestratorRegion({ span = REVIEW_SPAN, regionId = 'sdd-orchestrator' } = {}) {
  return region(regionId, ['# Agent Teams', '', '#### Native Checking Contract', '', 'Checking.', '', `${span}#### Cost and Context Balance`, '', 'Cost.'].join('\n'));
}

/**
 * A CLAUDE.md whose orchestrator region holds EVERY lazy section of the real list (built from their own
 * anchors, in the order their anchors chain: a section's end line is the next one's start where upstream
 * chains them), the review span among them.
 * @es Un CLAUDE.md cuya región orquestadora contiene TODA sección diferida de la lista real.
 */
export function fullOrchestratorMd({ eol = '\n', regionId = 'sdd-orchestrator' } = {}) {
  const blocking = lazyEntryNamed('blocking-prompts');
  const delegated = lazyEntryNamed('delegated-verification');
  const body = [
    '# Agent Teams',
    '',
    blocking.start,
    '',
    'Blocking prompts body — ñandú 日本.',
    '',
    blocking.end,
    '',
    'Language body.',
    '',
    delegated.start,
    '',
    'Gate body.',
    '',
    '#### Native Checking Contract',
    '',
    'Checking body.',
    '',
    `${REVIEW_SPAN}#### Cost and Context Balance`,
    '',
    'Cost.',
  ].join('\n');
  return ['# Owner pointer', '', region('persona', 'Persona.'), '', region(regionId, body), '', region('agent-routing', 'Routing.'), ''].join('\n').split('\n').join(eol);
}

/**
 * A CLAUDE.md that holds ONE lazy section of the real list, built from the entry's own anchors: its start line,
 * a multibyte body, its end line, inside the first region id the entry accepts (or `regionId`).
 * @es Un CLAUDE.md con UNA sección diferida de la lista real, construido con los anclajes de la propia entrada.
 */
export function sectionMd(entry, { eol = '\n', regionId = entry.regions[0], body = ['Body — ñandú 日本.', '', 'Second paragraph.', ''] } = {}) {
  const inner = ['# Intro', '', entry.start, '', ...body, entry.end, 'After the section.'].join('\n');
  return ['# Owner pointer', '', region(regionId, inner), ''].join('\n').split('\n').join(eol);
}

/** What `gentle-ai sync` does to a region: replaces everything between its markers. @es Lo que hace `gentle-ai sync` con una región: reemplaza todo entre sus marcadores. */
export function syncRegion(text, from, regionId = 'sdd-orchestrator') {
  const open = `<!-- gentle-ai:${regionId} -->`;
  const close = `<!-- /gentle-ai:${regionId} -->`;
  return text.slice(0, text.indexOf(open)) + from.slice(from.indexOf(open), from.indexOf(close)) + text.slice(text.indexOf(close));
}
