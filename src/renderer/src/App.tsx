import { useEffect, useState } from 'react'
import { useMp3Store } from './stores/mp3Store'
import { useSettingsStore } from './stores/settingsStore'
import { audioManager } from './managers/AudioManager'
import { useShortcutListener } from './hooks/useShortcutListener'
import { useFileDrop } from './hooks/useFileDrop'
import { useAudioEnded } from './hooks/useAudioEnded'
import { useMicController } from './hooks/useMicController'
import { Header } from './components/layout/Header'
import { TabBar } from './components/layout/TabBar'
import { Mp3List } from './components/mp3/Mp3List'
import { SettingsModal } from './components/settings/SettingsModal'
import { VoiceChangerTab } from './components/voicechanger/VoiceChangerTab'
import type { AppData } from './shared/types'
import { DEFAULT_SETTINGS } from './shared/types'

interface Api {
  storage: {
    load: () => Promise<AppData>
    save: (data: AppData) => Promise<void>
  }
  shortcut: {
    sync: (keybindMap: Record<string, string[]>) => Promise<void>
    register: (key: string, mp3Ids: string[]) => Promise<boolean>
    unregister: (key: string) => Promise<void>
    onTriggered: (cb: (key: string) => void) => () => void
  }
  ptk: {
    onKeyDown: (cb: () => void) => () => void
    onKeyUp: (cb: () => void) => () => void
    setKey: (accelerator: string) => Promise<void>
  }
  random: {
    setPrevKey: (acc: string) => Promise<void>
    setNextKey: (acc: string) => Promise<void>
    setStopKey: (acc: string) => Promise<void>
    onPrev: (cb: () => void) => () => void
    onNext: (cb: () => void) => () => void
    onStop: (cb: () => void) => () => void
  }
  dialog: {
    openMp3: () => Promise<string[]>
  }
  readFileBuffer: (filePath: string) => Promise<Uint8Array>
  onFileDropped: (cb: (paths: string[]) => void) => () => void
}

declare global {
  interface Window {
    api: Api
  }
}

type MainTab = 'soundboard' | 'voicechanger'

const mainTabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  flexShrink: 0,
}

function mainTabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600,
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
    marginBottom: -1,
  }
}

export default function App(): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mainTab, setMainTab] = useState<MainTab>('soundboard')
  const loadFromData = useMp3Store((s) => s.loadFromData)
  const mp3s = useMp3Store((s) => s.mp3s)
  const presets = useMp3Store((s) => s.presets)
  const toAppData = useMp3Store((s) => s.toAppData)
  const activePresetId = useMp3Store((s) => s.activePresetId)
  const settings = useSettingsStore((s) => s.settings)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  useShortcutListener()
  useFileDrop(activePresetId === 'global' ? undefined : activePresetId)
  useAudioEnded()
  useMicController()

  useEffect(() => {
    window.api.storage.load().then(async (data) => {
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const outputIds = new Set(allDevices.filter((d) => d.kind === 'audiooutput').map((d) => d.deviceId))
      const inputIds  = new Set(allDevices.filter((d) => d.kind === 'audioinput').map((d) => d.deviceId))

      const validOutputIds = (data.settings.outputDeviceIds ?? []).filter((id) => outputIds.has(id))
      const validMicId = inputIds.has(data.settings.micDeviceId ?? '') ? (data.settings.micDeviceId ?? '') : ''

      loadFromData(data)
      data.mp3s.forEach((mp3) => {
        if (mp3.keybinds.length > 0) audioManager.pinBuffer(mp3.filePath)
      })
      loadSettings({ ...DEFAULT_SETTINGS, ...data.settings, outputDeviceIds: validOutputIds, micDeviceId: validMicId })
      audioManager.setOutputDevices(validOutputIds)
    })
  }, [loadFromData, loadSettings])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
  }, [settings.theme])

  useEffect(() => {
    audioManager.setMasterVolume(settings.masterVolume)
  }, [settings.masterVolume])

  useEffect(() => {
    audioManager.setOutputDevices(settings.outputDeviceIds)
  }, [settings.outputDeviceIds])

  useEffect(() => {
    const appData = { ...toAppData(), settings }
    window.api.storage.save(appData)
  }, [mp3s, presets, settings, toAppData])

  const activePreset = presets.find((p) => p.id === activePresetId)

  const orderedMp3s =
    activePresetId === 'global'
      ? (() => {
          const globalPreset = presets.find((p) => p.id === 'global')
          if (!globalPreset) return visibleMp3s
          return globalPreset.mp3Ids
            .map((id) => mp3s.find((m) => m.id === id))
            .filter((m): m is NonNullable<typeof m> => m !== undefined)
        })()
      : (activePreset?.mp3Ids ?? [])
          .map((id) => mp3s.find((m) => m.id === id))
          .filter((m): m is NonNullable<typeof m> => m !== undefined)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header onSettingsClick={() => setSettingsOpen(true)} />
      <div style={mainTabBarStyle}>
        <button style={mainTabBtnStyle(mainTab === 'soundboard')} onClick={() => setMainTab('soundboard')}>
          サウンドボード
        </button>
        <button style={mainTabBtnStyle(mainTab === 'voicechanger')} onClick={() => setMainTab('voicechanger')}>
          ボイスチェンジャー
        </button>
      </div>
      {mainTab === 'soundboard' ? (
        <>
          <TabBar />
          <Mp3List mp3s={orderedMp3s} activePresetId={activePresetId} />
        </>
      ) : (
        <VoiceChangerTab />
      )}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
