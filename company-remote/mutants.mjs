#!/usr/bin/env node
/**
 * The decisions of company-remote, each broken once, that `selftest.mjs` must catch.
 * @es Las decisiones de company-remote, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const REMOTES = 'company-remote/remotes.mjs';

const MUTANTS = [
  ['a URL with a scheme is no longer parsed (every URL is read as scp-like)', REMOTES, 'const schemeAt = url.indexOf(\'://\');', 'const schemeAt = -1;'],
  ['the credentials are no longer stripped from the authority', REMOTES, 'authority.slice(authority.lastIndexOf(\'@\') + 1)', 'authority'],
  ['the port is no longer stripped from the host', REMOTES, ".replace(/:\\d*$/u, '')", ''],
  ['the host is no longer lower-cased', REMOTES, 'host.toLowerCase()', 'host'],
  ['a Windows drive letter is read as an scp-like host', REMOTES, 'beforeColon.length < 2 || ', ''],
  ['a path containing a colon after a slash is read as an scp-like host', REMOTES, " || beforeColon.includes('/') || beforeColon.includes('\\\\')", ''],
  ['the authority runs on into the path (the host is judged by the whole URL)', REMOTES, 'authority = end === -1 ? rest : rest.slice(0, end);', 'authority = rest;'],
  ['a host that merely CONTAINS a company host counts', REMOTES, 'return host !== undefined && hosts.includes(host);', 'return host !== undefined && hosts.some((one) => host.includes(one));'],
  ['the push URL is dropped (only the first URL of each remote counts)', REMOTES, '.map(([name, url]) => ({ name, url }));', '.map(([name, url]) => ({ name, url }))\n    .filter((remote, at, all) => all.findIndex((other) => other.name === remote.name) === at);'],
  ['a failing git is reported as ok', REMOTES, 'ok: result.status === 0', 'ok: true'],
  ['company remote names are no longer de-duplicated', REMOTES, 'return [...new Set(remoteUrls(dir).filter((remote) => isCompanyUrl(remote.url, hosts)).map((remote) => remote.name))];', 'return remoteUrls(dir).filter((remote) => isCompanyUrl(remote.url, hosts)).map((remote) => remote.name);']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['company-remote', 'selftest-fixtures', 'mutation-proof'],
  selftest: 'company-remote/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
