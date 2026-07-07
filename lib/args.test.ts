import { describe, expect, test } from "bun:test";
import { help, parseCli } from "./args";

describe("parseCli", () => {
  test("defaults to add with a generated name", () => {
    expect(parseCli([])).toEqual({ command: "add", name: undefined });
  });

  test("treats a bare positional as an add name", () => {
    expect(parseCli(["pikachu"])).toEqual({ command: "add", name: "pikachu" });
  });

  test("accepts explicit add", () => {
    expect(parseCli(["add", "pikachu"])).toEqual({
      command: "add",
      name: "pikachu",
    });
    expect(parseCli(["add"])).toEqual({ command: "add", name: undefined });
  });

  test("explicit add allows names that collide with commands", () => {
    expect(parseCli(["add", "list"])).toEqual({ command: "add", name: "list" });
  });

  test("parses list", () => {
    expect(parseCli(["list"])).toEqual({ command: "list" });
  });

  test("list rejects arguments", () => {
    expect(() => parseCli(["list", "extra"])).toThrow(
      "unexpected argument: extra",
    );
  });

  test("parses rm", () => {
    expect(parseCli(["rm", "pikachu"])).toEqual({
      command: "rm",
      name: "pikachu",
    });
  });

  test("rm requires a name", () => {
    expect(() => parseCli(["rm"])).toThrow("usage: jj-ws rm <name>");
  });

  test("parses sync with and without a path", () => {
    expect(parseCli(["sync"])).toEqual({ command: "sync", path: undefined });
    expect(parseCli(["sync", "../pikachu"])).toEqual({
      command: "sync",
      path: "../pikachu",
    });
  });

  test("parses shell and completion", () => {
    expect(parseCli(["shell", "zsh"])).toEqual({
      command: "shell",
      shell: "zsh",
    });
    expect(parseCli(["completion", "fish"])).toEqual({
      command: "completion",
      shell: "fish",
    });
  });

  test("shell and completion require a known shell", () => {
    expect(() => parseCli(["shell"])).toThrow(
      "usage: jj-ws shell <bash|zsh|fish>",
    );
    expect(() => parseCli(["completion", "powershell"])).toThrow(
      "usage: jj-ws completion <bash|zsh|fish>",
    );
  });

  test("rejects extra positionals", () => {
    expect(() => parseCli(["add", "pikachu", "extra"])).toThrow(
      "unexpected argument: extra",
    );
    expect(() => parseCli(["pikachu", "extra"])).toThrow(
      "unexpected argument: extra",
    );
  });

  test("parses --help and -h", () => {
    expect(parseCli(["--help"])).toEqual({ command: "help" });
    expect(parseCli(["-h"])).toEqual({ command: "help" });
    expect(parseCli(["rm", "-h"])).toEqual({ command: "help" });
  });

  test("throws on unknown options", () => {
    expect(() => parseCli(["--unknown"])).toThrow(/Unknown option '--unknown'/);
  });

  test("help matches snapshot", () => {
    expect(help()).toMatchSnapshot();
  });
});
