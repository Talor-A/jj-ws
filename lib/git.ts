import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { exec, mapToStdout, shellQuote } from "./exec";

/**
 * The git dir backing a jj repo: `.git` when colocated, otherwise jj's
 * internal git store. Returns undefined when neither exists (or `.git` is
 * itself a worktree pointer file), in which case git wiring is skipped.
 */
export async function findGitDir(mainRoot: string): Promise<string | undefined> {
  const candidates = [
    join(mainRoot, ".git"),
    join(mainRoot, ".jj", "repo", "store", "git"),
  ];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** Keep `.jj/` out of git status; colocated repos already have this entry. */
async function excludeJjDir(gitDir: string): Promise<void> {
  const excludeFile = join(gitDir, "info", "exclude");
  const current = await readFile(excludeFile, "utf8").catch(() => "");
  if (/^\.jj\/?$/m.test(current)) return;

  await mkdir(join(gitDir, "info"), { recursive: true });
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  await appendFile(excludeFile, `${separator}.jj/\n`);
}

/**
 * Point a workspace's git worktree HEAD at its current jj parent commit
 * (`@-`). `jj-ws add` sets this up once at creation time, but jj moves `@`
 * (and therefore `@-`) as you work, so it drifts from the frozen HEAD left
 * on disk; `jj-ws sync` calls this again later to catch it up.
 */
async function syncHead(worktreeDir: string, dest: string): Promise<void> {
  const parent = await exec(
    `jj log -r @- --no-graph -T 'commit_id ++ "\\n"'`,
    { cwd: dest },
  )
    .then(mapToStdout)
    .then((s) => s.split("\n")[0]!.trim());

  // In a repo with no commits yet, @- is jj's virtual root commit (all
  // zeros), which isn't a real git object; use an unborn branch instead.
  const head = /^0+$/.test(parent) ? "ref: refs/heads/main" : parent;

  await writeFile(join(worktreeDir, "HEAD"), `${head}\n`);
}

/**
 * Register a jj workspace as a git worktree of the main repo so git commands
 * work inside it: writes the same metadata `git worktree add` would
 * (`<gitDir>/worktrees/<name>` plus a `.git` pointer file in the workspace),
 * with HEAD detached at the workspace's parent commit, then populates the
 * fresh index so `git status` starts clean.
 *
 * Returns false when wiring is skipped (a `.git` already exists in the
 * workspace, or the repo has no git backing).
 */
export async function wireGitWorktree(
  mainRoot: string,
  dest: string,
): Promise<boolean> {
  if (await exists(join(dest, ".git"))) return false;
  const gitDir = await findGitDir(mainRoot);
  if (!gitDir) return false;

  const worktreeDir = join(gitDir, "worktrees", basename(dest));
  await mkdir(worktreeDir, { recursive: true });
  await writeFile(join(worktreeDir, "gitdir"), `${join(dest, ".git")}\n`);
  await writeFile(join(worktreeDir, "commondir"), "../..\n");
  await writeFile(join(dest, ".git"), `gitdir: ${worktreeDir}\n`);

  await syncHead(worktreeDir, dest);
  await excludeJjDir(gitDir);

  // Index starts empty; without this, git status reports every tracked file
  // as staged for deletion. Skipped silently when git isn't installed.
  await exec("git reset -q", { cwd: dest }).catch(() => {});

  return true;
}

/**
 * Re-point an already-wired workspace's git HEAD at its current jj parent
 * commit. Unlike {@link wireGitWorktree}, this is meant to be called
 * repeatedly (e.g. from a shell precmd hook), so it leaves the index alone.
 *
 * Returns false when there's nothing to sync (the workspace isn't wired as
 * a git worktree, or the repo has no git backing).
 */
export async function syncGitWorktree(
  mainRoot: string,
  dest: string,
): Promise<boolean> {
  const pointer = await readFile(join(dest, ".git"), "utf8").catch(
    () => undefined,
  );
  const match = pointer?.match(/^gitdir:\s*(.+?)\s*$/m);
  if (!match) return false;

  const gitDir = await findGitDir(mainRoot);
  if (!gitDir) return false;

  await syncHead(match[1]!, dest);
  return true;
}

/** Drop git worktree metadata whose directories are gone (after rm). */
export async function pruneGitWorktrees(mainRoot: string): Promise<void> {
  const gitDir = await findGitDir(mainRoot);
  if (!gitDir) return;
  await exec(`git --git-dir ${shellQuote(gitDir)} worktree prune`).catch(
    () => {},
  );
}
