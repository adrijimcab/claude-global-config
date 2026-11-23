/**
 * Whether a command edits a SOURCE file in place through a shell tool: `sed -i`, `perl -i` (`-pi`, `-i.bak`),
 * `awk -i inplace`, `sd` (which always edits its files in place), and PowerShell's `Set-Content`, `Add-Content` and
 * `Out-File`. The promoted rule shell-one-liner-corrupted-data says source files are written only with the Write and
 * Edit tools; it recurred 7 times with no mechanism (2026-11-22: a Discovery writer ran an escape-free `sed -i` on a
 * spec file, which eval-guard's escape detector rightly lets through, since no escape was eaten). This is that
 * mechanism. A source file is one whose extension is code or markup a build reads (CODE_EXTENSIONS).
 *
 *   inPlaceSourceEdit(words) -> { program, target } | undefined     words: the command's words, program first
 *
 * Read-only forms pass: `sed -n`, `perl -ne`, `awk '{...}' file`, `Get-Content`. So does an in-place edit of a file
 * that is not source (a log, a scratch text).
 *
 * @es Si un comando edita un fichero FUENTE en el sitio con una herramienta de shell: `sed -i`, `perl -i` (`-pi`,
 * `-i.bak`), `awk -i inplace`, `sd` (que siempre edita sus ficheros en el sitio) y `Set-Content`, `Add-Content` y
 * `Out-File` de PowerShell. La regla promovida dice que los fuentes se escriben solo con Write y Edit; se repitió 7
 * veces sin mecanismo. Este es ese mecanismo. Un fuente es un fichero cuya extensión es código o marcado que lee un
 * build. Las formas de solo lectura pasan, y también una edición en el sitio de un fichero que no es fuente.
 */

/** The extensions of source files. @es Las extensiones de los ficheros fuente. */
export const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'html', 'scss', 'css', 'json', 'vue', 'svelte', 'go', 'py', 'ps1', 'sh']);

/** The PowerShell cmdlets that write a file. @es Los cmdlets de PowerShell que escriben un fichero. */
const POWERSHELL_WRITERS = new Set(['set-content', 'add-content', 'out-file']);

/** The PowerShell parameters that name the file written. @es Los parámetros de PowerShell que nombran el fichero escrito. */
const POWERSHELL_PATHS = new Set(['-path', '-literalpath', '-filepath', '-lp']);

/** Whether a word names a source file. @es Si una palabra nombra un fichero fuente. */
export function isSourceFile(word) {
  // The extension is the trailing run of letters and digits after the last dot; a dotfile such as `.gitignore` has
  // none of the code extensions, so it needs no special case.
  // @es La extensión es la racha final de letras y dígitos tras el último punto; un dotfile como `.gitignore` no tiene
  // ninguna extensión de código, así que no necesita un caso aparte.
  const extension = /\.([A-Za-z0-9]+)$/.exec(word)?.[1];

  return extension !== undefined && CODE_EXTENSIONS.has(extension.toLowerCase());
}

/** The program name without its folder or `.exe`. @es El nombre del programa sin carpeta ni `.exe`. */
const nameOf = (raw) => (raw.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '');

/** Whether sed's options ask for an in-place edit. @es Si las opciones de sed piden edición en el sitio. */
const sedInPlace = (args) => args.some((arg) => arg === '--in-place' || arg.startsWith('--in-place=') || /^-[nErsuz]*i/.test(arg));

/**
 * Whether perl's options ask for an in-place edit (`-i`, `-pi`, `-i.bak`, `-0777pi`). Only switches that take no
 * fused value may precede the `i`, so `-Ilib/include` (an include path) is not read as one.
 * @es Si las opciones de perl piden edición en el sitio. Solo pueden ir antes de la `i` switches sin valor pegado,
 * así que `-Ilib/include` (una ruta de include) no se lee como tal.
 */
const perlInPlace = (args) => args.some((arg) => /^-[0-9pnlaw]*i/.test(arg));

/** Whether awk is told to edit in place (`-i inplace`, `--include=inplace`). @es Si a awk se le pide editar en el sitio. */
const awkInPlace = (args) => args.some((arg, index) => (arg === '-i' && args[index + 1] === 'inplace') || arg === '-iinplace' || arg === '--include=inplace');

/** The source file a PowerShell writer targets: its -Path value, else its first positional word. @es El fuente al que apunta un escritor de PowerShell. */
function powershellTarget(args) {
  for (let index = 0; index < args.length; index += 1) {
    if (POWERSHELL_PATHS.has(args[index].toLowerCase())) return args[index + 1];
  }

  return args.find((arg) => !arg.startsWith('-'));
}

/**
 * @param {{ raw: string }[]} words
 * @returns {{ program: string, target: string } | undefined}
 */
export function inPlaceSourceEdit(words) {
  if (words.length === 0) return undefined;

  const program = nameOf(words[0].raw);
  const args = words.slice(1).map((word) => word.raw);
  const firstSource = () => args.find((arg) => !arg.startsWith('-') && isSourceFile(arg));

  let target;

  if (program === 'sed' && sedInPlace(args)) target = firstSource();
  else if (program === 'perl' && perlInPlace(args)) target = firstSource();
  else if ((program === 'awk' || program === 'gawk') && awkInPlace(args)) target = firstSource();
  else if (program === 'sd') target = firstSource();
  else if (POWERSHELL_WRITERS.has(program)) {
    const named = powershellTarget(args);

    target = named !== undefined && isSourceFile(named) ? named : undefined;
  }

  return target === undefined ? undefined : { program: words[0].raw, target };
}
