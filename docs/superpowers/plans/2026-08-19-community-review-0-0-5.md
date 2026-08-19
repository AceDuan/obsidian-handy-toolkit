# Community Review 0.0.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two blocking community-review errors, include the agreed low-risk review fixes, and publish `0.0.5` with tested release assets and build provenance.

**Architecture:** Keep plugin behavior unchanged while moving release-critical presentation and settings integration onto supported Obsidian APIs. CSS moves from runtime injection to `styles.css`; settings move from imperative rendering to the 1.13 declarative API; release generation moves from manual upload to a modern GitHub Actions workflow.

**Tech Stack:** TypeScript, Obsidian plugin API 1.13.1, Node.js built-in modules, esbuild, Node test runner, GitHub Actions.

## Global Constraints

- npm package version: `obsidian@^1.13.1`; npm has no `obsidian@1.13.7`.
- Runtime minimum: `manifest.minAppVersion` remains `1.13.7`.
- Plugin release version: `0.0.5`.
- Release tag: `0.0.5`.
- Required release assets: `main.js`, `manifest.json`, `styles.css`.
- All code comments and commit descriptions must be Chinese; commit title prefixes remain English.
- Do not perform the deferred full TypeScript unsafe refactor.
- Do not address unrelated dependency vulnerabilities in this release.

---

### Task 1: Metadata, API Package, and Static Styles

**Files:**
- Modify: `manifest.json`
- Modify: `versions.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `styles.css`
- Modify: `features/first-line-indent.ts`
- Modify: `main.ts`
- Modify: `tests/first-line-indent.test.mjs`

**Interfaces:**
- Produces: `styles.css` loaded automatically by Obsidian.
- Removes: `getIndentStyle()` and `injectIndentStyle()` from `features/first-line-indent.ts`.

- [ ] **Step 1: Add failing tests for static style and no style injector**

Update `tests/first-line-indent.test.mjs` so style assertions read root `styles.css`, verify frontmatter exclusions, and assert the module no longer exports `injectIndentStyle` or `getIndentStyle`.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
node --test tests/first-line-indent.test.mjs
```

Expected: FAIL because `styles.css` does not exist and the module still exports style functions.

- [ ] **Step 3: Update dependencies and metadata**

Run:

```bash
npm uninstall builtin-modules
npm install --save-dev obsidian@^1.13.1
npm pkg set version=0.0.5
```

Set `manifest.json` description to `增强阅读与编辑体验的工具箱.`, version to `0.0.5`, and add `versions.json` mapping `0.0.5: 1.13.7`.

- [ ] **Step 4: Move CSS and remove runtime injection**

Move every rule from `INDENT_STYLE` to root `styles.css`. Delete `INDENT_STYLE`, `getIndentStyle()`, `injectIndentStyle()`, and the `Plugin` import. Remove `injectIndentStyle()` from `main.ts`. Replace `document.createElement('p')` with `nodeEl.createEl('p', ...)`.

- [ ] **Step 5: Verify Task 1**

Run:

```bash
node --test tests/first-line-indent.test.mjs
npm run build
git diff --check
```

Expected: focused tests pass, production build passes, whitespace check passes.

- [ ] **Step 6: Commit Task 1**

```bash
git add manifest.json versions.json package.json package-lock.json styles.css features/first-line-indent.ts main.ts tests/first-line-indent.test.mjs
git commit -m "fix: 迁移插件样式到静态文件"
```

### Task 2: Runtime Warning Fixes

**Files:**
- Modify: `features/gitkeep.ts`
- Modify: `utils/custom-attachment-location.ts`
- Modify: `features/collapse-properties.ts`
- Create: `tests/gitkeep.test.mjs`
- Modify: `tests/settings.test.mjs`
- Modify: `tests/collapse-properties.test.mjs`

**Interfaces:**
- `CustomAttachmentLocationVaultLike.configDir` remains optional but must be present and non-empty to read configuration.
- Collapse fallback consumes the active Markdown view from `workspace.getActiveViewOfType()`.

- [ ] **Step 1: Add failing tests**

Add a `.gitkeep` test that simulates `vault.create()` rejection and expects a failure Notice rather than an unhandled rejection. Add a CAL test with `configDir: '.vault-config'` and assert reads use that directory. Add a test where `configDir` is missing and assert status is `unreadable`. Update collapse tests to provide `getActiveViewOfType()` and assert fallback uses it.

- [ ] **Step 2: Run new tests and verify failure**

Run:

```bash
node --test tests/gitkeep.test.mjs tests/settings.test.mjs tests/collapse-properties.test.mjs
```

Expected: FAIL because implementation still uses old APIs and unhandled Promise behavior.

