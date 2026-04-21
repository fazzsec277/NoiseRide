import { create } from 'zustand'
import type { Settings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

interface SettingsState {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  loadSettings: (s: Settings) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...DEFAULT_SETTINGS },

  updateSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),

  loadSettings: (s) => set({ settings: s })
}))
