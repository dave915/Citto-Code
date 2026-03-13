const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

module.exports = async function afterPack(context) {
  if (process.platform !== 'darwin' || context.electronPlatformName !== 'darwin') {
    return
  }

  const appName = context.packager?.appInfo?.productFilename
  if (!appName) {
    return
  }

  const appPath = join(context.appOutDir, `${appName}.app`)
  if (!existsSync(appPath)) {
    return
  }

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  })
}
