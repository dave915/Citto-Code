import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { spawnSync } from 'child_process'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

if (process.platform !== 'win32') {
  console.error('install:win is only supported on Windows.')
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
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function findFile(rootDir, targetFileName) {
  const entries = readdirSync(rootDir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name)
    if (entry.isFile() && entry.name === targetFileName) {
      return fullPath
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const fullPath = join(rootDir, entry.name)
    const nested = findFile(fullPath, targetFileName)
    if (nested) return nested
  }

  return null
}

function resolveInstallDir() {
  const customDir = process.env.APP_INSTALL_DIR?.trim()
  if (customDir) return customDir

  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) {
    console.error('LOCALAPPDATA is not set.')
    process.exit(1)
  }

  return join(localAppData, 'Programs', productName)
}

function escapePowerShell(value) {
  return value.replace(/'/g, "''")
}

function createShortcut(targetPath, shortcutPath) {
  mkdirSync(dirname(shortcutPath), { recursive: true })

  const powerShellScript = [
    '$WshShell = New-Object -ComObject WScript.Shell',
    `$Shortcut = $WshShell.CreateShortcut('${escapePowerShell(shortcutPath)}')`,
    `$Shortcut.TargetPath = '${escapePowerShell(targetPath)}'`,
    `$Shortcut.WorkingDirectory = '${escapePowerShell(dirname(targetPath))}'`,
    `$Shortcut.IconLocation = '${escapePowerShell(targetPath)},0'`,
    '$Shortcut.Save()',
  ].join('; ')

  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    powerShellScript,
  ], {
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    console.warn(`Failed to create shortcut: ${shortcutPath}`)
  }
}

run('npm', ['run', 'build'])
run('npx', ['electron-builder', '--win', 'dir'])

const distDir = join(projectRoot, 'dist')
const executableName = `${productName}.exe`
const sourceExecutablePath = findFile(distDir, executableName)

if (!sourceExecutablePath || !existsSync(sourceExecutablePath) || !statSync(sourceExecutablePath).isFile()) {
  console.error(`Could not find built executable: ${executableName}`)
  process.exit(1)
}

const sourceAppDir = dirname(sourceExecutablePath)
const installDir = resolveInstallDir()
mkdirSync(dirname(installDir), { recursive: true })
rmSync(installDir, { recursive: true, force: true })
cpSync(sourceAppDir, installDir, { recursive: true })

const installedExecutablePath = join(installDir, executableName)
const userProfile = process.env.USERPROFILE
const appData = process.env.APPDATA

if (userProfile) {
  createShortcut(installedExecutablePath, join(userProfile, 'Desktop', `${productName}.lnk`))
}

if (appData) {
  createShortcut(
    installedExecutablePath,
    join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${productName}.lnk`),
  )
}

console.log(`Installed ${productName} to ${installDir}`)
