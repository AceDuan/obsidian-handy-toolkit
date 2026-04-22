import { App, MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian'

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

// 插件设置：保存用户可控制的功能开关。
type CollapsePropertiesSettings = {
	enableFirstLineIndent: boolean
}

// 插件设置：默认关闭首行缩进增强，避免安装后改变既有显示效果。
const DEFAULT_SETTINGS: CollapsePropertiesSettings = {
	enableFirstLineIndent: false,
}

// 首行缩进功能：开启后由插件给 body 添加此类名，CSS 只在该类名存在时生效。
const INDENT_FEATURE_CLASS = 'obsidian-handy-toolkit-indent-enabled'

// 首行缩进功能：迁移自 Blue Topaz Custom 的相关规则，并改为插件自己的作用域。
const INDENT_STYLE = `
body.${INDENT_FEATURE_CLASS} .workspace-leaf-content[data-type="markdown"] .markdown-source-view.mod-cm6 div.cm-line:not(:is(.hr,.HyperMD-header,.HyperMD-quote,.HyperMD-list-line,.HyperMD-codeblock)) {
	text-indent: 2em;
}

body.${INDENT_FEATURE_CLASS} .workspace-leaf-content[data-type="markdown"] .markdown-source-view.mod-cm6 div.cm-line:not(:is(.hr,.HyperMD-header,.HyperMD-quote,.HyperMD-list-line,.HyperMD-codeblock)) .cm-hmd-frontmatter:first-of-type {
	margin-left: -2em;
}

body.${INDENT_FEATURE_CLASS} .markdown-source-view.mod-cm6 div.has-banner.cm-line:not(.HyperMD-header) .cm-def.cm-hmd-frontmatter,
body.${INDENT_FEATURE_CLASS} .markdown-source-view.mod-cm6 div.has-banner.cm-line:not(.HyperMD-header) .collapse-indicator {
	margin-left: 0;
	left: -3em;
}

body.${INDENT_FEATURE_CLASS} .markdown-source-view.mod-cm6 .cm-content > .cm-line:first-child .cm-fold-indicator.is-collapsed .collapse-indicator {
	left: -2.8em !important;
	margin-left: 0 !important;
}

body.${INDENT_FEATURE_CLASS} .markdown-source-view.mod-cm6 .cm-content > .cm-line:first-child .cm-foldPlaceholder {
	margin-left: -1.5em !important;
}

body.${INDENT_FEATURE_CLASS} .markdown-source-view.mod-cm6 .cm-content > .cm-line:first-child .cm-fold-indicator:not(.is-collapsed) .collapse-indicator {
	left: -2.8em !important;
	margin-left: 0 !important;
}

body.${INDENT_FEATURE_CLASS} [data-type="markdown"] div.el-p:not(blockquote) > p {
	text-indent: 2em;
}

body.${INDENT_FEATURE_CLASS} [data-type="markdown"] div.el-p:not(blockquote) > p > br {
	content: ' ';
	white-space: pre;
	line-height: calc((var(--paragraph-spacing) + 0.3) * 1em);
	display: unset;
}

body.${INDENT_FEATURE_CLASS} [data-type="markdown"] div.el-p:not(blockquote) > p > br::after {
	content: '';
	display: inline-block;
	width: 2em;
}

body.${INDENT_FEATURE_CLASS} .markdown-rendered .el-p > p.br-indent-line,
body.${INDENT_FEATURE_CLASS} .markdown-preview-view .el-p > p.br-indent-line {
	margin: 0;
}

body.${INDENT_FEATURE_CLASS} .el-p:has(.br-indent-line) > p:first-of-type {
	margin-bottom: 0;
}
`

// 首行缩进功能：迁移自 Contextual Typography，用于把 <br> 分隔内容拆成独立段落。
function splitBrInParagraph(nodeEl: HTMLElement) {
	const p = nodeEl.querySelector('p')
	if (!p) {
		return
	}

	const brs = p.querySelectorAll('br')
	if (brs.length === 0) {
		return
	}

	const nodes = Array.from(p.childNodes)
	const segments: Node[][] = []
	let currentSegment: Node[] = []

	nodes.forEach((node) => {
		if (node.nodeName === 'BR') {
			if (currentSegment.length > 0) {
				segments.push(currentSegment)
				currentSegment = []
			}
		} else {
			currentSegment.push(node)
		}
	})

	if (currentSegment.length > 0) {
		segments.push(currentSegment)
	}

	if (segments.length <= 1) {
		return
	}

	p.innerHTML = ''
	segments[0].forEach((node) => {
		p.appendChild(node.cloneNode(true))
	})

	for (let i = 1; i < segments.length; i++) {
		const newP = document.createElement('p')
		newP.setAttribute('dir', 'auto')
		newP.className = 'br-indent-line'
		segments[i].forEach((node) => {
			newP.appendChild(node.cloneNode(true))
		})
		nodeEl.appendChild(newP)
	}
}

// 注册命令折叠属性，并在用户启用时接管首行缩进相关的渲染结构与样式。
export default class FoldPropertiesByDefault extends Plugin {
	settings!: CollapsePropertiesSettings

	// 属性折叠功能：根据 Obsidian 当前语言返回命令名称。
	private getCollapseCommandName() {
		const language = String(window.localStorage.getItem('language') ?? '').toLowerCase()
		return language.startsWith('zh') ? '折叠当前文件的属性' : 'Collapse properties in current file'
	}

	// 属性折叠功能：折叠所有打开了同一文件的 Markdown 视图属性区域。
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

	// 属性折叠功能：处理当前活动文件，并在内部接口不可用时回退到 Obsidian 内置命令。
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

	// 首行缩进功能：阅读模式渲染后处理段落结构，让 <br> 分隔的行也能按段落缩进。
	private processIndentParagraphs(nodeEl: HTMLElement) {
		if (!this.settings.enableFirstLineIndent) {
			return
		}

		if (
			nodeEl.dataset.tagName ||
			!nodeEl.hasChildNodes() ||
			nodeEl.firstChild?.nodeType === Node.TEXT_NODE
		) {
			return
		}

		const childEl = nodeEl.firstElementChild as HTMLElement | null
		if (!childEl?.tagName) {
			return
		}

		const tagName = childEl.tagName.toLowerCase()
		nodeEl.dataset.tagName = tagName
		nodeEl.addClass(`el-${tagName}`)

		if (tagName === 'p') {
			splitBrInParagraph(nodeEl)
		}
	}

	// 首行缩进功能：根据设置开关更新 body 类名，控制样式是否启用。
	private updateIndentFeatureState() {
		document.body.toggleClass(INDENT_FEATURE_CLASS, this.settings.enableFirstLineIndent)
	}

	// 首行缩进功能：设置变化后刷新 Markdown 视图，使阅读模式的拆段逻辑重新执行。
	private refreshMarkdownViews() {
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view as MarkdownView
			view.previewMode?.rerender(true)
			view.editor?.refresh()
		}
	}

	// 首行缩进功能：把迁移后的 CSS 注入到当前 Obsidian 窗口。
	private injectIndentStyle() {
		const styleEl = document.createElement('style')
		styleEl.id = 'obsidian-handy-toolkit-indent-style'
		styleEl.textContent = INDENT_STYLE
		document.head.appendChild(styleEl)
		this.register(() => styleEl.remove())
	}

	// 设置管理：读取插件设置，并与默认值合并。
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	// 设置管理：保存插件设置，并刷新首行缩进功能状态。
	async saveSettings() {
		await this.saveData(this.settings)
		this.updateIndentFeatureState()
		this.refreshMarkdownViews()
	}

	// 插件入口：注册样式、渲染处理器、命令和设置页。
	async onload() {
		await this.loadSettings()

		this.injectIndentStyle()
		this.updateIndentFeatureState()

		this.registerMarkdownPostProcessor((el) => this.processIndentParagraphs(el))

		this.addCommand({
			id: 'collapse-properties-in-current-file',
			name: this.getCollapseCommandName(),
			callback: () => this.collapseActiveFileProperties(),
		})

		this.addSettingTab(new CollapsePropertiesSettingTab(this.app, this))
	}

	// 插件卸载：清理运行时添加到 body 上的状态类名。
	onunload() {
		document.body.removeClass(INDENT_FEATURE_CLASS)
	}
}

// 设置页：提供用户可控制的插件开关。
class CollapsePropertiesSettingTab extends PluginSettingTab {
	plugin: FoldPropertiesByDefault

	// 设置页：保存插件实例，便于读写配置。
	constructor(app: App, plugin: FoldPropertiesByDefault) {
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
