import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findGitDir } from "./git";

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
