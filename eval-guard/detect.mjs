/**
 * Shell-mangled-payload detector — the DECISION half of the eval guard.
 *
 * THE DEFECT IT CLOSES. A command string authored by a model is re-parsed by a shell before node ever
 * sees it, so the JS that RUNS can differ from the JS that was WRITTEN, silently. Measured three times
 * in one session on this machine:
 *   1. `node -e "…'\\b'…"` reached JS as a literal BACKSPACE, not a word boundary, because the shell
 *      collapsed the doubled backslash. Two symbol-level scripts then reported "58 symbols missing
 *      from develop" when the truth was 0 — a catastrophic false loss, one trusting read away.
 *   2. A one-liner authoring JSON with French text lost every apostrophe: `d'échouer` -> `d échouer`.
 *   3. A string-accumulation loop in the same style truncated a whole-repo blob.
 * Each was caught because the RESULT was implausible against something just read — by luck, never by a
 * mechanism. That is the defect: the control was recall, and recall is what this file replaces.
 *
 * BUILT ON MEASUREMENT, NOT ON FOLKLORE. The obvious rule — "refuse any backslash or any non-ASCII
 * character" — was measured against 31 903 real commands from this machine's transcripts and refused
 * 549 of the 2 305 node-eval one-liners (23.8%). Probing this exact harness for what actually survives
 * showed most of those refusals would have been for nothing, so the rule was narrowed to what the
 * shell demonstrably eats. `node argv.mjs "…"` reported these code points:
 *
 *   WRITTEN        DELIVERED      VERDICT
 *   "a\nb"         a \ n b        a lone backslash SURVIVES  -> allowed
 *   'a\nb'         a \ n b        …in single quotes too      -> allowed
 *   "C:\Users\x"   C:\Users\x     Windows paths survive      -> allowed
 *   "café"         café           non-ASCII survives intact  -> allowed (both Bash and PowerShell)
 *   "a\\nb"        a \ n b        DOUBLED backslash collapsed-> REFUSED  (this is failure 1)
 *   'a\\nb'        a \ n b        …in single quotes TOO       -> REFUSED  (quoting does not protect)
 *   "a\\\\nb"      a \ n b        four collapsed to one       -> REFUSED
 *   "a\$b"         a $ b          backslash CONSUMED          -> REFUSED
 *   "a\"b"         a " b          backslash CONSUMED          -> REFUSED
 *
 * Two consequences worth keeping. First, single quotes did NOT protect a doubled backslash, so the
 * harness re-wraps the command in a further shell layer and no quoting choice is a defence — which is
 * why "re-quote it" is never the advice. Second, since plain non-ASCII survives, failure 2 was NOT
 * caused by the accents: `d'échouer` -> `d échouer` KEPT the `é` and lost the ASCII apostrophe. Its
 * real mechanism is a quote character inside a payload delimited by that same quote character, which
 * ends the run early and lets the shell re-split the remainder — detected here structurally, as a
 * payload whose quoting does not cover it, rather than by banning the accents that were never at fault.
 *
 * NO REGEXES (owner mandate M5). The tokenizer is an explicit character walk. The mandate's reason is
 * decisive here: a regex that fails to match SKIPS silently, and a detector that silently misses is
 * the very defect class being closed — so the detector must not be built out of that material.
 *
 * @es Detector de payloads destrozados por el shell — la mitad de DECISIÓN del guard. CIERRA: la
 * cadena que escribe el modelo la RE-PARSEA un shell antes de llegar a node, así que el JS que se
 * EJECUTA puede diferir del escrito, en silencio (medido 3 veces). CONSTRUIDO SOBRE MEDICIÓN: la regla
 * obvia — "rechaza cualquier backslash o no-ASCII" — medida contra 31 903 comandos reales rechazaba el
 * 23,8% de los one-liners; sondeando ESTE harness se acotó a lo que el shell se come de verdad (tabla
 * arriba). Dos consecuencias: las comillas simples NO protegieron un backslash doblado, luego hay otra
 * capa de shell y "re-entrecomillar" nunca es el consejo; y como el no-ASCII sobrevive, el fallo 2 NO
 * lo causaron los acentos — `d'échouer` -> `d échouer` conservó la `é` y perdió el apóstrofe ASCII, así
 * que se detecta su mecanismo real (una comilla dentro de un payload delimitado por esa misma comilla)
 * en vez de prohibir acentos que nunca tuvieron la culpa. SIN REGEX (M5).
 */

