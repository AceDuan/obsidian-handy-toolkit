import { Plugin } from 'obsidian'

declare module 'obsidian' {
	interface App {
		commands: {
			executeCommandById(commandId: string): boolean
		}
	}
}

type InternalMarkdownView = {
	file?: { path: string }
	getViewType?(): string
	metadataEditor?: {
		collapsed?: boolean
		setCollapse?(collapsed: boolean, animate?: boolean): void
	}
}

// 注册一个命令，用于折叠当前笔记在所有已打开 Markdown 视图中的属性区域。
export default class FoldPropertiesByDefault extends Plugin {
	private getCollapseCommandName() {
		const language = String(window.localStorage.getItem('language') ?? '').toLowerCase()
		return language.startsWith('zh') ? '折叠当前文件的属性' : 'Collapse properties in current file'
	}

	private collapseProperties(filePath: string | null) {
		if (!filePath) {
			return false
		}

		let collapsedAny = false

		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
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

	private collapseActiveFileProperties() {
		const filePath = this.app.workspace.getActiveFile()?.path ?? null
		const collapsedAny = this.collapseProperties(filePath)

		if (!collapsedAny) {
			const activeLeaf = this.app.workspace.activeLeaf
			const activeView = activeLeaf?.view as InternalMarkdownView | undefined
			if (activeView?.getViewType?.() !== 'markdown') {
				return
			}

			if (activeView.file?.path !== filePath) {
				return
			}

			this.app.commands.executeCommandById('editor:toggle-fold-properties')
		}
	}

	async onload() {
		this.addCommand({
			id: 'collapse-properties-in-current-file',
			name: this.getCollapseCommandName(),
			callback: () => this.collapseActiveFileProperties(),
		})
	}
}
