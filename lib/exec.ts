import { exec as _exec, spawn } from "node:child_process";
import { promisify } from "node:util";

export const exec = promisify(_exec);

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function mapToStdout({ stdout }: { stdout: string }): string {
  return stdout;
}

/**
 * Run a command, forwarding everything it prints to stderr. jj-ws reserves
 * its own stdout for machine-readable output (the created workspace path,
 * which the shell integration cds into), so jj's chatter must not land there.
 */
export function execToStderr(
  command: string,
  options: { cwd?: string } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(process.stderr);
    child.stderr.pipe(process.stderr);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (exit ${String(code)}): ${command}`));
    });
  });
}
