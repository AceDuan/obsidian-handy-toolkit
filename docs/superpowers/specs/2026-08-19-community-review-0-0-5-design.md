# 0.0.5 社区审查修复设计

## 目标

修复 Obsidian 社区目录自动审查中的两个阻塞错误，并同步处理低风险的 Recommendation 与 Warning；发布 `0.0.5`，让 Release 资产具备构建来源证明。

## 范围

- 将 `obsidian` API 类型依赖升级到 npm 可用的 `1.13.1`，运行时最低版本保持 `1.13.7`。
- 移除 manifest 描述中的 `Obsidian` 品牌词。
- 将首行缩进样式迁移到根目录 `styles.css`，删除动态 `style` 元素注入。
- 将设置页迁移到 Obsidian 1.13 的声明式设置 API，并使用 `update()` 刷新依赖状态。
- 修复 `.gitkeep` Promise 错误处理、自定义配置目录、废弃 `activeLeaf`、`builtin-modules` 依赖和首行缩进 DOM 创建警告。
- 重写发布工作流，支持 `0.*` 标签、测试、构建、来源证明和三项 Release 资产上传。

## 非目标

- 不做全量 TypeScript unsafe 类型重构。后续以独立 Issue 分批处理，优先 `custom-attachment-location.ts`，再处理 quick switcher 内部 API 边界。
- 不保留旧版 Obsidian 设置页兼容分支；`minAppVersion` 已高于 1.13.0。
- 不处理与本次发布无关的依赖漏洞。

## 关键设计

### 样式加载

首行缩进 CSS 从 TypeScript 常量移动到 `styles.css`，由 Obsidian 自动加载。插件仅维护 body 上的启用状态类，不在运行时创建样式节点。

### 声明式设置

设置页通过 `getSettingDefinitions()` 描述四类基础设置，并覆写 `getControlValue()` 与 `setControlValue()` 读写插件设置。控件变更后调用 `this.update()`，让附件目录设置的可视性和依赖提示重新求值。Custom Attachment Location 的异步状态用声明式 render 项显示，并处理读取失败。

### 配置目录与运行时行为

读取 Custom Attachment Location 配置时必须使用 `vault.configDir`，没有该值时返回配置不可读，不再回退 `.obsidian`。属性折叠回退逻辑使用 `workspace.getActiveViewOfType()` 获取当前 Markdown 视图，避免废弃的 `activeLeaf`。

### 发布工作流

GitHub Actions 在 `0.*` 或 `v*` 标签推送时执行安装、测试、构建，使用 `actions/attest-build-provenance` 为 `main.js`、`manifest.json`、`styles.css` 生成来源证明，并创建非 draft、非 prerelease 的 GitHub Release。

## 验证

- 更新单元测试覆盖静态样式、声明式设置、自定义配置目录、`.gitkeep` 失败处理和当前视图回退。
- `npm test` 必须全部通过。
- `npm run build` 必须通过类型检查并生成生产 `main.js`。
- `git diff --check` 必须无输出。
- 推送 `0.0.5` 标签后核验 GitHub Release 资产和 artifact attestations。
