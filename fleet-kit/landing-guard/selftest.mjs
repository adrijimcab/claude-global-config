#!/usr/bin/env node
/**
 * Selftest of the landing guard on constructed repositories, driven through `evaluate` exactly as the
 * dispatcher calls it. States: every moving verb with and without a green verdict, red and foreign-suite
 * verdicts, rewinds and syncs, steering flags, mentions, non-integration branches, `cd` and `-C`, both
 * shells, advise vs enforce, a disabled guard, an ungoverned repository, and a malformed payload.
 * @es Selftest de la guarda de aterrizaje sobre repositorios construidos, a través de `evaluate` como la
 * llama el dispatcher, recorriendo cada estado.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { suiteIdentity, writeVerdict } from '../gate-run/verdicts.mjs';
import { baseConfig, cleanup, commitFiles, git, makeRepository, suite, tempDir, writeConfig } from '../testing/fixtures.mjs';
import { evaluate } from './guard.mjs';

const { check, finish } = suite();
const root = tempDir('landing');

process.env.HOOK_STATE_DIR = path.join(root, 'state');

/** The guard's verdict for a line: 'deny', 'advise' or 'allow'. @es El veredicto de la guarda para una línea. */
async function verdictOf(command, cwd, tool = 'Bash') {
  const output = await evaluate(JSON.stringify({ tool_name: tool, tool_input: { command }, cwd }));

  if (output === undefined) return 'allow';

  return output.hookSpecificOutput.permissionDecision === 'deny' ? 'deny' : 'advise';
}

