/**
 * The decisions of the dependency-claim face, each broken once, for `mutants.mjs` to run against
 * `selftest.mjs`: how a package name is told from its prose, which lines form a claim unit, what counts as a
 * source citation, which manifests and sections name third-party dependencies, how the checkout is contained,
 * what the claim judge is asked and how its answer is read, and how the refusal and its journals read. A
 * survivor is a missing assertion; a mutant is never deleted or softened.
 *
 * NOT MUTATED, AND WHY: the judge's default question (`defaultAsk`, `ASK_TIMEOUT_MS`) and the `ask` default of
 * `evaluate`. The selftest injects the question; a mutant that dropped the injection would call the real model
 * from a proof. That wiring is proved by driving the registered hook with a real model call instead.
 *
 * @es Las decisiones de la cara de dependencias, rotas una a una, para `mutants.mjs`. NO SE MUTAN la pregunta por
 * defecto del juez ni el `ask` por defecto de `evaluate`: un mutante que quitara la inyección llamaría al modelo
 * real desde una prueba; ese cableado se prueba con el hook registrado y una llamada real.
 */

const CLAIM = 'brief-provenance/dependency-claim.mjs';
const CITATION = 'brief-provenance/source-citation.mjs';
const WORDS = 'brief-provenance/line-words.mjs';
const NAMES = 'brief-provenance/dependency-names.mjs';
const JUDGE = 'brief-provenance/claim-judge.mjs';
const REFUSAL = 'brief-provenance/dependency-refusal.mjs';
const GUARD = 'brief-provenance/guard.mjs';

// The two separator lists, as written in the source (backslash escapes included), each paired with the
// spelling of every character so one mutant drops exactly one of them.
// @es Las dos listas de separadores tal como están en el fuente, con la grafía de cada carácter.
const NAME_LINE = String.raw`const NAME_SEPARATORS = ' \t\r\n:,;()[]{}<>|"\'` + '`=!?\';';
const CITATION_LINE = String.raw`const CITATION_SEPARATORS = ' \t\r\n,;()[]{}<>|"\'` + '`\';';
const SPELLINGS = [' ', String.raw`\t`, String.raw`\r`, String.raw`\n`, ':', ',', ';', '(', ')', '[', ']', '{', '}', '<', '>', '|', '"', String.raw`\'`, '`', '=', '!', '?'];

/** One mutant per character of a quoted list: the line with that character's spelling removed. @es Un mutante por carácter. */
function droppedCharacters(file, line, spellings, label) {
  const bodyStart = line.indexOf("= '") + 3;

  return spellings.filter((spelling) => line.indexOf(spelling, bodyStart) >= 0).map((spelling) => {
    const at = line.indexOf(spelling, bodyStart);

    return [`${label} no longer holds ${spelling}`, file, line, `${line.slice(0, at)}${line.slice(at + spelling.length)}`];
  });
}

const LOCAL_LINE = "const LOCAL_PREFIXES = ['workspace:', 'file:', 'link:', 'portal:'];";
const LOCALS = ['workspace:', 'file:', 'link:', 'portal:'];

/** One mutant per local prefix: the list without it. @es Un mutante por prefijo local. */
const droppedLocals = LOCALS.map((prefix) => [
  `a ${prefix} package is third-party`,
  NAMES,
  LOCAL_LINE,
  `const LOCAL_PREFIXES = [${LOCALS.filter((other) => other !== prefix).map((other) => `'${other}'`).join(', ')}];`
]);

const COMMON_LINE = "const COMMON_WORDS = new Set(['test', 'core', 'cli', 'common', 'types', 'utils', 'kit', 'node']);";
const COMMON = ['test', 'core', 'cli', 'common', 'types', 'utils', 'kit', 'node'];

/** One mutant per common word: the set without it. @es Un mutante por palabra común. */
const droppedCommon = COMMON.map((word) => [
  `the common word ${word} counts as a name`,
  NAMES,
  COMMON_LINE,
  `const COMMON_WORDS = new Set([${COMMON.filter((other) => other !== word).map((other) => `'${other}'`).join(', ')}]);`
]);

