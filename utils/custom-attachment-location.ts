import { normalizePath } from 'obsidian'

export const CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID = 'obsidian-custom-attachment-location'
const NOTE_FILENAME_TOKEN_REGEXP = /\$\{notefilename\}/ig

export type CustomAttachmentLocationVaultLike = {
	configDir?: string
	adapter?: {
		exists?(path: string): Promise<boolean>
		read(path: string): Promise<string>
	}
}

export type CustomAttachmentLocationStatus =
	| { status: 'ready'; template: string }
	| { status: 'missing' }
	| { status: 'disabled' }
	| { status: 'unreadable' }
	| { status: 'unsupported-template'; template: string }

async function readJsonFromVaultAdapter(vault: CustomAttachmentLocationVaultLike, path: string) {
	if (!vault.adapter) {
		return null
	}

	try {
		return JSON.parse(await vault.adapter.read(normalizePath(path)))
	} catch {
		return null
	}
}

function hasNoteFilenameToken(template: string) {
	NOTE_FILENAME_TOKEN_REGEXP.lastIndex = 0
	return NOTE_FILENAME_TOKEN_REGEXP.test(template)
}

export function renderCustomAttachmentLocationTemplate(template: string, noteBasename: string) {
	NOTE_FILENAME_TOKEN_REGEXP.lastIndex = 0
	return normalizePath(template.replace(NOTE_FILENAME_TOKEN_REGEXP, noteBasename))
}

export async function getCustomAttachmentLocationStatus(vault: CustomAttachmentLocationVaultLike): Promise<CustomAttachmentLocationStatus> {
	const configDir = vault.configDir ?? '.obsidian'
	const enabledPlugins = await readJsonFromVaultAdapter(vault, `${configDir}/community-plugins.json`)

	if (!Array.isArray(enabledPlugins)) {
		return { status: 'unreadable' }
	}

	if (!enabledPlugins.includes(CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID)) {
		const manifestPath = `${configDir}/plugins/${CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID}/manifest.json`
		if (vault.adapter?.exists) {
			try {
				return await vault.adapter.exists(normalizePath(manifestPath)) ? { status: 'disabled' } : { status: 'missing' }
			} catch {
				return { status: 'disabled' }
			}
		}

		return { status: 'disabled' }
	}

	const settings = await readJsonFromVaultAdapter(vault, `${configDir}/plugins/${CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID}/data.json`)
	const template = typeof settings?.attachmentFolderPath === 'string' ? settings.attachmentFolderPath : ''
	if (!template) {
		return { status: 'unreadable' }
	}

	return hasNoteFilenameToken(template)
		? { status: 'ready', template }
		: { status: 'unsupported-template', template }
}

export function getCustomAttachmentLocationStatusMessage(status: CustomAttachmentLocationStatus) {
	switch (status.status) {
		case 'ready':
			return `当前附件位置：${status.template}`
		case 'missing':
			return 'Custom Attachment Location 未安装，此开关不会生效。'
		case 'disabled':
			return 'Custom Attachment Location 未启用，此开关不会生效。'
		case 'unreadable':
			return '无法读取 Custom Attachment Location 配置，此开关不会生效。'
		case 'unsupported-template':
			return '附件位置未包含笔记名变量，此开关不会生效。'
	}
}

export function getCustomAttachmentLocationStatusTone(status: CustomAttachmentLocationStatus) {
	return status.status === 'ready' ? 'success' : 'error'
}
