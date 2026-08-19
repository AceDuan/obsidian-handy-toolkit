import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('类型边界不直接扩散运行时 any 值', async () => {
	const mainSource = await readFile('main.ts', 'utf8')
	const quickSwitcherSource = await readFile('features/quick-switcher-filter.ts', 'utf8')
	const customAttachmentSource = await readFile('utils/custom-attachment-location.ts', 'utf8')

	assert.doesNotMatch(mainSource, /Object\.assign\(\{\}, DEFAULT_SETTINGS, await this\.loadData\(\)\)/)
	assert.doesNotMatch(quickSwitcherSource, /return result\.filter/)
	assert.doesNotMatch(quickSwitcherSource, /target\[key\] as unknown/)
	assert.doesNotMatch(customAttachmentSource, /return JSON\.parse\([^\n]*\)\n/)
})
