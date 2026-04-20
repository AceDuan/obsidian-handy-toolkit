# Collapse Properties

[English README](./README.md)

使用命令折叠笔记属性区域。

## 行为

- 为当前活动文件提供一个命令。
- 当同一个文件在多个 Markdown 视图中打开时，插件会折叠这些已打开视图中的属性区域。
- 在阅读模式下，属性区域会立即折叠并更新显示。
- 在源码模式下，插件会写入折叠状态，但由于 Obsidian 公共 API 的限制，界面不一定会立刻刷新。
- 如果内部的 metadata editor 不可用，插件会回退到 Obsidian 为当前活动面板提供的内置属性折叠命令。

## 命令

- 中文界面：`折叠当前文件的属性`
- 非中文界面：`Collapse properties in current file`

## 安装

- 将插件复制到你的库目录 `.obsidian/plugins/obsidian-collapse-properties` 下。
- 在 Obsidian 中启用 `collapse-properties` 社区插件。
