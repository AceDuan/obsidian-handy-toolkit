# 折叠所有笔记属性设计

## 目标

为插件新增一次性命令“折叠所有笔记的属性”，使当前设备上所有包含有效 YAML frontmatter 的 Markdown 笔记在下次打开时默认折叠属性区域；同时修复“折叠当前文件的属性”命令在中文环境显示英文的问题。

## 方案选择

采用 `app.foldManager.load(file)` / `save(file, foldInfo)` 保存未打开笔记的折叠状态，并对所有已打开的同文件 Markdown 视图调用 `metadataEditor.setCollapse(true, true)`。该方案保留已有正文折叠状态，并与 Obsidian 自身保存机制保持一致。

未采用以下方案：

- 直接写入 `<appId>-note-fold-<path>` localStorage 键：依赖内部键名格式，兼容性更差。
- 逐个打开所有笔记再调用 metadata editor：会扰动工作区，速度和可靠性都较差。

## 组件与数据流

`features/collapse-properties.ts` 继续负责当前笔记与批量折叠命令：

1. 用局部类型描述 `foldManager`、折叠数据和 Markdown 视图内部字段，避免扩散内部 API 类型。
2. 导出纯函数 `mergeFrontmatterFold(existing, currentLineCount)`。它复制现有折叠数组，保留既有 `lines`，只在缺少 `{ from: 0, to: 0 }` 时添加该记录；新记录使用当前文件行数。
3. 批量命令首先完整检查 `foldManager.load/save`，缺失时显示错误通知并且不修改任何状态。
4. 遍历 `vault.getMarkdownFiles()`，没有 metadata cache frontmatter 的文件计入跳过。
5. 对符合条件的文件，先读取并合并持久化折叠信息，再折叠其所有已打开视图。保存或视图更新异常按文件计入失败，其他文件继续执行。
6. 完成时显示“已折叠 N 篇，已跳过 N 篇，失败 N 篇”。
7. 命令名称通过 Obsidian 公共 `getLanguage()` API 本地化，中文使用“折叠当前文件的属性”和“折叠所有笔记的属性”。

批量保存仍以 `foldManager.save()` 为最终持久化步骤。打开视图的 `setCollapse()` 用于同步界面和视图自身状态，批量保存确保即使视图已处于折叠状态也存在 `{0,0}` 持久标记。

## 错误与边界

- 不读取或修改 Markdown 正文。
- metadata cache 没有 frontmatter（包括尚未得到有效解析结果）时跳过。
- `load()` 返回空值时创建新记录；已有记录保持原 `lines` 和所有正文折叠。
- 单个文件处理失败时计入失败，继续处理其余文件。
- 内部 API 整体不可用时在遍历前停止，保证不会部分修改。
- 多个视图打开同一文件时，逐个调用 `setCollapse(true, true)`。

## 验证

自动化测试覆盖纯函数六项合并规则、中文和英文命令名、API 缺失时零修改、frontmatter 过滤、统计、保存失败以及多个视图同步。随后执行完整测试、TypeScript 检查和生产构建。

构建产物部署到 `MyCorePKM` 与 `AI-Wiki` 的插件目录。若 Obsidian 正在运行，则通过 CLI 重载插件、检查命令注册、控制台错误，并用专用测试笔记验证持久化状态及文件内容不变；重启后的视觉状态属于最后的手工确认项。
