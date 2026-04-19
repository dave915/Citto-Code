import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const moduleCache = new Map()

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function resolveFromRoot(...segments) {
  return path.join(rootDir, ...segments)
}

function loadTsModule(filePath) {
  const normalizedPath = path.resolve(filePath)
  if (moduleCache.has(normalizedPath)) {
    return moduleCache.get(normalizedPath)
  }

  const source = readFileSync(filePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  })

  const module = { exports: {} }
  moduleCache.set(normalizedPath, module.exports)
  const nodeRequire = createRequire(pathToFileURL(filePath).href)
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) {
      return nodeRequire(specifier)
    }

    const resolvedBase = path.resolve(path.dirname(filePath), specifier)
    const candidates = [
      resolvedBase,
      `${resolvedBase}.ts`,
      `${resolvedBase}.tsx`,
      `${resolvedBase}.js`,
      path.join(resolvedBase, 'index.ts'),
      path.join(resolvedBase, 'index.tsx'),
      path.join(resolvedBase, 'index.js'),
    ]

    for (const candidate of candidates) {
      try {
        if (candidate.endsWith('.ts') || candidate.endsWith('.tsx')) {
          return loadTsModule(candidate)
        }
        return nodeRequire(candidate)
      } catch {
        // Try next candidate.
      }
    }

    return nodeRequire(specifier)
  }
  const execute = new Function('exports', 'module', 'require', '__filename', '__dirname', compiled.outputText)
  execute(module.exports, module, localRequire, filePath, path.dirname(filePath))
  moduleCache.set(normalizedPath, module.exports)
  return module.exports
}

const claudeRuntimeModulePath = resolveFromRoot('src', 'lib', 'claudeRuntime.ts')
const {
  buildAutoHtmlPreviewInstruction,
  shouldAutoGenerateHtmlPreview,
} = loadTsModule(claudeRuntimeModulePath)

const localServerPrompt = `로컬 서버 데모를 만들어줘.

요구사항:

/ 는 홈
/about.html 파일 생성
/about 링크로 이동하면 최종적으로 about 페이지가 보이게 해줘
redirect 또는 rewrite 가 필요한 경우 그 방식으로 처리해줘
HTML preview 에서 바로 확인 가능하게 해줘`

assert.equal(
  shouldAutoGenerateHtmlPreview(localServerPrompt, [], true),
  true,
  'local server demo prompts should still trigger auto preview guidance',
)

const localServerInstruction = buildAutoHtmlPreviewInstruction(localServerPrompt, '/tmp/demo-project', 'ko')
assert.match(
  localServerInstruction,
  /로컬 서버 기반 미리보기 데모/,
  'local server prompts should receive the server-preview instruction branch',
)
assert.match(
  localServerInstruction,
  /\/tmp\/demo-project\/\.citto-code\/previews\/visual-demo-[0-9]{8}-[0-9]{6}/,
  'local server prompts should target the preview output directory rather than a single fixed file',
)
assert.match(
  localServerInstruction,
  /localhost URL/,
  'local server prompts should explicitly require exposing a localhost URL',
)
assert.doesNotMatch(
  localServerInstruction,
  /다음 단일 파일에 작성하세요/,
  'local server prompts must not be forced into the single-file static preview instruction',
)

const staticPreviewPrompt = '간단한 HTML preview 데모를 만들어줘.'
assert.equal(
  shouldAutoGenerateHtmlPreview(staticPreviewPrompt, [], true),
  true,
  'plain HTML preview prompts should still trigger auto preview guidance',
)

const staticPreviewInstruction = buildAutoHtmlPreviewInstruction(staticPreviewPrompt, '/tmp/demo-project', 'ko')
assert.match(
  staticPreviewInstruction,
  /다음 단일 파일에 작성하세요/,
  'plain HTML preview prompts should keep the single-file instruction branch',
)
assert.match(
  staticPreviewInstruction,
  /self-contained 단일 HTML 파일/,
  'plain HTML preview prompts should keep the self-contained static preview guidance',
)

const realAppPrompt = 'Vite React 앱을 만들고 npm run dev로 실행해줘.'
assert.equal(
  shouldAutoGenerateHtmlPreview(realAppPrompt, [], true),
  false,
  'real app prompts should continue to skip the auto HTML preview transform',
)

console.log('Auto preview runtime check passed.')
