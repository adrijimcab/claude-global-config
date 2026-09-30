/**
 * The grading core: given the changed NEW-file line numbers per file (from `diff-parse.mjs`) and the
 * per-file line/branch hit tables (from `lcov-parse.mjs`), decides which changed lines are uncovered.
 *
 * A changed line is uncovered when EITHER is true, checked independently:
 *   - its own line-hit count is `0` (the statement never ran), or
 *   - any branch recorded AT that line has an arm with `0` hits (the statement ran, but one of its
 *     branches never took — an `if` whose `else` never fired, a ternary whose one side never picked).
 *
 * The second check is what a naive "is the line's hit count non-zero" test would miss: a covered line
 * can still hide an uncovered branch on that same line. That is deliberate — it is the exact shape of
 * defect this tool exists to catch (see the orchestrator's brief and lesson key
 * `missing-harness-capability-left-as-protected-access`: coverage tooling that only reads line hits
 * cannot see a branch a worker never drove).
 *
 * Pre-existing debt is out of scope by construction: only line numbers present in the CALLER-supplied
 * changed-lines map are ever inspected, so an uncovered line elsewhere in the same file never surfaces
 * here.
 *
 * @es El núcleo de calificación: dados los números de línea NUEVOS cambiados por fichero y las tablas de
 * hits de línea/rama por fichero, decide qué líneas cambiadas quedan sin cubrir. Una línea cambiada
 * queda sin cubrir cuando su propio conteo de hits es `0`, O cuando cualquier rama registrada en esa
 * línea tiene un brazo con `0` hits — comprobado independientemente, porque una línea cubierta puede
 * esconder una rama sin cubrir en esa misma línea. Solo se inspeccionan los números de línea presentes
 * en el mapa de líneas cambiadas que pasa quien llama, así que una línea sin cubrir en otra parte del
 * mismo fichero (deuda preexistente) nunca aparece aquí.
 */

/** @typedef {{ file: string, line: number }} UncoveredEntry */

/**
 * One changed line's verdict: `null` when fully covered, otherwise the reason it is not.
 * @es El veredicto de una línea cambiada: `null` si está totalmente cubierta, si no la razón por la que
 * no lo está.
 */
const gradeLine = (fileCoverage, lineNumber) => {
  if (fileCoverage === undefined) return null;

  const lineHits = fileCoverage.lines.get(lineNumber);
  if (lineHits !== undefined && lineHits === 0) return 'line';

  const branchHits = fileCoverage.branches.get(lineNumber);
  if (branchHits !== undefined && branchHits.some((hits) => hits === 0)) return 'branch';

  return null;
};

/**
 * Grades every changed file against its coverage table.
 * @param changedLinesByFile - `Map<repoRelativePath, number[]>` from `parseChangedLinesByFile`.
 *   @es `Map<rutaRelativa, number[]>` de `parseChangedLinesByFile`.
 * @param coverageByFile - `Map<repoRelativePath, { lines, branches }>` from `parseLcov`.
 *   @es `Map<rutaRelativa, { lines, branches }>` de `parseLcov`.
 * @returns `{ uncovered: UncoveredEntry[], missingFromCoverage: string[] }` — `uncovered` is sorted by
 *   file then line, de-duplicated so a line with both an uncovered statement AND an uncovered branch is
 *   reported once; `missingFromCoverage` lists changed files the coverage report never instrumented at
 *   all (a file coverage genuinely cannot see, e.g. excluded by the run's own `coverage.include`).
 *   @es `uncovered` ordenado por fichero y línea, deduplicado; `missingFromCoverage` lista ficheros
 *   cambiados que el reporte de cobertura nunca instrumentó.
 * @es Gradúa cada fichero cambiado contra su tabla de cobertura.
 */
export const gradeChangedFiles = (changedLinesByFile, coverageByFile) => {
  const uncovered = [];
  const missingFromCoverage = [];

  for (const [file, lineNumbers] of changedLinesByFile) {
    const fileCoverage = coverageByFile.get(file);
    if (fileCoverage === undefined) {
      missingFromCoverage.push(file);
      continue;
    }

    const uniqueLines = [...new Set(lineNumbers)].sort((a, b) => a - b);
    for (const lineNumber of uniqueLines) {
      const reason = gradeLine(fileCoverage, lineNumber);
      if (reason !== null) uncovered.push({ file, line: lineNumber, reason });
    }
  }

  uncovered.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  return { uncovered, missingFromCoverage };
};
