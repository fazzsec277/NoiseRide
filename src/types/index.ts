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
  micFormantSemitones: number
  micEqLow: number
  micEqMid: number
  micEqHigh: number
  micCompressorEnabled: boolean
  micCompressorThreshold: number
  micCompressorRatio: number
  micCompressorAttack: number
  micCompressorRelease: number
  micEchoEnabled: boolean
  micEchoDelay: number
  micEchoFeedback: number
  micEchoMix: number
  micRadioEnabled: boolean
  micReverbEnabled: boolean
  micReverbDuration: number
  micReverbDecay: number
  micReverbMix: number
  micRobotEnabled: boolean
  micRobotFrequency: number
  micDistortionEnabled: boolean
  micDistortionDrive: number
  micDistortionMix: number
  micDistortionTone: number
  micPushToKey: boolean
  micPushToKeyBind: string
  randomPrevBind: string
  randomNextBind: string
  randomStopBind: string
  keybindEnabled: boolean
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
  micPitchSemitones: 0,
  micFormantSemitones: 0,
  micEqLow: 0,
  micEqMid: 0,
  micEqHigh: 0,
  micCompressorEnabled: false,
  micCompressorThreshold: -24,
  micCompressorRatio: 12,
  micCompressorAttack: 3,
  micCompressorRelease: 100,
  micEchoEnabled: false,
  micEchoDelay: 200,
  micEchoFeedback: 40,
  micEchoMix: 50,
  micRadioEnabled: false,
  micReverbEnabled: false,
  micReverbDuration: 1.5,
  micReverbDecay: 2,
  micReverbMix: 40,
  micRobotEnabled: false,
  micRobotFrequency: 100,
  micDistortionEnabled: false,
  micDistortionDrive: 50,
  micDistortionMix: 80,
  micDistortionTone: 70,
  micPushToKey: false,
  micPushToKeyBind: '',
  randomPrevBind: '',
  randomNextBind: '',
  randomStopBind: '',
  keybindEnabled: true
}

export const GLOBAL_PRESET_ID = 'global'
