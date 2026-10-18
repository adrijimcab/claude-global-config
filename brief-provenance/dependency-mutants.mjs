/**
 * The decisions of the dependency-claim face, each broken once, for `mutants.mjs` to run against
 * `selftest.mjs`: how a package name is told from its prose, what counts as a citation, which manifests and
 * sections name the dependencies, where the project comes from, and how the refusal and its journal read.
 * A survivor is a missing assertion; a mutant is never deleted or softened.
 *
 * @es Las decisiones de la cara de dependencias, rotas una a una, para `mutants.mjs`: cómo se distingue un
 * nombre de paquete de su prosa, qué cuenta como cita, qué manifiestos y secciones nombran las
 * dependencias, de dónde sale el proyecto y cómo se leen el rechazo y su diario.
 */

const CLAIM = 'brief-provenance/dependency-claim.mjs';
const NAMES = 'brief-provenance/dependency-names.mjs';
const REFUSAL = 'brief-provenance/dependency-refusal.mjs';
const GUARD = 'brief-provenance/guard.mjs';

// The two separator lists, as written in the source (backslash escapes included), each paired with the
// spelling of every character so one mutant drops exactly one of them.
// @es Las dos listas de separadores tal como están en el fuente, con la grafía de cada carácter.
const NAME_LINE = String.raw`const NAME_SEPARATORS = ' \t\r:,;()[]{}<>|"\'` + '`=!?\';';
const CITATION_LINE = String.raw`const CITATION_SEPARATORS = ' \t\r,;()[]{}<>|"\'` + '`\';';
const SPELLINGS = [' ', String.raw`\t`, String.raw`\r`, ':', ',', ';', '(', ')', '[', ']', '{', '}', '<', '>', '|', '"', String.raw`\'`, '`', '=', '!', '?'];

/** One mutant per separator character: the line with that character's spelling removed from its literal. @es Un mutante por carácter. */
function droppedSeparators(line, label) {
  const bodyStart = line.indexOf("= '") + 3;

  return SPELLINGS.filter((spelling) => line.indexOf(spelling, bodyStart) >= 0).map((spelling) => {
    const at = line.indexOf(spelling, bodyStart);

    return [`${label} no longer separates on ${spelling}`, CLAIM, line, `${line.slice(0, at)}${line.slice(at + spelling.length)}`];
  });
}

