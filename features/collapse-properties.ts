import { App, getLanguage, Notice, Plugin, TFile } from 'obsidian'

export type FoldRange = {
	from: number
	to: number
}

export type FoldInfo = {
	folds: FoldRange[]
	lines: number
}

// 属性折叠功能：保留已有正文折叠，仅补充属性区域的特殊折叠标记。
export function mergeFrontmatterFold(existing: FoldInfo | null, currentLineCount: number): FoldInfo {
	const existingFolds = existing?.folds ?? []
	const hasPropertyFold = existingFolds.some((fold) => fold.from === 0 && fold.to === 0)

	return {
		folds: hasPropertyFold
			? [...existingFolds]
			: [{ from: 0, to: 0 }, ...existingFolds],
		lines: existing?.lines ?? currentLineCount,
	}
}

// 属性折叠功能：将使用到的 Obsidian 内部 API 限制在本模块内。
type FoldManager = {
	load(file: TFile): FoldInfo | null | Promise<FoldInfo | null>
	save(file: TFile, foldInfo: FoldInfo): void | Promise<void>
}

type InternalApp = App & {
	commands: {
		executeCommandById(commandId: string): boolean
	}
	foldManager?: Partial<FoldManager>
}

// 属性折叠功能：描述插件会访问的 Markdown 视图内部字段。
type InternalMarkdownView = {
	file?: { path: string }
	getViewType?(): string
	metadataEditor?: {
		collapsed?: boolean
		setCollapse?(collapsed: boolean, animate?: boolean): void
	}
}

// 属性折叠功能：根据 Obsidian 当前语言返回命令名称。
function getCollapseCommandName() {
	const language = getLanguage().toLowerCase()
	return language.startsWith('zh') ? '折叠当前文件的属性' : 'Collapse properties in current file'
}

// 属性折叠功能：根据 Obsidian 当前语言返回批量命令名称。
function getCollapseAllCommandName() {
	const language = getLanguage().toLowerCase()
	return language.startsWith('zh') ? '折叠所有笔记的属性' : 'Collapse properties in all notes'
}

// 属性折叠功能：折叠所有打开了同一文件的 Markdown 视图属性区域。
function collapseProperties(app: App, filePath: string | null) {
	if (!filePath) {
		return { handledAny: false, failedAny: false }
	}

	let handledAny = false
	let failedAny = false

	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view as InternalMarkdownView
		if (view.file?.path !== filePath) {
			continue
		}

		const metadataEditor = view.metadataEditor
		if (!metadataEditor?.setCollapse) {
			continue
		}

		try {
			metadataEditor.setCollapse(true, true)
			handledAny = true
		} catch {
			failedAny = true
		}
	}

	return { handledAny, failedAny }
}

// 属性折叠功能：处理当前活动文件，并在内部接口不可用时回退到 Obsidian 内置命令。
function collapseActiveFileProperties(app: App) {
	const filePath = app.workspace.getActiveFile()?.path ?? null
	const { handledAny } = collapseProperties(app, filePath)

	if (!handledAny) {
		const activeLeaf = app.workspace.activeLeaf
		const activeView = activeLeaf?.view as InternalMarkdownView | undefined
		if (activeView?.getViewType?.() !== 'markdown') {
			return
		}

		if (activeView.file?.path !== filePath) {
			return
		}

		;(app as InternalApp).commands.executeCommandById('editor:toggle-fold-properties')
	}
}

// 属性折叠功能：批量写入持久化标记，并同步所有已打开视图。
async function collapseAllFileProperties(app: App) {
	const foldManager = (app as InternalApp).foldManager
	if (typeof foldManager?.load !== 'function' || typeof foldManager.save !== 'function') {
		new Notice('无法折叠所有笔记的属性：当前 Obsidian 版本不支持折叠状态管理。')
		return
	}

	let collapsed = 0
	let skipped = 0
	let failed = 0

	for (const file of app.vault.getMarkdownFiles()) {
		if (!app.metadataCache.getFileCache(file)?.frontmatter) {
			skipped += 1
			continue
		}

		try {
			const content = await app.vault.cachedRead(file)
			const existing = await foldManager.load(file)
			const foldInfo = mergeFrontmatterFold(existing, content.split('\n').length)

			const { failedAny } = collapseProperties(app, file.path)
			await foldManager.save(file, foldInfo)
			if (failedAny) {
				failed += 1
			} else {
				collapsed += 1
			}
		} catch {
			failed += 1
		}
	}

	new Notice(`已折叠 ${collapsed} 篇，已跳过 ${skipped} 篇，失败 ${failed} 篇`)
}

// 属性折叠功能：注册折叠当前文件属性命令。
export function registerCollapsePropertiesCommand(plugin: Plugin) {
	plugin.addCommand({
		id: 'collapse-properties-in-current-file',
		name: getCollapseCommandName(),
		callback: () => collapseActiveFileProperties(plugin.app),
	})

	plugin.addCommand({
		id: 'collapse-properties-in-all-files',
		name: getCollapseAllCommandName(),
		callback: () => collapseAllFileProperties(plugin.app),
	})
}
