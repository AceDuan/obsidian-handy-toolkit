import { parseYaml } from 'obsidian'

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

function getCommentSuffix(rawValue: string) {
	let inSingleQuote = false
	let inDoubleQuote = false
	let escaped = false

	for (let index = 0; index < rawValue.length; index += 1) {
		const character = rawValue[index]

		if (inDoubleQuote && escaped) {
			escaped = false
			continue
		}
		if (inDoubleQuote && character === '\\') {
			escaped = true
			continue
		}
		if (!inDoubleQuote && character === "'") {
			if (inSingleQuote && rawValue[index + 1] === "'") {
				index += 1
				continue
			}
			inSingleQuote = !inSingleQuote
			continue
		}
		if (!inSingleQuote && character === '"') {
			inDoubleQuote = !inDoubleQuote
			continue
		}
		if (!inSingleQuote && !inDoubleQuote && character === '#' && (index === 0 || /\s/.test(rawValue[index - 1]))) {
			let suffixStart = index
			while (suffixStart > 0 && /[ \t]/.test(rawValue[suffixStart - 1])) suffixStart -= 1
			return rawValue.slice(suffixStart)
		}
	}

	return ''
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

	const fieldPattern = /^(perlite_publish)(\s*:\s{0,2})(.*)$/
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
		nextLines[index] = `${match[1]}${match[2]}true${getCommentSuffix(match[3])}`
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
