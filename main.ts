import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from 'obsidian'

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

	// 图片重排功能

	// 图片重排功能：检查目标文件名是否会覆盖不在本次计划中的文件。
	private assertImageRenameTargetsAvailable(plan: ImageRenamePlanItem[]) {
		const oldPaths = new Set(plan.map((item) => item.oldPath))

		for (const item of plan) {
			const targetPath = normalizePath(item.newPath)
			const existing = this.app.vault.getAbstractFileByPath(targetPath)
			if (existing && !oldPaths.has(targetPath)) {
				throw new Error(`目标文件已存在：${targetPath}`)
			}
		}
	}

	// 图片重排功能：先统一改到临时文件名，再改到目标文件名，避免 001/002 互换冲突。
	private async renameImagesInTwoPhases(plan: ImageRenamePlanItem[]) {
		const tempItems: Array<ImageRenamePlanItem & { tempPath: string }> = []
		const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

		for (let index = 0; index < plan.length; index++) {
			const item = plan[index]
			const sourceFile = this.app.vault.getAbstractFileByPath(item.oldPath)
			if (!(sourceFile instanceof TFile)) {
				throw new Error(`找不到附件：${item.oldPath}`)
			}

			const folderPath = item.oldPath.includes('/') ? item.oldPath.slice(0, item.oldPath.lastIndexOf('/')) : ''
			const tempName = `.__image-renamer-${runId}-${index}.tmp`
			const tempPath = normalizePath(folderPath ? `${folderPath}/${tempName}` : tempName)
			await this.app.vault.rename(sourceFile, tempPath)
			tempItems.push({ ...item, tempPath })
		}

		for (const item of tempItems) {
			const tempFile = this.app.vault.getAbstractFileByPath(item.tempPath)
			if (!(tempFile instanceof TFile)) {
				throw new Error(`找不到临时附件：${item.tempPath}`)
			}

			await this.app.vault.rename(tempFile, normalizePath(item.newPath))
		}
	}

	// 图片重排功能：按当前笔记正文顺序重命名本地图片附件，并更新当前笔记链接。
	private async renameCurrentNoteImagesByOrder(noteFile: TFile) {
		const content = await this.app.vault.read(noteFile)
		const timestamp = formatImageRenameTimestamp(new Date())
		const files = this.app.vault.getFiles().map((file) => ({
			path: file.path,
			extension: file.extension,
		}))
		const plan = buildImageRenamePlan(content, files, timestamp).filter((item) => item.oldPath !== item.newPath)

		if (plan.length === 0) {
			new Notice('当前笔记没有可重命名的本地图片附件')
			return
		}

		this.assertImageRenameTargetsAvailable(plan)
		await this.renameImagesInTwoPhases(plan)
		await this.app.vault.modify(noteFile, rewriteImageLinks(content, plan))

		new Notice(`已按正文顺序重命名 ${plan.length} 张图片`)
	}

	// 图片重排功能：注册手动按正文顺序整理图片文件名的命令。
	private registerImageRenameCommand() {
		this.addCommand({
			id: 'rename-current-note-images-by-order',
			name: '按正文顺序重命名当前笔记图片',
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile()
				const canRun = activeFile instanceof TFile && activeFile.extension === 'md'

				if (checking) {
					return canRun
				}

				if (!canRun) {
					new Notice('请先打开一个 Markdown 笔记')
					return false
				}

				this.renameCurrentNoteImagesByOrder(activeFile).catch((error: Error) => {
					console.error(error)
					new Notice(`图片重命名失败：${error.message}`)
				})

				return true
			},
		})
	}

	// 设置管理

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

		this.registerImageRenameCommand()

		this.addSettingTab(new CollapsePropertiesSettingTab(this.app, this))
	}

	// 插件卸载：清理运行时添加到 body 上的状态类名。
	onunload() {
		document.body.removeClass(INDENT_FEATURE_CLASS)
	}
}

// 图片重排功能：支持 Obsidian 图片 wikilink 和 Markdown 图片链接。
const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'])

type VaultImageFile = {
	path: string
	extension: string
}

type ImageEmbed = {
	index: number
	linkTarget: string
	normalizedTarget: string
}

type ImageRenamePlanItem = {
	oldPath: string
	newPath: string
	newLinkTarget: string
}

