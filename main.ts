import { Plugin } from 'obsidian'

// 属性折叠功能
import {
	registerCollapsePropertiesCommand,	// 注册“折叠当前文件属性”命令
} from './features/collapse-properties'

// 首行缩进功能
import {
	cleanupIndentFeatureState,	// 卸载插件时移除首行缩进 body 状态类
	injectIndentStyle,			// 注入首行缩进功能所需 CSS
	processIndentParagraphs,		// 阅读模式渲染后处理段落和 <br> 拆行缩进
	refreshMarkdownViews,		// 设置变化后刷新 Markdown 编辑器和预览
	updateIndentFeatureState,	// 根据设置开关更新首行缩进启用状态
} from './features/first-line-indent'

// 图片重排功能
import {
	registerImageRenameCommand,	// 注册“按正文顺序重命名当前笔记图片”命令
} from './features/image-renamer'

// 快速切换过滤功能
import {
	registerQuickSwitcherFilter,	// 按配置隐藏快速切换中的特定文件夹文件
} from './features/quick-switcher-filter'

// .gitkeep 生成功能
import {
	registerGitkeepCommand,	// 注册"为目录生成 .gitkeep 文件"命令
} from './features/gitkeep'

// 插件设置
import {
	DEFAULT_SETTINGS,			// 插件默认设置
	HandyToolkitSettingTab,		// 插件设置页
	HandyToolkitSettings,		// 插件设置类型
} from './features/settings'

// 插件入口：协调各独立功能模块的注册、设置加载和卸载清理。
export default class ObsidianHandyToolkit extends Plugin {
	settings!: HandyToolkitSettings

	// 设置管理：读取插件设置，并与默认值合并。
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	// 设置管理：保存插件设置，并刷新首行缩进功能状态。
	async saveSettings() {
		await this.saveData(this.settings)
		updateIndentFeatureState(this.settings.enableFirstLineIndent)
		refreshMarkdownViews(this.app)
	}

	// 插件入口：注册样式、渲染处理器、命令和设置页。
	async onload() {
		await this.loadSettings()

		injectIndentStyle(this)
		updateIndentFeatureState(this.settings.enableFirstLineIndent)

		this.registerMarkdownPostProcessor((el) => processIndentParagraphs(el, this.settings.enableFirstLineIndent))

		registerCollapsePropertiesCommand(this)
		registerImageRenameCommand(this)
		registerQuickSwitcherFilter(this)
		registerGitkeepCommand(this)

		this.addSettingTab(new HandyToolkitSettingTab(this.app, this))
	}

	// 插件卸载：清理运行时添加到 body 上的状态类名。
	onunload() {
		cleanupIndentFeatureState()
	}
}