export const DEPENDENCY_MUTANTS = [
  // What separates a name from its prose / Qué separa un nombre de su prosa
  ...droppedSeparators(NAME_LINE, 'a package name'),
  ...droppedSeparators(CITATION_LINE, 'a citation'),
  ['a trailing period stays part of a name or a line number', CLAIM, "while (trimmed.endsWith('.'))", 'while (false)'],
  ['names are matched with their trailing period', CLAIM, '.map(trimPeriods).filter', '.filter'],
  ['a name is matched as a substring of a word', CLAIM, 'names.has(word)', '[...names].some((name) => word.includes(name))'],
  // What counts as a citation / Qué cuenta como cita
  ['a path under node_modules\\ is not a citation', CLAIM, "line.split('\\\\').join('/').includes('node_modules/')", "line.includes('node_modules/')"],
  ['a path under node_modules/ is not a citation', CLAIM, ".includes('node_modules/')) return true;", ".includes('node_modules/') && false) return true;"],
  ['a range may have any number of parts', CLAIM, 'parts.length <= 2 &&', 'true &&'],
  ['a range part may be empty', CLAIM, 'part.length > 0 && [...part]', '[...part]'],
  ['a range part need not be digits', CLAIM, 'DIGITS.includes(character)', 'true'],
  ['one digit is not a digit', CLAIM, "const DIGITS = '0123456789';", "const DIGITS = '012345678';"],
  ['a slashed path is not a path', CLAIM, "if (text.includes('/')) return true;", "if (text.includes('/') && false) return true;"],
  ['a hidden file has no extension', CLAIM, 'dot >= 0 ?', 'dot > 0 ?'],
  ['every word has an extension', CLAIM, 'dot >= 0 ?', 'true ?'],
  ['an empty extension is a path', CLAIM, 'extension.length > 0 && [...extension]', '[...extension]'],
  ['any extension is a path', CLAIM, '[...extension].every((character) => LETTERS.includes(character))', 'true'],
  ['the reference is not checked as a line number', CLAIM, 'isLineRef(reference) &&', 'true &&'],
  ['the citation path is not checked as a path', CLAIM, '&& looksLikePath(word.slice(0, colon))', '&& true'],
  ['the reference keeps its trailing period', CLAIM, 'trimPeriods(word.slice(colon + 1))', 'word.slice(colon + 1)'],
  // Which lines are MEASURED lines / Qué líneas son MEASURED
  ['a layout prefix keeps a line from being a MEASURED line', CLAIM, 'const line = stripLead(rawLine);', 'const line = rawLine;'],
  ['a MEASURED word anywhere in a line heads it', CLAIM, 'if (!line.startsWith(MEASURED_WORD)) continue;', 'if (!line.includes(MEASURED_WORD)) continue;'],
  ['a longer word is a MEASURED line', CLAIM, 'if (LETTERS.includes(line.slice(MEASURED_WORD.length).charAt(0))) continue;', ''],
  // When a line is refused / Cuándo se rechaza una línea
  ['a line naming no dependency is refused', CLAIM, 'if (packages.length > 0 && !citesSource(line))', 'if (!citesSource(line))'],
  ['a cited line is refused', CLAIM, 'if (packages.length > 0 && !citesSource(line))', 'if (packages.length > 0)'],
  ['an uncited line is allowed', CLAIM, 'if (packages.length > 0 && !citesSource(line))', 'if (packages.length > 0 && citesSource(line))'],
  // Which sections and manifests name the dependencies / Qué secciones y manifiestos
  ['dependencies are not names', NAMES, "['dependencies', 'devDependencies', 'peerDependencies']", "['devDependencies', 'peerDependencies']"],
  ['devDependencies are not names', NAMES, "['dependencies', 'devDependencies', 'peerDependencies']", "['dependencies', 'peerDependencies']"],
  ['peerDependencies are not names', NAMES, "['dependencies', 'devDependencies', 'peerDependencies']", "['dependencies', 'devDependencies']"],
  ['a null section throws', NAMES, "if (entries !== null && typeof entries === 'object')", "if (typeof entries === 'object')"],
  ['a string section names its characters', NAMES, "if (entries !== null && typeof entries === 'object')", 'if (entries !== null)'],
  ['a null or string manifest is read as one', NAMES, "if (manifest === null || typeof manifest !== 'object') {", 'if (false) {'],
  ['a null manifest is read as an object', NAMES, "if (manifest === null || typeof manifest !== 'object') {", "if (typeof manifest !== 'object') {"],
  ['a string manifest is read as an object', NAMES, "if (manifest === null || typeof manifest !== 'object') {", 'if (manifest === null) {'],
  ['an unreadable root manifest is not reported', NAMES, 'if (isRoot) undecided.push({ file, reason: error instanceof Error', 'if (false) undecided.push({ file, reason: error instanceof Error'],
  ['a non-object root manifest is not reported', NAMES, "if (isRoot) undecided.push({ file, reason: 'package.json is not a JSON object' });", ''],
  ['a missing workspace manifest is reported as undecided', NAMES, 'if (isRoot) undecided.push({ file, reason: error instanceof Error', 'if (true) undecided.push({ file, reason: error instanceof Error'],
  ['workspaces of workspaces are followed', NAMES, 'if (isRoot) for (const child', 'for (const child'],
  ['workspaces are not followed', NAMES, 'if (isRoot) for (const child', 'if (false) for (const child'],
  // Workspace shapes / Formas de workspaces
  ['the object form of workspaces is not read', NAMES, 'Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages', 'manifest.workspaces'],
  ['the array form of workspaces is not read', NAMES, 'Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages', 'manifest.workspaces?.packages'],
  ['a manifest with no workspaces throws', NAMES, 'if (!Array.isArray(entries)) return [];', ''],
  ['a non-string workspace entry throws', NAMES, "if (typeof entry !== 'string') continue;", ''],
  ['a dir/* entry is read as a plain directory', NAMES, "if (entry.endsWith('/*')) {", 'if (false) {'],
  ['a dir/* entry lists the wrong directory', NAMES, "const parent = `${directory}/${entry.slice(0, -2)}`;", 'const parent = `${directory}/${entry}`;'],
  ['a dir/* child is read from the wrong place', NAMES, 'found.push(`${parent}/${child}`)', 'found.push(parent)'],
  ['a plain workspace is read from the wrong place', NAMES, 'found.push(`${directory}/${entry}`);', 'found.push(entry);'],
  // Where the project comes from / De dónde sale el proyecto
  ['the TENANCY path never wins over cwd', NAMES, 'if (declared.length > 0) return declared;', ''],
  ['an absent cwd is a project', NAMES, "typeof cwd === 'string' && cwd.length > 0 ? [cwd] : []", '[cwd]'],
  // The wire / El cable
  ['the second face never runs', GUARD, 'if (refusal === undefined) return dependencyClaimOutput(brief, payload);', 'if (refusal === undefined) return undefined;'],
  ['a brief with no project is not journaled', GUARD, 'if (directories.length === 0) undecided.push', 'if (false) undecided.push'],
  ['an undecided project is not journaled', GUARD, 'if (undecided.length > 0) journal', 'if (false) journal'],
  ['an undecided entry does not name its tool', GUARD, 'session: payload?.session_id, tool: brief.toolName };', 'session: payload?.session_id };'],
  ['an unsourced claim is allowed', GUARD, 'if (claims.length === 0) return undefined;', 'return undefined;'],
  ['every brief is refused', GUARD, 'if (claims.length === 0) return undefined;', 'if (false) return undefined;'],
  ['a refusal is journaled under another kind', GUARD, "kind: 'dependency-claim', packages", "kind: 'x', packages"],
  ['a refusal does not journal its packages', GUARD, 'packages: claims.flatMap((claim) => claim.packages) });', 'packages: [] });'],
  ['a refusal is worded for the wrong surface', GUARD, 'surface: brief.surface, toolName: brief.toolName })', "surface: 'delegation', toolName: brief.toolName })"],
  ['a refusal names the wrong tool', GUARD, 'surface: brief.surface, toolName: brief.toolName })', "surface: brief.surface, toolName: 'Agent' })"],
  // The words / Las palabras
  ['a package named by two lines is listed twice', REFUSAL, '[...new Set(refusal.claims.flatMap((claim) => claim.packages))].join', 'refusal.claims.flatMap((claim) => claim.packages).join'],
  ['packages are listed without a space', REFUSAL, ".join(', ');", ".join(',');"],
  ['the offending line is not shown', REFUSAL, '...refusal.claims.map((claim) => `  UNSOURCED — ${claim.line}`),', ''],
  ['the HYPOTHESIS way out is not named', REFUSAL, "'  2. Move the claim to a HYPOTHESIS: line, so the worker tests it rather than inherits it.',", ''],
  ['the citation way out is not named', REFUSAL, "'  1. Read the installed source and cite it on the same line, as path:line or a path under node_modules/,',", ''],
  ['the Spanish half is not given', REFUSAL, "'@es Una afirmación sobre cómo se comporta una dependencia en ejecución se lee en su código INSTALADO antes de',", ''],
  ['the real-tool rule is not stated', REFUSAL, "'A teardown or lifecycle proof also runs against the real tool, never only against a stand-in modelled on the claim.',", '']
];
