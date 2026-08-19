import { App, Plugin, PluginSettingTab } from 'obsidian'
import type { SettingDefinitionItem } from 'obsidian'

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

// 设置管理：把插件数据存储的未知 JSON 收敛为强类型设置。
export function mergeStoredSettings(defaults: HandyToolkitSettings, stored: unknown): HandyToolkitSettings {
	const merged = { ...defaults }

	if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
		return merged
	}

	const record = stored as Record<string, unknown>
	if (typeof record.enableFirstLineIndent === 'boolean') {
		merged.enableFirstLineIndent = record.enableFirstLineIndent
	}
	if (typeof record.quickSwitcherHiddenFolders === 'string') {
		merged.quickSwitcherHiddenFolders = record.quickSwitcherHiddenFolders
	}
	if (typeof record.syncFrontmatterTitleOnRename === 'boolean') {
		merged.syncFrontmatterTitleOnRename = record.syncFrontmatterTitleOnRename
	}
	if (typeof record.syncAssetFolderOnRename === 'boolean') {
		merged.syncAssetFolderOnRename = record.syncAssetFolderOnRename
	}
	if (typeof record.syncUpdatedFieldOnModify === 'boolean') {
		merged.syncUpdatedFieldOnModify = record.syncUpdatedFieldOnModify
	}

	return merged
}

type HandyToolkitSettingsPlugin = Plugin & {
	settings: HandyToolkitSettings
	saveSettings(): Promise<void>
}

const ASSET_FOLDER_RENAME_DESCRIPTION = '开启后，Markdown 文档重命名时会按 Custom Attachment Location 的附件位置配置同步重命名附件文件夹。'

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

// 设置页：提供用户可控制的插件设置项。
export class HandyToolkitSettingTab extends PluginSettingTab {
	plugin: HandyToolkitSettingsPlugin

	// 设置页：保存插件实例，便于读写配置。
	constructor(app: App, plugin: HandyToolkitSettingsPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	// 设置页：声明设置项，供 Obsidian 渲染和设置搜索索引使用。
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: '启用首行缩进',
				desc: '开启后自动应用源码模式首行缩进，并处理阅读模式中由 <br> 分隔的段落缩进。',
				control: { type: 'toggle', key: 'enableFirstLineIndent' },
			},
			{
				name: '快速切换隐藏文件夹',
				desc: '使用逗号分隔库内文件夹路径；这些文件夹下的文件不会出现在快速切换结果中。',
				control: {
					type: 'textarea',
					key: 'quickSwitcherHiddenFolders',
					placeholder: 'Archive, Templates/private',
				},
			},
			{
				name: '重命名时同步 frontmatter title',
				desc: '开启后，Markdown 文档重命名时会把 frontmatter 的 title 更新为新的文件名，不修改正文一级标题。',
				control: { type: 'toggle', key: 'syncFrontmatterTitleOnRename' },
			},
			{
				name: '重命名时同步同名附件文件夹',
				desc: ASSET_FOLDER_RENAME_DESCRIPTION,
				control: { type: 'toggle', key: 'syncAssetFolderOnRename' },
				visible: () => shouldShowAssetFolderRenameSetting(this.plugin.settings),
			},
			{
				name: '附件位置状态',
				desc: '正在检测 Custom Attachment Location 配置。',
				searchable: false,
				visible: () => shouldShowAssetFolderRenameDependencyStatus(this.plugin.settings),
				render: (setting) => {
					let active = true

					getAssetFolderRenameDependencyStatusText(this.plugin.app.vault, this.plugin.settings)
						.then((message) => {
							if (active) {
								setting.setDesc(`${ASSET_FOLDER_RENAME_DESCRIPTION}\n${message}`)
							}
						})
						.catch(() => {
							if (active) {
								setting.setDesc(`${ASSET_FOLDER_RENAME_DESCRIPTION}\n无法读取 Custom Attachment Location 配置，此开关不会生效。`)
							}
						})

					return () => {
						active = false
					}
				},
			},
			{
				name: '修改文档时更新 updated 字段',
				desc: '开启后，Markdown 文档内容修改时会更新 frontmatter 的 updated 字段；若原时间距离当前时间两分钟内则跳过，避免重复触发。',
				control: { type: 'toggle', key: 'syncUpdatedFieldOnModify' },
			},
		]
	}

	// 设置页：为声明式控件提供当前值。
	getControlValue(key: string): boolean | string | undefined {
		switch (key) {
			case 'enableFirstLineIndent':
			case 'syncFrontmatterTitleOnRename':
			case 'syncAssetFolderOnRename':
			case 'syncUpdatedFieldOnModify':
			case 'quickSwitcherHiddenFolders':
				return this.plugin.settings[key]
			default:
				return undefined
		}
	}

	// 设置页：按设置键类型写入，并在保存后刷新依赖项。
	async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case 'quickSwitcherHiddenFolders':
				if (typeof value !== 'string') return
				this.plugin.settings.quickSwitcherHiddenFolders = value
				break
			case 'enableFirstLineIndent':
			case 'syncFrontmatterTitleOnRename':
			case 'syncAssetFolderOnRename':
			case 'syncUpdatedFieldOnModify':
				if (typeof value !== 'boolean') return
				this.plugin.settings[key] = value
				break
			default:
				return
		}

		await this.plugin.saveSettings()
		this.update()
	}
}
