import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestRef = 'docs/harness/manifest.json'

function resolveFromRoot(...segments) {
  return path.join(rootDir, ...segments)
}

function readJsonFile(filePath, errors) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    errors.push(`invalid JSON in ${path.relative(rootDir, filePath)}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function readManifestStringArray(manifest, key, errors) {
  const value = manifest?.[key]
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    errors.push(`manifest field must be a string array: ${key}`)
    return []
  }
  return value
}

function readRendererGuard(manifest, errors) {
  const value = manifest?.rendererGuard
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('manifest field must be an object: rendererGuard')
    return null
  }

  return {
    roots: readManifestStringArray(value, 'roots', errors),
    extensions: readManifestStringArray(value, 'extensions', errors),
    excludeSuffixes: readManifestStringArray(value, 'excludeSuffixes', errors),
    blockedExactModules: readManifestStringArray(value, 'blockedExactModules', errors),
    blockedModulePrefixes: readManifestStringArray(value, 'blockedModulePrefixes', errors),
  }
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

function collectFilesRecursively(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return []
  }

  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursively(absolutePath))
      continue
    }
    if (entry.isFile()) {
      files.push(absolutePath)
    }
  }
  return files
}

function collectModuleSpecifiers(content) {
  const patterns = [
    /\bimport\s+(?:[^'"`]+?\sfrom\s*)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"`]+?\sfrom\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  const specifiers = new Set()
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1]?.trim()
      if (specifier) {
        specifiers.add(specifier)
      }
    }
  }
  return [...specifiers]
}

function isBlockedRendererModule(specifier, rendererGuard) {
  return rendererGuard.blockedExactModules.includes(specifier)
    || rendererGuard.blockedModulePrefixes.some((prefix) => specifier.startsWith(prefix))
}

function validateRendererImports(rendererGuard, errors) {
  if (!rendererGuard) {
    return
  }

  for (const root of rendererGuard.roots) {
    const absoluteRoot = resolveFromRoot(root)
    if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) {
      errors.push(`missing renderer guard root: ${root}`)
      continue
    }

    const files = collectFilesRecursively(absoluteRoot)
      .filter((filePath) => rendererGuard.extensions.includes(path.extname(filePath)))
      .filter((filePath) => !rendererGuard.excludeSuffixes.some((suffix) => filePath.endsWith(suffix)))

    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf8')
      for (const specifier of collectModuleSpecifiers(content)) {
        if (isBlockedRendererModule(specifier, rendererGuard)) {
          errors.push(`renderer direct import blocked in ${path.relative(rootDir, filePath)}: ${specifier}`)
        }
      }
    }
  }
}

const errors = []
const manifestPath = resolveFromRoot(manifestRef)

if (!existsSync(manifestPath)) {
  errors.push(`missing harness manifest: ${manifestRef}`)
}

const manifest = existsSync(manifestPath) ? readJsonFile(manifestPath, errors) : null
const requiredFiles = manifest ? readManifestStringArray(manifest, 'requiredFiles', errors) : []
const criticalPaths = manifest ? readManifestStringArray(manifest, 'criticalPaths', errors) : []
const requiredScripts = manifest ? readManifestStringArray(manifest, 'requiredScripts', errors) : []
const rendererGuard = manifest ? readRendererGuard(manifest, errors) : null

for (const file of requiredFiles) {
  if (!existsSync(resolveFromRoot(file))) {
    errors.push(`missing required harness file: ${file}`)
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

for (const file of criticalPaths) {
  if (!existsSync(resolveFromRoot(file))) {
    errors.push(`missing critical code path referenced by manifest: ${file}`)
  }
}

validateRendererImports(rendererGuard, errors)

if (errors.length > 0) {
  console.error('Harness check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('Harness check passed.')
