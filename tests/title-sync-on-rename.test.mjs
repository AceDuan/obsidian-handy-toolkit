import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import esbuild from 'esbuild'

async function loadModule() {
	const outdir = await mkdtemp(join(tmpdir(), 'obsidian-handy-toolkit-test-'))
	const outfile = join(outdir, 'title-sync-on-rename.mjs')

	await esbuild.build({
		entryPoints: ['features/title-sync-on-rename.ts'],
		bundle: true,
		format: 'esm',
		platform: 'node',
		external: ['obsidian'],
		outfile,
	})
	return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

test('关闭开关时不会同步 frontmatter title', async () => {
	const { shouldSyncTitleForRenamedFile } = await loadModule()
	const file = { extension: 'md', basename: '新标题' }

	assert.equal(shouldSyncTitleForRenamedFile(false, file), false)
})

test('非 Markdown 文件重命名时不会同步 frontmatter title', async () => {
	const { shouldSyncTitleForRenamedFile } = await loadModule()
	const file = { extension: 'png', basename: '新标题' }

	assert.equal(shouldSyncTitleForRenamedFile(true, file), false)
})

test('Markdown 文件重命名时使用新文件名作为 frontmatter title', async () => {
	const { syncFrontmatterTitleWithProcessFrontMatter } = await loadModule()
	const file = { extension: 'md', basename: '新标题' }
	const frontmatter = { title: '旧标题', tags: ['test'] }
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

	await syncFrontmatterTitleWithProcessFrontMatter(plugin, file)

	assert.deepEqual(frontmatter, { title: '新标题', tags: ['test'] })
})

test('Markdown 文件重命名时保留 frontmatter 内的空行', async () => {
	const { syncFrontmatterTitleForRenamedFile } = await loadModule()
	const file = { extension: 'md', basename: '新标题' }
	let content = [
		'---',
		'title: 旧标题',
		'',
		'tags:',
		'  - test',
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

	await syncFrontmatterTitleForRenamedFile(plugin, file)

	assert.equal(content, [
		'---',
		'title: 新标题',
		'',
		'tags:',
		'  - test',
		'---',
		'正文',
	].join('\n'))
})