/** Unquoted characters that end a word and start a new command position. @es Caracteres que cierran palabra y abren posición de comando. */
const OPERATOR_CHARACTERS = new Set([';', '|', '&', '(', ')', '{', '}', '<', '>', '\n', '`']);

/** Characters that separate words without changing command position. @es Separadores que no cambian la posición de comando. */
const BLANK_CHARACTERS = new Set([' ', '\t', '\r']);

/**
 * Characters a shell consumes the preceding backslash for. Three of the five were measured directly on
 * this harness (`\\`, `\"`, `\$`); backtick and newline are the same documented double-quote rule and
 * are included because erring toward refusal is the safe direction for exactly two of them.
 * @es Caracteres tras los que el shell se come el backslash. Tres medidos aquí; backtick y salto de
 * línea son la misma regla documentada y se incluyen porque errar hacia el rechazo es lo seguro.
 */
const SHELL_CONSUMES_BACKSLASH_BEFORE = new Set(['\\', '"', '$', '`', '\n']);

const BACKSLASH = '\\';
const LOWEST_PLAIN_ASCII = 32;
const TAB = 9;
const LINE_FEED = 10;
const CARRIAGE_RETURN = 13;

/**
 * Splits a command line into words and operators by walking characters, honouring `'…'` and `"…"`
 * grouping. A word's `raw` is its text WITHOUT the grouping quotes but WITH every backslash exactly as
 * written — that is the whole point: `"…\\b…"` must still read as two backslashes here, because two
 * backslashes is what the shell is about to collapse into one.
 *
 * Each word also carries the shape of its quoting, which is what makes failure 2 detectable:
 * `quoted` (some of it was inside quotes), `bare` (some of it was not), and `unterminated` (a run ran
 * off the end of the command). A healthy payload is wholly quoted or wholly bare; anything else means
 * the shell's idea of where the payload starts and ends is not the author's.
 *
 * @es Parte la línea en palabras y operadores caminando caracteres y respetando `'…'` y `"…"`. El
 * `raw` va SIN las comillas de agrupación pero CON cada backslash tal cual: `"…\\b…"` debe seguir
 * leyéndose como dos backslashes, porque eso es lo que el shell va a colapsar. Cada palabra lleva
 * además la forma de su entrecomillado (`quoted`, `bare`, `unterminated`), que es lo que hace
 * detectable el fallo 2: un payload sano está entero entrecomillado o entero desnudo.
 */
export function tokenize(command) {
  if (typeof command !== 'string') return [];

  const items = [];
  let current;
  let index = 0;

  const flush = () => {
    if (current !== undefined) {
      items.push(current);
      current = undefined;
    }
  };

  const open = (start) => {
    if (current === undefined) current = { kind: 'word', raw: '', start, quoted: false, bare: false, unterminated: false };
  };

  while (index < command.length) {
    const character = command[index];

    if (BLANK_CHARACTERS.has(character)) {
      flush();
      index += 1;
      continue;
    }

    if (OPERATOR_CHARACTERS.has(character)) {
      flush();
      items.push({ kind: 'operator', raw: character, start: index });
      index += 1;
      continue;
    }

    open(index);

    if (character === "'" || character === '"') {
      const closer = character;

      current.quoted = true;
      index += 1;

      let closed = false;

      while (index < command.length) {
        // Inside double quotes a POSIX shell lets a backslash escape the closing quote, so an escaped
        // quote must not be read as the terminator. The pair is kept verbatim in `raw`.
        // @es Dentro de comillas dobles un backslash escapa la comilla de cierre: no debe leerse como
        // terminador. El par se conserva literal en `raw`.
        if (closer === '"' && command[index] === BACKSLASH && index + 1 < command.length) {
          current.raw += command[index] + command[index + 1];
          index += 2;
          continue;
        }

        if (command[index] === closer) {
          closed = true;
          index += 1;
          break;
        }

        current.raw += command[index];
        index += 1;
      }

      if (!closed) current.unterminated = true;

      continue;
    }

    current.bare = true;

    if (character === BACKSLASH && index + 1 < command.length) {
      current.raw += character + command[index + 1];
      index += 2;
      continue;
    }

    current.raw += character;
    index += 1;
  }

  flush();

  return items;
}

