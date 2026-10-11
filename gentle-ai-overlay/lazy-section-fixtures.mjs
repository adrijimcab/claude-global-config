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
function orchestratorRegion({ span = REVIEW_SPAN, regionId = 'sdd-orchestrator' } = {}) {
  return region(regionId, ['# Agent Teams', '', '#### Native Checking Contract', '', 'Checking.', '', `${span}#### Cost and Context Balance`, '', 'Cost.'].join('\n'));
}

/**
 * A CLAUDE.md as gentle-ai renders it, whose regions hold EVERY lazy section of the real list that the render
 * carries (built from their own anchors, in the order their anchors chain: a section's end line is the next
 * one's start where upstream chains them), the review span among them. `regionId` `orchestrator` is the v4 (ODD)
 * render and carries every section; `sdd-orchestrator` is the v2/v3 render, which has none of the v4-only spans.
 * @es Un CLAUDE.md como lo genera gentle-ai, cuyas regiones contienen TODA sección diferida de la lista real que
 * ese render lleva. `orchestrator` es el render v4 (ODD) y lleva todas; `sdd-orchestrator` es el render v2/v3, sin
 * ninguno de los tramos exclusivos de v4.
 */
export function fullOrchestratorMd({ eol = '\n', regionId = 'orchestrator' } = {}) {
  const v4 = regionId === 'orchestrator';
  const blocking = lazyEntryNamed('blocking-prompts');
  const delegation = lazyEntryNamed('delegation-and-verification');
  const routing = lazyEntryNamed('routing-and-hand-off');
  const registry = lazyEntryNamed('skill-registry-protocol');
  const odd = lazyEntryNamed('odd-reference');
  const rdd = lazyEntryNamed('rdd-user-owned');
  const onlyV4 = (lines) => (v4 ? lines : []);
  // Both renders carry the language, delegation and verification headings; only the v4 one may move them.
  // @es Ambos renders llevan los encabezados de idioma, delegación y verificación; solo el de v4 puede moverlos.
  const body = [
    '# Agent Teams',
    '',
    ...onlyV4([lazyEntryNamed('orchestrator-mental-model').start, '', 'Model — ñandú.', '']),
    blocking.start,
    '',
    'Blocking prompts body — ñandú 日本.',
    '',
    delegation.start,
    '',
    'Language body.',
    '',
    '### Delegation Rules',
    '',
    'Delegation table — ñandú.',
    '',
    '#### Delegated Verification Gate (MANDATORY)',
    '',
    'Gate body.',
    '',
    '#### Native Checking Contract',
    '',
    'Checking body.',
    '',
    `${REVIEW_SPAN}${routing.start}`,
    '',
    'Cost.',
    '',
    ...onlyV4(['### Work Routing Ladder', '', 'Ladder — 日本.', '', '### Intent-Driven Skill Discovery', '', 'Discovery — ñandú.', '', routing.end, '', 'Safety rules.', '', registry.start, '', 'Registry — 日本.', '']),
  ].join('\n');
  const agentRouting = ['## Implementation Routing', '', '### ODD protocol (MANDATORY, in this order, on every request)', '', 'Protocol.', '', ...onlyV4([odd.start, '', 'ODD detail — ñandú 日本.', '']), rdd.start, '', 'Switch rules — 日本.', '', region('remote-authorization', [lazyEntryNamed('remote-authorization').start, '', 'Remote rules — ñandú.'].join('\n'))].join('\n');
  return ['# Owner pointer', '', region('persona', 'Persona.'), '', region(regionId, body), '', region('agent-routing', agentRouting), ''].join('\n').split('\n').join(eol);
}

/**
 * A CLAUDE.md that holds ONE lazy section of the real list, built from the entry's own anchors: its start line,
 * a multibyte body, its end line, inside the first region id the entry accepts (or `regionId`).
 * @es Un CLAUDE.md con UNA sección diferida de la lista real, construido con los anclajes de la propia entrada.
 */
export function sectionMd(entry, { eol = '\n', regionId = entry.regions[0], body = ['Body — ñandú 日本.', '', 'Second paragraph.', ''] } = {}) {
  const marker = (prefix) => (entry.end.startsWith(prefix) && entry.end.endsWith(' -->') ? entry.end.slice(prefix.length, -' -->'.length) : undefined);
  const closes = marker('<!-- /gentle-ai:') === regionId;
  const nested = marker('<!-- gentle-ai:');
  const lines = ['# Intro', '', entry.start, '', ...body];
  // The end line may be the closing marker of the region itself, or the opening marker of a region nested in it.
  // @es La línea final puede ser el marcador de cierre de la propia región, o el de apertura de una región anidada en ella.
  const text = closes
    ? [`<!-- gentle-ai:${regionId} -->`, ...lines, entry.end]
    : [`<!-- gentle-ai:${regionId} -->`, ...lines, entry.end, 'After the section.', ...(nested === undefined ? [] : [`<!-- /gentle-ai:${nested} -->`]), `<!-- /gentle-ai:${regionId} -->`];
  return ['# Owner pointer', '', ...text, ''].join('\n').split('\n').join(eol);
}

/** What `gentle-ai sync` does to a region: replaces everything between its markers. @es Lo que hace `gentle-ai sync` con una región: reemplaza todo entre sus marcadores. */
export function syncRegion(text, from, regionId = 'sdd-orchestrator') {
  const open = `<!-- gentle-ai:${regionId} -->`;
  const close = `<!-- /gentle-ai:${regionId} -->`;
  return text.slice(0, text.indexOf(open)) + from.slice(from.indexOf(open), from.indexOf(close)) + text.slice(text.indexOf(close));
}
