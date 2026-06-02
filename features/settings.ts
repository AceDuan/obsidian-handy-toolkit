import { App, Plugin, PluginSettingTab, Setting } from 'obsidian'

import {
	CustomAttachmentLocationVaultLike,
	getCustomAttachmentLocationStatus,
	getCustomAttachmentLocationStatusMessage,
	getCustomAttachmentLocationStatusTone,
} from '../utils/custom-attachment-location'

// 插件设置：保存用户可控制的功能开关。
export type HandyToolkitSettings = {
	enableFirstLineIndent: boolean
	quickSwitcherHiddenFolders: string
	syncFrontmatterTitleOnRename: boolean
	syncAssetFolderOnRename: boolean
	syncUpdatedFieldOnModify: boolean
}

// 插件设置：默认关闭首行缩进增强，避免安装后改变既有显示效果。
export const DEFAULT_SETTINGS: HandyToolkitSettings = {
	enableFirstLineIndent: false,
	quickSwitcherHiddenFolders: '',
	syncFrontmatterTitleOnRename: false,
	syncAssetFolderOnRename: false,
	syncUpdatedFieldOnModify: false,
}

type HandyToolkitSettingsPlugin = Plugin & {
	settings: HandyToolkitSettings
	saveSettings(): Promise<void>
}

export function shouldShowAssetFolderRenameSetting(settings: Pick<HandyToolkitSettings, 'syncFrontmatterTitleOnRename'>) {
	return settings.syncFrontmatterTitleOnRename
}

export function shouldShowAssetFolderRenameDependencyStatus(settings: Pick<HandyToolkitSettings, 'syncFrontmatterTitleOnRename' | 'syncAssetFolderOnRename'>) {
	return settings.syncFrontmatterTitleOnRename && settings.syncAssetFolderOnRename
}

export async function getAssetFolderRenameDependencyStatusText(
	vault: CustomAttachmentLocationVaultLike | null,
	settings: Pick<HandyToolkitSettings, 'syncAssetFolderOnRename'>,
) {
	if (!settings.syncAssetFolderOnRename) {
		return 'CAL插件未启用或配置不可用时不处理'
	}

	if (!vault) {
		return '无法读取 Custom Attachment Location 配置，此开关不会生效。'
	}

	return getCustomAttachmentLocationStatusMessage(await getCustomAttachmentLocationStatus(vault))
}

export async function getAssetFolderRenameDependencyStatusTone(
	vault: CustomAttachmentLocationVaultLike | null,
	settings: Pick<HandyToolkitSettings, 'syncAssetFolderOnRename'>,
) {
	if (!settings.syncAssetFolderOnRename) {
		return 'normal'
	}

	if (!vault) {
		return 'error'
	}

	return getCustomAttachmentLocationStatusTone(await getCustomAttachmentLocationStatus(vault))
}

function createAssetFolderRenameDesc(statusMessage: string, statusTone: 'normal' | 'success' | 'error') {
	const fragment = document.createDocumentFragment()
	fragment.appendText('开启后，Markdown 文档重命名时会按 Custom Attachment Location 的附件位置配置同步重命名附件文件夹。')
	fragment.createEl('br')

	const statusEl = fragment.createSpan({ text: statusMessage })
	if (statusTone !== 'normal') {
		statusEl.style.color = statusTone === 'success' ? 'var(--text-success)' : 'var(--text-error)'
	}

	return fragment
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
						this.display()
					}),
			)

		if (shouldShowAssetFolderRenameSetting(this.plugin.settings)) {
			const assetFolderSetting = new Setting(containerEl)
				.setName('重命名时同步同名附件文件夹')
				.setDesc(createAssetFolderRenameDesc('CAL插件未启用或配置不可用时不处理', 'normal'))
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.syncAssetFolderOnRename)
						.onChange(async (value) => {
							this.plugin.settings.syncAssetFolderOnRename = value
							await this.plugin.saveSettings()
							this.display()
						}),
				)

			if (shouldShowAssetFolderRenameDependencyStatus(this.plugin.settings)) {
				Promise.all([
					getAssetFolderRenameDependencyStatusText(this.plugin.app.vault, this.plugin.settings),
					getAssetFolderRenameDependencyStatusTone(this.plugin.app.vault, this.plugin.settings),
				]).then(([message, tone]) => {
					assetFolderSetting.setDesc(createAssetFolderRenameDesc(message, tone))
				}).catch(() => {
					assetFolderSetting.setDesc(createAssetFolderRenameDesc('无法读取 Custom Attachment Location 配置，此开关不会生效。', 'error'))
				})
			}
		}

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
