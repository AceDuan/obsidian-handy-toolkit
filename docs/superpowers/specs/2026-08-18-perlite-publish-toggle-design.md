# 当前文档 Perlite 发布状态切换设计

## 背景

Perlite 发布器把个人 Obsidian Vault 作为事实源，只选择 Frontmatter 中 `perlite_publish` 为 YAML 布尔值 `true` 的 Markdown 文档。字段缺失、值为 `false`、字符串 `"true"` 或其他类型时均不发布。

当前发布标记需要在 Obsidian 属性面板中逐篇手工维护。参考 Vault 的修改区显示，多篇文档为了发布新增了 `perlite_publish: true`，同时触发了 `updated` 字段变化。本功能旨在通过一个可绑定快捷键的 Obsidian 命令，快速切换当前文档的发布标记；它不负责构建发布副本或同步 NAS。

## 目标

- 提供一个“切换当前文档发布状态”命令。
- 当前文档未发布时写入 `perlite_publish: true`。
- 当前文档已发布时删除整个 `perlite_publish` 属性，不保留显式 `false`。
- 保留 Frontmatter 的字段顺序、注释、引号、空行、换行符和正文。
- 对不能安全处理的文档只给出提示，不创建或修复 Frontmatter。
- 不改变现有 `updated` 字段同步规则，不自动运行 Perlite 发布器。

## 非目标

- 不增加右键菜单、Ribbon 图标、文档顶部按钮或默认快捷键。
- 不增加插件设置项，也不允许配置发布字段名。
- 不为缺少 Frontmatter 的文档自动创建 Frontmatter。
- 不修复非法 YAML、重复字段或未闭合的 Frontmatter。
- 不自动执行本地发布器、SSH、rsync 或任何 NAS 操作。
- 不批量修改多个文档。

## 方案选择

### 方案一：文本级切换

读取最新文件内容，使用 YAML 解析结果判断发布状态，只对顶层 `perlite_publish` 属性所在行或 Frontmatter 末尾做局部文本变换。

优点是能保留现有 Frontmatter 格式，并与仓库中 `frontmatter-text-updater` 的设计取向一致。代价是需要明确处理分隔符、换行符、顶层字段定位和异常 YAML。

### 方案二：`processFrontMatter`

通过 Obsidian `FileManager.processFrontMatter` 增删属性。实现较短，但会重新序列化整个 YAML，可能改变空行、引号或字段表现形式。仓库已有功能曾专门改为文本级单行更新，以避免这类无关差异。

### 方案三：编辑器事务

直接修改活动编辑器内容，可以进入编辑器撤销历史，但会把功能绑定到编辑器实例。阅读模式、活动文件与编辑器缓冲区同步等情况会增加复杂度，不适合只依赖当前 Markdown 文件的命令。

采用方案一。它以较小且可测试的文本变换换取对用户文档格式的严格保护。

## 架构

新增 `features/perlite-publish-toggle.ts`，职责包括：

- 识别并解析文档 Frontmatter；
- 判断顶层 `perlite_publish` 是否为 YAML 布尔值 `true`；
- 生成只影响目标属性的下一版文档内容；
- 读取和保存当前 Markdown 文件；
- 注册命令并显示结果通知。

`main.ts` 只导入并调用命令注册函数，不承载发布状态业务逻辑。该功能不增加设置，因此 `features/settings.ts` 和插件数据格式均不变。

核心文本变换实现为纯函数。输入为完整文档文本，输出为带判别字段的结果，至少包含：

- 成功发布以及修改后的内容；
- 成功取消发布以及修改后的内容；
- 缺少或未闭合 Frontmatter；
- Frontmatter 无法解析；
- 文本结构与解析结果不一致，无法安全定位目标字段。

纯函数不读取文件、不显示通知，便于覆盖边界条件。文件读写和用户提示保留在命令执行层。

## 命令与数据流

命令 ID 固定为 `toggle-perlite-publish-current-file`，显示名称为“切换当前文档发布状态”。不注册默认快捷键，用户可在 Obsidian 的快捷键设置中自行绑定。

命令使用 `checkCallback`：只有活动文件存在且扩展名为 `md` 时才可执行。命令不依赖编辑模式，因此在源码模式、实时预览和阅读模式中行为一致。

执行流程如下：

```text
运行命令
  → 获取当前活动 Markdown 文件
  → 从 Vault 读取最新完整内容
  → 识别并解析 Frontmatter
  → 读取顶层 perlite_publish 的 YAML 类型和值
  → 值为布尔 true：删除目标属性行
  → 其他有效状态：新增属性或原位改写为 perlite_publish: true
  → 通过一次 vault.modify 保存完整结果
  → 显示成功通知
```

