import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { NAMES } from "./lib/names";

const bun = process.execPath;
const pathToIndexFile = join(import.meta.dirname, "index.ts");

// Isolate spawned jj processes from the machine's user config.
const testEnv = {
  ...process.env,
  JJ_CONFIG: join(import.meta.dirname, "config.test.toml"),
};

const cleanups: (() => Promise<void>)[] = [];

afterAll(async () => {
  await Promise.all(cleanups.map((fn) => fn()));
});

async function setupTempJjRepo(name = "myrepo"): Promise<{
  root: string;
  repo: string;
}> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "jj-ws-test-")));
  cleanups.push(() => rm(root, { force: true, recursive: true }));

  const repo = join(root, "code", name);
  await mkdir(repo, { recursive: true });
  await $`jj git init`.env(testEnv).cwd(repo).quiet();

  return { root, repo };
}

function jjWs(cwd: string, ...args: string[]) {
  return $`${bun} ${pathToIndexFile} ${args}`.env(testEnv).cwd(cwd).quiet().nothrow();
}

async function workspaceList(cwd: string): Promise<string> {
  return $`jj workspace list`.env(testEnv).cwd(cwd).quiet().text();
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

describe("jj-ws", () => {
  test("add, list, and rm against a real jj repo", async () => {
    const { root, repo } = await setupTempJjRepo();
    const worktrees = join(root, "code", "worktrees", "myrepo");

    // add <name> creates the workspace and prints only its path on stdout
    const added = await jjWs(repo, "add", "pikachu");
    expect(added.exitCode).toBe(0);
    expect(added.stdout.toString()).toBe(`${join(worktrees, "pikachu")}\n`);
    expect(await exists(join(worktrees, "pikachu", ".jj"))).toBe(true);
    expect(await workspaceList(repo)).toContain("pikachu:");

    // bare positional is shorthand for add
    const shorthand = await jjWs(repo, "eevee");
    expect(shorthand.exitCode).toBe(0);
    expect(shorthand.stdout.toString()).toBe(`${join(worktrees, "eevee")}\n`);

    // no arguments -> generated name
    const random = await jjWs(repo);
    expect(random.exitCode).toBe(0);
    const randomPath = random.stdout.toString().trim();
    expect(NAMES).toContain(basename(randomPath));
    expect(await exists(join(randomPath, ".jj"))).toBe(true);

    // adding from inside a secondary workspace still resolves the main repo
    const nested = await jjWs(join(worktrees, "pikachu"), "add", "raichu");
    expect(nested.exitCode).toBe(0);
    expect(nested.stdout.toString()).toBe(`${join(worktrees, "raichu")}\n`);

    // duplicate names are rejected
    const duplicate = await jjWs(repo, "add", "pikachu");
    expect(duplicate.exitCode).toBe(1);
    expect(duplicate.stderr.toString()).toContain("already exists");

    // list shows every workspace with its directory
    const list = await jjWs(repo, "list");
    expect(list.exitCode).toBe(0);
    expect(list.stdout.toString()).toContain(`default\t${repo}`);
    expect(list.stdout.toString()).toContain(
      `pikachu\t${join(worktrees, "pikachu")}`,
    );

    // rm refuses to delete the workspace you are standing in
    const rmInside = await jjWs(join(worktrees, "pikachu"), "rm", "pikachu");
    expect(rmInside.exitCode).toBe(1);
    expect(rmInside.stderr.toString()).toContain("cd out of");

    // rm forgets the workspace and deletes the directory
    const removed = await jjWs(repo, "rm", "pikachu");
    expect(removed.exitCode).toBe(0);
    expect(await exists(join(worktrees, "pikachu"))).toBe(false);
    expect(await workspaceList(repo)).not.toContain("pikachu:");

    // rm of an unknown name fails
    const rmMissing = await jjWs(repo, "rm", "nope");
    expect(rmMissing.exitCode).toBe(1);
    expect(rmMissing.stderr.toString()).toContain(
      'no workspace or directory named "nope"',
    );
  });

  test("rm cleans up a workspace jj no longer tracks", async () => {
    const { root, repo } = await setupTempJjRepo();
    const worktrees = join(root, "code", "worktrees", "myrepo");

    await jjWs(repo, "add", "stale");
    await $`jj workspace forget stale`.env(testEnv).cwd(repo).quiet();

    const removed = await jjWs(repo, "rm", "stale");
    expect(removed.exitCode).toBe(0);
    expect(await exists(join(worktrees, "stale"))).toBe(false);
  });

  test("jj-ws.worktrees-dir config overrides the location", async () => {
    const { root, repo } = await setupTempJjRepo();
    await $`jj config set --repo jj-ws.worktrees-dir ../wt`
      .env(testEnv)
      .cwd(repo)
      .quiet();

    const added = await jjWs(repo, "add", "pikachu");
    expect(added.exitCode).toBe(0);
    expect(added.stdout.toString()).toBe(
      `${join(root, "code", "wt", "myrepo", "pikachu")}\n`,
    );
  });

  test("invalid names are rejected before touching the repo", async () => {
    const { root, repo } = await setupTempJjRepo();

    const added = await jjWs(repo, "add", "../evil");
    expect(added.exitCode).toBe(1);
    expect(added.stderr.toString()).toContain("invalid workspace name");
    expect(await exists(join(root, "code", "worktrees"))).toBe(false);
  });

  test("fails outside a jj repo", async () => {
    const outside = await realpath(
      await mkdtemp(join(tmpdir(), "jj-ws-outside-")),
    );
    cleanups.push(() => rm(outside, { force: true, recursive: true }));

    const result = await jjWs(outside, "add", "pikachu");
    expect(result.exitCode).toBe(1);
  });
});
