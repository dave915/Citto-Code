import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function resolveFromRoot(...segments) {
  return path.join(rootDir, ...segments)
}

function loadTsModule(filePath) {
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
  const execute = new Function('exports', 'module', 'require', '__filename', '__dirname', compiled.outputText)
  execute(module.exports, module, require, filePath, path.dirname(filePath))
  return module.exports
}

const sizingModulePath = resolveFromRoot('src', 'components', 'toolcalls', 'htmlPreviewSizing.ts')
const {
  getPreviewMinimumHeight,
  isViewportSizedPreview,
  resolvePreviewFrameHeight,
} = loadTsModule(sizingModulePath)

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
