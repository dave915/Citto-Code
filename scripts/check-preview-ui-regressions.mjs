import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

const sizingModulePath = resolveFromRoot('src', 'components', 'toolcalls', 'htmlPreviewSizing.ts')
const {
  getPreviewMinimumHeight,
  isViewportSizedPreview,
  resolvePreviewFrameHeight,
} = loadTsModule(sizingModulePath)
const previewSelectionModulePath = resolveFromRoot('src', 'components', 'chat', 'htmlPreviewSourceSelection.ts')
const {
  resolveHtmlPreviewSourceSelection,
} = loadTsModule(previewSelectionModulePath)
const chatViewUtilsModulePath = resolveFromRoot('src', 'components', 'chat', 'chatViewUtils.ts')
const {
  buildChatViewDerivedState,
} = loadTsModule(chatViewUtilsModulePath)
const htmlPreviewModulePath = resolveFromRoot('src', 'lib', 'toolcalls', 'htmlPreview.ts')
const {
  extractHtmlPreviewCandidates,
} = loadTsModule(htmlPreviewModulePath)

const centeredViewportHtml = readFileSync(
  resolveFromRoot('scripts', 'fixtures', 'html-preview', 'centered-viewport.html'),
  'utf8',
)
const flowContentHtml = readFileSync(
  resolveFromRoot('scripts', 'fixtures', 'html-preview', 'flow-content.html'),
  'utf8',
)
const routingDemoHtml = readFileSync(
  resolveFromRoot('scripts', 'fixtures', 'html-preview', 'routing-demo.html'),
  'utf8',
)

assert.equal(
  isViewportSizedPreview(centeredViewportHtml),
  true,
  'centered min-height:100vh fixture must be treated as a viewport layout',
)
assert.equal(
  isViewportSizedPreview(flowContentHtml),
  false,
  'regular document flow fixture must not be treated as a viewport layout',
)
assert.equal(
  isViewportSizedPreview(routingDemoHtml),
  false,
  'pages with root min-height:100vh must not be misclassified just because child elements use fixed positioning or centered flex layouts',
)

const viewportMinimumHeight = getPreviewMinimumHeight(true, 1000)
assert.equal(viewportMinimumHeight, 580, 'viewport preview minimum height should stay bounded for a typical app window')
assert.equal(getPreviewMinimumHeight(false, 1000), 420, 'document flow previews should keep the standard minimum height')

assert.equal(
  resolvePreviewFrameHeight({
    isUrlPreview: false,
    isViewportLayout: true,
    measuredHeight: 1600,
    minimumFrameHeight: viewportMinimumHeight,
  }),
  viewportMinimumHeight,
  'viewport static previews must ignore oversized measured heights and stay on the bounded frame height',
)

assert.equal(
  resolvePreviewFrameHeight({
    isUrlPreview: false,
    isViewportLayout: false,
    measuredHeight: 640,
    minimumFrameHeight: 420,
  }),
  640,
  'document flow previews must still honor measured content height',
)
assert.equal(
  resolvePreviewFrameHeight({
    isUrlPreview: false,
    isViewportLayout: false,
    measuredHeight: 980,
    minimumFrameHeight: 420,
  }),
  980,
  'long static previews that were previously misclassified as viewport layouts must expand to their measured content height',
)

assert.deepEqual(
  resolveHtmlPreviewSourceSelection({
    sources: [{ id: 'file:/tmp/index.html', kind: 'file' }],
    selectedSourceId: null,
    selectionMode: 'auto',
  }),
  {
    selectedSourceId: 'file:/tmp/index.html',
    selectionMode: 'auto',
  },
  'when only a file preview exists, auto selection should keep the file source',
)

assert.deepEqual(
  resolveHtmlPreviewSourceSelection({
    sources: [
      { id: 'url:http://localhost:3477', kind: 'url' },
      { id: 'file:/tmp/about.html', kind: 'file' },
    ],
    selectedSourceId: 'file:/tmp/about.html',
    selectionMode: 'auto',
  }),
  {
    selectedSourceId: 'url:http://localhost:3477',
    selectionMode: 'auto',
  },
  'auto selection should upgrade to the live localhost preview when it becomes available after a file preview',
)

assert.deepEqual(
  resolveHtmlPreviewSourceSelection({
    sources: [
      { id: 'url:http://localhost:3477', kind: 'url' },
      { id: 'file:/tmp/about.html', kind: 'file' },
    ],
    selectedSourceId: 'file:/tmp/about.html',
    selectionMode: 'manual',
  }),
  {
    selectedSourceId: 'file:/tmp/about.html',
    selectionMode: 'manual',
  },
  'manual source selection should not be overwritten just because a live localhost preview appears later',
)

