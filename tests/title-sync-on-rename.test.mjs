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
		plugins: [{
			name: 'obsidian-stub',
			setup(build) {
				build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian-stub', namespace: 'obsidian-stub' }))
				build.onLoad({ filter: /.*/, namespace: 'obsidian-stub' }, () => ({
					contents: [
						'export class Notice { constructor(message) { this.message = message } }',
						'export class Plugin {}',
						'export function normalizePath(path) { return path.replace(/\\\\/g, "/").replace(/\\/+/g, "/") }',
					].join('\n'),
					loader: 'js',
				}))
			},
		}],
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

test('附件文件夹同步开关关闭时只同步 frontmatter title', async () => {
	const { syncRenamedMarkdownFile } = await loadModule()
	const file = { extension: 'md', basename: '新标题', path: '新标题.md' }
	let content = [
		'---',
		'title: 旧标题',
		'---',
		'![[00_assets/旧标题/a.png]]',
	].join('\n')
	let getFilesCalled = false
	const plugin = {
		settings: {
			syncAssetFolderOnRename: false,
		},
		app: {
			fileManager: {
				async renameFile() {
					throw new Error('不应重命名附件文件夹')
				},
			},
			vault: {
				async read(targetFile) {
					assert.equal(targetFile, file)
					return content
				},
				async modify(targetFile, nextContent) {
					assert.equal(targetFile, file)
					content = nextContent
				},
				getFiles() {
					getFilesCalled = true
					return []
				},
				getAbstractFileByPath() {
					return null
				},
			},
		},
	}

	await syncRenamedMarkdownFile(plugin, file, '旧标题.md')

	assert.equal(content, [
		'---',
		'title: 新标题',
		'---',
		'![[00_assets/旧标题/a.png]]',
	].join('\n'))
	assert.equal(getFilesCalled, false)
})

test('Markdown 文件重命名后会同步重命名同名附件文件夹', async () => {
	const { syncAssetFolderForRenamedNote } = await loadModule()
	const oldFolder = { path: '00_assets/旧标题' }
	const renamedFolders = []
	const notices = []
	const file = { extension: 'md', basename: '新标题', path: '新标题.md' }
	const plugin = {
		app: {
			fileManager: {
				async renameFile(folder, newPath) {
					renamedFolders.push([folder, newPath])
				},
			},
			vault: {
				configDir: '.obsidian',
				adapter: {
					async read(path) {
						if (path === '.obsidian/community-plugins.json') {
							return JSON.stringify(['obsidian-custom-attachment-location'])
						}
						if (path === '.obsidian/plugins/obsidian-custom-attachment-location/data.json') {
							return JSON.stringify({ attachmentFolderPath: '00_assets/${noteFilename}' })
						}
						throw new Error(`未预期读取：${path}`)
					},
				},
				async read(targetFile) {
					assert.equal(targetFile, file)
					return [
						'![[00_assets/旧标题/a.png]]',
						'![b](00_assets/旧标题/b.webp)',
					].join('\n')
				},
				getFiles() {
					return [
						{ path: '00_assets/旧标题/a.png', extension: 'png' },
						{ path: '00_assets/旧标题/b.webp', extension: 'webp' },
					]
				},
				getAbstractFileByPath(path) {
					if (path === '00_assets/旧标题') {
						return oldFolder
					}
					return null
				},
			},
		},
	}

	await syncAssetFolderForRenamedNote(plugin, file, '旧标题.md', (message) => notices.push(message))

	assert.deepEqual(renamedFolders, [[oldFolder, '00_assets/新标题']])
	assert.deepEqual(notices, [])
})

