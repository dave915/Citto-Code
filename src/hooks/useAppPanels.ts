import { useState } from 'react'
import type { SettingsTab } from '../components/settings/shared'

export type AppOverlayPanel = 'none' | 'settings' | 'workflow' | 'team' | 'sessionTeam' | 'secretary' | 'commandPalette'

export function useAppPanels() {
  const [activePanel, setActivePanel] = useState<AppOverlayPanel>('none')
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('general')

  return {
    activePanel,
    settingsInitialTab,
    settingsOpen: activePanel === 'settings',
    workflowOpen: activePanel === 'workflow',
    teamOpen: activePanel === 'team',
    sessionTeamOpen: activePanel === 'sessionTeam',
    secretaryOpen: activePanel === 'secretary',
    commandPaletteOpen: activePanel === 'commandPalette',
    closeOverlayPanels: () => setActivePanel('none'),
    openSettingsPanel: (tab: SettingsTab = 'general') => {
      setSettingsInitialTab(tab)
      setActivePanel('settings')
    },
    closeSettingsPanel: () => setActivePanel((current) => (current === 'settings' ? 'none' : current)),
    openWorkflowPanel: () => setActivePanel('workflow'),
    closeWorkflowPanel: () => setActivePanel((current) => (current === 'workflow' ? 'none' : current)),
    openTeamPanel: () => setActivePanel('team'),
    closeTeamPanel: () => setActivePanel((current) => (current === 'team' ? 'none' : current)),
    openSessionTeamPanel: () => setActivePanel('sessionTeam'),
    closeSessionTeamPanel: () => setActivePanel((current) => (current === 'sessionTeam' ? 'none' : current)),
    openSecretaryPanel: () => setActivePanel('secretary'),
    closeSecretaryPanel: () => setActivePanel((current) => (current === 'secretary' ? 'none' : current)),
    closeCommandPalette: () => setActivePanel((current) => (current === 'commandPalette' ? 'none' : current)),
    toggleCommandPalette: () => setActivePanel((current) => (current === 'commandPalette' ? 'none' : 'commandPalette')),
  }
}
