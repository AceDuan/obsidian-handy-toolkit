import { App, Plugin } from 'obsidian'

// 属性折叠功能：补充 Obsidian 内部命令接口类型，便于调用内置属性折叠命令。
declare module 'obsidian' {
	interface App {
		commands: {
			executeCommandById(commandId: string): boolean
		}
	}
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
	const language = String(window.localStorage.getItem('language') ?? '').toLowerCase()
	return language.startsWith('zh') ? '折叠当前文件的属性' : 'Collapse properties in current file'
}

// 属性折叠功能：折叠所有打开了同一文件的 Markdown 视图属性区域。
function collapseProperties(app: App, filePath: string | null) {
	if (!filePath) {
		return false
	}

	let collapsedAny = false

	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view as InternalMarkdownView
		if (view.file?.path !== filePath) {
			continue
		}

		const metadataEditor = view.metadataEditor
		if (!metadataEditor?.setCollapse || metadataEditor.collapsed === true) {
			continue
		}

		metadataEditor.setCollapse(true, true)
		collapsedAny = true
	}

	return collapsedAny
}

// 属性折叠功能：处理当前活动文件，并在内部接口不可用时回退到 Obsidian 内置命令。
function collapseActiveFileProperties(app: App) {
	const filePath = app.workspace.getActiveFile()?.path ?? null
	const collapsedAny = collapseProperties(app, filePath)

	if (!collapsedAny) {
		const activeLeaf = app.workspace.activeLeaf
		const activeView = activeLeaf?.view as InternalMarkdownView | undefined
		if (activeView?.getViewType?.() !== 'markdown') {
			return
		}

		if (activeView.file?.path !== filePath) {
			return
		}

		app.commands.executeCommandById('editor:toggle-fold-properties')
	}
}

// 属性折叠功能：注册折叠当前文件属性命令。
export function registerCollapsePropertiesCommand(plugin: Plugin) {
	plugin.addCommand({
		id: 'collapse-properties-in-current-file',
		name: getCollapseCommandName(),
		callback: () => collapseActiveFileProperties(plugin.app),
	})
}
