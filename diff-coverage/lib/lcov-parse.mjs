/**
 * Parses an LCOV tracefile (the format vitest's `lcov` coverage reporter emits) into per-file line and
 * branch hit tables. This project's `vitest.config.ts` drops the `json`/`json-summary` coverage
 * reporters ("nothing in the repo reads `coverage-final.json`" — see its `coverage.reporter` comment),
 * so `lcov.info` is the only machine-readable coverage artifact vitest actually produces here.
 *
 * String methods only, per this repo's own no-regex mandate (M5): every record is a line beginning
 * with a fixed tag (`SF:`, `DA:`, `BRDA:`, `end_of_record`), split on `:` and `,` at fixed positions.
 *
 * @es Parsea un fichero LCOV (el formato que emite el reporter `lcov` de vitest) en tablas de líneas y
 * ramas por fichero. El `vitest.config.ts` de este proyecto descarta los reporters `json`/`json-summary`
 * ("nada en el repo lee `coverage-final.json`"), así que `lcov.info` es el único artefacto de cobertura
 * legible por máquina que vitest produce aquí de verdad. Solo métodos de string, según el mandato
 * anti-regex (M5) de este mismo repo.
 */

const SOURCE_FILE_TAG = 'SF:';
const LINE_DATA_TAG = 'DA:';
const BRANCH_DATA_TAG = 'BRDA:';
const FUNCTION_TAG = 'FN:';
const FUNCTION_HITS_TAG = 'FNDA:';
const END_OF_RECORD_TAG = 'end_of_record';
const NOT_TAKEN_MARKER = '-';

/** Backslashes to forward slashes, so a Windows-style LCOV `SF:` path matches repo-relative keys. @es Barras invertidas a barras normales, para que una ruta `SF:` estilo Windows case con las claves relativas al repo. */
const toForwardSlashes = (value) => value.split('\\').join('/');

/**
 * Parses one `DA:<line>,<hits>` line-coverage record.
 * @es Parsea un registro de cobertura de línea `DA:<line>,<hits>`.
 */
const parseLineRecord = (body) => {
  const [lineText, hitsText] = body.split(',');
  return { line: Number(lineText), hits: Number(hitsText) };
};

/**
 * Parses one `BRDA:<line>,<block>,<branch>,<taken>` branch-coverage record. `taken` is `-` when the
 * branch's block was never reached at all (treated as zero hits, same as vitest/genhtml do).
 * @es Parsea un registro de cobertura de rama `BRDA:<line>,<block>,<branch>,<taken>`. `taken` es `-`
 * cuando el bloque de la rama nunca se alcanzó (se trata como cero hits, igual que vitest/genhtml).
 */
const parseBranchRecord = (body) => {
  const parts = body.split(',');
  const takenText = parts[3];
  const hits = takenText === NOT_TAKEN_MARKER ? 0 : Number(takenText);
  return { line: Number(parts[0]), hits };
};

/**
 * Parses LCOV tracefile `text` into a `Map<repoRelativePath, { lines: Map<lineNumber, hits>, branches:
 * Map<lineNumber, hits[]> }>`. A file with zero recorded branches on a given line simply has no entry
 * in that line's `branches` map key — callers must treat a missing key as "no branch to check", not as
 * "uncovered".
 * @param text - The raw contents of an `lcov.info` file. @es El contenido crudo de un fichero `lcov.info`.
 * @param toRepoRelative - Normalizes one `SF:` path (which may be absolute) to the same repo-relative,
 *   forward-slash form used by the diff parser's file keys.
 *   @es Normaliza una ruta `SF:` (que puede ser absoluta) a la misma forma relativa-al-repo con barras
 *   normales que usan las claves del parser de diff.
 * @es Parsea el `text` de un tracefile LCOV al `Map` descrito arriba.
 */
export const parseLcov = (text, toRepoRelative) => {
  const coverageByFile = new Map();
  let current = null;
  let functionLineByName = new Map();

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (line.startsWith(SOURCE_FILE_TAG)) {
      const path = toRepoRelative(toForwardSlashes(line.slice(SOURCE_FILE_TAG.length)));
      current = { lines: new Map(), branches: new Map(), functions: new Map() };
      functionLineByName = new Map();
      coverageByFile.set(path, current);
      continue;
    }
    if (current === null) continue;

    if (line.startsWith(FUNCTION_TAG)) {
      const body = line.slice(FUNCTION_TAG.length);
      const comma = body.indexOf(',');
      functionLineByName.set(body.slice(comma + 1), Number(body.slice(0, comma)));
      continue;
    }
    if (line.startsWith(FUNCTION_HITS_TAG)) {
      const body = line.slice(FUNCTION_HITS_TAG.length);
      const comma = body.indexOf(',');
      const declaredAt = functionLineByName.get(body.slice(comma + 1));
      if (declaredAt !== undefined) {
        const existing = current.functions.get(declaredAt) ?? [];
        current.functions.set(declaredAt, existing.concat(Number(body.slice(0, comma))));
      }
      continue;
    }

    if (line.startsWith(LINE_DATA_TAG)) {
      const { line: lineNumber, hits } = parseLineRecord(line.slice(LINE_DATA_TAG.length));
      current.lines.set(lineNumber, hits);
      continue;
    }
    if (line.startsWith(BRANCH_DATA_TAG)) {
      const { line: lineNumber, hits } = parseBranchRecord(line.slice(BRANCH_DATA_TAG.length));
      const existing = current.branches.get(lineNumber) ?? [];
      current.branches.set(lineNumber, existing.concat(hits));
      continue;
    }
    if (line === END_OF_RECORD_TAG) current = null;
  }

  return coverageByFile;
};
