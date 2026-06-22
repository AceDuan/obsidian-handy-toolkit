import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import esbuild from 'esbuild'

async function loadModule() {
	const outdir = await mkdtemp(join(tmpdir(), 'obsidian-handy-toolkit-test-'))
	const outfile = join(outdir, 'collapse-properties.mjs')

	await esbuild.build({
		entryPoints: ['features/collapse-properties.ts'],
		bundle: true,
		format: 'esm',
		platform: 'node',
		plugins: [{
			name: 'obsidian-stub',
			setup(build) {
				build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian-stub', namespace: 'obsidian-stub' }))
				build.onLoad({ filter: /.*/, namespace: 'obsidian-stub' }, () => ({
					contents: [
						'export class App {}',
						'export class Plugin {}',
						'export function getLanguage() { return globalThis.__obsidianLanguage ?? "en" }',
						'export class Notice { constructor(message) { globalThis.__obsidianNotices.push(message) } }',
					].join('\n'),
					loader: 'js',
				}))
			},
		}],
		outfile,
	})

	return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

function createPlugin({
	language = 'en',
	files = [],
	frontmatterPaths = [],
	foldManager,
	leaves = [],
} = {}) {
	globalThis.__obsidianLanguage = language
	globalThis.__obsidianNotices = []
	const commands = []
	const reads = []
	const app = {
		foldManager,
		vault: {
			getMarkdownFiles: () => files,
			cachedRead: async (file) => {
				reads.push(file.path)
				return file.content ?? ''
			},
		},
		metadataCache: {
			getFileCache: (file) => frontmatterPaths.includes(file.path)
				? { frontmatter: {} }
				: {},
		},
		workspace: {
			getLeavesOfType: () => leaves,
			getActiveFile: () => null,
			activeLeaf: null,
		},
		commands: { executeCommandById: () => true },
	}
	const plugin = {
		app,
		addCommand(command) {
			commands.push(command)
		},
	}

	return { app, commands, plugin, reads }
}

test('空记录生成属性折叠并使用当前行数', async () => {
	const { mergeFrontmatterFold } = await loadModule()

	assert.deepEqual(mergeFrontmatterFold(null, 12), {
		folds: [{ from: 0, to: 0 }],
		lines: 12,
	})
})

test('保留现有正文折叠和原行数', async () => {
	const { mergeFrontmatterFold } = await loadModule()
	const existing = { folds: [{ from: 5, to: 8 }], lines: 20 }

	assert.deepEqual(mergeFrontmatterFold(existing, 99), {
		folds: [{ from: 0, to: 0 }, { from: 5, to: 8 }],
		lines: 20,
	})
})

test('已有属性折叠时不重复添加', async () => {
	const { mergeFrontmatterFold } = await loadModule()
	const existing = { folds: [{ from: 0, to: 0 }, { from: 5, to: 8 }], lines: 20 }

	assert.deepEqual(mergeFrontmatterFold(existing, 99), existing)
})

test('合并时不修改输入对象或折叠数组', async () => {
	const { mergeFrontmatterFold } = await loadModule()
	const existing = { folds: [{ from: 5, to: 8 }], lines: 20 }
	const snapshot = structuredClone(existing)
	const result = mergeFrontmatterFold(existing, 99)

	assert.deepEqual(existing, snapshot)
	assert.notStrictEqual(result, existing)
	assert.notStrictEqual(result.folds, existing.folds)
})

test('中文环境注册两个中文命令名称', async () => {
	const { registerCollapsePropertiesCommand } = await loadModule()
	const { commands, plugin } = createPlugin({ language: 'zh-cn' })

	registerCollapsePropertiesCommand(plugin)

	assert.deepEqual(commands.map(({ id, name }) => ({ id, name })), [
		{ id: 'collapse-properties-in-current-file', name: '折叠当前文件的属性' },
		{ id: 'collapse-properties-in-all-files', name: '折叠所有笔记的属性' },
	])
})

test('英文环境注册两个英文命令名称', async () => {
	const { registerCollapsePropertiesCommand } = await loadModule()
	const { commands, plugin } = createPlugin({ language: 'en' })

	registerCollapsePropertiesCommand(plugin)

	assert.deepEqual(commands.map(({ name }) => name), [
		'Collapse properties in current file',
		'Collapse properties in all notes',
	])
})

test('foldManager 接口缺失时安全停止且不读取文件', async () => {
	const { registerCollapsePropertiesCommand } = await loadModule()
	const file = { path: '有属性.md', content: '---\ntitle: 测试\n---\n正文' }
	const { commands, plugin, reads } = createPlugin({
		files: [file],
		frontmatterPaths: [file.path],
	})
	registerCollapsePropertiesCommand(plugin)

	await commands.find(({ id }) => id === 'collapse-properties-in-all-files').callback()

	assert.deepEqual(reads, [])
	assert.deepEqual(globalThis.__obsidianNotices, ['无法折叠所有笔记的属性：当前 Obsidian 版本不支持折叠状态管理。'])
})

test('批量命令仅处理有 frontmatter 的文件并保留正文折叠', async () => {
	const files = [
		{ path: '有属性.md', content: '---\ntitle: 测试\n---\n# 标题\n正文' },
		{ path: '无属性.md', content: '# 标题\n正文' },
	]
	const saved = []
	const foldManager = {
		load: (file) => file.path === '有属性.md'
			? { folds: [{ from: 4, to: 5 }], lines: 6 }
			: null,
		save: (file, foldInfo) => saved.push({ path: file.path, foldInfo }),
	}
	const { commands, plugin, reads } = createPlugin({
		files,
		frontmatterPaths: ['有属性.md'],
		foldManager,
	})
	const { registerCollapsePropertiesCommand } = await loadModule()
	registerCollapsePropertiesCommand(plugin)

	await commands.find(({ id }) => id === 'collapse-properties-in-all-files').callback()

	assert.deepEqual(reads, ['有属性.md'])
	assert.deepEqual(saved, [{
		path: '有属性.md',
		foldInfo: { folds: [{ from: 0, to: 0 }, { from: 4, to: 5 }], lines: 6 },
	}])
	assert.deepEqual(globalThis.__obsidianNotices, ['已折叠 1 篇，已跳过 1 篇，失败 0 篇'])
})

test('批量命令折叠同一文件的所有打开视图', async () => {
	const file = { path: '多视图.md', content: '---\ntitle: 测试\n---\n正文' }
	const calls = [[], []]
	const leaves = calls.map((viewCalls) => ({
		view: {
			file,
			metadataEditor: {
				setCollapse: (...args) => viewCalls.push(args),
			},
		},
	}))
	const foldManager = { load: () => null, save: () => undefined }
	const { commands, plugin } = createPlugin({
		files: [file],
		frontmatterPaths: [file.path],
		foldManager,
		leaves,
	})
	const { registerCollapsePropertiesCommand } = await loadModule()
	registerCollapsePropertiesCommand(plugin)

	await commands.find(({ id }) => id === 'collapse-properties-in-all-files').callback()

	assert.deepEqual(calls, [[[true, true]], [[true, true]]])
})

test('单个视图折叠失败时仍处理其他视图并保存文件', async () => {
	const file = { path: '视图异常.md', content: '---\ntitle: 测试\n---\n正文' }
	const secondViewCalls = []
	const leaves = [
		{
			view: {
				file,
				metadataEditor: { setCollapse: () => { throw new Error('视图异常') } },
			},
		},
		{
			view: {
				file,
				metadataEditor: { setCollapse: (...args) => secondViewCalls.push(args) },
			},
		},
	]
	const saved = []
	const foldManager = { load: () => null, save: (savedFile) => saved.push(savedFile.path) }
	const { commands, plugin } = createPlugin({
		files: [file],
		frontmatterPaths: [file.path],
		foldManager,
		leaves,
	})
	const { registerCollapsePropertiesCommand } = await loadModule()
	registerCollapsePropertiesCommand(plugin)

	await commands.find(({ id }) => id === 'collapse-properties-in-all-files').callback()

	assert.deepEqual(secondViewCalls, [[true, true]])
	assert.deepEqual(saved, [file.path])
	assert.deepEqual(globalThis.__obsidianNotices, ['已折叠 0 篇，已跳过 0 篇，失败 1 篇'])
})

test('单个文件保存失败时继续处理并计入失败', async () => {
	const files = [
		{ path: '失败.md', content: '---\ntitle: 失败\n---\n正文' },
		{ path: '成功.md', content: '---\ntitle: 成功\n---\n正文' },
	]
	const saved = []
	const foldManager = {
		load: () => null,
		save: (file) => {
			if (file.path === '失败.md') throw new Error('保存失败')
			saved.push(file.path)
		},
	}
	const { commands, plugin } = createPlugin({
		files,
		frontmatterPaths: files.map((file) => file.path),
		foldManager,
	})
	const { registerCollapsePropertiesCommand } = await loadModule()
	registerCollapsePropertiesCommand(plugin)

	await commands.find(({ id }) => id === 'collapse-properties-in-all-files').callback()

	assert.deepEqual(saved, ['成功.md'])
	assert.deepEqual(globalThis.__obsidianNotices, ['已折叠 1 篇，已跳过 0 篇，失败 1 篇'])
})
