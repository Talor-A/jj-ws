export const SHELLS = ["bash", "zsh", "fish"] as const;
export type Shell = (typeof SHELLS)[number];

export function isShell(value: string): value is Shell {
  return (SHELLS as readonly string[]).includes(value);
}

const COMMANDS = ["add", "list", "rm", "shell", "completion"];

function bashCompletion(): string {
  const words = [...COMMANDS, "--help"].join(" ");
  return `# bash completion for jj-ws
# install: jj-ws completion bash > /etc/bash_completion.d/jj-ws
#      or: jj-ws completion bash >> ~/.bashrc
_jj_ws() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if [ "\${COMP_CWORD}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${words}" -- "\${cur}") )
  elif [ "\${COMP_CWORD}" -eq 2 ] && [ "\${COMP_WORDS[1]}" = "rm" ]; then
    COMPREPLY=( $(compgen -W "$(jj-ws _names 2>/dev/null)" -- "\${cur}") )
  fi
  return 0
}
complete -F _jj_ws jj-ws
`;
}

function zshCompletion(): string {
  return `#compdef jj-ws
# zsh completion for jj-ws
# install: jj-ws completion zsh > "\${fpath[1]}/_jj-ws"  (then restart zsh)
_jj-ws() {
  local -a names
  _arguments \\
    '(-h --help)'{-h,--help}'[Show help message]' \\
    '1:command:(${COMMANDS.join(" ")})' \\
    '2:argument:->argument'

  case "\${words[2]}" in
    rm)
      names=("\${(f)$(jj-ws _names 2>/dev/null)}")
      _describe 'workspace' names
      ;;
  esac
}
_jj-ws "$@"
`;
}

function fishCompletion(): string {
  return `# fish completion for jj-ws
# install: jj-ws completion fish > ~/.config/fish/completions/jj-ws.fish
complete -c jj-ws -n __fish_use_subcommand -a add -d 'Create a workspace'
complete -c jj-ws -n __fish_use_subcommand -a list -d 'List workspaces'
complete -c jj-ws -n __fish_use_subcommand -a rm -d 'Remove a workspace'
complete -c jj-ws -n __fish_use_subcommand -a shell -d 'Print shell integration'
complete -c jj-ws -n __fish_use_subcommand -a completion -d 'Print completion script'
complete -c jj-ws -n '__fish_seen_subcommand_from rm' -a '(jj-ws _names 2>/dev/null)'
complete -c jj-ws -s h -l help -d 'Show help message'
`;
}

export function completionScript(shell: Shell): string {
  switch (shell) {
    case "bash":
      return bashCompletion();
    case "zsh":
      return zshCompletion();
    case "fish":
      return fishCompletion();
  }
}
