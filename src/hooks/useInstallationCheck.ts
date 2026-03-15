import { useEffect, useState } from 'react'
import type { ClaudeInstallationStatus } from '../../electron/preload'

export function useInstallationCheck(claudeBinaryPath: string) {
  const [installationStatus, setInstallationStatus] = useState<ClaudeInstallationStatus | null>(null)
  const [installationDismissed, setInstallationDismissed] = useState(false)

  async function refreshInstallationStatus() {
    const status = await window.claude.checkInstallation(claudeBinaryPath || undefined).catch(() => ({
      installed: false,
      path: null,
      version: null,
    }))
    setInstallationStatus(status)
    if (status.installed) setInstallationDismissed(false)
  }

  useEffect(() => {
    void refreshInstallationStatus()
  }, [claudeBinaryPath])

  return {
    installationStatus,
    installationDismissed,
    refreshInstallationStatus,
    dismissInstallation: () => setInstallationDismissed(true),
  }
}