test('Custom Attachment Location 未启用时不会重命名附件文件夹', async () => {
	const { syncAssetFolderForRenamedNote } = await loadModule()
	const oldFolder = { path: '00_assets/旧标题' }
	const renamedFolders = []
	const file = { extension: 'md', basename: '新标题', path: '新标题.md' }
	const plugin = {
		app: {
			fileManager: {
				async renameFile(folder, newPath) {
					renamedFolders.push([folder, newPath])
				},
			},
			vault: {
				configDir: '.obsidian',
				adapter: {
					async read(path) {
						if (path === '.obsidian/community-plugins.json') {
							return JSON.stringify([])
						}
						throw new Error(`不应读取：${path}`)
					},
				},
				async read() {
					return '![[00_assets/旧标题/a.png]]'
				},
				getFiles() {
					return [{ path: '00_assets/旧标题/a.png', extension: 'png' }]
				},
				getAbstractFileByPath(path) {
					if (path === '00_assets/旧标题') {
						return oldFolder
					}
					return null
				},
			},
		},
	}

	await syncAssetFolderForRenamedNote(plugin, file, '旧标题.md')

	assert.deepEqual(renamedFolders, [])
})

test('Custom Attachment Location 配置读不到时不会重命名附件文件夹', async () => {
	const { syncAssetFolderForRenamedNote } = await loadModule()
	const oldFolder = { path: '00_assets/旧标题' }
	const renamedFolders = []
	const file = { extension: 'md', basename: '新标题', path: '新标题.md' }
	const plugin = {
		app: {
			fileManager: {
				async renameFile(folder, newPath) {
					renamedFolders.push([folder, newPath])
				},
			},
			vault: {
				configDir: '.obsidian',
				adapter: {
					async read(path) {
						if (path === '.obsidian/community-plugins.json') {
							return JSON.stringify(['obsidian-custom-attachment-location'])
						}
						throw new Error(`读不到配置：${path}`)
					},
				},
				async read() {
					return '![[00_assets/旧标题/a.png]]'
				},
				getFiles() {
					return [{ path: '00_assets/旧标题/a.png', extension: 'png' }]
				},
				getAbstractFileByPath(path) {
					if (path === '00_assets/旧标题') {
						return oldFolder
					}
					return null
				},
			},
		},
	}

	await syncAssetFolderForRenamedNote(plugin, file, '旧标题.md')

	assert.deepEqual(renamedFolders, [])
})

test('Markdown 文件重命名后存在非同名目录图片时会提醒并跳过文件夹重命名', async () => {
	const { syncAssetFolderForRenamedNote } = await loadModule()
	const oldFolder = { path: '00_assets/旧标题' }
	const renamedFolders = []
	const notices = []
	const file = { extension: 'md', basename: '新标题', path: '新标题.md' }
	const plugin = {
		app: {
			fileManager: {
				async renameFile(folder, newPath) {
					renamedFolders.push([folder, newPath])
				},
			},
			vault: {
				configDir: '.obsidian',
				adapter: {
					async read(path) {
						if (path === '.obsidian/community-plugins.json') {
							return JSON.stringify(['obsidian-custom-attachment-location'])
						}
						if (path === '.obsidian/plugins/obsidian-custom-attachment-location/data.json') {
							return JSON.stringify({ attachmentFolderPath: '00_assets/${notefilename}' })
						}
						throw new Error(`未预期读取：${path}`)
					},
				},
				async read() {
					return [
						'![[00_assets/旧标题/a.png]]',
						'![[00_assets/其他/b.png]]',
					].join('\n')
				},
				getFiles() {
					return [
						{ path: '00_assets/旧标题/a.png', extension: 'png' },
						{ path: '00_assets/其他/b.png', extension: 'png' },
					]
				},
				getAbstractFileByPath(path) {
					if (path === '00_assets/旧标题') {
						return oldFolder
					}
					return null
				},
			},
		},
	}

	await syncAssetFolderForRenamedNote(plugin, file, '旧标题.md', (message) => notices.push(message))

	assert.deepEqual(renamedFolders, [])
	assert.equal(notices.length, 1)
	assert.match(notices[0], /00_assets\/旧标题/)
	assert.match(notices[0], /00_assets\/其他\/b\.png/)
})