状态判定以 YAML 解析结果为准，而不是简单比较字符串。因此 YAML 能解析成布尔真的合法写法都视为已发布；字符串 `"true"` 不视为已发布。插件写入时统一使用小写的 `perlite_publish: true`。

## 文本变换规则

1. 文档第一行必须是独占一行的 `---`，并存在对应的独占结束分隔符。
2. 解析开始和结束分隔符之间的 YAML，并要求结果为键值映射或空值。
3. 只定位零缩进的顶层 `perlite_publish` 属性，不修改嵌套对象中的同名键；如果文本中出现多个顶层同名属性，则直接报告结构不一致。
4. 如果顶层解析值为布尔 `true`，删除该属性所在的整行；该行自己的行尾注释随属性一同删除。
5. 如果顶层字段存在但不是布尔 `true`，在原位置把值规范化为布尔 `true`，并保留该行已有的缩进风格、冒号间距和行尾注释。
6. 如果字段缺失，在结束分隔符前的尾部空行区域之前插入 `perlite_publish: true`。
7. 自动识别并保留原文的 LF 或 CRLF 换行符。
8. 除目标属性行外，不改写其他 Frontmatter 文本或正文。
9. 插入后再取消发布，应恢复插入前的完整文本。

如果 YAML 解析结果表示存在顶层目标键，但文本定位不到唯一的顶层属性行，视为结构不一致并停止。这样可以避免在多行键、重复键或其他异常结构中猜测性修改。

## 交互与错误处理

成功发布后显示“已将当前文档设为发布”。成功取消发布后显示“已取消当前文档发布”。

以下情况不写文件：

- 缺少 Frontmatter：提示“当前文档没有 Frontmatter，无法设置发布状态”。
- Frontmatter 未闭合：提示“当前文档的 Frontmatter 未闭合，无法设置发布状态”。
- YAML 解析失败或不是可处理的键值映射：提示“当前文档的 Frontmatter 无法解析，未修改发布状态”。
- 目标字段无法安全定位：提示“无法安全定位 perlite_publish 属性，未修改发布状态”。
- 文件读取或保存失败：显示“切换当前文档发布状态失败”，并用中文上下文记录原始错误到控制台。

任何失败都不执行部分写入。单次成功操作只调用一次 `vault.modify`。

插件直接执行的 `vault.modify` 不应伪装成编辑器保存事件。现有 `updated-field-on-modify` 功能只消费由 `quick-preview` 建立的编辑器保存许可，因此本命令不主动更新 `updated`；这避免把发布决策混同为正文编辑时间。

## 测试设计

新增独立测试文件，沿用仓库现有 Node 测试和 esbuild 加载方式，覆盖纯文本变换与命令集成。

纯函数测试包括：

- 字段缺失时写入 YAML 布尔值 `true`；
- 布尔值 `true` 时删除属性；
- `false`、空值和字符串 `"true"` 时原位规范化为布尔值 `true`；
- 保留其他字段、字段顺序、注释、引号、正文和 LF/CRLF，并在原位更新时保留目标行的行尾注释；
- 不误改嵌套同名字段；
- 无 Frontmatter、未闭合 Frontmatter、非法 YAML 和结构不一致时不修改；
- “发布后取消发布”完整文本往返一致。

命令测试包括：

- 注册固定命令 ID 和中文名称；
- 没有活动文件或活动文件不是 Markdown 时命令不可执行；
- 缺少 Frontmatter 时显示提示且不保存；
- 发布和取消发布各只保存一次并显示正确通知；
- 读取或保存失败时显示失败通知并保留错误上下文。

完成实现后运行：

```bash
npm test
npm run build
```

全部既有测试和新增测试必须通过，构建必须成功。

## 验收标准

- 用户可为命令绑定快捷键，并在任意 Markdown 阅读或编辑视图中切换当前文档状态。
- 未发布文档执行一次后出现顶层 `perlite_publish: true`，可被现有 Perlite 发布器选中。
- 已发布文档执行一次后不再包含顶层 `perlite_publish`，下一次运行发布器时会取消发布。
- 缺少或损坏 Frontmatter 时文档保持不变，并得到明确提示。
- 操作不造成目标属性之外的文本差异，也不主动改变 `updated`。
- 完整测试和构建验证通过。

## 参考证据

- `services/perlite/publisher/src/perlite_publisher/notes.py`：发布器只选择元数据值严格为布尔 `True` 的文档。
- `services/perlite/publisher/README.md`：缺失、`false`、字符串 `"true"` 等状态均不发布。
- `utils/frontmatter-text-updater.ts`：当前插件已有保留 Frontmatter 原始文本格式的单字段更新模式。
- Obsidian 命令 API 支持使用 `checkCallback` 根据当前上下文控制命令可用性。
