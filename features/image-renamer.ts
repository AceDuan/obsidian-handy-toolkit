import { Notice, Plugin, TFile, normalizePath } from 'obsidian'

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

// 图片重排功能：检查目标文件名是否会覆盖不在本次计划中的文件。
function assertImageRenameTargetsAvailable(plugin: Plugin, plan: ImageRenamePlanItem[]) {
	const oldPaths = new Set(plan.map((item) => item.oldPath))

	for (const item of plan) {
		const targetPath = normalizePath(item.newPath)
		const existing = plugin.app.vault.getAbstractFileByPath(targetPath)
		if (existing && !oldPaths.has(targetPath)) {
			throw new Error(`目标文件已存在：${targetPath}`)
		}
	}
}

// 图片重排功能：先统一改到临时文件名，再改到目标文件名，避免 001/002 互换冲突。
async function renameImagesInTwoPhases(plugin: Plugin, plan: ImageRenamePlanItem[]) {
	const tempItems: Array<ImageRenamePlanItem & { tempPath: string }> = []
	const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

	for (let index = 0; index < plan.length; index++) {
		const item = plan[index]
		const sourceFile = plugin.app.vault.getAbstractFileByPath(item.oldPath)
		if (!(sourceFile instanceof TFile)) {
			throw new Error(`找不到附件：${item.oldPath}`)
		}

		const folderPath = item.oldPath.includes('/') ? item.oldPath.slice(0, item.oldPath.lastIndexOf('/')) : ''
		const tempName = `.__image-renamer-${runId}-${index}.tmp`
		const tempPath = normalizePath(folderPath ? `${folderPath}/${tempName}` : tempName)
		await plugin.app.vault.rename(sourceFile, tempPath)
		tempItems.push({ ...item, tempPath })
	}

	for (const item of tempItems) {
		const tempFile = plugin.app.vault.getAbstractFileByPath(item.tempPath)
		if (!(tempFile instanceof TFile)) {
			throw new Error(`找不到临时附件：${item.tempPath}`)
		}

		await plugin.app.vault.rename(tempFile, normalizePath(item.newPath))
	}
}

// 图片重排功能：按当前笔记正文顺序重命名本地图片附件，并更新当前笔记链接。
async function renameCurrentNoteImagesByOrder(plugin: Plugin, noteFile: TFile) {
	const content = await plugin.app.vault.read(noteFile)
	const timestamp = formatImageRenameTimestamp(new Date())
	const files = plugin.app.vault.getFiles().map((file) => ({
		path: file.path,
		extension: file.extension,
	}))
	const plan = buildImageRenamePlan(content, files, timestamp).filter((item) => item.oldPath !== item.newPath)

	if (plan.length === 0) {
		new Notice('当前笔记没有可重命名的本地图片附件')
		return
	}

	assertImageRenameTargetsAvailable(plugin, plan)
	await renameImagesInTwoPhases(plugin, plan)
	await plugin.app.vault.modify(noteFile, rewriteImageLinks(content, plan))

	new Notice(`已按正文顺序重命名 ${plan.length} 张图片`)
}

// 图片重排功能：注册手动按正文顺序整理图片文件名的命令。
export function registerImageRenameCommand(plugin: Plugin) {
	plugin.addCommand({
		id: 'rename-current-note-images-by-order',
		name: '按正文顺序重命名当前笔记图片',
		checkCallback: (checking) => {
			const activeFile = plugin.app.workspace.getActiveFile()
			const canRun = activeFile instanceof TFile && activeFile.extension === 'md'

			if (checking) {
				return canRun
			}

			if (!canRun) {
				new Notice('请先打开一个 Markdown 笔记')
				return false
			}

			renameCurrentNoteImagesByOrder(plugin, activeFile).catch((error: Error) => {
				console.error(error)
				new Notice(`图片重命名失败：${error.message}`)
			})

			return true
		},
	})
}
