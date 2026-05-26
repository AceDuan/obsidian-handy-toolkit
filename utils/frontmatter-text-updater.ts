import type { TFile, Vault } from 'obsidian'

type FrontmatterTextUpdateResult = {
	content: string
	didUpdate: boolean
}

type FrontmatterFieldUpdate = {
	fieldName: string
	nextValue: string
	shouldUpdate?: (currentValue: string) => boolean
}

const FRONTMATTER_BOUNDARY = '---'

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitLineEnding(content: string) {
	return content.includes('\r\n') ? '\r\n' : '\n'
}

function findFrontmatterEnd(lines: string[]) {
	for (let index = 1; index < lines.length; index += 1) {
		if (lines[index] === FRONTMATTER_BOUNDARY) {
			return index
		}
	}

	return -1
}

export function updateFrontmatterFieldText(content: string, update: FrontmatterFieldUpdate): FrontmatterTextUpdateResult {
	const lineEnding = splitLineEnding(content)
	const lines = content.split(lineEnding)

	if (lines[0] !== FRONTMATTER_BOUNDARY) {
		return { content, didUpdate: false }
	}

	const frontmatterEndIndex = findFrontmatterEnd(lines)
	if (frontmatterEndIndex === -1) {
		return { content, didUpdate: false }
	}

	const fieldPattern = new RegExp(`^(\\s*)(${escapeRegExp(update.fieldName)})(\\s*:\\s*)(.*)$`)

	for (let index = 1; index < frontmatterEndIndex; index += 1) {
		const match = lines[index].match(fieldPattern)
		if (!match) {
			continue
		}

		const [, indent, fieldName, separator, currentValue] = match
		if (update.shouldUpdate && !update.shouldUpdate(currentValue)) {
			return { content, didUpdate: false }
		}

		lines[index] = `${indent}${fieldName}${separator}${update.nextValue}`
		return { content: lines.join(lineEnding), didUpdate: true }
	}

	return { content, didUpdate: false }
}

export async function updateFrontmatterFieldInFile(
	vault: Pick<Vault, 'read' | 'modify'>,
	file: TFile,
	update: FrontmatterFieldUpdate,
) {
	const content = await vault.read(file)
	const result = updateFrontmatterFieldText(content, update)

	if (result.didUpdate) {
		await vault.modify(file, result.content)
	}

	return result.didUpdate
}
