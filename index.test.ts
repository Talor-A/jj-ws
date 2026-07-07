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

async function setupTempJjRepo(
  name = "myrepo",
  // jj colocates by default; git.colocate=false forces the internal store
  { colocate = true } = {},
): Promise<{
  root: string;
  repo: string;
}> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "jj-ws-test-")));
  cleanups.push(() => rm(root, { force: true, recursive: true }));

  const repo = join(root, "code", name);
  await mkdir(repo, { recursive: true });
  if (colocate) {
    await $`jj git init --colocate`.env(testEnv).cwd(repo).quiet();
  } else {
    await $`jj --config git.colocate=false git init`
      .env(testEnv)
      .cwd(repo)
      .quiet();
  }

  return { root, repo };
}

async function commitFile(repo: string, name: string): Promise<void> {
  await Bun.write(join(repo, name), `${name}\n`);
  await $`jj commit -m ${`add ${name}`}`.env(testEnv).cwd(repo).quiet();
}

function jjWs(cwd: string, ...args: string[]) {
  return $`${bun} ${pathToIndexFile} ${args}`
    .env(testEnv)
    .cwd(cwd)
    .quiet()
    .nothrow();
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

    // _names lists workspace names for shell completion, excluding "default"
    const names = await jjWs(repo, "_names");
    expect(names.exitCode).toBe(0);
    expect(names.stdout.toString()).not.toContain("default");
    expect(names.stdout.toString()).toContain("pikachu");

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

  test("workspaces in a colocated repo are usable git worktrees", async () => {
    const { repo } = await setupTempJjRepo("myrepo", { colocate: true });
    await commitFile(repo, "hello.txt");

    const added = await jjWs(repo, "add", "pikachu");
    expect(added.exitCode).toBe(0);
    const dest = added.stdout.toString().trim();

    // git resolves the workspace as a linked worktree of the main repo
    const gitDir = await $`git rev-parse --git-dir`.cwd(dest).quiet().text();
    expect(gitDir.trim()).toBe(join(repo, ".git", "worktrees", "pikachu"));

    // git log sees the repo history from inside the workspace
    const log = await $`git log --format=%s -1`.cwd(dest).quiet().text();
    expect(log.trim()).toBe("add hello.txt");

    // the tree starts clean: index populated, .jj/ excluded
    const status = await $`git status --porcelain`.cwd(dest).quiet().text();
    expect(status).toBe("");

    const worktrees = await $`git worktree list`.cwd(repo).quiet().text();
    expect(worktrees).toContain(dest);

    // rm prunes the git worktree metadata again
    await jjWs(repo, "rm", "pikachu");
    expect(await exists(join(repo, ".git", "worktrees", "pikachu"))).toBe(
      false,
    );
  });

  test("sync re-points git HEAD after the jj parent commit moves", async () => {
    const { repo } = await setupTempJjRepo("myrepo", { colocate: true });
    await commitFile(repo, "hello.txt");

    const added = await jjWs(repo, "add", "pikachu");
    const dest = added.stdout.toString().trim();

    // advance the workspace's parent commit without touching git's HEAD
    await commitFile(dest, "world.txt");

    const staleLog = await $`git log --format=%s -1`.cwd(dest).quiet().text();
    expect(staleLog.trim()).toBe("add hello.txt");

    // sync with no path argument uses cwd
    const synced = await jjWs(dest, "sync");
    expect(synced.exitCode).toBe(0);

    const freshLog = await $`git log --format=%s -1`.cwd(dest).quiet().text();
    expect(freshLog.trim()).toBe("add world.txt");
  });

  test("sync accepts an explicit path", async () => {
    const { repo } = await setupTempJjRepo("myrepo", { colocate: true });
    await commitFile(repo, "hello.txt");

    const added = await jjWs(repo, "add", "pikachu");
    const dest = added.stdout.toString().trim();
    await commitFile(dest, "world.txt");

    const synced = await jjWs(repo, "sync", dest);
    expect(synced.exitCode).toBe(0);

    const log = await $`git log --format=%s -1`.cwd(dest).quiet().text();
    expect(log.trim()).toBe("add world.txt");
  });

  test("sync is a no-op in the default workspace", async () => {
    const { repo } = await setupTempJjRepo("myrepo", { colocate: true });
    await commitFile(repo, "hello.txt");

    const synced = await jjWs(repo, "sync");
    expect(synced.exitCode).toBe(0);
  });

  test("git works in workspaces of non-colocated repos too", async () => {
    const { repo } = await setupTempJjRepo("myrepo", { colocate: false });
    await commitFile(repo, "hello.txt");

    const added = await jjWs(repo, "add", "pikachu");
    expect(added.exitCode).toBe(0);
    const dest = added.stdout.toString().trim();

    const log = await $`git log --format=%s -1`.cwd(dest).quiet().text();
    expect(log.trim()).toBe("add hello.txt");

    const status = await $`git status --porcelain`.cwd(dest).quiet().text();
    expect(status).toBe("");
  });

  test("wiring an empty repo leaves git on an unborn branch", async () => {
    const { repo } = await setupTempJjRepo("myrepo", { colocate: true });

    const added = await jjWs(repo, "add", "pikachu");
    expect(added.exitCode).toBe(0);
    const dest = added.stdout.toString().trim();

    const status = await $`git status --porcelain`.cwd(dest).quiet().nothrow();
    expect(status.exitCode).toBe(0);
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
