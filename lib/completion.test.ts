import { describe, expect, test } from "bun:test";
import { completionScript, isShell, SHELLS } from "./completion";
import { shellIntegration } from "./shell";

describe("isShell", () => {
  test("accepts supported shells", () => {
    for (const shell of SHELLS) {
      expect(isShell(shell)).toBe(true);
    }
  });

  test("rejects unsupported shells", () => {
    expect(isShell("powershell")).toBe(false);
    expect(isShell("")).toBe(false);
  });
});

describe("completionScript", () => {
  for (const shell of SHELLS) {
    test(`${shell} completion matches snapshot`, () => {
      expect(completionScript(shell)).toMatchSnapshot();
    });
  }
});

describe("shellIntegration", () => {
  for (const shell of SHELLS) {
    test(`${shell} integration matches snapshot`, () => {
      expect(shellIntegration(shell)).toMatchSnapshot();
    });
  }

  test("bash and zsh integrations parse", async () => {
    for (const shell of ["bash", "zsh"] as const) {
      if (!Bun.which(shell)) continue; // not installed on this machine/CI
      const proc = Bun.spawn([shell, "-n", "/dev/stdin"], {
        stdin: new TextEncoder().encode(shellIntegration(shell)),
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(await proc.exited).toBe(0);
    }
  });
});