/** Groups tokens into the individual command invocations an operator separates. @es Agrupa tokens en las invocaciones que separan los operadores. */
export function invocations(items) {
  const groups = [];
  let group = [];

  for (const item of items) {
    if (item.kind === 'operator') {
      if (group.length > 0) groups.push(group);
      group = [];
      continue;
    }

    group.push(item);
  }

  if (group.length > 0) groups.push(group);

  return groups;
}

/** The trailing path segment of a program token, lowercased and without a `.exe` tail. @es Último segmento de ruta del programa, en minúsculas y sin `.exe`. */
function programName(raw) {
  let start = 0;

  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === '/' || raw[index] === BACKSLASH) start = index + 1;
  }

  const name = raw.slice(start).toLowerCase();

  return name.endsWith('.exe') ? name.slice(0, -4) : name;
}

/** `FOO=bar node …` — a leading assignment is a prefix, not the program. @es Una asignación inicial es prefijo, no el programa. */
function isEnvironmentAssignment(token) {
  if (token.quoted) return false;

  const equals = token.raw.indexOf('=');

  if (equals <= 0) return false;

  for (let index = 0; index < equals; index += 1) {
    const character = token.raw[index];
    const isWordCharacter =
      (character >= 'a' && character <= 'z') ||
      (character >= 'A' && character <= 'Z') ||
      (character >= '0' && character <= '9') ||
      character === '_';

    if (!isWordCharacter) return false;
  }

  return true;
}

/**
 * Recognises node's evaluate flags and any payload fused onto the flag itself.
 *
 * Covers `-e`, `-p`, the clusters node accepts (`-pe`, `-ep`), the long forms `--eval` / `--print`,
 * their `--eval=…` inline form, and `node -e'code'`, which tokenizes as a single word because the
 * quotes are grouping rather than argument boundaries.
 *
 * @es Reconoce los flags de evaluación de node y el payload fusionado al propio flag: `-e`, `-p`, los
 * clusters `-pe`/`-ep`, `--eval`/`--print`, la forma `--eval=…` y `node -e'code'`, que tokeniza como
 * una sola palabra porque las comillas agrupan en vez de delimitar argumento.
 */
export function evaluateFlag(token) {
  const raw = token.raw;

  if (!raw.startsWith('-') || raw.length < 2) return undefined;

  if (raw.startsWith('--')) {
    const equals = raw.indexOf('=');
    const name = equals === -1 ? raw : raw.slice(0, equals);

    if (name !== '--eval' && name !== '--print') return undefined;

    return { flag: name, inline: equals === -1 ? undefined : raw.slice(equals + 1) };
  }

  for (let index = 1; index < raw.length; index += 1) {
    const character = raw[index];

    if (character === 'e' || character === 'p') {
      const rest = raw.slice(index + 1);
      const restIsMoreFlags = rest.length > 0 && [...rest].every((letter) => 'epicvh'.includes(letter));

      return { flag: `-${character}`, inline: rest.length === 0 || restIsMoreFlags ? undefined : rest };
    }

    if (!'icvh'.includes(character)) return undefined;
  }

  return undefined;
}

