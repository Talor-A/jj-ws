#!/usr/bin/env node
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { help, parseCli } from "./lib/args";
import { completionScript } from "./lib/completion";
import { execToStderr, shellQuote } from "./lib/exec";
import { pickName } from "./lib/names";
import { shellIntegration } from "./lib/shell";
import {
  assertValidWorkspaceName,
  isInside,
  mainRepoRoot,
  workspaceNames,
  worktreesDirFor,
} from "./lib/workspace";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readdirOrEmpty(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

/**
 * mkdir -p <worktrees>/<repo> && jj workspace add <worktrees>/<repo>/<name>
 *
 * Returns the new workspace path; the caller prints it as the only stdout
 * line so the shell integration can cd into it.
 */
export async function addWorkspace(
  name: string | undefined,
  cwd: string = process.cwd(),
): Promise<string> {
  const mainRoot = await mainRepoRoot(cwd);
  const worktrees = await worktreesDirFor(mainRoot);
  const names = await workspaceNames(cwd);

  if (name === undefined) {
    const taken = new Set([...names, ...(await readdirOrEmpty(worktrees))]);
    name = pickName(taken);
  }
  assertValidWorkspaceName(name);

  const dest = join(worktrees, name);
  if (await exists(dest)) {
    throw new Error(`destination already exists: ${dest}`);
  }
  if (names.includes(name)) {
    // The directory is gone but jj still tracks the workspace (e.g. it was
    // deleted with plain `rm -rf`); a new one can't reuse the name until the
    // stale entry is forgotten.
    throw new Error(
      `workspace "${name}" already exists; run \`jj workspace forget ${name}\` first`,
    );
  }

  await mkdir(worktrees, { recursive: true });
  await execToStderr(`jj workspace add ${shellQuote(dest)}`, { cwd });
  return dest;
}

export async function removeWorkspace(
  name: string,
  cwd: string = process.cwd(),
): Promise<void> {
  assertValidWorkspaceName(name);
  if (name === "default") {
    throw new Error("refusing to remove the default workspace");
  }

  const mainRoot = await mainRepoRoot(cwd);
  const worktrees = await worktreesDirFor(mainRoot);
  const dest = join(worktrees, name);

  if (isInside(dest, cwd)) {
    throw new Error(`cd out of ${dest} first`);
  }

  const names = await workspaceNames(cwd);
  const isWorkspace = names.includes(name);
  const hasDir = await exists(dest);

  if (!isWorkspace && !hasDir) {
    throw new Error(`no workspace or directory named "${name}"`);
  }
  if (isWorkspace) {
    await execToStderr(`jj workspace forget ${shellQuote(name)}`, { cwd });
  }
  if (hasDir) {
    await rm(dest, { recursive: true, force: true });
  }
  console.error(`removed ${dest}`);
}

export async function listWorkspaces(
  cwd: string = process.cwd(),
): Promise<string> {
  const mainRoot = await mainRepoRoot(cwd);
  const worktrees = await worktreesDirFor(mainRoot);
  const names = await workspaceNames(cwd);

  const rows = await Promise.all(
    names.map(async (name) => {
      const path = name === "default" ? mainRoot : join(worktrees, name);
      return `${name}\t${(await exists(path)) ? path : "(directory missing)"}`;
    }),
  );
  return rows.join("\n");
}

if (import.meta.main) {
  try {
    const args = parseCli(process.argv.slice(2));

    switch (args.command) {
      case "help":
        console.log(help());
        break;
      case "completion":
        console.log(completionScript(args.shell));
        break;
      case "shell":
        console.log(shellIntegration(args.shell));
        break;
      case "add":
        console.log(await addWorkspace(args.name));
        break;
      case "list":
        console.log(await listWorkspaces());
        break;
      case "rm":
        await removeWorkspace(args.name);
        break;
    }
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
