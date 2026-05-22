import { Plugin } from 'obsidian'

type RenamedFileLike = {
	basename: string
	extension: string
}

type TitleSyncPlugin = Plugin & {
	settings: {
		syncFrontmatterTitleOnRename: boolean
	}
}

export function shouldSyncTitleForRenamedFile(enabled: boolean, file: unknown): file is RenamedFileLike {
	if (!enabled || !file || typeof file !== 'object') {
		return false
	}

	const record = file as Partial<RenamedFileLike>
	return record.extension === 'md' && typeof record.basename === 'string' && record.basename.length > 0
}

export async function syncFrontmatterTitleForRenamedFile(plugin: Pick<TitleSyncPlugin, 'app'>, file: RenamedFileLike) {
	await plugin.app.fileManager.processFrontMatter(file as Parameters<typeof plugin.app.fileManager.processFrontMatter>[0], (frontmatter) => {
		frontmatter.title = file.basename
	})
}

// 文档标题同步：监听 Markdown 文件重命名，只同步 frontmatter title，不修改正文一级标题。
export function registerTitleSyncOnRename(plugin: TitleSyncPlugin) {
	plugin.registerEvent(
		plugin.app.vault.on('rename', (file) => {
			if (!shouldSyncTitleForRenamedFile(plugin.settings.syncFrontmatterTitleOnRename, file)) {
				return
			}

			syncFrontmatterTitleForRenamedFile(plugin, file).catch((error: Error) => {
				console.error('重命名后同步 frontmatter title 失败：', error)
			})
		}),
	)
}