/**
 * Node options that take their value from the NEXT word (`node -r ./hook.js script.mjs`). Without this the
 * value would be read as the script path and end node's options one word too early, so a later `-e` would
 * go unexamined. Options written with `=` (`--input-type=module`) carry their value inline and need no entry.
 * The list is the documented value-taking options; a value option missing from it ends the scan early,
 * which can only MISS a refusal and never invent one.
 *
 * @es Opciones de node cuyo valor es la palabra SIGUIENTE. Sin esto el valor se leería como la ruta del
 * script y las opciones de node acabarían una palabra antes, dejando sin examinar un `-e` posterior. Las
 * escritas con `=` llevan el valor dentro. Una opción con valor que falte aquí corta el escaneo antes:
 * solo puede OMITIR un rechazo, nunca inventarlo.
 */
const NODE_OPTIONS_TAKING_A_VALUE = new Set([
  '-r',
  '--require',
  '--import',
  '--loader',
  '--experimental-loader',
  '-C',
  '--conditions',
  '--input-type',
  '--env-file',
  '--title',
  '--stack-trace-limit',
  '--disable-warning',
  '--watch-path',
  '--test-name-pattern',
  '--inspect-port',
]);

/**
 * Whether a word ends node's own options. Node stops parsing options at the first word that is not one
 * (the script path, or `-` for stdin) and at a bare `--`; everything after belongs to the SCRIPT, so a
 * `-p` there is the script's flag (`git log -p`, forwarded through `node backup-repo.mjs`), never node's
 * print switch.
 *
 * @es Si una palabra termina las opciones propias de node. Node deja de interpretar opciones en la
 * primera palabra que no lo es (la ruta del script, o `-` para stdin) y en un `--` suelto; lo que sigue
 * es del SCRIPT, así que un `-p` ahí es flag del script y no el switch de impresión de node.
 */
const endsNodeOptions = (token) => token.raw === '--' || !token.raw.startsWith('-') || token.raw === '-';

/**
 * Every character in a payload that this harness was measured to eat, plus raw control bytes.
 *
 * A backslash is reported ONLY when the next character is one the shell consumes it for — the measured
 * distinction between `'\n'`, which arrives intact, and `'\\b'`, which arrives as a BACKSPACE. A
 * trailing backslash counts too: with nothing after it, it escapes whatever the shell puts there.
 *
 * @es Cada carácter del payload que este harness se come, más bytes de control crudos. Un backslash
 * solo se reporta si el siguiente carácter es uno por el que el shell lo consume — la distinción
 * medida entre `'\n'`, que llega intacto, y `'\\b'`, que llega como BACKSPACE. Un backslash final
 * cuenta también: sin nada detrás, escapa lo que el shell ponga ahí.
 */
export function dangerousCharacters(payload) {
  const found = [];

  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index];
    const code = payload.charCodeAt(index);

    if (character === BACKSLASH) {
      const next = index + 1 < payload.length ? payload[index + 1] : undefined;

      if (next === undefined) found.push({ offset: index, code, kind: 'trailing backslash (escapes whatever follows)' });
      else if (SHELL_CONSUMES_BACKSLASH_BEFORE.has(next)) {
        found.push({ offset: index, code, kind: `backslash the shell eats (before ${JSON.stringify(next)})` });
        index += 1;
      }

      continue;
    }

    if (code < LOWEST_PLAIN_ASCII && code !== TAB && code !== LINE_FEED && code !== CARRIAGE_RETURN)
      found.push({ offset: index, code, kind: 'raw control character' });
  }

  return found;
}

/**
 * Text-editing programs whose first non-option words are a SCRIPT or pattern, and how many leading
 * words that is (`sed 's/a/b/' f` has one, `sd PATTERN REPLACEMENT f` has two). Words past that count
 * are file names: they are checked for eaten escapes but not for quoting shape, because a path such as
 * `~/"My Files"/x` is legitimately part quoted and part bare.
 * @es Programas de edición de texto cuyas primeras palabras no-opción son un SCRIPT o patrón, y cuántas
 * son (`sed` una, `sd` dos). Las demás son ficheros: se les busca escapes comidos, pero no la forma del
 * entrecomillado, porque una ruta como `~/"My Files"/x` es legítimamente mixta.
 */
