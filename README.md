# jj-ws

quickly create and jump into [jujutsu](https://github.com/jj-vcs/jj) workspaces, kept tidy in a shared worktrees directory.

## Description

`jj-ws` automates the dance of spinning up a new jj workspace:

```sh
mkdir -p ../worktrees/<repo>
jj workspace add ../worktrees/<repo>/<name>
cd ../worktrees/<repo>/<name>
```

Given a repo at `~/code/myrepo`, `jj-ws` creates workspaces at `~/code/worktrees/myrepo/<name>` — one shared `worktrees` directory next to your repos, one subdirectory per repo, one workspace per checkout. Run it from anywhere inside the repo (including from another workspace); it always resolves the main repo first.

If you don't pass a name, it picks one for you (`pikachu`, `eevee`, ...).

Each workspace is also registered as a **git worktree** of the main repo (`jj workspace add` alone doesn't do this), so `git log`, `git blame`, IDEs, and other tools that shell out to git work inside it. The workspace gets its own detached HEAD (at the workspace's parent commit) and its own index, so running git in a workspace never disturbs the main checkout. `jj-ws rm` prunes the worktree registration again.

jj moves a workspace's `@` (and so its parent commit, `@-`) as you work — rebasing, `jj new`, squashing — but git's HEAD file is just a pointer written to disk once; it doesn't follow along. Run `jj-ws sync` in a workspace to re-point its git HEAD at the current `@-`, so `git diff`, `git log`, and friends stop reporting stale results. The shell integration (below) runs this automatically before every prompt, so you normally don't need to call it yourself.

If the main repo has a [`.worktreeinclude`](https://github.com/satococoa/git-worktreeinclude) file, `jj-ws` runs `git worktreeinclude apply` in "the new workspace.

Then, if the new workspace has an `.envrc`, `jj-ws` runs `direnv allow` in it, since direnv treats each directory's allow-list separately and would otherwise block the copy it just checked out.

## Install

requirements:

- `jj`
- `git` (optional; used to set up git worktrees inside workspaces)
- `direnv` (optional; used to allow an `.envrc` in new workspaces)
- [`git-worktreeinclude`](https://github.com/satococoa/git-worktreeinclude) (optional; used to copy gitignored files listed in `.worktreeinclude` into new workspaces)

```sh
bun i -g jj-ws
pnpm i -g jj-ws
npm i -g jj-ws
yarn global add jj-ws
```

then add the shell integration so creating a workspace also cds into it (a plain binary can't change your shell's directory), and so git HEAD stays synced automatically (see above):

```sh
# ~/.zshrc or ~/.bashrc
eval "$(jj-ws shell zsh)"   # or bash

# fish: ~/.config/fish/config.fish
jj-ws shell fish | source
```

without the integration, `jj-ws` prints the new workspace path on stdout, so `cd "$(jj-ws)"` also works, and you can run `jj-ws sync` by hand when you need git to see the latest jj state.

## Usage

```sh
jj-ws                # create a workspace with a generated name and cd into it
jj-ws pikachu        # create ../worktrees/<repo>/pikachu and cd into it
jj-ws add pikachu    # explicit form (needed for names that match a command)
jj-ws list           # list workspaces and their directories
jj-ws rm pikachu     # jj workspace forget + delete the directory
jj-ws sync           # re-point cwd's git HEAD at its current jj parent commit
jj-ws sync pikachu   # sync a workspace by path instead of cwd
```

`rm` also cleans up half-removed workspaces: it forgets stale entries whose directory is already gone, and deletes leftover directories jj no longer tracks.

## Configuration

the worktrees directory defaults to `../worktrees` next to the main repo. Override it (absolute, or relative to the main repo root) in your jj config:

```toml
[jj-ws]
worktrees-dir = "/Users/me/worktrees"
```

workspaces for a repo always land in `<worktrees-dir>/<repo-name>/`.

## Shell Completion

```sh
jj-ws completion zsh > "${fpath[1]}/_jj-ws"            # then restart zsh
jj-ws completion bash > /etc/bash_completion.d/jj-ws   # or >> ~/.bashrc
jj-ws completion fish > ~/.config/fish/completions/jj-ws.fish
```
