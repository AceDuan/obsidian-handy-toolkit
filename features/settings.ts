import { App, Plugin, PluginSettingTab, Setting } from 'obsidian'

// 插件设置：保存用户可控制的功能开关。
export type HandyToolkitSettings = {
	enableFirstLineIndent: boolean
	quickSwitcherHiddenFolders: string
	syncFrontmatterTitleOnRename: boolean
	syncUpdatedFieldOnModify: boolean
}

// 插件设置：默认关闭首行缩进增强，避免安装后改变既有显示效果。
export const DEFAULT_SETTINGS: HandyToolkitSettings = {
	enableFirstLineIndent: false,
	quickSwitcherHiddenFolders: '',
	syncFrontmatterTitleOnRename: false,
	syncUpdatedFieldOnModify: false,
}

type HandyToolkitSettingsPlugin = Plugin & {
	settings: HandyToolkitSettings
	saveSettings(): Promise<void>
}

// 设置页：提供用户可控制的插件开关。
export class HandyToolkitSettingTab extends PluginSettingTab {
	plugin: HandyToolkitSettingsPlugin

	// 设置页：保存插件实例，便于读写配置。
	constructor(app: App, plugin: HandyToolkitSettingsPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	// 设置页：渲染插件设置项。
	display() {
		const { containerEl } = this
		containerEl.empty()

		new Setting(containerEl)
			.setName('启用首行缩进')
			.setDesc('开启后自动应用源码模式首行缩进，并处理阅读模式中由 <br> 分隔的段落缩进。')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableFirstLineIndent)
					.onChange(async (value) => {
						this.plugin.settings.enableFirstLineIndent = value
						await this.plugin.saveSettings()
					}),
			)

		new Setting(containerEl)
			.setName('快速切换隐藏文件夹')
			.setDesc('使用逗号分隔库内文件夹路径；这些文件夹下的文件不会出现在快速切换结果中。')
			.addTextArea((text) =>
				text
					.setPlaceholder('Archive, Templates/private')
					.setValue(this.plugin.settings.quickSwitcherHiddenFolders)
					.onChange(async (value) => {
						this.plugin.settings.quickSwitcherHiddenFolders = value
						await this.plugin.saveSettings()
					}),
			)

		new Setting(containerEl)
			.setName('重命名时同步 frontmatter title')
			.setDesc('开启后，Markdown 文档重命名时会把 frontmatter 的 title 更新为新的文件名，不修改正文一级标题。')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncFrontmatterTitleOnRename)
					.onChange(async (value) => {
						this.plugin.settings.syncFrontmatterTitleOnRename = value
						await this.plugin.saveSettings()
					}),
			)

		new Setting(containerEl)
			.setName('修改文档时更新 updated 字段')
			.setDesc('开启后，Markdown 文档内容修改时会更新 frontmatter 的 updated 字段；若原时间距离当前时间两分钟内则跳过，避免重复触发。')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncUpdatedFieldOnModify)
					.onChange(async (value) => {
						this.plugin.settings.syncUpdatedFieldOnModify = value
						await this.plugin.saveSettings()
					}),
			)
	}
}
