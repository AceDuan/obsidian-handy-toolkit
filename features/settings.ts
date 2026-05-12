import { App, Plugin, PluginSettingTab, Setting } from 'obsidian'

// 插件设置：保存用户可控制的功能开关。
export type HandyToolkitSettings = {
	enableFirstLineIndent: boolean
}

// 插件设置：默认关闭首行缩进增强，避免安装后改变既有显示效果。
export const DEFAULT_SETTINGS: HandyToolkitSettings = {
	enableFirstLineIndent: false,
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
	}
}
