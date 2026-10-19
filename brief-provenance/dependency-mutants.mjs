/**
 * The decisions of the dependency-claim face, each broken once, for `mutants.mjs` to run against
 * `selftest.mjs`: how a package name is told from its prose, which lines belong to a MEASURED claim, what
 * counts as a citation, a run receipt or a manifest version, which manifests and sections name the
 * dependencies, how the checkout is contained, where the project comes from, and how the refusal and its
 * journals read. A survivor is a missing assertion; a mutant is never deleted or softened.
 *
 * NOT MUTATED, AND WHY: the `index < word.length` bound and the `index += 1` step of the version scan, whose
 * every mutant loops forever (the empty string is "included" in any string), so it can only time out, never
 * be decided by a check.
 *
 * @es Las decisiones de la cara de dependencias, rotas una a una, para `mutants.mjs`. NO SE MUTAN la cota y el
 * paso del recorrido de versión: todo mutante suyo es un bucle infinito, que solo puede agotar el tiempo.
 */

const CLAIM = 'brief-provenance/dependency-claim.mjs';
const EVIDENCE = 'brief-provenance/dependency-evidence.mjs';
const WORDS = 'brief-provenance/line-words.mjs';
const NAMES = 'brief-provenance/dependency-names.mjs';
const REFUSAL = 'brief-provenance/dependency-refusal.mjs';
const GUARD = 'brief-provenance/guard.mjs';

// The two separator lists, as written in the source (backslash escapes included), each paired with the
// spelling of every character so one mutant drops exactly one of them.
// @es Las dos listas de separadores tal como están en el fuente, con la grafía de cada carácter.
const NAME_LINE = String.raw`const NAME_SEPARATORS = ' \t\r:,;()[]{}<>|"\'` + '`=!?\';';
const CITATION_LINE = String.raw`const CITATION_SEPARATORS = ' \t\r,;()[]{}<>|"\'` + '`\';';
const SPELLINGS = [' ', String.raw`\t`, String.raw`\r`, ':', ',', ';', '(', ')', '[', ']', '{', '}', '<', '>', '|', '"', String.raw`\'`, '`', '=', '!', '?'];

/** One mutant per character of a quoted list: the line with that character's spelling removed. @es Un mutante por carácter. */
function droppedCharacters(file, line, spellings, label) {
  const bodyStart = line.indexOf("= '") + 3;

  return spellings.filter((spelling) => line.indexOf(spelling, bodyStart) >= 0).map((spelling) => {
    const at = line.indexOf(spelling, bodyStart);

    return [`${label} no longer accepts ${spelling}`, file, line, `${line.slice(0, at)}${line.slice(at + spelling.length)}`];
  });
}

const ENGLISH_LINE = "const ENGLISH_WORDS = new Set(['ignore', 'concurrently', 'prettier', 'unified', 'glob', 'chalk', 'debug', 'ms', 'open']);";
const ENGLISH = ['ignore', 'concurrently', 'prettier', 'unified', 'glob', 'chalk', 'debug', 'ms', 'open'];

/** One mutant per English word: the set without it. @es Un mutante por palabra inglesa. */
const droppedWords = ENGLISH.map((word) => [
  `the English word ${word} counts as a package name`,
  CLAIM,
  ENGLISH_LINE,
  `const ENGLISH_WORDS = new Set([${ENGLISH.filter((other) => other !== word).map((other) => `'${other}'`).join(', ')}]);`
]);

const VERSION_LINE = "const VERSION_LEAD = '~^<>=v';";

