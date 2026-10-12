/**
 * The refusal text of odd-mirror-guard. It owns the words, in English and Spanish, and nothing about how the
 * findings were reached.
 *
 * @es El texto del rechazo de odd-mirror-guard. Es dueño de las palabras, en inglés y en español, y nada de
 * cómo se llegó a los hallazgos.
 */

import { mirrorTopicKey } from './mirror-verdict.mjs';

/** One line per finding. @es Una línea por hallazgo. */
function describe(finding) {
  const key = mirrorTopicKey(finding.feature);

  return finding.kind === 'missing'
    ? `  - ${finding.feature}: mirror MISSING (no live engram observation with topic_key ${key}); file written ${finding.documentAt} UTC. @es espejo AUSENTE.`
    : `  - ${finding.feature}: mirror STALE (engram ${finding.mirrorAt} UTC is older than the file ${finding.documentAt} UTC; topic_key ${key}). @es espejo DESACTUALIZADO.`;
}

/** @es El motivo de rechazo para un conjunto de hallazgos. */
export function refusalText(findings) {
  return [
    `ODD-MIRROR: ${findings.length} ODD feature document${findings.length === 1 ? ' has' : 's have'} no current engram mirror.`,
    '',
    ...findings.map(describe),
    '',
    'An ODD document is kept only as a working file plus its engram mirror, so a missing or older mirror is the',
    'only durable copy lost. Save each file with mem_save (topic_key `odd/<feature>/tasks`, the whole document),',
    'then end the turn. This refusal fires once per session for this set; a new or still-bad document is shown again.',
    '',
    '@es Un documento ODD se guarda solo como fichero de trabajo más su espejo en engram: un espejo ausente o más',
    '@es viejo que el fichero es la única copia duradera perdida. Guardá cada fichero con mem_save (topic_key',
    '@es `odd/<feature>/tasks`, el documento entero) y terminá el turno. Este rechazo sale una vez por sesión y',
    '@es conjunto; un documento nuevo o aún malo se vuelve a mostrar.',
  ].join('\n');
}
