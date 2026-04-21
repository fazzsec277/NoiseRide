import { create } from 'zustand'

interface RandomState {
  currentRandomPlayingId: string | null
  setCurrentRandomPlayingId: (id: string | null) => void
}

export const useRandomStore = create<RandomState>((set) => ({
  currentRandomPlayingId: null,
  setCurrentRandomPlayingId: (id) => set({ currentRandomPlayingId: id }),
}))
