import { parseArgs as nodeParseArgs } from "node:util";
import { isShell, SHELLS, type Shell } from "./completion";

export type CliArgs =
  | { command: "add"; name: string | undefined }
  | { command: "list" }
  | { command: "rm"; name: string }
  | { command: "shell"; shell: Shell }
  | { command: "completion"; shell: Shell }
  | { command: "help" };

export function help(): string {
  return `Usage: jj-ws [command] [args]

Create jj workspaces in a shared worktrees directory and cd into them.
\`jj-ws\` with no arguments creates a workspace with a generated name;
\`jj-ws <name>\` is shorthand for \`jj-ws add <name>\`.

Workspaces are created at <worktrees-dir>/<repo>/<name>. <worktrees-dir>
defaults to ../worktrees next to the main repo; override it with:

  jj config set --user jj-ws.worktrees-dir /path/to/worktrees

Commands:
  add [name]            Create a workspace and print its path (default command)
  list                  List workspaces and their directories
  rm <name>             Forget a workspace and delete its directory
  shell <shell>         Print shell integration that cds into new workspaces
                        install: eval "$(jj-ws shell zsh)"
  completion <shell>    Print shell completion script (${SHELLS.join(", ")})

Options:
  -h, --help            Show this help message
`;
}

const COMMANDS = new Set(["add", "list", "rm", "shell", "completion"]);

export function parseCli(argv: string[]): CliArgs {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    options: {
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
  if (values.help) return { command: "help" };

  const [first, second, ...rest] = positionals;

  // A bare positional that isn't a known command is an `add` name.
  const [command, arg, extra] =
    first === undefined || COMMANDS.has(first)
      ? [first ?? "add", second, rest[0]]
      : ["add", first, second];

  if (extra !== undefined) {
    throw new Error(`unexpected argument: ${extra}`);
  }

  switch (command) {
    case "add":
      return { command: "add", name: arg };
    case "list":
      if (arg !== undefined) throw new Error(`unexpected argument: ${arg}`);
      return { command: "list" };
    case "rm":
      if (arg === undefined) throw new Error("usage: jj-ws rm <name>");
      return { command: "rm", name: arg };
    case "shell":
    case "completion": {
      if (arg === undefined || !isShell(arg)) {
        throw new Error(`usage: jj-ws ${command} <${SHELLS.join("|")}>`);
      }
      return command === "shell"
        ? { command: "shell", shell: arg }
        : { command: "completion", shell: arg };
    }
    default:
      throw new Error(`unknown command: ${command}`);
  }
}
