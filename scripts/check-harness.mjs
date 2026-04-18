import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const requiredFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'docs/harness/README.md',
  'docs/harness/architecture-map.md',
  'docs/harness/change-workflow.md',
  'docs/harness/quality-gates.md',
  'docs/harness/area-ownership.md',
  'docs/harness/task-template.md',
]

const criticalPaths = [
  'src/main.tsx',
  'src/App.tsx',
  'src/components/ChatView.tsx',
  'src/components/InputArea.tsx',
  'src/components/chat/ChatMessagePane.tsx',
  'src/store/sessions.ts',
  'src/store/sessionStoreState.ts',
  'src/store/sessionStoreMutators.ts',
  'src/store/workflowStore.ts',
  'src/hooks/useClaudeStream.ts',
  'src/hooks/useAppDesktopEffects.ts',
  'src/hooks/useFileExplorer.ts',
  'src/hooks/useChatOpenWith.ts',
  'src/components/toolcalls/useHtmlPreviewController.ts',
  'src/quick-panel/QuickPanel.tsx',
  'electron/main.ts',
  'electron/persistence.ts',
  'electron/main/windowController.ts',
  'electron/preload.ts',
  'electron/preload/claudeApi.ts',
  'electron/preload/quickPanelApi.ts',
  'electron/ipc/claude.ts',
  'electron/ipc/files.ts',
  'electron/ipc/git.ts',
  'electron/ipc/quickPanel.ts',
  'electron/ipc/storage.ts',
  'electron/ipc/settings.ts',
  'electron/services/fileService.ts',
  'electron/services/gitService.ts',
  'electron/services/settingsDataService.ts',
  'electron/services/scheduledTaskScheduler.ts',
]

const requiredScripts = [
  'typecheck:web',
  'typecheck:node',
  'typecheck',
  'harness:check:docs',
  'harness:check',
  'harness:check:strict',
  'build',
]

function resolveFromRoot(...segments) {
  return path.join(rootDir, ...segments)
}

function collectMarkdownFiles() {
  const harnessDir = resolveFromRoot('docs', 'harness')
  const markdownFiles = readdirSync(harnessDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join('docs', 'harness', name))

  return ['AGENTS.md', 'CLAUDE.md', ...markdownFiles]
}

function collectLocalLinks(filePath, content) {
  const matches = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]

  return matches
    .map((match) => match[1]?.trim() ?? '')
    .filter((target) => {
      if (!target) return false
      if (target.startsWith('http://') || target.startsWith('https://')) return false
      if (target.startsWith('mailto:')) return false
      if (target.startsWith('#')) return false
      return true
    })
    .map((target) => target.split('#')[0])
}

function collectBacktickTokens(content) {
  return [...content.matchAll(/`([^`\n]+)`/g)]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean)
}

function isPathLikeToken(token) {
  if (!token || /\s/.test(token)) return false
  if (token.includes('->')) return false

  return [
    'AGENTS.md',
    'CLAUDE.md',
    'README.md',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.web.json',
    'tsconfig.node.json',
    'electron.vite.config.ts',
    'tailwind.config.js',
    'postcss.config.js',
    'index.html',
    'quick-panel.html',
  ].includes(token)
    || [
      'docs/',
      'src/',
      'electron/',
      'scripts/',
      'build/',
    ].some((prefix) => token.startsWith(prefix))
}

function segmentToPattern(segment) {
  const escaped = segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

function resolveGlobMatches(currentPath, segments, index) {
  if (index >= segments.length) {
    return [currentPath]
  }

  const segment = segments[index]
  if (!segment.includes('*')) {
    const nextPath = path.join(currentPath, segment)
    if (!existsSync(nextPath)) {
      return []
    }
    return resolveGlobMatches(nextPath, segments, index + 1)
  }

  if (!existsSync(currentPath) || !statSync(currentPath).isDirectory()) {
    return []
  }

  const matcher = segmentToPattern(segment)
  return readdirSync(currentPath)
    .filter((entry) => matcher.test(entry))
    .flatMap((entry) => resolveGlobMatches(path.join(currentPath, entry), segments, index + 1))
}

function validateBacktickPathTokens(markdownFile, content, errors) {
  const backtickTokens = collectBacktickTokens(content)

  for (const token of backtickTokens) {
    if (!isPathLikeToken(token)) {
      continue
    }

    if (token.includes('*')) {
      const segments = token.split('/').filter(Boolean)
      const firstGlobIndex = segments.findIndex((segment) => segment.includes('*'))
      const parentSegments = firstGlobIndex >= 0 ? segments.slice(0, firstGlobIndex) : segments
      const parentPath = resolveFromRoot(...parentSegments)

      if (!existsSync(parentPath) || !statSync(parentPath).isDirectory()) {
        errors.push(`missing glob parent in ${markdownFile}: ${token}`)
        continue
      }

      const matches = resolveGlobMatches(rootDir, segments, 0)
      if (matches.length === 0) {
        errors.push(`glob has no matches in ${markdownFile}: ${token}`)
      }
      continue
    }

    const resolved = resolveFromRoot(token)
    if (!existsSync(resolved)) {
      errors.push(`missing backtick path in ${markdownFile}: ${token}`)
    }
  }
}

const errors = []

for (const file of requiredFiles) {
  if (!existsSync(resolveFromRoot(file))) {
    errors.push(`missing required harness file: ${file}`)
  }
}

for (const file of criticalPaths) {
  if (!existsSync(resolveFromRoot(file))) {
    errors.push(`missing critical code path referenced by harness: ${file}`)
  }
}

const packageJsonPath = resolveFromRoot('package.json')
if (!existsSync(packageJsonPath)) {
  errors.push('missing package.json')
} else {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const scripts = packageJson.scripts ?? {}
  for (const scriptName of requiredScripts) {
    if (typeof scripts[scriptName] !== 'string' || scripts[scriptName].trim().length === 0) {
      errors.push(`missing required npm script: ${scriptName}`)
    }
  }
}

for (const markdownFile of collectMarkdownFiles()) {
  const absoluteFile = resolveFromRoot(markdownFile)
  const content = readFileSync(absoluteFile, 'utf8')
  const directory = path.dirname(absoluteFile)

  for (const target of collectLocalLinks(markdownFile, content)) {
    const resolved = path.resolve(directory, target)
    if (!existsSync(resolved)) {
      errors.push(`broken local link in ${markdownFile}: ${target}`)
    }
  }

  validateBacktickPathTokens(markdownFile, content, errors)
}

const claudeFile = readFileSync(resolveFromRoot('CLAUDE.md'), 'utf8')
if (!claudeFile.includes('AGENTS.md')) {
  errors.push('CLAUDE.md must reference AGENTS.md')
}

if (errors.length > 0) {
  console.error('Harness check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('Harness check passed.')