const LEADING_SCRIPT_WORDS = { sed: 1, sd: 2, awk: 1, gawk: 1 };

/** Options whose value is the NEXT word and is itself a script (`sed -e SCRIPT`). @es Opciones cuyo valor es la palabra siguiente y es un script. */
const SCRIPT_VALUE_OPTIONS = { sed: new Set(['-e', '--expression']), sd: new Set(), awk: new Set(), gawk: new Set(['-e', '--source']) };

/** Options whose value is the NEXT word and is NOT a script (a file, a separator, a count). @es Opciones cuyo valor es la palabra siguiente y NO es script. */
const OTHER_VALUE_OPTIONS = {
  sed: new Set(['-f', '--file', '-l', '--line-length']),
  sd: new Set(['-n', '--max-replacements']),
  awk: new Set(['-F', '-v', '-f', '--file', '--field-separator', '--assign']),
  gawk: new Set(['-F', '-v', '-f', '--file', '--field-separator', '--assign'])
};

/** Options that name a script FILE, so no leading word is an inline script. @es Opciones que nombran un FICHERO de script: ninguna palabra inicial es script inline. */
const SCRIPT_FILE_OPTIONS = new Set(['-f', '--file']);

/** Interpreters whose one-liner flag carries code, and their value-taking options. @es Intérpretes cuyo flag de one-liner lleva código, y sus opciones con valor. */
const INTERPRETER_VALUE_OPTIONS = { perl: new Set(['-I']), ruby: new Set(['-r', '-I']), python: new Set(['-W', '-X']), python3: new Set(['-W', '-X']) };

/** Whether a word is an unquoted option (`-x`, `--long`), as opposed to an argument. @es Si una palabra es una opción sin comillas, y no un argumento. */
function isOptionWord(token) {
  return !token.quoted && token.raw.length > 1 && token.raw[0] === '-';
}

/**
 * Whether an interpreter option carries inline code: perl and ruby `-e`/`-E` and the clusters ending in
 * them (`-pe`, `-ne`, `-lne`), python `-c`.
 * @es Si una opción de intérprete lleva código inline: `-e`/`-E` de perl y ruby y los clusters que
 * acaban en ellos, y `-c` de python.
 */
function isInlineCodeFlag(name, raw) {
  if (name === 'python' || name === 'python3') return raw === '-c';

  if (raw.length < 2 || raw[0] !== '-' || raw[1] === '-') return false;

  const letters = [...raw.slice(1)];
  const last = letters.pop();

  return (last === 'e' || last === 'E') && letters.every((letter) => 'pnlaiw'.includes(letter));
}

/**
 * Judges ONE payload word of a text-editing command: the unterminated and partly-quoted shapes (when
 * `checkShape`), then the eaten-escape characters. Returns the findings, or `undefined` when clean.
 * @es Juzga UNA palabra-payload de un comando de edición: las formas sin cerrar y mixta (si `checkShape`)
 * y luego los caracteres de escape comidos. Devuelve los hallazgos, o `undefined` si está limpia.
 */
function textEditFindings(token, checkShape) {
  if (token.unterminated)
    return [{ offset: 0, code: 0x27, kind: 'unterminated quote: the shell ends this payload somewhere you did not' }];

  if (checkShape && token.quoted && token.bare)
    return [{ offset: 0, code: 0x27, kind: 'payload is partly quoted and partly bare: a quote character inside it closed the run early' }];

  const findings = dangerousCharacters(token.raw);

  return findings.length > 0 ? findings : undefined;
}

