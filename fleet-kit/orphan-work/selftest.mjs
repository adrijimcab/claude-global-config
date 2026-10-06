#!/usr/bin/env node
/**
 * Selftest of orphaned-work detection on a constructed repository: a stopped agent's dirty worktree, a
 * stopped agent's unintegrated commit, the same work under a live agent, an integrated worktree, a clean
 * one, a worktree outside the agent root, a registered worktree whose folder is gone, an unmeasurable
 * worktree, a non-delegation tool, and an ungoverned repository.
 * @es Selftest de la detección de trabajo huérfano sobre un repositorio construido, recorriendo cada estado.
 */

import { rmSync, utimesSync } from 'node:fs';
import path from 'node:path';

import { baseConfig, cleanup, commitFiles, git, makeRepository, suite, tempDir, writeConfig, writeFile } from '../testing/fixtures.mjs';
import { absolutePathsIn, delegationTouches, evaluate, lastWorkedMs, parkedWork } from './guard.mjs';

const { check, finish } = suite();
const root = tempDir('orphan');

process.env.HOOK_STATE_DIR = path.join(root, 'state');

try {
  const repository = makeRepository(root);
  const worktreeOf = (name) => path.join(repository, '.claude', 'worktrees', name);
  const add = (name) => git(repository, 'worktree', 'add', '--quiet', '-b', name, worktreeOf(name));
  // `lastWorked: () => 0` = nobody has touched any worktree recently, so these cases isolate the agent-record
  // rule; the recent-work rule has its own cases below, on real modification and author times.
  // @es `lastWorked: () => 0` = nadie tocó ningún worktree hace poco; los casos de trabajo reciente van abajo.
  const parkedNames = (records = [], cwd = repository, tool = 'Agent', lastWorked = () => 0) => parkedWork({ tool_name: tool, cwd }, { records, lastWorked }).map(({ worktree }) => path.basename(worktree.path)).sort();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const backdateHead = (worktree) => git(worktree, 'commit', '--amend', '--no-edit', '--quiet', '--date', twoHoursAgo.toISOString());

  writeConfig(repository, baseConfig());
  check('no agent worktree: nothing parked', parkedNames(), []);

  add('agent-clean');
  add('agent-dirty');
  writeFile(worktreeOf('agent-dirty'), 'draft.txt', 'x\n');
  add('agent-committed');
  commitFiles(worktreeOf('agent-committed'), { 'done.txt': 'x\n' });
  backdateHead(worktreeOf('agent-committed'));
  add('agent-landed');
  commitFiles(worktreeOf('agent-landed'), { 'landed.txt': 'x\n' });
  // develop moves first, so the pick is a NEW commit with the same patch: `git cherry` marks it `-`.
  commitFiles(repository, { 'develop-only.txt': 'x\n' }, 'chore: develop moves on');
  git(repository, 'cherry-pick', 'agent-landed');
  git(repository, 'worktree', 'add', '--quiet', '-b', 'outside', path.join(root, 'outside'));
  writeFile(path.join(root, 'outside'), 'draft.txt', 'x\n');

  check('dirty and unintegrated stopped worktrees are parked; clean, landed and outside ones are not', parkedNames(), ['agent-committed', 'agent-dirty']);
  check('a Task delegation sees the same', parkedNames([], repository, 'Task'), ['agent-committed', 'agent-dirty']);
  check('a non-delegation tool is not judged', parkedNames([], repository, 'Bash'), []);
  check('the counts are named', parkedWork({ tool_name: 'Agent', cwd: repository }, { records: [], lastWorked: () => 0 }).find(({ worktree }) => worktree.branch === 'agent-committed')?.work, { dirty: 0, unintegrated: 1 });

  const transcript = writeFile(root, 't/live.jsonl', '{}\n');

  check('a live agent\'s dirty worktree is not parked', parkedNames([{ id: 'agent-x', worktree: 'agent-dirty', worktreePath: worktreeOf('agent-dirty'), transcript }]), ['agent-committed']);

  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);

  utimesSync(transcript, old, old);
  check('a stopped agent (stale transcript) is parked again', parkedNames([{ id: 'agent-x', worktree: 'agent-dirty', worktreePath: worktreeOf('agent-dirty'), transcript }]), ['agent-committed', 'agent-dirty']);

  rmSync(worktreeOf('agent-dirty'), { recursive: true, force: true });
  check('a registered worktree whose folder is gone holds nothing on disk', parkedNames(), ['agent-committed']);

  // The delegation's target repository decides, not the session's. @es Decide el repositorio destino de la delegación, no el de la sesión.
  const briefed = (prompt) => parkedWork({ tool_name: 'Agent', cwd: repository, tool_input: { prompt } }, { records: [], lastWorked: () => 0 }).map(({ worktree }) => path.basename(worktree.path));
  const elsewhere = path.join(root, 'another-repo').replaceAll('\\', '/');

  check('a brief working only in another repository is not judged here', briefed(`Work only in ${elsewhere}/tool and commit there.`), []);
  check('a brief naming a path inside this repository is judged', briefed(`Read ${repository}\\src\\a.ts and also ${elsewhere}`), ['agent-committed']);
  check('a brief naming no absolute path is judged (nothing says where it works)', briefed('Fix the failing test.'), ['agent-committed']);
  check('a path is read up to whitespace, quote, backtick or bracket, normalised', absolutePathsIn('see `C:\\A\\B c` and "d:/x/y" (E:/z) noC:/no'), ['c:/a/b', 'd:/x/y', 'e:/z']);
  check('a near miss of the repository root is another repository', delegationTouches({ tool_input: { prompt: `${repository}-copy/x` } }, repository), false);

  // --- The path recogniser is PLATFORM-correct: every spelling a brief can use for a location, folded to
  // one canonical key. The root is spelled by the platform the guard runs on, the brief by whoever wrote
  // it, so both go through the same reduction. A POSIX path is case-SENSITIVE; a drive or UNC path never is.
  // @es El reconocedor de rutas es correcto por PLATAFORMA: cada grafía de una ubicación se reduce a una
  // clave canónica. La raíz la escribe la plataforma del guard y el brief quien lo redactó, así que ambos
  // pasan por la misma reducción. Una ruta POSIX distingue mayúsculas; una de unidad o UNC no.
  check('a POSIX absolute path is read, case kept, sentence punctuation dropped', absolutePathsIn('see /home/u/Repo/x, and "/opt/y".', 'linux'), ['/home/u/Repo/x', '/opt/y']);
  check('a UNC path is read and folded', absolutePathsIn('at \\\\Srv\\Share\\a b', 'win32'), ['//srv/share/a']);
  check('a Git Bash drive path is the drive path on Windows', absolutePathsIn('open /c/Users/Me/x now', 'win32'), ['c:/users/me/x']);
  check('a Git Bash drive path is a plain POSIX path elsewhere', absolutePathsIn('open /c/Users/Me/x now', 'linux'), ['/c/Users/Me/x']);
  check('a POSIX path that is no Git Bash drive is no path on Windows', absolutePathsIn('open /home/u/x now', 'win32'), []);
  check('a lone Git Bash switch is no path on Windows', absolutePathsIn('run cmd /c dir and /c', 'win32'), []);
  check('a drive path is read on every platform', absolutePathsIn('C:\\A\\B', 'linux'), ['c:/a/b']);
  check('doubled separators fold to one', absolutePathsIn('C:\\\\Users\\\\Me and /home//u///x', 'linux'), ['c:/users/me', '/home/u/x']);
  check('words that merely contain a slash are no paths', absolutePathsIn('and/or ./a/b ../c/d src/e/f.ts ~/g/h https://h.example/x // a / b', 'linux'), []);
  check('a path after an equals sign or a quote is read', absolutePathsIn('--cwd=/srv/a --other="/srv/b"', 'linux'), ['/srv/a', '/srv/b']);

  const brief = (prompt, root, platform) => delegationTouches({ tool_input: { prompt } }, root, platform);

  check('a POSIX brief path inside a POSIX root touches it', brief('Work in /home/u/repo/src.', '/home/u/repo', 'linux'), true);
  check('a POSIX brief path in a sibling folder does not', brief('Work in /home/u/repo-copy/src', '/home/u/repo', 'linux'), false);
  check('POSIX paths differing only by case are different places', brief('Work in /home/u/REPO/src', '/home/u/repo', 'linux'), false);
  check('a Git Bash brief path touches a Windows root, whatever the case', brief('Work in /c/users/ME/repo/src', 'C:/Users/me/repo', 'win32'), true);
  check('a backslash drive brief path touches a Windows root', brief('Work in C:\\Users\\Me\\repo\\src', 'C:/Users/me/repo', 'win32'), true);
  check('a Git Bash sibling of a Windows root does not touch it', brief('Work in /c/users/me/repo-copy', 'C:/Users/me/repo', 'win32'), false);
  check('a UNC brief path touches a UNC root', brief('Work in \\\\SRV\\share\\repo\\x', '//srv/Share/repo', 'win32'), true);
  check('a root with a trailing slash is the same root', brief('Work in /home/u/repo/x', '/home/u/repo/', 'linux'), true);
  check('a brief naming only a Windows path is elsewhere for a POSIX root', brief('Work in C:\\Users\\Me\\other', '/home/u/repo', 'linux'), false);
  check('a brief naming no path at all is judged', brief('Fix the failing test, see and/or ./a/b', '/home/u/repo', 'linux'), true);

  writeConfig(repository, baseConfig({ integrationBranches: ['no-such-branch'] }));
  check('every unmeasurable worktree is refused, never read as clean', parkedWork({ tool_name: 'Agent', cwd: repository }, { records: [], lastWorked: () => 0 }).filter(({ work }) => work.unmeasurable !== undefined).length, 3);
  writeConfig(repository, baseConfig());

  const output = await evaluate(JSON.stringify({ tool_name: 'Agent', cwd: repository, tool_input: {} }));

  check('evaluate refuses the delegation and names the worktree', [output?.hookSpecificOutput.permissionDecision, output?.hookSpecificOutput.permissionDecisionReason.includes('agent-committed')], ['deny', true]);
  check('an ungoverned repository is not judged', parkedNames([], root), []);
  check('a malformed payload fails open', await evaluate('nope'), undefined);

  // Recent work with no agent record: a session's workers writing the worktree by absolute path.
  // @es Trabajo reciente sin registro de agente: workers de una sesión que escriben el worktree por ruta absoluta.
  add('agent-busy');
  commitFiles(worktreeOf('agent-busy'), { 'step-1.txt': 'x\n' });
  backdateHead(worktreeOf('agent-busy'));
  const fresh = writeFile(worktreeOf('agent-busy'), 'step-2.txt', 'x\n');

  check('a worktree with a file written just now is live work, not parked', parkedNames([], repository, 'Agent', lastWorkedMs).includes('agent-busy'), false);
  utimesSync(fresh, twoHoursAgo, twoHoursAgo);
  check('the same worktree untouched for two hours is parked', parkedNames([], repository, 'Agent', lastWorkedMs).includes('agent-busy'), true);

  add('agent-fresh-commit');
  commitFiles(worktreeOf('agent-fresh-commit'), { 'step.txt': 'x\n' });
  check('a commit authored just now is live work even with a clean tree', parkedNames([], repository, 'Agent', lastWorkedMs).includes('agent-fresh-commit'), false);

  git(worktreeOf('agent-busy'), 'mv', 'step-1.txt', 'renamed.txt');
  utimesSync(path.join(worktreeOf('agent-busy'), 'renamed.txt'), new Date(), new Date());
  check('a rename is timed by its destination', parkedNames([], repository, 'Agent', lastWorkedMs).includes('agent-busy'), false);

  const busyNow = lastWorkedMs({ path: worktreeOf('agent-busy') });

  check('the last-work time is the newest entry, not the old HEAD', Date.now() - busyNow < 60 * 1000, true);
  check('an unreadable worktree has no last-work time', lastWorkedMs({ path: path.join(root, 'no-such-worktree') }), 0);
} finally {
  cleanup(root);
}

finish('orphan-work');
