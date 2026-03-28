import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
  'src/store/sessions.ts',
  'src/hooks/useClaudeStream.ts',
  'electron/main.ts',
  'electron/preload.ts',
  'electron/preload/claudeApi.ts',
  'electron/ipc/claude.ts',
  'electron/services/scheduledTaskScheduler.ts',
]

const requiredScripts = [
  'typecheck:web',
  'typecheck:node',
  'typecheck',
  'harness:check:docs',
  'harness:check',
  'harness:check:strict',
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
