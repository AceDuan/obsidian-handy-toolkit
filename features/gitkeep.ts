import { Notice, Plugin } from 'obsidian'

const GITKEEP_DIRS = ['00_Inbox', '00_Moved', 'Clippings']

export function registerGitkeepCommand(plugin: Plugin) {
	plugin.addCommand({
		id: 'generate-gitkeep',
		name: '为目录生成 .gitkeep 文件',
		callback: () => {
			let created = 0
			let skipped = 0

			const promises = GITKEEP_DIRS.map(async (dirPath) => {
				const gitkeepPath = `${dirPath}/.gitkeep`
				if (plugin.app.vault.getAbstractFileByPath(gitkeepPath)) {
					skipped++
					return
				}
				await plugin.app.vault.create(gitkeepPath, '')
				created++
			})

			Promise.all(promises).then(() => {
				const messages: string[] = []
				if (created > 0) messages.push(`已创建 ${created} 个`)
				if (skipped > 0) messages.push(`已跳过 ${skipped} 个（已存在）`)
				if (messages.length === 0) messages.push('无需操作')
				new Notice(messages.join('，'))
			})
		},
	})
}
