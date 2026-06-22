# Obsidian Handy Toolkit

[English README](./README.md)

一个用于增强 Obsidian 阅读与编辑体验的实用工具箱。

## 功能

### 1.属性折叠
- 折叠当前活动文件的属性区域，并同步处理同一文件的所有已打开 Markdown 视图。
- 一次性折叠仓库内所有带有效 YAML frontmatter 的 Markdown 笔记属性。

### 2.首行缩进
- 可选启用源码模式和阅读模式的首行缩进增强。

### 3.快速切换过滤
- 可隐藏指定文件夹下的文件，避免它们出现在快速切换结果中。

### 4.重命名时同步 frontmatter title
- 可选在 Markdown 文档重命名时，把 frontmatter 的 `title` 更新为新的文件名。
- 可选根据 Custom Attachment Location 的附件位置配置同步重命名附件文件夹；该开关仅在启用 title 同步后显示。

### 5.修改文档时更新 updated 字段
- 可选在 Markdown 文档内容修改时，把 frontmatter 的 `updated` 更新为当前时间。

## 行为

### 1.属性折叠
- 为当前活动文件和仓库内全部笔记分别提供属性折叠命令。
- 当同一个文件在多个 Markdown 视图中打开时，插件会折叠这些已打开视图中的属性区域。
- 批量命令会跳过没有有效 frontmatter 的笔记，并保留已有的标题、列表等正文折叠状态。
- 折叠状态只保存在当前设备的 Obsidian 本地数据中，不修改 Markdown 内容，也不会通过 Git 同步。
- 在阅读模式下，属性区域会立即折叠并更新显示。
- 在源码模式下，插件会写入折叠状态，但由于 Obsidian 公共 API 的限制，界面不一定会立刻刷新。
- 如果内部的 metadata editor 不可用，插件会回退到 Obsidian 为当前活动面板提供的内置属性折叠命令。

### 2.首行缩进
- 提供一个可选的首行缩进增强功能，默认关闭。
- 开启首行缩进后，插件会在源码模式下应用首行缩进，并处理阅读模式中由 `<br>` 分隔的段落，使拆分后的每一段都能正确缩进。

### 3.快速切换过滤
- 可通过设置隐藏快速切换中的指定文件夹；路径使用库根目录相对路径，多个文件夹用逗号分隔。

### 4.重命名时同步 frontmatter title
- 开启后，Markdown 文档重命名时只会把 frontmatter 的 `title` 更新为新的文件名。
- 正文中的一级标题不会被修改。
- 开启“重命名时同步同名附件文件夹”后，插件会读取已启用的 Custom Attachment Location 配置，并根据 `attachmentFolderPath` 中的 `${noteFilename}`、`${notefilename}` 或 `${noteFileName}` 渲染旧/新附件目录。
- 例如 `00_assets/${noteFilename}` 会在笔记从 `旧笔记.md` 改为 `新笔记.md` 后，尝试把 `00_assets/旧笔记` 改为 `00_assets/新笔记`。
- 如果当前笔记存在不在旧同名文件夹下的图片附件，插件会弹出提醒，并跳过附件文件夹重命名。
- 如果 Custom Attachment Location 不存在、未启用、配置读不到，插件不会重命名附件文件夹。

### 5.修改文档时更新 updated 字段
- 开启后，Markdown 文档内容修改时会用本地时间更新 frontmatter 的 `updated` 字段，格式为 `YYYY-MM-DD HH:mm:ss`。
- 如果原有 `updated` 距离当前时间两分钟内，插件会跳过写入，避免重复自触发更新。

## 命令

- 中文界面：`折叠当前文件的属性`
- 中文界面：`折叠所有笔记的属性`
- 非中文界面：`Collapse properties in current file`
- 非中文界面：`Collapse properties in all notes`

## 安装

- 将插件复制到你的库目录 `.obsidian/plugins/obsidian-handy-toolkit` 下。
- 在 Obsidian 中启用 `obsidian-handy-toolkit` 社区插件。

## 设置

- `启用首行缩进`：默认关闭。
- 开启后，插件会在内部接管迁移后的首行缩进逻辑，不再依赖对 Contextual Typography 插件或 Blue Topaz Custom 主题的单独修改。
- `快速切换隐藏文件夹`：使用逗号分隔库内文件夹路径，例如 `Archive, Templates/private`。
- `重命名时同步 frontmatter title`：默认关闭。
- `重命名时同步同名附件文件夹`：默认关闭；仅在开启 `重命名时同步 frontmatter title` 后显示，并依赖已启用的 Custom Attachment Location 配置。
- `修改文档时更新 updated 字段`：默认关闭。
