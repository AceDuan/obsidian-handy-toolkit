import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import esbuild from 'esbuild'

async function loadModule() {
	const outdir = await mkdtemp(join(tmpdir(), 'handy-toolkit-gitkeep-test-'))
	const outfile = join(outdir, 'gitkeep.mjs')

	await esbuild.build({
		entryPoints: ['features/gitkeep.ts'],
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
						'export class Plugin {}',
						'export class Notice { constructor(message) { globalThis.__handyToolkitNotices.push(message) } }',
					].join('\n'),
					loader: 'js',
				}))
			},
		}],
		outfile,
	})

	return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

function createPlugin() {
	globalThis.__handyToolkitNotices = []
	const commands = []

	return {
		commands,
		plugin: {
			app: {
				vault: {
					getAbstractFileByPath: () => null,
					create: async () => {
						throw new Error('创建失败')
					},
				},
			},
			addCommand(command) {
				commands.push(command)
			},
		},
	}
}

test('创建 .gitkeep 失败时显示失败通知', async () => {
	const { registerGitkeepCommand } = await loadModule()
	const { commands, plugin } = createPlugin()
	registerGitkeepCommand(plugin)

	commands[0].callback()
	await new Promise((resolve) => setImmediate(resolve))

	assert.deepEqual(globalThis.__handyToolkitNotices, ['生成 .gitkeep 文件失败：创建失败'])
})
