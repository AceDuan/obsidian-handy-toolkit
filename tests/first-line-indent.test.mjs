import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import esbuild from 'esbuild'

async function loadModule() {
	const outdir = await mkdtemp(join(tmpdir(), 'obsidian-handy-toolkit-test-'))
	const outfile = join(outdir, 'first-line-indent.mjs')

	await esbuild.build({
		entryPoints: ['features/first-line-indent.ts'],
		bundle: true,
		format: 'esm',
		platform: 'node',
		plugins: [{
			name: 'obsidian-stub',
			setup(build) {
				build.onResolve({ filter: /^obsidian$/ }, () => ({
					path: 'obsidian-stub',
					namespace: 'obsidian-stub',
				}))
				build.onLoad({ filter: /.*/, namespace: 'obsidian-stub' }, () => ({
					contents: [
						'export class App {}',
						'export class MarkdownView {}',
						'export class Plugin {}',
					].join('\n'),
					loader: 'js',
				}))
			},
		}],
		outfile,
	})

	return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

test('源码模式首行缩进排除 frontmatter 整行', async () => {
	const style = await readFile('styles.css', 'utf8')

	assert.match(style, /div\.cm-line[\s\S]*:not\(:has\(\.cm-hmd-frontmatter\)\)[\s\S]*\{\s*text-indent: 2em;/)
})

test('frontmatter 不再使用负边距抵消首行缩进', async () => {
	const style = await readFile('styles.css', 'utf8')

	assert.doesNotMatch(style, /\.cm-hmd-frontmatter:first-of-type[\s\S]*?margin-left:\s*-2em/)
})

test('首行缩进样式不再由运行时代码注入', async () => {
	const module = await loadModule()

	assert.equal(module.injectIndentStyle, undefined)
	assert.equal(module.getIndentStyle, undefined)
})