const PARTS_LINE = 'const parts = [name.slice(1, slash), name.slice(slash + 1)];';
const MENTIONS_LINE = 'return [name, ...parts.filter((part) => !COMMON_WORDS.has(part.toLowerCase()))];';
const OWN_LINE = 'for (const key of context.keys) if (!context.own.has(key)) for (const mention of mentionsOf(key)) names.add(mention);';

// The rubric is the model's input and stays English-only: one mutant re-adds a Spanish line to it.
// @es La rúbrica es la entrada del modelo y queda solo en inglés: un mutante le vuelve a añadir una línea en español.
const RULES_LINE = "  'Rules:',\n";
const RUBRIC_SPANISH = ["the rubric carries a Spanish line again", JUDGE, RULES_LINE, "  'Rules:',\n  '@es Reglas:',\n"];

const PACKAGES_LINE = 'return [...new Set(words(unit, NAME_SEPARATORS).map((word) => trimPeriods(word).toLowerCase()).filter((word) => folded.has(word)))];';

export const DEPENDENCY_MUTANTS = [
  // What separates a name from its prose / Qué separa un nombre de su prosa
  ...droppedCharacters(CLAIM, NAME_LINE, SPELLINGS, 'the package name separator list'),
  ...droppedCharacters(CITATION, CITATION_LINE, SPELLINGS, 'the citation separator list'),
  ['a trailing period stays part of a name or a line number', WORDS, "while (trimmed.endsWith('.'))", 'while (false)'],
  ['names are matched with their trailing period', CLAIM, 'trimPeriods(word).toLowerCase()', 'word.toLowerCase()'],
  ['the words of a claim are not case-folded', CLAIM, 'trimPeriods(word).toLowerCase()', 'trimPeriods(word)'],
  ['the manifest names are not case-folded', CLAIM, 'new Set([...names].map((name) => name.toLowerCase()))', 'new Set(names)'],
  ['a name is matched as a substring of a word', CLAIM, '.filter((word) => folded.has(word))', '.filter((word) => [...folded].some((name) => word.includes(name)))'],
  ['a package named twice is sent twice', CLAIM, PACKAGES_LINE, 'return words(unit, NAME_SEPARATORS).map((word) => trimPeriods(word).toLowerCase()).filter((word) => folded.has(word));'],
  // Which lines form a unit / Qué líneas forman una unidad
  ['a layout prefix keeps a line from being a claim line', CLAIM, 'const line = stripLead(rawLine);', 'const line = rawLine;'],
  ['a MEASURED word anywhere in a line heads it', CLAIM, 'line.startsWith(word) && !LETTERS', 'line.includes(word) && !LETTERS'],
  ['a longer word heads a unit', CLAIM, ' && !LETTERS.includes(line.slice(word.length).charAt(0));', ';'],
  ['the heading is not part of its unit', CLAIM, 'current = [line];', 'current = [];'],
  ['a unit is never kept', CLAIM, '      units.push(current);\n', ''],
  ['a bullet before any claim continues nothing', CLAIM, 'current !== undefined && line !== rawLine', 'line !== rawLine'],
  ['an unindented line continues a unit', CLAIM, ' && line !== rawLine && line.length > 0', ' && line.length > 0'],
  ['a blank line with layout continues a unit', CLAIM, ' && line.length > 0 && !headsMarker', ' && !headsMarker'],
  ['an indented HYPOTHESIS marker continues a unit', CLAIM, ' && !headsMarker(line, HYPOTHESIS_WORD)) {', ') {'],
  ['a line that is no continuation does not end the unit', CLAIM, 'current = undefined;', ''],
  // When a unit reaches the judge / Cuándo llega una unidad al juez
  ['a unit naming no dependency reaches the judge', CLAIM, 'packages.length > 0 && !citesSource(unit)', '!citesSource(unit)'],
  ['a cited unit reaches the judge', CLAIM, 'packages.length > 0 && !citesSource(unit)', 'packages.length > 0'],
  // What counts as a source citation / Qué cuenta como cita de fuente
  ['backslashes are not read as slashes', CITATION, "text.split('\\\\').join('/')", 'text'],
  ['a range may have any number of parts', CITATION, 'parts.length <= 2 && parts.every(isDigits)', 'parts.every(isDigits)'],
  ['an empty number is a number', CITATION, 'text.length > 0 && [...text]', '[...text]'],
  ['a number need not be digits', CITATION, 'DIGITS.includes(character))', 'true)'],
  ['one digit is not a digit', CITATION, "const DIGITS = '0123456789';", "const DIGITS = '012345678';"],
  ['a drive letter is not stripped', CITATION, "LETTERS.includes(path.charAt(0)) && path.charAt(1) === ':' ? path.slice(2) : path", 'path'],
  ['any first character is a drive letter', CITATION, "LETTERS.includes(path.charAt(0)) && path.charAt(1) === ':'", "path.charAt(1) === ':'"],
  ['any first letter is a drive letter', CITATION, " && path.charAt(1) === ':' ?", ' ?'],
  ['a path needs no directory', CITATION, "local.includes('/') && ", ''],
  ['a path may hold a port', CITATION, "!local.includes(':') && ", ''],
  ['an empty extension is an extension', CITATION, 'extension.length > 0 && [...extension]', '[...extension]'],
  ['any extension is an extension', CITATION, '[...extension].every((character) => LETTERS.includes(character))', 'true'],
  ['the reference keeps its trailing period', CITATION, 'trimPeriods(word).split', 'word.split'],
  ['the line reference is not checked', CITATION, 'isLineRef(parts.at(-1)) &&', 'true &&'],
  ['the line citation path is not checked', CITATION, "isSourcePath(parts.slice(0, -1).join(':'))", 'true'],
  ['the column may be a range', CITATION, 'isDigits(parts.at(-1)) &&', 'isLineRef(parts.at(-1)) &&'],
  ['the column is not checked', CITATION, 'isDigits(parts.at(-1)) &&', 'true &&'],
  ['the line before a column is not checked', CITATION, "isLineRef(parts.at(-2) ?? '')", 'true'],
  ['the column citation path is not checked', CITATION, "isSourcePath(parts.slice(0, -2).join(':'))", 'true'],
  ['a column is never a citation', CITATION, 'return withLine || withColumn;', 'return withLine;'],
  ['a line alone is never a citation', CITATION, 'return withLine || withColumn;', 'return withColumn;'],
  // Which names are third-party / Qué nombres son de terceros
  ['dependencies are not names', NAMES, "['dependencies', 'devDependencies', 'peerDependencies']", "['devDependencies', 'peerDependencies']"],
  ['devDependencies are not names', NAMES, "['dependencies', 'devDependencies', 'peerDependencies']", "['dependencies', 'peerDependencies']"],
  ['peerDependencies are not names', NAMES, "['dependencies', 'devDependencies', 'peerDependencies']", "['dependencies', 'devDependencies']"],
  ['a null section throws', NAMES, 'if (entries === null || typeof entries', 'if (typeof entries'],
  ['a string section names its characters', NAMES, "|| typeof entries !== 'object' ||", '||'],
  ['an array section names its indexes', NAMES, ' || Array.isArray(entries)) continue;', ') continue;'],
  ...droppedLocals,
  ['a non-string version throws', NAMES, "typeof value === 'string' && LOCAL_PREFIXES", 'LOCAL_PREFIXES'],
  ['local packages are named', NAMES, 'if (!isLocal(value)) context.keys.add(name);', 'context.keys.add(name);'],
  // How a scoped key is mentioned / Cómo se menciona una clave con ámbito
  ['only the key is a name', NAMES, 'for (const mention of mentionsOf(key)) names.add(mention);', 'names.add(key);'],
  ['an unscoped slashed key is split', NAMES, "if (!name.startsWith('@') || !name.includes('/'))", "if (!name.includes('/'))"],
  ['a scope with no slash is split', NAMES, "if (!name.startsWith('@') || !name.includes('/'))", "if (!name.startsWith('@'))"],
  ['the scope is not a name', NAMES, PARTS_LINE, 'const parts = [name.slice(slash + 1)];'],
  ['the tail is not a name', NAMES, PARTS_LINE, 'const parts = [name.slice(1, slash)];'],
  ['the scope keeps its @', NAMES, 'name.slice(1, slash)', 'name.slice(0, slash)'],
  ['the tail keeps its slash', NAMES, 'name.slice(slash + 1)', 'name.slice(slash)'],
  ['a common word is a name', NAMES, MENTIONS_LINE, 'return [name, ...parts];'],
  ['the full scoped key is not a name', NAMES, MENTIONS_LINE, 'return [...parts.filter((part) => !COMMON_WORDS.has(part.toLowerCase()))];'],
  ['a part is compared unfolded', NAMES, 'COMMON_WORDS.has(part.toLowerCase())', 'COMMON_WORDS.has(part)'],
  ...droppedCommon,
  // Which keys are the project's own / Qué claves son del propio proyecto
  ["a manifest's own name is not recorded", NAMES, '  context.own.add(manifest.name);\n', ''],
  ["the project's own keys stay third-party", NAMES, OWN_LINE, 'for (const key of context.keys) for (const mention of mentionsOf(key)) names.add(mention);'],
  ['the mentions of an own key are removed even when a third-party key produces them', NAMES, OWN_LINE, 'for (const key of context.keys) for (const mention of mentionsOf(key)) names.add(mention);\n  for (const own of context.own) if (typeof own === \'string\') for (const mention of mentionsOf(own)) names.delete(mention);'],
  ['a BOM-prefixed manifest is not read', NAMES, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['a missing manifest is unreadable', NAMES, 'return { missing: true };', "return { reason: 'unreadable' };"],
  ['an unparsable manifest is missing', NAMES, 'return { reason: messageOf(error) };', 'return { missing: true };'],
  ['a null manifest is read as an object', NAMES, "manifest !== null && typeof manifest === 'object' ? { manifest }", "typeof manifest === 'object' ? { manifest }"],
  ['a string manifest is read as an object', NAMES, "manifest !== null && typeof manifest === 'object' ? { manifest }", 'manifest !== null ? { manifest }'],
  ['a missing manifest is read as present', NAMES, 'if (read.missing) return false;', 'if (read.missing) return true;'],
  ['an unusable manifest is not reported', NAMES, 'context.undecided.push({ file, reason: read.reason });', ''],
  ['a manifest contributes no names', NAMES, 'addNames(read.manifest, context);', ''],
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
  // What the judge is asked and how it is read / Qué se pregunta al juez y cómo se lee
  ['the judge is asked an empty question', JUDGE, '({ answer } = await ask(promptFor(candidates)));', "({ answer } = await ask(''));"],
  ['the claims are not put in the question', JUDGE, "PROMPT.replace('$CLAIMS', () => claims)", 'PROMPT'],
  ['the claims are not numbered', JUDGE, '`${index + 1}. ${unit}', '`${unit}'],
  ['the packages are listed without a space', JUDGE, "packages.join(', ')})`", "packages.join(',')})`"],
  ['the marker is misspelt', JUDGE, "export const MARKER = 'DEPENDENCY-CLAIM:';", "export const MARKER = 'DEPENDENCY_CLAIM:';"],
  ['a block needs no marker', JUDGE, 'readVerdict(String(answer), MARKER)', "readVerdict(String(answer), '')"],
  ['a judge that throws passes', JUDGE, "return { kind: 'undecided', why: `the claim judge could not be asked", "return { kind: 'pass', why: `the claim judge could not be asked"],
  ['a non-verdict is not undecided', JUDGE, "verdict.kind === 'malfunction' ? { kind: 'undecided'", "false ? { kind: 'undecided'"],
  // The wire / El cable
  ['the second face never runs', GUARD, 'if (refusal === undefined) return dependencyClaimOutput(brief, payload, ask);', 'if (refusal === undefined) return undefined;'],
  ['the judge is asked with no candidate', GUARD, "claims.length === 0 ? { kind: 'pass' } : await judgeCandidates(claims, ask)", 'await judgeCandidates(claims, ask)'],
  ['an undecided judge is not journaled', GUARD, "if (verdict.kind === 'undecided') undecided.push", 'if (false) undecided.push'],
  ['a brief with no project is not journaled', GUARD, 'if (directories.length === 0) undecided.push', 'if (false) undecided.push'],
  ['an undecided reading is not journaled', GUARD, 'if (undecided.length > 0) journal', 'if (false) journal'],
  ['an undecided reading is journaled among the refusals', GUARD, ', undecided }, UNDECIDED);', ', undecided });'],
  ['the undecided journal sits where guard-precision counts', GUARD, "const UNDECIDED = join('undecided', 'entries.jsonl');", "const UNDECIDED = 'undecided.jsonl';"],
  ['the undecided folder is never created', GUARD, 'mkdirSync(dirname(target), { recursive: true });', ''],
  ['an undecided entry does not name its tool', GUARD, 'session: payload?.session_id, tool: brief.toolName };', 'session: payload?.session_id };'],
  ['a judge block is allowed', GUARD, "if (verdict.kind !== 'block') return undefined;", 'return undefined;'],
  ['every brief is refused', GUARD, "if (verdict.kind !== 'block') return undefined;", 'if (false) return undefined;'],
  ['a refusal is journaled under another kind', GUARD, "kind: 'dependency-claim', packages", "kind: 'x', packages"],
  ['a refusal does not journal its packages', GUARD, 'packages: claims.flatMap((claim) => claim.packages), reason', 'packages: [], reason'],
  ["a refusal does not journal the judge's reason", GUARD, ', reason: verdict.reason });', ' });'],
  ["the refusal drops the judge's reason", GUARD, 'reason: verdict.reason, surface', "reason: '', surface"],
  ['a refusal is worded for the wrong surface', GUARD, 'surface: brief.surface, spanishSurface', "surface: 'delegation', spanishSurface"],
  ['the Spanish refusal is worded for the wrong surface', GUARD, 'spanishSurface: brief.spanishSurface, toolName', "spanishSurface: 'esta delegación', toolName"],
  ['a refusal names the wrong tool', GUARD, 'spanishSurface: brief.spanishSurface, toolName: brief.toolName })', "spanishSurface: brief.spanishSurface, toolName: 'Agent' })"],
  // The words / Las palabras
  ['a package named by two units is listed twice', REFUSAL, '[...new Set(refusal.claims.flatMap((claim) => claim.packages))].join', 'refusal.claims.flatMap((claim) => claim.packages).join'],
  ['packages are listed without a space', REFUSAL, ".join(', ');", ".join(',');"],
  ["the judge's reason is not shown", REFUSAL, '    `  JUDGE — ${refusal.reason} @es JUEZ: motivo del juez, citado tal cual.`,\n', ''],
  ["the JUDGE line has no Spanish half", REFUSAL, ' @es JUEZ: motivo del juez, citado tal cual.`', '`'],
  ['the claims read are not shown', REFUSAL, "...refusal.claims.map((claim) => `  READ — ${claim.unit.split('\\n').join(' / ')} @es LEÍDO: afirmación leída, citada tal cual.`),", ''],
  ['the READ line has no Spanish half', REFUSAL, ' @es LEÍDO: afirmación leída, citada tal cual.`', '`'],
  ['the headline has no Spanish half', REFUSAL, '    `@es BRIEF-PROVENANCE RECHAZÓ ${refusal.spanishSurface}', '    `@es BRIEF-PROVENANCE ${refusal.spanishSurface}'],
  ['the Spanish headline names no surface', REFUSAL, 'RECHAZÓ ${refusal.spanishSurface} (${refusal.toolName}): una afirmación', 'RECHAZÓ (${refusal.toolName}): una afirmación'],
  ['the Spanish headline names no package', REFUSAL, 'una dependencia instalada (${packages}) y no cita fuente.', 'una dependencia instalada y no cita fuente.'],
  RUBRIC_SPANISH,
  ['a unit is shown on several lines', REFUSAL, "claim.unit.split('\\n').join(' / ')", 'claim.unit'],
  ['the HYPOTHESIS way out is not named', REFUSAL, "'  2. Move the claim to a HYPOTHESIS: line, so the worker tests it rather than inherits it.',", ''],
  ['the citation way out is not named', REFUSAL, "'  1. Read the installed source and cite it in the claim as dir/file:line (or dir/file:line:col),',", ''],
  ['the exit-code rule is not stated', REFUSAL, "'A run receipt or a version read is not such a claim; an exit code beside a behaviour claim does not measure it.',", ''],
  ['the Spanish half is not given', REFUSAL, "'@es Una afirmación sobre cómo se comporta una dependencia en ejecución se lee en su código INSTALADO antes de',", ''],
  ['the real-tool rule is not stated', REFUSAL, "'A teardown or lifecycle proof also runs against the real tool, never only against a stand-in modelled on the claim.',", '']
];
