import { create } from 'zustand'

interface RandomState {
  currentRandomPlayingId: string | null
  setCurrentRandomPlayingId: (id: string | null) => void
  isRandomActive: boolean
  randomPresetName: string
  setRandomActive: (active: boolean, presetName?: string) => void
  randomLoadingId: string | null
  setRandomLoadingId: (id: string | null) => void
}

export const useRandomStore = create<RandomState>((set) => ({
  currentRandomPlayingId: null,
  setCurrentRandomPlayingId: (id) => set({ currentRandomPlayingId: id }),
  isRandomActive: false,
  randomPresetName: '',
  setRandomActive: (active, presetName = '') => set({ isRandomActive: active, randomPresetName: presetName }),
  randomLoadingId: null,
  setRandomLoadingId: (id) => set({ randomLoadingId: id }),
}))
