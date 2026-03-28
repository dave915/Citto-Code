import { useState } from 'react'

export type AppOverlayPanel = 'none' | 'settings' | 'schedule' | 'team' | 'sessionTeam' | 'commandPalette'

export function useAppPanels() {
  const [activePanel, setActivePanel] = useState<AppOverlayPanel>('none')

  return {
    activePanel,
    settingsOpen: activePanel === 'settings',
    scheduleOpen: activePanel === 'schedule',
    teamOpen: activePanel === 'team',
    sessionTeamOpen: activePanel === 'sessionTeam',
    commandPaletteOpen: activePanel === 'commandPalette',
    closeOverlayPanels: () => setActivePanel('none'),
    openSettingsPanel: () => setActivePanel('settings'),
    closeSettingsPanel: () => setActivePanel((current) => (current === 'settings' ? 'none' : current)),
    openSchedulePanel: () => setActivePanel('schedule'),
    closeSchedulePanel: () => setActivePanel((current) => (current === 'schedule' ? 'none' : current)),
    openTeamPanel: () => setActivePanel('team'),
    closeTeamPanel: () => setActivePanel((current) => (current === 'team' ? 'none' : current)),
    openSessionTeamPanel: () => setActivePanel('sessionTeam'),
    closeSessionTeamPanel: () => setActivePanel((current) => (current === 'sessionTeam' ? 'none' : current)),
    closeCommandPalette: () => setActivePanel((current) => (current === 'commandPalette' ? 'none' : current)),
    toggleCommandPalette: () => setActivePanel((current) => (current === 'commandPalette' ? 'none' : 'commandPalette')),
  }
}
