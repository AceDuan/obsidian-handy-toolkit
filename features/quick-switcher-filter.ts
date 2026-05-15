import { Plugin } from 'obsidian'

type FileLike = {
	path: string
}

type QuickSwitcherFilterPlugin = Plugin & {
	settings: {
		quickSwitcherHiddenFolders: string
	}
}

type PatchTarget = {
	target: Record<string, unknown>
	key: string
	hadOwnProperty: boolean
	original: (...args: unknown[]) => unknown
}

const QUICK_SWITCHER_METHODS = ['getItems', 'getSuggestions']
const QUICK_SWITCHER_CHILD_KEYS = ['modal', 'chooser', 'suggest', 'quickSwitcher', 'QuickSwitcherModal', 'activeModal']

function normalizeFolderPath(path: string) {
	return path
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.trim()
		.replace(/^\/+|\/+$/g, '')
}

function normalizeFilePath(path: string) {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/g, '')
}

// 快速切换过滤：解析逗号分隔的库内文件夹路径，去重并移除无效空值。
export function parseHiddenFolderSetting(value: string) {
	const seen = new Set<string>()
	const folders: string[] = []

	for (const part of value.split(',')) {
		const folder = normalizeFolderPath(part)

		if (!folder || seen.has(folder)) {
			continue
		}

		seen.add(folder)
		folders.push(folder)
	}

	return folders
}

export function createQuickSwitcherFileFilter(hiddenFolderSetting: string) {
	const hiddenFolders = parseHiddenFolderSetting(hiddenFolderSetting)

	return (file: FileLike) => {
		const filePath = normalizeFilePath(file.path)
		return !hiddenFolders.some((folder) => filePath.startsWith(`${folder}/`))
	}
}

function getFilePathFromItem(item: unknown): string | null {
	if (!item || typeof item !== 'object') {
		return null
	}

	const record = item as Record<string, unknown>

	if (typeof record.path === 'string') {
		return record.path
	}

	for (const key of ['file', 'item']) {
		const nested = record[key]

		if (nested && typeof nested === 'object' && typeof (nested as Record<string, unknown>).path === 'string') {
			return (nested as Record<string, string>).path
		}
	}

	return null
}

function filterQuickSwitcherResult(result: unknown, hiddenFolderSetting: string) {
	if (!Array.isArray(result)) {
		return result
	}

	const shouldShowFile = createQuickSwitcherFileFilter(hiddenFolderSetting)

	return result.filter((item) => {
		const path = getFilePathFromItem(item)
		return !path || shouldShowFile({ path })
	})
}

function getQuickSwitcherInstance(plugin: QuickSwitcherFilterPlugin) {
	const appRecord = plugin.app as unknown as Record<string, unknown>
	const internalPlugins = appRecord.internalPlugins as
		| {
				getPluginById?: (id: string) => unknown
		  }
		| undefined
	const switcherPlugin = internalPlugins?.getPluginById?.('switcher')

	if (!switcherPlugin || typeof switcherPlugin !== 'object') {
		return null
	}

	const record = switcherPlugin as Record<string, unknown>
	return record.instance ?? switcherPlugin
}

function collectPatchCandidates(root: unknown) {
	const candidates: Record<string, unknown>[] = []
	const visited = new Set<unknown>()
	const queue: unknown[] = [root]

	while (queue.length > 0 && candidates.length < 32) {
		const item = queue.shift()

		if (!item || (typeof item !== 'object' && typeof item !== 'function') || visited.has(item)) {
			continue
		}

		visited.add(item)
		const record = item as Record<string, unknown>
		candidates.push(record)

		if (typeof item === 'function') {
			queue.push(record.prototype)
		}

		for (const key of QUICK_SWITCHER_CHILD_KEYS) {
			queue.push(record[key])
		}
	}

	return candidates
}

function getPatchTargets(candidate: Record<string, unknown>) {
	const targets: Record<string, unknown>[] = []
	let current: Record<string, unknown> | null = candidate

	while (current && current !== Object.prototype) {
		targets.push(current)
		current = Object.getPrototypeOf(current) as Record<string, unknown> | null
	}

	return targets
}

function patchMethod(plugin: QuickSwitcherFilterPlugin, patches: PatchTarget[], target: Record<string, unknown>, key: string) {
	const original = target[key] as unknown
	const hadOwnProperty = Object.prototype.hasOwnProperty.call(target, key)

	if (typeof original !== 'function' || patches.some((patch) => patch.target === target && patch.key === key)) {
		return
	}

	const originalMethod = original as (...args: unknown[]) => unknown

	target[key] = function patchedQuickSwitcherMethod(this: unknown, ...args: unknown[]) {
		const result = originalMethod.apply(this, args)

		if (result instanceof Promise) {
			return result.then((resolved) =>
				filterQuickSwitcherResult(resolved, plugin.settings.quickSwitcherHiddenFolders),
			)
		}

		return filterQuickSwitcherResult(result, plugin.settings.quickSwitcherHiddenFolders)
	}

	patches.push({ target, key, hadOwnProperty, original: originalMethod })
}

export function registerQuickSwitcherFilter(plugin: QuickSwitcherFilterPlugin) {
	const patches: PatchTarget[] = []

	const applyPatches = () => {
		const quickSwitcherInstance = getQuickSwitcherInstance(plugin)

		for (const candidate of collectPatchCandidates(quickSwitcherInstance)) {
			for (const target of getPatchTargets(candidate)) {
				for (const method of QUICK_SWITCHER_METHODS) {
					patchMethod(plugin, patches, target, method)
				}
			}
		}
	}

	plugin.app.workspace.onLayoutReady(applyPatches)

	plugin.register(() => {
		for (const patch of patches) {
			if (patch.hadOwnProperty) {
				patch.target[patch.key] = patch.original
			} else {
				delete patch.target[patch.key]
			}
		}
	})
}
