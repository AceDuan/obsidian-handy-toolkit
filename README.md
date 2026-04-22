# Obsidian Handy Toolkit

[中文说明](./README.zh-CN.md)

A handy toolkit for Obsidian reading and editing tweaks.

## Features

- Collapse properties: collapse the properties area for the active file, including all open markdown views of the same file.
- First-line indentation: optionally apply first-line indentation in source mode and reading mode.

## Behavior

- Provides one command to collapse properties for the active file.
- When the same file is open in multiple markdown leaves, the plugin collapses properties in all of those open views.
- In reading mode, the properties area collapses and updates immediately.
- In source mode, the plugin writes the collapsed state, but immediate visual refresh is not guaranteed by the public Obsidian API.
- If the internal metadata editor is unavailable, the plugin falls back to Obsidian's built-in toggle command for the active leaf.
- Provides an optional first-line indentation enhancement, disabled by default.
- When first-line indentation is enabled, the plugin applies indentation in source mode and adapts reading-mode paragraphs separated by `<br>` so each split line can indent correctly.

## Command

- Chinese UI: `折叠当前文件的属性`
- Non-Chinese UI: `Collapse properties in current file`

## Installation

- Copy the plugin into your vault's `.obsidian/plugins/obsidian-handy-toolkit` directory.
- Enable the `obsidian-handy-toolkit` community plugin in Obsidian.

## Settings

- `Enable first-line indentation`: disabled by default.
- When enabled, the plugin applies the migrated indentation behavior internally, without requiring separate changes to Contextual Typography or Blue Topaz Custom.
