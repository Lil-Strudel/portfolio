---
title: "Every line has to earn its place: my 2026 dotfiles"
description: "Arch, Hyprland, Ghostty, tmux with zero plugins, zsh with two and Neovim with twelve on native vim.pack. A 36-line plugin loader, a hand-written prompt, and the numbers that justified each cut."
published: 2026-09-29
tags: [linux, neovim, zsh, tmux, hyprland]
repo: https://github.com/Lil-Strudel/.dotfiles
---

My dotfiles repo has 332 commits going back to March 2023. It's lived through AwesomeWM, dunst, Telescope and a tmux sessionizer script I was very proud of. This year I deleted all of it and started again, one commit per tool, with a single rule written at the top of the README:

> A minimal, hand-rolled Arch + Hyprland setup where every line had to earn its place.

In practice that meant four habits:

- **Minimal.** No plugin managers or frameworks where a few lines will do. tmux has zero plugins, zsh has two, Neovim has twelve.
- **Questioned.** For every setting I ask what it does and what breaks if I delete it. If the answer is "nothing", it goes.
- **No comments in config files.** If a config needs a comment to make sense, the setting is probably wrong.
- **Fast, and measured.** zsh starts in about 40 ms and the prompt costs about 3 ms. I measure with the shell's own tools, never by vibes.

Here's a tour of where those rules led.

## Packages are declared, not remembered

