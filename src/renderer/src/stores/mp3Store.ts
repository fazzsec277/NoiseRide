import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Mp3Item, Preset, AppData } from '@shared/types'
import { GLOBAL_PRESET_ID } from '@shared/types'

function basenameMp3(filePath: string): string {
  const name = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  return name.replace(/\.mp3$/i, '')
}

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

interface Mp3State {
  mp3s: Mp3Item[]
  presets: Preset[]
  activePresetId: string

  loadingIds: string[]
  setLoading: (id: string, loading: boolean) => void

  addMp3s: (filePaths: string[], targetPresetId?: string) => Mp3Item[]
  removeMp3: (id: string) => void
  removeFromPreset: (id: string, presetId: string) => void
  updateMp3Name: (id: string, name: string) => void
  updateKeybinds: (id: string, keybinds: string[]) => void
  setPlaying: (id: string, playing: boolean) => void
  setDuration: (id: string, duration: number) => void
  updateVolume: (id: string, volume: number) => void
  toggleLoop: (id: string) => void
  toggleRestart: (id: string) => void
  reorderMp3InPreset: (presetId: string, fromIdx: number, toIdx: number) => void

  addPreset: (name: string) => void
  removePreset: (id: string) => void
  renamePreset: (id: string, name: string) => void
  addMp3ToPreset: (mp3Id: string, presetId: string) => void
  setActivePreset: (id: string) => void
  reorderPresets: (fromIdx: number, toIdx: number) => void
  clearAllMp3s: () => void
  clearAllPresets: () => void

  loadFromData: (data: AppData) => void
  toAppData: () => Pick<AppData, 'mp3s' | 'presets'>
}

