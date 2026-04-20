# Collapse Properties


Collapse note properties with a command.

## Behavior

- Provides one command for the active file.
- When the same file is open in multiple markdown leaves, the plugin collapses properties in all of those open views.
- In reading mode, the properties area collapses and updates immediately.
- In source mode, the plugin writes the collapsed state, but immediate visual refresh is not guaranteed by the public Obsidian API.
- If the internal metadata editor is unavailable, the plugin falls back to Obsidian's built-in toggle command for the active leaf.

## Command

- Chinese UI: `折叠当前文件的属性`
- Non-Chinese UI: `Collapse properties in current file`

## Installation

- Copy the plugin into your vault's `.obsidian/plugins/obsidian-collapse-properties` directory.
- Enable the `collapse-properties` community plugin in Obsidian.