- [ ] **Step 3: Implement warning fixes**

Append `.catch()` to `.gitkeep` Promise handling and show a failure Notice. Return `{ status: 'unreadable' }` when CAL `configDir` is missing. Replace `activeLeaf` access with `getActiveViewOfType()`.

- [ ] **Step 4: Verify Task 2**

Run:

```bash
node --test tests/gitkeep.test.mjs tests/settings.test.mjs tests/collapse-properties.test.mjs
npm run build
git diff --check
```

Expected: all focused tests pass, build passes, whitespace check passes.

- [ ] **Step 5: Commit Task 2**

```bash
git add features/gitkeep.ts utils/custom-attachment-location.ts features/collapse-properties.ts tests/gitkeep.test.mjs tests/settings.test.mjs tests/collapse-properties.test.mjs
git commit -m "fix: 处理运行时审查警告"
```

### Task 3: Declarative Settings

**Files:**
- Modify: `features/settings.ts`
- Modify: `tests/settings.test.mjs`

**Interfaces:**
- `HandyToolkitSettingTab.getSettingDefinitions(): SettingDefinitionItem[]`
- `getControlValue(key: string): boolean | string`
- `setControlValue(key: string, value: unknown): Promise<void>`

- [ ] **Step 1: Add failing declarative settings tests**

Extend the Obsidian stub with `update()`, `getControlValue()`, and `setControlValue()`. Assert `getSettingDefinitions()` returns controls for all four persisted settings, dependent visibility is declarative, setting values read from plugin settings, boolean/string writes persist and call `update()`, and no `display()` override remains.

- [ ] **Step 2: Run settings test and verify failure**

Run:

```bash
node --test tests/settings.test.mjs
```

Expected: FAIL because settings are still rendered only through `display()`.

- [ ] **Step 3: Implement declarative settings**

Implement `getSettingDefinitions()` with typed toggle and textarea controls. Use `visible` for the CAL setting, a declarative render item for async dependency status, and `this.update()` after state changes. Remove imperative `display()` and manual fragment creation.

- [ ] **Step 4: Verify Task 3**

Run:

```bash
node --test tests/settings.test.mjs
npm run build
git diff --check
```

Expected: settings tests pass, build passes, whitespace check passes.

- [ ] **Step 5: Commit Task 3**

```bash
git add features/settings.ts tests/settings.test.mjs
git commit -m "refactor: 迁移设置页到声明式接口"
```

### Task 4: Release Workflow and Build Externals

**Files:**
- Modify: `esbuild.config.mjs`
- Modify: `.github/workflows/main.yml`

**Interfaces:**
- Produces a workflow-triggered GitHub Release with assets and artifact attestations.

- [ ] **Step 1: Update esbuild builtins**

Replace the `builtin-modules` import with `builtinModules` from `node:module`. Keep all existing externals.

- [ ] **Step 2: Rewrite release workflow**

Use current actions: checkout v6, Node setup, dependency caching, `npm ci`, `npm test`, `npm run build`, `actions/attest-build-provenance@v3`, and `softprops/action-gh-release@v2`. Trigger on `0.*` and `v*` tags. Grant `id-token: write`, `attestations: write`, and `contents: write`.

- [ ] **Step 3: Verify workflow and build**

Run:

```bash
npm run build
git diff --check
```

Inspect workflow YAML for required permissions and assets. Expected: build passes and workflow includes `main.js`, `manifest.json`, and `styles.css`.

- [ ] **Step 4: Commit Task 4**

```bash
git add esbuild.config.mjs .github/workflows/main.yml
git commit -m "ci: 自动生成带来源证明的发布资产"
```

### Task 5: Full Verification and Release

**Files:**
- No source files are modified unless verification exposes a defect.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, build passes, whitespace check passes.

- [ ] **Step 2: Create tracking issues**

Create two GitHub Issues:

1. `chore: 分批修复 TypeScript unsafe 审查警告`
2. `chore: 跟踪剩余 DOM 与内部 API 兼容性清理`

- [ ] **Step 3: Merge through the Ace workflow**

Push `release/0.0.5`, create a PR to `main`, wait for checks, squash merge with a Chinese body, and verify the merge commit title contains the PR number.

- [ ] **Step 4: Tag and verify automated release**

After merge, reset local tag `0.0.5` to merged `main`, push it, and let the workflow create the Release. Verify:

- `main` and `0.0.5` point to the same commit.
- Release is not draft or prerelease.
- Assets are exactly named `main.js`, `manifest.json`, and `styles.css`.
- GitHub reports attestations for all three assets.
- Remote `main` manifest is `handy-toolkit / Handy Toolkit / 0.0.5`.