try {
  const repository = makeRepository(root);
  const elsewhere = makeRepository(root, 'elsewhere');
  const unitSuite = { npmScript: 'test', cwd: '' };

  writeConfig(repository, baseConfig({ unitSuite }));
  git(repository, 'checkout', '--quiet', '-b', 'feature');
  const featureCommit = commitFiles(repository, { 'a.txt': 'a\n' });
  const featureTree = git(repository, 'rev-parse', 'HEAD^{tree}');
  const green = (tree, overrides = {}) => writeVerdict(repository, { tree, commit: featureCommit, suite: suiteIdentity(unitSuite), state: 'green', exitCode: 0, ...overrides });

  check('a commit on a non-integration branch is allowed', await verdictOf('git commit -m "feat: x"', repository), 'allow');
  check('pushing to a feature branch is allowed', await verdictOf('git push origin feature', repository), 'allow');
  check('push to develop without a verdict is refused', await verdictOf('git push origin feature:develop', repository), 'deny');
  check('branch -f develop without a verdict is refused', await verdictOf('git branch -f develop feature', repository), 'deny');
  check('checkout -B develop without a verdict is refused', await verdictOf('git checkout -B develop feature', repository), 'deny');
  check('update-ref of develop without a verdict is refused', await verdictOf('git update-ref refs/heads/develop feature', repository), 'deny');
  check('a mention inside echo is not a move', await verdictOf('echo "git push origin feature:develop"', repository), 'allow');
  check('a dry-run push moves nothing', await verdictOf('git push --dry-run origin feature:develop', repository), 'allow');

  git(repository, 'checkout', '--quiet', 'develop');

  // The repository a line acts on is the one git itself would pick: --git-dir or GIT_DIR names it, --work-tree only names its tree.
  // @es El repositorio sobre el que actúa una línea es el que elegiría git: --git-dir o GIT_DIR lo nombran, --work-tree solo nombra su árbol.
  const backup = path.join(root, 'backup.git');
  const cloneGitDir = path.join(repository, '.git');
  const treeInsideClone = path.join(repository, 'docs');

  git(root, 'init', '--quiet', '--bare', backup);
  check('a commit through --git-dir into a separate bare repository is allowed', await verdictOf(`git --git-dir="${backup}" --work-tree="${treeInsideClone}" commit -q -m "docs: x"`, repository), 'allow');
  check('--git-dir given as two words is honoured', await verdictOf(`git --git-dir "${backup}" commit -q -m x`, repository), 'allow');
  check('GIT_DIR set in the same command names the repository', await verdictOf(`GIT_DIR="${backup}" git commit -q -m x`, repository), 'allow');
  check('a relative --git-dir is resolved after -C, as git does', await verdictOf('git --git-dir=../backup.git commit -q -m x', repository), 'allow');
  check('a relative --git-dir follows the -C before it', await verdictOf('git -C .. --git-dir=repo/.git commit -q -m x', repository), 'deny');
  check('a relative --git-dir is resolved after -C, not before it', await verdictOf('git -C .. --git-dir=backup.git commit -q -m x', repository), 'allow');
  check('a commit through --git-dir into the clone own .git is refused', await verdictOf(`git --git-dir="${cloneGitDir}" commit -q -m x`, repository), 'deny');
  check('the same through --git-dir from elsewhere is refused', await verdictOf(`git --git-dir="${cloneGitDir}" commit -q -m x`, elsewhere), 'deny');
  check('GIT_DIR into the clone own .git is refused', await verdictOf(`GIT_DIR="${cloneGitDir}" git commit -q -m x`, elsewhere), 'deny');
  check('--git-dir wins over GIT_DIR, as in git', await verdictOf(`GIT_DIR="${backup}" git --git-dir="${cloneGitDir}" commit -q -m x`, elsewhere), 'deny');
  check('near miss: --work-tree alone does not change the repository', await verdictOf(`git --work-tree="${treeInsideClone}" commit -q -m x`, repository), 'deny');
  check('near miss: the clone .git with a foreign --work-tree is still refused', await verdictOf(`git --git-dir="${cloneGitDir}" --work-tree="${elsewhere}" commit -q -m x`, repository), 'deny');

  check('ff merge into develop without a verdict is refused', await verdictOf('git merge --ff-only feature', repository), 'deny');
  check('the same line from PowerShell is refused', await verdictOf('git merge --ff-only feature', repository, 'PowerShell'), 'deny');
  check('the same line through -C from elsewhere is refused', await verdictOf(`git -C "${repository}" merge --ff-only feature`, elsewhere), 'deny');
  check('the same line after cd from elsewhere is refused', await verdictOf(`cd "${repository}" && git merge --ff-only feature`, elsewhere), 'deny');
  check('a commit on develop is refused (content produced by the command)', await verdictOf('git commit -m "fix: y"', repository), 'deny');
  check('a cherry-pick on develop is refused', await verdictOf(`git cherry-pick ${featureCommit}`, repository), 'deny');
  check('cherry-pick --abort moves nothing', await verdictOf('git cherry-pick --abort', repository), 'allow');
  check('merge --abort moves nothing', await verdictOf('git merge --abort', repository), 'allow');
  check('a --no-ff merge is unknowable, refused', await verdictOf('git merge --no-ff feature', repository), 'deny');
  check('a rebase of develop is refused', await verdictOf('git rebase feature', repository), 'deny');
  check('pulling another branch into develop is refused', await verdictOf('git pull origin feature', repository), 'deny');
  check('pulling develop\'s own upstream is a sync, allowed', await verdictOf('git pull', repository), 'allow');
  check('a reset of paths moves nothing', await verdictOf('git reset -- a.txt', repository), 'allow');
  check('a reset of paths from a revision moves nothing', await verdictOf('git reset feature -- a.txt', repository), 'allow');

  green(featureTree);
  check('ff merge to a tree with a green verdict is allowed', await verdictOf('git merge --ff-only feature', repository), 'allow');
  check('push of that graded commit to develop is allowed', await verdictOf('git push origin feature:develop', repository), 'allow');
  check('a --no-ff merge of a graded commit is still unknowable', await verdictOf('git merge --no-ff feature', repository), 'deny');
  green(featureTree, { state: 'red', exitCode: 1 });
  check('a red verdict does not allow the move', await verdictOf('git merge --ff-only feature', repository), 'deny');
  green(featureTree, { suite: 'npm run other @ .' });
  check('a verdict for another suite does not allow the move', await verdictOf('git merge --ff-only feature', repository), 'deny');
  green(featureTree);

  git(repository, 'merge', '--quiet', '--ff-only', 'feature');
  check('a hard reset to an ancestor is a rewind, allowed', await verdictOf('git reset --hard HEAD~1', repository), 'allow');
  check('a merge that is already up to date is allowed', await verdictOf('git merge feature', repository), 'allow');

  git(repository, 'checkout', '--quiet', '-b', 'diverged', 'HEAD~1');
  commitFiles(repository, { 'b.txt': 'b\n' });
  git(repository, 'checkout', '--quiet', 'develop');
  green(git(repository, 'rev-parse', 'diverged^{tree}'));
  check('a non-fast-forward merge is unknowable even when the branch itself is graded', await verdictOf('git merge diverged', repository), 'deny');

  writeConfig(repository, baseConfig({ unitSuite, landingGuard: { mode: 'advise' } }));
  check('advise mode lets the line run with the finding', await verdictOf('git merge diverged', repository), 'advise');
  writeConfig(repository, baseConfig({ unitSuite, landingGuard: { enabled: false, reason: 'integration discipline not adopted yet' } }));
  check('a disabled guard says nothing', await verdictOf('git merge diverged', repository), 'allow');
  check('a repository without config says nothing', await verdictOf('git commit -m x', elsewhere), 'allow');

  check('a malformed payload fails open', await evaluate('{not json'), undefined);
  check('the malfunction is journaled', existsSync(path.join(root, 'state', 'fleet-kit', 'landing-guard', 'malfunctions.jsonl')), true);
} finally {
  cleanup(root);
}

finish('landing-guard');
