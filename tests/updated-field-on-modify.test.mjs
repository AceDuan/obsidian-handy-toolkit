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

test('Markdown 文件修改时把过期的 updated 写成当前时间', async () => {
	const { syncUpdatedFieldForModifiedFile } = await loadModule()
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

	const didUpdate = await syncUpdatedFieldForModifiedFile(plugin, file, new Date(2026, 4, 22, 10, 1, 54))

	assert.equal(didUpdate, true)
	assert.deepEqual(frontmatter, { title: '测试', updated: '2026-05-22 10:01:54' })
})

test('Markdown 文件修改时保留两分钟内的 updated', async () => {
	const { syncUpdatedFieldForModifiedFile } = await loadModule()
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

	const didUpdate = await syncUpdatedFieldForModifiedFile(plugin, file, new Date(2026, 4, 22, 10, 1, 54))

	assert.equal(didUpdate, false)
	assert.deepEqual(frontmatter, { title: '测试', updated: '2026-05-22 10:00:00' })
})
