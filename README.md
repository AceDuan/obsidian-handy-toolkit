# Obsidian Handy Toolkit

[中文说明](./README.zh-CN.md)

A handy toolkit for Obsidian reading and editing tweaks.

## Features

### 1. Collapse Properties
- Collapse the properties area for the active file, including all open markdown views of the same file.

### 2. First-Line Indentation
- Optionally apply first-line indentation in source mode and reading mode.

### 3. Quick Switcher Filtering
- Hide files under configured folders from quick switcher results.

### 4. Frontmatter Title Sync On Rename
- Optionally update the frontmatter `title` when a Markdown note is renamed.

### 5. Frontmatter Updated Sync On Modify
- Optionally update the frontmatter `updated` field when a Markdown note is modified.

## Behavior

### 1. Collapse Properties
- Provides one command to collapse properties for the active file.
- When the same file is open in multiple markdown leaves, the plugin collapses properties in all of those open views.
- In reading mode, the properties area collapses and updates immediately.
- In source mode, the plugin writes the collapsed state, but immediate visual refresh is not guaranteed by the public Obsidian API.
- If the internal metadata editor is unavailable, the plugin falls back to Obsidian's built-in toggle command for the active leaf.

### 2. First-Line Indentation
- Provides an optional first-line indentation enhancement, disabled by default.
- When first-line indentation is enabled, the plugin applies indentation in source mode and adapts reading-mode paragraphs separated by `<br>` so each split line can indent correctly.

### 3. Quick Switcher Filtering
- Can hide files in configured folders from quick switcher results. Paths are relative to the vault root and separated by commas.

### 4. Frontmatter Title Sync On Rename
- When enabled, renaming a Markdown note updates only the frontmatter `title` to the new filename.
- The first level 1 heading in the note body is not changed.

### 5. Frontmatter Updated Sync On Modify
- When enabled, modifying a Markdown note updates the frontmatter `updated` field with local time in `YYYY-MM-DD HH:mm:ss` format.
- If the existing `updated` value is within two minutes of the current time, the plugin skips writing it again to avoid repeated self-triggered updates.

## Command

- Chinese UI: `折叠当前文件的属性`
- Non-Chinese UI: `Collapse properties in current file`

## Installation

- Copy the plugin into your vault's `.obsidian/plugins/obsidian-handy-toolkit` directory.
- Enable the `obsidian-handy-toolkit` community plugin in Obsidian.

## Settings

- `Enable first-line indentation`: disabled by default.
- When enabled, the plugin applies the migrated indentation behavior internally, without requiring separate changes to Contextual Typography or Blue Topaz Custom.
- `Quick switcher hidden folders`: comma-separated vault-relative folder paths, such as `Archive, Templates/private`.
- `Sync frontmatter title on rename`: disabled by default.
- `Update updated field on modify`: disabled by default.
