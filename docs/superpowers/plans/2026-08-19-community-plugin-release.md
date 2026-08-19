# Community Plugin Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the plugin for its first Obsidian Community directory submission.

**Architecture:** Keep code behavior unchanged and correct only release metadata, public documentation, and version bookkeeping. Build artifacts are generated from source and attached to a GitHub Release whose tag exactly matches the manifest version.

**Tech Stack:** TypeScript, esbuild, Node.js test runner, npm.

## Global Constraints

- Plugin ID: `handy-toolkit`; the ID must not contain `obsidian`.
- Release version: `0.0.3`.
- Release tag: `0.0.3`, exactly matching the manifest version.
- Minimum app version: `1.13.7`, the current stable line shown by the official changelog.
- Required root files: `README.md`, `LICENSE`, and `manifest.json`.
- Required release assets: `main.js` and `manifest.json`; `styles.css` remains optional and absent.
- Commands and git commit messages must use Chinese; commit title prefixes remain English.

---

### Task 1: Release Metadata and Documentation

**Files:**
- Modify: `manifest.json`
- Modify: `versions.json`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

**Interfaces:**
- Consumes: Obsidian's community plugin manifest schema and release matching rules.
- Produces: a submission-ready manifest, version mapping, and bilingual public documentation.

- [x] **Step 1: Update manifest and version mapping**

Set `manifest.json` to:

```json
{
	"id": "handy-toolkit",
	"name": "Obsidian Handy Toolkit",
	"version": "0.0.3",
	"minAppVersion": "1.13.7",
	"description": "Obsidian 阅读与编辑体验增强工具箱.",
	"author": "Ace Duan",
	"isDesktopOnly": false
}
```

Remove the empty optional `authorUrl` and `fundingUrl` fields. Add this mapping to `versions.json`:

```json
"0.0.3": "1.13.7"
```

- [x] **Step 2: Complete public usage documentation**

In both README files:

- Add the image renaming command to Features and Behavior.
- Add the `.gitkeep` generation command to Features and Behavior.
- Add all command names to the Command section, including image renaming and `.gitkeep` generation.
- Replace `.obsidian/plugins/obsidian-handy-toolkit` with `.obsidian/plugins/handy-toolkit`.

- [x] **Step 3: Verify release metadata**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all 62 tests pass, production build succeeds, and whitespace checks report no errors.

- [x] **Step 4: Commit and tag**

Run:

```bash
git add manifest.json versions.json README.md README.zh-CN.md
git commit -m "chore: 准备社区插件首次提交"
git tag 0.0.3
```

Expected: the commit is created on the release branch and tag `0.0.3` points to it.
