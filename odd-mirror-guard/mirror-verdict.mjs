/**
 * Judges whether each ODD feature document has a CURRENT engram mirror. It owns the comparison between a
 * file's mtime and the mirror's `updated_at`, and the rule that decides which engram rows belong to the project.
 *
 * The mirror of `odd/tasks/<feature>.md` is the live observation with topic_key `odd/<feature>/tasks` in the
 * project. Rows come from `readRevisionsByTopicKey` (the one engram reader of the fleet, newest first); the
 * project is matched here, by name with case and separators ignored (`Foo_Bar` is `foo-bar`), because that
 * reader filters on the exact string.
 *
 * `updated_at` is engram's `datetime('now')`, UTC with a one-second resolution (measured in the live schema),
 * so a file counts as NEWER than its mirror only when its mtime, truncated to the second, is later.
 *
 * @es Juzga si cada documento de feature ODD tiene un espejo ACTUAL en engram. Es dueño de la comparación entre
 * el mtime del fichero y el `updated_at` del espejo, y de la regla de qué filas son del proyecto. El espejo es
 * la observación viva con topic_key `odd/<feature>/tasks`; las filas vienen del lector único de la flota y el
 * proyecto se casa aquí por nombre sin mayúsculas ni separadores. `updated_at` es UTC con resolución de un
 * segundo: el fichero es MÁS NUEVO solo si su mtime, truncado al segundo, es posterior.
 */

import path from 'node:path';

import { readRevisionsByTopicKey } from '../backlog-content-guard/current-revision.mjs';

/** The topic_key under which a feature's document is mirrored. @es El topic_key del espejo de una feature. */
export const mirrorTopicKey = (feature) => `odd/${feature}/tasks`;

/** A project name reduced to its letters and digits. @es Un nombre de proyecto reducido a letras y dígitos. */
const normalized = (name) => String(name ?? '').toLowerCase().replaceAll(/[^a-z0-9]/g, '');

/**
 * Epoch seconds of an engram timestamp. A value without a zone is UTC (`YYYY-MM-DD HH:MM:SS`).
 * @es Segundos epoch de un timestamp de engram. Sin zona es UTC.
 */
export function secondsOf(timestamp) {
  const text = String(timestamp ?? '').trim();
  const zoned = /(?:Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`;
  const milliseconds = Date.parse(zoned.replace(' ', 'T'));

  return Number.isNaN(milliseconds) ? undefined : Math.floor(milliseconds / 1000);
}

/** `YYYY-MM-DD HH:MM:SS` UTC for display. @es Instante UTC para mostrar. */
const shown = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 19).replace('T', ' ');

/**
 * @param {string} projectRoot
 * @param {{ feature: string, modifiedAtMs: number }[]} documents
 * @param {{ databasePath?: string }} [options]
 * @returns {{ findings: { feature: string, kind: 'missing' | 'stale', documentAt: string, mirrorAt?: string, documentSeconds: number }[], unmeasured: { feature: string, reason: string }[] }}
 * @es `findings` (espejo ausente o viejo) y `unmeasured` (el almacén no se pudo leer: nunca se lee como «al día»).
 */
export function judgeMirrors(projectRoot, documents, options = {}) {
  const project = normalized(path.basename(path.resolve(projectRoot)));
  const findings = [];
  const unmeasured = [];

  for (const { feature, modifiedAtMs } of documents) {
    const read = readRevisionsByTopicKey(mirrorTopicKey(feature), {}, options);

    if (read.error !== undefined) {
      unmeasured.push({ feature, reason: `${read.error}${read.detail === undefined ? '' : `: ${read.detail}`}` });
      continue;
    }

    const documentSeconds = Math.floor(modifiedAtMs / 1000);
    const documentAt = shown(documentSeconds);
    const row = read.rows.find((candidate) => normalized(candidate.project) === project);

    if (row === undefined) {
      findings.push({ feature, kind: 'missing', documentAt, documentSeconds });
      continue;
    }

    const mirrorSeconds = secondsOf(row.updated_at);

    if (mirrorSeconds === undefined) {
      unmeasured.push({ feature, reason: `unparseable updated_at ${JSON.stringify(row.updated_at)}` });
    } else if (documentSeconds > mirrorSeconds) {
      findings.push({ feature, kind: 'stale', documentAt, mirrorAt: shown(mirrorSeconds), documentSeconds });
    }
  }

  return { findings, unmeasured };
}
