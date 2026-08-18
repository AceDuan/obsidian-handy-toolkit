import { Notice, Plugin, TFile, parseYaml } from 'obsidian'

const PERLITE_PUBLISH_FIELD = 'perlite_publish'
const FRONTMATTER_BOUNDARY = '---'

export type YamlParser = (yaml: string) => unknown

export type PerlitePublishToggleResult = {
	status:
		| 'published'
		| 'unpublished'
		| 'missing-frontmatter'
		| 'unclosed-frontmatter'
		| 'invalid-frontmatter'
		| 'unsafe-field'
	content: string
}

function getLineEnding(content: string) {
	return content.includes('\r\n') ? '\r\n' : '\n'
}

function findFrontmatterEnd(lines: string[]) {
	for (let index = 1; index < lines.length; index += 1) {
		if (lines[index] === FRONTMATTER_BOUNDARY) return index
	}
	return -1
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getCommentStart(rawValue: string, searchStart: number) {
	for (let index = searchStart; index < rawValue.length; index += 1) {
		if (rawValue[index] !== '#') continue
		if (index > searchStart && /\s/.test(rawValue[index - 1])) return index
	}
	return -1
}

function getCommentSuffix(rawValue: string): string | null {
	const valueStart = rawValue.search(/\S/)
	if (valueStart === -1) return ''

	const quote = rawValue[valueStart]
	let valueEnd = valueStart
	if (quote === "'") {
		for (let index = valueStart + 1; index < rawValue.length; index += 1) {
			if (rawValue[index] !== "'") continue
			if (rawValue[index + 1] === "'") {
				index += 1
				continue
			}
			valueEnd = index + 1
			break
		}
	} else if (quote === '"') {
		for (let index = valueStart + 1; index < rawValue.length; index += 1) {
			if (rawValue[index] === '\\') {
				index += 1
				continue
			}
			if (rawValue[index] === '"') {
				valueEnd = index + 1
				break
			}
		}
	}

	const commentStart = getCommentStart(rawValue, valueEnd)
	if (commentStart === -1) return ''

	let suffixStart = commentStart
	while (suffixStart > valueEnd && /[ \t]/.test(rawValue[suffixStart - 1])) suffixStart -= 1
	if ((quote === "'" || quote === '"') && rawValue.slice(valueEnd, suffixStart).trim() !== '') return null
	return rawValue.slice(suffixStart)
}

function getPublishedLine(match: RegExpMatchArray) {
	const commentSuffix = getCommentSuffix(match[3])
	if (commentSuffix === null) return null

	if (match[3].startsWith('#')) {
		const whitespace = match[2].match(/[ \t]*$/)?.[0] ?? ''
		const valueSpacingLength = Math.ceil(whitespace.length / 2)
		const separator = match[2].slice(0, -whitespace.length) + whitespace.slice(0, valueSpacingLength)
		const commentSpacing = whitespace.slice(valueSpacingLength)
		return `${match[1]}${separator}true${commentSpacing}${match[3]}`
	}

	return `${match[1]}${match[2]}true${commentSuffix}`
}

function parseFrontmatter(yaml: string, yamlParser: YamlParser) {
	try {
		const parsed = yamlParser(yaml)
		if (parsed == null) return { ok: true as const, value: {} }
		if (!isRecord(parsed)) return { ok: false as const }
		return { ok: true as const, value: parsed }
	} catch {
		return { ok: false as const }
	}
}

function isCandidateSafe(
	lines: string[],
	frontmatterEnd: number,
	lineEnding: string,
	yamlParser: YamlParser,
	expectedPublished: boolean,
) {
	const parsed = parseFrontmatter(lines.slice(1, frontmatterEnd).join(lineEnding), yamlParser)
	if (!parsed.ok) return false
	return expectedPublished
		? parsed.value[PERLITE_PUBLISH_FIELD] === true
		: !Object.prototype.hasOwnProperty.call(parsed.value, PERLITE_PUBLISH_FIELD)
}

export function togglePerlitePublishText(
	content: string,
	yamlParser: YamlParser = parseYaml,
): PerlitePublishToggleResult {
	const lineEnding = getLineEnding(content)
	const lines = content.split(lineEnding)
	if (lines[0] !== FRONTMATTER_BOUNDARY) return { status: 'missing-frontmatter', content }

	const frontmatterEnd = findFrontmatterEnd(lines)
	if (frontmatterEnd === -1) return { status: 'unclosed-frontmatter', content }

	const parsed = parseFrontmatter(lines.slice(1, frontmatterEnd).join(lineEnding), yamlParser)
	if (!parsed.ok) return { status: 'invalid-frontmatter', content }

	const fieldPattern = /^(perlite_publish)(\s*:\s*)(.*)$/
	const matches: Array<{ index: number; match: RegExpMatchArray }> = []
	for (let index = 1; index < frontmatterEnd; index += 1) {
		const match = lines[index].match(fieldPattern)
		if (match) matches.push({ index, match })
	}
	if (matches.length > 1) return { status: 'unsafe-field', content }

	const hasParsedField = Object.prototype.hasOwnProperty.call(parsed.value, PERLITE_PUBLISH_FIELD)
	if (hasParsedField !== (matches.length === 1)) return { status: 'unsafe-field', content }

	const nextLines = [...lines]
	let nextFrontmatterEnd = frontmatterEnd
	const isPublished = parsed.value[PERLITE_PUBLISH_FIELD] === true

	if (isPublished) {
		nextLines.splice(matches[0].index, 1)
		nextFrontmatterEnd -= 1
	} else if (matches.length === 1) {
		const { index, match } = matches[0]
		const publishedLine = getPublishedLine(match)
		if (publishedLine === null) return { status: 'unsafe-field', content }
		nextLines[index] = publishedLine
	} else {
		let insertIndex = frontmatterEnd
		while (insertIndex > 1 && nextLines[insertIndex - 1].trim() === '') insertIndex -= 1
		nextLines.splice(insertIndex, 0, `${PERLITE_PUBLISH_FIELD}: true`)
		nextFrontmatterEnd += 1
	}

	if (!isCandidateSafe(nextLines, nextFrontmatterEnd, lineEnding, yamlParser, !isPublished)) {
		return { status: 'unsafe-field', content }
	}

	return {
		status: isPublished ? 'unpublished' : 'published',
		content: nextLines.join(lineEnding),
	}
}

const RESULT_NOTICES: Record<PerlitePublishToggleResult['status'], string> = {
	published: '已将当前文档设为发布',
	unpublished: '已取消当前文档发布',
	'missing-frontmatter': '当前文档没有 Frontmatter，无法设置发布状态',
	'unclosed-frontmatter': '当前文档的 Frontmatter 未闭合，无法设置发布状态',
	'invalid-frontmatter': '当前文档的 Frontmatter 无法解析，未修改发布状态',
	'unsafe-field': '无法安全定位 perlite_publish 属性，未修改发布状态',
}

export async function togglePerlitePublishForFile(
	plugin: Pick<Plugin, 'app'>,
	file: TFile,
) {
	try {
		const content = await plugin.app.vault.read(file)
		const result = togglePerlitePublishText(content)

		if (result.status === 'published' || result.status === 'unpublished') {
			await plugin.app.vault.modify(file, result.content)
		}

		new Notice(RESULT_NOTICES[result.status])
	} catch (error) {
		console.error('切换当前文档发布状态失败：', error)
		new Notice('切换当前文档发布状态失败')
	}
}

export function registerPerlitePublishToggleCommand(plugin: Plugin) {
	plugin.addCommand({
		id: 'toggle-perlite-publish-current-file',
		name: '切换当前文档发布状态',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile()
			if (!file || file.extension !== 'md') return false

			if (!checking) {
				void togglePerlitePublishForFile(plugin, file)
			}
			return true
		},
	})
}
