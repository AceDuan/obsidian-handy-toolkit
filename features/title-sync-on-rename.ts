import { Notice, Plugin, normalizePath } from 'obsidian'

import {
	CustomAttachmentLocationVaultLike,
	getCustomAttachmentLocationStatus,
	renderCustomAttachmentLocationTemplate,
} from '../utils/custom-attachment-location'
import { updateFrontmatterFieldInFile } from '../utils/frontmatter-text-updater'

type RenamedFileLike = {
	basename: string
	extension: string
	path?: string
}

type VaultImageFileLike = {
	path: string
	extension: string
}

type RenameableVaultLike = CustomAttachmentLocationVaultLike & {
	read(file: RenamedFileLike): Promise<string>
	getFiles(): VaultImageFileLike[]
	getAbstractFileByPath(path: string): unknown
}

type RenameableFileManagerLike = {
	renameFile(file: unknown, newPath: string): Promise<void>
}

type TitleSyncPlugin = Plugin & {
	settings: {
		syncFrontmatterTitleOnRename: boolean
		syncAssetFolderOnRename: boolean
	}
}

type RenameHandlingPlugin = Pick<TitleSyncPlugin, 'app'> & {
	settings: Pick<TitleSyncPlugin['settings'], 'syncAssetFolderOnRename'>
}

export function shouldSyncTitleForRenamedFile(enabled: boolean, file: unknown): file is RenamedFileLike {
	if (!enabled || !file || typeof file !== 'object') {
		return false
	}

	const record = file as Partial<RenamedFileLike>
	return record.extension === 'md' && typeof record.basename === 'string' && record.basename.length > 0
}

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'])

function getBasenameFromMarkdownPath(path: string) {
	const filename = path.split('/').pop() ?? path
	return filename.toLowerCase().endsWith('.md') ? filename.slice(0, -3) : filename
}

