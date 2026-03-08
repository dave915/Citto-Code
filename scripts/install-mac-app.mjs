import { accessSync, constants, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { spawnSync } from 'child_process'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

if (process.platform !== 'darwin') {
  console.error('install:mac is only supported on macOS.')
  process.exit(1)
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const productName = packageJson.build?.productName ?? packageJson.name ?? 'App'

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function findAppBundle(rootDir, appBundleName) {
  const entries = readdirSync(rootDir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name)
    if (entry.isDirectory() && entry.name === appBundleName) {
      return fullPath
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const fullPath = join(rootDir, entry.name)
    const nested = findAppBundle(fullPath, appBundleName)
    if (nested) return nested
  }

  return null
}

function resolveInstallDir() {
  const customDir = process.env.APP_INSTALL_DIR?.trim()
  if (customDir) return customDir

  try {
    accessSync('/Applications', constants.W_OK)
    return '/Applications'
  } catch {
    return join(homedir(), 'Applications')
  }
}

run('npm', ['run', 'build'])
run('npx', ['electron-builder', '--mac', 'dir'])

const distDir = join(projectRoot, 'dist')
const appBundleName = `${productName}.app`
const sourceAppPath = findAppBundle(distDir, appBundleName)

if (!sourceAppPath || !existsSync(sourceAppPath) || !statSync(sourceAppPath).isDirectory()) {
  console.error(`Could not find built app bundle: ${appBundleName}`)
  process.exit(1)
}

const installDir = resolveInstallDir()
mkdirSync(installDir, { recursive: true })

const destinationAppPath = join(installDir, appBundleName)
rmSync(destinationAppPath, { recursive: true, force: true })
cpSync(sourceAppPath, destinationAppPath, { recursive: true })

spawnSync('xattr', ['-dr', 'com.apple.quarantine', destinationAppPath], {
  stdio: 'ignore',
})

console.log(`Installed ${productName} to ${destinationAppPath}`)
