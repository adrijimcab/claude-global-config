/**
 * What a `git push` command line says about WHERE it pushes and WHAT: the repository word (a remote name,
 * a URL or a path, from the first positional or `--repo`), the refspecs after it, `--no-verify`, and the
 * bulk selectors (`--all`, `--tags`, `--mirror`) and `--delete`. Only the arguments AFTER `push`.
 *
 * `-n` is NOT `--no-verify` for a push: git documents `-n, --[no-]dry-run` (`git push -h`), a push that
 * transfers nothing, so it is not read as a verification bypass here.
 *
 * @es Lo que una línea `git push` dice de A DÓNDE sube y QUÉ: la palabra de repositorio (nombre de remoto,
 * URL o ruta; el primer posicional o `--repo`), los refspecs que siguen, `--no-verify` y los selectores
 * masivos (`--all`, `--tags`, `--mirror`) y `--delete`. `-n` NO es `--no-verify` en un push: git documenta
 * `-n, --[no-]dry-run`, un push que no transfiere nada.
 */

/** Long flags that take a separate value word. @es Banderas largas con valor separado. */
const VALUE_FLAGS = new Set(['--repo', '--receive-pack', '--exec', '--push-option', '--signed', '--force-with-lease', '--recurse-submodules']);

/** Value flags whose value is ONLY ever attached (`--flag=value`), so a following word is a positional. @es Banderas cuyo valor solo va pegado. */
const ATTACHED_ONLY = new Set(['--signed', '--force-with-lease', '--recurse-submodules']);

/**
 * @returns `{ repository, refspecs, noVerify, all, tags, mirror, deleting }`.
 * @es `{ repository, refspecs, noVerify, all, tags, mirror, deleting }`.
 */
export function parsePushArguments(args) {
  const parsed = { repository: undefined, refspecs: [], noVerify: false, all: false, tags: false, mirror: false, deleting: false };
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (word === '--') {
      positionals.push(...args.slice(index + 1));
      break;
    }

    if (!word.startsWith('-') || word === '-') {
      positionals.push(word);
      continue;
    }

    const [flag, ...attached] = word.split('=');

    if (flag === '--no-verify') parsed.noVerify = true;
    else if (flag === '--all' || flag === '--branches') parsed.all = true;
    else if (flag === '--tags') parsed.tags = true;
    else if (flag === '--mirror') parsed.mirror = true;
    else if (flag === '--delete') parsed.deleting = true;
    else if (flag === '--repo' && attached.length > 0) parsed.repository = attached.join('=');
    else if (flag === '--repo') parsed.repository = args[index + 1];

    if (!word.startsWith('--')) {
      if (word.includes('d')) parsed.deleting = true;
      if (word.endsWith('o')) index += 1; // -o <push-option>
    } else if (VALUE_FLAGS.has(flag) && attached.length === 0 && !ATTACHED_ONLY.has(flag)) {
      index += 1;
    }
  }

  const repositoryGivenByFlag = parsed.repository !== undefined;

  if (!repositoryGivenByFlag) parsed.repository = positionals[0];

  parsed.refspecs = repositoryGivenByFlag ? positionals : positionals.slice(1);

  return parsed;
}
