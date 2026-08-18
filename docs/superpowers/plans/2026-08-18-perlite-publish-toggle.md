# 当前文档 Perlite 发布状态切换实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前活动 Markdown 文档提供一个可绑定快捷键的命令，在 `perlite_publish: true` 与删除该属性之间安全切换。

**Architecture:** 在独立功能模块中用纯函数解析和局部变换 Frontmatter 文本，使用 Obsidian `parseYaml` 判定真实 YAML 类型，并由命令层负责当前文件检查、单次读写和通知。`main.ts` 只注册功能，README 只描述用户可见行为，不引入设置、右键菜单或发布器调用。

**Tech Stack:** TypeScript 6、Obsidian Plugin API 1.12、Node.js 内置测试运行器、esbuild、npm

## Global Constraints

- 只提供命令 `toggle-perlite-publish-current-file`，显示名称为“切换当前文档发布状态”，不注册默认快捷键。
- 只有顶层 `perlite_publish` 的 YAML 解析值严格为布尔值 `true` 时才视为已发布。
- 取消发布时删除整个顶层属性行，不写入 `false`。
- 缺少、未闭合或无法解析的 Frontmatter 只提示，不创建或修复 Frontmatter。
- 保留目标属性之外的字段顺序、注释、引号、空行、LF/CRLF 和正文；原位更新时保留目标行的冒号间距和行尾注释。
- 多个顶层同名字段或无法唯一定位目标字段时停止，不猜测性修改。
- 单次成功操作只调用一次 `vault.modify`，不主动更新 `updated`，不调用 Perlite 发布器或 NAS 同步。
- 不增加插件设置、右键菜单、Ribbon 图标、顶部按钮、批量命令或新依赖。
- 所有代码注释使用中文；提交标题使用英文类型前缀和中文描述。

---

## 文件结构

- Create: `features/perlite-publish-toggle.ts` — 纯文本变换、当前文件切换、命令注册和通知。
- Create: `tests/perlite-publish-toggle.test.mjs` — 纯函数和命令层的 Node 集成测试。
- Modify: `main.ts` — 导入并注册发布状态切换命令。
- Modify: `README.md` — 增加英文功能、行为和命令说明。
- Modify: `README.zh-CN.md` — 增加中文功能、行为和命令说明。

### Task 1: Frontmatter 发布标记纯文本变换

**Files:**
- Create: `features/perlite-publish-toggle.ts`
- Create: `tests/perlite-publish-toggle.test.mjs`

**Interfaces:**
- Consumes: Obsidian 导出的 `parseYaml(yaml: string): any`。
- Produces: `togglePerlitePublishText(content: string, yamlParser?: YamlParser): PerlitePublishToggleResult`。
- Produces: `PerlitePublishToggleResult`，其 `status` 为 `published | unpublished | missing-frontmatter | unclosed-frontmatter | invalid-frontmatter | unsafe-field`。

- [ ] **Step 1: 写入纯函数失败测试和测试加载器**

创建 `tests/perlite-publish-toggle.test.mjs`，先加入以下加载器和纯函数测试：

```js
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
```

- [ ] **Step 2: 运行单文件测试并确认因模块缺失而失败**

Run: `node --test tests/perlite-publish-toggle.test.mjs`

Expected: FAIL，esbuild 报告无法解析 `features/perlite-publish-toggle.ts`。

- [ ] **Step 3: 实现最小纯文本变换**

创建 `features/perlite-publish-toggle.ts`，实现以下类型和逻辑。辅助函数保持文件内私有，所有注释使用中文：

```ts
import { Notice, Plugin, TFile, parseYaml } from 'obsidian'

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

	const fieldPattern = /^(perlite_publish)(\s*:\s*)(.*)$/
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
```

注意：`Notice`、`Plugin` 和 `TFile` 在本任务暂未使用，Task 2 会使用这些导入；TypeScript 的 `noUnusedLocals` 当前未启用。如果构建器仍报告未使用导入，则本任务先只导入 `parseYaml`，Task 2 再扩展导入。

- [ ] **Step 4: 运行单文件测试并确认纯函数通过**

