export interface Mp3Item {
  id: string
  name: string
  filePath: string
  duration: number
  keybinds: string[]
  isPlaying: boolean
  loop?: boolean
  volume?: number
}

export interface Preset {
  id: string
  name: string
  mp3Ids: string[]
}

export interface Settings {
  maxConcurrent: number
  masterVolume: number
  theme: 'dark' | 'light'
  outputDeviceIds: string[]
  micDeviceId: string
  micInputGain: number
  micMuted: boolean
  micPitchSemitones: number
}

export interface AppData {
  mp3s: Mp3Item[]
  presets: Preset[]
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  maxConcurrent: 10,
  masterVolume: 0.8,
  theme: 'dark',
  outputDeviceIds: [],
  micDeviceId: '',
  micInputGain: 1.0,
  micMuted: false,
  micPitchSemitones: 0
}

export const GLOBAL_PRESET_ID = 'global'
