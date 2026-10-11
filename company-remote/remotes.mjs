/**
 * Which remotes of a repository point at a COMPANY host. A remote counts when ANY of its URLs (fetch or
 * push, as `git remote -v` prints them, `insteadOf` rewrites applied) has a host in the configured host
 * list. A path, a `file://` URL without a host or an unreadable repository has no host and is never company.
 * NOT MODELLED, stated: a remote added by the command being judged (`git remote add` earlier in the same
 * line), because the remote does not exist yet when the guard runs.
 *
 * @es Qué remotos de un repositorio apuntan a un host de EMPRESA. Un remoto cuenta si ALGUNA de sus URL
 * (fetch o push, como las imprime `git remote -v`, con `insteadOf` aplicado) tiene un host de la lista. Una
 * ruta, un `file://` sin host o un repositorio ilegible no tiene host y nunca es de empresa. NO se modela
 * un remoto añadido por el propio comando juzgado, porque aún no existe cuando corre la guardia.
 */

import { spawnSync } from 'node:child_process';

/** The variables that make git pick a repository other than the one asked for. @es Variables que desvían a git de otro repositorio. */
const REPOSITORY_SELECTORS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'];

/**
 * Runs git in `dir`.
 * @returns `{ ok, stdout }`; `ok` is false on a non-zero exit or a spawn failure.
 * @es Corre git en `dir`; `ok` es false con salida distinta de cero o fallo de arranque.
 */
export function runGit(dir, args) {
  const env = { ...process.env };

  for (const name of REPOSITORY_SELECTORS) delete env[name];

  const result = spawnSync('git', ['-C', dir, '-c', 'core.quotepath=false', ...args], { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024 });

  return { ok: result.status === 0, stdout: result.stdout ?? '' };
}

/** The host part of a remote URL, lower-cased, or `undefined` for a local path. @es El host de una URL de remoto, o `undefined` si es una ruta local. */
export function hostOf(url) {
  let authority;
  const schemeAt = url.indexOf('://');

  if (schemeAt !== -1) {
    const rest = url.slice(schemeAt + 3);
    const end = rest.search(/[/\\]/u);

    authority = end === -1 ? rest : rest.slice(0, end);
  } else {
    const colon = url.indexOf(':');
    const beforeColon = colon === -1 ? '' : url.slice(0, colon);

    // `host:path` / `user@host:path` (scp-like). A single letter before the colon is a Windows drive.
    if (beforeColon.length < 2 || beforeColon.includes('/') || beforeColon.includes('\\')) return undefined;

    authority = beforeColon;
  }

  const host = authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d*$/u, '');

  return host.length === 0 ? undefined : host.toLowerCase();
}

/** Whether `url` is hosted on one of `hosts`. @es Si `url` está alojada en alguno de `hosts`. */
export function isCompanyUrl(url, hosts) {
  const host = hostOf(url);

  return host !== undefined && hosts.includes(host);
}

/** Every `{ name, url }` URL of every remote of the repository at `dir`. @es Cada `{ name, url }` de cada remoto del repositorio. */
export function remoteUrls(dir) {
  const listing = runGit(dir, ['remote', '-v']);

  return listing.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts.length >= 2)
    .map(([name, url]) => ({ name, url }));
}

/** The names of the remotes of `dir` that have a company URL. @es Los nombres de los remotos con una URL de empresa. */
export function companyRemoteNames(dir, hosts) {
  return [...new Set(remoteUrls(dir).filter((remote) => isCompanyUrl(remote.url, hosts)).map((remote) => remote.name))];
}