const localServerTranscriptToolCalls = [
  {
    id: 'write-about',
    toolUseId: 'write-about',
    toolName: 'Write',
    toolInput: {
      file_path: '/Users/han/Desktop/demo/.citto-code/previews/visual-demo-20260419-130702/about.html',
      content: '<!doctype html><title>About</title>',
    },
    result: 'File created successfully',
    status: 'done',
    isError: false,
  },
  {
    id: 'run-server',
    toolUseId: 'run-server',
    toolName: 'Bash',
    toolInput: {
      command: 'cd "/Users/han/Desktop/demo/.citto-code/previews/visual-demo-20260419-130702" && node server.js &\nsleep 1 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3377/',
    },
    result: 'Server running at http://localhost:3377\n  /        → index.html\n  /about   → about.html (rewrite)\n200 /',
    status: 'done',
    isError: false,
  },
]
const localServerTranscriptText = `파일을 생성하고 서버를 실행할게요.서버가 실행됐어요.

- **http://localhost:3377** → 홈 페이지
- **http://localhost:3377/about** → About 페이지 (서버에서 \`about.html\`로 rewrite)
- **http://localhost:3377/about.html** → 직접 접근도 가능`

const unicodeLocalServerTranscriptToolCalls = [
  {
    ...localServerTranscriptToolCalls[0],
    toolInput: {
      ...localServerTranscriptToolCalls[0].toolInput,
      file_path: '/Users/han/Desktop/무제 폴더 3/.citto-code/previews/visual-demo-20260419-130702/about.html',
    },
  },
  {
    ...localServerTranscriptToolCalls[1],
    toolInput: {
      ...localServerTranscriptToolCalls[1].toolInput,
      command: 'cd "/Users/han/Desktop/무제 폴더 3/.citto-code/previews/visual-demo-20260419-130702" && node server.js &\nsleep 1 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3377/',
    },
  },
]

assert.deepEqual(
  extractHtmlPreviewCandidates(localServerTranscriptToolCalls, localServerTranscriptText),
  {
    file: {
      kind: 'file',
      path: '/Users/han/Desktop/demo/.citto-code/previews/visual-demo-20260419-130702/about.html',
      fallbackContent: '<!doctype html><title>About</title>',
    },
    url: {
      kind: 'url',
      url: 'http://localhost:3377',
      path: '/Users/han/Desktop/demo/.citto-code/previews/visual-demo-20260419-130702/about.html',
      rootPath: '/Users/han/Desktop/demo/.citto-code/previews/visual-demo-20260419-130702',
      fallbackContent: null,
    },
  },
  'local server demo transcripts with `node server.js` output and markdown localhost links must still produce a live URL preview source',
)

const unicodePathSessionState = buildChatViewDerivedState({
  session: {
    id: 'unicode-session',
    sessionId: null,
    name: 'unicode-path-demo',
    favorite: false,
    cwd: '/Users/han/Desktop/무제 폴더 3',
    messages: [{
      id: 'assistant-message',
      role: 'assistant',
      text: localServerTranscriptText,
      toolCalls: unicodeLocalServerTranscriptToolCalls,
      attachedFiles: [],
      btwCards: [],
      createdAt: Date.now(),
    }],
    isStreaming: false,
    currentAssistantMsgId: null,
    error: null,
    pendingPermission: null,
    pendingQuestion: null,
    tokenUsage: null,
    permissionMode: 'default',
    planMode: false,
    model: null,
  },
  t: (key) => key,
})

assert.deepEqual(
  unicodePathSessionState.htmlPreviewSources.map((source) => source.kind),
  ['url', 'file'],
  'preview source ownership must survive macOS Unicode path normalization differences so localhost previews are not dropped',
)

assert.deepEqual(
  [
    resolvePreviewFrameHeight({
      isUrlPreview: false,
      isViewportLayout: true,
      measuredHeight: 1400,
      minimumFrameHeight: viewportMinimumHeight,
    }),
    resolvePreviewFrameHeight({
      isUrlPreview: false,
      isViewportLayout: false,
      measuredHeight: 640,
      minimumFrameHeight: 420,
    }),
    resolvePreviewFrameHeight({
      isUrlPreview: false,
      isViewportLayout: true,
      measuredHeight: 1200,
      minimumFrameHeight: viewportMinimumHeight,
    }),
  ],
  [viewportMinimumHeight, 640, viewportMinimumHeight],
  'repeated preview edits must recompute sizing from the latest layout instead of reusing the previous UI state',
)

console.log('Preview UI regression check passed.')