Run: `node --test tests/perlite-publish-toggle.test.mjs`

Expected: PASS，6 项纯函数测试全部通过。

- [ ] **Step 5: 运行完整测试，确认没有回归**

Run: `npm test`

Expected: PASS，原有 47 项测试与新增 6 项测试全部通过。

- [ ] **Step 6: 提交纯函数和测试**

```bash
git add features/perlite-publish-toggle.ts tests/perlite-publish-toggle.test.mjs
git commit -m "feat: 添加发布状态文本切换"
```

### Task 2: 当前 Markdown 文件命令与插件注册

**Files:**
- Modify: `features/perlite-publish-toggle.ts`
- Modify: `tests/perlite-publish-toggle.test.mjs`
- Modify: `main.ts:1-65`

**Interfaces:**
- Consumes: Task 1 的 `togglePerlitePublishText(content, yamlParser?)` 和 `PerlitePublishToggleResult`。
- Produces: `togglePerlitePublishForFile(plugin: Pick<Plugin, 'app'>, file: TFile): Promise<void>`。
- Produces: `registerPerlitePublishToggleCommand(plugin: Plugin): void`。
- Registers: command ID `toggle-perlite-publish-current-file`。

- [ ] **Step 1: 追加命令层失败测试**

在 `tests/perlite-publish-toggle.test.mjs` 的纯函数测试后追加：

```js
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
```

- [ ] **Step 2: 运行命令层测试并确认缺少注册函数**

Run: `node --test tests/perlite-publish-toggle.test.mjs`

Expected: FAIL，报告 `registerPerlitePublishToggleCommand is not a function`。

- [ ] **Step 3: 实现文件切换、通知映射和命令注册**

在 `features/perlite-publish-toggle.ts` 的纯函数后追加：

```ts
const RESULT_NOTICES: Record<PerlitePublishToggleResult['status'], string> = {
	published: '已将当前文档设为发布',
	unpublished: '已取消当前文档发布',
	'missing-frontmatter': '当前文档没有 Frontmatter，无法设置发布状态',
	'unclosed-frontmatter': '当前文档的 Frontmatter 未闭合，无法设置发布状态',
	'invalid-frontmatter': '当前文档的 Frontmatter 无法解析，未修改发布状态',
	'unsafe-field': '无法安全定位 perlite_publish 属性，未修改发布状态',
}

export async function togglePerlitePublishForFile(
	plugin: Pick<Plugin, 'app'>,
	file: TFile,
) {
	try {
		const content = await plugin.app.vault.read(file)
		const result = togglePerlitePublishText(content)

		if (result.status === 'published' || result.status === 'unpublished') {
			await plugin.app.vault.modify(file, result.content)
		}

		new Notice(RESULT_NOTICES[result.status])
	} catch (error) {
		console.error('切换当前文档发布状态失败：', error)
		new Notice('切换当前文档发布状态失败')
	}
}

export function registerPerlitePublishToggleCommand(plugin: Plugin) {
	plugin.addCommand({
		id: 'toggle-perlite-publish-current-file',
		name: '切换当前文档发布状态',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile()
			if (!file || file.extension !== 'md') return false

			if (!checking) {
				void togglePerlitePublishForFile(plugin, file)
			}
			return true
		},
	})
}
```

确保文件首行导入为：

```ts
import { Notice, Plugin, TFile, parseYaml } from 'obsidian'
```

- [ ] **Step 4: 在插件入口注册命令**

在 `main.ts` 的功能导入区加入：

```ts
// Perlite 发布状态切换功能
import {
	registerPerlitePublishToggleCommand, // 注册“切换当前文档发布状态”命令
} from './features/perlite-publish-toggle'
```

在 `onload()` 的命令注册序列中加入：

```ts
registerPerlitePublishToggleCommand(this)
```

放在 `registerImageRenameCommand(this)` 之后、快速切换过滤注册之前；该功能不依赖设置加载结果。

- [ ] **Step 5: 运行单文件测试并确认命令行为通过**

Run: `node --test tests/perlite-publish-toggle.test.mjs`

Expected: PASS，纯函数和命令层共 10 项测试全部通过。

