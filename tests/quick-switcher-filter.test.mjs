import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import esbuild from 'esbuild'

async function loadModule() {
	const outdir = await mkdtemp(join(tmpdir(), 'obsidian-handy-toolkit-test-'))
	const outfile = join(outdir, 'quick-switcher-filter.mjs')

	await esbuild.build({
		entryPoints: ['features/quick-switcher-filter.ts'],
		bundle: true,
		format: 'esm',
		platform: 'node',
		external: ['obsidian'],
		outfile,
	})
	return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`)
}

test('逗号分隔的隐藏文件夹会被规范化', async () => {
	const { parseHiddenFolderSetting } = await loadModule()

	assert.deepEqual(parseHiddenFolderSetting(' Archive, /Templates/private/ ,, Inbox\\\\Drafts '), [
		'Archive',
		'Templates/private',
		'Inbox/Drafts',
	])
})

test('隐藏文件夹会匹配自身目录下的所有文件，但不会误伤同名前缀目录', async () => {
	const { createQuickSwitcherFileFilter } = await loadModule()
	const shouldShowFile = createQuickSwitcherFileFilter('Archive, Templates/private')

	assert.equal(shouldShowFile({ path: 'Archive/note.md' }), false)
	assert.equal(shouldShowFile({ path: 'Archive/deep/note.md' }), false)
	assert.equal(shouldShowFile({ path: 'Archive.md' }), true)
	assert.equal(shouldShowFile({ path: 'Archive-old/note.md' }), true)
	assert.equal(shouldShowFile({ path: 'Templates/private/template.md' }), false)
	assert.equal(shouldShowFile({ path: 'Templates/public/template.md' }), true)
})

test('快速切换补丁会覆盖 QuickSwitcherModal 父级原型上的候选方法', async () => {
	const { registerQuickSwitcherFilter } = await loadModule()
	const disposers = []

	class BaseQuickSwitcherModal {
		getSuggestions() {
			return [
				{ file: { path: '00_assets/image.webp' } },
				{ file: { path: 'Notes/note.md' } },
			]
		}
	}

	class QuickSwitcherModal extends BaseQuickSwitcherModal {}

	const switcherInstance = { QuickSwitcherModal }
	const plugin = {
		settings: { quickSwitcherHiddenFolders: '00_assets' },
		app: {
			workspace: {
				onLayoutReady(callback) {
					callback()
				},
			},
			internalPlugins: {
				getPluginById(id) {
					return id === 'switcher' ? { instance: switcherInstance } : null
				},
			},
		},
		register(disposer) {
			disposers.push(disposer)
		},
	}

	registerQuickSwitcherFilter(plugin)

	assert.deepEqual(new QuickSwitcherModal().getSuggestions(), [{ file: { path: 'Notes/note.md' } }])

	for (const disposer of disposers) {
		disposer()
	}

	assert.deepEqual(new QuickSwitcherModal().getSuggestions(), [
		{ file: { path: '00_assets/image.webp' } },
		{ file: { path: 'Notes/note.md' } },
	])
})
