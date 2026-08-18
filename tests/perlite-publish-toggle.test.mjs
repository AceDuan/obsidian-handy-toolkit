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
