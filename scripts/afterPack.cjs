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

  // macOS can attach extended attributes such as com.apple.provenance while
  // packaging/copying app bundles. codesign rejects bundles that still carry
  // these attributes, so clear them before signing.
  execFileSync('xattr', ['-cr', appPath], {
    stdio: 'inherit',
  })

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  })
}