- [ ] **Step 6: 补充取消发布、非法 Frontmatter 和保存失败覆盖**

继续在测试文件追加以下测试，避免成功路径掩盖错误映射：

```js
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
```

- [ ] **Step 7: 再次运行单文件测试**

Run: `node --test tests/perlite-publish-toggle.test.mjs`

Expected: PASS，共 13 项测试通过。

- [ ] **Step 8: 运行类型检查和生产构建**

Run: `npm run build`

Expected: PASS，TypeScript 无错误，esbuild 成功生成被 `.gitignore` 忽略的 `main.js`。

- [ ] **Step 9: 提交命令集成**

```bash
git add features/perlite-publish-toggle.ts tests/perlite-publish-toggle.test.mjs main.ts
git commit -m "feat: 添加当前文档发布状态命令"
```

### Task 3: 用户文档与最终验证

**Files:**
- Modify: `README.md:7-61`
- Modify: `README.zh-CN.md:7-61`

**Interfaces:**
- Consumes: Task 2 注册的命令名称“切换当前文档发布状态”和固定字段 `perlite_publish`。
- Produces: 中英文一致的用户功能、行为边界和命令说明。

- [ ] **Step 1: 更新英文 README**

在 `README.md` 的 Features 中追加第 6 项：

```markdown
### 6. Perlite Publish Status Toggle
- Toggle the active Markdown note between `perlite_publish: true` and no publish field with a command that can be assigned a hotkey.
```

在 Behavior 中追加：

```markdown
### 6. Perlite Publish Status Toggle
- The command writes the YAML boolean `perlite_publish: true` when the active note is unpublished, and removes the field when it is published.
- Notes without valid frontmatter are left unchanged and produce a notice.
- The command only changes the publish field. It does not run the Perlite publisher or synchronize content to a server.
```

在 Command 列表追加：

```markdown
- `切换当前文档发布状态`
```

- [ ] **Step 2: 更新中文 README**

在 `README.zh-CN.md` 的功能中追加第 6 项：

```markdown
### 6.切换 Perlite 发布状态
- 通过一个可绑定快捷键的命令，在当前 Markdown 文档的 `perlite_publish: true` 与无发布字段之间切换。
```

在行为中追加：

```markdown
### 6.切换 Perlite 发布状态
- 当前文档未发布时，命令写入 YAML 布尔值 `perlite_publish: true`；已发布时删除该字段。
- 没有有效 frontmatter 的文档保持不变，并显示提示。
- 命令只修改发布字段，不会运行 Perlite 发布器，也不会把内容同步到服务器。
```

在命令列表追加：

```markdown
- `切换当前文档发布状态`
```

- [ ] **Step 3: 运行完整自动化测试**

Run: `npm test`

Expected: PASS，原有 47 项测试和新增 13 项测试全部通过，共 60 项。

- [ ] **Step 4: 运行生产构建**

Run: `npm run build`

Expected: PASS，TypeScript 类型检查和生产打包均成功。

- [ ] **Step 5: 检查差异与工作区范围**

Run: `git diff --check && git status --short && git diff --stat HEAD`

Expected: `git diff --check` 无输出；只出现 `README.md` 与 `README.zh-CN.md` 的未提交修改，不包含 `main.js`、`node_modules`、`data.json` 或 Vault 文件。

- [ ] **Step 6: 提交用户文档**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: 说明发布状态切换命令"
```

- [ ] **Step 7: 最终核验提交和工作区**

Run: `git status --short --branch && git log -5 --oneline --decorate`

Expected: 工作区干净；当前分支为 `feat/perlite-publish-toggle`；最近提交依次包含文档说明、命令集成、文本切换、实施计划和设计文档。

## 实施完成后的审查要求

实现全部任务后，先使用 `requesting-code-review` 对照设计文档和本计划审查完整变更，再使用 `verification-before-completion` 重新运行 `npm test` 与 `npm run build`。只有最新命令输出均成功时，才能声明功能完成；随后使用 `finishing-a-development-branch`，并遵循仓库要求的 `agentsmd-superpowers-overrides` 收尾选择。