/**
 * The words of a sed/sd/awk/gawk invocation that are scripts, patterns or file arguments, each tagged with
 * whether it is a script position. Options are skipped (their value words consumed), `--` ends option parsing.
 * @es Las palabras de una invocación sed/sd/awk/gawk que son scripts, patrones o ficheros, cada una con
 * marca de si es posición de script. Se saltan las opciones (consumiendo su valor); `--` termina las opciones.
 */
function scriptEditorWords(name, words) {
  const candidates = [];
  let scriptsLeft = LEADING_SCRIPT_WORDS[name];
  let optionsEnded = false;

  for (let index = 0; index < words.length; index += 1) {
    const token = words[index];

    if (!optionsEnded && !token.quoted && token.raw === '--') {
      optionsEnded = true;
      continue;
    }

    if (!optionsEnded && isOptionWord(token)) {
      if (SCRIPT_VALUE_OPTIONS[name].has(token.raw) && index + 1 < words.length) {
        candidates.push({ token: words[index + 1], script: true });
        scriptsLeft = 0;
        index += 1;
      } else if (OTHER_VALUE_OPTIONS[name].has(token.raw)) {
        if (SCRIPT_FILE_OPTIONS.has(token.raw)) scriptsLeft = 0;
        index += 1;
      }

      continue;
    }

    candidates.push({ token, script: scriptsLeft > 0 });
    if (scriptsLeft > 0) scriptsLeft -= 1;
  }

  return candidates;
}

/** The refusal object for the text-edit kind. @es El objeto de rechazo del tipo text-edit. */
function textEditRefusal(program, name, token, findings) {
  return { kind: 'text-edit', program: program.raw, flag: name, payload: token.raw, findings };
}

/**
 * Refusal for sed/sd/awk/gawk: every non-option word is checked for eaten escapes, script words also for
 * quoting shape. @es Rechazo para sed/sd/awk/gawk: toda palabra no-opción se revisa por escapes comidos;
 * las de script además por la forma del entrecomillado.
 */
function inspectScriptEditor(program, name, words) {
  for (const { token, script } of scriptEditorWords(name, words)) {
    const findings = textEditFindings(token, script);

    if (findings !== undefined) return textEditRefusal(program, name, token, findings);
  }

  return undefined;
}

/**
 * Refusal for perl/ruby/python one-liners: the code argument of `-e`/`-pe`/`-ne`/`-c` is checked like a
 * node evaluate payload. The walk ends at the script path (or the module name after python `-m`) or a
 * bare `--`, so the arguments of a script are never mistaken for the interpreter's own.
 * @es Rechazo para one-liners de perl/ruby/python: el argumento de código de `-e`/`-pe`/`-ne`/`-c` se
 * revisa como un payload de evaluación de node. El recorrido termina en la ruta del script (o el nombre
 * del módulo tras `-m` de python) o un `--` suelto, así los argumentos de un script no se confunden.
 */
function inspectInterpreter(program, name, words) {
  const valueOptions = INTERPRETER_VALUE_OPTIONS[name];

  for (let index = 0; index < words.length; index += 1) {
    const token = words[index];

    if (token.quoted || token.raw === '--' || token.raw === '-' || token.raw[0] !== '-') break;

    if (valueOptions.has(token.raw)) {
      index += 1;
      continue;
    }

    if (!isInlineCodeFlag(name, token.raw)) continue;

    const payloadTokens = [];

    if (index + 1 < words.length) {
      payloadTokens.push(words[index + 1]);
      if (!words[index + 1].quoted) payloadTokens.push(...words.slice(index + 2));
    }

    for (const payloadToken of payloadTokens) {
      const findings = textEditFindings(payloadToken, true);

      if (findings !== undefined) return textEditRefusal(program, name, payloadToken, findings);
    }

    index += 1;
  }

  return undefined;
}