function normalizeImageTarget(value: string) {
	try {
		value = decodeURIComponent(value)
	} catch {
		// 保留原始目标，避免少数非法转义导致后续检查中断。
	}

	return normalizePath(value.replace(/^<|>$/g, '').replace(/^\.?\//, '').replace(/\\/g, '/'))
}

function stripWikilinkTarget(target: string) {
	return target.split('|')[0].split('#')[0]
}

function isExternalImageTarget(target: string) {
	return /^(?:[a-z][a-z0-9+.-]*:|#|\^)/i.test(target)
}

function isImagePath(path: string) {
	const extension = path.split('.').pop()?.toLowerCase() ?? ''
	return IMAGE_EXTENSIONS.has(extension)
}

function resolveImageFilePath(target: string, files: VaultImageFileLike[]) {
	const normalizedTarget = normalizeImageTarget(target)
	const byPath = files.find((file) => file.path === normalizedTarget)
	if (byPath) {
		return byPath.path
	}

	const targetName = normalizedTarget.split('/').pop()
	const matches = files.filter((file) => file.path.split('/').pop() === targetName)
	return matches.length === 1 ? matches[0].path : null
}

function getNoteImageAttachmentPaths(content: string, files: VaultImageFileLike[]) {
	const paths = new Set<string>()
	const addTarget = (target: string) => {
		if (isExternalImageTarget(target)) {
			return
		}

		const normalizedTarget = normalizeImageTarget(target)
		if (!isImagePath(normalizedTarget)) {
			return
		}

		const resolvedPath = resolveImageFilePath(normalizedTarget, files)
		if (resolvedPath) {
			paths.add(resolvedPath)
		}
	}

	for (const match of content.matchAll(/!\[\[([^\]\n]+)\]\]/g)) {
		addTarget(stripWikilinkTarget(match[1]))
	}

	for (const match of content.matchAll(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g)) {
		addTarget(match[2])
	}

	return [...paths]
}

function formatOutsideAttachmentNotice(oldFolderPath: string, outsidePaths: string[]) {
	const visiblePaths = outsidePaths.slice(0, 5).join('、')
	const suffix = outsidePaths.length > 5 ? ` 等 ${outsidePaths.length} 个附件` : ''
	return `当前笔记有图片附件不在 ${oldFolderPath} 下，请手动处理附件目录：${visiblePaths}${suffix}`
}

async function resolveAttachmentFolderRenamePlan(vault: RenameableVaultLike, file: RenamedFileLike, oldPath: string) {
	const customAttachmentLocationStatus = await getCustomAttachmentLocationStatus(vault)
	if (customAttachmentLocationStatus.status !== 'ready') {
		return null
	}

	const oldBasename = getBasenameFromMarkdownPath(oldPath)
	return {
		oldFolderPath: renderCustomAttachmentLocationTemplate(customAttachmentLocationStatus.template, oldBasename),
		newFolderPath: renderCustomAttachmentLocationTemplate(customAttachmentLocationStatus.template, file.basename),
	}
}

export async function syncAssetFolderForRenamedNote(
	plugin: { app: { fileManager: RenameableFileManagerLike; vault: RenameableVaultLike } },
	file: RenamedFileLike,
	oldPath: string,
	showNotice: (message: string) => void = (message) => new Notice(message),
) {
	const folderRenamePlan = await resolveAttachmentFolderRenamePlan(plugin.app.vault, file, oldPath)
	if (!folderRenamePlan) {
		return
	}

	const { oldFolderPath, newFolderPath } = folderRenamePlan
	const content = await plugin.app.vault.read(file)
	const attachmentPaths = getNoteImageAttachmentPaths(content, plugin.app.vault.getFiles())
	const outsidePaths = attachmentPaths.filter((path) => !path.startsWith(`${oldFolderPath}/`))

	if (outsidePaths.length > 0) {
		showNotice(formatOutsideAttachmentNotice(oldFolderPath, outsidePaths))
		return
	}

	const oldFolder = plugin.app.vault.getAbstractFileByPath(oldFolderPath)
	if (!oldFolder || oldFolderPath === newFolderPath) {
		return
	}

	if (plugin.app.vault.getAbstractFileByPath(newFolderPath)) {
		showNotice(`附件目录已存在，未自动重命名：${newFolderPath}`)
		return
	}

	await plugin.app.fileManager.renameFile(oldFolder, newFolderPath)
}

export async function syncFrontmatterTitleWithProcessFrontMatter(plugin: Pick<TitleSyncPlugin, 'app'>, file: RenamedFileLike) {
	await plugin.app.fileManager.processFrontMatter(file as Parameters<typeof plugin.app.fileManager.processFrontMatter>[0], (frontmatter) => {
		frontmatter.title = file.basename
	})
}

export async function syncFrontmatterTitleForRenamedFile(plugin: Pick<TitleSyncPlugin, 'app'>, file: RenamedFileLike) {
	return updateFrontmatterFieldInFile(plugin.app.vault, file as Parameters<typeof updateFrontmatterFieldInFile>[1], {
		fieldName: 'title',
		nextValue: file.basename,
	})
}

export async function syncRenamedMarkdownFile(plugin: RenameHandlingPlugin, file: RenamedFileLike, oldPath: string) {
	await syncFrontmatterTitleForRenamedFile(plugin, file)

	if (plugin.settings.syncAssetFolderOnRename) {
		await syncAssetFolderForRenamedNote(plugin, file, oldPath)
	}
}

// 文档标题同步：监听 Markdown 文件重命名，只同步 frontmatter title，不修改正文一级标题。
export function registerTitleSyncOnRename(plugin: TitleSyncPlugin) {
	plugin.registerEvent(
		plugin.app.vault.on('rename', (file, oldPath) => {
			if (!shouldSyncTitleForRenamedFile(plugin.settings.syncFrontmatterTitleOnRename, file)) {
				return
			}

			syncRenamedMarkdownFile(plugin, file, oldPath).catch((error: Error) => {
				console.error('重命名后同步文档元数据失败：', error)
				new Notice(`重命名后同步失败：${error.message}`)
			})
		}),
	)
}
