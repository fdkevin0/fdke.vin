---
title: Ghostty
description: Ghostty Usage Note
draft: true
lang: "en"
tags: []
publishDate: 2026-03-28T00:00:00Z
---


I've recently been using Ghostty and Tmux as my primary terminal services, mainly on remote servers and locally on macOS. Here's a record of the configuration and some keyboard shortcuts I've used:

## [Ghostty](https://ghostty.org/)

~/.config/ghostty/config

```conf
font-family = FiraCode Nerd Font Mono

command = /opt/homebrew/bin/fish

working-directory = home
clipboard-read = allow
clipboard-write = allow
copy-on-select = clipboard
theme = Apple System Colors
font-thicken = true
auto-update-channel = stable
bold-is-bright = true

macos-auto-secure-input = true
macos-secure-input-indication = true
macos-titlebar-style = native
macos-option-as-alt = true

keybind = global:cmd+backquote=toggle_quick_terminal
```

## Tmux

~/.config/tmux/tmux.conf

```conf
# set shell
set -g default-shell /usr/bin/fish

# Keep enough history for agent logs and long conversations
set -g history-limit 50000

# Better interaction defaults
set -g mouse on
set -g renumber-windows on
set -g default-terminal "tmux-256color"
set -g status-interval 5

# Make layouts easier to manage during agent work
setw -g aggressive-resize on


set -s set-clipboard on

set -as terminal-features ',xterm-256color:clipboard'
```

Reload Config for Tmux

```shell
tmux source-file ~/.config/tmux/tmux.conf
```
