import type { Shell } from "./completion";

// A child process cannot change its parent shell's directory, so `add` prints
// the new workspace path on stdout and this function wraps the binary to cd
// there. Every other subcommand's stdout is not a directory, so it passes
// through untouched.
function posixIntegration(shell: "bash" | "zsh"): string {
  const hook =
    shell === "zsh"
      ? `# Keeps git HEAD in sync with the jj parent commit before each prompt,
# so \`git diff\`/\`git log\` etc. don't drift as \`@\` moves.
jj-ws-sync-precmd() { command jj-ws sync 2>/dev/null }
autoload -Uz add-zsh-hook
add-zsh-hook precmd jj-ws-sync-precmd
`
      : `# Keeps git HEAD in sync with the jj parent commit before each prompt,
# so \`git diff\`/\`git log\` etc. don't drift as \`@\` moves.
jj-ws-sync-precmd() { command jj-ws sync 2>/dev/null; }
case ";\${PROMPT_COMMAND:-};" in
  *";jj-ws-sync-precmd;"*) ;;
  *) PROMPT_COMMAND="jj-ws-sync-precmd\${PROMPT_COMMAND:+;\$PROMPT_COMMAND}" ;;
esac
`;
  return `# jj-ws shell integration for ${shell}
# install: eval "$(jj-ws shell ${shell})"
# Wraps jj-ws in a function so creating a workspace also cds into it.
jj-ws() {
  local out
  out="$(command jj-ws "$@")" || return $?
  if [ -n "$out" ] && [ -d "$out" ]; then
    cd "$out" || return $?
  elif [ -n "$out" ]; then
    printf '%s\\n' "$out"
  fi
}

${hook}`;
}

function fishIntegration(): string {
  return `# jj-ws shell integration for fish
# install: jj-ws shell fish | source  (add to ~/.config/fish/config.fish)
# Wraps jj-ws in a function so creating a workspace also cds into it.
function jj-ws
    set -l out (command jj-ws $argv)
    set -l code $status
    test $code -eq 0; or return $code
    if test (count $out) -eq 1; and test -d "$out[1]"
        cd $out[1]
    else if test (count $out) -gt 0
        string join \\n -- $out
    end
end

# Keeps git HEAD in sync with the jj parent commit before each prompt,
# so \`git diff\`/\`git log\` etc. don't drift as @ moves.
function jj-ws-sync-precmd --on-event fish_prompt
    command jj-ws sync 2>/dev/null
end
`;
}

export function shellIntegration(shell: Shell): string {
  switch (shell) {
    case "bash":
    case "zsh":
      return posixIntegration(shell);
    case "fish":
      return fishIntegration();
  }
}
