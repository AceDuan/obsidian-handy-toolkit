import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import esbuild from 'esbuild'

async function loadModule() {
	const outdir = await mkdtemp(join(tmpdir(), 'obsidian-handy-toolkit-test-'))
	const outfile = join(outdir, 'perlite-publish-toggle.mjs')

	await esbuild.build({
		entryPoints: ['features/perlite-publish-toggle.ts'],
		bundle: true,
		format: 'esm',
		platform: 'node',
		plugins: [{
			name: 'obsidian-stub',
			setup(build) {
				build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian-stub', namespace: 'obsidian-stub' }))
				build.onLoad({ filter: /.*/, namespace: 'obsidian-stub' }, () => ({
					contents: [
						'export class Notice { constructor(message) { globalThis.__obsidianNotices.push(message) } }',
						'export class Plugin {}',
						'export class TFile {}',
						'export function parseYaml(yaml) { return globalThis.__parseYaml(yaml) }',
					].join('\n'),
					loader: 'js',
				}))
			},
		}],
		outfile,
	})

	return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

function createYamlParser(base = {}) {
	return (yaml) => {
		const parsed = structuredClone(base)
		const match = yaml.match(/^perlite_publish\s*:\s*(.*)$/m)
		if (!match) {
			delete parsed.perlite_publish
			return parsed
		}

		const rawValue = match[1].replace(/\s+#.*$/, '').trim()
		if (rawValue === 'true') parsed.perlite_publish = true
		else if (rawValue === 'false') parsed.perlite_publish = false
		else if (rawValue === '') parsed.perlite_publish = null
		else if (rawValue === '"true"') parsed.perlite_publish = 'true'
		else parsed.perlite_publish = rawValue
		return parsed
	}
}

test('缺少发布字段时在尾部空行前写入布尔值 true', async () => {
	const { togglePerlitePublishText } = await loadModule()
	const content = '---\ntitle: 测试\nuid: abc\n\n---\n正文\n'
	const result = togglePerlitePublishText(content, createYamlParser({ title: '测试', uid: 'abc' }))

	assert.deepEqual(result, {
		status: 'published',
		content: '---\ntitle: 测试\nuid: abc\nperlite_publish: true\n\n---\n正文\n',
	})
})

test('布尔值 true 时删除整个顶层属性行', async () => {
	const { togglePerlitePublishText } = await loadModule()
	const content = '---\ntitle: 测试\nperlite_publish: true # 发布标记\n---\n正文'
	const result = togglePerlitePublishText(content, createYamlParser({ title: '测试' }))

	assert.deepEqual(result, {
		status: 'unpublished',
		content: '---\ntitle: 测试\n---\n正文',
	})
})

test('false、空值和字符串 true 都在原位规范化并保留行尾注释', async () => {
	const { togglePerlitePublishText } = await loadModule()
	const cases = ['false', '', '"true"']

	for (const sourceValue of cases) {
		const content = `---\ntitle: 测试\nperlite_publish :  ${sourceValue}  # 保留说明\n---\n正文`
		const result = togglePerlitePublishText(content, createYamlParser({ title: '测试' }))

		assert.equal(result.status, 'published')
		assert.equal(result.content, '---\ntitle: 测试\nperlite_publish :  true  # 保留说明\n---\n正文')
	}
})

test('保留 CRLF、其他字段文本、嵌套同名字段和正文', async () => {
	const { togglePerlitePublishText } = await loadModule()
	const content = [
		'---',
		'title: "原样标题"',
		'nested:',
		'  perlite_publish: true',
		'',
		'---',
		'# 正文',
	].join('\r\n')
	const result = togglePerlitePublishText(content, createYamlParser({
		title: '原样标题',
		nested: { perlite_publish: true },
	}))

	assert.equal(result.status, 'published')
	assert.equal(result.content, [
		'---',
		'title: "原样标题"',
		'nested:',
		'  perlite_publish: true',
		'perlite_publish: true',
		'',
		'---',
		'# 正文',
	].join('\r\n'))
})

test('无 Frontmatter、未闭合、非法 YAML 和重复字段均不修改', async () => {
	const { togglePerlitePublishText } = await loadModule()
	const invalidCases = [
		['# 正文', () => ({}), 'missing-frontmatter'],
		['---\ntitle: 测试\n正文', () => ({ title: '测试' }), 'unclosed-frontmatter'],
		['---\ntitle: [\n---\n正文', () => { throw new Error('非法 YAML') }, 'invalid-frontmatter'],
		['---\n- 列表项\n---\n正文', () => ['列表项'], 'invalid-frontmatter'],
		['---\nperlite_publish: true\nperlite_publish: false\n---', () => ({ perlite_publish: false }), 'unsafe-field'],
	]

	for (const [content, parser, status] of invalidCases) {
		assert.deepEqual(togglePerlitePublishText(content, parser), { status, content })
	}
})

test('插件添加发布字段后再次切换可完整恢复原文', async () => {
	const { togglePerlitePublishText } = await loadModule()
	const original = '---\ntitle: 测试\nuid: abc\n\n---\n正文\n'
	const parser = createYamlParser({ title: '测试', uid: 'abc' })
	const published = togglePerlitePublishText(original, parser)
	const unpublished = togglePerlitePublishText(published.content, parser)

	assert.equal(unpublished.status, 'unpublished')
	assert.equal(unpublished.content, original)
})

function createPlugin({ activeFile = null, content = '' } = {}) {
	globalThis.__obsidianNotices = []
	globalThis.__parseYaml = createYamlParser({ title: '测试' })
	const commands = []
	const modifications = []
	const plugin = {
		app: {
			workspace: { getActiveFile: () => activeFile },
			vault: {
				read: async () => content,
				modify: async (file, nextContent) => modifications.push({ file, content: nextContent }),
			},
		},
		addCommand(command) {
			commands.push(command)
		},
	}
	return { commands, modifications, plugin }
}

test('注册固定命令且只在活动文件为 Markdown 时可用', async () => {
	const { registerPerlitePublishToggleCommand } = await loadModule()
	const markdownFile = { path: '测试.md', extension: 'md' }
	const markdown = createPlugin({ activeFile: markdownFile })
	registerPerlitePublishToggleCommand(markdown.plugin)

	assert.deepEqual(markdown.commands.map(({ id, name }) => ({ id, name })), [{
		id: 'toggle-perlite-publish-current-file',
		name: '切换当前文档发布状态',
	}])
	assert.equal(markdown.commands[0].checkCallback(true), true)

	const nonMarkdown = createPlugin({ activeFile: { path: '图片.png', extension: 'png' } })
	registerPerlitePublishToggleCommand(nonMarkdown.plugin)
	assert.equal(nonMarkdown.commands[0].checkCallback(true), false)

	const noFile = createPlugin()
	registerPerlitePublishToggleCommand(noFile.plugin)
	assert.equal(noFile.commands[0].checkCallback(true), false)
})

test('命令发布当前文档时只保存一次并提示成功', async () => {
	const { registerPerlitePublishToggleCommand } = await loadModule()
	const file = { path: '测试.md', extension: 'md' }
	const { commands, modifications, plugin } = createPlugin({
		activeFile: file,
		content: '---\ntitle: 测试\n---\n正文',
	})
	registerPerlitePublishToggleCommand(plugin)
	commands[0].checkCallback(false)
	await new Promise((resolve) => setTimeout(resolve, 0))

	assert.deepEqual(modifications, [{
		file,
		content: '---\ntitle: 测试\nperlite_publish: true\n---\n正文',
	}])
	assert.deepEqual(globalThis.__obsidianNotices, ['已将当前文档设为发布'])
})

test('无 Frontmatter 时不保存并显示明确提示', async () => {
	const { registerPerlitePublishToggleCommand } = await loadModule()
	const { commands, modifications, plugin } = createPlugin({
		activeFile: { path: '测试.md', extension: 'md' },
		content: '# 正文',
	})
	registerPerlitePublishToggleCommand(plugin)
	commands[0].checkCallback(false)
	await new Promise((resolve) => setTimeout(resolve, 0))

	assert.deepEqual(modifications, [])
	assert.deepEqual(globalThis.__obsidianNotices, ['当前文档没有 Frontmatter，无法设置发布状态'])
})

test('读取失败时显示失败通知且不保存', async () => {
	const { registerPerlitePublishToggleCommand } = await loadModule()
	const { commands, modifications, plugin } = createPlugin({
		activeFile: { path: '测试.md', extension: 'md' },
	})
	plugin.app.vault.read = async () => { throw new Error('读取失败') }
	registerPerlitePublishToggleCommand(plugin)
	commands[0].checkCallback(false)
	await new Promise((resolve) => setTimeout(resolve, 0))

	assert.deepEqual(modifications, [])
	assert.deepEqual(globalThis.__obsidianNotices, ['切换当前文档发布状态失败'])
})

test('命令取消发布时删除字段并提示成功', async () => {
	const { registerPerlitePublishToggleCommand } = await loadModule()
	const file = { path: '测试.md', extension: 'md' }
	const { commands, modifications, plugin } = createPlugin({
		activeFile: file,
		content: '---\ntitle: 测试\nperlite_publish: true\n---\n正文',
	})
	registerPerlitePublishToggleCommand(plugin)
	commands[0].checkCallback(false)
	await new Promise((resolve) => setTimeout(resolve, 0))

	assert.equal(modifications[0].content, '---\ntitle: 测试\n---\n正文')
	assert.deepEqual(globalThis.__obsidianNotices, ['已取消当前文档发布'])
})

test('非法 Frontmatter 不保存并显示解析失败提示', async () => {
	const { registerPerlitePublishToggleCommand } = await loadModule()
	const { commands, modifications, plugin } = createPlugin({
		activeFile: { path: '测试.md', extension: 'md' },
		content: '---\ntitle: [\n---\n正文',
	})
	globalThis.__parseYaml = () => { throw new Error('非法 YAML') }
	registerPerlitePublishToggleCommand(plugin)
	commands[0].checkCallback(false)
	await new Promise((resolve) => setTimeout(resolve, 0))

	assert.deepEqual(modifications, [])
	assert.deepEqual(globalThis.__obsidianNotices, ['当前文档的 Frontmatter 无法解析，未修改发布状态'])
})

test('保存失败时只显示失败通知', async () => {
	const { registerPerlitePublishToggleCommand } = await loadModule()
	const { commands, plugin } = createPlugin({
		activeFile: { path: '测试.md', extension: 'md' },
		content: '---\ntitle: 测试\n---\n正文',
	})
	plugin.app.vault.modify = async () => { throw new Error('保存失败') }
	registerPerlitePublishToggleCommand(plugin)
	commands[0].checkCallback(false)
	await new Promise((resolve) => setTimeout(resolve, 0))

	assert.deepEqual(globalThis.__obsidianNotices, ['切换当前文档发布状态失败'])
})
