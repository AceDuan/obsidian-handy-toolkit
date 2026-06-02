import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import esbuild from 'esbuild'

async function loadModule() {
	const outdir = await mkdtemp(join(tmpdir(), 'obsidian-handy-toolkit-test-'))
	const outfile = join(outdir, 'settings.mjs')

	await esbuild.build({
		entryPoints: ['features/settings.ts'],
		bundle: true,
		format: 'esm',
		platform: 'node',
		plugins: [{
			name: 'obsidian-stub',
			setup(build) {
				build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian-stub', namespace: 'obsidian-stub' }))
				build.onLoad({ filter: /.*/, namespace: 'obsidian-stub' }, () => ({
					contents: [
						'export class Plugin {}',
						'export class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin } }',
						'export class Setting { constructor() {} setName() { return this } setDesc() { return this } addToggle() { return this } addTextArea() { return this } }',
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

test('附件文件夹同步重命名默认关闭', async () => {
	const { DEFAULT_SETTINGS } = await loadModule()

	assert.equal(DEFAULT_SETTINGS.syncAssetFolderOnRename, false)
})

test('只有开启重命名 title 同步后才显示附件文件夹同步开关', async () => {
	const { shouldShowAssetFolderRenameSetting } = await loadModule()

	assert.equal(shouldShowAssetFolderRenameSetting({ syncFrontmatterTitleOnRename: false }), false)
	assert.equal(shouldShowAssetFolderRenameSetting({ syncFrontmatterTitleOnRename: true }), true)
})

test('只有开启附件文件夹同步后才显示依赖状态', async () => {
	const { shouldShowAssetFolderRenameDependencyStatus } = await loadModule()

	assert.equal(shouldShowAssetFolderRenameDependencyStatus({ syncFrontmatterTitleOnRename: false, syncAssetFolderOnRename: false }), false)
	assert.equal(shouldShowAssetFolderRenameDependencyStatus({ syncFrontmatterTitleOnRename: true, syncAssetFolderOnRename: false }), false)
	assert.equal(shouldShowAssetFolderRenameDependencyStatus({ syncFrontmatterTitleOnRename: true, syncAssetFolderOnRename: true }), true)
})

test('附件文件夹同步关闭时显示白色 CAL 默认提示', async () => {
	const { getAssetFolderRenameDependencyStatusText, getAssetFolderRenameDependencyStatusTone } = await loadModule()

	assert.equal(await getAssetFolderRenameDependencyStatusText(null, { syncAssetFolderOnRename: false }), 'CAL插件未启用或配置不可用时不处理')
	assert.equal(await getAssetFolderRenameDependencyStatusTone(null, { syncAssetFolderOnRename: false }), 'normal')
})

test('附件文件夹同步依赖可用时显示当前附件位置', async () => {
	const { getAssetFolderRenameDependencyStatusText, getAssetFolderRenameDependencyStatusTone } = await loadModule()
	const vault = createVault({
		enabledPlugins: ['obsidian-custom-attachment-location'],
		customAttachmentLocationSettings: { attachmentFolderPath: '00_assets/${noteFilename}' },
	})

	assert.equal(await getAssetFolderRenameDependencyStatusText(vault, { syncAssetFolderOnRename: true }), '当前附件位置：00_assets/${noteFilename}')
	assert.equal(await getAssetFolderRenameDependencyStatusTone(vault, { syncAssetFolderOnRename: true }), 'success')
})

test('Custom Attachment Location 未安装时提示开关不会生效', async () => {
	const { getAssetFolderRenameDependencyStatusText, getAssetFolderRenameDependencyStatusTone } = await loadModule()
	const vault = createVault({
		enabledPlugins: [],
		customAttachmentLocationInstalled: false,
	})

	assert.equal(await getAssetFolderRenameDependencyStatusText(vault, { syncAssetFolderOnRename: true }), 'Custom Attachment Location 未安装，此开关不会生效。')
	assert.equal(await getAssetFolderRenameDependencyStatusTone(vault, { syncAssetFolderOnRename: true }), 'error')
})

test('Custom Attachment Location 未启用时提示开关不会生效', async () => {
	const { getAssetFolderRenameDependencyStatusText, getAssetFolderRenameDependencyStatusTone } = await loadModule()
	const vault = createVault({
		enabledPlugins: [],
		customAttachmentLocationInstalled: true,
	})

	assert.equal(await getAssetFolderRenameDependencyStatusText(vault, { syncAssetFolderOnRename: true }), 'Custom Attachment Location 未启用，此开关不会生效。')
	assert.equal(await getAssetFolderRenameDependencyStatusTone(vault, { syncAssetFolderOnRename: true }), 'error')
})

test('Custom Attachment Location 配置不可读时提示开关不会生效', async () => {
	const { getAssetFolderRenameDependencyStatusText, getAssetFolderRenameDependencyStatusTone } = await loadModule()
	const vault = createVault({
		enabledPlugins: ['obsidian-custom-attachment-location'],
		shouldFailReadingSettings: true,
	})

	assert.equal(await getAssetFolderRenameDependencyStatusText(vault, { syncAssetFolderOnRename: true }), '无法读取 Custom Attachment Location 配置，此开关不会生效。')
	assert.equal(await getAssetFolderRenameDependencyStatusTone(vault, { syncAssetFolderOnRename: true }), 'error')
})

test('Custom Attachment Location 附件位置不含笔记名变量时提示开关不会生效', async () => {
	const { getAssetFolderRenameDependencyStatusText, getAssetFolderRenameDependencyStatusTone } = await loadModule()
	const vault = createVault({
		enabledPlugins: ['obsidian-custom-attachment-location'],
		customAttachmentLocationSettings: { attachmentFolderPath: '00_assets' },
	})

	assert.equal(await getAssetFolderRenameDependencyStatusText(vault, { syncAssetFolderOnRename: true }), '附件位置未包含笔记名变量，此开关不会生效。')
	assert.equal(await getAssetFolderRenameDependencyStatusTone(vault, { syncAssetFolderOnRename: true }), 'error')
})

function createVault({
	enabledPlugins,
	customAttachmentLocationInstalled = true,
	customAttachmentLocationSettings = {},
	shouldFailReadingSettings = false,
}) {
	return {
		configDir: '.obsidian',
		adapter: {
			async exists(path) {
				return path === '.obsidian/plugins/obsidian-custom-attachment-location/manifest.json' && customAttachmentLocationInstalled
			},
			async read(path) {
				if (path === '.obsidian/community-plugins.json') {
					return JSON.stringify(enabledPlugins)
				}

				if (path === '.obsidian/plugins/obsidian-custom-attachment-location/data.json') {
					if (shouldFailReadingSettings) {
						throw new Error('读不到配置')
					}

					return JSON.stringify(customAttachmentLocationSettings)
				}

				throw new Error(`未预期读取：${path}`)
			},
		},
	}
}
