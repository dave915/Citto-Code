import { create } from 'zustand'
import type { McpConfigScope } from '../../electron/preload'

export type McpAuthNotice = {
  id: string
  serverName: string
  scope: McpConfigScope
  projectPath: string | null
  message: string
}

type McpRuntimeStore = {
  authNotice: McpAuthNotice | null
  setAuthNotice: (notice: McpAuthNotice) => void
  clearAuthNotice: (id?: string) => void
}

export const useMcpRuntimeStore = create<McpRuntimeStore>()((set) => ({
  authNotice: null,
  setAuthNotice: (authNotice) => set({ authNotice }),
  clearAuthNotice: (id) => set((state) => (
    !id || state.authNotice?.id === id
      ? { authNotice: null }
      : state
  )),
}))
