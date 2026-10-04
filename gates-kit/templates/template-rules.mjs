/**
 * Owns the question "is this agent-contract template complete?". A template under
 * `gates-kit/templates/<stack>/AGENT-CONTRACT.md` is complete when it carries (1) the six stance anchors
 * G1 to G6 as second-level headings with the wording of the hardened-dev-environment spec, each section
 * holding an `@es` Spanish mirror line; (2) exactly one full-chain command line, `Full-chain command:`
 * followed by one backticked command with no placeholder; (3) the scoped-versus-full sentence with its
 * exact Spanish mirror. A template is a document: nothing here reads a project, it only reads text.
 *
 * Decisions: G4 is anchored on its stack-neutral title (the b100 parity-twin clause belongs to that
 * repository, not to a template); a template is found by walking the folder, never from a list, so a stack
 * folder without its contract file is itself a problem; a defect is reported alone, so one missing part
 * never hides behind another.
 *
 * @es Responde a "¿está completa esta plantilla de contrato de agente?". Está completa cuando lleva (1) las
 * seis anclas G1 a G6 como títulos de segundo nivel con la redacción de la spec, y en cada sección una línea
 * espejo `@es`; (2) exactamente una línea de comando de cadena completa (`Full-chain command:` y un comando
 * entre acentos graves, sin relleno); (3) la frase acotado-contra-completo con su espejo español exacto. Las
 * plantillas se descubren recorriendo la carpeta, nunca desde una lista: una carpeta sin su fichero es un
 * problema. Cada defecto se informa solo, para que ninguno se esconda tras otro.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** The G1 to G6 anchors: id and exact heading line. @es Las anclas G1 a G6: id y línea de título exacta. */
const ANCHORS = [
  ['G1', '## G1 Zero suppression'],
  ['G2', '## G2 Bilingual runtime text'],
  ['G3', '## G3 Scoped gates during work, full chain once at landing'],
  ['G4', '## G4 Out-of-scope repositories untouched'],
  ['G5', '## G5 Unit size and writers'],
  ['G6', '## G6 Closed items need evidence'],
];

/** The scoped-versus-full rule. @es La regla acotado-contra-completo. */
const SCOPED_SENTENCE = 'A worker runs only the gates that read what it touched; the full chain runs once, at the end, by the orchestrator.';

/** Its Spanish mirror, accents included. @es Su espejo en español, con acentos. */
const SCOPED_SENTENCE_ES = 'Un worker corre solo los gates que leen lo que tocó; la cadena completa corre una sola vez, al final, por el orquestador.';

const CHAIN_PREFIX = 'Full-chain command:';
const CHAIN_LINE = /^Full-chain command: `([^`<>]*)`$/;
const MIRROR_MARKER = '@es ';
const CONTRACT_FILE = 'AGENT-CONTRACT.md';

/** The lines of the section opened by the heading at `start`, up to the next second-level heading. @es Líneas de una sección. */
function sectionAfter(lines, start) {
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => line.startsWith('## '));

  return next === -1 ? rest : rest.slice(0, next);
}

/** Problems of the full-chain line. @es Problemas de la línea de cadena completa. */
function chainProblems(lines) {
  const chain = lines.filter((line) => line.startsWith(CHAIN_PREFIX));

  if (chain.length === 0) return [{ id: 'missing-chain' }];
  if (chain.length > 1) return [{ id: 'multiple-chain' }];

  const match = CHAIN_LINE.exec(chain[0].trimEnd());

  return match === null || match[1].trim() === '' ? [{ id: 'malformed-chain' }] : [];
}

/**
 * Inspects one template text and returns `[{ id, detail? }]`; empty when the template is complete.
 * @es Inspecciona el texto de una plantilla; vacío cuando está completa.
 */
export function inspectTemplate(text) {
  const lines = text.split('\n'); // a CRLF text keeps a trailing carriage return, which every comparison trims
  const problems = [];

  for (const [id, heading] of ANCHORS) {
    const at = lines.findIndex((line) => line.trimEnd() === heading);

    if (at === -1) problems.push({ id: 'missing-anchor', detail: id });
    else if (!sectionAfter(lines, at).some((line) => line.startsWith(MIRROR_MARKER))) problems.push({ id: 'missing-es-mirror', detail: id });
  }

  problems.push(...chainProblems(lines));

  if (!lines.some((line) => line.includes(SCOPED_SENTENCE))) problems.push({ id: 'missing-sentence' });
  if (!lines.some((line) => line.startsWith(MIRROR_MARKER) && line.includes(SCOPED_SENTENCE_ES))) problems.push({ id: 'missing-sentence-es' });

  return problems;
}

/**
 * Walks `root`: one entry `{ name, problems }` per folder, in file system order; a folder without its
 * contract file reports `missing-file`. Plain files are not templates.
 * @es Recorre `root`: una entrada por carpeta, en el orden del sistema de ficheros; sin su fichero informa
 * `missing-file`. Los ficheros sueltos no son plantillas.
 */
export function inspectDirectory(root) {
  const names = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  return names.map((name) => {
    const file = path.join(root, name, CONTRACT_FILE);

    return { name, problems: existsSync(file) ? inspectTemplate(readFileSync(file, 'utf8')) : [{ id: 'missing-file' }] };
  });
}
