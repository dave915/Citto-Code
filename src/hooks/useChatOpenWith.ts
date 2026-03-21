import { useEffect, useState, type MutableRefObject } from 'react'
import type { OpenWithApp } from '../../electron/preload'
import { getCurrentPlatform } from '../lib/shortcuts'
import { useI18n } from './useI18n'

type Params = {
  openWithMenuRef: MutableRefObject<HTMLDivElement | null>
  openTargetPath: string
  preferredOpenWithAppId: string
  setPreferredOpenWithAppId: (appId: string) => void
}

async function listApps(
  preferredOpenWithAppId: string,
  setOpenWithApps: (apps: OpenWithApp[]) => void,
  setPreferredOpenWithAppId: (appId: string) => void,
) {
  try {
    const apps = await window.claude.listOpenWithApps()
    setOpenWithApps(apps)
    if (preferredOpenWithAppId && !apps.some((app) => app.id === preferredOpenWithAppId)) {
      setPreferredOpenWithAppId('')
    }
  } catch {
    setOpenWithApps([])
    if (preferredOpenWithAppId) {
      setPreferredOpenWithAppId('')
    }
  }
}

export function useChatOpenWith({
  openWithMenuRef,
  openTargetPath,
  preferredOpenWithAppId,
  setPreferredOpenWithAppId,
}: Params) {
  const { t } = useI18n()
  const [openWithMenuOpen, setOpenWithMenuOpen] = useState(false)
  const [openWithApps, setOpenWithApps] = useState<OpenWithApp[]>([])
  const [openWithLoading, setOpenWithLoading] = useState(false)
  const isMacPlatform = getCurrentPlatform() === 'mac'

  useEffect(() => {
    if (!isMacPlatform) return

    let cancelled = false

    window.claude.listOpenWithApps()
      .then((apps) => {
        if (cancelled) return
        setOpenWithApps(apps)
        if (preferredOpenWithAppId && !apps.some((app) => app.id === preferredOpenWithAppId)) {
          setPreferredOpenWithAppId('')
        }
      })
      .catch(() => {
        if (cancelled) return
        setOpenWithApps([])
        if (preferredOpenWithAppId) {
          setPreferredOpenWithAppId('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [isMacPlatform, preferredOpenWithAppId, setPreferredOpenWithAppId])

  useEffect(() => {
    if (!openWithMenuOpen || !isMacPlatform) return

    let cancelled = false
    setOpenWithLoading(true)

    listApps(preferredOpenWithAppId, setOpenWithApps, setPreferredOpenWithAppId)
      .finally(() => {
        if (!cancelled) setOpenWithLoading(false)
      })

    const handleMouseDown = (event: MouseEvent) => {
      if (openWithMenuRef.current && event.target instanceof Node && !openWithMenuRef.current.contains(event.target)) {
        setOpenWithMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handleMouseDown)
    return () => {
      cancelled = true
      window.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isMacPlatform, openWithMenuOpen, openWithMenuRef, preferredOpenWithAppId, setPreferredOpenWithAppId])

  const preferredOpenWithApp = openWithApps.find((app) => app.id === preferredOpenWithAppId) ?? null
  const defaultOpenWithApp = preferredOpenWithApp ?? openWithApps[0] ?? null

  const handleOpenWith = async (appId: string, persistPreference = true) => {
    const result = await window.claude.openPathWithApp({ targetPath: openTargetPath, appId })
    if (result.ok && persistPreference) {
      setPreferredOpenWithAppId(appId)
    }
    setOpenWithMenuOpen(false)
    if (!result.ok) {
      window.alert(result.error ?? t('openWith.errorOpenSelectedApp'))
    }
  }

  const handleDefaultOpen = async () => {
    if (defaultOpenWithApp) {
      await handleOpenWith(defaultOpenWithApp.id, false)
      return
    }

    const result = await window.claude.openPathWithApp({ targetPath: openTargetPath, appId: 'default' })
    if (!result.ok) {
      window.alert(result.error ?? t('openWith.errorOpenSelectedApp'))
    }
  }

  return {
    openWithMenuOpen,
    openWithApps,
    openWithLoading,
    defaultOpenWithApp,
    handleDefaultOpen,
    handleOpenWith,
    toggleOpenWithMenu: () => setOpenWithMenuOpen((open) => !open),
  }
}
