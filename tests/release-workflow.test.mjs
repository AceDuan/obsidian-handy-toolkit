import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('发布工作流生成来源证明并上传必需资产', async () => {
	const workflow = await readFile('.github/workflows/main.yml', 'utf8')

	assert.match(workflow, /-\s*'0\.\*'/)
	assert.match(workflow, /-\s*'v\*'/)
	assert.match(workflow, /npm ci/)
	assert.match(workflow, /npm test/)
	assert.match(workflow, /npm run build/)
	assert.match(workflow, /uses:\s*actions\/attest@v4/)
	assert.match(workflow, /subject-path:[\s\S]*main\.js[\s\S]*manifest\.json[\s\S]*styles\.css/)
	assert.match(workflow, /files:[\s\S]*main\.js[\s\S]*manifest\.json[\s\S]*styles\.css/)
	assert.match(workflow, /id-token:\s*write/)
	assert.match(workflow, /attestations:\s*write/)
})

test('打包配置使用 Node 内建模块列表', async () => {
	const esbuildConfig = await readFile('esbuild.config.mjs', 'utf8')

	assert.match(esbuildConfig, /from\s+"node:module"/)
	assert.doesNotMatch(esbuildConfig, /builtin-modules/)
})