/**
 * The decision. Returns `undefined` when the command may run, or a refusal describing exactly what was
 * found and where — an offset and a code point, so the refusal is checkable rather than an assertion.
 *
 * The positive condition is a CONJUNCTION and it is the measured failure shape: a node evaluate flag
 * AND a payload the shell will not deliver as written. A plain ASCII one-liner, a `'\n'`, a Windows
 * path and an accented string are all untouched, which is what keeps the guard from becoming the kind
 * of rule people route around — this repository already knows what a routinely-bypassed gate is worth.
 *
 * @es La decisión. `undefined` si puede ejecutarse, o un rechazo que dice qué se encontró y dónde
 * (offset y code point), para que sea comprobable y no una afirmación. La condición positiva es una
 * CONJUNCIÓN y es la forma medida: flag de evaluación de node Y un payload que el shell no entregará
 * tal cual. Un one-liner ASCII, un `'\n'`, una ruta Windows y un texto acentuado pasan intactos — eso
 * es lo que evita que la regla se esquive, y aquí ya se sabe lo que vale un gate esquivado.
 */
export function inspectCommand(command, { toolName } = {}) {
  // MSYS path translation exists only in Git Bash. Through the PowerShell tool `cmd /c` reaches cmd as
  // written (measured 2026-09-14 by a live `cmd /c echo` through that tool), so the switch rule is Bash's.
  // @es La traducción de rutas de MSYS sólo existe en Git Bash; por la herramienta PowerShell `cmd /c`
  // llega tal cual, así que la regla del switch es sólo de Bash.
  const msysTranslates = toolName !== 'PowerShell';

  for (const invocation of invocations(tokenize(command))) {
    let position = 0;

    while (position < invocation.length && isEnvironmentAssignment(invocation[position])) position += 1;

    const program = invocation[position];

    if (program === undefined) continue;

    const name = programName(program.raw);

    // MSYS switch mangling — the SAME failure family as an eaten escape: a command whose FORM makes
    // it silently not do what it says. Git Bash rewrites a lone `/c` argument into a `C:/` path, so
    // `cmd /c "rmdir …"` launches an INTERACTIVE cmd and the rmdir never runs. Measured here: two
    // worktree teardowns were reported done, the directories survived on disk, and the redirect hid
    // the Windows banner that would have shown it. `//c` is the escape hatch MSYS itself honours, and
    // PowerShell has no mangling at all — so the refusal is trivially satisfiable, which is what keeps
    // a guard from being fought. Only single-slash switches on `cmd` are refused; `//c` passes.
    // @es Mangling de switches de MSYS: la MISMA familia que un escape comido — un comando cuya FORMA
    // hace que en silencio no haga lo que dice. Git Bash reescribe `/c` como ruta `C:/`, así que
    // `cmd /c "rmdir …"` abre un cmd INTERACTIVO y el rmdir no corre nunca. Medido: dos worktrees se
    // dieron por segados, los directorios siguieron en disco, y el redirect ocultó el banner que lo
    // habría delatado. `//c` es la salida que el propio MSYS respeta.
    if (msysTranslates && (name === 'cmd' || name === 'cmd.exe')) {
      for (let index = position + 1; index < invocation.length; index += 1) {
        const raw = invocation[index].raw;

        if (raw.length !== 2 || raw[0] !== '/') continue;

        const letter = raw[1].toLowerCase();

        if (letter !== 'c' && letter !== 'k' && letter !== 'r') continue;

        return {
          kind: 'msys-switch',
          program: program.raw,
          payload: raw,
          findings: [{ offset: 0, code: raw.charCodeAt(0), kind: `single-slash switch \`${raw}\` is rewritten to a path before cmd sees it` }]
        };
      }
    }

    // Text-editing programs: the SAME failure family as a mangled node payload. A pattern or script that
    // holds a backslash the shell eats (`sd -F "a\\\\b"`, `"\${x}"`) reaches the program altered, matches
    // nothing, and exits 0 — measured twice (2026-09-30, 2026-10-04). Same detector, new programs.
    // @es Programas de edición de texto: la MISMA familia que un payload de node destrozado. Un patrón con
    // un backslash que el shell se come llega alterado, no casa con nada y sale con 0 — medido dos veces.
    // El mismo detector, programas nuevos.
    if (Object.hasOwn(LEADING_SCRIPT_WORDS, name)) {
      const editorRefusal = inspectScriptEditor(program, name, invocation.slice(position + 1));

      if (editorRefusal !== undefined) return editorRefusal;

      continue;
    }

    if (Object.hasOwn(INTERPRETER_VALUE_OPTIONS, name)) {
      const interpreterRefusal = inspectInterpreter(program, name, invocation.slice(position + 1));

      if (interpreterRefusal !== undefined) return interpreterRefusal;

      continue;
    }

    if (name !== 'node' && name !== 'nodejs') continue;

    for (let index = position + 1; index < invocation.length; index += 1) {
      // Only node's OWN options are examined: the scan ends where node's option parsing ends, so a `-p`
      // or `-e` that follows the script path is the script's argument, not an evaluate switch.
      // @es Solo se examinan las opciones PROPIAS de node: el escaneo termina donde termina el parseo
      // de opciones de node, así que un `-p` o `-e` tras la ruta del script es argumento del script.
      if (endsNodeOptions(invocation[index])) break;

      if (NODE_OPTIONS_TAKING_A_VALUE.has(invocation[index].raw)) {
        index += 1;
        continue;
      }

      const flag = evaluateFlag(invocation[index]);

      if (flag === undefined) continue;

      const inline = flag.inline !== undefined;
      const payloadTokens = [];

      if (inline) payloadTokens.push({ raw: flag.inline, quoted: true, bare: false, unterminated: false });
      else if (index + 1 < invocation.length) {
        payloadTokens.push(invocation[index + 1]);

        // An UNQUOTED payload was split on whitespace by the shell, so the code is spread across the
        // remaining words and all of them are part of it. A quoted payload is already complete, and
        // scanning past it would refuse ordinary path arguments for no measured reason.
        // @es Un payload SIN comillas lo partió el shell por espacios: el código está repartido por las
        // palabras restantes. Uno entrecomillado ya está completo, y seguir escaneando rechazaría
        // rutas corrientes sin motivo medido.
        if (!invocation[index + 1].quoted) payloadTokens.push(...invocation.slice(index + 2));
      }

      for (const token of payloadTokens) {
        // Failure 2's real mechanism. A payload that is partly quoted and partly bare, or whose quote
        // run never closed, is one whose boundaries the shell places somewhere the author did not —
        // exactly what an apostrophe inside a single-quoted payload does. The inline `-e'…'` form is
        // mixed by construction, so the shape test does not apply to it.
        // @es El mecanismo real del fallo 2: un payload en parte entrecomillado y en parte desnudo, o
        // con una comilla sin cerrar, tiene sus límites donde el autor no los puso — justo lo que hace
        // un apóstrofe dentro de un payload en comillas simples. La forma `-e'…'` es mixta por
        // construcción, así que la prueba de forma no se le aplica.
        if (!inline && token.unterminated)
          return { flag: flag.flag, payload: token.raw, findings: [{ offset: 0, code: 0x27, kind: 'unterminated quote: the shell ends this payload somewhere you did not' }] };

        if (!inline && token.quoted && token.bare)
          return { flag: flag.flag, payload: token.raw, findings: [{ offset: 0, code: 0x27, kind: 'payload is partly quoted and partly bare: a quote character inside it closed the run early' }] };

        const findings = dangerousCharacters(token.raw);

        if (findings.length > 0) return { flag: flag.flag, payload: token.raw, findings };
      }

      // The payload word was just examined; it is an argument of the switch, never an option itself, so
      // the walk resumes after it and a LATER evaluate switch (`node -e "a" -p "b"`) is still examined.
      // @es La palabra del payload ya se examinó: es argumento del switch, nunca una opción, así que el
      // recorrido sigue tras ella y un switch de evaluación POSTERIOR sigue examinándose.
      if (!inline) index += 1;
    }
  }

  return undefined;
}