export const useMp3Store = create<Mp3State>((set, get) => ({
  mp3s: [],
  presets: [{ id: GLOBAL_PRESET_ID, name: '全体', mp3Ids: [] }],
  activePresetId: GLOBAL_PRESET_ID,
  loadingIds: [],
  setLoading: (id, loading) => set((s) => ({
    loadingIds: loading
      ? s.loadingIds.includes(id) ? s.loadingIds : [...s.loadingIds, id]
      : s.loadingIds.filter((i) => i !== id)
  })),

  addMp3s: (filePaths, targetPresetId) => {
    const newItems: Mp3Item[] = filePaths.map((fp) => ({
      id: uuidv4(),
      name: basenameMp3(fp),
      filePath: fp,
      duration: 0,
      keybinds: [],
      isPlaying: false,
      loop: false,
      restart: false,
      volume: 1.0
    }))

    set((s) => {
      const updatedMp3s = [...s.mp3s, ...newItems]
      const newIds = newItems.map((i) => i.id)

      const updatedPresets = s.presets.map((p) => {
        if (p.id === GLOBAL_PRESET_ID) {
          return { ...p, mp3Ids: [...p.mp3Ids, ...newIds] }
        }
        if (targetPresetId && p.id === targetPresetId) {
          const toAdd = newIds.filter((id) => !p.mp3Ids.includes(id))
          return { ...p, mp3Ids: [...p.mp3Ids, ...toAdd] }
        }
        return p
      })

      return { mp3s: updatedMp3s, presets: updatedPresets }
    })

    return newItems
  },

  removeMp3: (id) => {
    set((s) => ({
      mp3s: s.mp3s.filter((m) => m.id !== id),
      presets: s.presets.map((p) => ({ ...p, mp3Ids: p.mp3Ids.filter((i) => i !== id) }))
    }))
  },

  removeFromPreset: (id, presetId) => {
    if (presetId === GLOBAL_PRESET_ID) return
    set((s) => ({
      presets: s.presets.map((p) =>
        p.id === presetId ? { ...p, mp3Ids: p.mp3Ids.filter((i) => i !== id) } : p
      )
    }))
  },

  updateMp3Name: (id, name) => {
    if (!name.trim()) return
    set((s) => ({
      mp3s: s.mp3s.map((m) => (m.id === id ? { ...m, name: name.trim() } : m))
    }))
  },

  updateKeybinds: (id, keybinds) => {
    set((s) => ({
      mp3s: s.mp3s.map((m) => (m.id === id ? { ...m, keybinds } : m))
    }))
  },

  setPlaying: (id, playing) => {
    set((s) => ({
      mp3s: s.mp3s.map((m) => (m.id === id ? { ...m, isPlaying: playing } : m))
    }))
  },

  setDuration: (id, duration) => {
    set((s) => ({
      mp3s: s.mp3s.map((m) => (m.id === id ? { ...m, duration } : m))
    }))
  },

  updateVolume: (id, volume) => {
    set((s) => ({
      mp3s: s.mp3s.map((m) => (m.id === id ? { ...m, volume } : m))
    }))
  },

  toggleLoop: (id) => {
    set((s) => ({
      mp3s: s.mp3s.map((m) => (m.id === id ? { ...m, loop: !(m.loop ?? false) } : m))
    }))
  },

  toggleRestart: (id) => {
    set((s) => ({
      mp3s: s.mp3s.map((m) => (m.id === id ? { ...m, restart: !(m.restart ?? false) } : m))
    }))
  },

  reorderMp3InPreset: (presetId, fromIdx, toIdx) => {
    set((s) => ({
      presets: s.presets.map((p) =>
        p.id === presetId ? { ...p, mp3Ids: reorder(p.mp3Ids, fromIdx, toIdx) } : p
      )
    }))
  },

  addPreset: (name) => {
    set((s) => ({
      presets: [...s.presets, { id: uuidv4(), name, mp3Ids: [] }]
    }))
  },

  removePreset: (id) => {
    if (id === GLOBAL_PRESET_ID) return
    set((s) => ({
      presets: s.presets.filter((p) => p.id !== id),
      activePresetId: s.activePresetId === id ? GLOBAL_PRESET_ID : s.activePresetId
    }))
  },

  renamePreset: (id, name) => {
    if (id === GLOBAL_PRESET_ID || !name.trim()) return
    set((s) => ({
      presets: s.presets.map((p) => (p.id === id ? { ...p, name: name.trim() } : p))
    }))
  },

  addMp3ToPreset: (mp3Id, presetId) => {
    if (presetId === GLOBAL_PRESET_ID) return
    set((s) => ({
      presets: s.presets.map((p) => {
        if (p.id !== presetId || p.mp3Ids.includes(mp3Id)) return p
        return { ...p, mp3Ids: [...p.mp3Ids, mp3Id] }
      })
    }))
  },

  setActivePreset: (id) => set({ activePresetId: id }),

  clearAllMp3s: () => {
    set((s) => ({
      mp3s: [],
      presets: s.presets.map((p) => ({ ...p, mp3Ids: [] }))
    }))
  },

  clearAllPresets: () => {
    set((s) => ({
      presets: s.presets.filter((p) => p.id === GLOBAL_PRESET_ID),
      activePresetId: GLOBAL_PRESET_ID
    }))
  },

  reorderPresets: (fromIdx, toIdx) => {
    set((s) => {
      // global preset (index 0) is always fixed
      if (fromIdx === 0 || toIdx === 0) return s
      return { presets: reorder(s.presets, fromIdx, toIdx) }
    })
  },

  loadFromData: (data) => {
    set({
      mp3s: data.mp3s.map((m) => ({ ...m, isPlaying: false })),
      presets: data.presets
    })
  },

  toAppData: () => {
    const { mp3s, presets } = get()
    return { mp3s: mp3s.map((m) => ({ ...m, isPlaying: false })), presets }
  }
}))

export const getKeybindMap = (mp3s: Mp3Item[]): Record<string, string[]> => {
  const map: Record<string, string[]> = {}
  for (const mp3 of mp3s) {
    for (const key of mp3.keybinds) {
      if (!map[key]) map[key] = []
      map[key].push(mp3.id)
    }
  }
  return map
}
