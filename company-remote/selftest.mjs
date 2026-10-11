#!/usr/bin/env node
/**
 * Self-test for company-remote: URL host extraction in every spelling a remote takes, and remote
 * classification on a constructed repository with constructed remotes.
 * @es Auto-test: extracción del host en cada grafía de URL y clasificación de remotos en un repo construido.
 */

import path from 'node:path';

import { createGitSandbox } from '../selftest-fixtures/git-sandbox.mjs';
import { invocationDirectory } from './invocation-directory.mjs';
import { companyRemoteNames, hostOf, isCompanyUrl, remoteUrls, runGit } from './remotes.mjs';

let failures = 0;
let total = 0;

function check(ok, line) {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

const HOST = 'gitlab.base100.local';

check(hostOf(`http://${HOST}/internal_development/productos/x.git`) === HOST, 'http URL');
check(hostOf(`https://user:pw@${HOST}:8443/g/x.git`) === HOST, 'https URL with credentials and a port');
check(hostOf(`ssh://git@${HOST}/g/x.git`) === HOST, 'ssh:// URL');
check(hostOf(`git@${HOST}:g/x.git`) === HOST, 'scp-like URL');
check(hostOf(`HTTP://GitLab.Base100.Local/x.git`) === HOST, 'host case is ignored');
check(hostOf('https://github.com/adrijimcab/claude-global-config.git') === 'github.com', 'a personal URL keeps its own host');
check(hostOf('C:\\Users\\a\\remote.git') === undefined, 'NEAR MISS: a Windows drive path has no host');
check(hostOf('C:/Users/a/remote.git') === undefined, 'NEAR MISS: a Windows drive path with slashes has no host');
check(hostOf('/srv/git/remote.git') === undefined && hostOf('../remote.git') === undefined, 'a POSIX or relative path has no host');
check(hostOf('/srv/a:b/remote.git') === undefined, 'NEAR MISS: a colon after a slash is a path, not an scp-like host');
check(hostOf(`https://github.com/x/${HOST}.git`) === 'github.com', 'NEAR MISS: the company host inside the PATH is not the host');
check(isCompanyUrl(`http://${HOST}/x.git`, [HOST]) && !isCompanyUrl(`http://not-${HOST}/x.git`, [HOST]) && !isCompanyUrl(`http://${HOST}.evil.test/x.git`, [HOST]), 'only an EXACT host match is a company URL');

const base = path.resolve('/work/repo');

check(invocationDirectory({ gitOptions: [], directory: base }) === base, 'no -C: the directory of the line');
check(invocationDirectory({ gitOptions: ['-C', 'sub'], directory: base }) === path.join(base, 'sub'), 'a relative -C folds onto the line directory');
check(invocationDirectory({ gitOptions: ['-C', 'a', '-C', '../b'], directory: base }) === path.join(base, 'b'), 'several -C fold in order');
check(invocationDirectory({ gitOptions: ['-C', path.resolve('/elsewhere')], directory: base }) === path.resolve('/elsewhere'), 'an absolute -C replaces the directory');
check(invocationDirectory({ gitOptions: ['-c', 'x=y', '--no-pager'], directory: base }) === base, 'other global options do not move the directory');
check(invocationDirectory({ gitOptions: ['-C', path.resolve('/abs')], directory: undefined }) === path.resolve('/abs'), 'an absolute -C rescues an unfollowable cd');
check(invocationDirectory({ gitOptions: ['-C', 'rel'], directory: undefined }) === undefined && invocationDirectory({ gitOptions: [], directory: undefined }) === undefined, 'a relative -C on an unfollowable cd stays unknown');
check(invocationDirectory({ gitOptions: ['-C'], directory: base }) === base, 'a dangling -C changes nothing');

const sandbox = createGitSandbox();

try {
  const git = (...args) => sandbox.git(args);

  check(companyRemoteNames(sandbox.repoDir, [HOST]).length === 0, 'a repository with no remote has no company remote');
  git('remote', 'add', 'origin', `http://${HOST}/internal_development/x.git`);
  git('remote', 'add', 'backup', 'https://github.com/adrijimcab/backup.git');
  git('remote', 'add', 'split', 'https://github.com/adrijimcab/split.git');
  git('remote', 'set-url', '--push', 'split', `git@${HOST}:g/split.git`);

  check(companyRemoteNames(sandbox.repoDir, [HOST]).sort().join() === 'origin,split', 'a remote is company when its fetch URL OR its push URL is on a company host');
  check(remoteUrls(sandbox.repoDir).some((remote) => remote.name === 'backup' && remote.url.includes('github.com')), 'remoteUrls lists personal remotes too');
  check(companyRemoteNames(sandbox.plainDir('not-a-repo'), [HOST]).length === 0, 'a directory that is not a repository has no company remote');
  check(runGit(sandbox.plainDir('also-not'), ['status']).ok === false, 'runGit reports a failing git as not ok');
} finally {
  sandbox.cleanup();
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
