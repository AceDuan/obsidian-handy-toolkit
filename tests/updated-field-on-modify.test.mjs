import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import esbuild from 'esbuild'

async function loadModule() {
	const outdir = await mkdtemp(join(tmpdir(), 'obsidian-handy-toolkit-test-'))
	const outfile = join(outdir, 'updated-field-on-modify.mjs')

	await esbuild.build({
		entryPoints: ['features/updated-field-on-modify.ts'],
		bundle: true,
		format: 'esm',
		platform: 'node',
		external: ['obsidian'],
		outfile,
	})
	return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

test('updated 字段使用本地时间格式', async () => {
	const { formatUpdatedTimestamp } = await loadModule()
	const date = new Date(2026, 4, 22, 10, 1, 54)

	assert.equal(formatUpdatedTimestamp(date), '2026-05-22 10:01:54')
})

test('关闭开关时不会处理修改事件', async () => {
	const { shouldSyncUpdatedForModifiedFile } = await loadModule()
	const file = { extension: 'md', path: '测试.md' }

	assert.equal(shouldSyncUpdatedForModifiedFile(false, file), false)
})

test('非 Markdown 文件修改时不会处理 updated 字段', async () => {
	const { shouldSyncUpdatedForModifiedFile } = await loadModule()
	const file = { extension: 'png', path: 'image.png' }

	assert.equal(shouldSyncUpdatedForModifiedFile(true, file), false)
})

test('updated 距离当前时间两分钟内时不会重复写入', async () => {
	const { isUpdatedTimestampFresh } = await loadModule()
	const now = new Date(2026, 4, 22, 10, 1, 54)

	assert.equal(isUpdatedTimestampFresh('2026-05-22 10:00:00', now), true)
	assert.equal(isUpdatedTimestampFresh('2026-05-22 10:03:00', now), true)
	assert.equal(isUpdatedTimestampFresh('2026-05-22 09:58:00', now), false)
})

test('quick-preview 许可队列最多保留最近三个文件', async () => {
	const { rememberPendingEditorSave } = await loadModule()
	const pending = []

	rememberPendingEditorSave(pending, '一.md', 1000)
	rememberPendingEditorSave(pending, '二.md', 2000)
	rememberPendingEditorSave(pending, '三.md', 3000)
	rememberPendingEditorSave(pending, '四.md', 4000)

	assert.deepEqual(pending, [
		{ path: '二.md', at: 2000 },
		{ path: '三.md', at: 3000 },
		{ path: '四.md', at: 4000 },
	])
})

test('重复 quick-preview 许可会刷新文件时间并保持唯一记录', async () => {
	const { rememberPendingEditorSave } = await loadModule()
	const pending = [
		{ path: '一.md', at: 1000 },
		{ path: '二.md', at: 2000 },
	]

	rememberPendingEditorSave(pending, '一.md', 3000)

	assert.deepEqual(pending, [
		{ path: '二.md', at: 2000 },
		{ path: '一.md', at: 3000 },
	])
})

test('modify 命中 quick-preview 许可后会消费该许可', async () => {
	const { consumePendingEditorSave } = await loadModule()
	const pending = [
		{ path: '一.md', at: 1000 },
		{ path: '二.md', at: 2000 },
	]

	assert.equal(consumePendingEditorSave(pending, '一.md', 9000), true)
	assert.deepEqual(pending, [
		{ path: '二.md', at: 2000 },
	])
})

test('modify 没有 quick-preview 许可或许可过期时不会消费成功', async () => {
	const { consumePendingEditorSave } = await loadModule()
	const pending = [
		{ path: '一.md', at: 1000 },
		{ path: '二.md', at: 2000 },
	]

	assert.equal(consumePendingEditorSave(pending, '三.md', 3000), false)
	assert.equal(consumePendingEditorSave(pending, '一.md', 12000), false)
	assert.deepEqual(pending, [
		{ path: '二.md', at: 2000 },
	])
})

test('注册事件后没有 quick-preview 许可的 modify 不会写 updated', async () => {
	const { registerUpdatedFieldOnModify } = await loadModule()
	const file = { extension: 'md', path: '测试.md' }
	const handlers = {}
	let modifyCount = 0
	const plugin = {
		settings: { syncUpdatedFieldOnModify: true },
		registerEvent() {},
		app: {
			workspace: {
				on(name, callback) {
					handlers[name] = callback
					return { name }
				},
			},
			vault: {
				on(name, callback) {
					handlers[name] = callback
					return { name }
				},
				async read() {
					return [
						'---',
						'title: 测试',
						'updated: 2026-05-22 09:00:00',
						'---',
						'正文',
					].join('\n')
				},
				async modify() {
					modifyCount += 1
				},
			},
		},
	}

	registerUpdatedFieldOnModify(plugin)
	handlers.modify(file)
	await new Promise((resolve) => setTimeout(resolve, 0))

	assert.equal(modifyCount, 0)
})

test('注册事件后 quick-preview 许可对应的 modify 会写 updated', async () => {
	const { registerUpdatedFieldOnModify } = await loadModule()
	const file = { extension: 'md', path: '测试.md' }
	const handlers = {}
	let modifiedContent = ''
	const plugin = {
		settings: { syncUpdatedFieldOnModify: true },
		registerEvent() {},
		app: {
			workspace: {
				on(name, callback) {
					handlers[name] = callback
					return { name }
				},
			},
			vault: {
				on(name, callback) {
					handlers[name] = callback
					return { name }
				},
				async read() {
					return [
						'---',
						'title: 测试',
						'updated: 2026-05-22 09:00:00',
						'---',
						'正文',
					].join('\n')
				},
				async modify(_targetFile, nextContent) {
					modifiedContent = nextContent
				},
			},
		},
	}

	registerUpdatedFieldOnModify(plugin)
	handlers['quick-preview'](file, '')
	handlers.modify(file)
	await new Promise((resolve) => setTimeout(resolve, 0))

	assert.match(modifiedContent, /^updated: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/m)
})

test('Markdown 文件修改时把过期的 updated 写成当前时间', async () => {
	const { syncUpdatedFieldWithProcessFrontMatter } = await loadModule()
	const file = { extension: 'md', path: '测试.md' }
	const frontmatter = { title: '测试', updated: '2026-05-22 09:00:00' }
	const plugin = {
		app: {
			fileManager: {
				async processFrontMatter(targetFile, callback) {
					assert.equal(targetFile, file)
					callback(frontmatter)
				},
			},
		},
	}

	const didUpdate = await syncUpdatedFieldWithProcessFrontMatter(plugin, file, new Date(2026, 4, 22, 10, 1, 54))

	assert.equal(didUpdate, true)
	assert.deepEqual(frontmatter, { title: '测试', updated: '2026-05-22 10:01:54' })
})

test('Markdown 文件修改时保留两分钟内的 updated', async () => {
	const { syncUpdatedFieldWithProcessFrontMatter } = await loadModule()
	const file = { extension: 'md', path: '测试.md' }
	const frontmatter = { title: '测试', updated: '2026-05-22 10:00:00' }
	const plugin = {
		app: {
			fileManager: {
				async processFrontMatter(targetFile, callback) {
					assert.equal(targetFile, file)
					callback(frontmatter)
				},
			},
		},
	}

	const didUpdate = await syncUpdatedFieldWithProcessFrontMatter(plugin, file, new Date(2026, 4, 22, 10, 1, 54))

	assert.equal(didUpdate, false)
	assert.deepEqual(frontmatter, { title: '测试', updated: '2026-05-22 10:00:00' })
})

test('Markdown 文件修改时保留 frontmatter 内的空行', async () => {
	const { syncUpdatedFieldForModifiedFile } = await loadModule()
	const file = { extension: 'md', path: '测试.md' }
	let content = [
		'---',
		'title: 测试',
		'',
		'updated: 2026-05-22 09:00:00',
		'---',
		'正文',
	].join('\n')
	const plugin = {
		app: {
			vault: {
				async read(targetFile) {
					assert.equal(targetFile, file)
					return content
				},
				async modify(targetFile, nextContent) {
					assert.equal(targetFile, file)
					content = nextContent
				},
			},
		},
	}

	const didUpdate = await syncUpdatedFieldForModifiedFile(plugin, file, new Date(2026, 4, 22, 10, 1, 54))

	assert.equal(didUpdate, true)
	assert.equal(content, [
		'---',
		'title: 测试',
		'',
		'updated: 2026-05-22 10:01:54',
		'---',
		'正文',
	].join('\n'))
})
