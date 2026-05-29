import { create } from 'zustand'

export interface PerPresetRandomState {
  isActive: boolean
  currentPlayingId: string | null
  loadingId: string | null
}

interface RandomState {
  presetStates: Record<string, PerPresetRandomState>
  lastActivePresetId: string | null
  setPresetActive: (presetId: string, active: boolean) => void
  setCurrentPlayingId: (presetId: string, id: string | null) => void
  setLoadingId: (presetId: string, id: string | null) => void
  clearPreset: (presetId: string) => void
  clearAll: () => void
  setLastActivePresetId: (id: string | null) => void
}

const defaultState = (): PerPresetRandomState => ({
  isActive: false,
  currentPlayingId: null,
  loadingId: null,
})

export const useRandomStore = create<RandomState>((set) => ({
  presetStates: {},
  lastActivePresetId: null,

  setPresetActive: (presetId, active) =>
    set((s) => ({
      presetStates: {
        ...s.presetStates,
        [presetId]: { ...(s.presetStates[presetId] ?? defaultState()), isActive: active },
      },
    })),

  setCurrentPlayingId: (presetId, id) =>
    set((s) => ({
      presetStates: {
        ...s.presetStates,
        [presetId]: { ...(s.presetStates[presetId] ?? defaultState()), currentPlayingId: id },
      },
    })),

  setLoadingId: (presetId, id) =>
    set((s) => ({
      presetStates: {
        ...s.presetStates,
        [presetId]: { ...(s.presetStates[presetId] ?? defaultState()), loadingId: id },
      },
    })),

  clearPreset: (presetId) =>
    set((s) => {
      const { [presetId]: _, ...rest } = s.presetStates
      return { presetStates: rest }
    }),

  clearAll: () => set({ presetStates: {}, lastActivePresetId: null }),

  setLastActivePresetId: (id) => set({ lastActivePresetId: id }),
}))
