import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { exec, mapToStdout } from "./exec";

/** Worktrees live next to the main repo by default: `../worktrees/<repo>/<name>`. */
export const DEFAULT_WORKTREES_DIR = "../worktrees";

/**
 * `<workspaceRoot>/.jj/repo` is a directory in the main workspace. In a
 * secondary workspace it is a file whose contents point at the main
 * workspace's `.jj/repo` directory, relative to `<workspaceRoot>/.jj`.
 */
export function mainRootFromRepoMarker(
  workspaceRoot: string,
  markerContents: string,
): string {
  const repoDir = resolve(join(workspaceRoot, ".jj"), markerContents.trim());
  return dirname(dirname(repoDir));
}

export async function mainRepoRoot(cwd: string): Promise<string> {
  const workspaceRoot = await exec("jj workspace root", { cwd })
    .then(mapToStdout)
    .then((s) => s.trim());

  const marker = join(workspaceRoot, ".jj", "repo");
  if ((await stat(marker)).isDirectory()) {
    return workspaceRoot;
  }
  return mainRootFromRepoMarker(workspaceRoot, await readFile(marker, "utf8"));
}

export function resolveWorktreesDir(
  mainRoot: string,
  configured: string,
): string {
  const base = resolve(mainRoot, configured || DEFAULT_WORKTREES_DIR);
  return join(base, basename(mainRoot));
}

export async function worktreesDirFor(mainRoot: string): Promise<string> {
  const configured = await exec("jj config get jj-ws.worktrees-dir", {
    cwd: mainRoot,
  })
    .then(mapToStdout)
    .then((s) => s.trim())
    .catch(() => ""); // key unset -> jj exits non-zero

  return resolveWorktreesDir(mainRoot, configured);
}

/** Parse `jj workspace list` output ("name: change ...") into workspace names. */
export function parseWorkspaceListOutput(output: string): string[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([^:\s]+):/);
    return match ? [match[1]!] : [];
  });
}

export async function workspaceNames(cwd: string): Promise<string[]> {
  return parseWorkspaceListOutput(
    await exec("jj workspace list", { cwd }).then(mapToStdout),
  );
}

const VALID_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertValidWorkspaceName(name: string): void {
  if (!VALID_NAME.test(name)) {
    throw new Error(
      `invalid workspace name ${JSON.stringify(name)}: use letters, digits, ".", "_" or "-"`,
    );
  }
}

export function isInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent + sep);
}
