# 折叠所有笔记属性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增安全批量折叠所有带 frontmatter 笔记属性的命令，并修复当前笔记命令的中文本地化。

**Architecture:** 在现有折叠功能模块内封装 Obsidian 内部 `foldManager` 类型和批处理流程，将折叠记录合并保留为独立纯函数。命令注册只负责本地化名称和触发异步批处理，通知集中报告前置错误或最终统计。

**Tech Stack:** TypeScript、Obsidian API、Node.js test runner、esbuild

---

### Task 1: 折叠记录纯函数

**Files:**
- Modify: `features/collapse-properties.ts`
- Create: `tests/collapse-properties.test.mjs`

- [ ] **Step 1: 编写失败测试**

在测试中动态打包模块并断言：空记录生成 `{0,0}`、正文折叠保留、不重复、输入不变、旧记录保留 `lines`、新记录使用当前行数。

- [ ] **Step 2: 验证测试因缺少导出而失败**

Run: `node --test tests/collapse-properties.test.mjs`
Expected: FAIL，提示 `mergeFrontmatterFold` 不存在。

- [ ] **Step 3: 实现最小纯函数**

定义 `FoldInfo` / `FoldRange`，复制 folds 数组并按 `{ from: 0, to: 0 }` 是否存在进行合并；仅新记录采用 `currentLineCount`。

- [ ] **Step 4: 验证测试通过**

Run: `node --test tests/collapse-properties.test.mjs`
Expected: PASS。

### Task 2: 本地化与批量命令

**Files:**
- Modify: `features/collapse-properties.ts`
- Modify: `main.ts`
- Test: `tests/collapse-properties.test.mjs`

- [ ] **Step 1: 编写失败测试**

补充测试，使用 Obsidian stub 验证 `getLanguage()` 在 `zh-cn` 时注册两个中文名称，在 `en` 时注册英文名称；验证 API 缺失时显示错误且不访问文件；验证仅处理有 frontmatter 的文件、合并保存、所有打开视图同步和最终统计。

- [ ] **Step 2: 运行测试并确认因批量命令缺失或本地化错误而失败**

Run: `node --test tests/collapse-properties.test.mjs`
Expected: FAIL，失败原因指向缺少批量命令或错误命令名称。

- [ ] **Step 3: 实现批量流程和命令注册**

从 `obsidian` 导入 `getLanguage` 与 `Notice`，增加局部 `InternalApp` / `FoldManager` 类型；注册 `collapse-properties-in-all-files`，前置检查接口，遍历 Markdown 文件并根据 metadata cache 过滤、保存与统计。将当前命令名也改为使用 `getLanguage()`。

- [ ] **Step 4: 运行目标测试与完整测试**

Run: `node --test tests/collapse-properties.test.mjs && npm test`
Expected: 全部 PASS。

### Task 3: 文档、构建和部署验证

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Generate: `main.js`
- Deploy: `/home/lenovo/documents/obsidian/MyCorePKM/.obsidian/plugins/obsidian-handy-toolkit/`
- Deploy: `/home/lenovo/documents/obsidian/AI-Wiki/.obsidian/plugins/obsidian-handy-toolkit/`

- [ ] **Step 1: 更新中英文功能和命令文档**

说明批量命令只处理有效 frontmatter，保留正文折叠，状态为当前设备本地状态，并列出中英文命令名称。

- [ ] **Step 2: 执行完整静态与构建验证**

Run: `npm test && npm run build && git diff --check`
Expected: 测试零失败、构建退出码 0、diff 无空白错误。

- [ ] **Step 3: 部署到两个测试仓库**

复制 `main.js`、`manifest.json` 到两个已存在的插件目录，不改动仓库笔记内容。

- [ ] **Step 4: 执行 Obsidian 集成检查**

若 CLI 可连接，分别重载插件，确认两个命令存在，检查 `dev:errors` 和错误控制台；建立专用带/不带 frontmatter 的测试笔记，记录哈希，执行批量命令后验证 foldManager 结果、视图状态和哈希不变，最后清理测试笔记。

- [ ] **Step 5: 最终复验**

Run: `npm test && npm run build && git diff --check && git status --short`
Expected: 测试和构建成功，仅出现本任务预期文件。
