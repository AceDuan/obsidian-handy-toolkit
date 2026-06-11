import { Plugin } from 'obsidian'

import { updateFrontmatterFieldInFile } from '../utils/frontmatter-text-updater'

const FRESH_UPDATED_WINDOW_MS = 2 * 60 * 1000
const MAX_PENDING_EDITOR_SAVES = 3
const PENDING_EDITOR_SAVE_TTL_MS = 10 * 1000

type PendingEditorSave = {
	path: string
	at: number
}

type ModifiedFileLike = {
	extension: string
	path: string
}

type UpdatedFieldPlugin = Plugin & {
	settings: {
		syncUpdatedFieldOnModify: boolean
	}
}

function padDatePart(value: number) {
	return String(value).padStart(2, '0')
}

export function formatUpdatedTimestamp(date: Date) {
	return [
		date.getFullYear(),
		padDatePart(date.getMonth() + 1),
		padDatePart(date.getDate()),
	].join('-') + ` ${[
		padDatePart(date.getHours()),
		padDatePart(date.getMinutes()),
		padDatePart(date.getSeconds()),
	].join(':')}`
}

function parseUpdatedTimestamp(value: unknown) {
	if (value instanceof Date) {
		return value
	}

	if (typeof value !== 'string') {
		return null
	}

	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/)
	if (!match) {
		return null
	}

	const [, year, month, day, hour, minute, second] = match
	return new Date(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour),
		Number(minute),
		Number(second),
	)
}

export function isUpdatedTimestampFresh(value: unknown, now = new Date()) {
	const parsed = parseUpdatedTimestamp(value)
	if (!parsed) {
		return false
	}

	return Math.abs(now.getTime() - parsed.getTime()) <= FRESH_UPDATED_WINDOW_MS
}

export function shouldSyncUpdatedForModifiedFile(enabled: boolean, file: unknown): file is ModifiedFileLike {
	if (!enabled || !file || typeof file !== 'object') {
		return false
	}

	const record = file as Partial<ModifiedFileLike>
	return record.extension === 'md' && typeof record.path === 'string' && record.path.length > 0
}

export function rememberPendingEditorSave(
	pendingEditorSaves: PendingEditorSave[],
	path: string,
	at = Date.now(),
) {
	const existingIndex = pendingEditorSaves.findIndex((pending) => pending.path === path)
	if (existingIndex !== -1) {
		pendingEditorSaves.splice(existingIndex, 1)
	}

	pendingEditorSaves.push({ path, at })

	while (pendingEditorSaves.length > MAX_PENDING_EDITOR_SAVES) {
		pendingEditorSaves.shift()
	}
}

export function consumePendingEditorSave(
	pendingEditorSaves: PendingEditorSave[],
	path: string,
	now = Date.now(),
) {
	const pendingIndex = pendingEditorSaves.findIndex((pending) => pending.path === path)
	if (pendingIndex === -1) {
		return false
	}

	const [pending] = pendingEditorSaves.splice(pendingIndex, 1)
	return now - pending.at <= PENDING_EDITOR_SAVE_TTL_MS
}

export async function syncUpdatedFieldWithProcessFrontMatter(
	plugin: Pick<UpdatedFieldPlugin, 'app'>,
	file: ModifiedFileLike,
	now = new Date(),
) {
	let didUpdate = false

	await plugin.app.fileManager.processFrontMatter(file as Parameters<typeof plugin.app.fileManager.processFrontMatter>[0], (frontmatter) => {
		if (isUpdatedTimestampFresh(frontmatter.updated, now)) {
			return
		}

		frontmatter.updated = formatUpdatedTimestamp(now)
		didUpdate = true
	})

	return didUpdate
}

export async function syncUpdatedFieldForModifiedFile(
	plugin: Pick<UpdatedFieldPlugin, 'app'>,
	file: ModifiedFileLike,
	now = new Date(),
) {
	return updateFrontmatterFieldInFile(plugin.app.vault, file as Parameters<typeof updateFrontmatterFieldInFile>[1], {
		fieldName: 'updated',
		nextValue: formatUpdatedTimestamp(now),
		shouldUpdate: (currentValue) => !isUpdatedTimestampFresh(currentValue, now),
	})
}

// 文档更新时间同步：监听 Markdown 文件修改，按时间窗口更新 frontmatter updated，避免自触发循环。
export function registerUpdatedFieldOnModify(plugin: UpdatedFieldPlugin) {
	const pendingEditorSaves: PendingEditorSave[] = []

	plugin.registerEvent(
		plugin.app.workspace.on('quick-preview', (file) => {
			if (!shouldSyncUpdatedForModifiedFile(plugin.settings.syncUpdatedFieldOnModify, file)) {
				return
			}

			rememberPendingEditorSave(pendingEditorSaves, file.path)
		}),
	)

	plugin.registerEvent(
		plugin.app.vault.on('modify', (file) => {
			if (!shouldSyncUpdatedForModifiedFile(plugin.settings.syncUpdatedFieldOnModify, file)) {
				return
			}

			if (!consumePendingEditorSave(pendingEditorSaves, file.path)) {
				return
			}

			syncUpdatedFieldForModifiedFile(plugin, file).catch((error: Error) => {
				console.error('修改后同步 frontmatter updated 失败：', error)
			})
		}),
	)
}
