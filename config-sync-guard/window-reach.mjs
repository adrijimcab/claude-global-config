/**
 * Whether a shell call (a window of `shell-windows.mjs`) COULD have written a given repository.
 *
 * WHY. A window only says that a command was running at the time of a write, never where it wrote. A long
 * background call (a landing script, minutes) overlapped every peer write made meanwhile and claimed all
 * of them, in repositories its command never touched (measured 2026-10-18, at least five times across two
 * sessions). A call can have written a repository only when its working directory is inside it or its text
 * names its root (the root also covers any path under it). This is evidence of REACH, not of authorship:
 * a window that reaches the repository is still only a claim, and `path-ownership.mjs` decides what to do
 * with several of them.
 *
 * THE STATED LIMIT. A command that reaches the repository only through a relative path from a parent
 * directory, `~`, or an environment variable names neither the root nor runs inside it, so it does not
 * reach; its write stays unexplained instead of blaming a session that cannot be shown to have made it.
 * A window with neither a command nor a cwd (a record from before they were kept) says nothing about
 * where it ran, so it reaches everything, as every window did before.
 *
 * @es Si una llamada de shell (una ventana de `shell-windows.mjs`) PUDO escribir un repositorio dado. Una
 * ventana solo dice que había un comando corriendo, no dónde escribió: una llamada larga en segundo plano
 * reclamaba toda escritura ajena de su intervalo, en repositorios que su comando nunca tocó (medido el
 * 2026-10-18). Una llamada pudo escribir un repositorio solo si su directorio de trabajo está dentro o su
 * texto nombra su raíz (que cubre toda ruta bajo ella). Es evidencia de ALCANCE, no de autoría. LÍMITE
 * DECLARADO: un comando que llega solo con ruta relativa desde un directorio padre, `~` o una variable de
 * entorno no nombra la raíz ni corre dentro: su escritura queda sin explicar. Una ventana sin comando ni
 * cwd (registro anterior a que se guardaran) no dice dónde corrió, así que alcanza todo, como antes.
 */

/** Characters that continue a directory name, so a longer name is not the root. @es Caracteres que continúan un nombre de directorio. */
const NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789._-';

/** `text` lower-cased with every separator a forward slash and no doubled slash. @es `text` en minúsculas con todo separador como `/` y sin dobles. */
function normalized(text) {
  let flat = text.toLowerCase().split('\\').join('/');

  while (flat.includes('//')) flat = flat.split('//').join('/');

  return flat.endsWith('/') ? flat.slice(0, -1) : flat;
}

/** The spellings of `root` a command can use: `c:/x/y` and the MSYS `/c/x/y`. @es Las grafías de `root` que un comando puede usar. */
function spellingsOf(root) {
  const plain = normalized(root);

  return plain[1] === ':' ? [plain, `/${plain[0]}${plain.slice(2)}`] : [plain];
}

/** Whether `text` holds `spelling` as a whole directory name (not as the start of a longer one). @es Si `text` contiene `spelling` como nombre de directorio completo. */
function namesDirectory(text, spelling) {
  for (let at = text.indexOf(spelling); at !== -1; at = text.indexOf(spelling, at + 1)) {
    const next = text[at + spelling.length];

    if (next === undefined || !NAME_CHARACTERS.includes(next)) return true;
  }

  return false;
}

/**
 * Whether `window` (`{ start, end, command?, cwd? }`) could have written the repository at `repoRoot`.
 * @es Si `window` pudo escribir el repositorio de `repoRoot`.
 */
export function couldHaveWritten(window, repoRoot) {
  if (window.command === undefined && window.cwd === undefined) return true;

  const spellings = spellingsOf(repoRoot);
  const cwd = typeof window.cwd === 'string' ? normalized(window.cwd) : '';
  const insideRoot = cwd === spellings[0] || cwd.startsWith(`${spellings[0]}/`);

  return insideRoot || spellings.some((spelling) => namesDirectory(normalized(String(window.command ?? '')), spelling));
}