// 图片重排功能：解码并标准化链接目标，便于和 vault 文件路径比对。
function normalizeImageTarget(value: string) {
	try {
		value = decodeURIComponent(value)
	} catch {
		// 保留原值，避免因为少数非法转义导致整次重命名失败。
	}

	return value
		.replace(/^<|>$/g, '')
		.replace(/^\.?\//, '')
		.replace(/\\/g, '/')
}

// 图片重排功能：识别外部链接、块引用和同页锚点，这些都不应该被重命名。
function isExternalImageTarget(target: string) {
	return /^(?:[a-z][a-z0-9+.-]*:|#|\^)/i.test(target)
}

// 图片重排功能：只处理常见图片扩展名。
function isImagePath(path: string) {
	const extension = path.split('.').pop()?.toLowerCase() ?? ''
	return IMAGE_EXTENSIONS.has(extension)
}

// 图片重排功能：wikilink 的尺寸、别名和 heading 后缀不参与文件解析。
function stripWikilinkTarget(target: string) {
	return target.split('|')[0].split('#')[0]
}

// 图片重排功能：记录围栏代码块范围，避免把示例代码里的图片语法当成真实附件。
function getFencedCodeRanges(content: string) {
	const ranges: Array<{ start: number; end: number }> = []
	const fenceRegExp = /(^|\n)(```|~~~)[^\n]*(?:\n[\s\S]*?\n\2(?=\n|$)|[\s\S]*$)/g

	for (const match of content.matchAll(fenceRegExp)) {
		const start = (match.index ?? 0) + match[1].length
		ranges.push({
			start,
			end: start + match[0].length - match[1].length,
		})
	}

	return ranges
}

function isInsideRange(index: number, ranges: Array<{ start: number; end: number }>) {
	return ranges.some((range) => index >= range.start && index < range.end)
}

// 图片重排功能：按正文出现顺序解析本地图片链接。
function parseImageEmbeds(content: string) {
	const embeds: ImageEmbed[] = []
	const fencedCodeRanges = getFencedCodeRanges(content)
	const wikiRegExp = /!\[\[([^\]\n]+)\]\]/g
	const markdownRegExp = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g

	for (const match of content.matchAll(wikiRegExp)) {
		if (isInsideRange(match.index ?? 0, fencedCodeRanges)) {
			continue
		}

		const linkTarget = stripWikilinkTarget(match[1])
		if (isExternalImageTarget(linkTarget)) {
			continue
		}

		const normalizedTarget = normalizeImageTarget(linkTarget)
		if (!isImagePath(normalizedTarget)) {
			continue
		}

		embeds.push({ index: match.index ?? 0, linkTarget, normalizedTarget })
	}

	for (const match of content.matchAll(markdownRegExp)) {
		if (isInsideRange(match.index ?? 0, fencedCodeRanges)) {
			continue
		}

		const linkTarget = match[2]
		if (isExternalImageTarget(linkTarget)) {
			continue
		}

		const normalizedTarget = normalizeImageTarget(linkTarget)
		if (!isImagePath(normalizedTarget)) {
			continue
		}

		embeds.push({ index: match.index ?? 0, linkTarget, normalizedTarget })
	}

	return embeds.sort((a, b) => a.index - b.index)
}

function resolveImageFile(embed: ImageEmbed, files: VaultImageFile[]) {
	const byPath = files.find((file) => file.path === embed.normalizedTarget)
	if (byPath) {
		return byPath
	}

	const targetName = embed.normalizedTarget.split('/').pop()
	const matches = files.filter((file) => file.path.split('/').pop() === targetName)
	return matches.length === 1 ? matches[0] : null
}

// 图片重排功能：生成旧路径到新路径的重命名计划。
function buildImageRenamePlan(content: string, files: VaultImageFile[], timestamp: string) {
	const embeds = parseImageEmbeds(content)
	const seenPaths = new Set<string>()
	const plan: ImageRenamePlanItem[] = []

	for (const embed of embeds) {
		const file = resolveImageFile(embed, files)
		if (!file || seenPaths.has(file.path)) {
			continue
		}

		seenPaths.add(file.path)
		const sequenceNumber = String(plan.length + 1).padStart(3, '0')
		const folderPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
		const newName = `image-${timestamp}-${sequenceNumber}.${file.extension}`
		const newPath = folderPath ? `${folderPath}/${newName}` : newName

		plan.push({
			oldPath: file.path,
			newPath,
			newLinkTarget: newPath,
		})
	}

	return plan
}

// 图片重排功能：只重写图片链接目标，避免误伤普通文本或外部 URL。
function rewriteImageLinks(content: string, plan: ImageRenamePlanItem[]) {
	const fencedCodeRanges = getFencedCodeRanges(content)
	const findItem = (target: string) => {
		const normalizedTarget = normalizeImageTarget(stripWikilinkTarget(target))
		return plan.find((item) => {
			const oldFileName = item.oldPath.split('/').pop()
			return normalizedTarget === item.oldPath || normalizedTarget === oldFileName
		})
	}

	let nextContent = content.replace(/!\[\[([^\]\n]+)\]\]/g, (fullMatch: string, rawTarget: string, offset: number) => {
		if (isInsideRange(offset, fencedCodeRanges)) {
			return fullMatch
		}

		const item = findItem(rawTarget)
		if (!item) {
			return fullMatch
		}

		const separatorIndex = rawTarget.search(/[|#]/)
		const suffix = separatorIndex === -1 ? '' : rawTarget.slice(separatorIndex)
		return `![[${item.newLinkTarget}${suffix}]]`
	})

	nextContent = nextContent.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (fullMatch: string, altText: string, rawTarget: string, offset: number) => {
		if (isInsideRange(offset, fencedCodeRanges) || isExternalImageTarget(rawTarget)) {
			return fullMatch
		}

		const item = findItem(rawTarget)
		if (!item) {
			return fullMatch
		}

		return `![${altText}](${item.newLinkTarget})`
	})

	return nextContent
}

// 图片重排功能：生成和 Custom Attachment Location 默认一致的毫秒时间戳。
function formatImageRenameTimestamp(date: Date) {
	const pad = (value: number, length = 2) => String(value).padStart(length, '0')
	return [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
		pad(date.getHours()),
		pad(date.getMinutes()),
		pad(date.getSeconds()),
		pad(date.getMilliseconds(), 3),
	].join('')
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
