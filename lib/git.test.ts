import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findGitDir, syncGitWorktree, wireGitWorktree } from "./git";

const testEnv = {
  ...process.env,
  JJ_CONFIG: join(import.meta.dirname, "..", "config.test.toml"),
};

const cleanups: (() => Promise<void>)[] = [];

afterAll(async () => {
  await Promise.all(cleanups.map((fn) => fn()));
});

async function makeTempDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "jj-ws-git-test-")));
  cleanups.push(() => rm(dir, { force: true, recursive: true }));
  return dir;
}

async function setupColocatedRepo(name = "repo"): Promise<{
  root: string;
  repo: string;
}> {
  const root = await makeTempDir();
  const repo = join(root, name);
  await mkdir(repo, { recursive: true });
  await $`jj git init --colocate`.env(testEnv).cwd(repo).quiet();
  return { root, repo };
}

async function commitFile(repo: string, name: string): Promise<void> {
  await Bun.write(join(repo, name), `${name}\n`);
  await $`jj commit -m ${`add ${name}`}`.env(testEnv).cwd(repo).quiet();
}

async function addWiredWorkspace(
  repo: string,
  name: string,
): Promise<string> {
  const dest = join(await makeTempDir(), name);
  await $`jj workspace add ${dest}`.env(testEnv).cwd(repo).quiet();
  expect(await wireGitWorktree(repo, dest)).toBe(true);
  return dest;
}

describe("findGitDir", () => {
  test("prefers .git in a colocated repo", async () => {
    const repo = join(await makeTempDir(), "repo");
    await mkdir(repo, { recursive: true });
    await $`jj git init --colocate`.env(testEnv).cwd(repo).quiet();

    expect(await findGitDir(repo)).toBe(join(repo, ".git"));
  });

  test("falls back to jj's internal git store", async () => {
    const repo = join(await makeTempDir(), "repo");
    await mkdir(repo, { recursive: true });
    await $`jj --config git.colocate=false git init`
      .env(testEnv)
      .cwd(repo)
      .quiet();

    expect(await findGitDir(repo)).toBe(
      join(repo, ".jj", "repo", "store", "git"),
    );
  });

  test("returns undefined without a git backing", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, ".git"), "gitdir: /elsewhere\n");

    expect(await findGitDir(dir)).toBeUndefined();
  });
});

describe("syncGitWorktree", () => {
  test("does nothing when the workspace has a real .git directory", async () => {
    const repo = join(await makeTempDir(), "repo");
    await mkdir(join(repo, ".git"), { recursive: true });

    expect(await syncGitWorktree(repo, repo)).toBe(false);
  });

  test("does nothing when the workspace has no .git at all", async () => {
    const repo = await makeTempDir();
    const dest = join(await makeTempDir(), "unwired");
    await mkdir(dest, { recursive: true });

    expect(await syncGitWorktree(repo, dest)).toBe(false);
  });

  test("with unchanged HEAD leaves the index alone", async () => {
    const { repo } = await setupColocatedRepo();
    await commitFile(repo, "hello.txt");

    const dest = await addWiredWorkspace(repo, "ws");
    expect(await syncGitWorktree(repo, dest)).toBe(true);

    await Bun.write(join(dest, "local.txt"), "staged\n");
    await $`git add local.txt`.cwd(dest).quiet();

    const before = await $`git diff --cached --name-only`.cwd(dest).quiet().text();
    expect(before.trim()).toBe("local.txt");

    expect(await syncGitWorktree(repo, dest)).toBe(true);

    const after = await $`git diff --cached --name-only`.cwd(dest).quiet().text();
    expect(after.trim()).toBe("local.txt");
  });

  test("with moved HEAD refreshes the index so git diff is clean", async () => {
    const { repo } = await setupColocatedRepo();
    await commitFile(repo, "hello.txt");

    const dest = await addWiredWorkspace(repo, "ws");
    await commitFile(dest, "world.txt");

    const staleLog = await $`git log --format=%s -1`.cwd(dest).quiet().text();
    expect(staleLog.trim()).toBe("add hello.txt");

    expect(await syncGitWorktree(repo, dest)).toBe(true);

    const freshLog = await $`git log --format=%s -1`.cwd(dest).quiet().text();
    expect(freshLog.trim()).toBe("add world.txt");

    const status = await $`git status --porcelain`.cwd(dest).quiet().text();
    expect(status).toBe("");
    const diff = await $`git diff`.cwd(dest).quiet().text();
    expect(diff).toBe("");
    const diffHead = await $`git diff HEAD`.cwd(dest).quiet().text();
    expect(diffHead).toBe("");
  });

  test("exports jj bookmark updates to git refs", async () => {
    const { repo } = await setupColocatedRepo();
    await commitFile(repo, "hello.txt");

    const dest = await addWiredWorkspace(repo, "ws");
    await $`jj bookmark create feature -r @-`.env(testEnv).cwd(dest).quiet();

    const staleRef = await $`git show-ref --heads feature`
      .cwd(dest)
      .quiet()
      .nothrow();
    expect(staleRef.exitCode).not.toBe(0);

    expect(await syncGitWorktree(repo, dest)).toBe(true);

    const freshRef = await $`git show-ref --heads feature`.cwd(dest).quiet().text();
    expect(freshRef).toContain("refs/heads/feature");
  });
});