Every package on the machine is listed in a [metapac](https://github.com/ripytide/metapac) group, one TOML file per area: `base`, `desktop`, `zsh`, `tmux`, `nvim`, `languages` and so on. Hardware-specific groups like `amd` and `nvidia` are pulled in by hostname. A group is short enough to read in one glance:

```toml
[arch]
packages = [
    "tmux",
    "sesh-bin",
]

[mise]
packages = [
    { name = "workmux", options = { version = "latest" } },
]
```

The rule for _where_ a package comes from is case by case. Arch's repos or a clean `-bin` AUR package are the default, and [mise](https://mise.jdx.dev/) handles anything that needs version management (like Node) or whose AUR package is poor. `metapac sync` makes the machine match the files, and `yadm` tracks the files.

## zsh: two plugins and a 36-line loader

There's no Oh My Zsh, no zinit and no framework. My `.zshrc` is just a list:

```zsh
source $ZDOTDIR/plug.zsh

plug $ZDOTDIR/exports.zsh
plug $ZDOTDIR/options.zsh
plug $ZDOTDIR/completion.zsh
plug $ZDOTDIR/vim.zsh
plug $ZDOTDIR/tools.zsh
plug $ZDOTDIR/prompt.zsh
plug $ZDOTDIR/aliases.zsh
plug $ZDOTDIR/local.zsh

plug zsh-users/zsh-autosuggestions
plug zsh-users/zsh-syntax-highlighting
```

`plug` is my own function. I used [zap](https://github.com/zap-zsh/zap) for a while, then found bugs in zap's own plugins and decided the job was small enough to own. Here's the whole thing, minus the update command:

```zsh
plug() {
  if [[ $1 == /* ]]; then
    [[ -r $1 ]] && source $1
    return
  fi

  local repo=${1%@*} ref=${1#*@}
  local dir=$PLUG_HOME/${repo:t}
  [[ $ref == $1 ]] && ref=
  _plugs+=($1)

  if [[ ! -d $dir ]]; then
    git -c advice.detachedHead=false clone -q --depth 1 ${ref:+--branch} $ref https://github.com/$repo $dir || return
    _plug_compile $dir
  fi
  local files=($dir/*.plugin.zsh(N) $dir/*.zsh(N))
  source $files[1]
}
```

An absolute path sources a local file if it exists. `owner/repo` shallow-clones once, `zcompile`s every file and sources the entry point. `owner/repo@v1.2` pins a tag. `plug-update` fetches each one and prints the commit it landed on. That's the entire plugin manager.

### A hand-written prompt

I measured [starship](https://starship.rs/) and it was the slowest prompt I tried, so the prompt is about 90 lines of zsh. It makes a _single_ `git status --porcelain=v2 --branch --show-stash` call and parses branch, ahead/behind, stash and dirty state out of that one output. The right side shows how long the last command took (timed with `$EPOCHREALTIME`), its exit code, background jobs, the Node or Go version when it's relevant, and `AWS_PROFILE` when one is set, which at a DevOps day job is the one that actually matters. `user@host` only appears over SSH.

The other big win was removing mise's per-prompt hook. It runs on every prompt to check whether the tool versions changed, which costs about 6 ms each time. Without it, I run `cd .` after `mise use`, which is a trade I'll take every time.

### Vi mode without a plugin

`zsh-vi-mode` is a popular plugin, and zsh's built-in vi mode does almost everything it does with a dozen lines. The cursor changes shape per mode, `v` in normal mode opens the current command in Neovim, and text objects like `ci"` work:

```zsh
bindkey -v
KEYTIMEOUT=1

_vi_cursor() { [[ $KEYMAP == vicmd ]] && print -n '\e[2 q' || print -n '\e[6 q' }
zle -N _vi_cursor
autoload -Uz add-zle-hook-widget
add-zle-hook-widget keymap-select _vi_cursor
add-zle-hook-widget line-init _vi_cursor
```

The rejected list is as informative as the kept one: starship, p10k, zsh-vi-mode, zsh-autocomplete, atuin, eza and bat all got tried and cut.

## tmux: one file, zero plugins

TPM, resurrect, continuum and the Catppuccin theme are all gone. The prefix stays `C-b`. The thing most people install vim-tmux-navigator for, moving between Neovim splits and tmux panes with `C-h/j/k/l`, is four lines of tmux:

```sh
%hidden in_app='#{m/r:^(n?vim|zsh|fzf)$,#{pane_current_command}}'
bind -n C-h if -F "$in_app" 'send C-h' 'select-pane -L'
bind -n C-j if -F "$in_app" 'send C-j' 'select-pane -D'
bind -n C-k if -F "$in_app" 'send C-k' 'select-pane -U'
bind -n C-l if -F "$in_app" 'send C-l' 'select-pane -R'
```

If the pane is running Neovim, zsh or fzf, the key passes through and the app handles it. Otherwise tmux moves panes. The status bar sits at the top in hand-picked Kanagawa colors, and the session name turns red while the prefix is held, which is a surprisingly good "you're in a mode" indicator. [sesh](https://github.com/joshmedeski/sesh) handles session switching, and [workmux](https://github.com/raine/workmux) gives each git worktree its own window.

## Neovim: twelve plugins on native `vim.pack`

Neovim 0.12 ships a built-in package manager, `vim.pack`, so lazy.nvim went too. `init.lua` is four `require` lines, there's one file per plugin under `plugin/`, and the whole plugin list fits on a screen:

```lua
local gh = function(repo) return "https://github.com/" .. repo end

vim.pack.add({
    gh("rebelot/kanagawa.nvim"),
    gh("folke/snacks.nvim"),
    gh("nvim-tree/nvim-web-devicons"),

    { src = gh("saghen/blink.cmp"), version = vim.version.range("1.*") },
    { src = gh("nvim-treesitter/nvim-treesitter"), version = "main" },
    gh("tpope/vim-sleuth"),

    gh("mason-org/mason.nvim"),
    gh("neovim/nvim-lspconfig"),
    gh("stevearc/conform.nvim"),

    gh("stevearc/oil.nvim"),
    gh("tpope/vim-fugitive"),
    gh("lewis6991/gitsigns.nvim"),
})
```

The lockfile is committed, so every machine runs the same plugin versions. Language servers are enabled with the native `vim.lsp.enable` for everything I touch, which includes Go, TypeScript, Terraform, Lua, Python, Rust, Astro and Tailwind. Mason installs them in the background on first launch. conform tries Biome, then oxfmt, then prettierd, and stops at the first one that works.

## Hyprland on a 32:9 monitor

The desktop is [Hyprland](https://hyprland.org/), using its new Lua config. `hyprland.lua` loads one file per topic (monitors, autostart, look, layout, input, binds, rules), then a per-host file chosen by reading `/proc/sys/kernel/hostname`. Machine-specific things like my Samsung G9's 5120×1440 at 240 Hz live in the host file, so the shared config stays portable.

The most opinionated choice is the layout. On a 32:9 screen, the default dwindle layout splits into long, useless slivers. So I use the **master layout with centered orientation**: one window fills the screen, two split it, and from three on the main window sits in the middle with the others stacked on either side. It's the first layout that's made an ultrawide feel like one screen instead of three.

There's no display manager either: `.zprofile` runs Hyprland on tty1, and Ghostty's entire config is three lines (font, theme, and a command that attaches to a tmux session named `main`).

The README is honest about what doesn't work, too. With the G9 and an NVIDIA card, a bug in Hyprland's aquamarine backend means the screen won't come back after DPMS turns it off, so hypridle only locks and never powers the screen down. It's written down with the upstream issue link, so future me knows when to undo the workaround.

## Kanagawa Dragon, everywhere

Neovim, Ghostty, tmux, waybar, even my Claude Code statusline all use [Kanagawa](https://github.com/rebelot/kanagawa.nvim) Dragon. If you're reading this in dark mode, so does this website now: the colors you're looking at are the same palette as my terminal, and the code blocks are highlighted with Kanagawa Dragon (or Lotus in light mode).

## Was it worth it?

Rewriting dotfiles from scratch is a classic way to spend a weekend feeling productive while producing nothing. But the result is a setup I can explain line by line, that installs on a fresh machine from a README, and that I trust enough to stop fiddling with. Mostly.

The [repo is public](https://github.com/Lil-Strudel/.dotfiles), and the README doubles as the full install guide, from partitioning a dual-boot disk with LUKS and Secure Boot to the first `metapac sync`.
