/**
 * Walks a TypeScript source text with the COMPILER API (never regex, never a substring scan — the
 * project's own `M5` rule: a regex that fails to match skips silently, and `import * as x` /
 * `import { a as b }` share the literal word "as" with a real type assertion without sharing its
 * meaning) and returns every VALUE-LEVEL type assertion it contains.
 *
 * Counted, because each one discards type safety at a value: `x as T`, the legacy angle-bracket form
 * `<T>x`, the postfix non-null assertion `x!`, and the doubled `x as unknown as T` (which the AST
 * already represents as two nested `AsExpression` nodes, so it is naturally counted as two — more
 * severe than a single cast, which is the right weighting for the most total-safety-defeating form).
 *
 * NEVER counted, because both are TYPE-LEVEL and the owner explicitly allows them: `x as const` (an
 * `AsExpression` whose `type` is the special `const` type-reference the checker itself recognises via
 * `isConstTypeReference`) and `x satisfies T` (a distinct `SatisfiesExpression` node the walk never adds
 * to the list — it narrows nothing and asserts nothing, it only checks). `import * as ns`, `import { a
 * as b }` and `export { a as b }` are different node kinds entirely (`NamespaceImport`,
 * `ImportSpecifier`, `ExportSpecifier`) and never produce an `AsExpression` — verified empty on a fixture
 * carrying all three, in `selftest.mjs`.
 *
 * `ts.createSourceFile` never throws on invalid syntax — TypeScript's parser is error-tolerant and
 * produces a best-effort AST with diagnostics attached, which this walk ignores; a genuinely broken file
 * still gets whatever assertions its recoverable AST contains, which is strictly safer than treating
 * "can't fully parse" as "nothing to check".
 *
 * @es Recorre un texto TypeScript con la API DEL COMPILADOR (nunca regex ni substring — la propia regla
 * M5: un regex que no matchea se salta en silencio, y `import * as x` / `import { a as b }` comparten la
 * palabra "as" con una aserción real sin compartir su significado) y devuelve cada aserción de tipo EN
 * TIEMPO DE VALOR. Se cuentan `x as T`, `<T>x`, el `!` postfijo, y `x as unknown as T` (dos
 * `AsExpression` anidados, contados como dos). NUNCA se cuentan `x as const` (un `AsExpression` cuyo
 * `type` es la referencia especial `const`) ni `x satisfies T` (un nodo `SatisfiesExpression` distinto).
 * `import * as ns`, `import { a as b }` y `export { a as b }` son OTROS tipos de nodo y jamás producen
 * un `AsExpression` — verificado vacío sobre un fixture con los tres, en `selftest.mjs`.
 */

/**
 * @typedef {{ kind: 'as' | 'angle-bracket' | 'non-null', text: string, line: number, column: number }} AssertionRecord
 */

/** Whether an `AsExpression`'s type node is the special `const` type reference (`x as const`), which the owner allows. */
function isAsConstType(typeNode, ts) {
  return (
    ts.isTypeReferenceNode(typeNode) &&
    ts.isIdentifier(typeNode.typeName) &&
    typeNode.typeName.text === 'const' &&
    (typeNode.typeArguments === undefined || typeNode.typeArguments.length === 0)
  );
}

/** One human-readable record for a node the walk decided to count. 1-based line/column, as editors show them. */
function assertionRecordOf(node, sourceFile, kind) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

  return { kind, text: node.getText(sourceFile), line: line + 1, column: character + 1 };
}

/**
 * @param {string} sourceText
 * @param {string} filePath Only its extension decides the script kind (`.tsx` needs JSX-aware parsing).
 * @param {object} ts A resolved `typescript` module (see `resolve-typescript.mjs`).
 * @returns {AssertionRecord[]} Every counted assertion, in source order.
 */
export function collectAssertions(sourceText, filePath, ts) {
  const scriptKind = filePath.toLowerCase().endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, /* setParentNodes */ true, scriptKind);
  const assertions = [];

  const visit = (node) => {
    if (ts.isAsExpression(node)) {
      if (!isAsConstType(node.type, ts)) assertions.push(assertionRecordOf(node, sourceFile, 'as'));
    } else if (ts.isTypeAssertionExpression(node)) {
      assertions.push(assertionRecordOf(node, sourceFile, 'angle-bracket'));
    } else if (ts.isNonNullExpression(node)) {
      assertions.push(assertionRecordOf(node, sourceFile, 'non-null'));
    }
    // `satisfies` (ts.isSatisfiesExpression) is deliberately never added — allowed, not merely uncounted
    // by omission: forEachChild below still descends into it, so an assertion NESTED inside a
    // `satisfies` expression's own expression is still found.

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return assertions;
}
