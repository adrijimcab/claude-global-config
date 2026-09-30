/**
 * How a budget verdict reads to a person: `renderBudget` (verdict and missing imports in, report lines out) and
 * `renderUnmeasured` (the reason a set could not be measured in, the text out). Every line is bilingual,
 * English first and then `@es`. Nothing here measures, decides, reads a file or prints.
 *
 * @es Cómo lee una persona el veredicto de presupuesto: `renderBudget` (veredicto e imports ausentes, líneas
 * de informe) y `renderUnmeasured` (la razón por la que no se pudo medir, el texto). Cada línea es bilingüe,
 * primero inglés y luego `@es`. Aquí no se mide, no se decide, no se lee ningún fichero ni se imprime.
 */

const number = (value) => value.toLocaleString('en-US');

/** The heading of a section and its indented entries. @es El encabezado de una sección y sus entradas con sangría. */
const section = (heading, entries) => (entries.length === 0 ? [] : [heading, ...entries.map((entry) => `  ${entry}`)]);

/** The report of a measured set: the verdict line, the files by weight, then each non-empty section. @es El informe de un conjunto medido. */
export function renderBudget({ verdict, missing }) {
  const within = verdict.status === 'within';
  const project = verdict.source === 'project';
  const limit = verdict.overPerFile[0]?.limit;

  return [
    `budget ${within ? 'WITHIN' : 'OVER'}: ${number(verdict.rawTotal)} raw characters (harness-counted ${number(verdict.countedTotal)}) against ${number(verdict.ceiling)} (${project ? 'project' : 'global'} ceiling), margin ${number(verdict.margin)}. @es presupuesto ${within ? 'DENTRO' : 'EXCEDIDO'}: ${number(verdict.rawTotal)} caracteres brutos (contados por el harness ${number(verdict.countedTotal)}) frente a ${number(verdict.ceiling)} (techo ${project ? 'del proyecto' : 'global'}), margen ${number(verdict.margin)}.`,
    ...section('files by weight, raw / counted. @es ficheros por peso, bruto / contado.', verdict.files.map((file) => `${number(file.raw)} / ${number(file.counted)}  ${file.path}`)),
    ...section(`over the harness per-file limit of ${number(limit ?? 0)} (reported, not decided on). @es sobre el límite por fichero del harness de ${number(limit ?? 0)} (se informa, no decide).`, verdict.overPerFile.map((file) => `${number(file.counted)}  ${file.path}`)),
    ...section('missing imports (informational: the harness makes the same lookups; not part of the verdict). @es imports ausentes (informativo: el harness hace las mismas búsquedas; no forman parte del veredicto).', missing.map((gap) => `${gap.file} (imported by ${gap.importedBy})`))
  ];
}

/** The text for a set that could not be measured: a bilingual line, then the cause. @es El texto para un conjunto que no se pudo medir. */
export const renderUnmeasured = (reason) => `budget NOT MEASURED. @es presupuesto NO MEDIDO.\n${reason}`;
