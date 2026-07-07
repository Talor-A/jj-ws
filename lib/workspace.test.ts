import { describe, expect, test } from "bun:test";
import {
  assertValidWorkspaceName,
  isInside,
  mainRootFromRepoMarker,
  parseWorkspaceListOutput,
  resolveWorktreesDir,
} from "./workspace";

describe("mainRootFromRepoMarker", () => {
  test("resolves the relative marker a secondary workspace holds", () => {
    expect(
      mainRootFromRepoMarker(
        "/Users/ta/code/worktrees/jj-pr/pikachu",
        "../../../../jj-pr/.jj/repo\n",
      ),
    ).toBe("/Users/ta/code/jj-pr");
  });

  test("resolves an absolute marker", () => {
    expect(
      mainRootFromRepoMarker(
        "/somewhere/else/ws",
        "/Users/ta/code/jj-pr/.jj/repo",
      ),
    ).toBe("/Users/ta/code/jj-pr");
  });
});

describe("resolveWorktreesDir", () => {
  test("defaults to ../worktrees/<repo> next to the main repo", () => {
    expect(resolveWorktreesDir("/Users/ta/code/jj-pr", "")).toBe(
      "/Users/ta/code/worktrees/jj-pr",
    );
  });

  test("resolves a configured relative dir against the main repo", () => {
    expect(resolveWorktreesDir("/Users/ta/code/jj-pr", "../wt")).toBe(
      "/Users/ta/code/wt/jj-pr",
    );
  });

  test("keeps a configured absolute dir", () => {
    expect(resolveWorktreesDir("/Users/ta/code/jj-pr", "/scratch/wt")).toBe(
      "/scratch/wt/jj-pr",
    );
  });
});

describe("parseWorkspaceListOutput", () => {
  test("extracts workspace names", () => {
    const output = [
      "default: qpvuntsm 4c4e2c5c (empty) (no description set)",
      "pikachu: oqnpxkrp caf470cc (empty) (no description set)",
      "",
    ].join("\n");
    expect(parseWorkspaceListOutput(output)).toEqual(["default", "pikachu"]);
  });

  test("returns nothing for empty output", () => {
    expect(parseWorkspaceListOutput("")).toEqual([]);
  });
});

describe("assertValidWorkspaceName", () => {
  test("accepts simple names", () => {
    expect(() => assertValidWorkspaceName("pikachu")).not.toThrow();
    expect(() => assertValidWorkspaceName("fix-1.2_x")).not.toThrow();
  });

  test("rejects names with path separators or leading dots", () => {
    expect(() => assertValidWorkspaceName("../evil")).toThrow(
      /invalid workspace name/,
    );
    expect(() => assertValidWorkspaceName("a/b")).toThrow(
      /invalid workspace name/,
    );
    expect(() => assertValidWorkspaceName(".hidden")).toThrow(
      /invalid workspace name/,
    );
    expect(() => assertValidWorkspaceName("")).toThrow(
      /invalid workspace name/,
    );
  });
});

describe("isInside", () => {
  test("matches the dir itself and children only", () => {
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/b/c")).toBe(true);
    expect(isInside("/a/b", "/a/bc")).toBe(false);
    expect(isInside("/a/b", "/a")).toBe(false);
  });
});
