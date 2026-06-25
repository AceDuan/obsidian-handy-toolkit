import { App, MarkdownView, Plugin } from 'obsidian'

// 首行缩进功能：开启后由插件给 body 添加此类名，CSS 只在该类名存在时生效。
export const INDENT_FEATURE_CLASS = 'obsidian-handy-toolkit-indent-enabled'

// 首行缩进功能：迁移自 Blue Topaz Custom 的相关规则，并改为插件自己的作用域。
const INDENT_STYLE = `
body.${INDENT_FEATURE_CLASS} .workspace-leaf-content[data-type="markdown"] .markdown-source-view.mod-cm6 div.cm-line:not(:is(.hr,.HyperMD-header,.HyperMD-quote,.HyperMD-list-line,.HyperMD-codeblock)):not(:has(.cm-hmd-frontmatter)) {
	text-indent: 2em;
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

// 首行缩进功能：提供注入样式，便于验证选择器不会覆盖 frontmatter。
export function getIndentStyle() {
	return INDENT_STYLE
}

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

// 首行缩进功能：阅读模式渲染后处理段落结构，让 <br> 分隔的行也能按段落缩进。
export function processIndentParagraphs(nodeEl: HTMLElement, enabled: boolean) {
	if (!enabled) {
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
export function updateIndentFeatureState(enabled: boolean) {
	document.body.toggleClass(INDENT_FEATURE_CLASS, enabled)
}

// 首行缩进功能：设置变化后刷新 Markdown 视图，使阅读模式的拆段逻辑重新执行。
export function refreshMarkdownViews(app: App) {
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		const view = leaf.view as MarkdownView
		view.previewMode?.rerender(true)
		view.editor?.refresh()
	}
}

// 首行缩进功能：把迁移后的 CSS 注入到当前 Obsidian 窗口。
export function injectIndentStyle(plugin: Plugin) {
	const styleEl = document.createElement('style')
	styleEl.id = 'obsidian-handy-toolkit-indent-style'
	styleEl.textContent = getIndentStyle()
	document.head.appendChild(styleEl)
	plugin.register(() => styleEl.remove())
}

// 首行缩进功能：清理运行时添加到 body 上的状态类名。
export function cleanupIndentFeatureState() {
	document.body.removeClass(INDENT_FEATURE_CLASS)
}