export const DEPENDENCY_MUTANTS = [
  // What separates a name from its prose / Qué separa un nombre de su prosa
  ...droppedCharacters(CLAIM, NAME_LINE, SPELLINGS, 'a package name separator list'),
  ...droppedCharacters(EVIDENCE, CITATION_LINE, SPELLINGS, 'a citation separator list'),
  ['a trailing period stays part of a name or a line number', WORDS, "while (trimmed.endsWith('.'))", 'while (false)'],
  ['names are matched with their trailing period', CLAIM, '.map((word) => trimPeriods(word).toLowerCase())', '.map((word) => word.toLowerCase())'],
  ['the words of a line are not case-folded', CLAIM, 'trimPeriods(word).toLowerCase())', 'trimPeriods(word))'],
  ['the manifest names are not case-folded', CLAIM, 'new Set([...names].map((name) => name.toLowerCase()))', 'new Set(names)'],
  ['a name is matched as a substring of a word', CLAIM, 'folded.has(word) && !ENGLISH_WORDS', '[...folded].some((name) => word.includes(name)) && !ENGLISH_WORDS'],
  ['English-word names count as package names', CLAIM, ' && !ENGLISH_WORDS.has(word))', ')'],
  ...droppedWords,
  // Which lines belong to a claim / Qué líneas son de una afirmación
  ['a layout prefix keeps a line from being a claim line', CLAIM, 'const line = stripLead(rawLine);', 'const line = rawLine;'],
  ['a MEASURED word anywhere in a line heads it', CLAIM, 'line.startsWith(word) && !LETTERS', 'line.includes(word) && !LETTERS'],
  ['a longer word heads a claim', CLAIM, ' && !LETTERS.includes(line.slice(word.length).charAt(0));', ';'],
  ['the heading line is not read', CLAIM, '      lines.push(line);\n      inClaim = true;', '      inClaim = true;'],
  ['a heading opens no continuation', CLAIM, 'inClaim = true;', 'inClaim = false;'],
  ['any line with layout continues a claim, headed or not', CLAIM, 'inClaim = inClaim &&', 'inClaim = true &&'],
  ['an unindented line continues a claim', CLAIM, 'inClaim = inClaim && line !== rawLine &&', 'inClaim = inClaim &&'],
  ['a blank line with layout continues a claim', CLAIM, ' && line.length > 0 &&', ' &&'],
  ['an indented HYPOTHESIS marker continues a claim', CLAIM, ' && !headsMarker(line, HYPOTHESIS_WORD);', ';'],
  ['the continuation is not read', CLAIM, 'if (inClaim) lines.push(line);', ''],
  // When a line is refused / Cuándo se rechaza una línea
  ['evidence on the line is ignored', CLAIM, 'if (carriesEvidence(line)) continue;', ''],
  ['every claim line counts as evidenced', CLAIM, 'if (carriesEvidence(line)) continue;', 'continue;'],
  ['a line naming no dependency is refused', CLAIM, 'if (packages.length > 0) claims.push', 'if (true) claims.push'],
  ['a citation is no evidence', EVIDENCE, 'return citesSource(line) || carriesRunReceipt(line) || citesManifestVersion(line);', 'return carriesRunReceipt(line) || citesManifestVersion(line);'],
  ['a run receipt is no evidence', EVIDENCE, 'return citesSource(line) || carriesRunReceipt(line) || citesManifestVersion(line);', 'return citesSource(line) || citesManifestVersion(line);'],
  ['a manifest version is no evidence', EVIDENCE, 'return citesSource(line) || carriesRunReceipt(line) || citesManifestVersion(line);', 'return citesSource(line) || carriesRunReceipt(line);'],
  // What counts as a citation / Qué cuenta como cita
  ['a URL is a citation', EVIDENCE, "if (word.includes('://')) return false;", ''],
  ['a range may have any number of parts', EVIDENCE, 'parts.length <= 2 && parts.every(isDigits)', 'parts.every(isDigits)'],
  ['an empty number is a number', EVIDENCE, 'text.length > 0 && [...text]', '[...text]'],
  ['a number need not be digits', EVIDENCE, 'DIGITS.includes(character))', 'true)'],
  ['one digit is not a digit', EVIDENCE, "const DIGITS = '0123456789';", "const DIGITS = '012345678';"],
  ['a hidden file has no extension', EVIDENCE, 'dot >= 0 ?', 'dot > 0 ?'],
  ['every word has an extension', EVIDENCE, 'dot >= 0 ?', 'true ?'],
  ['an empty extension is a path', EVIDENCE, 'extension.length > 0 && [...extension]', '[...extension]'],
  ['any extension is a path', EVIDENCE, '[...extension].every((character) => LETTERS.includes(character))', 'true'],
  ['the reference keeps its trailing period', EVIDENCE, 'trimPeriods(word).split', 'word.split'],
  ['the line reference is not checked', EVIDENCE, 'isLineRef(parts.at(-1)) &&', 'true &&'],
  ['the line citation path is not checked', EVIDENCE, "hasExtension(parts.slice(0, -1).join(':'))", 'true'],
  ['the column may be a range', EVIDENCE, 'isDigits(parts.at(-1)) &&', 'isLineRef(parts.at(-1)) &&'],
  ['the column is not checked', EVIDENCE, 'isDigits(parts.at(-1)) &&', 'true &&'],
  ['the line before a column is not checked', EVIDENCE, "isLineRef(parts.at(-2) ?? '')", 'true'],
  ['the column citation path is not checked', EVIDENCE, "hasExtension(parts.slice(0, -2).join(':'))", 'true'],
  ['a column is never a citation', EVIDENCE, 'return withLine || withColumn;', 'return withLine;'],
  ['a line alone is never a citation', EVIDENCE, 'return withLine || withColumn;', 'return withColumn;'],
  // What counts as a run receipt / Qué cuenta como recibo de ejecución
  ['outside text is read as a code span', EVIDENCE, 'let index = 1; index < segments.length - 1; index += 2', 'let index = 0; index < segments.length - 1; index += 2'],
  ['an unclosed backtick quotes a command', EVIDENCE, 'index < segments.length - 1;', 'index < segments.length;'],
  ['every segment is read as a code span', EVIDENCE, 'index += 2)', 'index += 1)'],
  ['a padded single word is a command', EVIDENCE, "segments[index].trim().includes(' ')", "segments[index].includes(' ')"],
  ['a backticked command is no receipt', EVIDENCE, 'return quotesCommand(line) || showsExitCode(line);', 'return showsExitCode(line);'],
  ['an exit code is no receipt', EVIDENCE, 'return quotesCommand(line) || showsExitCode(line);', 'return quotesCommand(line);'],
  ['the exit word is case-sensitive', EVIDENCE, '.map((token) => token.toLowerCase());', ';'],
  ['the exit word is misspelt', EVIDENCE, "const EXIT_WORD = 'exit';", "const EXIT_WORD = 'exits';"],
  ['a word ending in exit is the exit word', EVIDENCE, '(token === EXIT_WORD &&', '(token.endsWith(EXIT_WORD) &&'],
  ['exit N is no receipt', EVIDENCE, "(token === EXIT_WORD && isDigits(tokens[index + 1] ?? ''))", 'false'],
  ['exit followed by anything is a receipt', EVIDENCE, "isDigits(tokens[index + 1] ?? '')", 'true'],
  ['exit=N is no receipt', EVIDENCE, '(token.startsWith(`${EXIT_WORD}=`) && isDigits(token.slice(EXIT_WORD.length + 1)))', 'false'],
  ['exit= followed by anything is a receipt', EVIDENCE, 'isDigits(token.slice(EXIT_WORD.length + 1))', 'true'],
  // What counts as a manifest version / Qué cuenta como versión de manifiesto
  ...droppedCharacters(EVIDENCE, VERSION_LINE, ['~', '^', '<', '>', '=', 'v'], 'the version operator list'),
  ['a version need not start with a digit', EVIDENCE, 'isDigits(rest.charAt(0)) && rest.includes', 'rest.includes'],
  ['a version needs no dot', EVIDENCE, " && rest.includes('.');", ';'],
  ['the lockfile is no manifest', EVIDENCE, "const MANIFESTS = ['package.json', 'package-lock.json'];", "const MANIFESTS = ['package.json'];"],
  ['package.json is no manifest', EVIDENCE, "const MANIFESTS = ['package.json', 'package-lock.json'];", "const MANIFESTS = ['package-lock.json'];"],
  ['a manifest named by its path is not one', EVIDENCE, 'token === name || token.endsWith(`/${name}`)', 'token === name'],
  ['a file ending like a manifest is one', EVIDENCE, 'token === name || token.endsWith(`/${name}`)', 'token.endsWith(name)'],
  ['a manifest is evidence without a version', EVIDENCE, 'return manifest && tokens.some(isVersion);', 'return manifest;'],
  ['a version is evidence without a manifest', EVIDENCE, 'return manifest && tokens.some(isVersion);', 'return tokens.some(isVersion);'],
  ['a Windows manifest path is not normalised', EVIDENCE, "words(line.split('\\\\').join('/'), CITATION_SEPARATORS).map(trimPeriods)", 'words(line, CITATION_SEPARATORS).map(trimPeriods)'],
  ['a manifest ending the sentence keeps its period', EVIDENCE, 'CITATION_SEPARATORS).map(trimPeriods);', 'CITATION_SEPARATORS);'],
  // Which sections and manifests name the dependencies / Qué secciones y manifiestos
  ['dependencies are not names', NAMES, "['dependencies', 'devDependencies', 'peerDependencies']", "['devDependencies', 'peerDependencies']"],
  ['devDependencies are not names', NAMES, "['dependencies', 'devDependencies', 'peerDependencies']", "['dependencies', 'peerDependencies']"],
  ['peerDependencies are not names', NAMES, "['dependencies', 'devDependencies', 'peerDependencies']", "['dependencies', 'devDependencies']"],
  ['a null section throws', NAMES, 'if (entries === null || typeof entries', 'if (typeof entries'],
  ['a string section names its characters', NAMES, "|| typeof entries !== 'object' ||", '||'],
  ['an array section names its indexes', NAMES, ' || Array.isArray(entries)) continue;', ') continue;'],
  ['a workspace:* package is third-party', NAMES, "const LOCAL_PREFIXES = ['workspace:', 'file:'];", "const LOCAL_PREFIXES = ['file:'];"],
  ['a file: package is third-party', NAMES, "const LOCAL_PREFIXES = ['workspace:', 'file:'];", "const LOCAL_PREFIXES = ['workspace:'];"],
  ['a non-string version throws', NAMES, "typeof value === 'string' && LOCAL_PREFIXES", 'LOCAL_PREFIXES'],
  ['local packages are named', NAMES, 'if (!isLocal(value)) names.add(name);', 'names.add(name);'],
  ['a BOM-prefixed manifest is not read', NAMES, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['a missing manifest is unreadable', NAMES, 'return { missing: true };', "return { reason: 'unreadable' };"],
  ['an unparsable manifest is missing', NAMES, 'return { reason: messageOf(error) };', 'return { missing: true };'],
  ['a null manifest is read as an object', NAMES, "manifest !== null && typeof manifest === 'object' ? { manifest }", "typeof manifest === 'object' ? { manifest }"],
  ['a string manifest is read as an object', NAMES, "manifest !== null && typeof manifest === 'object' ? { manifest }", 'manifest !== null ? { manifest }'],
  ['a missing manifest is read as present', NAMES, 'if (read.missing) return false;', 'if (read.missing) return true;'],
  ['an unusable manifest is not reported', NAMES, 'context.undecided.push({ file, reason: read.reason });', ''],
  ['a manifest contributes no names', NAMES, 'addNames(read.manifest, context.names);', ''],
  ['workspaces of workspaces are followed', NAMES, 'if (withWorkspaces) for (const child', 'for (const child'],
  ['workspaces are not followed', NAMES, 'if (withWorkspaces) for (const child', 'if (false) for (const child'],
  // A checkout whose project sits one folder down / Un checkout con el proyecto un nivel más abajo
  ['a root manifest does not stop the search one level down', NAMES, 'if (collect(directory, context, true)) return;', 'collect(directory, context, true);'],
  ['node_modules is read as a nested project', NAMES, 'if (child === INSTALLED || child.startsWith', 'if (child.startsWith'],
  ['a dot-folder is read as a nested project', NAMES, " || child.startsWith('.')) continue;", ') continue;'],
  ['a nested project is not counted as found', NAMES, 'if (collect(`${directory}/${child}`, context, true)) found = true;', 'collect(`${directory}/${child}`, context, true);'],
  ['the workspaces of a nested project are not followed', NAMES, 'collect(`${directory}/${child}`, context, true)', 'collect(`${directory}/${child}`, context, false)'],
  ['a checkout with no manifest at all is not reported', NAMES, 'if (!found) context.undecided.push', 'if (false) context.undecided.push'],
  // Containment / Contención
  ['a workspace entry is not normalised', NAMES, "path.posix.normalize(entry.split('\\\\').join('/'))", 'entry'],
  ['a backslash entry is not normalised', NAMES, "path.posix.normalize(entry.split('\\\\').join('/'))", 'path.posix.normalize(entry)'],
  ['the parent entry is followed', NAMES, "entry === '..' || ", ''],
  ['a ../ entry is followed', NAMES, " || entry.startsWith('../')", ''],
  ['an absolute entry is followed', NAMES, ' || path.win32.isAbsolute(entry)', ''],
  ['an escaping entry is not reported', NAMES, 'context.undecided.push({ file: `${directory}/package.json`, reason: `workspace entry "${entry}" leaves the checkout, so it is not read` });', ''],
  ['an escaping entry is followed after being reported', NAMES, 'so it is not read` });\n      continue;', 'so it is not read` });'],
  // Workspace shapes / Formas de workspaces
  ['the object form of workspaces is not read', NAMES, 'Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages', 'manifest.workspaces'],
  ['the array form of workspaces is not read', NAMES, 'Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages', 'manifest.workspaces?.packages'],
  ['a manifest with no workspaces throws', NAMES, 'if (!Array.isArray(entries)) return [];', ''],
  ['a non-string workspace entry throws', NAMES, "if (typeof entry !== 'string') continue;", ''],
  ['a dir/* entry is read as a plain directory', NAMES, "if (normalized.endsWith('/*')) {", 'if (false) {'],
  ['a dir/* entry lists the wrong directory', NAMES, 'const parent = `${directory}/${normalized.slice(0, -2)}`;', 'const parent = `${directory}/${normalized}`;'],
  ['a dir/* child is read from the wrong place', NAMES, 'found.push(`${parent}/${child}`)', 'found.push(parent)'],
  ['a plain workspace is read from the wrong place', NAMES, 'found.push(`${directory}/${normalized}`);', 'found.push(normalized);'],
  // Where the project comes from / De dónde sale el proyecto
  ['the TENANCY path never wins over cwd', NAMES, 'if (declared.length > 0) return declared;', ''],
  ['an absent cwd is a project', NAMES, "typeof cwd === 'string' && cwd.length > 0 ? [cwd] : []", '[cwd]'],
  // The wire / El cable
  ['the second face never runs', GUARD, 'if (refusal === undefined) return dependencyClaimOutput(brief, payload);', 'if (refusal === undefined) return undefined;'],
  ['a brief with no project is not journaled', GUARD, 'if (directories.length === 0) undecided.push', 'if (false) undecided.push'],
  ['an undecided project is not journaled', GUARD, 'if (undecided.length > 0) journal', 'if (false) journal'],
  ['an undecided project is journaled among the refusals', GUARD, ', undecided }, UNDECIDED);', ', undecided });'],
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
  ['the citation way out is not named', REFUSAL, "'  1. Read the installed source and cite it on the same line as file:line (or file:line:col),',", ''],
  ['what already passes is not named', REFUSAL, "'A line that shows the run it reports (a backticked command, or \"exit 0\") or a version cited from',", ''],
  ['the Spanish half is not given', REFUSAL, "'@es Una afirmación sobre cómo se comporta una dependencia en ejecución se lee en su código INSTALADO antes de',", ''],
  ['the real-tool rule is not stated', REFUSAL, "'A teardown or lifecycle proof also runs against the real tool, never only against a stand-in modelled on the claim.',", '']
];
